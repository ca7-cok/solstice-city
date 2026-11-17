// Vehicles: the player's drivable cars, parked stealable cars and AI traffic.
// All cars are original low-poly builds (body + cabin + wheels), no real models.
import * as THREE from 'three';
import { clamp, rand, pick, angleLerp } from './util.js';
import { CITY } from './city.js';

export const CAR_COLORS = [0xd93a3a, 0x3a7bd9, 0xf2c14e, 0x3aa655, 0x8e44ad, 0xe67e22, 0xeeeeee, 0x222831, 0x2ec4b6, 0xff8fa3];
const CAR_NAMES = ['Comet', 'Vagabond', 'Sunrunner', 'Marlin', 'Dune', 'Cortez', 'Breeze', 'Falcon'];

export function makeCarMesh(color, isPolice = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1c2733 : color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2b3c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.62; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.18, -0.25); cabin.castShadow = true; g.add(cabin);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.14, 4.42),
    new THREE.MeshLambertMaterial({ color: 0x111111 }));
  trim.position.y = 0.36; g.add(trim);
  // Headlights / taillights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const s of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    h.position.set(s, 0.72, 2.21); g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.1), tailMat);
    t.position.set(s, 0.72, -2.21); g.add(t);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    bar.position.set(0, 1.55, -0.25); g.add(bar);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    r.position.set(-0.28, 1.56, -0.25); g.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    b.position.set(0.28, 1.56, -0.25); g.add(b);
    g.userData.lightBar = { r, b };
    const star = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    star.position.set(0, 0.8, 1.02); g.add(star);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x161616 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

