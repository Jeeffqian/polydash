// Car: rigid-body physics on Rapier (ray-cast suspension vehicle) + low-poly model.
//
// The hand-rolled arcade integrator is gone. The chassis is a Rapier dynamic
// body, the four wheels are suspension ray-casts driven by Rapier's vehicle
// controller, and the track is real trimesh collision geometry (asphalt ribbon +
// barrier walls). Drift is modelled by dropping rear-wheel friction slip; the
// slide angle charges a boost that fires when you let go of SPACE.
//
// The public surface stays the same on purpose: pos / yaw / vf / vl / grounded /
// drifting / driftCharge / kmh / placeAt() / update() / mesh — so game.js,
// timing, ghost and the editor keep working untouched.

import * as THREE from 'three';
import { getRapier, initPhysics } from './physics.js';

const MASS = 900;                 // kg
const ACCEL = 24;                 // m/s^2 at full throttle (force = MASS*ACCEL)
const BRAKE_DECEL = 34;
const REVERSE_ACCEL = 10;
const MAX_SPEED = 53;             // m/s (~190 km/h)
const BOOST_MAX = 64;
const DRAG = ACCEL / (MAX_SPEED * MAX_SPEED); // balances at MAX_SPEED
const ROLL_RESIST = 1.6;
const GRAVITY = 26;
const STEER_RATE = 2.6;           // target yaw rate, rad/s
const WHEELBASE = 3.02;
const LAT_ACC_LIMIT = 26;         // m/s^2, caps the yaw rate at speed
const MAX_STEER = 0.62;           // rad, hard clamp on the wheel angle

// suspension geometry (chassis-local, origin at ground level under the car)
const WHEEL_RADIUS = 0.42;
const SUSP_REST = 0.3;
const CONN_Y = WHEEL_RADIUS + SUSP_REST; // 0.72
const COLLIDER_Y = 0.72;
const COLLIDER_HY = 0.38;
const WHEEL_POS = [
  [-0.96, CONN_Y, 1.51],   // front left
  [0.96, CONN_Y, 1.51],    // front right
  [-0.96, CONN_Y, -1.51],  // rear left
  [0.96, CONN_Y, -1.51],   // rear right
];

// tyre grip: gripping vs sliding
const GRIP_FRONT = 30;
const GRIP_REAR = 30;
const DRIFT_FRONT = 11;
const DRIFT_REAR = 1.6;

const WALL_H = 2.4;

export class Car {
  constructor(color = 0xff5a3c) {
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.vf = 0;
    this.vl = 0;
    this.vy = 0;
    this.grounded = true;
    this.driftCharge = 0;
    this.drifting = false;
    this.steerVis = 0;
    this.wheelRoll = 0;

    this.boostTimer = 0;
    this.boostPower = 0;
    this.wallTime = 0;
    this.flipTime = 0;
    this.trackRef = null;
    this.trackColliders = [];
    this.placed = { pos: new THREE.Vector3(), yaw: 0 };

    this.buildMesh(color);
    this.buildPhysics();
  }

  // ------------------------------------------------------------ model

