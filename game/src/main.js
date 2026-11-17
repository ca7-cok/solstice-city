// Solstice City — bootstrap, game loop and the wiring between every system.
// States: menu -> playing <-> paused, plus a busted screen on death.
import * as THREE from 'three';
import { clamp, angleLerp, dist2 } from './util.js';
import { buildCity, WORLD } from './city.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Player } from './player.js';
import { TrafficManager, driveCar } from './vehicles.js';
import { PedestrianManager } from './pedestrians.js';
import { WantedSystem, PoliceManager } from './police.js';
import { MissionManager, MISSIONS } from './missions.js';
import { Combat } from './combat.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { saveGame, loadGame, hasSave } from './save.js';

const canvas = document.getElementById('game-canvas');
// ?low disables shadows/antialias for software rendering and weak machines.
const LOW = new URLSearchParams(location.search).has('low');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW });
renderer.setPixelRatio(LOW ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

const city = buildCity(scene);
const input = new Input(canvas);
const audio = new AudioEngine();
const effects = new Effects(scene);
const hud = new HUD(document);
const player = new Player(scene, city.spawn);
const traffic = new TrafficManager(scene, city.colliders);
const peds = new PedestrianManager(scene, city.colliders);
const wanted = new WantedSystem();
const police = new PoliceManager(scene, city.colliders);
const missions = new MissionManager(scene, city.markers);
const combat = new Combat(scene, effects);

const ctx = { player };
const clock = new THREE.Clock();
let now = 0;
let state = 'menu'; // menu | playing | paused | busted
let money = 250;
let clockMin = 14 * 60 + 32;
let fps = 60;
let fpsAcc = 0; let fpsN = 0; let fpsT = 0;
let menuAngle = 0;
let damageFlashAt = -99;
let crashCd = 0;
let guards = [];
let guardsSpawnedFor = null;

const OVERLAYS = ['menu', 'pause', 'missions', 'help', 'busted', 'complete'];
function showOverlay(id) {
  for (const o of OVERLAYS) {
    const el = document.getElementById('overlay-' + o);
    if (el) el.classList.toggle('hidden', o !== id);
  }
  document.getElementById('hud').classList.toggle('hidden', id === 'menu');
}
function showHudOnly() {
  for (const o of OVERLAYS) {
    const el = document.getElementById('overlay-' + o);
    if (el) el.classList.add('hidden');
  }
  document.getElementById('hud').classList.remove('hidden');
}

// ---- Dock guards (DOCKSIDE DEAL) ----
function makeGuardMesh() {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x2e2a26 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d5f });
  const band = new THREE.MeshLambertMaterial({ color: 0xd23b3b });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), skin);
  head.position.y = 1.6;
  const bandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.48), band);
  bandMesh.position.y = 1.82;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.36), dark);
  torso.position.y = 1.04;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.3, 1.2, 0.4);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.7, 0.25), dark);
  legL.position.set(-0.15, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.6, 0.21), dark);
  armL.position.set(-0.4, 1.06, 0);
  const armR = armL.clone();
  armR.position.x = 0.4;
  g.add(head, bandMesh, torso, gun, legL, legR, armL, armR);
  g.userData.limbs = { legL, legR, armL, armR };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function spawnGuards() {
  const docks = city.markers.docks;
  const spots = [[-4, -3], [4, 2], [0, 6]];
  for (const [dx, dz] of spots) {
    const mesh = makeGuardMesh();
    scene.add(mesh);
    const guard = {
      mesh, x: docks.x + dx, z: docks.z + dz, heading: 0,
      health: 100, alive: true, shootCd: 1.5, walkPhase: 0,
    };
    mesh.position.set(guard.x, 0, guard.z);
    guards.push(guard);
    combat.registerTarget({ mesh, x: guard.x, z: guard.z, health: 100, kind: 'guard', ref: guard });
  }
  guardsSpawnedFor = 'dockside-deal';
}

