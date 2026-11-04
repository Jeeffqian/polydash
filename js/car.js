// Arcade car physics with drift mechanics + low-poly car model.

import * as THREE from 'three';

const ACCEL = 24;            // m/s^2 engine acceleration
const BRAKE_DECEL = 34;
const REVERSE_ACCEL = 10;
const MAX_SPEED = 53;        // m/s (~190 km/h)
const BOOST_MAX = 62;
const DRAG = ACCEL / (MAX_SPEED * MAX_SPEED); // balances at MAX_SPEED
const ROLL_RESIST = 1.6;
const GRIP = 9.5;            // lateral velocity decay when gripping
const DRIFT_GRIP = 2.4;      // lateral decay while drifting
const STEER_RATE = 2.6;      // rad/s at full steer
const GRAVITY = 26;
const WALL_MARGIN = 0.9;

export class Car {
  constructor(color = 0xff5a3c) {
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.vf = 0;            // forward speed
    this.vl = 0;            // lateral speed (right positive)
    this.vy = 0;
    this.grounded = true;
    this.driftCharge = 0;
    this.drifting = false;
    this.steerVis = 0;
    this.wheelRoll = 0;
    this.buildMesh(color);
  }

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
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.36, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.38, 8);
    rimGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.9, flatShading: true });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8d0da, roughness: 0.25, metalness: 0.85, flatShading: true });
    this.wheels = [];
    const wheelPos = [
      [-0.96, 0.42, 1.52], [0.96, 0.42, 1.52],
      [-0.96, 0.42, -1.5], [0.96, 0.42, -1.5],
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

  placeAt(pos, yaw) {
    this.pos.copy(pos);
    this.pos.y += 0.05;
    this.yaw = yaw;
    this.vf = 0; this.vl = 0; this.vy = 0;
    this.driftCharge = 0;
    this.drifting = false;
    this.lastGy = this.pos.y;
    this.syncMesh(0);
  }

  forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  right() { return new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); }

  /**
   * @param dt      fixed timestep (s)
   * @param input   { throttle, brake, steer, drift }  steer: -1..1
   * @param track   TrackData for ground/wall queries
   */
  update(dt, input, track) {
    const speed = Math.abs(this.vf);

    // ---- drift state
    const wantDrift = input.drift && speed > 8 && this.grounded;
    if (wantDrift) {
      if (!this.drifting) this.drifting = true;
    } else if (this.drifting) {
      // drift ended → convert charge to boost
      if (this.driftCharge > 0.35) {
        this.vf = Math.min(this.vf + Math.min(this.driftCharge * 6, 13), BOOST_MAX);
      }
      this.driftCharge = 0;
      this.drifting = false;
    }

    // ---- steering
    const speedFactor = Math.min(speed / 14, 1) * (speed > 0.5 ? 1 : 0);
    const steerAuth = 1 - Math.min(Math.max(this.vf, 0) / 90, 0.45);
    let yawRate = input.steer * STEER_RATE * steerAuth * speedFactor;
    if (this.drifting) yawRate *= 1.35;
    if (!this.grounded) yawRate *= 0.25;
    if (this.vf < -0.5) yawRate = -yawRate; // reversing
    this.yaw += yawRate * dt;
    this.steerVis += (input.steer - this.steerVis) * Math.min(1, dt * 10);

    // ---- longitudinal forces
    if (input.throttle > 0) {
      const cap = this.drifting ? BOOST_MAX : MAX_SPEED;
      if (this.vf < cap) this.vf += ACCEL * input.throttle * dt;
    }
    if (input.brake > 0) {
      if (this.vf > 0.5) this.vf -= BRAKE_DECEL * input.brake * dt;
      else this.vf -= REVERSE_ACCEL * input.brake * dt;
    }
    // drag + rolling resistance
    this.vf -= Math.sign(this.vf) * DRAG * this.vf * this.vf * dt;
    if (Math.abs(this.vf) < ROLL_RESIST * dt) this.vf = 0;
    else this.vf -= Math.sign(this.vf) * ROLL_RESIST * dt;

    // ---- lateral grip
    const grip = this.drifting ? DRIFT_GRIP : GRIP;
    const decay = Math.exp(-grip * dt);
    // cornering injects lateral velocity (car turns, momentum lags behind)
    const latInject = yawRate * this.vf * dt;
    this.vl = this.vl * decay + latInject * 0.7;
    const vlCap = 20;
    this.vl = Math.max(-vlCap, Math.min(vlCap, this.vl));

    if (this.drifting) {
      this.driftCharge = Math.min(this.driftCharge + Math.abs(this.vl) * dt * 0.14, 2.2);
    }

    // ---- integrate world velocity
    const f = this.forward(), r = this.right();
    const vel = new THREE.Vector3()
      .addScaledVector(f, this.vf)
      .addScaledVector(r, this.vl);

    this.pos.addScaledVector(vel, dt);

    // ---- vertical / airborne (always integrate gravity; terrain pushes up)
    const info = track.lookup(this.pos.x, this.pos.z);
    const gy = info.groundY + 0.05;
    const slopeVy = (gy - this.lastGy) / dt;
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= gy) {
      this.pos.y = gy;
      this.grounded = true;
      // follow the slope on uphills, keep momentum over crests
      this.vy = Math.max(this.vy, Math.max(-30, Math.min(30, slopeVy)));
    } else {
      this.grounded = false;
    }
    this.lastGy = gy;

    // ---- wall collision
    const limit = track.halfW - WALL_MARGIN;
    if (Math.abs(info.lateral) > limit) {
      const sign = Math.sign(info.lateral);
      const push = Math.abs(info.lateral) - limit;
      this.pos.addScaledVector(info.right, -sign * push);
      // remove the velocity component pointing into the wall (track frame),
      // keep the along-wall component so the car slides, not grinds
      const vn = (vel.x * info.right.x + vel.z * info.right.z) * sign;
      if (vn > 0) {
        const tx = info.tangent.x, tz = info.tangent.z;
        const vt = vel.x * tx + vel.z * tz;
        this.vf = (vt * (f.x * tx + f.z * tz)) * 0.97;
        this.vl = (vt * (r.x * tx + r.z * tz)) * 0.97;
      }
      this.wallTime = (this.wallTime || 0) + dt;
      // stuck against the wall at low speed? gently recover onto the track
      if (this.wallTime > 0.8 && Math.abs(this.vf) < 6) {
        const tangentYaw = Math.atan2(info.tangent.x, info.tangent.z);
        const heading = f.x * info.tangent.x + f.z * info.tangent.z >= 0 ? tangentYaw : tangentYaw + Math.PI;
        let dYaw = heading - this.yaw;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        this.yaw += dYaw * Math.min(1, dt * 2.5);
        this.pos.addScaledVector(info.right, -sign * dt * 3);
        this.vf += dt * 4;
      }
    } else {
      this.wallTime = 0;
    }

    // ---- visuals
    this.syncMesh(dt);
  }

  syncMesh(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.yaw, 0);
    // lean into drift
    const lean = Math.max(-0.14, Math.min(0.14, -this.vl * 0.012));
    this.mesh.rotation.z = this.grounded ? lean : 0;
    this.mesh.rotation.x = this.grounded ? 0 : Math.max(-0.25, Math.min(0.25, -this.vy * 0.02));
    // wheels: steer + roll
    this.wheelRoll += this.vf * dt / 0.42;
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      if (i < 2) w.rotation.y = this.steerVis * 0.5;
      w.children[0].rotation.x = this.wheelRoll;
      w.children[1].rotation.x = this.wheelRoll;
    }
  }

  get kmh() { return Math.abs(this.vf) * 3.6; }
}
