// Track editor: place points on a top-down grid, test drive, share via code.

import { formatTime } from './ui.js';

const $ = (id) => document.getElementById(id);

const WORLD_EXTENT = 480; // world meters visible across the canvas

export class TrackEditor {
  constructor(onTest) {
    this.canvas = $('editor-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.points = [];
    this.tool = 'add';
    this.dragIdx = -1;
    this.onTest = onTest; // callback(points) — start test drive
    this.loadSaved();

    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerup', () => { this.dragIdx = -1; this.save(); });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    $('ed-add').addEventListener('click', () => this.setTool('add'));
    $('ed-move').addEventListener('click', () => this.setTool('move'));
    $('ed-del').addEventListener('click', () => this.setTool('del'));
    $('ed-test').addEventListener('click', () => this.test());
    $('ed-export').addEventListener('click', () => this.exportCode());
    $('ed-import').addEventListener('click', () => this.importCode());
    $('ed-clear').addEventListener('click', () => { this.points = []; this.save(); this.draw(); });
    $('ed-exit').addEventListener('click', () => this.exit());

    // keep rendering while visible (test drive may cover the screen)
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
      add: 'Left-click to place track points (minimum 4, loop is closed automatically). Switch to MOVE to drag points, DELETE to remove one.',
      move: 'Drag any point to reshape the track. The loop closes automatically.',
      del: 'Click a point to remove it. Keep at least 4 points.',
    };
    $('editor-hint').textContent = hints[t];
  }

  // ------------------------------------------------------ coordinates

  toWorld(px, py) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (px - rect.left) / rect.width;
    const y = (py - rect.top) / rect.height;
    return {
      x: (x - 0.5) * WORLD_EXTENT,
      z: (y - 0.5) * WORLD_EXTENT,
    };
  }

  toScreen(wx, wz) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      px: (wx / WORLD_EXTENT + 0.5) * rect.width,
      py: (wz / WORLD_EXTENT + 0.5) * rect.height,
    };
  }

  // ------------------------------------------------------ interaction

  hitPoint(w) {
    for (let i = 0; i < this.points.length; i++) {
      const dx = this.points[i].x - w.x, dz = this.points[i].z - w.z;
      if (dx * dx + dz * dz < 14 * 14) return i;
    }
    return -1;
  }

  onDown(e) {
    const w = this.toWorld(e.clientX, e.clientY);
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
    const w = this.toWorld(e.clientX, e.clientY);
    // keep inside world bounds
    w.x = Math.max(-WORLD_EXTENT / 2 + 10, Math.min(WORLD_EXTENT / 2 - 10, w.x));
    w.z = Math.max(-WORLD_EXTENT / 2 + 10, Math.min(WORLD_EXTENT / 2 - 10, w.z));
    this.points[this.dragIdx] = w;
    this.draw();
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
    this.save();
    this.onTest(this.points.map(p => [p.x, 0, p.z]));
  }

  exit() {
    this.save();
    if (this.onExit) this.onExit();
  }

  // ------------------------------------------------------ rendering

  draw() {
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    // draw in CSS-pixel space so pointer mapping and rendering always match,
    // even if CSS scales the canvas
    ctx.setTransform(this.canvas.width / rect.width, 0, 0, this.canvas.height / rect.height, 0, 0);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#101827';
    ctx.fillRect(0, 0, W, H);

    // grid (20 m cells)
    const sx = W / WORLD_EXTENT, sz = H / WORLD_EXTENT;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    for (let gx = 0; gx <= W; gx += 20 * sx) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gz = 0; gz <= H; gz += 20 * sz) {
      ctx.beginPath(); ctx.moveTo(0, gz); ctx.lineTo(W, gz); ctx.stroke();
    }

    const P = this.points;
    if (P.length >= 2) {
      // loop line
      ctx.strokeStyle = '#ff5a3c';
      ctx.lineWidth = 26;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      const first = this.toScreen(P[0].x, P[0].z);
      ctx.moveTo(first.px, first.py);
      for (let i = 1; i < P.length; i++) {
        const s = this.toScreen(P[i].x, P[i].z);
        ctx.lineTo(s.px, s.py);
      }
      if (P.length >= 4) ctx.closePath();
      ctx.stroke();
      // center line
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 10]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // points
    for (let i = 0; i < P.length; i++) {
      const s = this.toScreen(P[i].x, P[i].z);
      ctx.beginPath();
      ctx.arc(s.px, s.py, 6, 0, Math.PI * 2);
      ctx.fillStyle = i === this.dragIdx ? '#ffc93c' : '#e8ecf4';
      ctx.fill();
      ctx.strokeStyle = '#101827';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // start marker at point 0
    if (P.length) {
      const s = this.toScreen(P[0].x, P[0].z);
      ctx.fillStyle = '#3ddc84';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('START', s.px + 10, s.py - 10);
    }

    // stats
    if (P.length >= 4) {
      let len = 0;
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        len += Math.hypot(b.x - a.x, b.z - a.z);
      }
      ctx.fillStyle = 'rgba(232,236,244,0.75)';
      ctx.font = '12px sans-serif';
      ctx.fillText(`${P.length} points · approx ${Math.round(len)} m · est. gold ${formatTime(len / 30 * 1000)}`, 12, H - 12);
    }
  }
}
