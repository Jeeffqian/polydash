// Track definitions, world building: terrain, sky, road, barriers, decorations.
// A track is a closed Catmull-Rom loop through 3D control points [x, y, z].

import * as THREE from 'three';

export const ROAD_HALF_WIDTH = 6.0;

// ---------------------------------------------------------------- themes

const THEMES = {
  meadow: {
    ground: 0x4f8f4a, groundVar: 0x3f7a3e, road: 0x43474e,
    curbA: 0xe8e4da, curbB: 0xc94632, barrier: [0xe8e4da, 0xc94632],
    skyTop: 0x2f7fd4, skyHorizon: 0xbfe3f5, sunTint: 0xfff2cc,
    fog: 0xa8cfe8, fogDensity: 0.0011,
    sun: 0xfff3d6, sunPos: [90, 130, 50], sunI: 2.3, hemiI: 0.75,
    deco: 'trees', decoCount: 130, mountains: 'hills',
  },
  desert: {
    ground: 0xd4a95e, groundVar: 0xc1934a, road: 0x55483a,
    curbA: 0xf2e6c8, curbB: 0xc4502a, barrier: [0xf2e6c8, 0xc4502a],
    skyTop: 0x3f8ed0, skyHorizon: 0xf6d9a0, sunTint: 0xffe9c0,
    fog: 0xe3c890, fogDensity: 0.0012,
    sun: 0xffe0b0, sunPos: [-100, 110, 40], sunI: 2.4, hemiI: 0.8,
    deco: 'cacti', decoCount: 90, mountains: 'mesa',
  },
  snow: {
    ground: 0xe6edf4, groundVar: 0xd3dfea, road: 0x3c424c,
    curbA: 0xffffff, curbB: 0xc23b3b, barrier: [0xf4f8fc, 0xc23b3b],
    skyTop: 0x5b9bd4, skyHorizon: 0xe8f1f8, sunTint: 0xf0f6ff,
    fog: 0xdce8f2, fogDensity: 0.0016,
    sun: 0xeef4ff, sunPos: [70, 140, -80], sunI: 2.1, hemiI: 1.0,
    deco: 'pines', decoCount: 150, mountains: 'peaks',
  },
  city: {
    ground: 0x5a636d, groundVar: 0x4d565f, road: 0x33383f,
    curbA: 0xd8d8d8, curbB: 0xd8452f, barrier: [0xd8d8d8, 0xd8452f],
    skyTop: 0x35507e, skyHorizon: 0xf4a56b, sunTint: 0xffcf9e,
    fog: 0xc98a68, fogDensity: 0.0015,
    sun: 0xffc890, sunPos: [-80, 70, -100], sunI: 2.2, hemiI: 0.7,
    deco: 'buildings', decoCount: 80, mountains: 'skyline',
  },
  night: {
    ground: 0x232c40, groundVar: 0x1b2334, road: 0x363c4e,
    curbA: 0x7fd4ff, curbB: 0xff4d9a, barrier: [0x2c3850, 0xff4d9a],
    skyTop: 0x05070f, skyHorizon: 0x14203a, sunTint: 0x8090c0,
    fog: 0x0d1322, fogDensity: 0.0015,
    sun: 0x8090c0, sunPos: [-60, 100, 90], sunI: 1.5, hemiI: 0.95,
    deco: 'neon', decoCount: 110, mountains: 'skylineNight',
    stars: true,
  },
  volcano: {
    ground: 0x4a3c36, groundVar: 0x3d312c, road: 0x453f3c,
    curbA: 0x9a948e, curbB: 0xff5a2a, barrier: [0x6e6660, 0xff5a2a],
    skyTop: 0x1c0f0e, skyHorizon: 0x8a3a24, sunTint: 0xff9a60,
    fog: 0x54291f, fogDensity: 0.0013,
    sun: 0xff9a60, sunPos: [100, 80, -70], sunI: 2.3, hemiI: 0.9,
    deco: 'rocks', decoCount: 120, mountains: 'volcano',
    stars: false,
  },
};

