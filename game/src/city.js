// Solstice City itself: roads, blocks, buildings, palms, beach, sea, marina.
// Deterministic layout (seeded RNG) so every visit looks the same.
import * as THREE from 'three';
import { mulberry32, rand, randInt, pick, clamp, chance } from './util.js';

export const WORLD = {
  half: 240,
  roadCoords: [-180, -120, -60, 0, 60, 120, 180],
  roadHalf: 6,
  seaX: 205,
};

function makeFacadeTexture(rng, base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Subtle vertical shading.
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // Window grid.
  for (let y = 14; y < 248; y += 22) {
    for (let x = 10; x < 120; x += 20) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : (rng() < 0.5 ? '#2c3e55' : '#33475f');
      g.fillRect(x, y, 13, 15);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x, y, 13, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePalm(rng) {
  const palm = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b4a });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 5.4, 6), trunkMat);
  trunk.position.y = 2.7;
  trunk.rotation.z = rand(rng, -0.08, 0.08);
  palm.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e4f, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 4), leafMat);
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.1, 5.6, Math.sin(a) * 1.1);
    leaf.rotation.z = Math.cos(a) * 1.15;
    leaf.rotation.x = -Math.sin(a) * 1.15;
    palm.add(leaf);
  }
  const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
  nuts.position.y = 5.3;
  palm.add(nuts);
  palm.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return palm;
}

function makeLamp() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6),
    new THREE.MeshLambertMaterial({ color: 0x22242a }),
  );
  pole.position.y = 2.6;
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.1, 0.1),
    new THREE.MeshLambertMaterial({ color: 0x22242a }),
  );
  arm.position.set(0.7, 5.15, 0);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffdf7a, emissiveIntensity: 0.9 }),
  );
  bulb.position.set(1.45, 5.05, 0);
  g.add(pole, arm, bulb);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function districtAt(x, z) {
  if (x > 170) return 'Palm Beach';
  if (x > 110 && z < -40) return 'Marina Bay';
  if (x > 110) return 'Harbor Docks';
  if (Math.abs(x) < 40 && Math.abs(z) < 40) return 'Solstice Plaza';
  if (z < -60) return 'Downtown';
  if (x < -120) return 'Old Town';
  if (z > 120) return 'Southside';
  return 'Midtown';
}

