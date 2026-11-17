// Solstice City itself: a sun-soaked coastal grid city, built procedurally.
// Streets run on a grid; the east edge is sand and sea. All original.
import * as THREE from 'three';
import { clamp, hashRand, rand, pick, facadeTexture, roadTexture, sidewalkTexture } from './util.js';

export const CITY = {
  pitch: 72,          // block + road
  roadHalf: 8,        // half width of a road
  blocks: 3,          // grid lines at -3..3 * pitch
  half: 252,          // city edge (last road centre 216 + road)
  beachX: 268,        // sand starts here
  seaX: 330,          // water starts here
};

// Named places the missions and the HUD use.
export const PLACES = {
  spawn: { x: 0, z: 36, name: 'Solstice Plaza' },
  rosaCafe: { x: -144, z: -144, name: "Rosa's Café" },
  docks: { x: 36, z: 216, name: 'Sunset Docks' },
  palmGarage: { x: 216, z: 144, name: 'Palm Garage' },
  beachfront: { x: 296, z: -36, name: 'Beachfront' },
  marina: { x: -216, z: 216, name: 'Marina' },
  hotel: { x: 144, z: -216, name: 'Hotel Miramar' },
};

const PALETTES = [
  { base: '#e8b48a', roof: '#b0703f' }, { base: '#f2d8a7', roof: '#8a6b4a' },
  { base: '#cfe3ee', roof: '#5a7a94' }, { base: '#e8c9c9', roof: '#96555e' },
  { base: '#d9e8c9', roof: '#5f7a4a' }, { base: '#f7f3e8', roof: '#7a7468' },
  { base: '#c9d4e8', roof: '#4a5a7a' }, { base: '#e8d5b0', roof: '#9a7b4a' },
];

export class City {
  constructor(scene) {
    this.scene = scene;
    this.buildings = [];   // {minX,maxX,minZ,maxZ,h} AABBs for collision
    this.lamps = [];
    this.palms = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildGround();
    this.buildBlocks();
    this.buildBeach();
    this.buildProps();
    this.buildSky();
  }

