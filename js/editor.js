// Track editor: place points on a grid, see the real smoothed track with its
// road width, then test drive. Snap / undo / zoom / share via export code.

import * as THREE from 'three';
import { formatTime } from './ui.js';

const $ = (id) => document.getElementById(id);

export class TrackEditor {
  constructor(onTest) {
    this.canvas = $('editor-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.points = [];
    this.tool = 'add';
    this.dragIdx = -1;
    this.view = 480;          // world meters across the canvas
    this.snap = true;
    this.onTest = onTest;
    this.loadSaved();

    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerup', () => { if (this.dragIdx >= 0) this.save(); this.dragIdx = -1; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    $('ed-add').addEventListener('click', () => this.setTool('add'));
    $('ed-move').addEventListener('click', () => this.setTool('move'));
    $('ed-del').addEventListener('click', () => this.setTool('del'));
    $('ed-snap').addEventListener('click', () => {
      this.snap = !this.snap;
      $('ed-snap').classList.toggle('active', this.snap);
    });
    $('ed-undo').addEventListener('click', () => { this.points.pop(); this.save(); });
    $('ed-zoom-in').addEventListener('click', () => { this.view = Math.max(240, this.view - 120); });
    $('ed-zoom-out').addEventListener('click', () => { this.view = Math.min(960, this.view + 120); });
    $('ed-test').addEventListener('click', () => this.test());
    $('ed-export').addEventListener('click', () => this.exportCode());
    $('ed-import').addEventListener('click', () => this.importCode());
    $('ed-clear').addEventListener('click', () => { this.points = []; this.save(); });
    $('ed-exit').addEventListener('click', () => this.exit());

    // keep rendering while visible
    const raf = () => {
      if (!$('editor').classList.contains('hidden')) this.draw();
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }

  setTool(t) {
    this.tool = t;
    for (const b of ['add', 'move', 'del']) {
      $(`ed-${b}`).classList.toggle('active', b === t);
    }
    const hints = {
      add: 'Click to drop corner points — the white band is the real road you will drive (loop closes automatically). SNAP aligns points to the grid.',
      move: 'Drag any corner to reshape the track. The loop closes automatically.',
      del: 'Click a corner to remove it. Keep at least 4 points.',
    };
    $('editor-hint').textContent = hints[t];
  }

  // ------------------------------------------------------ coordinates

  toWorld(px, py) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (px - rect.left) / rect.width;
    const y = (py - rect.top) / rect.height;
    return { x: (x - 0.5) * this.view, z: (y - 0.5) * this.view };
  }

  toScreen(wx, wz) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      px: (wx / this.view + 0.5) * rect.width,
      py: (wz / this.view + 0.5) * rect.height,
    };
  }

  // ------------------------------------------------------ interaction

  hitPoint(w) {
    const r = 12 * (480 / this.view);
    for (let i = 0; i < this.points.length; i++) {
      const dx = this.points[i].x - w.x, dz = this.points[i].z - w.z;
      if (dx * dx + dz * dz < r * r) return i;
    }
    return -1;
  }

  onDown(e) {
    let w = this.toWorld(e.clientX, e.clientY);
    if (this.snap && this.tool === 'add') {
      w = { x: Math.round(w.x / 10) * 10, z: Math.round(w.z / 10) * 10 };
    }
    if (this.tool === 'add') {
      this.points.push(w);
      this.save();
    } else if (this.tool === 'move') {
      this.dragIdx = this.hitPoint(w);
    } else if (this.tool === 'del') {
      const i = this.hitPoint(w);
      if (i >= 0 && this.points.length > 4) {
        this.points.splice(i, 1);
        this.save();
      }
    }
    this.draw();
  }

  onMove(e) {
    if (this.tool !== 'move' || this.dragIdx < 0) return;
    let w = this.toWorld(e.clientX, e.clientY);
    const lim = this.view / 2 - 10;
    w.x = Math.max(-lim, Math.min(lim, w.x));
    w.z = Math.max(-lim, Math.min(lim, w.z));
    if (this.snap) {
      w = { x: Math.round(w.x / 10) * 10, z: Math.round(w.z / 10) * 10 };
    }
    this.points[this.dragIdx] = w;
    this.draw();
  }

  // ------------------------------------------------------ curve sampling

  /** The same smoothing the game uses, so what you see is what you drive. */
  smoothedPath() {
    if (this.points.length < 3) return null;
    const pts = this.points.map(p => new THREE.Vector3(p.x, 0, p.z));
    const closed = this.points.length >= 4;
    const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal', 0.5);
    return curve.getSpacedPoints(220);
  }

  // ------------------------------------------------------ persistence

  save() {
    try { localStorage.setItem('polydash_custom_track', JSON.stringify(this.points)); } catch (e) { /* ignore */ }
  }

  loadSaved() {
    try {
      const raw = localStorage.getItem('polydash_custom_track');
      if (raw) {
        const pts = JSON.parse(raw);
        if (Array.isArray(pts) && pts.length >= 4) this.points = pts;
      }
    } catch (e) { /* ignore */ }
  }

  exportCode() {
    const io = $('editor-io');
    io.classList.remove('hidden');
    io.value = btoa(JSON.stringify(this.points));
    io.select();
    try {
      document.execCommand('copy');
      $('editor-hint').textContent = 'Track code generated and copied — paste it anywhere to share.';
    } catch (e) {
      $('editor-hint').textContent = 'Select the code below and copy it manually.';
    }
  }

  importCode() {
    const io = $('editor-io');
    if (io.classList.contains('hidden')) {
      io.classList.remove('hidden');
      io.value = '';
      io.placeholder = 'Paste a track code here, then click IMPORT again';
      $('editor-hint').textContent = 'Paste a shared track code into the text box, then press IMPORT again.';
      return;
    }
    try {
      const pts = JSON.parse(atob(io.value.trim()));
      if (Array.isArray(pts) && pts.length >= 4 && pts.every(p => typeof p.x === 'number' && typeof p.z === 'number')) {
        this.points = pts;
        this.save();
        io.classList.add('hidden');
        $('editor-hint').textContent = 'Track imported!';
      } else {
        throw new Error('bad format');
      }
    } catch (err) {
      $('editor-hint').textContent = 'Invalid track code — please paste a code exported from PolyDash.';
    }
  }

  test() {
    if (this.points.length < 4) {
      $('editor-hint').textContent = 'Place at least 4 points before test driving.';
      return;
    }
    // reject degenerate layouts instead of dropping the player into an empty world
    let len = 0;
    for (let i = 0; i < this.points.length; i++) {
      const a = this.points[i], b = this.points[(i + 1) % this.points.length];
      len += Math.hypot(b.x - a.x, b.z - a.z);
    }
    if (!Number.isFinite(len) || len < 40) {
      $('editor-hint').textContent = 'Track too small — spread the corners further apart (at least ~40 m around the loop).';
      return;
    }
    this.save();
    // pass plain objects: the game reads .x / .z
    this.onTest(this.points.map(p => ({ x: p.x, z: p.z })));
  }

  exit() {
    this.save();
    if (this.onExit) this.onExit();
  }

  // ------------------------------------------------------ rendering

  draw() {
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    ctx.setTransform(this.canvas.width / rect.width, 0, 0, this.canvas.height / rect.height, 0, 0);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#101827';
    ctx.fillRect(0, 0, W, H);

    const pxPerM = W / this.view;

    // grid (10 m cells, brighter every 50 m)
    ctx.lineWidth = 1;
    for (let w = Math.ceil(-this.view / 2 / 10) * 10; w <= this.view / 2; w += 10) {
      const major = w % 50 === 0;
      ctx.strokeStyle = major ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.05)';
      const a = this.toScreen(w, -this.view / 2), b = this.toScreen(w, this.view / 2);
      ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.stroke();
      const c = this.toScreen(-this.view / 2, w), d = this.toScreen(this.view / 2, w);
      ctx.beginPath(); ctx.moveTo(c.px, c.py); ctx.lineTo(d.px, d.py); ctx.stroke();
    }

    const path = this.smoothedPath();
    if (path && path.length > 2) {
      const trace = () => {
        ctx.beginPath();
        const p0 = this.toScreen(path[0].x, path[0].z);
        ctx.moveTo(p0.px, p0.py);
        for (let i = 1; i < path.length; i++) {
          const s = this.toScreen(path[i].x, path[i].z);
          ctx.lineTo(s.px, s.py);
        }
        if (this.points.length >= 4) ctx.closePath();
      };
      // grass shoulder
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2c4a2e';
      ctx.lineWidth = (2 * 8.5) * pxPerM;
      trace(); ctx.stroke();
      // asphalt band
      ctx.strokeStyle = '#43474e';
      ctx.lineWidth = (2 * 6) * pxPerM;
      trace(); ctx.stroke();
      // edge lines
      ctx.strokeStyle = 'rgba(232,236,244,0.9)';
      ctx.lineWidth = Math.max(1.5, 0.35 * pxPerM);
      trace(); ctx.stroke();
      // dashed centerline
      ctx.strokeStyle = 'rgba(232,236,244,0.55)';
      ctx.lineWidth = Math.max(1, 0.25 * pxPerM);
      ctx.setLineDash([0.9 * 6 * pxPerM, 0.9 * 6 * pxPerM]);
      trace(); ctx.stroke();
      ctx.setLineDash([]);
      // direction arrow at start
      const a0 = path[0], a1 = path[6 % path.length];
      const s0 = this.toScreen(a0.x, a0.z);
      const s1 = this.toScreen(a1.x, a1.z);
      const ang = Math.atan2(s1.py - s0.py, s1.px - s0.px);
      ctx.save();
      ctx.translate(s0.px, s0.py);
      ctx.rotate(ang);
      ctx.fillStyle = '#3ddc84';
      ctx.beginPath();
      ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#3ddc84';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('START', s0.px + 14, s0.py - 12);
    }

    // corner points
    for (let i = 0; i < this.points.length; i++) {
      const s = this.toScreen(this.points[i].x, this.points[i].z);
      ctx.beginPath();
      ctx.arc(s.px, s.py, 6, 0, Math.PI * 2);
      ctx.fillStyle = i === this.dragIdx ? '#ffc93c' : '#e8ecf4';
      ctx.fill();
      ctx.strokeStyle = '#101827';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // stats
    if (this.points.length >= 4) {
      let len = 0;
      for (let i = 0; i < path.length - 1; i++) {
        len += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
      }
      ctx.fillStyle = 'rgba(232,236,244,0.75)';
      ctx.font = '12px sans-serif';
      ctx.fillText(`${this.points.length} corners · track length ≈ ${Math.round(len)} m · est. gold ${formatTime(len / 30 * 1000)} · view ${this.view} m across`, 12, H - 12);
    }
  }
}
