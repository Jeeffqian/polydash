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