// ------------------------------------------------------- official tracks

export const TRACKS = [
  {
    id: 'sunrise', name: 'Sunrise Circuit', difficulty: 'Easy', theme: 'meadow', width: 13,
    points: [
      [0, 0, 0], [70, 0, -12], [135, 2, 8], [170, 5, 60], [155, 7, 115],
      [100, 6, 148], [35, 4, 152], [-35, 2, 132], [-68, 0, 78], [-52, 0, 26],
    ],
  },
  {
    id: 'dune', name: 'Dune Driftway', difficulty: 'Easy', theme: 'desert', width: 12,
    points: [
      [0, 0, 0], [90, 1, -6], [160, 3, 30], [185, 5, 95], [140, 6, 150],
      [70, 4, 170], [0, 2, 140], [-55, 3, 160], [-110, 2, 110], [-95, 1, 45], [-45, 0, 8],
    ],
  },
  {
    id: 'alpine', name: 'Alpine Loop', difficulty: 'Medium', theme: 'snow', width: 11,
    points: [
      [0, 0, 0], [80, 3, -10], [140, 8, 20], [150, 14, 80], [100, 18, 120],
      [30, 16, 100], [-20, 12, 140], [-70, 8, 110], [-60, 4, 50], [-90, 2, -10], [-40, 0, -20],
    ],
  },
  {
    id: 'downtown', name: 'Downtown Sprint', difficulty: 'Medium', theme: 'city', width: 12,
    points: [
      [0, 0, 0], [110, 0, 0], [170, 0, 40], [170, 0, 100], [120, 0, 130],
      [60, 0, 120], [10, 0, 150], [-60, 0, 150], [-110, 0, 100], [-100, 0, 40], [-50, 0, 5],
    ],
  },
  {
    id: 'neon', name: 'Neon Nights', difficulty: 'Hard', theme: 'night', width: 11,
    points: [
      [0, 0, 0], [70, 0, -15], [120, 4, 15], [100, 8, 60], [140, 10, 100],
      [90, 8, 140], [30, 5, 110], [-25, 4, 150], [-75, 2, 105], [-40, 1, 55], [-80, 0, 10],
    ],
  },
  {
    id: 'volcano', name: 'Volcano Rim', difficulty: 'Hard', theme: 'volcano', width: 11,
    points: [
      [0, 0, 0], [85, 5, -15], [150, 12, 25], [185, 20, 90], [130, 26, 150],
      [55, 24, 185], [-20, 18, 160], [-45, 14, 200], [-110, 10, 150], [-120, 6, 70], [-65, 2, 15],
    ],
  },
];

// ------------------------------------------------------------ track data

