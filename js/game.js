// Core game: renderer, scene, states (menu / countdown / racing / finished),
// camera, HUD updates, ghost rendering.

import * as THREE from 'three';
import { Car } from './car.js';
import { buildTrack, buildSceneEnvironment } from './tracks.js';
import { Timer } from './timing.js';
import { GhostRecorder, GhostPlayer } from './ghost.js';
import { formatTime, getBest, medalFor, MEDAL_ICON } from './ui.js';

const $ = (id) => document.getElementById(id);

export class Game {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.hooks = hooks; // { onEscape, onFinish }

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 4000);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.far = 400;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.trackGroup = null;
    this.track = null;
    this.theme = null;
    this.car = new Car(0xff5a3c);
    this.scene.add(this.car.mesh);

    this.ghostMesh = this.buildGhostMesh();
    this.ghostMesh.visible = false;
    this.scene.add(this.ghostMesh);

    this.timer = new Timer();
    this.recorder = new GhostRecorder();
    this.ghostPlayer = null;
    this.ghostEnabled = true;

    this.state = 'menu';
    this.raceTime = 0;
    this.countdownT = 0;
    this.lapCount = 0;
    this.accumulator = 0;

    this.input = { throttle: 0, brake: 0, steer: 0, drift: false };
    this.keys = {};

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.clock = new THREE.Clock();
    const loop = () => {
      this.tick();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  buildGhostMesh() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.45, depthWrite: false });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 4.2), mat);
    body.position.y = 0.6;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 2.0), mat);
    cabin.position.y = 1.15;
    g.add(body, cabin);
    return g;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ state flow

  startTrack(def) {
    // build first: if the definition is bad we keep the current world intact
    let built;
    try {
      built = buildTrack(def);
    } catch (err) {
      console.warn('[PolyDash] track rejected:', err.message);
      return false;
    }
    // clear previous track
    if (this.trackGroup) {
      this.scene.remove(this.trackGroup);
      this.trackGroup.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (m.map) m.map.dispose();
            m.dispose();
          }
        }
      });
    }
    this.track = built.track;
    this.trackGroup = built.group;
    this.theme = built.theme;
    this.scene.add(this.trackGroup);
    buildSceneEnvironment(this.scene, built.theme);

    this.hemi.color.set(this.theme.skyHorizon);
    this.hemi.groundColor.set(this.theme.ground);
    this.hemi.intensity = this.theme.hemiI;
    this.sun.color.set(this.theme.sun);
    this.sun.intensity = this.theme.sunI;
    this.sunPos = this.theme.sunPos;

    this.car.placeAt(this.track.startPos, this.track.startYaw);
    this.ghostPlayer = new GhostPlayer(this.track.id);
    this.ghostMesh.visible = false;
    this.recorder = new GhostRecorder();
    this.timer = new Timer();
    this.timer.lapDone = (lapTime, splits) => this.onLapDone(lapTime, splits);
    this.timer.cpHit = (idx, splitMs) => this.onCpHit(idx, splitMs);
    this.lapCount = 0;
    this.raceTime = 0;

    $('hud-track-name').textContent = this.track.name;
    const best = getBest(this.track.id);
    const medal = best != null ? medalFor(best, this.track.medals) : null;
    $('hud-best').textContent = best != null
      ? `best ${formatTime(best)} ${medal ? MEDAL_ICON[medal] : ''}`
      : 'no best time yet';

    this.state = 'countdown';
    this.countdownT = 3.2;
    return true;
  }

  restart() {
    if (!this.track) return;
    this.car.placeAt(this.track.startPos, this.track.startYaw);
    this.recorder = new GhostRecorder();
    this.timer = new Timer();
    this.timer.lapDone = (lapTime, splits) => this.onLapDone(lapTime, splits);
    this.timer.cpHit = (idx, splitMs) => this.onCpHit(idx, splitMs);
    this.ghostPlayer = new GhostPlayer(this.track.id);
    this.lapCount = 0;
    this.raceTime = 0;
    $('hud-splits').innerHTML = '';
    hideCenter();
    this.state = 'countdown';
    this.countdownT = 3.2;
  }

  quitToMenu() {
    this.state = 'menu';
    this.ghostMesh.visible = false;
    hideCenter();
    if (this.hooks.onEscape) this.hooks.onEscape();
  }

  onLapDone(lapTimeMs, splits) {
    if (this.state !== 'racing') return;
    this.state = 'finished';
    this.timer.stop();
    const saved = this.recorder.save(this.track.id, lapTimeMs);
    if (this.hooks.onFinish) {
      this.hooks.onFinish({
        trackId: this.track.id,
        timeMs: lapTimeMs,
        splits,
        medals: this.track.medals,
        ghostSaved: saved === 'saved',
      });
    }
  }

  onCpHit(idx, splitMs) {
    const el = $('hud-splits');
    const span = document.createElement('div');
    span.className = 'split-ok';
    span.textContent = `CP${idx + 1}  ${formatTime(splitMs)}`;
    el.appendChild(span);
  }

  // ------------------------------------------------------------ input

  onKey(e, down) {
    // never steal keys while the player is typing a name or a share code
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    this.keys[e.code] = down;
    if (down && e.code === 'KeyR' && (this.state === 'racing' || this.state === 'countdown' || this.state === 'finished')) {
      this.restart();
    }
    if (down && e.code === 'Escape') {
      if (this.state !== 'menu') this.quitToMenu();
    }
    if (down && e.code === 'KeyG') {
      this.ghostEnabled = !this.ghostEnabled;
      if (!this.ghostEnabled) this.ghostMesh.visible = false;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  }

  readInput() {
    const k = this.keys;
    const up = k['KeyW'] || k['ArrowUp'];
    const down = k['KeyS'] || k['ArrowDown'];
    this.input.throttle = up ? 1 : 0;
    this.input.brake = down ? 1 : 0;
    this.input.steer = (k['KeyA'] || k['ArrowLeft'] ? 1 : 0) + (k['KeyD'] || k['ArrowRight'] ? -1 : 0);
    this.input.drift = !!k['Space'];
  }

  // ------------------------------------------------------------ loop

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.state === 'countdown') {
      this.countdownT -= dt;
      const n = Math.ceil(this.countdownT);
      if (this.countdownT > 0) {
        showCenter(String(n), false);
      } else {
        showCenter('GO!', true);
        this.state = 'racing';
        this.timer.start(0);
        setTimeout(hideCenter, 700);
      }
      this.updateCamera(dt);
    } else if (this.state === 'racing') {
      this.raceTime += dt * 1000;
      this.readInput();
      // fixed-step physics
      this.accumulator += dt;
      const STEP = 1 / 60;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 5) {
        this.car.update(STEP, this.input, this.track);
        this.accumulator -= STEP;
        steps++;
      }
      const info = this.track.lookup(this.car.pos.x, this.car.pos.z);
      this.timer.update(info.s, this.raceTime);
      this.recorder.frame_tick(this.raceTime, this.car);
      this.updateGhost();
      this.updateHUD();
      this.updateCamera(dt);
    } else if (this.state === 'finished') {
      this.updateCamera(dt);
      // let the car coast
      this.readInput();
      this.input.throttle = 0;
      this.accumulator += dt;
      const STEP = 1 / 60;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 5) {
        this.car.update(STEP, this.input, this.track);
        this.accumulator -= STEP;
        steps++;
      }
    }
    // menu: slow orbit over track if one is loaded
    if (this.state === 'menu' && this.track) {
      const t = performance.now() * 0.0001;
      this.camera.position.set(
        this.track.startPos.x + Math.cos(t) * 60,
        this.track.startPos.y + 30,
        this.track.startPos.z + Math.sin(t) * 60
      );
      this.camera.lookAt(this.track.startPos.x, this.track.startPos.y + 2, this.track.startPos.z);
    }
  }

  updateGhost() {
    if (!this.ghostEnabled || !this.ghostPlayer || !this.ghostPlayer.available) {
      this.ghostMesh.visible = false;
      return;
    }
    const pose = this.ghostPlayer.sample(this.raceTime);
    if (!pose) { this.ghostMesh.visible = false; return; }
    this.ghostMesh.visible = true;
    this.ghostMesh.position.set(pose.x, pose.y, pose.z);
    this.ghostMesh.rotation.set(0, pose.yaw, 0);
  }

  updateHUD() {
    $('hud-timer').textContent = formatTime(this.raceTime);
    $('speed-value').textContent = Math.round(this.car.kmh);
    const pct = Math.min(100, (this.car.driftCharge / 2.2) * 100);
    $('drift-bar').style.width = `${this.car.drifting ? pct : 0}%`;
  }

  updateCamera(dt) {
    const f = this.car.forward();
    const target = new THREE.Vector3(
      this.car.pos.x - f.x * 9,
      this.car.pos.y + 4.2,
      this.car.pos.z - f.z * 9
    );
    const lerp = Math.min(1, dt * 4.5);
    this.camera.position.lerp(target, lerp);
    const look = new THREE.Vector3(
      this.car.pos.x + f.x * 6,
      this.car.pos.y + 1.2,
      this.car.pos.z + f.z * 6
    );
    this.camera.lookAt(look);
    // speed-based FOV
    const fov = 66 + Math.min(14, Math.max(0, this.car.vf - 25) * 0.5);
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
    this.camera.updateProjectionMatrix();
    // shadow follows the car
    if (this.sunPos) {
      this.sun.position.set(
        this.car.pos.x + this.sunPos[0] * 0.6,
        this.car.pos.y + this.sunPos[1] * 0.6,
        this.car.pos.z + this.sunPos[2] * 0.6
      );
      this.sun.target.position.copy(this.car.pos);
    }
  }
}

function showCenter(text, go) {
  const el = $('hud-center');
  el.textContent = text;
  el.classList.toggle('go', !!go);
  el.classList.remove('hidden');
}
function hideCenter() {
  $('hud-center').classList.add('hidden');
}
