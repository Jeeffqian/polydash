// Lap timing: checkpoint splits, lap completion, medal rating.
//
// A lap is counted from *forward progress along the centreline*, not from
// "something crossed s = 0". The old rule fired whenever the projection jumped
// over the seam in either direction, so spinning on the last corner, reversing
// over the line, or just jittering while parked at the start could end the run.
// Now every update adds its signed progress (shortest way round the loop) to a
// counter, and the lap only completes once the counter actually reaches a full
// lap and all three checkpoints have been collected in order.

const CP_FRACTIONS = [0.25, 0.5, 0.75];
const LAP_PROGRESS = 0.995;   // allow a hair under 1.0 for projection noise
const MAX_STEP = 0.12;        // bigger jumps are teleports / projection snaps
const MIN_LAP_MS = 1200;

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
    this.prevS = null;       // last normalized progress
    this.progress = 0;       // signed distance travelled this lap, in laps
    this.lapDone = null;     // callback(lapTimeMs, splits)
    this.cpHit = null;       // callback(index, splitMs)
  }

  start(nowMs) {
    this.running = true;
    this.startMs = nowMs;
    this.lastMs = nowMs;
    this.splits = [];
    this.prevS = null;
    this.progress = 0;
  }

  stop() {
    this.running = false;
  }

  /**
   * @param s       normalized progress 0..1 from TrackData.lookup
   * @param nowMs   race clock (ms)
   * @param speed   optional |forward speed| in m/s — when given, jitter while
   *                parked is ignored so a car sitting on the line cannot creep
   *                its progress counter forward
   */
  update(s, nowMs, speed) {
    if (!this.running) { this.prevS = s; return; }
    this.lastMs = nowMs;

    if (this.prevS == null) { this.prevS = s; return; }

    // shortest signed step around the loop
    let ds = s - this.prevS;
    if (ds > 0.5) ds -= 1;
    else if (ds < -0.5) ds += 1;
    this.prevS = s;

    // a teleport (recover / respawn) or a projection snap is not real progress
    if (Math.abs(ds) > MAX_STEP) ds = 0;

    const moving = speed === undefined || speed > 1.0;
    if (!moving) ds = 0;

    this.progress += ds;
    // reversing makes the distance up again (with a third of a lap of grace so
    // a shunt backwards at the start does not ruin the run)
    if (this.progress < -0.35) this.progress = -0.35;

    // checkpoints unlock in order, on real forward distance
    while (this.splits.length < CP_FRACTIONS.length
           && this.progress >= CP_FRACTIONS[this.splits.length]) {
      const split = nowMs - this.startMs;
      this.splits.push(split);
      if (this.cpHit) this.cpHit(this.splits.length - 1, split);
    }

    // lap closes on a full, forward lap with every checkpoint collected
    if (this.progress >= LAP_PROGRESS && this.splits.length >= CP_FRACTIONS.length) {
      const lapTime = nowMs - this.startMs;
      if (lapTime >= MIN_LAP_MS) {
        const splits = this.splits.slice();
        this.startMs = nowMs;
        this.splits = [];
        this.progress -= 1;
        if (this.lapDone) this.lapDone(lapTime, splits);
      } else {
        // impossible-fast: keep the clock honest, ignore the crossing
        this.progress = Math.min(this.progress, LAP_PROGRESS);
      }
    }
  }
}

export function medalForTime(ms, medals) {
  if (ms <= medals.gold) return 'gold';
  if (ms <= medals.silver) return 'silver';
  if (ms <= medals.bronze) return 'bronze';
  return null;
}
