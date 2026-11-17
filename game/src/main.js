// Solstice City — main bootstrap and game loop.
// An original open-world crime game: city, cars, traffic, pedestrians,
// stealing, wanted stars, police, three missions, combat, HUD + minimap,
// start menu, localStorage saves and synthesised sound. No network requests.
import * as THREE from 'three';
import { City, PLACES, CITY } from './city.js';
import { Car, makeTrafficLoop } from './vehicles.js';
import { Pedestrian } from './pedestrians.js';
import { Player } from './player.js';
import { WantedSystem } from './police.js';
import { Combat } from './combat.js';
import { MissionManager } from './missions.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Effects } from './effects.js';
import { loadSave, writeSave } from './save.js';
import { rand, clamp } from './util.js';

class Game {
  constructor() {
    this.state = 'menu'; // menu | playing | paused | wasted
    this.money = 250;
    this.missionsDone = [];
    this.time = 0;
    this.cameraYaw = 0;
    this.cameraPitch = 0.32;
    this.cameraDist = 9;
    this.params = new URLSearchParams(location.search);
    this.shot = this.params.get('shot') || null;
    this.autoStart = this.params.get('autostart') === '1' || (this.shot && this.shot !== 'menu');
    this.setupRenderer();
    this.setupWorld();
    this.hud = new HUD(this);
    this.input = new Input(this);
    this.ctx.input = this.input; // ctx was built in setupWorld before Input existed
    this.wireInput();
    this.wireMenu();
    this.applyShotStaging();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
    document.getElementById('loading').style.display = 'none';
    if (this.autoStart) this.startGame(false);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.classList.add('game');
    document.getElementById('app').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
    this.camera.position.set(0, 30, 60);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  setupWorld() {
    this.city = new City(this.scene);
    this.effects = new Effects(this.scene);
    this.audio = new AudioEngine();
    this.player = new Player(this.scene, PLACES.spawn.x, PLACES.spawn.z);
    this.cars = [];
    this.peds = [];
    // Parked, stealable cars around the city.
    const parkedSpots = [
      { x: -72, z: 30, heading: Math.PI / 2 }, { x: 72, z: -30, heading: -Math.PI / 2 },
      { x: -144, z: 120, heading: 0 }, { x: 144, z: 60, heading: Math.PI },
      { x: 30, z: -144, heading: Math.PI / 2 }, { x: -30, z: 144, heading: 0 },
      { x: 216, z: -60, heading: -Math.PI / 2 }, { x: -216, z: -120, heading: Math.PI },
      { x: 60, z: 216, heading: Math.PI / 2 }, { x: -216, z: 60, heading: 0 },
    ];
    for (const s of parkedSpots) {
      this.cars.push(new Car(this.scene, { ...s, parked: true }));
    }
    // AI traffic.
    for (let i = 0; i < 10; i++) {
      const loop = makeTrafficLoop();
      const start = loop[0];
      this.cars.push(new Car(this.scene, {
        x: start.x, z: start.z, ai: 'traffic', waypoints: loop,
        heading: Math.atan2(loop[1].x - loop[0].x, loop[1].z - loop[0].z),
      }));
    }
    // Pedestrians on the sidewalks.
    for (let i = 0; i < 26; i++) {
      const bx = Math.floor(rand(-3, 3)) * CITY.pitch + rand(-20, 20);
      const bz = Math.floor(rand(-3, 3)) * CITY.pitch + rand(-20, 20);
      this.peds.push(new Pedestrian(this.scene, bx, bz));
    }
    this.ctx = {
      scene: this.scene, camera: this.camera, city: this.city, cars: this.cars,
      peds: this.peds, player: this.player, input: this.input, audio: this.audio,
      effects: this.effects, game: this, time: 0, cameraYaw: 0,
    };
    this.wanted = new WantedSystem(this);
    this.combat = new Combat(this);
    this.missions = new MissionManager(this);
  }

  wireInput() {
    this.input.onShoot = () => this.combat.shoot();
    this.input.onReload = () => this.combat.reload();
    this.input.onPunch = () => this.combat.punch();
    this.input.onInteract = () => this.interact();
    this.input.onPause = () => {
      if (this.state === 'playing') this.pauseGame();
      else if (this.state === 'paused') this.resumeGame();
    };
    this.input.onSave = () => { if (this.state === 'playing') { this.saveGame(); this.hud.toast('GAME SAVED', 'Progress stored on this device.'); } };
    this.input.onHelp = () => {
      const h = document.getElementById('hint');
      h.classList.toggle('hidden');
    };
  }

  wireMenu() {
    document.getElementById('btn-start').addEventListener('click', () => this.startGame(true));
    document.getElementById('btn-continue').addEventListener('click', () => this.startGame(false));
    document.getElementById('btn-resume').addEventListener('click', () => this.resumeGame());
    document.getElementById('btn-save').addEventListener('click', () => { this.saveGame(); this.hud.toast('GAME SAVED', 'Progress stored on this device.'); });
    document.getElementById('btn-quit').addEventListener('click', () => {
      this.state = 'menu';
      document.getElementById('pause').classList.add('hidden');
      document.getElementById('menu').classList.remove('hidden');
      this.hud.hideHud();
    });
    document.getElementById('btn-retry').addEventListener('click', () => this.retryAfterDeath());
    const save = loadSave();
    if (save) document.getElementById('btn-continue').classList.remove('hidden');
  }

  startGame(fresh) {
    this.audio.ensure();
    if (fresh) {
      this.money = 250; this.missionsDone = [];
      this.player.teleport(PLACES.spawn.x, PLACES.spawn.z);
      this.player.health = 100; this.player.ammo = 30; this.player.reserveAmmo = 90;
      this.wanted.clear();
    } else {
      const save = loadSave();
      if (save) {
        this.money = save.money ?? 250;
        this.missionsDone = save.missionsDone || [];
        this.player.health = save.health ?? 100;
        if (save.player) this.player.teleport(save.player.x, save.player.z);
      }
    }
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('wasted').style.display = 'none';
    this.state = 'playing';
    this.hud.showHud();
    this.hud.say('Rosa', 'Mara! You made it. Come see me at the café — first job is waiting.');
  }

  pauseGame() {
    this.state = 'paused';
    document.getElementById('pause').classList.remove('hidden');
    this.audio.setEngine(0, false);
  }

  resumeGame() {
    this.state = 'playing';
    document.getElementById('pause').classList.add('hidden');
  }

  retryAfterDeath() {
    document.getElementById('wasted').style.display = 'none';
    this.player.dead = false;
    this.player.health = 100;
    this.player.teleport(PLACES.spawn.x, PLACES.spawn.z);
    this.player.ammo = 30; this.player.reserveAmmo = 90;
    this.wanted.clear();
    this.money = Math.max(0, this.money - 100);
    this.state = 'playing';
    this.hud.showHud();
    this.hud.toast('BACK ON YOUR FEET', 'The hospital bill cost you $100. Stay sharp.');
  }

  saveGame() {
    writeSave({
      money: this.money,
      missionsDone: this.missionsDone,
      activeMission: this.missions.active ? this.missions.active.id : null,
      playerPos: this.player.inCar ? this.player.inCar.pos : this.player.pos,
      health: this.player.health,
    });
  }

  missionListText() {
    return this.missions.defs.map((d) => {
      const done = this.missionsDone.includes(d.id);
      const active = this.missions.active && this.missions.active.id === d.id;
      return `${done ? '✓' : active ? '▶' : '○'} ${d.title} — ${done ? 'done' : active ? 'in progress' : 'available'} ($${d.reward})`;
    }).join('  •  ');
  }

  // E key: enter/exit the nearest car, or start a mission at its marker.
  interact() {
    if (this.state !== 'playing' || this.player.dead) return;
    const p = this.player;
    if (p.inCar) { this.exitCar(); return; }
    // Mission markers take priority over nearby cars.
    if (this.missions.tryStartNearPlayer()) return;
    // Nearest car within 3.5 m?
    let best = null, bestD = 3.5;
    for (const car of this.cars) {
      if (!car.alive) continue;
      const d = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
      if (d < bestD) { best = car; bestD = d; }
    }
    if (best) { this.enterCar(best); return; }
    this.hud.toast('NOTHING HERE', 'Find a car to steal, or the ◆ mission marker.');
  }

  enterCar(car) {
    const p = this.player;
    if (car.parked || car.ai === 'traffic') {
      // Stealing: the driver (if any) bails, the PD notices.
      if (car.ai === 'traffic') {
        car.ai = null; car.parked = false;
        this.wanted.addCrime(1, 'You jacked a car in traffic.');
      } else if (car.parked) {
        car.parked = false;
        this.wanted.addCrime(0, ''); // parked cars: no heat unless the mission says so
      }
    }
    p.inCar = car;
    car.isPlayer = true;
    car.speed = 0;
    p.mesh.visible = false;
    this.audio.door();
    this.hud.toast(`${car.name.toUpperCase()} — YOURS NOW`, car.isPolice ? 'Careful: this one has a radio.' : 'W A S D to drive • Space handbrake • E to get out');
  }

  exitCar() {
    const p = this.player;
    const car = p.inCar;
    if (!car) return;
    car.isPlayer = false;
    car.speed = 0;
    p.inCar = null;
    p.mesh.visible = true;
    const fx = Math.sin(car.heading + Math.PI / 2), fz = Math.cos(car.heading + Math.PI / 2);
    p.pos.set(car.pos.x + fx * 2.2, 0, car.pos.z + fz * 2.2);
    p.heading = car.heading;
    this.audio.setEngine(0, false);
    this.audio.door();
  }

  onCarCrash(car) {
    if (car.isPlayer) this.hud.toast('CRASH!', 'Watch the paintwork, Mara.');
  }

  onPedestrianHit(ped, car) {
    if (ped.state === 'dead') return;
    ped.kill();
    this.effects.blood(ped.pos.x, 1, ped.pos.z);
    this.wanted.addCrime(1, 'You ran someone over.');
    for (const other of this.peds) {
      if (other.alive && Math.hypot(other.pos.x - ped.pos.x, other.pos.z - ped.pos.z) < 20) other.panic();
    }
  }

  onPoliceRam(car) {
    if (this.player.inCar === car) return;
    if (this.player.inCar) {
      this.player.inCar.speed *= 0.5;
      this.effects.crashSparks(this.player.inCar.pos.x, 1, this.player.inCar.pos.z);
      this.audio.crash();
    } else {
      this.player.damage(18);
      this.onPlayerHit('A police cruiser clipped you.');
    }
  }

  onPlayerHit(msg) {
    if (this.player.health < 35 && this.player.health > 0) {
      this.hud.toast('LOW HEALTH', 'Find cover — you are barely standing.');
    }
    if (this.player.dead) this.die(msg);
  }

  die(msg) {
    this.state = 'wasted';
    this.audio.setEngine(0, false);
    this.audio.setSiren(false);
    document.getElementById('wasted-text').textContent = msg || 'The Solstice PD caught up with you.';
    document.getElementById('wasted').style.display = 'flex';
    this.hud.hideHud();
  }

  playerTarget() {
    if (this.player.dead) return null;
    const p = this.player.inCar ? this.player.inCar.pos : this.player.pos;
    return { x: p.x, z: p.z };
  }

  // ---- screenshot staging: ?shot=chase|street|beach|menu ----
  applyShotStaging() {
    if (!this.shot) return;
    const s = this.shot;
    if (s === 'chase') {
      // Player driving downtown on the road, wanted 3, police on the tail, mission running.
      const car = this.cars.find((c) => c.parked);
      if (car) {
        car.parked = false;
        car.pos.set(-40, 0, 0); car.heading = Math.PI / 2; car.speed = 16;
        this.player.inCar = car; car.isPlayer = true; this.player.mesh.visible = false;
      }
      this.wanted.stars = 3;
      this.audio.setSiren(true);
      // A cruiser right on the player's tail for the shot.
      const cop = new Car(this.scene, { isPolice: true, ai: 'police', x: -72, z: 0, heading: Math.PI / 2 });
      cop.speed = 20;
      this.cars.push(cop); this.wanted.policeCars.push(cop);
      // A second cruiser coming head-on down the same road.
      const cop2 = new Car(this.scene, { isPolice: true, ai: 'police', x: 60, z: -3, heading: -Math.PI / 2 });
      cop2.speed = 14;
      this.cars.push(cop2); this.wanted.policeCars.push(cop2);
      // Keep pedestrians off the chase corridor so the shot stays clean.
      for (const ped of this.peds) {
        if (Math.abs(ped.pos.z) < 14 && ped.pos.x > -120 && ped.pos.x < 120) ped.pos.z = ped.pos.z < 0 ? -20 : 20;
      }
      this.missions.start(0);
      this.cameraYaw = Math.PI / 2 + 0.35; this.cameraDist = 8;
    } else if (s === 'street') {
      // On foot at a downtown intersection, looking down the road with traffic.
      this.player.teleport(-72, 8);
      this.cameraYaw = Math.PI; this.cameraPitch = 0.25; this.cameraDist = 7.5;
      this.missions.start(0);
    } else if (s === 'beach') {
      // On the sand looking south toward the pier, palms and umbrellas ahead.
      this.player.teleport(305, 170);
      this.cameraYaw = Math.PI; this.cameraPitch = 0.3; this.cameraDist = 7.5;
    } else if (s === 'menu') {
      // Stay on the menu: the game renders behind the title screen.
      this.state = 'menu';
    }
  }

  updateCamera(dt) {
    const target = this.player.inCar
      ? { pos: this.player.inCar.pos, heading: this.player.inCar.heading, moving: true }
      : { pos: this.player.pos, heading: this.player.heading, moving: this.player.speed > 0.5 };
    // In a car the camera follows the car's heading; on foot it follows the drag yaw.
    let yaw;
    if (this.player.inCar) {
      yaw = target.heading + Math.PI;
      this.cameraYaw = yaw;
    } else {
      yaw = this.cameraYaw;
    }
    const dist = this.cameraDist;
    const height = this.player.inCar
      ? 3.4 + this.cameraPitch * 6 + dist * 0.32
      : 2.4 + this.cameraPitch * 3.5 + dist * 0.28;
    const cx = target.pos.x + Math.sin(yaw) * dist;
    const cz = target.pos.z + Math.cos(yaw) * dist;
    const desired = new THREE.Vector3(cx, height, cz);
    this.camera.position.lerp(desired, Math.min(1, dt * 6));
    const look = new THREE.Vector3(target.pos.x, 1.6, target.pos.z);
    if (this.player.inCar) {
      const f = this.player.inCar.forward();
      look.x += f.x * 6; look.z += f.z * 6;
    }
    this.camera.lookAt(look);
    // Speed feel: widen the FOV at speed.
    const speed = this.player.inCar ? Math.abs(this.player.inCar.speed) : Math.abs(this.player.speed);
    const targetFov = 62 + clamp(speed / 30, 0, 1) * 12;
    if (Math.abs(this.camera.fov - targetFov) > 0.2) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
  }

  animate() {
    requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, this.clockDelta());
    this.time += dt;
    this.ctx.time = this.time;
    this.ctx.cameraYaw = this.cameraYaw;
    if (this.state === 'playing') {
      this.player.update(dt, this.ctx);
      for (const car of this.cars) car.update(dt, this.ctx);
      for (const ped of this.peds) ped.update(dt, this.ctx);
      this.wanted.update(dt, this.ctx);
      this.missions.update(dt);
      this.effects.update(dt);
      this.hud.update(dt);
      if (this.player.dead) this.die();
      // Keep traffic topped up and respawn peds that wandered off.
      if (this.cars.filter((c) => c.ai === 'traffic' && c.alive).length < 8) {
        const loop = makeTrafficLoop();
        const start = loop[0];
        this.cars.push(new Car(this.scene, {
          x: start.x, z: start.z, ai: 'traffic', waypoints: loop,
          heading: Math.atan2(loop[1].x - loop[0].x, loop[1].z - loop[0].z),
        }));
      }
    } else if (this.state === 'menu') {
      // Slow cinematic orbit behind the title screen.
      const t = this.time * 0.05;
      this.camera.position.set(Math.sin(t) * 120, 55, Math.cos(t) * 120);
      this.camera.lookAt(0, 0, 0);
      this.effects.update(dt);
    }
    if (this.state !== 'menu') this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  clockDelta() {
    const now = performance.now();
    const d = this._last ? (now - this._last) / 1000 : 0.016;
    this._last = now;
    return d;
  }
}

window.__solstice = null;
const game = new Game();
window.__solstice = game;
