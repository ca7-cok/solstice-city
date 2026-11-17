// Wanted system + Solstice PD: stars rise with crime, decay with calm.
// Foot cops chase on foot; police cruisers ram the player's car.
import * as THREE from 'three';
import { mulberry32, rand, clamp, angleLerp, dist2, collideCircleBox } from './util.js';
import { WORLD } from './city.js';
import { makeCarMesh, Car, driveCar } from './vehicles.js';

export class WantedSystem {
  constructor() {
    this.heat = 0;
    this.lastCrimeAt = -99;
    this.calmDelay = 12;
  }
  get stars() { return this.heat <= 0 ? 0 : Math.min(5, Math.ceil(this.heat / 20)); }
  addHeat(amount, now) {
    this.heat = clamp(this.heat + amount, 0, 100);
    this.lastCrimeAt = now;
  }
  clear() { this.heat = 0; }
  update(dt, now) {
    if (now - this.lastCrimeAt > this.calmDelay && this.heat > 0) {
      this.heat = Math.max(0, this.heat - 2.2 * dt);
    }
  }
}

function makeCopMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1d2f55 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a077 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), skin);
  head.position.y = 1.6;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.48), navy);
  cap.position.y = 1.86;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.36), navy);
  torso.position.y = 1.04;
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.02), new THREE.MeshLambertMaterial({ color: 0xffd34d }));
  badge.position.set(-0.16, 1.18, 0.19);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.7, 0.25), navy);
  legL.position.set(-0.15, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.6, 0.21), navy);
  armL.position.set(-0.4, 1.06, 0);
  const armR = armL.clone();
  armR.position.x = 0.4;
  g.add(head, cap, torso, badge, legL, legR, armL, armR);
  g.userData.limbs = { legL, legR, armL, armR };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class PoliceManager {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = mulberry32(9911);
    this.cops = []; // foot cops {mesh,x,z,heading,health,walkPhase}
    this.cruisers = []; // police Car instances with chase steering
    this.spawnTimer = 0;
    this.flashT = 0;
  }

  desiredUnits(stars) {
    if (stars <= 0) return { cops: 0, cruisers: 0 };
    if (stars === 1) return { cops: 1, cruisers: 0 };
    if (stars === 2) return { cops: 2, cruisers: 0 };
    if (stars === 3) return { cops: 2, cruisers: 1 };
    if (stars === 4) return { cops: 3, cruisers: 2 };
    return { cops: 3, cruisers: 3 };
  }

  spawnCopNear(px, pz) {
    const mesh = makeCopMesh();
    this.scene.add(mesh);
    const a = this.rng() * Math.PI * 2;
    const cop = {
      mesh, x: px + Math.cos(a) * 26, z: pz + Math.sin(a) * 26,
      heading: 0, health: 100, walkPhase: 0, punchCd: 0,
    };
    cop.x = clamp(cop.x, -230, 200);
    cop.z = clamp(cop.z, -230, 230);
    this.cops.push(cop);
  }

  spawnCruiserNear(px, pz) {
    const mesh = makeCarMesh(0x1d2f55, true);
    this.scene.add(mesh);
    const a = this.rng() * Math.PI * 2;
    const car = new Car(mesh, clamp(px + Math.cos(a) * 42, -220, 195), clamp(pz + Math.sin(a) * 42, -220, 220), a);
    car.isPolice = true;
    this.cruisers.push(car);
    car.syncMesh();
  }

  clearAll() {
    for (const c of this.cops) this.scene.remove(c.mesh);
    for (const c of this.cruisers) this.scene.remove(c.mesh);
    this.cops = [];
    this.cruisers = [];
  }

  update(dt, now, stars, player, onCopPunch, onRam) {
    const want = this.desiredUnits(stars);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      if (this.cops.length < want.cops) this.spawnCopNear(player.x, player.z);
      else if (this.cruisers.length < want.cruisers) this.spawnCruiserNear(player.x, player.z);
    }
    // Trim extras when the heat drops.
    while (this.cops.length > want.cops) this.scene.remove(this.cops.pop().mesh);
    while (this.cruisers.length > want.cruisers) this.scene.remove(this.cruisers.pop().mesh);

    // Foot cops: run at the player, punch in range.
    for (const cop of this.cops) {
      if (cop.health <= 0) continue;
      const d = dist2(player.x, player.z, cop.x, cop.z);
      const speed = 5.4;
      const dx = player.x - cop.x, dz = player.z - cop.z;
      cop.heading = angleLerp(cop.heading, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
      let nx = cop.x + Math.sin(cop.heading) * speed * dt;
      let nz = cop.z + Math.cos(cop.heading) * speed * dt;
      for (const box of this.colliders) {
        const res = collideCircleBox(nx, nz, 0.5, box);
        if (res) { nx = res.x; nz = res.z; }
      }
      cop.x = clamp(nx, -235, 200);
      cop.z = clamp(nz, -235, 235);
      cop.walkPhase += dt * speed * 2;
      const s = Math.sin(cop.walkPhase);
      const L = cop.mesh.userData.limbs;
      L.legL.rotation.x = s * 0.65;
      L.legR.rotation.x = -s * 0.65;
      L.armL.rotation.x = -s * 0.5;
      L.armR.rotation.x = s * 0.5;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      cop.punchCd -= dt;
      if (d < 1.6 && cop.punchCd <= 0 && !player.inCar) {
        cop.punchCd = 1.1;
        if (onCopPunch) onCopPunch(9);
      }
    }
    // Cruisers: steer toward the player and ram.
    for (const car of this.cruisers) {
      const dx = player.x - car.x, dz = player.z - car.z;
      const d = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      const diff = ((desired - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const steerInput = clamp(diff * 1.4, -1, 1);
      driveCar(car, { throttle: d > 6 ? 1 : 0.4, brake: 0, steer: steerInput, handbrake: false }, dt, this.colliders, null);
      if (d < 3.4 && onRam) onRam(Math.min(18, 4 + Math.abs(car.speed) * 0.5));
      // Flash the light bar.
      if (car.mesh.userData.lightbar) {
        this.flashT += dt;
        const on = Math.floor(this.flashT * 6) % 2 === 0;
        car.mesh.userData.lightbar.red.material.emissiveIntensity = on ? 2.2 : 0.2;
        car.mesh.userData.lightbar.blue.material.emissiveIntensity = on ? 0.2 : 2.2;
      }
    }
  }
}