export class TrackData {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.halfW = (def.width || 12) / 2;
    const pts = def.points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    this.N = 480;
    this.samples = [];
    const raw = this.curve.getSpacedPoints(this.N); // N+1 points, last == first
    for (let i = 0; i < this.N; i++) {
      this.samples.push({ p: raw[i].clone() });
    }
    for (let i = 0; i < this.N; i++) {
      const prev = this.samples[(i - 1 + this.N) % this.N].p;
      const next = this.samples[(i + 1) % this.N].p;
      const t = next.clone().sub(prev).normalize();
      const right = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
      this.samples[i].t = t;
      this.samples[i].right = right;
    }
    let len = 0;
    for (let i = 0; i < this.N; i++) {
      const a = this.samples[i].p, b = this.samples[(i + 1) % this.N].p;
      len += a.distanceTo(b);
    }
    this.length = len;
    this.medals = {
      gold: Math.round(len / 30 * 1000),
      silver: Math.round(len / 25 * 1000),
      bronze: Math.round(len / 20 * 1000),
    };
    const s0 = this.samples[0];
    this.startPos = s0.p.clone();
    this.startYaw = Math.atan2(s0.t.x, s0.t.z);
  }

  // Locate a world position relative to the track (coarse+refine nearest, then
  // project onto the two adjacent segments).
  lookup(x, z) {
    const S = this.samples;
    const N = this.N;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < N; i += 4) {
      const dx = x - S[i].p.x, dz = z - S[i].p.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    for (let k = -4; k <= 4; k++) {
      const i = (best + k + N) % N;
      const dx = x - S[i].p.x, dz = z - S[i].p.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    let bi = best, bu = 0, bd = Infinity;
    for (const seg of [[(best - 1 + N) % N, best], [best, (best + 1) % N]]) {
      const a = S[seg[0]].p, b = S[seg[1]].p;
      const abx = b.x - a.x, abz = b.z - a.z;
      const L2 = abx * abx + abz * abz;
      if (L2 < 1e-8) continue;
      let u = ((x - a.x) * abx + (z - a.z) * abz) / L2;
      u = Math.max(0, Math.min(1, u));
      const px = a.x + abx * u, pz = a.z + abz * u;
      const d = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d < bd) { bd = d; bi = seg[0]; bu = u; }
    }
    const A = S[bi], B = S[(bi + 1) % N];
    const groundY = A.p.y + (B.p.y - A.p.y) * bu;
    const tangent = A.t.clone().lerp(B.t, bu).normalize();
    const right = A.right.clone().lerp(B.right, bu).normalize();
    const cx = A.p.x + (B.p.x - A.p.x) * bu;
    const cz = A.p.z + (B.p.z - A.p.z) * bu;
    const lateral = (x - cx) * right.x + (z - cz) * right.z;
    const s = ((bi + bu) % N) / N;
    return { s, lateral, groundY, tangent, right, index: bi };
  }
}

// ---------------------------------------------------------- mesh helpers

/** Smooth terrain height away from the road; near the road it hugs the road. */
function makeTerrainFn(track, theme) {
  const halfW = track.halfW;
  const inner = halfW + 4;   // terrain exactly matches road height
  const outer = halfW + 55;  // terrain fully independent beyond this
  return function terrainY(x, z) {
    const info = track.lookup(x, z);
    const roadY = info.groundY;
    // rolling hills independent of the road
    const hills =
      7 * Math.sin(x * 0.0062 + z * 0.0045) +
      5 * Math.cos(x * 0.0041 - z * 0.0058) +
      2.5 * Math.sin((x + z) * 0.012);
    const d = Math.abs(info.lateral);
    let w = (d - inner) / (outer - inner);
    w = Math.max(0, Math.min(1, w));
    w = w * w * (3 - 2 * w); // smoothstep
    return roadY * (1 - w) + (hills) * w - 0.12;
  };
}