function clearGuards() {
  for (const g of guards) {
    scene.remove(g.mesh);
    const t = combat.targets.find((t) => t.ref === g);
    if (t) combat.unregisterTarget(t);
  }
  guards = [];
  guardsSpawnedFor = null;
}

// Register peds + cops as combat targets (synced every frame).
for (const p of peds.peds) combat.registerTarget({ mesh: p.mesh, x: p.x, z: p.z, health: 50, kind: 'ped', ref: p });

// ---- Car enter / exit ----
function enterCar(car) {
  traffic.removeParked(car);
  player.inCar = car;
  car.isPlayer = true;
  player.mesh.visible = false;
  audio.setEngine(0, true);
  hud.showToast(car.missionCar === 'hot-wheels' ? 'You stole the Comet GT!' : 'You took the car. Solstice PD noticed.', 2.5);
  if (car.missionCar === 'hot-wheels' && missions.active && missions.active.def.id === 'hot-wheels' && missions.currentStep().type === 'steal') {
    wanted.addHeat(25, now);
    missions.advance(now, ctx);
    audio.missionStart();
  } else if (!car.missionCar) {
    wanted.addHeat(25, now);
  }
}

function exitCar() {
  const car = player.inCar;
  if (!car) return;
  player.inCar = null;
  car.isPlayer = false;
  const side = car.heading + Math.PI / 2;
  player.x = car.x + Math.sin(side) * 2.4;
  player.z = car.z + Math.cos(side) * 2.4;
  player.y = 0;
  player.mesh.visible = true;
  player.mesh.position.set(player.x, 0, player.z);
  traffic.parked.push(car);
  car.parked = true;
  audio.setEngine(0, false);
}

// ---- Kill / hit handling ----
function applyKillResult(res, source) {
  if (!res || !res.entry) return;
  const e = res.entry;
  if (e.kind === 'ped') {
    const ped = e.ref;
    if (res.killed) {
      ped.alive = false; ped.health = 0; ped.fallT = 0;
      wanted.addHeat(30, now);
      hud.showToast('Pedestrian down. The city saw that.', 2.5);
    } else {
      wanted.addHeat(8, now);
    }
    peds.scare(e.x, e.z, 18, now);
  } else if (e.kind === 'cop') {
    const cop = e.ref;
    if (res.killed) {
      cop.health = 0;
      scene.remove(cop.mesh);
      police.cops = police.cops.filter((c) => c !== cop);
      combat.unregisterTarget(e);
      wanted.addHeat(40, now);
      hud.showToast('Officer down. That will bring heat.', 2.5);
    } else {
      wanted.addHeat(12, now);
    }
  } else if (e.kind === 'guard') {
    const guard = e.ref;
    if (res.killed) {
      guard.alive = false; guard.health = 0;
      scene.remove(guard.mesh);
      combat.unregisterTarget(e);
      effects.burst(new THREE.Vector3(guard.x, 1.2, guard.z), 0xd23b3b, 10, 4);
      const r = missions.onKill(now);
      if (r && r.type === 'completed') onMissionCompleted(r.mission);
      else if (r) hud.showToast('Guard down (' + r.kills + '/' + r.needed + ')', 2);
    }
  }
}

function onMissionCompleted(mission) {
  money += mission.pay;
  audio.missionDone();
  audio.coin();
  hud.showToast('JOB DONE — ' + mission.name + '  +$' + mission.pay, 4);
  const el = document.getElementById('complete-text');
  if (el) el.textContent = mission.name + ' complete. You earned $' + mission.pay + '.';
  showOverlay('complete');
  state = 'paused';
  setTimeout(() => { if (state === 'paused') { showHudOnly(); state = 'playing'; } }, 2600);
}

