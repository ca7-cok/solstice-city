// Cars: a shared factory, arcade driving physics for the player, and
// traffic that circulates on the road grid.
import * as THREE from 'three';
import { mulberry32, rand, pick, clamp, angleLerp, angleDiff, dist2, collideCircleBox } from './util.js';
import { WORLD } from './city.js';

export const CAR_COLORS = [0xd23b3b, 0x3b7dd2, 0xf2c230, 0x3bb273, 0xe8e8e8, 0x2a2d34, 0x8a5fd2, 0xe07b39];

export function makeCarMesh(color, isPolice = false) {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  car.add(body, cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    car.add(w);
    wheels.push(w);
  }
  // Headlights + taillights.
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0xffe9a0, emissiveIntensity: 0.7 });
  for (const s of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), lightMat);
    h.position.set(s, 0.62, 2.22);
    car.add(h);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xd21f1f, emissive: 0x8a1010, emissiveIntensity: 0.6 });
  for (const s of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), tailMat);
    t.position.set(s, 0.62, -2.22);
    car.add(t);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.48, -0.2);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.4), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1 }));
    red.position.set(-0.28, 1.6, -0.2);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.4), new THREE.MeshLambertMaterial({ color: 0x2266ff, emissive: 0x2266ff, emissiveIntensity: 1 }));
    blue.position.set(0.28, 1.6, -0.2);
    car.add(bar, red, blue);
    car.userData.lightbar = { red, blue };
  }
  car.userData.wheels = wheels;
  return car;
}

export class Car {
  constructor(mesh, x, z, heading) {
    this.mesh = mesh;
    this.x = x; this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.isPlayer = false;
    this.health = 100;
  }
  get pos() { return { x: this.x, z: this.z }; }
  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * 0.016 / 0.36;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
  }
}

// Arcade driving: accelerate, brake/reverse, steering that tightens at low
// speed, handbrake drift. Collides with building AABBs and the world edge.
export function driveCar(car, input, dt, colliders, onCrash) {
  const maxSpeed = 38;
  const accel = 16;
  const brake = 30;
  const drag = 0.55;
  const maxSteer = 0.55;
  const targetSteer = input.steer * maxSteer * clamp(1.15 - Math.abs(car.speed) / maxSpeed, 0.35, 1);
  car.steer = angleLerp(car.steer, targetSteer, 1 - Math.exp(-8 * dt));
  if (input.throttle > 0) car.speed += accel * input.throttle * dt;
  if (input.brake > 0) {
    if (car.speed > 0.5) car.speed -= brake * input.brake * dt;
    else car.speed -= accel * 0.45 * input.brake * dt; // reverse
  }
  car.speed -= car.speed * drag * dt;
  car.speed = clamp(car.speed, -10, maxSpeed);
  if (input.handbrake) {
    car.speed -= car.speed * 1.6 * dt;
  }
  const turnRate = (car.speed / 3.2) * Math.tan(car.steer) * (input.handbrake ? 1.7 : 1);
  car.heading += turnRate * dt * (car.speed >= 0 ? 1 : -1);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  // Building collision: circle vs AABB, kill speed on impact.
  let hit = false;
  for (const box of colliders) {
    const res = collideCircleBox(nx, nz, 1.9, box);
    if (res) {
      hit = true;
      const impact = Math.abs(car.speed);
      car.x = res.x; car.z = res.z;
      if (impact > 6 && onCrash) onCrash(impact);
      car.speed *= 0.25;
      break;
    }
  }
  if (!hit) { car.x = nx; car.z = nz; }
  car.x = clamp(car.x, -WORLD.half + 4, WORLD.seaX - 3);
  car.z = clamp(car.z, -WORLD.half + 4, WORLD.half - 4);
  car.syncMesh();
}

