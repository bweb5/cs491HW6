// Geometry for the sphere, ring, cone, and boxes.
// In particular, tangents are needed to transform normal/bump details into 3D.
function packMesh(p, n, t, uv, idx) {
  return {
    positions: new Float32Array(p), normals: new Float32Array(n),
    tangents: new Float32Array(t), texCoords: new Float32Array(uv),
    indices: new Uint16Array(idx)
  };
}

// Latitude/longitude sphere with UVs wrapped at the longitude seam.
function createSphere(stacks = 48, slices = 96) {
  const p = [], n = [], t = [], uv = [], idx = [];
  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks;
    const theta = Math.PI * v;
    for (let j = 0; j <= slices; j++) {
      const u = j / slices, phi = 2 * Math.PI * u;
      const x = Math.sin(theta) * Math.sin(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.cos(phi);
      p.push(x, y, z);
      n.push(x, y, z);
      t.push(Math.cos(phi), 0, -Math.sin(phi));
      uv.push(u, 1 - v);
    }
  }
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * (slices + 1) + j;
      const b = a + slices + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return packMesh(p, n, t, uv, idx);
}

// Torus: the major circle uses u, the circle around the tube uses v.
function createTorus(major = 1, minor = 0.31, majorSeg = 100, tubeSeg = 40) {
  const p = [], n = [], t = [], uv = [], idx = [];
  for (let i = 0; i <= majorSeg; i++) {
    const u = i / majorSeg, phi = u * Math.PI * 2;
    for (let j = 0; j <= tubeSeg; j++) {
      const v = j / tubeSeg, theta = v * Math.PI * 2;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      const ct = Math.cos(theta), st = Math.sin(theta);
      const r = major + minor * ct;
      p.push(r * cp, r * sp, minor * st);
      n.push(cp * ct, sp * ct, st);
      t.push(-sp, cp, 0);
      uv.push(u, v);
    }
  }
  for (let i = 0; i < majorSeg; i++) {
    for (let j = 0; j < tubeSeg; j++) {
      const a = i * (tubeSeg + 1) + j;
      const b = a + tubeSeg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return packMesh(p, n, t, uv, idx);
}

// A cone with proper UVs and tangents along its side, plus a flat bottom cap.
function createCone(segments = 96, rows = 24) {
  const p = [], n = [], t = [], uv = [], idx = [];
  const slope = 0.85 / 2.3;
  for (let i = 0; i <= rows; i++) {
    const v = i / rows;
    const y = -1.15 + v * 2.3;
    const radius = Math.max(0.0005, (1 - v) * 0.85);
    for (let j = 0; j <= segments; j++) {
      const u = j / segments, phi = 2 * Math.PI * u;
      const s = Math.sin(phi), c = Math.cos(phi);
      p.push(radius * s, y, radius * c);
      const len = Math.hypot(1, slope);
      n.push(s / len, slope / len, c / len);
      t.push(c, 0, -s);
      uv.push(u, v);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j;
      const b = a + segments + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const center = p.length / 3;
  p.push(0, -1.15, 0); n.push(0, -1, 0); t.push(1, 0, 0); uv.push(.5, .5);
  for (let j = 0; j <= segments; j++) {
    const phi = 2 * Math.PI * j / segments;
    const s = Math.sin(phi), c = Math.cos(phi);
    p.push(.85 * s, -1.15, .85 * c);
    n.push(0, -1, 0); t.push(1, 0, 0);
    uv.push(.5 + .5 * s, .5 - .5 * c);
    if (j < segments) idx.push(center, center + j + 2, center + j + 1);
  }
  return packMesh(p, n, t, uv, idx);
}

// A six-sided box used for the satellite body, solar panels and antenna mount.
function createBox() {
  const p = [], n = [], t = [], uv = [], idx = [];
  const faces = [
    {v:[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]], n:[0,0,1], t:[1,0,0]},
    {v:[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]], n:[0,0,-1], t:[-1,0,0]},
    {v:[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]], n:[1,0,0], t:[0,0,-1]},
    {v:[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]], n:[-1,0,0], t:[0,0,1]},
    {v:[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]], n:[0,1,0], t:[1,0,0]},
    {v:[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]], n:[0,-1,0], t:[1,0,0]}
  ];
  for (const face of faces) {
    const first = p.length / 3;
    for (let i = 0; i < 4; i++) {
      p.push(...face.v[i]); n.push(...face.n); t.push(...face.t);
      uv.push(...[[0,0],[1,0],[1,1],[0,1]][i]);
    }
    idx.push(first,first+1,first+2,first,first+2,first+3);
  }
  return packMesh(p,n,t,uv,idx);
}

// Flat rectangle for the animated cat texture.
function createQuad() {
  return packMesh(
    [-1,-1,0, 1,-1,0, 1,1,0, -1,1,0],
    [0,0,1, 0,0,1, 0,0,1, 0,0,1],
    [1,0,0, 1,0,0, 1,0,0, 1,0,0],
    [0,0, 1,0, 1,1, 0,1],
    [0,1,2, 0,2,3]
  );
}