// ---- Menu / pause / save ----
function startGame(fresh) {
  audio.init();
  if (fresh) {
    money = 250;
    player.health = player.maxHealth;
    player.x = city.spawn.x; player.z = city.spawn.z; player.y = 0;
    player.inCar = null;
    player.mesh.visible = true;
    missions.done.clear();
    missions.active = null;
    missions.updateBeacon();
    wanted.clear();
    police.clearAll();
    clearGuards();
    combat.ammo = 30; combat.reserve = 90;
    clockMin = 14 * 60 + 32;
  } else {
    const s = loadGame();
    if (s) {
      money = s.money ?? 250;
      player.health = s.health ?? 100;
      player.x = s.player?.x ?? city.spawn.x;
      player.z = s.player?.z ?? city.spawn.z;
      if (Array.isArray(s.missionsDone)) missions.done = new Set(s.missionsDone);
      combat.ammo = s.ammo ?? 30;
      combat.reserve = s.reserve ?? 90;
      clockMin = s.clockMin ?? clockMin;
    }
  }
  state = 'playing';
  showHudOnly();
  hud.showToast(fresh ? 'Welcome to Solstice City, Mara.' : 'Welcome back, Mara.', 3);
  audio.missionStart();
}

function doSave() {
  const ok = saveGame({
    money, health: player.health,
    player: { x: player.x, z: player.z },
    missionsDone: [...missions.done],
    ammo: combat.ammo, reserve: combat.reserve, clockMin,
  });
  hud.showToast(ok ? 'Game saved.' : 'Save failed.', 2);
  audio.click();
}

function bustPlayer() {
  state = 'busted';
  const fine = Math.min(150, Math.floor(money * 0.1));
  money -= fine;
  wanted.clear();
  police.clearAll();
  audio.busted();
  audio.setSiren(false);
  audio.setEngine(0, false);
  const el = document.getElementById('busted-text');
  if (el) el.textContent = 'The Solstice PD caught up with you. Fine: $' + fine + '. Your car is impounded — on foot again.';
  showOverlay('busted');
  if (player.inCar) exitCar();
  player.health = player.maxHealth;
  player.x = city.spawn.x; player.z = city.spawn.z; player.y = 0;
  player.mesh.position.set(player.x, 0, player.z);
}

