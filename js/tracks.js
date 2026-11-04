// Track definitions, theme decoration and 3D track building.
// A track is a closed Catmull-Rom loop through 3D control points [x, y, z].

import * as THREE from 'three';

export const ROAD_HALF_WIDTH = 6.0;

// ---------------------------------------------------------------- themes

const THEMES = {
  meadow: {
    ground: 0x58a05c, road: 0x3a3f47, curbA: 0xe0e0e0, curbB: 0xd8452f,
    sky: 0x87c5eb, fog: 0x9fd0ec, fogDensity: 0.0016,
    sun: 0xfff3d6, sunPos: [80, 120, 60], ambient: 0xbcd8e8, ambientI: 0.75,
    deco: 'trees', decoCount: 90,
  },
  desert: {
    ground: 0xd9b36c, road: 0x4a4238, curbA: 0xf2e6c8, curbB: 0xc4502a,
    sky: 0xf2c98a, fog: 0xe8c088, fogDensity: 0.0017,
    sun: 0xffe0b0, sunPos: [-90, 100, 40], ambient: 0xd8b890, ambientI: 0.8,
    deco: 'cacti', decoCount: 70,
  },
  snow: {
    ground: 0xe8eef4, road: 0x3d434d, curbA: 0xffffff, curbB: 0xc23b3b,
    sky: 0xcfe0ef, fog: 0xd8e4f0, fogDensity: 0.0022,
    sun: 0xeef4ff, sunPos: [60, 130, -70], ambient: 0xc8d8e8, ambientI: 0.9,
    deco: 'pines', decoCount: 110,
  },
  city: {
    ground: 0x55606a, road: 0x33383f, curbA: 0xd8d8d8, curbB: 0xd8452f,
    sky: 0xf0a878, fog: 0xe0a080, fogDensity: 0.0020,
    sun: 0xffc890, sunPos: [-70, 60, -90], ambient: 0xc89880, ambientI: 0.7,
    deco: 'buildings', decoCount: 60,
  },
  night: {
    ground: 0x1c2333, road: 0x2a2f3d, curbA: 0x9ad8ff, curbB: 0xff4d9a,
    sky: 0x0a0e1a, fog: 0x0d1322, fogDensity: 0.0026,
    sun: 0x8090c0, sunPos: [-50, 90, 80], ambient: 0x38406a, ambientI: 0.85,
    deco: 'neon', decoCount: 80,
  },
  volcano: {
    ground: 0x3a2f2c, road: 0x33302f, curbA: 0x8a8480, curbB: 0xff5a2a,
    sky: 0x4a2320, fog: 0x40201d, fogDensity: 0.0024,
    sun: 0xff9a60, sunPos: [90, 70, -60], ambient: 0x7a4a3a, ambientI: 0.75,
    deco: 'rocks', decoCount: 90,
  },
};