  buildGround() {
    const g = this.group;
    // Base ground: warm concrete for the whole city footprint.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.half * 2 + 80, CITY.half * 2 + 80),
      new THREE.MeshLambertMaterial({ color: 0x8f8a80 }),
    );
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 0);
    ground.receiveShadow = true; g.add(ground);

    // Roads: one long plane per grid line, asphalt texture repeated.
    const tex = new THREE.CanvasTexture(roadTexture());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const roadMat = new THREE.MeshLambertMaterial({ map: tex });
    const span = CITY.half * 2 + 40;
    for (let k = -CITY.blocks; k <= CITY.blocks; k++) {
      const c = k * CITY.pitch;
      for (const vertical of [true, false]) {
        const t = tex.clone(); t.needsUpdate = true;
        t.repeat.set(vertical ? 1 : span / 16, vertical ? span / 16 : 1);
        const road = new THREE.Mesh(
          new THREE.PlaneGeometry(vertical ? CITY.roadHalf * 2 : span, vertical ? span : CITY.roadHalf * 2),
          new THREE.MeshLambertMaterial({ map: t }),
        );
        road.rotation.x = -Math.PI / 2;
        road.position.set(vertical ? c : 0, 0, vertical ? 0 : c);
        road.receiveShadow = true;
        g.add(road);
      }
    }
    // Crosswalk stripes at the central intersection.
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
    for (const [sx, sz] of [[-11, 0], [11, 0], [0, -11], [0, 11]]) {
      for (let i = -3; i <= 3; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4), stripeMat);
        s.rotation.x = -Math.PI / 2;
        s.position.set(sx === 0 ? i * 2.2 : sx, 0.02, sz === 0 ? i * 2.2 : sz);
        g.add(s);
      }
    }
  }

  buildBlocks() {
    const g = this.group;
    const sidewalkTex = new THREE.CanvasTexture(sidewalkTexture());
    sidewalkTex.wrapS = sidewalkTex.wrapT = THREE.RepeatWrapping;
    const facadeMats = PALETTES.map((p) => {
      const t = new THREE.CanvasTexture(facadeTexture(p.base));
      t.colorSpace = THREE.SRGBColorSpace;
      return {
        side: new THREE.MeshLambertMaterial({ map: t }),
        roof: new THREE.MeshLambertMaterial({ color: p.roof }),
      };
    });
    const sidewalkMat = new THREE.MeshLambertMaterial({ map: sidewalkTex });
    const plazaMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });

    for (let bx = -CITY.blocks; bx < CITY.blocks; bx++) {
      for (let bz = -CITY.blocks; bz < CITY.blocks; bz++) {
        const cx = (bx + 0.5) * CITY.pitch, cz = (bz + 0.5) * CITY.pitch;
        // Skip the central plaza block: open square with a fountain.
        if (bx === 0 && bz === 0) {
          const plaza = new THREE.Mesh(new THREE.PlaneGeometry(52, 52), plazaMat);
          plaza.rotation.x = -Math.PI / 2; plaza.position.set(cx, 0.01, cz);
          g.add(plaza);
          const fountain = new THREE.Mesh(
            new THREE.CylinderGeometry(5, 6, 1.2, 20),
            new THREE.MeshLambertMaterial({ color: 0x7a9ab0 }),
          );
          fountain.position.set(cx, 0.6, cz); g.add(fountain);
          const water = new THREE.Mesh(
            new THREE.CylinderGeometry(4.4, 4.4, 0.4, 20),
            new THREE.MeshLambertMaterial({ color: 0x3fa7d6, transparent: true, opacity: 0.85 }),
          );
          water.position.set(cx, 1.1, cz); g.add(water);
          continue;
        }
        // Sidewalk slab for the block.
        const sw = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), sidewalkMat);
        sw.rotation.x = -Math.PI / 2; sw.position.set(cx, 0.02, cz);
        sw.receiveShadow = true; g.add(sw);
        // 2x2 buildings per block (some blocks hold a park instead).
        const isPark = hashRand(bx, bz, 7) < 0.14;
        if (isPark) { this.buildPark(cx, cz); continue; }
        for (let ix = 0; ix < 2; ix++) {
          for (let iz = 0; iz < 2; iz++) {
            const h = hashRand(bx * 2 + ix, bz * 2 + iz, 3);
            if (h < 0.12) continue; // empty lot / parking
            const w = rand(14, 20), d = rand(14, 20);
            const height = 10 + Math.pow(hashRand(bx * 2 + ix, bz * 2 + iz, 11), 1.6) * 52;
            const px = cx + (ix === 0 ? -13 : 13), pz = cz + (iz === 0 ? -13 : 13);
            const mat = pick(facadeMats);
            const box = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), mat.side);
            box.position.set(px, height / 2, pz);
            box.castShadow = true; box.receiveShadow = true;
            g.add(box);
            const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6), mat.roof);
            roof.position.set(px, height + 0.4, pz); g.add(roof);
            if (height > 30) {
              const antenna = new THREE.Mesh(
                new THREE.CylinderGeometry(0.15, 0.15, 6, 6),
                new THREE.MeshLambertMaterial({ color: 0x333333 }),
              );
              antenna.position.set(px + w / 4, height + 3.5, pz); g.add(antenna);
            }
            this.buildings.push({ minX: px - w / 2, maxX: px + w / 2, minZ: pz - d / 2, maxZ: pz + d / 2, h: height });
          }
        }
      }
    }
  }

  buildPark(cx, cz) {
    const g = this.group;
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(54, 54),
      new THREE.MeshLambertMaterial({ color: 0x6fae5e }),
    );
    grass.rotation.x = -Math.PI / 2; grass.position.set(cx, 0.03, cz); g.add(grass);
    for (let i = 0; i < 6; i++) this.addPalm(cx + rand(-22, 22), cz + rand(-22, 22), rand(0.8, 1.2));
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(7, 20),
      new THREE.MeshLambertMaterial({ color: 0x3fa7d6 }),
    );
    pond.rotation.x = -Math.PI / 2; pond.position.set(cx + 12, 0.06, cz - 10); g.add(pond);
  }

  buildBeach() {
    const g = this.group;
    // Sand strip.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(90, CITY.half * 2 + 120),
      new THREE.MeshLambertMaterial({ color: 0xeed9a4 }),
    );
    sand.rotation.x = -Math.PI / 2; sand.position.set(CITY.beachX + 45, 0.01, 0);
    sand.receiveShadow = true; g.add(sand);
    // Sea.
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(600, CITY.half * 2 + 400),
      new THREE.MeshLambertMaterial({ color: 0x2e86c1, transparent: true, opacity: 0.94 }),
    );
    sea.rotation.x = -Math.PI / 2; sea.position.set(CITY.seaX + 300, 0.02, 0); g.add(sea);
    // Foam line.
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(4, CITY.half * 2 + 120),
      new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.7 }),
    );
    foam.rotation.x = -Math.PI / 2; foam.position.set(CITY.seaX - 2, 0.05, 0); g.add(foam);
    // Boardwalk + palms + umbrellas along the sand.
    for (let z = -240; z <= 240; z += 40) {
      this.addPalm(CITY.beachX + 12, z + rand(-6, 6), rand(0.9, 1.3));
      const um = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6),
        new THREE.MeshLambertMaterial({ color: 0x8a6b4a }));
      pole.position.y = 1.3; um.add(pole);
      const top = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.1, 10),
        new THREE.MeshLambertMaterial({ color: pick([0xff6b6b, 0xffd166, 0x4ecdc4, 0xff8fa3]) }));
      top.position.y = 2.9; um.add(top);
      um.position.set(CITY.beachX + 26, 0, z + 18); g.add(um);
    }
    // Pier jutting into the sea at the docks end.
    const pier = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 8),
      new THREE.MeshLambertMaterial({ color: 0x7a5a3a }));
    pier.position.set(CITY.seaX + 26, 0.5, 216); g.add(pier);
  }

  addPalm(x, z, s = 1) {
    const g = this.group;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25 * s, 0.4 * s, 6 * s, 7),
      new THREE.MeshLambertMaterial({ color: 0x8a6b4a }),
    );
    trunk.position.set(x, 3 * s, z); trunk.rotation.z = rand(-0.08, 0.08);
    trunk.castShadow = true; g.add(trunk);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7 * s, 3.4 * s, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.3 * s, 6.2 * s, z + Math.sin(a) * 1.3 * s);
      leaf.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      g.add(leaf);
    }
    this.palms.push({ x, z });
  }

  buildProps() {
    const g = this.group;
    // Street lamps along every road.
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2c30 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (let k = -CITY.blocks; k <= CITY.blocks; k++) {
      const c = k * CITY.pitch;
      for (let t = -CITY.half + 20; t <= CITY.half; t += 36) {
        for (const [x, z] of [[c + 10, t], [t, c + 10]]) {
          if (Math.abs(x) > CITY.half || Math.abs(z) > CITY.half) continue;
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 6), poleMat);
          pole.position.set(x, 3.5, z); g.add(pole);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 2.4), poleMat);
          arm.position.set(x, 6.9, z - 1); g.add(arm);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), bulbMat);
          bulb.position.set(x, 6.8, z - 2.1); g.add(bulb);
          this.lamps.push({ x, z });
        }
      }
    }
    // Traffic-light posts at the four central intersections.
    for (const [x, z] of [[-72, -72], [72, -72], [-72, 72], [72, 72]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6, 6), poleMat);
      post.position.set(x + 9, 3, z + 9); g.add(post);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9),
        new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
      head.position.set(x + 9, 6.4, z + 9); g.add(head);
      for (let i = 0; i < 3; i++) {
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.28, 10),
          new THREE.MeshBasicMaterial({ color: [0xff3b30, 0xffcc00, 0x34c759][i] }));
        lamp.position.set(x + 9, 7.2 - i * 0.65, z + 9.46); g.add(lamp);
      }
    }
  }

  buildSky() {
    const { scene } = this;
    scene.background = new THREE.Color(0x87bfe8);
    scene.fog = new THREE.Fog(0x9fc8e8, 260, 900);
    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe6b0, 2.0);
    sun.position.set(180, 260, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -280; sun.shadow.camera.right = 280;
    sun.shadow.camera.top = 280; sun.shadow.camera.bottom = -280;
    sun.shadow.camera.far = 800;
    scene.add(sun);
    this.sun = sun;
    // A low warm sun disc + a few clouds, purely decorative.
    const disc = new THREE.Mesh(new THREE.CircleGeometry(18, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }));
    disc.position.set(420, 200, -520); disc.lookAt(0, 40, 0); scene.add(disc);
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 10; i++) {
      const cl = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(8, 16), 10, 8), cloudMat);
        puff.position.set(j * 12 - 12, rand(-2, 2), rand(-4, 4)); puff.scale.y = 0.45; cl.add(puff);
      }
      cl.position.set(rand(-420, 420), rand(120, 180), rand(-420, 420));
      scene.add(cl);
    }
  }

  // ---- queries used by gameplay ----
  isOnRoad(x, z) {
    const p = CITY.pitch, r = CITY.roadHalf + 1;
    const mx = Math.abs(((x + p / 2) % p + p) % p - p / 2);
    const mz = Math.abs(((z + p / 2) % p + p) % p - p / 2);
    return mx < r || mz < r;
  }

  roadCentres() {
    const lines = [];
    for (let k = -CITY.blocks; k <= CITY.blocks; k++) lines.push(k * CITY.pitch);
    return lines;
  }

  // Push a circle (x,z,r) out of building AABBs. Returns true if it hit one.
  collideCircle(pos, r) {
    let hit = false;
    for (const b of this.buildings) {
      if (pos.x > b.minX - r && pos.x < b.maxX + r && pos.z > b.minZ - r && pos.z < b.maxZ + r) {
        const dxl = pos.x - (b.minX - r), dxr = (b.maxX + r) - pos.x;
        const dzl = pos.z - (b.minZ - r), dzr = (b.maxZ + r) - pos.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) pos.x = b.minX - r; else if (m === dxr) pos.x = b.maxX + r;
        else if (m === dzl) pos.z = b.minZ - r; else pos.z = b.maxZ + r;
        hit = true;
      }
    }
    // World bounds: beach wall on the west/north/south, sea on the east.
    pos.x = clamp(pos.x, -CITY.half - 20, CITY.seaX + 40);
    pos.z = clamp(pos.z, -CITY.half - 20, CITY.half + 20);
    return hit;
  }

  districtName(x, z) {
    if (x > CITY.beachX) return 'Beachfront';
    if (x > 150) return 'Palm Row';
    if (z > 150) return 'Sunset Docks';
    if (x < -150 && z > 100) return 'Marina';
    if (Math.abs(x) < 80 && Math.abs(z) < 80) return 'Solstice Plaza';
    if (x < -100) return 'Old Town';
    return 'Downtown';
  }
}