// ---- Per-frame update ----
function update(dt) {
  now += dt;
  clockMin += dt * 0.5; // 1 real second = 30 game-seconds
  for (const c of city.clouds) {
    c.position.x += c.userData.drift * dt;
    if (c.position.x > 300) c.position.x = -300;
  }
  traffic.update(dt);
  peds.update(dt, now);
  wanted.update(dt, now);
  police.update(dt, now, wanted.stars, player, (dmg) => {
    player.damage(dmg, now);
    damageFlashAt = now;
    audio.punch();
    effects.addShake(0.25);
  }, (dmg) => {
    if (now - crashCd > 0.8) {
      crashCd = now;
      player.damage(dmg, now);
      damageFlashAt = now;
      audio.crash();
      effects.addShake(0.4);
    }
  });
  combat.update(dt);
  effects.update(dt, camera);

  // Mission beacon: plaza when idle, current step when active.
  if (!missions.active && !missions.beacon.visible) {
    missions.beacon.position.set(city.markers.plaza.x, 0, city.markers.plaza.z);
    missions.beacon.visible = true;
  }
  const ev = missions.update(dt, now, {});
  if (ev && ev.type === 'failed') {
    clearGuards();
    audio.busted();
    hud.showToast(ev.mission.name + ' failed.', 3);
  }
  // Spawn dock guards when the eliminate step begins.
  if (missions.active && missions.active.def.id === 'dockside-deal' && missions.currentStep().type === 'eliminate' && guardsSpawnedFor !== 'dockside-deal') {
    spawnGuards();
    missions.say('Three guards on the crates. Make it quiet — or don\'t.', now, 5);
  }
  if (missions.active) {
    const r = missions.checkProgress(now, ctx);
    if (r && r.type === 'completed') onMissionCompleted(r.mission);
    else if (r && r.type === 'advanced') audio.missionStart();
  }
  // Guards shoot back.
  for (const g of guards) {
    if (!g.alive) continue;
    g.shootCd -= dt;
    const d = dist2(player.x, player.z, g.x, g.z);
    if (d < 30 && g.shootCd <= 0 && !player.inCar) {
      g.shootCd = 1.8;
      player.damage(3, now);
      damageFlashAt = now;
      effects.tracer(new THREE.Vector3(g.x, 1.4, g.z), new THREE.Vector3(player.x, 1.2, player.z));
      audio.blip(300, 90, 0.1, 'square', 0.12);
    }
    g.heading = Math.atan2(player.x - g.x, player.z - g.z);
    g.mesh.rotation.y = g.heading;
  }

  // Sync combat target positions from their live objects. Health lives on
  // the combat entry itself (never copy it back from the ref, or shots
  // would never accumulate); a respawned ped gets its entry health back.
  for (const t of combat.targets) {
    if (t.ref) {
      t.x = t.ref.x; t.z = t.ref.z;
      if (t.kind === 'ped' && t.ref.alive && t.health <= 0) t.health = 50;
    }
  }

  // Driving: player car physics, ped collisions, traffic bumps.
  if (player.inCar) {
    const car = player.inCar;
    const { f, r } = input.moveAxes();
    driveCar(car, {
      throttle: f > 0 ? 1 : 0,
      brake: f < 0 ? 1 : 0,
      steer: -r,
      handbrake: input.down('Space'),
    }, dt, city.colliders, (impact) => {
      audio.crash();
      effects.addShake(Math.min(0.5, impact / 40));
      effects.smoke(new THREE.Vector3(car.x, 0.5, car.z), 4);
    });
    player.x = car.x; player.z = car.z;
    player.camYaw = angleLerp(player.camYaw, car.heading, 1 - Math.exp(-1.6 * dt));
    audio.setEngine(Math.abs(car.speed) / 38, true);
    if (input.down('Space')) effects.smoke(new THREE.Vector3(car.x, 0.4, car.z), 1);
    // Run over pedestrians.
    for (const p of peds.peds) {
      if (!p.alive) continue;
      if (dist2(car.x, car.z, p.x, p.z) < 2.1 && Math.abs(car.speed) > 3) {
        p.alive = false; p.health = 0; p.fallT = 0;
        wanted.addHeat(30, now);
        car.speed *= 0.65;
        audio.crash();
        effects.addShake(0.35);
        effects.burst(new THREE.Vector3(p.x, 1, p.z), 0xd23b3b, 8, 3);
        hud.showToast('You hit a pedestrian!', 2);
      }
    }
    // Bump traffic / parked cars.
    for (const other of [...traffic.cars, ...traffic.parked]) {
      if (other === car) continue;
      const d = dist2(car.x, car.z, other.x, other.z);
      if (d < 3.8 && d > 0.01) {
        const push = (3.8 - d) / d;
        car.x += (car.x - other.x) * push * 0.5;
        car.z += (car.z - other.z) * push * 0.5;
        car.speed *= 0.55;
        if (Math.abs(car.speed) > 5 && now - crashCd > 0.8) {
          crashCd = now;
          audio.crash();
          effects.addShake(0.3);
        }
      }
    }
    player.updateCamera(camera, input, dt, { x: car.x, y: 0, z: car.z });
  } else {
    audio.setEngine(0, false);
    player.updateOnFoot(input, dt, city.colliders, () => audio.step());
    player.updateCamera(camera, input, dt, { x: player.x, y: player.y, z: player.z }, 6);
  }

  // Actions.
  if (input.wasPressed('KeyE')) {
    if (player.inCar) {
      exitCar();
    } else {
      const res = missions.interact(now, ctx);
      if (res.type === 'started') {
        audio.missionStart();
        hud.showToast(res.mission.name + ' started — ' + res.mission.blurb, 4);
      } else if (res.type === 'advanced') {
        audio.missionStart();
      } else if (res.type === 'completed') {
        onMissionCompleted(res.mission);
      } else {
        const car = traffic.nearestParked(player.x, player.z, 4.5);
        if (car) {
          enterCar(car);
        } else {
          const step = missions.currentStep();
          hud.showToast(step ? 'Get to the ◆ marker first.' : 'NOTHING HERE — Find a car to steal, or the ◆ mission marker.', 2);
        }
      }
    }
  }
  if (input.clicked && !player.inCar && state === 'playing') {
    const from = new THREE.Vector3(player.x, player.y + 1.5, player.z);
    const res = combat.shoot(camera, from, now);
    if (res.hit) {
      audio.shoot();
      effects.addShake(0.08);
      applyKillResult(res, 'shoot');
      if (res.entry && res.entry.kind === 'ped' && !res.killed) audio.hit();
    } else if (res.dry) {
      hud.showToast('Out of ammo — press R to reload.', 1.5);
    } else if (!res.blocked) {
      audio.shoot();
    }
  }
  if (input.wasPressed('KeyF') && !player.inCar) {
    const res = combat.punch(player, now);
    audio.punch();
    if (res.hit) applyKillResult(res, 'punch');
  }
  if (input.wasPressed('KeyR')) {
    if (combat.startReload()) audio.click();
  }
  if (input.wasPressed('KeyM')) {
    const list = document.getElementById('mission-list');
    const overlay = document.getElementById('overlay-missions');
    if (list) {
      list.innerHTML = MISSIONS.map((m) => {
        const status = missions.done.has(m.id) ? '✓ DONE' : missions.active?.def.id === m.id ? '● ACTIVE' : '○ available';
        return '<div class="mission-row"><b>' + m.name + '</b> — ' + status + ' ($' + m.pay + ')<br><span class="dim">' + m.blurb + '</span></div>';
      }).join('');
    }
    if (overlay) overlay.classList.toggle('hidden');
  }
  if (input.wasPressed('KeyH')) {
    document.getElementById('overlay-help')?.classList.toggle('hidden');
  }
  if (input.wasPressed('KeyP')) doSave();
  // Esc is handled once per frame in animate(), never here, so one press
  // toggles pause exactly once even though update() skips paused frames.

  // Death.
  if (player.health <= 0 && state === 'playing') bustPlayer();
  player.heal(dt, now);
  audio.setSiren(wanted.stars >= 3);

  // HUD.
  const obj = missions.currentObjective();
  const step = missions.currentStep();
  const markerPos = step ? missions.markerPos(step) : (!missions.active && missions.available()[0] ? city.markers.plaza : null);
  hud.update(dt, {
    money, health: player.health, maxHealth: player.maxHealth,
    wanted: wanted.stars, clockMin, temp: 28,
    district: city.districtAt(player.x, player.z),
    speedKmh: player.inCar ? Math.abs(player.inCar.speed) * 3.6 : player.speed2d * 3.6,
    ammo: combat.ammo, reserve: combat.reserve, reloading: combat.reloading,
    objective: obj, objectivePos: markerPos, player,
    inCar: !!player.inCar,
    traffic: traffic.cars.map((c) => ({ x: c.x, z: c.z })),
    police: [...police.cruisers.map((c) => ({ x: c.x, z: c.z })), ...police.cops.map((c) => ({ x: c.x, z: c.z }))],
    missionMarker: markerPos,
    damaged: now - damageFlashAt < 0.25,
  });
  hud.setHint(player.inCar
    ? 'W A S D drive  •  Space handbrake  •  E exit car'
    : 'W A S D move  •  drag mouse to look  •  E enter car  •  click to shoot');
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.12, clock.getDelta());
  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; fpsT = 0; }
  if (state === 'menu') {
    now += dt;
    menuAngle += dt * 0.05;
    const cx = Math.sin(menuAngle) * 90, cz = Math.cos(menuAngle) * 90;
    camera.position.set(cx, 42, cz);
    camera.lookAt(0, 4, 0);
    for (const c of city.clouds) {
      c.position.x += c.userData.drift * dt;
      if (c.position.x > 300) c.position.x = -300;
    }
    traffic.update(dt);
    effects.update(dt, camera);
    renderer.render(scene, camera);
    input.endFrame();
    return;
  }
  if (state === 'playing') update(dt);
  // Esc toggles pause. Only here — never in update() — so one press
  // toggles exactly once even though update() skips paused frames.
  if (input.wasPressed('Escape')) {
    if (state === 'playing') { state = 'paused'; showOverlay('pause'); }
    else if (state === 'paused') {
      const complete = document.getElementById('overlay-complete');
      if (!complete || complete.classList.contains('hidden')) {
        state = 'playing';
        showHudOnly();
      }
    }
  }
  renderer.render(scene, camera);
  input.endFrame();
}