/** Ribbon along the track with optional per-segment color + UVs. */
function buildRibbon(track, offA, offB, yLift, { colorFn, uvScaleV = 0 } = {}) {
  const S = track.samples, N = track.N;
  const positions = new Float32Array(N * 2 * 3);
  const colors = colorFn ? new Float32Array(N * 2 * 3) : null;
  const uvs = uvScaleV > 0 ? new Float32Array(N * 2 * 2) : null;
  const indices = [];
  let vAcc = 0;
  let prev = S[0].p;
  for (let i = 0; i < N; i++) {
    const sp = S[i];
    if (i > 0) vAcc += sp.p.distanceTo(prev);
    prev = sp.p;
    const ax = sp.p.x + sp.right.x * offA, az = sp.p.z + sp.right.z * offA;
    const bx = sp.p.x + sp.right.x * offB, bz = sp.p.z + sp.right.z * offB;
    positions[i * 6 + 0] = ax; positions[i * 6 + 1] = sp.p.y + yLift; positions[i * 6 + 2] = az;
    positions[i * 6 + 3] = bx; positions[i * 6 + 4] = sp.p.y + yLift; positions[i * 6 + 5] = bz;
    if (colorFn) {
      const c = colorFn(i);
      colors[i * 6 + 0] = c.r; colors[i * 6 + 1] = c.g; colors[i * 6 + 2] = c.b;
      colors[i * 6 + 3] = c.r; colors[i * 6 + 4] = c.g; colors[i * 6 + 5] = c.b;
    }
    if (uvs) {
      const v = vAcc / uvScaleV;
      uvs[i * 4 + 0] = 0; uvs[i * 4 + 1] = v;
      uvs[i * 4 + 2] = 1; uvs[i * 4 + 3] = v;
    }
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const a = i * 2, b = i * 2 + 1, c = j * 2, d = j * 2 + 1;
    indices.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (colors) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (uvs) geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Vertical wall ribbon along one side of the track (continuous barrier). */
function buildWallRibbon(track, offset, height, colorFn) {
  const S = track.samples, N = track.N;
  const positions = new Float32Array(N * 2 * 3);
  const colors = colorFn ? new Float32Array(N * 2 * 3) : null;
  const indices = [];
  for (let i = 0; i < N; i++) {
    const sp = S[i];
    const x = sp.p.x + sp.right.x * offset, z = sp.p.z + sp.right.z * offset;
    positions[i * 6 + 0] = x; positions[i * 6 + 1] = sp.p.y; positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x; positions[i * 6 + 4] = sp.p.y + height; positions[i * 6 + 5] = z;
    if (colorFn) {
      const c = colorFn(i);
      colors[i * 6 + 0] = c.r; colors[i * 6 + 1] = c.g; colors[i * 6 + 2] = c.b;
      colors[i * 6 + 3] = c.r; colors[i * 6 + 4] = c.g; colors[i * 6 + 5] = c.b;
    }
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const a = i * 2, b = i * 2 + 1, c = j * 2, d = j * 2 + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (colors) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeAsphaltTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) {
    const g = 108 + Math.floor(Math.random() * 70);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeCheckerTexture(repeatX = 8) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const ctx = c.getContext('2d');
  for (let x = 0; x < 8; x++) {
    ctx.fillStyle = x % 2 === 0 ? '#f4f4f4' : '#141414';
    ctx.fillRect(x * 16, 0, 16, 16);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, 1);
  return tex;
}

function makeStartLineTexture(cols = 16) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 32;
  const ctx = c.getContext('2d');
  const step = 256 / cols;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f2f2f2' : '#15181e';
      ctx.fillRect(Math.floor(x * step), y * 16, Math.ceil(step), 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

/** Dark banner with checkered strips and a label — used for the start gate. */
function makeBannerTexture(label) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#151b26';
  ctx.fillRect(0, 0, c.width, c.height);
  const band = 22;
  for (let x = 0; x < c.width / band; x++) {
    ctx.fillStyle = x % 2 === 0 ? '#f2f2f2' : '#141414';
    ctx.fillRect(x * band, 0, band, band);
    ctx.fillStyle = x % 2 === 0 ? '#141414' : '#f2f2f2';
    ctx.fillRect(x * band, c.height - band, band, band);
  }
  ctx.fillStyle = '#f4f6fa';
  ctx.font = 'bold 62px system-ui, "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ------------------------------------------------------------- sky dome

function buildSky(theme) {
  const geo = new THREE.SphereGeometry(1500, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(theme.skyTop) },
      horizon: { value: new THREE.Color(theme.skyHorizon) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 top;
      uniform vec3 horizon;
      void main() {
        float h = normalize(vPos).y;
        float t = pow(max(h, 0.0), 0.55);
        gl_FragColor = vec4(mix(horizon, top, t), 1.0);
      }`,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.frustumCulled = false;

  const group = new THREE.Group();
  group.add(dome);

  // sun / moon disc
  const sunDir = new THREE.Vector3(...theme.sunPos).normalize();
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(46, 24),
    new THREE.MeshBasicMaterial({ color: theme.sunTint, fog: false })
  );
  sun.position.copy(sunDir).multiplyScalar(1400);
  sun.lookAt(0, 0, 0);
  group.add(sun);

  // stars for night themes
  if (theme.stars) {
    const count = 700;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // random directions in the upper hemisphere
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * 0.85 + 0.12;
      const r = 1400;
      const phi = Math.acos(v);
      pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(u);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(u);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xcfe0ff, size: 3.2, sizeAttenuation: false, fog: false,
    }));
    group.add(stars);
  }
  return group;
}

// ---------------------------------------------------------- decorations

function scatterPositions(track, terrainY, count, minDist, maxRadius) {
  const out = [];
  let guard = 0;
  while (out.length < count && guard < count * 40) {
    guard++;
    const x = (Math.random() * 2 - 1) * maxRadius;
    const z = (Math.random() * 2 - 1) * maxRadius;
    const info = track.lookup(x, z);
    if (Math.abs(info.lateral) < minDist) continue;
    out.push([x, terrainY(x, z), z]);
  }
  return out;
}

const decoMats = {
  trunk: () => new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1, flatShading: true }),
  leafA: () => new THREE.MeshStandardMaterial({ color: 0x2e7d3a, roughness: 1, flatShading: true }),
  leafB: () => new THREE.MeshStandardMaterial({ color: 0x3f9a4c, roughness: 1, flatShading: true }),
  pine: () => new THREE.MeshStandardMaterial({ color: 0x27584a, roughness: 1, flatShading: true }),
  snowCap: () => new THREE.MeshStandardMaterial({ color: 0xf4f8fc, roughness: 1, flatShading: true }),
  cactus: () => new THREE.MeshStandardMaterial({ color: 0x3f8a4a, roughness: 1, flatShading: true }),
  rock: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }),
};

function buildDecorations(track, theme, terrainY) {
  const group = new THREE.Group();
  const positions = scatterPositions(track, terrainY, theme.decoCount, track.halfW + 7, track.length * 0.42);

  const add = (m, x, y, z, s = 1, ry = Math.random() * Math.PI * 2) => {
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.scale.setScalar(s);
    group.add(m);
  };

  for (const [x, y, z] of positions) {
    const s = 0.75 + Math.random() * 0.8;
    switch (theme.deco) {
      case 'trees': {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 2.6, 6), decoMats.trunk());
        trunk.position.y = 1.3;
        const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3 + Math.random(), 0), Math.random() > 0.5 ? decoMats.leafA() : decoMats.leafB());
        canopy.position.y = 4;
        canopy.scale.y = 1.15;
        g.add(trunk, canopy);
        add(g, x, y, z, s);
        break;
      }
      case 'pines': {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 1.8, 6), decoMats.trunk());
        trunk.position.y = 0.9;
        const c1 = new THREE.Mesh(new THREE.ConeGeometry(2.1, 3.4, 7), decoMats.pine());
        c1.position.y = 3.2;
        const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.55, 2.8, 7), decoMats.pine());
        c2.position.y = 5.3;
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 7), decoMats.snowCap());
        cap.position.y = 7.0;
        g.add(trunk, c1, c2, cap);
        add(g, x, y, z, s);
        break;
      }
      case 'cacti': {
        const g = new THREE.Group();
        const mat = decoMats.cactus();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 4.6, 7), mat);
        body.position.y = 2.3;
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.9, 7), mat);
        arm.position.set(0.95, 3.1, 0); arm.rotation.z = -0.6;
        g.add(body, arm);
        if (Math.random() > 0.5) {
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), decoMats.rock(0xb08d58));
          rock.position.set(1.8, 0.4, 0.6);
          g.add(rock);
        }
        add(g, x, y, z, s);
        break;
      }
      case 'rocks': {
        const g = new THREE.Group();
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(1.2 + Math.random() * 1.6, 0),
            decoMats.rock(0x4a403c)
          );
          rock.position.set((Math.random() - 0.5) * 3.4, 0.5 + Math.random(), (Math.random() - 0.5) * 3.4);
          rock.rotation.set(Math.random(), Math.random(), Math.random());
          g.add(rock);
        }
        // ember glow
        if (Math.random() > 0.75) {
          const ember = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xff5a2a })
          );
          ember.position.set(0, 0.25, 0);
          g.add(ember);
        }
        add(g, x, y, z, s);
        break;
      }
      case 'buildings':
      case 'neon': {
        const h = 12 + Math.random() * 34;
        const w = 7 + Math.random() * 9;
        const neon = theme.deco === 'neon';
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({
          color: neon ? 0x1a2236 : [0x8a929c, 0x77808c, 0x9aa2ac][Math.floor(Math.random() * 3)],
          roughness: 0.9, flatShading: true,
        });
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
        box.position.y = h / 2;
        g.add(box);
        if (Math.random() > 0.5) {
          const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, h * 0.25, w * 0.6), mat);
          top.position.y = h + h * 0.125;
          g.add(top);
        }
        if (neon) {
          const stripMat = new THREE.MeshBasicMaterial({
            color: [0x40c8ff, 0xff40a0, 0xb060ff][Math.floor(Math.random() * 3)],
          });
          for (const [ex, ez] of [[1, 1], [-1, -1]]) {
            const strip = new THREE.Mesh(new THREE.BoxGeometry(0.4, h * 0.8, 0.4), stripMat);
            strip.position.set(ex * (w / 2 + 0.1), h * 0.45, ez * (w / 2 + 0.1));
            g.add(strip);
          }
        } else {
          // window grid
          const winMat = new THREE.MeshStandardMaterial({
            color: 0x2a3340, roughness: 0.4, metalness: 0.4,
            emissive: 0xffb060, emissiveIntensity: 0.25,
          });
          const rows = Math.floor(h / 4);
          for (let r = 0; r < rows; r++) {
            const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 1.1, 0.2), winMat);
            win.position.set(0, 2.4 + r * 4, w / 2 + 0.05);
            g.add(win);
            const win2 = win.clone();
            win2.position.z = -win.position.z;
            win2.rotation.y = Math.PI;
            g.add(win2);
          }
        }
        add(g, x, y, z, 1);
        break;
      }
      default: break;
    }
  }
  return group;
}

/** Distant backdrop ring so the horizon never looks empty. */
function buildHorizon(track, theme) {
  const group = new THREE.Group();
  const R = track.length * 0.5 + 420;
  const kind = theme.mountains;
  const count = 42;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.06;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    const s = 0.7 + Math.random() * 0.9;
    if (kind === 'peaks') {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(90 * s, 130 * s + Math.random() * 90, 5),
        new THREE.MeshStandardMaterial({ color: 0x8ea6bc, roughness: 1, flatShading: true })
      );
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(38 * s, 55 * s, 5),
        new THREE.MeshStandardMaterial({ color: 0xf4f8fc, roughness: 1, flatShading: true })
      );
      cap.position.y = 60 * s + 40;
      m.add(cap);
      m.position.set(x, -20, z);
      group.add(m);
    } else if (kind === 'hills' || kind === 'mesa') {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(110 * s, kind === 'mesa' ? 55 * s : 75 * s, 6),
        new THREE.MeshStandardMaterial({
          color: kind === 'mesa' ? 0xb08d58 : 0x5f8a5c, roughness: 1, flatShading: true,
        })
      );
      if (kind === 'mesa') m.scale.y = 0.55;
      m.position.set(x, -20, z);
      group.add(m);
    } else if (kind === 'volcano') {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(100 * s, 90 * s, 6),
        new THREE.MeshStandardMaterial({ color: 0x3a2d28, roughness: 1, flatShading: true })
      );
      m.position.set(x, -20, z);
      group.add(m);
      if (i % 9 === 0) {
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(6 * s, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xff5a2a })
        );
        glow.position.set(x, 55 * s, z);
        group.add(glow);
      }
    } else if (kind === 'skyline' || kind === 'skylineNight') {
      const h = 40 + Math.random() * 120;
      const w = 30 + Math.random() * 40;
      const night = kind === 'skylineNight';
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, w),
        new THREE.MeshStandardMaterial({
          color: night ? 0x141b2e : 0x5d6672, roughness: 0.9, flatShading: true,
          emissive: night ? new THREE.Color([0x2a6aff, 0xff2a8a, 0x8a4dff][i % 3]).multiplyScalar(0.25) : 0x000000,
        })
      );
      m.position.set(x, h / 2 - 30, z);
      m.rotation.y = Math.random();
      group.add(m);
      if (night && i % 3 === 0) {
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(2.4, 6, 5),
          new THREE.MeshBasicMaterial({ color: 0xff4040 })
        );
        beacon.position.set(x, h - 30 + 3, z);
        group.add(beacon);
      }
    }
  }
  return group;
}

// -------------------------------------------------------- build a track

export function buildTrack(def) {
  if (!def || !Array.isArray(def.points) || def.points.length < 3) {
    throw new Error('buildTrack: track definition needs at least 3 points');
  }
  for (const p of def.points) {
    for (const v of p) {
      if (!Number.isFinite(v)) throw new Error('buildTrack: track definition contains a non-finite coordinate');
    }
  }
  const track = new TrackData(def);
  if (!Number.isFinite(track.length) || track.length < 20) {
    throw new Error('buildTrack: degenerate track (length ' + track.length + ')');
  }
  const theme = THEMES[def.theme] || THEMES.meadow;
  const group = new THREE.Group();
  group.name = 'trackGroup';
  const halfW = track.halfW;
  const terrainY = makeTerrainFn(track, theme);
  track.terrainY = terrainY;

  // ---- terrain (vertex-colored heightfield hugging the road)
  {
    const size = track.length * 0.8 + 700;
    const seg = 110;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(theme.ground);
    const vary = new THREE.Color(theme.groundVar);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = terrainY(x, z);
      pos.setY(i, y);
      const n = Math.sin(x * 0.11) * Math.cos(z * 0.13) * 0.5 + Math.sin(x * 0.031 + z * 0.047) * 0.5;
      c.copy(base).lerp(vary, Math.max(0, Math.min(1, 0.5 + n * 0.5)));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1,
    }));
    terrain.receiveShadow = true;
    group.add(terrain);
  }

  // ---- road surface with asphalt texture
  const asphalt = makeAsphaltTexture();
  const roadMat = new THREE.MeshStandardMaterial({
    color: theme.road, roughness: 0.95, map: asphalt,
  });
  const roadGeo = buildRibbon(track, -halfW, halfW, 0.06, { uvScaleV: 9 });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // ---- edge lines
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8dce2 });
  group.add(new THREE.Mesh(buildRibbon(track, halfW - 0.65, halfW - 0.25, 0.085), lineMat));
  group.add(new THREE.Mesh(buildRibbon(track, -halfW + 0.25, -halfW + 0.65, 0.085), lineMat));

  // ---- center dashes
  {
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xc8ccd4 });
    const dashLen = 7, gap = 7;
    const S = track.samples, N = track.N;
    let i = 0, v = 0;
    const per = (dashLen + gap);
    const total = track.length;
    while (v < total) {
      const i0 = Math.floor((v / total) * N);
      const i1 = Math.floor(((v + dashLen) / total) * N);
      const positions = [];
      for (let k = i0; k <= i1 && k < i0 + N; k++) {
        const sp = S[k % N];
        for (const off of [-0.18, 0.18]) {
          positions.push(sp.p.x + sp.right.x * off, sp.p.y + 0.075, sp.p.z + sp.right.z * off);
        }
      }
      if (positions.length >= 12) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        const idx = [];
        const quads = (positions.length / 6) - 1;
        for (let q = 0; q < quads; q++) {
          const a = q * 2, b = q * 2 + 1, c2 = q * 2 + 2, d2 = q * 2 + 3;
          idx.push(a, b, c2, b, d2, c2);
        }
        g.setIndex(idx);
        group.add(new THREE.Mesh(g, dashMat));
      }
      v += per;
    }
  }

  // ---- curbs
  const curbColor = (i) => (Math.floor(i / 5) % 2 === 0)
    ? new THREE.Color(theme.curbA)
    : new THREE.Color(theme.curbB);
  const curbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  group.add(new THREE.Mesh(buildRibbon(track, halfW, halfW + 1.2, 0.1, { colorFn: curbColor }), curbMat));
  group.add(new THREE.Mesh(buildRibbon(track, -halfW - 1.2, -halfW, 0.1, { colorFn: curbColor }), curbMat));

  // ---- continuous barriers
  const wallColor = (i) => (Math.floor(i / 8) % 2 === 0)
    ? new THREE.Color(theme.barrier[0])
    : new THREE.Color(theme.barrier[1]);
  const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
  for (const side of [1, -1]) {
    const wall = new THREE.Mesh(
      buildWallRibbon(track, side * (halfW + 1.7), 0.85, wallColor),
      wallMat
    );
    group.add(wall);
  }

  // ---- start / finish gate (banner style)
  {
    // sit the gate a few metres up the road so it frames the start view
    // instead of clipping the top of the camera
    const gi = Math.round(6 / (track.length / track.N)) % track.N;
    const s0 = track.samples[gi];
    const yaw = Math.atan2(s0.t.x, s0.t.z);
    const g = new THREE.Group();
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x262e3c, roughness: 0.65, metalness: 0.35 });
    const gateH = 7.4;
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.55, gateH, 0.55), pillarMat);
      p.position.set(side * (halfW + 1.8), gateH / 2, 0);
      p.castShadow = true;
      g.add(p);
      // small foot block so the pillars do not look pasted on
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 1.0), pillarMat);
      foot.position.set(side * (halfW + 1.8), 0.17, 0);
      g.add(foot);
    }
    const bannerW = (halfW + 2.05) * 2;
    const bannerTex = makeBannerTexture('START / FINISH');
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(bannerW, 1.7, 0.35),
      new THREE.MeshStandardMaterial({
        map: bannerTex, roughness: 0.8,
        emissive: 0xffffff, emissiveMap: bannerTex, emissiveIntensity: 0.55,
      })
    );
    banner.position.y = gateH - 0.5;
    banner.castShadow = true;
    g.add(banner);
    const underside = new THREE.Mesh(
      new THREE.BoxGeometry(bannerW, 0.28, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.7 })
    );
    underside.position.y = gateH - 1.5;
    g.add(underside);
    g.position.set(s0.p.x, s0.p.y, s0.p.z);
    g.rotation.y = yaw;
    group.add(g);
  }

  // ---- checkered start / finish line painted on the tarmac
  {
    const s0 = track.samples[0];
    const lineGeo = new THREE.PlaneGeometry(halfW * 2 - 0.2, 1.6);
    lineGeo.rotateX(-Math.PI / 2);
    const line = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ map: makeStartLineTexture(18) }));
    line.position.set(s0.p.x, s0.p.y + 0.095, s0.p.z);
    line.rotation.y = track.startYaw;
    group.add(line);
  }

  // ---- checkpoint arches
  track.checkpoints = [0.25, 0.5, 0.75].map((f, idx) => {
    const i = Math.floor(f * track.N) % track.N;
    const sp = track.samples[i];
    const cpYaw = Math.atan2(sp.t.x, sp.t.z);
    const col = [0x3ddc84, 0xffc93c, 0x4da6ff][idx];
    const g = new THREE.Group();
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2a3242, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.6, 0.5), pillarMat);
      p.position.set(side * (halfW + 1.2), 2.3, 0);
      g.add(p);
    }
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry((halfW + 1.5) * 2, 0.55, 0.55),
      new THREE.MeshBasicMaterial({ color: col })
    );
    beam.position.y = 4.8;
    g.add(beam);
    // ground strip
    const stripGeo = new THREE.PlaneGeometry(halfW * 2, 0.7);
    stripGeo.rotateX(-Math.PI / 2);
    const strip = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ color: col }));
    strip.position.y = 0.1;
    g.add(strip);
    g.position.set(sp.p.x, sp.p.y, sp.p.z);
    g.rotation.y = cpYaw;
    group.add(g);
    return f;
  });

  // ---- horizon backdrop + sky
  group.add(buildHorizon(track, theme));
  group.add(buildSky(theme));

  // ---- decorations
  group.add(buildDecorations(track, theme, terrainY));

  return { track, group, theme };
}

export function buildSceneEnvironment(scene, theme) {
  scene.background = new THREE.Color(theme.skyHorizon);
  scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);
  return theme;
}
