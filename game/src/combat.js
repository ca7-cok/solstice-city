// Shooting and punching: raycast from the camera, ammo, reload, tracers,
// hit reactions on peds, cops and dock guards.
import * as THREE from 'three';
import { clamp } from './util.js';

export class Combat {
  constructor(scene, effects) {
    this.scene = scene;
    this.effects = effects;
    this.magSize = 30;
    this.ammo = 30;
    this.reserve = 90;
    this.reloadT = 0;
    this.reloadDur = 1.2;
    this.cooldown = 0;
    this.raycaster = new THREE.Raycaster();
    this.targets = []; // {mesh, x, z, health, kind, radius, ref}
    this.muzzle = new THREE.PointLight(0xffc861, 0, 14);
    this.scene.add(this.muzzle);
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 });
  }

  get reloading() { return this.reloadT > 0; }

  registerTarget(entry) { this.targets.push(entry); }
  unregisterTarget(entry) {
    const i = this.targets.indexOf(entry);
    if (i >= 0) this.targets.splice(i, 1);
  }

  startReload() {
    if (this.reloadT > 0 || this.ammo === this.magSize || this.reserve <= 0) return false;
    this.reloadT = this.reloadDur;
    return true;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = this.magSize - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        this.reserve -= take;
        this.reloadT = 0;
      }
    }
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 40);
  }

  // The aim ray: from the shooter's chest, level along the camera's
  // horizontal facing. A ray cast from the high third-person camera drops
  // into the ground past ~15 m and threads the gap between a target's legs;
  // the chest-height level ray meets a standing target's torso at any range.
  getAimRay(camera, shooter) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    return new THREE.Raycaster(
      new THREE.Vector3(shooter.x, (shooter.y || 0) + 1.35, shooter.z), dir, 0, 120);
  }

  // Fire one shot from the chest along the camera's facing.
  // Returns {hit, entry, point, killed} or {hit:false}.
  shoot(camera, fromPos, now) {
    if (this.cooldown > 0 || this.reloadT > 0) return { hit: false, blocked: true };
    if (this.ammo <= 0) { this.startReload(); return { hit: false, dry: true }; }
    this.ammo--;
    this.cooldown = 0.16;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    this.raycaster.set(fromPos, dir);
    this.raycaster.far = 120;
    const meshes = this.targets.filter((t) => t.health > 0).map((t) => t.mesh);
    const hits = this.raycaster.intersectObjects(meshes, true);
    const origin = fromPos.clone();
    let end;
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      // Find which registered target owns this mesh.
      let entry = null;
      let obj = hit.object;
      while (obj) {
        entry = this.targets.find((t) => t.mesh === obj);
        if (entry) break;
        obj = obj.parent;
      }
      this.muzzle.position.copy(origin).add(new THREE.Vector3(0, 0.4, 0));
      this.muzzle.position.add(this.raycaster.ray.direction.clone().multiplyScalar(1.2));
      this.muzzle.intensity = 6;
      this.effects.tracer(origin, end);
      this.effects.burst(end, 0xffd34d, 6, 3);
      if (entry) {
        entry.health -= 34;
        const killed = entry.health <= 0;
        return { hit: true, entry, point: end, killed };
      }
      return { hit: true, entry: null, point: end, killed: false };
    }
    end = origin.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(80));
    this.muzzle.position.copy(origin).add(this.raycaster.ray.direction.clone().multiplyScalar(1.2));
    this.muzzle.intensity = 6;
    this.effects.tracer(origin, end);
    return { hit: false, point: end };
  }

  // Melee punch: anything alive within 2.2m in front of the player.
  punch(player, now) {
    if (this.cooldown > 0) return { hit: false };
    this.cooldown = 0.45;
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    let best = null; let bestD = 2.4;
    for (const t of this.targets) {
      if (t.health <= 0) continue;
      const dx = t.x - player.x, dz = t.z - player.z;
      const d = Math.hypot(dx, dz);
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (d < bestD && dot > 0.4) { bestD = d; best = t; }
    }
    if (!best) return { hit: false };
    best.health -= 25;
    this.effects.burst(new THREE.Vector3(best.x, 1.4, best.z), 0xffffff, 5, 2.5);
    return { hit: true, entry: best, killed: best.health <= 0 };
  }
}
