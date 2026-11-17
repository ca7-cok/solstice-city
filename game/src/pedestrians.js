// Pedestrians: walkers on the sidewalks who stroll, panic and flee.
// Original low-poly people built from boxes.
import * as THREE from 'three';
import { rand, pick, clamp, angleLerp } from './util.js';
import { CITY } from './city.js';

const SKIN = [0xf2c9a0, 0xc98d5f, 0x8a5a3b, 0xf7d7b5];
const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x34495e];
const PANTS = [0x2c3e50, 0x7f8c8d, 0x5d4037, 0x1a1a2e];

export function makePersonMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.18; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), skinMat);
  head.position.y = 1.78; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.44),
    new THREE.MeshLambertMaterial({ color: pick([0x1a1a1a, 0x4a2f18, 0x8a8a8a, 0xd9a441]) }));
  hair.position.y = 2.0; g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.82, 0.26), pantsMat);
  legL.position.set(-0.16, 0.41, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.2), shirtMat);
  armL.position.set(-0.42, 1.2, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  g.userData = { legL, legR, armL, armR, head };
  return g;
}

export class Pedestrian {
  constructor(scene, x, z) {
    this.scene = scene;
    this.mesh = makePersonMesh(pick(SHIRTS), pick(PANTS), pick(SKIN));
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.heading = rand(Math.PI * 2);
    this.speed = rand(1.2, 2.2);
    this.state = 'walk';       // walk | panic | flee | dead
    this.panicT = 0;
    this.health = 100;
    this.walkT = rand(2, 6);
    this.alive = true;
    this.walkPhase = rand(Math.PI * 2);
    this.onSidewalk = true;
  }

  get pos() { return this.mesh.position; }

  update(dt, ctx) {
    if (!this.alive) return;
    this.walkPhase += dt * this.speed * 5;
    const u = this.mesh.userData;
    const swing = Math.sin(this.walkPhase) * 0.55;
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8; u.armR.rotation.x = swing * 0.8;

    if (this.state === 'dead') return;
    if (this.state === 'panic' || this.state === 'flee') {
      this.panicT -= dt;
      this.speed = 5.5;
      if (this.panicT <= 0) { this.state = 'walk'; this.speed = rand(1.2, 2.2); }
    } else {
      this.walkT -= dt;
      if (this.walkT <= 0) {
        this.walkT = rand(2, 7);
        // Turn at intersections: pick a new heading along the grid.
        this.heading = Math.round(rand(0, 3)) * Math.PI / 2 + rand(-0.2, 0.2);
      }
    }
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    // Keep on sidewalks / in the city; bounce off buildings.
    const oldX = this.pos.x, oldZ = this.pos.z;
    this.pos.x = nx; this.pos.z = nz;
    if (ctx.city.collideCircle(this.pos, 0.5)) {
      this.pos.x = oldX; this.pos.z = oldZ;
      this.heading += Math.PI / 2;
    }
    if (Math.abs(this.pos.x) > CITY.half + 10 || Math.abs(this.pos.z) > CITY.half + 10) {
      this.heading += Math.PI;
    }
    this.mesh.rotation.y = angleLerp(this.mesh.rotation.y, this.heading, Math.min(1, dt * 6));
    // A car barrelling at them makes them panic.
    for (const car of ctx.cars) {
      if (!car.alive || Math.abs(car.speed) < 5) continue;
      const dx = this.pos.x - car.pos.x, dz = this.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 7 && this.state !== 'flee') {
        const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
        if (ahead > 0) { this.panic(); }
      }
      if (d < 1.8) ctx.game.onPedestrianHit(this, car);
    }
  }

  panic() {
    if (this.state === 'dead') return;
    this.state = 'panic'; this.panicT = rand(2, 4);
    this.heading = rand(Math.PI * 2);
  }

  damage(amount) {
    if (!this.alive) return;
    this.health -= amount;
    if (this.health <= 0) this.kill();
    else this.panic();
  }

  kill() {
    this.state = 'dead'; this.alive = false;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.3;
  }
}
