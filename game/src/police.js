// Wanted system + Solstice PD: stars rise with crime, police cars and foot
// officers chase the player, and hiding out of sight cools the heat off.
import * as THREE from 'three';
import { clamp, rand, pick } from './util.js';
import { Car } from './vehicles.js';
import { makePersonMesh } from './pedestrians.js';

export class PolicePed {
  constructor(scene, x, z) {
    this.scene = scene;
    this.mesh = makePersonMesh(0x1c2733, 0x1c2733, pick([0xf2c9a0, 0xc98d5f, 0x8a5a3b]));
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46),
      new THREE.MeshLambertMaterial({ color: 0x101418 }));
    cap.position.y = 2.06; this.mesh.add(cap);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.heading = 0;
    this.speed = 5.2;
    this.health = 50;
    this.alive = true;
    this.attackT = 0;
    this.walkPhase = rand(Math.PI * 2);
  }

  get pos() { return this.mesh.position; }

  update(dt, ctx) {
    if (!this.alive) return;
    const target = ctx.game.playerTarget();
    if (!target) return;
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.heading = Math.atan2(dx, dz);
    this.walkPhase += dt * 7;
    const u = this.mesh.userData;
    const swing = Math.sin(this.walkPhase) * 0.5;
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8; u.armR.rotation.x = swing * 0.8;
    if (dist > 2.2) {
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += Math.cos(this.heading) * this.speed * dt;
      ctx.city.collideCircle(this.pos, 0.5);
    } else if (ctx.player && !ctx.player.inCar) {
      // Nightstick: hurt the player up close.
      this.attackT -= dt;
      if (this.attackT <= 0) {
        this.attackT = 0.9;
        ctx.player.damage(12);
        ctx.game.onPlayerHit('A Solstice PD officer beat you down.');
        ctx.audio.punch();
      }
    }
    this.mesh.rotation.y = this.heading;
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.alive = false;
      this.mesh.rotation.x = -Math.PI / 2; this.mesh.position.y = 0.3;
    }
  }

  remove() { this.scene.remove(this.mesh); }
}

export class WantedSystem {
  constructor(game) {
    this.game = game;
    this.stars = 0;
    this.hideTimer = 0;      // seconds unseen while wanted
    this.spawnTimer = 0;
    this.policeCars = [];
    this.policePeds = [];
    this.maxCars = 0;
  }

  addCrime(stars, reason) {
    const before = this.stars;
    this.stars = clamp(this.stars + stars, 0, 5);
    this.hideTimer = 0;
    if (this.stars > before) {
      this.game.hud.toast(`WANTED LEVEL ${'★'.repeat(this.stars)}`, reason || 'The PD is on its way.');
      this.game.audio.setSiren(this.stars > 0);
    }
  }

  clear() {
    this.stars = 0;
    this.hideTimer = 0;
    for (const c of this.policeCars) { c.alive = false; c.remove(); }
    for (const p of this.policePeds) { p.remove(); }
    this.policeCars = []; this.policePeds = [];
    this.game.audio.setSiren(false);
  }

  // Is any police close enough to see the player?
  policeCanSee() {
    const t = this.game.playerTarget();
    if (!t) return false;
    for (const c of this.policeCars) {
      if (c.alive && Math.hypot(c.pos.x - t.x, c.pos.z - t.z) < 55) return true;
    }
    for (const p of this.policePeds) {
      if (p.alive && Math.hypot(p.pos.x - t.x, p.pos.z - t.z) < 35) return true;
    }
    return false;
  }

  update(dt, ctx) {
    // Spawn police to match the wanted level.
    this.maxCars = this.stars >= 4 ? 3 : this.stars >= 2 ? 2 : this.stars >= 1 ? 1 : 0;
    this.spawnTimer -= dt;
    if (this.policeCars.length < this.maxCars && this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      const t = this.game.playerTarget();
      if (t) {
        const a = rand(Math.PI * 2);
        const car = new Car(ctx.scene, {
          isPolice: true, ai: 'police',
          x: t.x + Math.sin(a) * 55, z: t.z + Math.cos(a) * 55,
        });
        ctx.scene.add(car.mesh);
        ctx.cars.push(car);
        this.policeCars.push(car);
      }
    }
    // Foot officers when the player is on foot and wanted.
    if (this.stars >= 1 && ctx.player && !ctx.player.inCar && this.policePeds.length < this.stars) {
      const t = this.game.playerTarget();
      if (t) {
        const a = rand(Math.PI * 2);
        this.policePeds.push(new PolicePed(ctx.scene, t.x + Math.sin(a) * 22, t.z + Math.cos(a) * 22));
      }
    }
    // Update police cars (their update runs via ctx.cars in main loop).
    for (const p of this.policePeds) p.update(dt, ctx);
    this.policePeds = this.policePeds.filter((p) => p.alive);
    this.policeCars = this.policeCars.filter((c) => c.alive);
    // Cool-down: unseen for a while, stars drop one at a time.
    if (this.stars > 0) {
      if (this.policeCanSee()) this.hideTimer = 0;
      else {
        this.hideTimer += dt;
        const need = this.stars >= 3 ? 14 : 9;
        if (this.hideTimer > need) {
          this.stars--;
          this.hideTimer = 0;
          this.game.hud.toast(`Wanted level dropped to ${this.stars === 0 ? 'clear' : '★'.repeat(this.stars)}`,
            this.stars === 0 ? 'You slipped away. Stay clean.' : 'Keep laying low.');
          this.game.audio.setSiren(this.stars > 0);
        }
      }
    }
  }
}