// ------------------------------------------------------- official tracks
// points: [x, y, z] — y is elevation in meters.

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
    id: 'neon', name: 'Neon Nights', difficulty: 'Hard', theme: 'night', width: 10.5,
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
    const raw = this.curve.getSpacedPoints(this.N); // returns N+1 points, last == first
    for (let i = 0; i < this.N; i++) {
      this.samples.push({ p: raw[i].clone() });
    }
    // tangents + right vectors (closed loop)
    for (let i = 0; i < this.N; i++) {
      const prev = this.samples[(i - 1 + this.N) % this.N].p;
      const next = this.samples[(i + 1) % this.N].p;
      const t = next.clone().sub(prev).normalize();
      const right = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
      this.samples[i].t = t;
      this.samples[i].right = right;
    }
    // arc length
    let len = 0;
    for (let i = 0; i < this.N; i++) {
      const a = this.samples[i].p, b = this.samples[(i + 1) % this.N].p;
      len += a.distanceTo(b);
    }
    this.length = len;
    // medals: target times for an average lap speed of 30/25/20 m/s
    this.medals = {
      gold: Math.round(len / 30 * 1000),
      silver: Math.round(len / 25 * 1000),
      bronze: Math.round(len / 20 * 1000),
    };
    // start pose
    const s0 = this.samples[0];
    this.startPos = s0.p.clone();
    this.startYaw = Math.atan2(s0.t.x, s0.t.z);
  }

  // Locate a world position relative to the track.
  // Returns { s (0..1), lateral (signed, + = right side), groundY, tangent, right, index }
  lookup(x, z) {
    const S = this.samples;
    const N = this.N;
    // coarse search
    let best = 0, bestD = Infinity;
    for (let i = 0; i < N; i += 4) {
      const dx = x - S[i].p.x, dz = z - S[i].p.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    // refine around best
    for (let k = -4; k <= 4; k++) {
      const i = (best + k + N) % N;
      const dx = x - S[i].p.x, dz = z - S[i].p.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    // project onto the two adjacent segments for sub-sample accuracy
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
    // signed lateral offset from centerline
    const cx = A.p.x + (B.p.x - A.p.x) * bu;
    const cz = A.p.z + (B.p.z - A.p.z) * bu;
    const lateral = (x - cx) * right.x + (z - cz) * right.z;
    const s = ((bi + bu) % N) / N;
    return { s, lateral, groundY, tangent, right, index: bi };
  }
}

// ---------------------------------------------------------- mesh helpers

function buildRibbon(track, offA, offB, yLift, colorFn) {
  const S = track.samples, N = track.N;
  const positions = new Float32Array(N * 2 * 3);
  const colors = colorFn ? new Float32Array(N * 2 * 3) : null;
  const indices = [];
  for (let i = 0; i < N; i++) {
    const sp = S[i];
    const ax = sp.p.x + sp.right.x * offA, az = sp.p.z + sp.right.z * offA;
    const bx = sp.p.x + sp.right.x * offB, bz = sp.p.z + sp.right.z * offB;
    positions[i * 6 + 0] = ax; positions[i * 6 + 1] = sp.p.y + yLift; positions[i * 6 + 2] = az;
    positions[i * 6 + 3] = bx; positions[i * 6 + 4] = sp.p.y + yLift; positions[i * 6 + 5] = bz;
    if (colorFn) {
      const c = colorFn(i);
      colors[i * 6 + 0] = c.r; colors[i * 6 + 1] = c.g; colors[i * 6 + 2] = c.b;
      colors[i * 6 + 3] = c.r; colors[i * 6 + 4] = c.g; colors[i * 6 + 5] = c.b;
    }
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const a = i * 2, b = i * 2 + 1, c = j * 2, d = j * 2 + 1;
    // winding chosen so face normals point up (visible from above)
    indices.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (colors) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeCheckerTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 8;
  const ctx = c.getContext('2d');
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 1; y++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#111111';
      ctx.fillRect(x * 8, 0, 8, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(6, 1);
  return tex;
}

// ---------------------------------------------------------- decorations

function scatterPositions(track, count, minDist, maxRadius) {
  const out = [];
  let guard = 0;
  while (out.length < count && guard < count * 30) {
    guard++;
    const x = (Math.random() * 2 - 1) * maxRadius;
    const z = (Math.random() * 2 - 1) * maxRadius;
    const info = track.lookup(x, z);
    if (Math.abs(info.lateral) < minDist) continue;
    out.push([x, info.groundY - 0.3, z]);
  }
  return out;
}

function buildDecorations(track, theme) {
  const group = new THREE.Group();
  const positions = scatterPositions(track, theme.decoCount, track.halfW + 5, track.length * 0.45);
  const makeMesh = () => {
    switch (theme.deco) {
      case 'trees': {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.7, 3, 6),
          new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 })
        );
        trunk.position.y = 1.5;
        const leaf1 = new THREE.Mesh(
          new THREE.ConeGeometry(2.6, 4.5, 8),
          new THREE.MeshStandardMaterial({ color: 0x2e7d3a, roughness: 1, flatShading: true })
        );
        leaf1.position.y = 5;
        const leaf2 = new THREE.Mesh(
          new THREE.ConeGeometry(1.9, 3.5, 8),
          new THREE.MeshStandardMaterial({ color: 0x379146, roughness: 1, flatShading: true })
        );
        leaf2.position.y = 7.2;
        g.add(trunk, leaf1, leaf2);
        return g;
      }
      case 'pines': {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.6, 2, 6),
          new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 })
        );
        trunk.position.y = 1;
        const leaf = new THREE.Mesh(
          new THREE.ConeGeometry(2.2, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0x2a5a4a, roughness: 1, flatShading: true })
        );
        leaf.position.y = 6;
        const snow = new THREE.Mesh(
          new THREE.ConeGeometry(1.2, 3, 8),
          new THREE.MeshStandardMaterial({ color: 0xf0f6fa, roughness: 1, flatShading: true })
        );
        snow.position.y = 9;
        g.add(trunk, leaf, snow);
        return g;
      }
      case 'cacti': {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x3f8a4a, roughness: 1 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 5, 8), mat);
        body.position.y = 2.5;
        const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.2, 8), mat);
        arm1.position.set(1.1, 3.4, 0); arm1.rotation.z = -0.5;
        const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.8, 8), mat);
        arm2.position.set(-1.0, 2.6, 0); arm2.rotation.z = 0.5;
        g.add(body, arm1, arm2);
        return g;
      }
      case 'rocks': {
        const g = new THREE.Group();
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(2.4, 0),
          new THREE.MeshStandardMaterial({ color: 0x4a403c, roughness: 1, flatShading: true })
        );
        rock.scale.set(1 + Math.random(), 0.7 + Math.random() * 0.8, 1 + Math.random());
        rock.position.y = 1.2;
        g.add(rock);
        return g;
      }
      case 'buildings':
      case 'neon': {
        const h = 10 + Math.random() * 30;
        const emissive = theme.deco === 'neon';
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({
          color: emissive ? 0x1a2036 : 0x8a929c,
          roughness: 0.9,
          emissive: emissive ? new THREE.Color(Math.random() > 0.5 ? 0x2a6aff : 0xff2a8a).multiplyScalar(0.35) : 0x000000,
        });
        const box = new THREE.Mesh(new THREE.BoxGeometry(8 + Math.random() * 8, h, 8 + Math.random() * 8), mat);
        box.position.y = h / 2;
        g.add(box);
        if (emissive) {
          const strip = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, h * 0.7, 0.5),
            new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0x40c8ff : 0xff40a0 })
          );
          strip.position.set(4.6, h * 0.45, 4.6);
          g.add(strip);
        }
        return g;
      }
      default:
        return null;
    }
  };
  for (const [x, y, z] of positions) {
    const m = makeMesh();
    if (!m) continue;
    m.position.set(x, y, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    const s = 0.7 + Math.random() * 0.9;
    m.scale.setScalar(s);
    group.add(m);
  }
  return group;
}

