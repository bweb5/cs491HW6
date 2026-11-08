// WebGL2 shaders and drawing code.
const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec3 aTangent;
in vec2 aTexCoord;

uniform mat4 uModelView;
uniform mat4 uProjection;

out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec2 vTexCoord;

void main() {
  vec4 eyePosition = uModelView * vec4(aPosition, 1.0);
  vPosition = eyePosition.xyz;
  // Transform the surface directions into view space.
  mat3 normalMatrix = mat3(uModelView);
  vNormal = normalMatrix * aNormal;
  vTangent = mat3(uModelView) * aTangent;
  vTexCoord = aTexCoord;
  gl_Position = uProjection * eyePosition;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec2 vTexCoord;

uniform sampler2D uTexture;
uniform sampler2D uSurfaceMap;
uniform vec3 uLightPos;
uniform vec3 uSecondLight;
uniform int uMapping;       // 0 = plain, 1 = normal, 2 = bump, 3 = cat
uniform float uNormalStrength;
uniform float uBumpStrength;
uniform float uEmission;
uniform float uTime;
uniform vec2 uHeightTexel;

out vec4 fragColor;

float heightAt(vec2 uv) {
  return texture(uSurfaceMap, uv).r;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 T = normalize(vTangent - dot(vTangent, N) * N);
  vec3 B = normalize(cross(N, T));
  mat3 TBN = mat3(T, B, N);

  vec2 sampleUV = vTexCoord;
  // Subtle scrolling motion remains visible even if GIF playback is throttled.
  if (uMapping == 2) sampleUV.x = fract(sampleUV.x - uTime * 0.055);
  vec3 color = texture(uTexture, sampleUV).rgb;

  // The cat GIF has a black background. Leave those pixels transparent.
  if (uMapping == 3) {
    if (max(color.r, max(color.g, color.b)) < 0.11) discard;
    fragColor = vec4(color, 1.0);
    return;
  }

  if (uMapping == 1) {
    // Tangent-space normal RGB values are remapped from 0..1 to -1..1.
    vec3 n = texture(uSurfaceMap, vTexCoord).rgb * 2.0 - 1.0;
    n = normalize(vec3(n.xy * uNormalStrength, n.z));
    N = normalize(TBN * n);
  } else if (uMapping == 2) {
    // Bump mapping: sample height at neighboring UV pixels, and compute slope.
    vec2 pixel = uHeightTexel;
    float du = heightAt(vTexCoord + vec2(pixel.x, 0.0))
             - heightAt(vTexCoord - vec2(pixel.x, 0.0));
    float dv = heightAt(vTexCoord + vec2(0.0, pixel.y))
             - heightAt(vTexCoord - vec2(0.0, pixel.y));
    N = normalize(TBN * normalize(vec3(-du * uBumpStrength,
                                      -dv * uBumpStrength, 1.0)));
  }

  vec3 lightA = normalize(uLightPos - vPosition);
  vec3 lightB = normalize(uSecondLight - vPosition);
  vec3 V = normalize(-vPosition);
  float diffuse = max(dot(N, lightA), 0.0);
  float bounce = max(dot(N, lightB), 0.0);
  float spec = pow(max(dot(reflect(-lightA, N), V), 0.0), 38.0);
  float softSpec = pow(max(dot(reflect(-lightB, N), V), 0.0), 14.0);

  vec3 shaded = color * (0.16 + 0.85 * diffuse + 0.20 * bounce);
  shaded += vec3(0.80, 0.92, 1.0) * spec * 0.42;
  shaded += vec3(0.17, 0.33, 0.42) * softSpec * 0.22;
  // The ring is an emissive material; its changing color is the animated GIF.
  shaded += color * uEmission * (0.9 + 0.1 * sin(uTime * 2.4));
  fragColor = vec4(shaded, 1.0);
}
`;

const canvas = document.querySelector('#glcanvas');
const gl = canvas.getContext('webgl2', { alpha: true, antialias: true });
const statusLabel = document.querySelector('#status');
const errorOverlay = document.querySelector('#renderError');
function showSceneError(message) {
  console.error('Scene:', message);
  if (errorOverlay) { errorOverlay.hidden = false; errorOverlay.textContent = 'Scene error: ' + message; }
  if (statusLabel) statusLabel.textContent = 'Scene error';
}
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); showSceneError('WebGL context was lost. Reload this page.'); });
if (!gl) {
  showSceneError('WebGL2 unavailable. Try Chrome or Edge with hardware acceleration enabled.');
  throw new Error('WebGL2 is required for this assignment.');
}

const ATTRIBUTES = { aPosition: 0, aNormal: 1, aTangent: 2, aTexCoord: 3 };
let program, uniforms;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(vs, fs) {
  const vertex = compileShader(gl.VERTEX_SHADER, vs);
  let fragment;
  try { fragment = compileShader(gl.FRAGMENT_SHADER, fs); }
  catch (e) { gl.deleteShader(vertex); throw e; }
  const p = gl.createProgram();
  gl.attachShader(p, vertex);
  gl.attachShader(p, fragment);
  Object.entries(ATTRIBUTES).forEach(([name, location]) => gl.bindAttribLocation(p, location, name));
  gl.linkProgram(p);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(message);
  }
  return p;
}

// Create the shaders once when the page opens.
try {
  program = createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
  gl.useProgram(program);
  const names = ['uModelView', 'uProjection', 'uLightPos', 'uSecondLight',
    'uMapping', 'uNormalStrength', 'uBumpStrength', 'uEmission', 'uTime', 'uHeightTexel'];
  uniforms = Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)]));
  gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'uSurfaceMap'), 1);
  statusLabel.textContent = 'Scene running';
} catch (error) {
  showSceneError('Shader error: ' + error.message);
  throw error;
}

function bindAttrib(name, array, components) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(ATTRIBUTES[name]);
  gl.vertexAttribPointer(ATTRIBUTES[name], components, gl.FLOAT, false, 0, 0);
}
function createMesh(data) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  bindAttrib('aPosition', data.positions, 3);
  bindAttrib('aNormal', data.normals, 3);
  bindAttrib('aTangent', data.tangents, 3);
  bindAttrib('aTexCoord', data.texCoords, 2);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: data.indices.length };
}

function newTexture(pixel = [135, 155, 169, 255]) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(pixel));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

function uploadImage(tex, image, mipmaps = true) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  if (mipmaps) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }
}
function loadTexture(path, fallback) {
  const tex = newTexture(fallback);
  const image = new Image();
  image.onload = () => {
    try {
      uploadImage(tex, image);
    } catch (error) {
      // The fallback color stays visible if a browser blocks local textures.
      console.warn('Could not use texture:', path, error);
      if (location.protocol === 'file:') {
        statusLabel.textContent = 'Use a local server for textures';
      } else {
        showSceneError('Could not load texture: ' + path);
      }
    }
  };
  image.onerror = () => {
    console.warn('Texture not found:', path);
    if (location.protocol === 'file:') {
      statusLabel.textContent = 'Use a local server for textures';
    } else {
      showSceneError('Texture file not found: ' + path);
    }
  };
  image.src = path;
  return tex;
}

// Load shapes and textures.
const planetMesh = createMesh(createSphere());
const ringMesh = createMesh(createTorus());
const coneMesh = createMesh(createCone());
const satelliteMesh = createMesh(createBox());
const catMesh = createMesh(createQuad());
const planetColor = loadTexture('textures/planet_color.png', [57, 117, 143, 255]);
const planetNormal = loadTexture('textures/planet_normal.png', [128, 128, 255, 255]);
const ringHeight = loadTexture('textures/ring_height.png', [128, 128, 128, 255]);
const solarColor = loadTexture('textures/satellite_solar.png', [18, 64, 118, 255]);
const busColor = loadTexture('textures/satellite_body.png', [170, 131, 68, 255]);
const antennaColor = newTexture([180, 195, 206, 255]);
const flatNormal = newTexture([128, 128, 255, 255]);
const ringAnimation = newTexture([13, 180, 192, 255]);
const catAnimation = newTexture([28, 28, 28, 255]);
const previewImage = document.querySelector('#pulsePreview');
const catImage = document.querySelector('#catPreview');
previewImage.addEventListener('error', () => showSceneError('Animated ring texture was not loaded.'));
catImage.addEventListener('error', () => showSceneError('Cat GIF was not loaded.'));
const animCanvas = document.createElement('canvas');
animCanvas.width = 256; animCanvas.height = 256;
const animContext = animCanvas.getContext('2d', { willReadFrequently: false });
const catCanvas = document.createElement('canvas');
catCanvas.width = 360; catCanvas.height = 358;
const catContext = catCanvas.getContext('2d');
let lastTextureUpdate = -1;
let gifTexturesAvailable = true;
function updateAnimatedTexture(time) {
  // Copy the current GIF frame into the ring texture.
  if (!previewImage.complete || !previewImage.naturalWidth) return;
  if (time - lastTextureUpdate < 1 / 25) return;
  lastTextureUpdate = time;
  if (!gifTexturesAvailable) return;
  try {
    animContext.drawImage(previewImage, 0, 0, 256, 256);
    uploadImage(ringAnimation, animCanvas, false);
    if (catImage.complete && catImage.naturalWidth) {
      catContext.drawImage(catImage, 0, 0, 360, 358);
      uploadImage(catAnimation, catCanvas, false);
    }
  } catch (error) {
    gifTexturesAvailable = false;
    console.warn('Could not update GIF textures:', error);
    if (location.protocol === 'file:') {
      statusLabel.textContent = 'Use a local server for GIF textures';
    } else {
      showSceneError('Could not update animated textures: ' + error.message);
    }
  }
}

const NORMAL_MAP = 1, BUMP_MAP = 2, TEXTURE_ONLY = 0;
const objects = [
  { mesh: planetMesh, diffuse: planetColor, surface: planetNormal, mapping: NORMAL_MAP, emission: 0,
    offset: [-2.75, 0.04, 0.0], scale: 1.12 },
  { mesh: ringMesh, diffuse: ringAnimation, surface: ringHeight, mapping: BUMP_MAP, emission: 0.69,
    offset: [0, 0.07, 0.05], scale: 1 }
];

// Satellite parts and their positions.
// Build the satellite from textured boxes and one cone.
const satelliteParts = [
  {mesh: satelliteMesh, texture: busColor,    center: [0,0,0],          size: [.24,.24,.27]},
  {mesh: satelliteMesh, texture: antennaColor,center: [-.37,0,0],       size: [.15,.025,.030]},
  {mesh: satelliteMesh, texture: antennaColor,center: [ .37,0,0],       size: [.15,.025,.030]},
  {mesh: satelliteMesh, texture: solarColor,  center: [-.69,0,0],       size: [.34,.22,.028]},
  {mesh: satelliteMesh, texture: solarColor,  center: [ .69,0,0],       size: [.34,.22,.028]},
  {mesh: satelliteMesh, texture: antennaColor,center: [0,.32,.08],     size: [.025,.17,.025]},
  {mesh: satelliteMesh, texture: antennaColor,center: [0,.51,.08],     size: [.085,.025,.025]},
  {mesh: satelliteMesh, texture: antennaColor,center: [0,0,.315],     size: [.035,.035,.14]},
  {mesh: coneMesh,      texture: antennaColor,center: [0,0,.51],      size: [.16,.07,.16], rotation: rotateX(Math.PI/2)}
];

// Scale is a local matrix; the starter kit has no scaling helper.
function scale(s) {
  return new Float32Array([s,0,0,0, 0,s,0,0, 0,0,s,0, 0,0,0,1]);
}
function scaleXYZ(x, y, z) {
  return new Float32Array([x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]);
}

let lastGpuCheck = -1;
let dragRotX = -0.10, dragRotY = -0.13;
let cameraDistance = 7.45;
let playing = true;
let previousTime = 0, motionTime = 0;
let normalStrength = 1.6, bumpStrength = 7;
const pauseButton = document.querySelector('#spinButton');
pauseButton.addEventListener('click', () => {
  playing = !playing;
  pauseButton.textContent = playing ? 'Pause motion' : 'Resume motion';
});
function resetView() { dragRotX = -0.10; dragRotY = -0.13; cameraDistance = 7.45; }
document.querySelector('#resetButton').addEventListener('click', resetView);
for (const [sliderId, labelId, setter, digits] of [
  ['normalSlider', 'normalValue', value => normalStrength = value, 2],
  ['bumpSlider', 'bumpValue', value => bumpStrength = value, 1]
]) {
  document.querySelector('#' + sliderId).addEventListener('input', e => {
    const value = Number(e.target.value);
    setter(value);
    document.querySelector('#' + labelId).textContent = value.toFixed(digits);
  });
}
let dragging = false, prevX = 0, prevY = 0;
canvas.addEventListener('pointerdown', e => {
  dragging = true; prevX = e.clientX; prevY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', () => dragging = false);
canvas.addEventListener('pointercancel', () => dragging = false);
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  dragRotY += (e.clientX - prevX) * 0.006;
  dragRotX += (e.clientY - prevY) * 0.006;
  dragRotX = Math.max(-1.2, Math.min(1.2, dragRotX));
  prevX = e.clientX; prevY = e.clientY;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  cameraDistance = Math.max(5.8, Math.min(12, cameraDistance + e.deltaY * 0.008));
}, { passive: false });
document.addEventListener('keydown', e => {
  if (['TEXTAREA','INPUT','BUTTON'].includes(document.activeElement.tagName)) return;
  if (e.key.toLowerCase() === 'r') resetView();
});

// Background stars.
let seed = 12345;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
const starfield = document.querySelector('#stars');
for (let i = 0; i < 125; i++) {
  const star = document.createElement('span');
  star.className = 'star';
  star.style.left = (random() * 100).toFixed(2) + '%';
  star.style.top = (random() * 100).toFixed(2) + '%';
  star.style.opacity = (0.12 + random() * 0.65).toFixed(2);
  const size = random() > 0.94 ? 3 : 1;
  star.style.width = size + 'px'; star.style.height = size + 'px';
  starfield.appendChild(star);
}

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0, 0, 0, 0);

function drawObject(mesh, model, colorTexture, surfaceTexture, mapping, emission, view) {
  gl.uniformMatrix4fv(uniforms.uModelView, false, multiply(view, model));
  gl.uniform1i(uniforms.uMapping, mapping);
  gl.uniform1f(uniforms.uEmission, emission);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, colorTexture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, surfaceTexture);
  gl.bindVertexArray(mesh.vao);
  gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
}

// Draw the scene every frame.
function render(timestamp) {
  const t = timestamp / 1000;
  const delta = Math.min(0.05, t - previousTime || 0);
  previousTime = t;
  if (playing) { motionTime += delta; updateAnimatedTexture(t); }

  const width = Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
  const height = Math.round(canvas.clientHeight * Math.min(window.devicePixelRatio || 1, 2));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width; canvas.height = height;
  }
  // Always set viewport explicitly, including the initial draw.
  gl.viewport(0, 0, width, height);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (!program) { requestAnimationFrame(render); return; }
  gl.useProgram(program);

  const proj = perspective(47 * Math.PI / 180, width / height, .1, 100);
  const view = translate(0, 0, -cameraDistance);
  const group = multiply(rotateY(dragRotY), rotateX(dragRotX));
  gl.uniformMatrix4fv(uniforms.uProjection, false, proj);
  gl.uniform3fv(uniforms.uLightPos, transformPoint(view, [0.8, 4, 5]));
  gl.uniform3fv(uniforms.uSecondLight, transformPoint(view, [-4, -1, 1]));
  gl.uniform1f(uniforms.uNormalStrength, normalStrength);
  gl.uniform1f(uniforms.uBumpStrength, bumpStrength);
  gl.uniform1f(uniforms.uTime, motionTime);
  gl.uniform2f(uniforms.uHeightTexel, 1 / 256, 1 / 256);

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    let localRotation;
    if (i === 0) localRotation = rotateY(motionTime * 0.17);
    else localRotation = multiply(rotateY(0.35), multiply(rotateX(0.27), rotateZ(motionTime * 0.10)));
    const model = multiply(group,
      multiply(translate(...obj.offset), multiply(localRotation, scale(obj.scale))));
    drawObject(obj.mesh, model, obj.diffuse, obj.surface, obj.mapping, obj.emission, view);
  }

  // Dancing cat on the right.
  // It gently bobs up and down, and uses the current GIF frame.
  const catPosition = translate(2.75, 0.05 + 0.10 * Math.sin(motionTime * 1.6), 0.2);
  const catModel = multiply(group, multiply(catPosition, scaleXYZ(1.14, 1.18, 1)));
  drawObject(catMesh, catModel, catAnimation, flatNormal, 3, 0, view);

  // The satellite follows an ellipse around the planet and turns slowly.
  const orbitAngle = 1.57 + motionTime * 0.32;
  const satellitePosition = translate(
    -2.75 + 1.48 * Math.cos(orbitAngle),
     0.04 + 1.74 * Math.sin(orbitAngle),
     0.60 + 0.34 * Math.cos(orbitAngle));
  const satelliteTilt = multiply(
    rotateY(-0.22 + 0.14 * Math.sin(motionTime * .35)),
    rotateZ(0.08 * Math.sin(motionTime * .55)));
  const satelliteRoot = multiply(group, multiply(satellitePosition, satelliteTilt));
  for (const part of satelliteParts) {
    const partMatrix = multiply(satelliteRoot,
      multiply(translate(...part.center),
        multiply(part.rotation || scale(1), scaleXYZ(...part.size))));
    drawObject(part.mesh, partMatrix, part.texture, flatNormal, TEXTURE_ONLY, 0, view);
  }
  gl.bindVertexArray(null);
  // Check for WebGL errors.
  if (Math.floor(timestamp / 1000) !== lastGpuCheck) {
    lastGpuCheck = Math.floor(timestamp / 1000);
    const errorCode = gl.getError();
    if (errorCode !== gl.NO_ERROR) showSceneError('WebGL error 0x' + errorCode.toString(16) + '. Check browser hardware acceleration.');
  }
  requestAnimationFrame(frame);
}
function frame(timestamp) {
  try {
    render(timestamp);
  } catch (error) {
    showSceneError(error.message || String(error));
    console.error(error);
  }
}
requestAnimationFrame(frame);