// Traffic: cars that loop the grid, turning at intersections, slowing for
// the car ahead. Parked cars sit at the roadside for the player to steal.
export class TrafficManager {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = mulberry32(777);
    this.cars = [];
    this.parked = [];
    const lanes = WORLD.roadCoords;
    for (let i = 0; i < 16; i++) {
      const axis = this.rng() < 0.5 ? 'x' : 'z';
      const road = pick(this.rng, lanes);
      const t = rand(this.rng, -210, 210);
      const color = pick(this.rng, CAR_COLORS);
      const mesh = makeCarMesh(color);
      scene.add(mesh);
      const heading = axis === 'x' ? (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (this.rng() < 0.5 ? 0 : Math.PI);
      const car = new Car(mesh, axis === 'x' ? t : road + (this.rng() < 0.5 ? 3 : -3), axis === 'x' ? road + (this.rng() < 0.5 ? 3 : -3) : t, heading);
      car.speed = rand(this.rng, 7, 11);
      car.axis = axis;
      car.road = road;
      car.cruise = car.speed;
      this.cars.push(car);
      car.syncMesh();
    }
    // Parked cars: two near the plaza spawn so the player can steal one fast.
    const spots = [
      { x: 10, z: 34, h: Math.PI / 2, c: 0xd23b3b },
      { x: -12, z: 34, h: -Math.PI / 2, c: 0x3b7dd2 },
      { x: 66, z: -48, h: 0, c: 0xf2c230, mission: 'hot-wheels' },
      { x: -66, z: 60, h: Math.PI, c: 0x3bb273 },
      { x: 126, z: -66, h: Math.PI / 2, c: 0xe8e8e8 },
      { x: -126, z: -126, h: 0, c: 0x8a5fd2 },
      { x: 60, z: 126, h: -Math.PI / 2, c: 0x2a2d34 },
      { x: -60, z: -126, h: Math.PI, c: 0xe07b39 },
    ];
    for (const s of spots) {
      const mesh = makeCarMesh(s.c);
      scene.add(mesh);
      const car = new Car(mesh, s.x, s.z, s.h);
      car.parked = true;
      if (s.mission) car.missionCar = s.mission;
      this.parked.push(car);
      car.syncMesh();
    }
  }

  nearestParked(x, z, maxDist) {
    let best = null; let bestD = maxDist;
    for (const car of this.parked) {
      const d = dist2(x, z, car.x, car.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  removeParked(car) {
    const i = this.parked.indexOf(car);
    if (i >= 0) this.parked.splice(i, 1);
  }

  update(dt) {
    for (const car of this.cars) {
      // At an intersection, sometimes turn onto the crossing road.
      const onRoadX = WORLD.roadCoords.some((c) => Math.abs(car.z - c) < 3.5);
      const onRoadZ = WORLD.roadCoords.some((c) => Math.abs(car.x - c) < 3.5);
      if (onRoadX && onRoadZ && this.rng() < dt * 0.55) {
        const turn = this.rng();
        if (turn < 0.35) {
          car.axis = car.axis === 'x' ? 'z' : 'x';
          car.road = car.axis === 'x'
            ? WORLD.roadCoords.reduce((a, b) => (Math.abs(b - car.z) < Math.abs(a - car.z) ? b : a))
            : WORLD.roadCoords.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a));
          const lane = this.rng() < 0.5 ? 3 : -3;
          if (car.axis === 'x') { car.z = car.road + lane; car.heading = this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2; }
          else { car.x = car.road + lane; car.heading = this.rng() < 0.5 ? 0 : Math.PI; }
        }
      }
      // Slow down if another car is right ahead.
      let target = car.cruise;
      for (const other of this.cars) {
        if (other === car) continue;
        const dx = other.x - car.x, dz = other.z - car.z;
        const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
        const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
        if (ahead > 0 && ahead < 12 && side < 3) { target = 0; break; }
      }
      car.speed = angleLerp(car.speed, target, 1 - Math.exp(-1.5 * dt));
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      // Wrap around the far edge so traffic never runs out.
      if (car.x > 232) car.x = -232;
      if (car.x < -232) car.x = 232;
      if (car.z > 232) car.z = -232;
      if (car.z < -232) car.z = 232;
      car.syncMesh();
    }
  }
}
