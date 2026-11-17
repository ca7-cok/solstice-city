// Particles: one pooled THREE.Points cloud for sparks, dust, muzzle and blood.
import * as THREE from 'three';
import { rand } from './util.js';

const MAX = 600;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(x, y, z, color, n, speed, up, life, gravity) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX) this.parts.shift();
      const a = rand(Math.PI * 2);
      this.parts.push({
        x, y, z,
        vx: Math.cos(a) * rand(0.3, 1) * speed,
        vy: rand(0.2, 1) * up,
        vz: Math.sin(a) * rand(0.3, 1) * speed,
        life: rand(life * 0.6, life), maxLife: life,
        r: color.r, g: color.g, b: color.b, gravity,
      });
    }
  }

  crashSparks(x, y, z) { this.spawn(x, y, z, new THREE.Color(0xffc233), 26, 7, 4, 0.7, 14); }
  dust(x, y, z) { this.spawn(x, y, z, new THREE.Color(0xcbb89a), 6, 2.5, 1.2, 0.9, 1); }
  muzzle(x, y, z) { this.spawn(x, y, z, new THREE.Color(0xffe27a), 10, 5, 1, 0.18, 0); }
  blood(x, y, z) { this.spawn(x, y, z, new THREE.Color(0xc01818), 14, 3, 2, 0.6, 10); }
  cashBurst(x, y, z) { this.spawn(x, y, z, new THREE.Color(0x7dff9b), 20, 4, 5, 1.0, 8); }

  update(dt) {
    const pos = this.points.geometry.attributes.position.array;
    const col = this.points.geometry.attributes.color.array;
    let i = 0;
    this.parts = this.parts.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy = 0; }
      const f = p.life / p.maxLife;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 3] = p.r * f; col[i * 3 + 1] = p.g * f; col[i * 3 + 2] = p.b * f;
      i++;
      return true;
    });
    // Hide the rest off-screen.
    for (; i < MAX; i++) { pos[i * 3 + 1] = -100; }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
