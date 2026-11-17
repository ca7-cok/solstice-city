// Pedestrians: sidewalk wanderers who stroll, flee gunfire, and fall when hit.
import * as THREE from 'three';
import { mulberry32, rand, pick, clamp, angleLerp, dist2, collideCircleBox } from './util.js';
import { WORLD } from './city.js';

const SHIRTS = [0x4b8fd2, 0xd2a24b, 0x7a4bd2, 0x4bd2a0, 0xd24b7a, 0xe8e8e8, 0x3a3f4a];
const SKINS = [0xd9a077, 0x8a5a3a, 0xe8b88a, 0x6b4426];

function makePedMesh(shirtColor, skinColor) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b3242 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.55;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.66, 0.34), shirt);
  torso.position.y = 1.0;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.24), pants);
  legL.position.set(-0.15, 0.34, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.58, 0.2), shirt);
  armL.position.set(-0.38, 1.02, 0);
  const armR = armL.clone();
  armR.position.x = 0.38;
  g.add(head, torso, legL, legR, armL, armR);
  g.userData.limbs = { legL, legR, armL, armR };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Ped {
  constructor(mesh, x, z) {
    this.mesh = mesh;
    this.x = x; this.z = z;
    this.heading = 0;
    this.speed = 1.4;
    this.health = 50;
    this.alive = true;
    this.fleeing = false;
    this.fleeUntil = 0;
    this.fallT = 0;
    this.walkPhase = Math.random() * 6;
    this.target = null;
    this.pickTarget();
  }
  pickTarget() {
    // Walk to a nearby sidewalk point (roads run on the grid, sidewalks at ±7.5).
    const road = pick(Math.random, WORLD.roadCoords);
    const along = rand(Math.random, -210, 210);
    const side = Math.random() < 0.5 ? 8.5 : -8.5;
    if (Math.random() < 0.5) this.target = { x: along, z: road + side };
    else this.target = { x: road + side, z: along };
  }
  get pos() { return { x: this.x, z: this.z }; }
}

export class PedestrianManager {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = mulberry32(4242);
    this.peds = [];
    for (let i = 0; i < 26; i++) {
      const mesh = makePedMesh(pick(this.rng, SHIRTS), pick(this.rng, SKINS));
      scene.add(mesh);
      const road = pick(this.rng, WORLD.roadCoords);
      const along = rand(this.rng, -210, 210);
      const side = this.rng() < 0.5 ? 8.5 : -8.5;
      const ped = new Ped(mesh, this.rng() < 0.5 ? along : road + side, this.rng() < 0.5 ? road + side : along);
      ped.mesh.position.set(ped.x, 0, ped.z);
      this.peds.push(ped);
    }
  }

  nearestAlive(x, z, maxDist) {
    let best = null; let bestD = maxDist;
    for (const p of this.peds) {
      if (!p.alive) continue;
      const d = dist2(x, z, p.x, p.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  scare(x, z, radius, now) {
    for (const p of this.peds) {
      if (!p.alive) continue;
      if (dist2(x, z, p.x, p.z) < radius) {
        p.fleeing = true;
        p.fleeUntil = now + 4;
        p.target = { x: p.x + (p.x - x) * 2, z: p.z + (p.z - z) * 2 };
      }
    }
  }

  update(dt, now) {
    for (const p of this.peds) {
      if (!p.alive) {
        // Fallen: sink and fade, then respawn elsewhere.
        p.fallT += dt;
        p.mesh.rotation.x = Math.min(Math.PI / 2, p.fallT * 4);
        p.mesh.position.y = -Math.min(0.4, p.fallT * 0.15);
        if (p.fallT > 6) {
          p.alive = true; p.health = 50; p.fallT = 0;
          p.mesh.rotation.x = 0; p.mesh.position.y = 0;
          const road = pick(this.rng, WORLD.roadCoords);
          p.x = rand(this.rng, -200, 200);
          p.z = road + 8.5;
          p.pickTarget();
        }
        continue;
      }
      const speed = p.fleeing && now < p.fleeUntil ? 4.2 : p.speed;
      const dx = p.target.x - p.x, dz = p.target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) { p.pickTarget(); continue; }
      p.heading = angleLerp(p.heading, Math.atan2(dx, dz), 1 - Math.exp(-6 * dt));
      let nx = p.x + Math.sin(p.heading) * speed * dt;
      let nz = p.z + Math.cos(p.heading) * speed * dt;
      for (const box of this.colliders) {
        const res = collideCircleBox(nx, nz, 0.45, box);
        if (res) { nx = res.x; nz = res.z; }
      }
      p.x = clamp(nx, -235, 200);
      p.z = clamp(nz, -235, 235);
      p.walkPhase += dt * speed * 2.2;
      const s = Math.sin(p.walkPhase);
      const L = p.mesh.userData.limbs;
      L.legL.rotation.x = s * 0.6;
      L.legR.rotation.x = -s * 0.6;
      L.armL.rotation.x = -s * 0.45;
      L.armR.rotation.x = s * 0.45;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      if (p.fleeing && now >= p.fleeUntil) p.fleeing = false;
    }
  }
}
