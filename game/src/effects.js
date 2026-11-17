// Particles, tracers, smoke and screen shake: cheap pooled meshes,
// no textures, no allocations per frame beyond a small ring buffer.
import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.tracers = [];
    this.shake = 0;
    this.particleGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    this.mats = {};
  }

  mat(color) {
    if (!this.mats[color]) this.mats[color] = new THREE.MeshBasicMaterial({ color });
    return this.mats[color];
  }

  burst(pos, color, count, speed = 4) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.particleGeo, this.mat(color));
      m.position.copy(pos);
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 3 + 1;
      this.particles.push({
        mesh: m,
        vx: Math.cos(a) * speed * (0.4 + Math.random() * 0.8),
        vy: up,
        vz: Math.sin(a) * speed * (0.4 + Math.random() * 0.8),
        life: 0.5 + Math.random() * 0.4,
        age: 0,
      });
    }
    if (this.particles.length > 320) {
      const extra = this.particles.splice(0, this.particles.length - 320);
      for (const p of extra) this.scene.remove(p.mesh);
    }
  }

  smoke(pos, count = 6) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.particleGeo, this.mat(0x9aa0a3));
      m.scale.setScalar(2.2);
      m.position.set(pos.x + (Math.random() - 0.5), pos.y + 0.3, pos.z + (Math.random() - 0.5));
      this.scene.add(m);
      this.particles.push({
        mesh: m, vx: (Math.random() - 0.5) * 0.6, vy: 1.2 + Math.random(), vz: (Math.random() - 0.5) * 0.6,
        life: 0.9 + Math.random() * 0.5, age: 0, grow: true,
      });
    }
  }

  tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95 }));
    this.scene.add(line);
    this.tracers.push({ line, age: 0, life: 0.09 });
  }

  addShake(amount) { this.shake = Math.min(0.6, this.shake + amount); }

  update(dt, camera) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= 9 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.08, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      if (p.grow) p.mesh.scale.multiplyScalar(1 + dt * 1.4);
      p.mesh.rotation.x += dt * 3;
      p.mesh.rotation.y += dt * 2;
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.age += dt;
      if (t.age >= t.life) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    if (this.shake > 0.001 && camera) {
      camera.position.x += (Math.random() - 0.5) * this.shake * 0.35;
      camera.position.y += (Math.random() - 0.5) * this.shake * 0.35;
      this.shake *= Math.exp(-6 * dt);
    }
  }
}