export function buildCity(scene) {
  const rng = mulberry32(20261117);
  const colliders = [];
  const clouds = [];

  // Sky, sun and haze.
  scene.background = new THREE.Color(0x8ec8ee);
  scene.fog = new THREE.Fog(0x9fd0ef, 180, 520);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1cf, 2.1);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 520;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // Ground: grass base, then sand beach, then the sea.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(960, 960),
    new THREE.MeshLambertMaterial({ color: 0x6fae5e }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 480),
    new THREE.MeshLambertMaterial({ color: 0xe8d49a }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(217, 0.03, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 960),
    new THREE.MeshLambertMaterial({ color: 0x2e7fc2 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(400, 0.02, 0);
  scene.add(sea);

  // Clouds drift slowly.
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Group();
    const puffs = randInt(rng, 3, 5);
    for (let j = 0; j < puffs; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rand(rng, 6, 13), 8, 6), cloudMat);
      s.position.set(j * rand(rng, 7, 11) - puffs * 4, rand(rng, -1, 1.5), rand(rng, -4, 4));
      s.scale.y = 0.45;
      cloud.add(s);
    }
    cloud.position.set(rand(rng, -260, 260), rand(rng, 70, 110), rand(rng, -260, 260));
    cloud.userData.drift = rand(rng, 0.6, 1.6);
    scene.add(cloud);
    clouds.push(cloud);
  }

  // Roads: asphalt strips + sidewalks + markings + crosswalks.
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x3d4148 });
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a3 });
  const lineMat = new THREE.MeshLambertMaterial({ color: 0xf5c542 });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const roadY = 0.05;
  for (const c of WORLD.roadCoords) {
    for (const axis of ['x', 'z']) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? 480 : 12, 0.1, axis === 'x' ? 12 : 480), asphalt);
      strip.position.set(axis === 'x' ? 0 : c, roadY, axis === 'x' ? c : 0);
      strip.receiveShadow = true;
      scene.add(strip);
      // Sidewalks on both sides.
      for (const s of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? 480 : 3, 0.12, axis === 'x' ? 3 : 480), sidewalkMat);
        walk.position.set(axis === 'x' ? 0 : c + s * 7.5, 0.06, axis === 'x' ? c + s * 7.5 : 0);
        walk.receiveShadow = true;
        scene.add(walk);
      }
      // Dashed center line.
      for (let t = -232; t < 232; t += 8) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? 3.4 : 0.35, 0.06, axis === 'x' ? 0.35 : 3.4), lineMat);
        dash.position.set(axis === 'x' ? t : c, 0.11, axis === 'x' ? c : t);
        scene.add(dash);
      }
    }
    // Crosswalks at every intersection.
    for (const d of WORLD.roadCoords) {
      for (let k = -2; k <= 2; k++) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 4.6), whiteMat);
        stripe.position.set(d + k * 2.2, 0.11, c - 4.6);
        scene.add(stripe);
        const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.06, 1.1), whiteMat);
        stripe2.position.set(c - 4.6, 0.11, d + k * 2.2);
        scene.add(stripe2);
      }
    }
  }

  // Buildings: one to three per block, window-textured, with roof clutter.
  const facades = [
    makeFacadeTexture(rng, '#b98a5e', 0.25),
    makeFacadeTexture(rng, '#7d8ea3', 0.3),
    makeFacadeTexture(rng, '#a3b7c9', 0.2),
    makeFacadeTexture(rng, '#c9a37d', 0.35),
    makeFacadeTexture(rng, '#8a9a8d', 0.22),
  ];
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4d52 });
  const blockCenters = [];
  for (const bx of [-150, -90, -30, 30, 90, 150]) {
    for (const bz of [-150, -90, -30, 30, 90, 150]) blockCenters.push([bx, bz]);
  }
  for (const [bx, bz] of blockCenters) {
    // Plaza block stays open; beach blocks stay open; two parks.
    if (bx === -30 && bz === -30) continue; // Solstice Plaza
    if (bx === 150) continue; // beachfront: palms + low shacks only
    if ((bx === -150 && bz === 150) || (bx === 90 && bz === -150)) {
      // Park: trees + lawn.
      for (let i = 0; i < 7; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.6, 6), new THREE.MeshLambertMaterial({ color: 0x7a5a38 }));
        trunk.position.y = 1.3;
        const top = new THREE.Mesh(new THREE.SphereGeometry(rand(rng, 2.2, 3.4), 8, 6), new THREE.MeshLambertMaterial({ color: 0x3f8f4f }));
        top.position.y = 4.2;
        top.castShadow = true;
        tree.add(trunk, top);
        tree.position.set(bx + rand(rng, -18, 18), 0, bz + rand(rng, -18, 18));
        scene.add(tree);
      }
      continue;
    }
    const downtown = bz < -60;
    const count = downtown ? randInt(rng, 2, 3) : randInt(rng, 1, 2);
    for (let i = 0; i < count; i++) {
      const w = rand(rng, 13, 26);
      const d = rand(rng, 13, 26);
      const h = downtown ? rand(rng, 22, 48) : rand(rng, 8, 22);
      const ox = bx + rand(rng, -14, 14) * (count > 1 ? 0.7 : 0);
      const oz = bz + rand(rng, -14, 14) * (count > 1 ? 0.7 : 0);
      const mat = new THREE.MeshLambertMaterial({ map: pick(rng, facades) });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(ox, h / 2, oz);
      b.castShadow = true;
      b.receiveShadow = true;
      scene.add(b);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 1.2, d * 0.7), roofMat);
      roof.position.set(ox, h + 0.6, oz);
      scene.add(roof);
      if (chance(rng, 0.5)) {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, rand(rng, 3, 6), 5), roofMat);
        ant.position.set(ox + rand(rng, -w / 4, w / 4), h + 3, oz + rand(rng, -d / 4, d / 4));
        scene.add(ant);
      }
      colliders.push({ minX: ox - w / 2, maxX: ox + w / 2, minZ: oz - d / 2, maxZ: oz + d / 2 });
    }
  }

  // Beachfront shacks + palms along the sand.
  for (let z = -160; z <= 160; z += 40) {
    const shack = new THREE.Mesh(
      new THREE.BoxGeometry(10, 4.5, 8),
      new THREE.MeshLambertMaterial({ color: pick(rng, [0xe8b04b, 0x4ba3e8, 0xe86a4b, 0x7ec8a9]) }),
    );
    shack.position.set(196, 2.25, z + rand(rng, -8, 8));
    shack.castShadow = true;
    scene.add(shack);
    colliders.push({ minX: 191, maxX: 201, minZ: z - 4, maxZ: z + 4 });
  }
  for (let z = -200; z <= 200; z += 26) {
    const palm = makePalm(rng);
    palm.position.set(208 + rand(rng, -3, 3), 0, z + rand(rng, -6, 6));
    scene.add(palm);
  }
  // Plaza palms + lamps.
  for (const [px, pz] of [[-24, -24], [24, -24], [-24, 24], [24, 24], [-14, 0], [14, 0]]) {
    const palm = makePalm(rng);
    palm.position.set(px, 0, pz);
    scene.add(palm);
  }
  for (const c of WORLD.roadCoords) {
    for (const d of WORLD.roadCoords) {
      const lamp = makeLamp();
      lamp.position.set(c + 7.5, 0, d + 7.5);
      lamp.rotation.y = Math.PI;
      scene.add(lamp);
    }
  }

  // Plaza fountain.
  const fountain = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 1, 20), new THREE.MeshLambertMaterial({ color: 0xcfd4d6 }));
  rim.position.y = 0.5;
  rim.castShadow = true;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.5, 20), new THREE.MeshLambertMaterial({ color: 0x3fa7d6 }));
  water.position.y = 0.85;
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 2.4, 8), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
  jet.position.y = 2;
  fountain.add(rim, water, jet);
  fountain.position.set(0, 0, 0);
  scene.add(fountain);
  colliders.push({ minX: -6.4, maxX: 6.4, minZ: -6.4, maxZ: 6.4 });

  // Marina: two wooden piers into the sea + moored boats.
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x9a7a52 });
  for (const pz of [-90, -30]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(34, 0.8, 6), woodMat);
    pier.position.set(222, 0.6, pz);
    pier.castShadow = true;
    scene.add(pier);
    for (let i = 0; i < 3; i++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 2.6), new THREE.MeshLambertMaterial({ color: pick(rng, [0xe8e8e8, 0x4ba3e8, 0xe8b04b]) }));
      hull.position.y = 0.8;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 5), woodMat);
      mast.position.y = 3.4;
      boat.add(hull, mast);
      boat.position.set(232 + i * 4, 0, pz + (i % 2 === 0 ? 5.5 : -5.5));
      boat.rotation.y = rand(rng, -0.2, 0.2);
      scene.add(boat);
    }
  }

  // Docks crates (cover for the DOCKSIDE DEAL mission).
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xb08a4e });
  for (let i = 0; i < 8; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), crateMat);
    crate.position.set(150 + (i % 4) * 4, 1.2, 130 + Math.floor(i / 4) * 5);
    crate.rotation.y = rand(rng, 0, 0.8);
    crate.castShadow = true;
    scene.add(crate);
    colliders.push({ minX: crate.position.x - 1.2, maxX: crate.position.x + 1.2, minZ: crate.position.z - 1.2, maxZ: crate.position.z + 1.2 });
  }

  return {
    colliders,
    clouds,
    spawn: { x: 0, z: 26 },
    markers: {
      plaza: { x: 0, z: 12 },
      marina: { x: 198, z: -60 },
      chopshop: { x: -168, z: 138 },
      docks: { x: 152, z: 132 },
      hotwheelsCar: { x: 66, z: -48 },
    },
    districtAt,
  };
}
