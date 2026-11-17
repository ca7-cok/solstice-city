// Mara Voss on foot: a blocky third-person character, walk/sprint/jump,
// and the third-person camera that follows her (or the car she drives).
import * as THREE from 'three';
import { clamp, angleLerp, collideCircleBox } from './util.js';
import { WORLD } from './city.js';

export function makePlayerMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a077 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b3242 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), skin);
  head.position.y = 1.62;
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5), hair);
  hairTop.position.y = 1.9;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), shirt);
  torso.position.y = 1.05;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), pants);
  legL.position.set(-0.16, 0.36, 0);
  const legR = legL.clone();
  legR.position.x = 0.16;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), shirt);
  armL.position.set(-0.42, 1.08, 0);
  const armR = armL.clone();
  armR.position.x = 0.42;
  g.add(head, hairTop, torso, legL, legR, armL, armR);
  g.userData.limbs = { legL, legR, armL, armR, torso };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Player {
  constructor(scene, spawn) {
    this.mesh = makePlayerMesh();
    scene.add(this.mesh);
    this.x = spawn.x; this.z = spawn.z;
    this.y = 0;
    this.vy = 0;
    this.heading = Math.PI; // facing down the plaza avenue
    this.health = 100;
    this.maxHealth = 100;
    this.inCar = null;
    this.walkPhase = 0;
    this.grounded = true;
    this.lastDamageAt = -99;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 8;
    this.speed2d = 0;
  }

  get pos() { return { x: this.x, z: this.z }; }

  damage(amount, now) {
    if (this.health <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.lastDamageAt = now;
  }

  heal(dt, now) {
    if (now - this.lastDamageAt > 8 && this.health > 0 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 2.5 * dt);
    }
  }

  // On-foot movement, camera-relative. Returns horizontal speed for the HUD.
  updateOnFoot(input, dt, colliders, onStep) {
    const sprint = input.sprint();
    const speed = sprint ? 9 : 5.6;
    const { f, r } = input.moveAxes();
    const moving = f !== 0 || r !== 0;
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    // Camera looks along -Z of its yaw; forward on the ground is (sin, cos).
    let mx = 0, mz = 0;
    if (moving) {
      mx = sin * f + cos * r;
      mz = cos * f - sin * r;
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const targetHeading = Math.atan2(mx, mz);
      this.heading = angleLerp(this.heading, targetHeading, 1 - Math.exp(-12 * dt));
    }
    const nx = this.x + mx * speed * dt;
    const nz = this.z + mz * speed * dt;
    let bx = nx, bz = nz;
    for (const box of colliders) {
      const res = collideCircleBox(bx, bz, 0.5, box);
      if (res) { bx = res.x; bz = res.z; }
    }
    this.x = clamp(bx, -WORLD.half + 2, WORLD.seaX - 2);
    this.z = clamp(bz, -WORLD.half + 2, WORLD.half - 2);
    // Jump + gravity.
    if (input.wasPressed('Space') && this.grounded) { this.vy = 6.5; this.grounded = false; }
    if (!this.grounded) {
      this.vy -= 18 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.grounded = true; }
    }
    // Walk-cycle limbs.
    this.speed2d = moving ? speed : 0;
    if (moving) {
      this.walkPhase += dt * speed * 1.6;
      if (onStep && Math.sin(this.walkPhase) > 0.96) onStep();
    }
    const s = moving ? Math.sin(this.walkPhase) : 0;
    const L = this.mesh.userData.limbs;
    L.legL.rotation.x = s * 0.7;
    L.legR.rotation.x = -s * 0.7;
    L.armL.rotation.x = -s * 0.55;
    L.armR.rotation.x = s * 0.55;
    L.torso.rotation.x = moving ? 0.08 : 0;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
  }

  // Third-person camera: drag to orbit, wheel to zoom. lookAhead shifts the
  // aim point in front of the player, so the crosshair ray from the camera
  // flies roughly level and actually reaches what the player aims at
  // (looking straight at the player would send every shot into the ground).
  updateCamera(camera, input, dt, target, lookAhead = 0) {
    this.camYaw -= input.mouseDX * 0.005;
    this.camPitch = clamp(this.camPitch + input.mouseDY * 0.004, -0.15, 1.1);
    this.camDist = clamp(this.camDist + input.wheelDelta * 0.01, 5, 13);
    const tx = target.x, ty = target.y + 1.6, tz = target.z;
    const cx = tx - Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cz = tz - Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cy = ty + Math.sin(this.camPitch) * this.camDist + 1.2;
    camera.position.set(cx, Math.max(1.2, cy), cz);
    camera.lookAt(
      tx + Math.sin(this.camYaw) * lookAhead,
      ty,
      tz + Math.cos(this.camYaw) * lookAhead,
    );
  }
}
