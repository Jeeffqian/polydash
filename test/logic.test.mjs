// Logic smoke tests for PolyDash (run with: node test/logic.test.mjs)
import { TrackData, TRACKS } from '../js/tracks.js';
import { Timer } from '../js/timing.js';
import { GhostRecorder, GhostPlayer } from '../js/ghost.js';

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ok  ${name}`);
  else { console.error(`FAIL  ${name} ${extra}`); failures++; }
}

// ---- TrackData
for (const def of TRACKS) {
  const t = new TrackData(def);
  check(`${def.id}: length sane (${Math.round(t.length)}m)`, t.length > 300 && t.length < 4000);
  check(`${def.id}: samples count`, t.samples.length === 480);
  // start lookup should be on the centerline
  const p = t.startPos;
  const info = t.lookup(p.x, p.z);
  check(`${def.id}: start lookup lateral≈0 (${info.lateral.toFixed(3)})`, Math.abs(info.lateral) < 0.5);
  check(`${def.id}: start lookup s≈0 (${info.s.toFixed(4)})`, info.s < 0.02 || info.s > 0.98);
  check(`${def.id}: groundY≈startY (${info.groundY.toFixed(2)} vs ${p.y.toFixed(2)})`, Math.abs(info.groundY - p.y) < 1.0);
  // mid-track lookup
  const mid = t.samples[240].p;
  const mi = t.lookup(mid.x, mid.z);
  check(`${def.id}: mid lookup s≈0.5 (${mi.s.toFixed(4)})`, Math.abs(mi.s - 0.5) < 0.02);
  check(`${def.id}: mid lateral≈0 (${mi.lateral.toFixed(3)})`, Math.abs(mi.lateral) < 0.5);
  // far away point: large lateral
  const far = t.lookup(mid.x + 500, mid.z + 500);
  check(`${def.id}: far lateral large (${Math.abs(far.lateral).toFixed(1)})`, Math.abs(far.lateral) > 100);
  // medals ordered
  check(`${def.id}: medals ordered`, t.medals.gold < t.medals.silver && t.medals.silver < t.medals.bronze);
}

// ---- Timer: progress + checkpoints + lap wrap
{
  const timer = new Timer();
  let laps = 0, cps = 0, lastLap = 0;
  timer.lapDone = (t) => { laps++; lastLap = t; };
  timer.cpHit = () => { cps++; };
  timer.start(0);
  // simulate two laps over 10s each: s wraps 0→1→0→1
  const N = 200;
  for (let i = 1; i <= N * 2; i++) {
    const s = (i % N) / N;
    timer.update(s, i * 50); // 50ms per step → 10s lap
  }
  check('timer: 6 checkpoints hit over 2 laps', cps === 6, `got ${cps}`);
  check('timer: 2 laps complete on wrap', laps === 2, `got ${laps}`);
  check('timer: lap time ≈ 10000ms', Math.abs(lastLap - 10000) < 60, `got ${lastLap}`);
  check('timer: splits reset after lap', timer.splits.length === 0);
}

// ---- Timer: a lap must be driven forward, all the way round
{
  // 1) drive to 80% then reverse back over the start line: no lap
  const timer = new Timer();
  let laps = 0;
  timer.lapDone = () => laps++;
  timer.start(0);
  const step = 0.8 / 100;
  let t = 0;
  for (let i = 1; i <= 100; i++) { timer.update(step * i, t += 100, 20); }
  for (let i = 99; i >= 0; i--) { timer.update(step * i, t += 100, 20); }
  check('timer: reversing over the line does not finish', laps === 0, `laps=${laps}`);
  check('timer: reversing does not lose checkpoints', timer.splits.length === 3, `cps=${timer.splits.length}`);

  // 2) parked on the start line jittering across the seam: no lap
  const idle = new Timer();
  let idleLaps = 0, idleCps = 0;
  idle.lapDone = () => idleLaps++;
  idle.cpHit = () => idleCps++;
  idle.start(0);
  for (let i = 0; i < 600; i++) {
    idle.update(i % 2 ? 0.999 : 0.001, i * 16, 0);
  }
  check('timer: parked jitter cannot finish a lap', idleLaps === 0, `laps=${idleLaps}`);
  check('timer: parked jitter cannot collect checkpoints', idleCps === 0, `cps=${idleCps}`);

  // 3) a forward full lap still finishes
  const good = new Timer();
  let goodLaps = 0;
  good.lapDone = () => goodLaps++;
  good.start(0);
  for (let i = 1; i <= 200; i++) good.update((i % 200) / 200, i * 60, 25);
  check('timer: a real forward lap still counts', goodLaps === 1, `laps=${goodLaps}`);
}

// ---- Ghost record & replay
{
  // stub localStorage
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  const rec = new GhostRecorder();
  const fakeCar = { pos: { x: 1, y: 0, z: 2 }, yaw: 0.5 };
  for (let f = 0; f < 600; f++) rec.frame_tick(f * 16.7, fakeCar);
  const res1 = rec.save('test_track', 10000);
  check('ghost: first save', res1 === 'saved');
  const res2 = rec.save('test_track', 12000); // slower → kept
  check('ghost: slower run kept', res2 === 'kept');
  const res3 = rec.save('test_track', 9000); // faster → saved
  check('ghost: faster run saved', res3 === 'saved');
  const gp = new GhostPlayer('test_track');
  check('ghost: player has data', gp.available);
  const p0 = gp.sample(0);
  check('ghost: sample at t=0', p0 && p0.x === 1 && p0.z === 2);
  const pm = gp.sample(5000);
  check('ghost: mid sample interpolates', pm && Math.abs(pm.x - 1) < 0.01);
  const pend = gp.sample(99999);
  check('ghost: after finish → null', pend === null);
}

console.log(failures === 0 ? '\nALL LOGIC TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
