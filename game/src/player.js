// The player on foot: Mara Voss. Third-person walker with a jump, a punch
// and a pistol. Original low-poly character with a red jacket.
import * as THREE from 'three';
import { clamp, angleLerp } from './util.js';
import { makePersonMesh } from './pedestrians.js';

export class Player {
  constructor(scene, x, z) {
    this.scene = scene;
    this.mesh = makePersonMesh(0xd93a3a, 0x22303e, 0xf2c9a0);
    this.mesh.scale.setScalar(1.06);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.heading = 0;
    this.speed = 0;
    this.vy = 0;
    this.onGround = true;
    this.health = 100;
    this.ammo = 30;
    this.reserveAmmo = 90;
    this.inCar = null;         // Car the player is driving, or null
    this.walkPhase = 0;
    this.punchT = 0;
    this.dead = false;
  }

  get pos() { return this.mesh.position; }

  update(dt, ctx) {
    if (this.dead || this.inCar) return;
    const input = ctx.input;
    const camYaw = ctx.cameraYaw;
    // Movement relative to camera.
    let mx = 0, mz = 0;
    if (input.forward) { mx += -Math.sin(camYaw); mz += -Math.cos(camYaw); }
    if (input.back) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
    if (input.left) { mx += -Math.cos(camYaw); mz += Math.sin(camYaw); }
    if (input.right) { mx += Math.cos(camYaw); mz += -Math.sin(camYaw); }
    const len = Math.hypot(mx, mz);
    const targetSpeed = len > 0 ? (input.sprint ? 9.5 : 5.2) : 0;
    this.speed += clamp(targetSpeed - this.speed, -30 * dt, 22 * dt);
    if (len > 0) {
      mx /= len; mz /= len;
      const targetHeading = Math.atan2(mx, mz);
      this.heading = angleLerp(this.heading, targetHeading, Math.min(1, dt * 12));
      this.pos.x += mx * this.speed * dt;
      this.pos.z += mz * this.speed * dt;
      ctx.city.collideCircle(this.pos, 0.55);
      this.walkPhase += dt * this.speed * 2.2;
    }
    // Jump.
    if (input.jump && this.onGround) { this.vy = 7.5; this.onGround = false; }
    if (!this.onGround) {
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.onGround = true; }
    }
    // Walk animation.
    const u = this.mesh.userData;
    const swing = Math.sin(this.walkPhase) * (this.speed > 0.5 ? 0.6 : 0);
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8; u.armR.rotation.x = swing * 0.8;
    if (this.punchT > 0) {
      this.punchT -= dt;
      u.armR.rotation.x = -1.6 * Math.sin((this.punchT / 0.35) * Math.PI);
    }
    this.mesh.rotation.y = this.heading;
    // Health regen, slowly, only when not wanted.
    if (ctx.game.wanted === 0 && this.health < 100) this.health = Math.min(100, this.health + 2 * dt);
  }

  punch() {
    if (this.punchT > 0 || this.inCar) return;
    this.punchT = 0.35;
  }

  damage(amount) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }

  heal(amount) { this.health = clamp(this.health + amount, 0, 100); }

  teleport(x, z) { this.pos.set(x, 0, z); this.heading = 0; }
}