// -------------------------------------------------------- build a track

export function buildTrack(def) {
  const track = new TrackData(def);
  const theme = THEMES[def.theme] || THEMES.meadow;
  const group = new THREE.Group();
  group.name = 'trackGroup';

  // road surface
  const roadMat = new THREE.MeshStandardMaterial({ color: theme.road, roughness: 0.92, metalness: 0 });
  const roadGeo = buildRibbon(track, -track.halfW, track.halfW, 0.05, null);
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // curbs (alternating colors)
  const halfW = track.halfW;
  const curbColor = (i) => (Math.floor(i / 5) % 2 === 0)
    ? new THREE.Color(theme.curbA)
    : new THREE.Color(theme.curbB);
  const curbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const curbL = new THREE.Mesh(buildRibbon(track, halfW, halfW + 1.1, 0.09, curbColor), curbMat);
  const curbR = new THREE.Mesh(buildRibbon(track, -halfW - 1.1, -halfW, 0.09, curbColor), curbMat);
  group.add(curbL, curbR);

  // barriers (instanced low walls along the outer edge)
  const barrierGeo = new THREE.BoxGeometry(0.5, 0.8, 3.2);
  const barrierMat = new THREE.MeshStandardMaterial({
    color: theme.deco === 'night' ? 0x303a55 : 0xcfd6de, roughness: 0.6,
  });
  const step = 6;
  const count = Math.floor(track.N / step);
  const barriers = new THREE.InstancedMesh(barrierGeo, barrierMat, count * 2);
  const dummy = new THREE.Object3D();
  for (let k = 0; k < count; k++) {
    const i = k * step;
    const sp = track.samples[i];
    const yaw = Math.atan2(sp.t.x, sp.t.z);
    for (let side = 0; side < 2; side++) {
      const off = (side === 0 ? 1 : -1) * (halfW + 1.8);
      dummy.position.set(sp.p.x + sp.right.x * off, sp.p.y + 0.4, sp.p.z + sp.right.z * off);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      barriers.setMatrixAt(k * 2 + side, dummy.matrix);
    }
  }
  barriers.instanceMatrix.needsUpdate = true;
  group.add(barriers);

  // start line (checkered)
  const s0 = track.samples[0];
  const startLine = new THREE.Mesh(
    new THREE.PlaneGeometry(track.halfW * 2, 3),
    new THREE.MeshBasicMaterial({ map: makeCheckerTexture() })
  );
  startLine.rotation.x = -Math.PI / 2;
  startLine.rotation.z = -track.startYaw;
  startLine.position.set(s0.p.x, s0.p.y + 0.12, s0.p.z);
  group.add(startLine);

  // start gate
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x222a3a, roughness: 0.7 });
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0xff5a3c, roughness: 0.6 });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1, 7, 1), gateMat);
    pillar.position.set(
      s0.p.x + s0.right.x * side * (halfW + 1.5),
      s0.p.y + 3.5,
      s0.p.z + s0.right.z * side * (halfW + 1.5)
    );
    pillar.castShadow = true;
    group.add(pillar);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry((halfW + 2) * 2, 1.6, 0.6), bannerMat);
  banner.position.set(s0.p.x, s0.p.y + 7.4, s0.p.z);
  banner.rotation.y = track.startYaw;
  group.add(banner);

  // checkpoint markers (thin glowing strips across the road)
  track.checkpoints = [0.25, 0.5, 0.75].map((f, idx) => {
    const i = Math.floor(f * track.N) % track.N;
    const sp = track.samples[i];
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(track.halfW * 2, 0.6),
      new THREE.MeshBasicMaterial({ color: [0x3ddc84, 0xffc93c, 0x4da6ff][idx] })
    );
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = -Math.atan2(sp.t.x, sp.t.z);
    strip.position.set(sp.p.x, sp.p.y + 0.1, sp.p.z);
    group.add(strip);
    return f;
  });

  // ground plane
  const groundRadius = track.length * 0.55 + 200;
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(groundRadius, 48),
    new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.25;
  ground.receiveShadow = true;
  group.add(ground);

  // decorations
  group.add(buildDecorations(track, theme));

  return { track, group, theme };
}

export function buildSceneEnvironment(scene, theme) {
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);
  return theme;
}