// ---- Menu buttons ----
document.getElementById('btn-new').addEventListener('click', () => startGame(true));
const btnContinue = document.getElementById('btn-continue');
if (hasSave()) {
  btnContinue.classList.remove('hidden');
  btnContinue.addEventListener('click', () => startGame(false));
}
document.getElementById('btn-resume')?.addEventListener('click', () => { state = 'playing'; showHudOnly(); audio.click(); });
document.getElementById('btn-quit')?.addEventListener('click', () => { state = 'menu'; showOverlay('menu'); audio.click(); });
document.getElementById('btn-busted')?.addEventListener('click', () => { state = 'playing'; showHudOnly(); audio.click(); });
document.getElementById('btn-close-missions')?.addEventListener('click', () => document.getElementById('overlay-missions')?.classList.add('hidden'));
document.getElementById('btn-close-help')?.addEventListener('click', () => document.getElementById('overlay-help')?.classList.add('hidden'));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug hooks for automated playtests (and nothing else).
window.__game = {
  get state() { return state; },
  get money() { return money; },
  get health() { return player.health; },
  get wanted() { return wanted.stars; },
  get inCar() { return !!player.inCar; },
  get speed() { return player.inCar ? player.inCar.speed : player.speed2d; },
  get fps() { return fps; },
  get pos() { return { x: player.x, z: player.z }; },
  get mission() { return { active: missions.active?.def.id || null, step: missions.active?.stepIdx ?? -1, done: [...missions.done] }; },
  get ammo() { return { mag: combat.ammo, reserve: combat.reserve }; },
  get keys() { return [...input.keys]; },
  get camYaw() { return player.camYaw; },
  get guards() { return guards.filter((g) => g.alive).length; },
  guardsPos: () => guards.filter((g) => g.alive).map((g) => ({ x: g.x, z: g.z })),
  debugRay: () => {
    const rc = combat.getAimRay(camera, player);
    const meshes = combat.targets.filter((t) => t.health > 0).map((t) => t.mesh);
    const hits = rc.intersectObjects(meshes, true);
    return {
      origin: rc.ray.origin.toArray().map((v) => +v.toFixed(2)),
      dir: rc.ray.direction.toArray().map((v) => +v.toFixed(2)),
      hits: hits.slice(0, 3).map((h) => ({ d: +h.distance.toFixed(2), point: h.point.toArray().map((v) => +v.toFixed(2)) })),
    };
  },
  aimAt: (x, z) => { player.camYaw = Math.atan2(x - player.x, z - player.z); },
  setHeading: (h) => {
    if (player.inCar) { player.inCar.heading = h; player.inCar.syncMesh(); }
    player.heading = h;
    player.camYaw = h;
  },
  get peds() { return peds.peds.filter((p) => p.alive).length; },
  start: () => startGame(true),
  teleport: (x, z) => {
    if (player.inCar) { player.inCar.x = x; player.inCar.z = z; player.inCar.syncMesh(); }
    player.x = x; player.z = z;
    player.mesh.position.set(x, player.y, z);
  },
  setWanted: (h) => { wanted.heat = h; wanted.lastCrimeAt = now; },
};

showOverlay('menu');
animate();
