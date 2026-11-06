// Lap timing: checkpoint splits, lap completion, medal rating.

const CP_FRACTIONS = [0.25, 0.5, 0.75];

export class Timer {
  constructor() {
    this.reset();
  }

  reset() {
    this.running = false;
    this.startMs = 0;
    this.lastMs = 0;
    this.splits = [];        // times at each checkpoint of current lap
    this.bestSplits = null;  // best known lap splits (from ghost data or previous laps)
    this.prevS = 0;
    this.lapDone = null;     // callback(lapTimeMs, splits)
    this.cpHit = null;       // callback(index, splitMs)
  }

  start(nowMs) {
    this.running = true;
    this.startMs = nowMs;
    this.lastMs = nowMs;
    this.splits = [];
    this.prevS = 0;
  }

  stop() {
    this.running = false;
  }

  /**
   * @param s       normalized progress 0..1 from TrackData.lookup
   * @param nowMs   race clock (ms)
   */
  update(s, nowMs) {
    if (!this.running) { this.prevS = s; return; }
    this.lastMs = nowMs;

    // checkpoint crossings (only while moving forward)
    const nextCp = this.splits.length;
    if (nextCp < CP_FRACTIONS.length) {
      const target = CP_FRACTIONS[nextCp];
      if (crossed(this.prevS, s, target)) {
        this.splits.push(nowMs - this.startMs);
        if (this.cpHit) this.cpHit(nextCp, nowMs - this.startMs);
      }
    }

    // lap completes when wrapping from ~1 back to ~0 moving forward. A lap only
    // counts if every checkpoint was collected: sitting on the start line and
    // jittering across the seam must not "finish" the race in zero seconds.
    if (crossed(this.prevS, s, 0) && this.prevS > 0.5) {
      const lapTime = nowMs - this.startMs;
      const complete = this.splits.length >= CP_FRACTIONS.length && lapTime > 3000;
      this.startMs = nowMs;
      const splits = this.splits.slice();
      this.splits = [];
      if (complete && this.lapDone) this.lapDone(lapTime, splits);
    }

    this.prevS = s;
  }
}

function crossed(a, b, target) {
  if (a === b) return false;
  // handle wrap-around: e.g. a=0.98, b=0.02 crosses 0
  if (a > b) {
    return target >= a || target <= b;
  }
  return target > a && target <= b;
}

export function medalForTime(ms, medals) {
  if (ms <= medals.gold) return 'gold';
  if (ms <= medals.silver) return 'silver';
  if (ms <= medals.bronze) return 'bronze';
  return null;
}
