// Ghost recording & replay. Best lap per track is stored in localStorage.

const GKEY = (id) => `polydash_ghost_${id}`;
const RECORD_EVERY = 2; // record every 2nd frame (~30 Hz)

export class GhostRecorder {
  constructor() {
    this.frame = 0;
    this.t = [];   // ms
    this.x = []; this.y = []; this.z = []; this.yaw = [];
  }

  frame_tick(raceTimeMs, car) {
    if (this.frame++ % RECORD_EVERY !== 0) return;
    this.t.push(Math.round(raceTimeMs));
    this.x.push(round2(car.pos.x));
    this.y.push(round2(car.pos.y));
    this.z.push(round2(car.pos.z));
    this.yaw.push(round3(car.yaw));
  }

  /** Save if `timeMs` beats the stored best. Returns 'saved' | 'kept' | 'invalid'. */
  save(trackId, timeMs) {
    if (this.t.length < 10 || !Number.isFinite(timeMs)) return 'invalid';
    let best = null;
    try {
      const raw = localStorage.getItem(GKEY(trackId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Number.isFinite(parsed.timeMs)) best = parsed.timeMs;
      }
    } catch (e) { /* ignore */ }
    if (best != null && isFinite(best) && timeMs >= best) return 'kept';
    const data = { timeMs: Math.round(timeMs), t: this.t, x: this.x, y: this.y, z: this.z, yaw: this.yaw };
    try {
      localStorage.setItem(GKEY(trackId), JSON.stringify(data));
      return 'saved';
    } catch (e) {
      console.warn('Ghost save failed (storage full?)', e);
      return 'kept';
    }
  }
}

export class GhostPlayer {
  constructor(trackId) {
    this.data = null;
    try {
      const raw = localStorage.getItem(GKEY(trackId));
      if (raw) this.data = JSON.parse(raw);
    } catch (e) {
      this.data = null;
    }
    this.cursor = 0;
  }

  get available() { return !!this.data && this.data.t.length > 1; }

  /** Pose at raceTimeMs: { x, y, z, yaw } or null. */
  sample(raceTimeMs) {
    if (!this.available) return null;
    const { t, x, y, z, yaw } = this.data;
    if (raceTimeMs <= t[0]) return { x: x[0], y: y[0], z: z[0], yaw: yaw[0] };
    if (raceTimeMs >= t[t.length - 1]) return null; // ghost finished
    while (this.cursor < t.length - 2 && t[this.cursor + 1] < raceTimeMs) this.cursor++;
    while (this.cursor > 0 && t[this.cursor] > raceTimeMs) this.cursor--;
    const i = this.cursor;
    const span = t[i + 1] - t[i];
    const u = span > 0 ? (raceTimeMs - t[i]) / span : 0;
    return {
      x: x[i] + (x[i + 1] - x[i]) * u,
      y: y[i] + (y[i + 1] - y[i]) * u,
      z: z[i] + (z[i + 1] - z[i]) * u,
      yaw: yaw[i] + (yaw[i + 1] - yaw[i]) * u,
    };
  }
}

function round2(v) { return Math.round(v * 100) / 100; }
function round3(v) { return Math.round(v * 1000) / 1000; }
