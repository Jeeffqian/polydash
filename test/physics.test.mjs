// Physics integration test: drive a full lap headlessly with a simple AI driver.
import * as THREE from 'three';
import { Car, initPhysics } from '../js/car.js';
import { TrackData } from '../js/tracks.js';
import { TRACKS } from '../js/tracks.js';

// Rapier is a wasm module — bring the backend up before building any car body.
await initPhysics();

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ok  ${name}`);
  else { console.error(`FAIL  ${name} ${extra}`); failures++; }
}

const STEP = 1 / 60;

function driveLap(def, { useDrift = false, maxSeconds = 120 } = {}) {
  const track = new TrackData(def);
  const car = new Car(def.id === 'neon' ? 0x4da6ff : 0xff5a3c);
  car.placeAt(track.startPos, track.startYaw);
  let s = 0, prevS = 0, t = 0, laps = 0, maxLateral = 0, topSpeed = 0;
  let sawDrift = false, sawAir = false;
  while (t < maxSeconds * 1000 && laps === 0) {
    const info = track.lookup(car.pos.x, car.pos.z);
    s = info.s;
    // simple AI: aim at a point ahead on the centerline; short lookahead at
    // low speed so the car always pulls back toward the centerline
    const look = 10 + Math.round(35 * Math.min(1, Math.abs(car.vf) / 45));
    const ahead = track.samples[(info.index + look) % track.N].p;
    const dx = ahead.x - car.pos.x, dz = ahead.z - car.pos.z;
    const desiredYaw = Math.atan2(dx, dz);
    let dYaw = desiredYaw - car.yaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, dYaw * 2.5));
    const drift = useDrift && Math.abs(dYaw) > 0.35 && Math.abs(car.vf) > 12;
    if (drift) sawDrift = true;
    car.update(STEP, { throttle: 1, brake: 0, steer, drift }, track);
    maxLateral = Math.max(maxLateral, Math.abs(track.lookup(car.pos.x, car.pos.z).lateral));
    topSpeed = Math.max(topSpeed, car.vf);
    if (!car.grounded) sawAir = true;
    if (!Number.isFinite(car.pos.x + car.pos.y + car.pos.z + car.vf)) {
      return { nan: true, t };
    }
    // lap wrap detection (same rule as Timer)
    if (prevS > 0.5 && s < 0.5 && t > 5000) laps++;
    prevS = s;
    t += STEP * 1000;
  }
  return { laps, maxLateral, topSpeed, t, sawDrift, sawAir, nan: false };
}

for (const def of TRACKS) {
  const r = driveLap(def);
  check(`${def.id}: completes a lap in <120s (${(r.t / 1000).toFixed(1)}s)`, r.laps >= 1 && !r.nan);
  check(`${def.id}: no NaN`, !r.nan);
  check(`${def.id}: stays near road (max |lateral| ${r.maxLateral.toFixed(1)} < ${def.width / 2 + 2})`,
    r.maxLateral < def.width / 2 + 2);
  check(`${def.id}: reaches high speed (${Math.round(r.topSpeed * 3.6)} km/h)`, r.topSpeed > 35);
  if (r.nan) console.error(`   NaN at t=${r.t}ms`);
}

// drift behaviour: grip lower while drifting
{
  const track = new TrackData(TRACKS[0]);
  const STRAIGHT = 60, TURN = 25;
  // two identical cars: 1s straight, then full steer — one drifting, one gripping
  const carA = new Car(); carA.placeAt(track.startPos, track.startYaw);
  const carB = new Car(); carB.placeAt(track.startPos, track.startYaw);
  for (let i = 0; i < STRAIGHT; i++) {
    carA.update(STEP, { throttle: 1, brake: 0, steer: 0, drift: false }, track);
    carB.update(STEP, { throttle: 1, brake: 0, steer: 0, drift: false }, track);
  }
  const v0 = carA.vf;
  for (let i = 0; i < TURN; i++) {
    carA.update(STEP, { throttle: 1, brake: 0, steer: 1, drift: true }, track);
    carB.update(STEP, { throttle: 1, brake: 0, steer: 1, drift: false }, track);
  }
  check(`drift: drifting slides more (vl ${carA.vl.toFixed(1)} vs ${carB.vl.toFixed(1)})`,
    Math.abs(carA.vl) > Math.abs(carB.vl) * 1.5);
  check(`drift: boost charged while drifting (charge ${carA.driftCharge.toFixed(2)})`, carA.driftCharge > 0.05);
  check(`speed: straight-line speed sane (${v0.toFixed(1)} m/s)`, v0 > 15 && v0 < 60);
}

// custom track built in the editor: same smoothing/geometry pipeline as the game
{
  const pts = [
    { x: -100, z: 70 }, { x: 0, z: 110 }, { x: 100, z: 60 },
    { x: 110, z: -50 }, { x: 10, z: -100 }, { x: -90, z: -50 },
  ];
  const def = {
    id: 'custom_test', name: 'Custom Track', theme: 'meadow', width: 12,
    points: pts.map(p => [p.x, 0, p.z]),
  };
  const track = new TrackData(def);
  check(`custom: loop has real length (${Math.round(track.length)} m)`,
    Number.isFinite(track.length) && track.length > 100);
  check('custom: start position is finite',
    Number.isFinite(track.startPos.x) && Number.isFinite(track.startPos.z));
  const r = driveLap(def, { maxSeconds: 180 });
  check(`custom: completes a lap in <180s (${(r.t / 1000).toFixed(1)}s)`, r.laps >= 1 && !r.nan);
  check(`custom: no NaN`, !r.nan);
  check(`custom: stays on the road (max |lateral| ${r.maxLateral.toFixed(1)})`,
    r.maxLateral < def.width / 2 + 2);
}

console.log(failures === 0 ? '\nALL PHYSICS TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