  buildMesh(color) {
    const g = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.35, flatShading: true });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x141821, roughness: 0.55, metalness: 0.2, flatShading: true });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x18232e, roughness: 0.12, metalness: 0.65 });

    // sculpted body: low wedge with raked nose, extruded side profile
    const body = new THREE.Shape();
    body.moveTo(-2.35, 0.16);   // rear bottom
    body.lineTo(-2.44, 0.62);   // rear face (kammback)
    body.lineTo(-2.05, 0.8);    // small rear deck
    body.lineTo(0.7, 0.84);     // flat waistline
    body.lineTo(2.02, 0.62);    // hood slope
    body.lineTo(2.46, 0.46);    // nose tip
    body.lineTo(2.4, 0.18);     // front bottom
    body.closePath();
    const bodyGeo = new THREE.ExtrudeGeometry(body, {
      depth: 1.78, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.09, bevelSegments: 2, steps: 1,
    });
    bodyGeo.translate(0, 0, -0.89);
    bodyGeo.rotateY(-Math.PI / 2); // nose now points +Z (car forward)
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.castShadow = true;
    g.add(bodyMesh);

    // glass canopy sitting on the waistline
    const canopy = new THREE.Shape();
    canopy.moveTo(-1.5, 0.8);
    canopy.lineTo(-1.05, 1.24);
    canopy.lineTo(0.35, 1.28);
    canopy.lineTo(1.0, 0.8);
    canopy.closePath();
    const canopyGeo = new THREE.ExtrudeGeometry(canopy, {
      depth: 1.34, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1, steps: 1,
    });
    canopyGeo.translate(0, 0, -0.67);
    canopyGeo.rotateY(-Math.PI / 2);
    const canopyMesh = new THREE.Mesh(canopyGeo, glassMat);
    canopyMesh.castShadow = true;
    g.add(canopyMesh);

    // front splitter + side skirts
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.1, 0.5), darkMat);
    splitter.position.set(0, 0.16, 2.42);
    const skirtL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 2.6), darkMat);
    skirtL.position.set(-0.97, 0.2, 0);
    const skirtR = skirtL.clone();
    skirtR.position.x = 0.97;
    g.add(splitter, skirtL, skirtR);

    // rear wing on struts
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.09, 0.5), darkMat);
    wing.position.set(0, 1.18, -2.2);
    wing.rotation.x = 0.12;
    for (const sx of [-0.72, 0.72]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.3), darkMat);
      strut.position.set(sx, 0.95, -2.18);
      g.add(strut);
    }
    g.add(wing);

    // headlights + taillight bar
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff4c0 });
    const tlMat = new THREE.MeshBasicMaterial({ color: 0xff2828 });
    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.08), hlMat);
      hl.position.set(sx * 0.62, 0.44, 2.52);
      g.add(hl);
    }
    const tl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.06), tlMat);
    tl.position.set(0, 0.72, -2.52);
    g.add(tl);
    // exhausts
    for (const sx of [-0.45, 0.45]) {
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 8), darkMat);
      ex.rotation.x = Math.PI / 2;
      ex.position.set(sx, 0.28, -2.55);
      g.add(ex);
    }

    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });

    // wheels
    const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.36, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.38, 8);
    rimGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.9, flatShading: true });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8d0da, roughness: 0.25, metalness: 0.85, flatShading: true });
    this.wheels = [];
    const wheelPos = [
      [-0.96, WHEEL_RADIUS, 1.51], [0.96, WHEEL_RADIUS, 1.51],
      [-0.96, WHEEL_RADIUS, -1.51], [0.96, WHEEL_RADIUS, -1.51],
    ];
    for (const [x, y, z] of wheelPos) {
      const hub = new THREE.Group();
      hub.position.set(x, y, z);
      hub.add(new THREE.Mesh(wheelGeo, tireMat), new THREE.Mesh(rimGeo, rimMat));
      g.add(hub);
      this.wheels.push(hub);
    }

    this.mesh = g;
  }

  // ------------------------------------------------------------ physics setup

  buildPhysics() {
    const RAPIER = getRapier();
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.integrationParameters.dt = 1 / 60;

    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 3, 0)
        .setLinearDamping(0.02)
        .setAngularDamping(0.4)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );

    // chassis shell: sits COLLIDER_Y above the body origin (origin = ground plate)
    const vol = (2 * 0.95) * (2 * COLLIDER_HY) * (2 * 2.2);
    this.chassisCollider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.95, COLLIDER_HY, 2.2)
        .setTranslation(0, COLLIDER_Y, 0)
        .setDensity(MASS / vol)
        .setFriction(0.4)
        .setRestitution(0.05),
      this.body,
    );

    this.vehicle = this.world.createVehicleController(this.body);
    for (const [x, y, z] of WHEEL_POS) {
      // connection point, suspension direction (down), axle (sideways), rest
      // length, wheel radius — all in the chassis frame. The axle points -X so
      // the rolling direction (axle × suspension) is +Z, matching the model's
      // nose, which is what forward() reports.
      this.vehicle.addWheel(
        { x, y, z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        SUSP_REST,
        WHEEL_RADIUS,
      );
    }
    for (let i = 0; i < this.vehicle.numWheels(); i++) {
      this.vehicle.setWheelSuspensionStiffness(i, 120);
      this.vehicle.setWheelSuspensionCompression(i, 4.4);
      this.vehicle.setWheelSuspensionRelaxation(i, 5.6);
      this.vehicle.setWheelMaxSuspensionTravel(i, 0.4);
      this.vehicle.setWheelMaxSuspensionForce(i, 60000);
      this.vehicle.setWheelFrictionSlip(i, GRIP_FRONT);
      this.vehicle.setWheelSideFrictionStiffness(i, 1.0);
    }
  }

  /** Build (or rebuild) the trimesh road + barrier colliders for a track. */
  setTrack(track) {
    if (!track || this.trackRef === track) return;
    const RAPIER = getRapier();
    this.trackRef = track;

    for (const c of this.trackColliders) this.world.removeCollider(c, false);
    this.trackColliders = [];

    const S = track.samples;
    const N = track.N;
    const hw = track.halfW;

    // ---- road ribbon: two triangles per segment, both windings so a wheel ray
    //      or the chassis can never slip through the surface
    const roadVerts = new Float32Array(N * 2 * 3);
    for (let i = 0; i < N; i++) {
      const p = S[i].p, r = S[i].right;
      roadVerts[i * 6 + 0] = p.x - r.x * hw;
      roadVerts[i * 6 + 1] = p.y + 0.02;
      roadVerts[i * 6 + 2] = p.z - r.z * hw;
      roadVerts[i * 6 + 3] = p.x + r.x * hw;
      roadVerts[i * 6 + 4] = p.y + 0.02;
      roadVerts[i * 6 + 5] = p.z + r.z * hw;
    }
    const roadIdx = [];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = i * 2, b = i * 2 + 1, c = j * 2, d = j * 2 + 1;
      roadIdx.push(a, b, c, b, d, c);
      roadIdx.push(a, c, b, b, c, d);
    }
    this.trackColliders.push(this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(roadVerts, new Uint32Array(roadIdx))
        .setFriction(0.95)
        .setRestitution(0),
    ));

    // ---- barrier walls: vertical strip on each side, just inside the paint
    for (const side of [-1, 1]) {
      const wallVerts = new Float32Array(N * 2 * 3);
      for (let i = 0; i < N; i++) {
        const p = S[i].p, r = S[i].right;
        const off = side * (hw - 0.08);
        wallVerts[i * 6 + 0] = p.x + r.x * off;
        wallVerts[i * 6 + 1] = p.y - 0.4;
        wallVerts[i * 6 + 2] = p.z + r.z * off;
        wallVerts[i * 6 + 3] = p.x + r.x * off;
        wallVerts[i * 6 + 4] = p.y + WALL_H;
        wallVerts[i * 6 + 5] = p.z + r.z * off;
      }
      const idx = [];
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const a = i * 2, b = i * 2 + 1, c = j * 2, d = j * 2 + 1;
        idx.push(a, b, c, b, d, c);
        idx.push(a, c, b, b, c, d);
      }
      this.trackColliders.push(this.world.createCollider(
        RAPIER.ColliderDesc.trimesh(wallVerts, new Uint32Array(idx))
          .setFriction(0.12)
          .setRestitution(0.05),
      ));
    }
  }

  placeAt(pos, yaw) {
    this.placed.pos.copy(pos);
    this.placed.yaw = yaw;
    this.teleport(pos, yaw);
    this.vf = 0; this.vl = 0; this.vy = 0;
    this.driftCharge = 0;
    this.drifting = false;
    this.boostTimer = 0;
    this.wallTime = 0;
    this.flipTime = 0;
    this.syncMesh(0);
  }

  teleport(pos, yaw) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.body.setTranslation({ x: pos.x, y: pos.y + 0.25, z: pos.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.yaw = yaw;
    this.pos.copy(pos);
    this.mesh.position.copy(pos);
  }

  forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  right() { return new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); }

  // ------------------------------------------------------------ per-step update

  /**
   * @param dt      fixed timestep (s)
   * @param input   { throttle, brake, steer, drift }  steer: -1..1
   * @param track   TrackData for collision geometry + recovery queries
   */
  update(dt, input, track) {
    this.setTrack(track);
    const veh = this.vehicle;
    const body = this.body;

    const speed = Math.abs(this.vf);
    const grounded = this.isGrounded();

    // ---- drift state machine (same rules as before)
    const wantDrift = input.drift && speed > 8 && grounded;
    if (wantDrift) {
      if (!this.drifting) this.drifting = true;
    } else if (this.drifting) {
      if (this.driftCharge > 0.35) {
        this.boostTimer = 0.65 + this.driftCharge * 0.35;
        this.boostPower = 5.5 + this.driftCharge * 3.2;
      }
      this.driftCharge = 0;
      this.drifting = false;
    }

    // ---- steering: turn the desired yaw rate into a wheel angle, so the car
    //      keeps the old arcade turn-in instead of spinning once it is quick
    const speedFactor = Math.min(speed / 14, 1) * (speed > 0.5 ? 1 : 0);
    const steerAuth = 1 - Math.min(Math.max(this.vf, 0) / 90, 0.45);
    let yawRate = input.steer * STEER_RATE * steerAuth * speedFactor;
    if (this.drifting) yawRate *= 1.35;
    if (this.vf < -0.5) yawRate = -yawRate;
    // don't let the nose pivot faster than the tyres could ever hold: this is
    // what stops full lock at 80 km/h from spinning the car on the spot
    const maxYaw = LAT_ACC_LIMIT / Math.max(Math.abs(this.vf), 4);
    yawRate = Math.max(-maxYaw, Math.min(maxYaw, yawRate));
    let steerAngle = Math.atan((yawRate * WHEELBASE) / Math.max(Math.abs(this.vf), 4));
    steerAngle = Math.max(-MAX_STEER, Math.min(MAX_STEER, steerAngle));
    this.steerVis += (input.steer - this.steerVis) * Math.min(1, dt * 10);

    const gripFront = this.drifting ? DRIFT_FRONT : GRIP_FRONT;
    const gripRear = this.drifting ? DRIFT_REAR : GRIP_REAR;

    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      veh.setWheelFrictionSlip(i, front ? gripFront : gripRear);
      veh.setWheelSideFrictionStiffness(i, this.drifting ? (front ? 0.55 : 0.18) : 1.0);
      veh.setWheelSteering(i, front ? steerAngle : 0);
      veh.setWheelBrake(i, 0);
      veh.setWheelEngineForce(i, 0);
    }

    // ---- longitudinal forces
    const cap = this.drifting ? BOOST_MAX : MAX_SPEED;
    let driveForce = 0;
    if (input.throttle > 0 && this.vf < cap) driveForce += MASS * ACCEL * input.throttle;
    if (this.boostTimer > 0) {
      driveForce += MASS * this.boostPower;
      this.boostTimer = Math.max(0, this.boostTimer - dt);
    }
    if (input.brake > 0 && this.vf > 0.6) {
      const brakeF = (MASS * BRAKE_DECEL * input.brake) / 4;
      for (let i = 0; i < 4; i++) veh.setWheelBrake(i, brakeF);
      driveForce = 0;
    } else if (input.brake > 0 && Math.abs(this.vf) < MAX_SPEED * 0.35) {
      driveForce -= MASS * REVERSE_ACCEL * input.brake;
    }
    const perWheel = driveForce / 4;
    for (let i = 0; i < 4; i++) veh.setWheelEngineForce(i, perWheel);

    // ---- aerodynamic drag + rolling resistance. Rapier keeps accumulated
    //      forces between steps, so clear the previous frame's first.
    body.resetForces(true);
    body.resetTorques(true);
    const f = this.forward();
    const lv = body.linvel();
    const along = lv.x * f.x + lv.z * f.z;
    const dragF = -DRAG * Math.abs(along) * along * MASS;
    const rollF = Math.abs(along) > 0.2 ? -Math.sign(along) * ROLL_RESIST * MASS : 0;
    body.addForce({ x: f.x * (dragF + rollF), y: 0, z: f.z * (dragF + rollF) }, true);

    // ---- drift assist: a little yaw torque so the tail actually steps out
    if (this.drifting && Math.abs(this.vf) > 4) {
      const assist = 1.9 * MASS * input.steer * Math.min(1, speed / 20);
      body.addTorque({ x: 0, y: assist, z: 0 }, true);
    }

    // ---- yaw-rate servo: the tyres alone make the car push wide, so drive the
    //      heading toward the requested yaw rate with a torque. Keeps the
    //      collision/suspension behaviour physical but the steering arcade.
    const ang = body.angvel();
    const err = yawRate - ang.y;
    const I_Y = 1700;                       // kg m^2, box-ish estimate
    // while drifting the tail is supposed to break away, so only nudge the
    // heading instead of rail-tracking it
    const servoGain = this.drifting ? 1.4 : 7;
    const maxT = I_Y * (this.drifting ? 3 : 11);
    const servoT = Math.max(-maxT, Math.min(maxT, err * I_Y * servoGain));
    body.addTorque({ x: 0, y: servoT, z: 0 }, true);

    // ---- step: controller casts the rays and pushes the chassis, then the
    //      solver integrates one fixed step
    this.world.integrationParameters.dt = dt;
    veh.updateVehicle(dt, getRapier().QueryFilterFlags.EXCLUDE_DYNAMIC);
    this.world.step();

    // ---- read the body back into the scalar state the rest of the game uses
    const t = body.translation();
    const q = body.rotation();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    this.yaw = Math.atan2(fwd.x, fwd.z);
    this.pos.set(t.x, t.y, t.z);

    const v = body.linvel();
    const f2 = this.forward(), r2 = this.right();
    this.vf = v.x * f2.x + v.z * f2.z;
    this.vl = v.x * r2.x + v.z * r2.z;
    this.vy = v.y;
    this.grounded = this.isGrounded();

    if (this.drifting) {
      this.driftCharge = Math.min(this.driftCharge + Math.abs(this.vl) * dt * 0.14, 2.2);
    }

    this.recover(dt, track, input);
    this.syncMesh(dt);
  }

  isGrounded() {
    const veh = this.vehicle;
    for (let i = 0; i < 4; i++) if (veh.wheelIsInContact(i)) return true;
    return false;
  }

  /** Unstick the car: pinned against a barrier, flipped over, or fallen off. */
  recover(dt, track, input = { throttle: 0 }) {
    if (!track) return;
    const info = track.lookup(this.pos.x, this.pos.z);
    const q = this.body.rotation();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));

    if (up.y < 0.25) this.flipTime += dt; else this.flipTime = 0;

    // anything that keeps the car from making progress under power: a barrier
    // it is pinned against, a bad angle after a crash, a wheel off the kerb
    const pinnedWall = Math.abs(info.lateral) > track.halfW - 1.6;
    const creeping = input.throttle > 0 && Math.abs(this.vf) < 2.5;
    if ((pinnedWall && Math.abs(this.vf) < 7) || creeping) this.wallTime += dt;
    else this.wallTime = 0;

    // on the roof: stand it back up, keeping the heading
    if (this.flipTime > 2.0) {
      this.teleport(new THREE.Vector3(this.pos.x, this.pos.y + 1.1, this.pos.z), this.yaw);
      this.flipTime = 0;
      return;
    }

    // stuck: aim along the track and push back into it
    if (this.wallTime > 0.9) {
      const sign = Math.sign(info.lateral) || 1;
      const tangentYaw = Math.atan2(info.tangent.x, info.tangent.z);
      const heading = this.forward().dot(info.tangent) >= 0 ? tangentYaw : tangentYaw + Math.PI;
      let dYaw = heading - this.yaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      this.yaw += dYaw * Math.min(1, dt * 3.5);
      const rq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      this.body.setRotation({ x: rq.x, y: rq.y, z: rq.z, w: rq.w }, true);
      const push = 22000 * dt;
      this.body.applyImpulse(
        {
          x: -info.right.x * sign * push + info.tangent.x * push,
          y: 0,
          z: -info.right.z * sign * push + info.tangent.z * push,
        },
        true,
      );
    }

    // fell through the world: put it back on the road pointing down-track
    if (this.pos.y < info.groundY - 30) {
      const yaw = Math.atan2(info.tangent.x, info.tangent.z);
      this.teleport(new THREE.Vector3(this.pos.x, info.groundY + 1.2, this.pos.z), yaw);
    }
  }

  syncMesh(dt) {
    this.mesh.position.copy(this.pos);
    const q = this.body.rotation();
    this.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    // wheels: steer + roll
    this.wheelRoll += this.vf * dt / WHEEL_RADIUS;
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      if (i < 2) w.rotation.y = this.steerVis * 0.5;
      w.children[0].rotation.x = this.wheelRoll;
      w.children[1].rotation.x = this.wheelRoll;
    }
  }

  get kmh() { return Math.abs(this.vf) * 3.6; }
}

export { initPhysics };