export class Car {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.name = opts.name || pick(CAR_NAMES);
    this.isPolice = !!opts.isPolice;
    this.isPlayer = false;
    this.mesh = makeCarMesh(opts.color ?? pick(CAR_COLORS), this.isPolice);
    this.mesh.position.set(opts.x || 0, 0, opts.z || 0);
    this.mesh.rotation.y = opts.heading || 0;
    scene.add(this.mesh);
    this.speed = 0;               // m/s, forward positive
    this.steer = 0;
    this.maxSpeed = this.isPolice ? 34 : 30;
    this.ai = opts.ai || null;    // 'traffic' | 'police' | null
    this.waypoints = opts.waypoints || null;
    this.wpIndex = 0;
    this.alive = true;
    this.health = 100;
    this.lastCrash = 0;
    this.parked = !!opts.parked;
    this.driver = null;           // pedestrian driving it (traffic)
    this.flashT = 0;
  }

  get pos() { return this.mesh.position; }
  get heading() { return this.mesh.rotation.y; }
  set heading(v) { this.mesh.rotation.y = v; }

  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  update(dt, ctx) {
    if (!this.alive) return;
    if (this.ai === 'traffic') this.updateTraffic(dt, ctx);
    else if (this.ai === 'police') this.updatePolice(dt, ctx);
    else if (this.isPlayer) this.updatePlayer(dt, ctx);
    // Integrate.
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    // Wheels spin + front wheels steer.
    const wheels = this.mesh.userData.wheels;
    const spin = this.speed * dt / 0.38;
    for (const w of wheels) w.rotation.x += spin;
    wheels[0].rotation.y = this.steer * 0.5; wheels[1].rotation.y = this.steer * 0.5;
    // Police light bar flash.
    if (this.isPolice) {
      this.flashT += dt;
      const on = Math.floor(this.flashT * 6) % 2 === 0;
      const bar = this.mesh.userData.lightBar;
      if (bar) { bar.r.material.color.setHex(on ? 0xff2222 : 0x551111); bar.b.material.color.setHex(on ? 0x112266 : 0x2266ff); }
    }
    // Building collision: bounce off and slow down.
    if (ctx.city.collideCircle(this.pos, 2.2)) {
      if (Math.abs(this.speed) > 6 && this.lastCrash < ctx.time - 0.5) {
        this.lastCrash = ctx.time;
        ctx.effects.crashSparks(this.pos.x, 1, this.pos.z);
        ctx.audio.crash();
        ctx.game.onCarCrash(this);
      }
      this.speed *= -0.25;
    }
  }

  updatePlayer(dt, ctx) {
    const input = ctx.input;
    const accel = input.forward ? 16 : input.back ? -11 : 0;
    const drag = this.speed > 0 ? 6 : 4;
    this.speed += accel * dt;
    this.speed -= Math.sign(this.speed) * drag * dt * (input.forward || input.back ? 0.25 : 1);
    if (Math.abs(this.speed) < 0.3 && !input.forward && !input.back) this.speed = 0;
    this.speed = clamp(this.speed, -12, this.maxSpeed);
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer = angleLerp(this.steer, steerTarget * 0.55, Math.min(1, dt * 8));
    const spd = clamp(Math.abs(this.speed) / 12, 0, 1);
    this.heading += this.steer * spd * dt * (this.speed >= 0 ? 1 : -1) * 1.9;
    if (input.handbrake && Math.abs(this.speed) > 4) {
      this.speed *= Math.pow(0.4, dt * 3);
      this.heading += this.steer * dt * 1.2;
      if (Math.random() < dt * 8) ctx.effects.dust(this.pos.x, 0.3, this.pos.z);
    }
    ctx.audio.setEngine(clamp(Math.abs(this.speed) / this.maxSpeed, 0, 1), true);
  }

  updateTraffic(dt, ctx) {
    // Follow the road grid: drive to the next waypoint, turn at intersections.
    const wp = this.waypoints[this.wpIndex % this.waypoints.length];
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const targetHeading = Math.atan2(dx, dz);
    const diff = ((targetHeading - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.steer = clamp(diff * 1.4, -0.5, 0.5);
    this.heading += this.steer * dt * 1.6;
    // Slow down for a car ahead.
    let targetSpeed = 9;
    for (const other of ctx.cars) {
      if (other === this || !other.alive) continue;
      const ddx = other.pos.x - this.pos.x, ddz = other.pos.z - this.pos.z;
      const dist = Math.hypot(ddx, ddz);
      if (dist < 12) {
        const ahead = ddx * Math.sin(this.heading) + ddz * Math.cos(this.heading);
        if (ahead > 0) { targetSpeed = 0; break; }
      }
    }
    this.speed += clamp(targetSpeed - this.speed, -8 * dt, 6 * dt);
    if (Math.hypot(dx, dz) < 6) this.wpIndex++;
  }

  updatePolice(dt, ctx) {
    const target = ctx.game.playerTarget();
    if (!target) { this.speed = Math.max(0, this.speed - 10 * dt); return; }
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    const diff = ((targetHeading - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.steer = clamp(diff * 1.8, -0.6, 0.6);
    this.heading += this.steer * dt * 2.1;
    const targetSpeed = dist > 8 ? this.maxSpeed : 6;
    this.speed += clamp(targetSpeed - this.speed, -14 * dt, 12 * dt);
    // Ram the player when close and on foot nearby.
    if (dist < 4 && ctx.time - this.lastCrash > 1) {
      this.lastCrash = ctx.time;
      ctx.game.onPoliceRam(this);
    }
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && this.alive) {
      this.alive = false;
      this.mesh.visible = false;
    }
  }

  remove() { this.scene.remove(this.mesh); }
}

// Build a loop of waypoints around city blocks for one traffic car.
export function makeTrafficLoop() {
  const lines = [];
  for (let k = -3; k <= 3; k++) lines.push(k * CITY.pitch);
  const x = pick(lines), z = pick(lines);
  const loop = [];
  const dir = Math.random() < 0.5 ? 1 : -1;
  // Rectangle around one block, on the road centre lines.
  const bx = Math.round(x / CITY.pitch), bz = Math.round(z / CITY.pitch);
  const x0 = (bx - 1) * CITY.pitch, x1 = (bx + 1) * CITY.pitch;
  const z0 = (bz - 1) * CITY.pitch, z1 = (bz + 1) * CITY.pitch;
  loop.push({ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 });
  if (dir < 0) loop.reverse();
  return loop;
}
