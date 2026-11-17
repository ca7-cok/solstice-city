// Combat: hitscan pistol shooting with a crosshair, ammo and reload,
// plus mission gang members who shoot back.
import * as THREE from 'three';
import { rand, pick, clamp } from './util.js';
import { makePersonMesh } from './pedestrians.js';

export class GangMember {
  constructor(scene, x, z, name) {
    this.scene = scene;
    this.name = name || 'Rival';
    this.mesh = makePersonMesh(pick([0x222222, 0x5b2a86, 0x8a1f2d]), 0x2c2c2c, pick([0xf2c9a0, 0xc98d5f]));
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.heading = rand(Math.PI * 2);
    this.health = 60;
    this.alive = true;
    this.shootT = rand(1, 2);
    this.walkPhase = 0;
    this.speed = 2.6;
  }

  get pos() { return this.mesh.position; }

  update(dt, ctx) {
    if (!this.alive) return;
    const target = ctx.game.playerTarget();
    if (!target) return;
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.heading = Math.atan2(dx, dz);
    this.walkPhase += dt * 6;
    const u = this.mesh.userData;
    const swing = Math.sin(this.walkPhase) * 0.5;
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    if (dist > 16) {
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += Math.cos(this.heading) * this.speed * dt;
      ctx.city.collideCircle(this.pos, 0.5);
    } else {
      // Shoot at the player.
      this.shootT -= dt;
      if (this.shootT <= 0) {
        this.shootT = rand(1.2, 2.4);
        ctx.effects.muzzle(this.pos.x, 1.5, this.pos.z, this.heading);
        ctx.audio.gunshot();
        if (Math.random() < 0.35 && ctx.player && !ctx.player.inCar) {
          ctx.player.damage(rand(5, 10));
          ctx.game.onPlayerHit('A rival shot you.');
        }
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

export class Combat {
  constructor(game) {
    this.game = game;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 120;
  }

  // Player fires the pistol from the camera through the crosshair.
  shoot() {
    const ctx = this.game.ctx;
    const player = ctx.player;
    if (!player || player.inCar || player.dead) return;
    if (player.ammo <= 0) { this.game.audio.denied(); this.game.hud.toast('OUT OF AMMO', 'Press R to reload.'); return; }
    player.ammo--;
    this.game.audio.gunshot();
    const origin = ctx.camera.position.clone();
    const dir = new THREE.Vector3();
    ctx.camera.getWorldDirection(dir);
    this.raycaster.set(origin, dir);
    // Muzzle flash at the player's hand.
    const hand = player.pos.clone(); hand.y = 1.4;
    ctx.effects.muzzle(hand.x, hand.y, hand.z, player.heading);
    // Hit test: gang members, police peds, pedestrians, cars.
    const targets = [];
    for (const g of this.game.missions.gang) if (g.alive) targets.push({ obj: g, r: 1.0, kind: 'gang' });
    for (const p of this.game.wanted.policePeds) if (p.alive) targets.push({ obj: p, r: 1.0, kind: 'cop' });
    for (const p of ctx.peds) if (p.alive) targets.push({ obj: p, r: 0.9, kind: 'ped' });
    let best = null, bestD = Infinity;
    for (const t of targets) {
      const to = new THREE.Vector3(t.obj.pos.x, 1.2, t.obj.pos.z).sub(origin);
      const along = to.dot(dir);
      if (along < 1 || along > 120) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp < t.r && along < bestD) { best = t; bestD = along; }
    }
    if (best) {
      best.obj.damage(34);
      ctx.effects.blood(best.obj.pos.x, 1.2, best.obj.pos.z);
      if (best.kind === 'gang' && !best.obj.alive) {
        this.game.money += 50;
        this.game.hud.toast('RIVAL DOWN', '+$50 taken from the street.');
        this.game.missions.onGangKilled(best.obj);
      } else if (best.kind === 'cop') {
        this.game.wanted.addCrime(1, 'You shot a police officer.');
        if (!best.obj.alive) this.game.hud.toast('OFFICER DOWN', 'The whole PD will hear about this.');
      } else if (best.kind === 'ped') {
        if (!best.obj.alive) this.game.wanted.addCrime(1, 'A pedestrian was hit.');
        else best.obj.panic();
      }
    }
    // Cars: shooting a car damages it; shooting near traffic raises heat a little.
    for (const car of ctx.cars) {
      if (!car.alive) continue;
      const to = new THREE.Vector3(car.pos.x, 1, car.pos.z).sub(origin);
      const along = to.dot(dir);
      if (along < 1 || along > 120) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp < 2.2 && along < bestD) {
        car.damage(20);
        ctx.effects.crashSparks(car.pos.x, 1, car.pos.z);
        break;
      }
    }
  }

  reload() {
    const player = this.game.ctx.player;
    if (!player || player.ammo >= 30 || player.reserveAmmo <= 0) return;
    const need = 30 - player.ammo;
    const take = Math.min(need, player.reserveAmmo);
    player.ammo += take; player.reserveAmmo -= take;
    this.game.audio.blip(600, 0.1, 'square', 0.15);
  }

  // Melee punch: hits the nearest person within 2 m in front.
  punch() {
    const ctx = this.game.ctx;
    const player = ctx.player;
    if (!player || player.inCar) return;
    player.punch();
    this.game.audio.punch();
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    const candidates = [];
    for (const p of ctx.peds) if (p.alive) candidates.push(p);
    for (const g of this.game.missions.gang) if (g.alive) candidates.push(g);
    for (const p of this.game.wanted.policePeds) if (p.alive) candidates.push(p);
    for (const c of candidates) {
      const dx = c.pos.x - player.pos.x, dz = c.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.2 && dx * fx + dz * fz > 0) {
        c.damage ? c.damage(25) : null;
        if (c.panic) c.panic();
        if (c.state !== 'dead' && c.health <= 0) this.game.wanted.addCrime(1, 'You beat someone down.');
        break;
      }
    }
  }
}
