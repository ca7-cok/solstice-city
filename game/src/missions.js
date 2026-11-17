// Missions & story: three named jobs for Mara Voss, each with stages,
// a glowing beacon marker, dialogue and a cash payout. All original.
import * as THREE from 'three';
import { PLACES } from './city.js';
import { GangMember } from './combat.js';
import { Car } from './vehicles.js';

const MISSIONS = [
  {
    id: 'first-light', title: 'FIRST LIGHT', giver: 'Rosa',
    brief: 'A courier job to get you started. Rosa is waiting at her café.',
    stages: [
      { text: 'Meet Rosa at Rosa\'s Café', target: PLACES.rosaCafe, radius: 6, kind: 'goto' },
      { text: 'Deliver the package to Palm Garage', target: PLACES.palmGarage, radius: 7, kind: 'goto', needsCar: true },
    ],
    reward: 400,
    outro: 'Rosa: "Clean run, Mara. The city pays couriers who don\'t ask questions."',
  },
  {
    id: 'hot-wheels', title: 'HOT WHEELS', giver: 'Rosa',
    brief: 'A client wants a yellow Sunrunner from the Marina — no questions, no receipts.',
    stages: [
      { text: 'Steal the yellow Sunrunner at the Marina', target: PLACES.marina, radius: 8, kind: 'steal' },
      { text: 'Deliver the Sunrunner to Palm Garage', target: PLACES.palmGarage, radius: 8, kind: 'deliver', needsCar: true },
    ],
    reward: 600,
    outro: 'Rosa: "The client is happy. The PD is not. Same time tomorrow?"',
  },
  {
    id: 'dockside-deal', title: 'DOCKSIDE DEAL', giver: 'Rosa',
    brief: 'The Vipers are muscling in on the docks. Go remind them whose city this is.',
    stages: [
      { text: 'Head to the Sunset Docks', target: PLACES.docks, radius: 8, kind: 'goto' },
      { text: 'Deal with the Vipers (0/4)', target: PLACES.docks, radius: 30, kind: 'fight' },
      { text: 'Report back to Rosa at her café', target: PLACES.rosaCafe, radius: 6, kind: 'goto' },
    ],
    reward: 900,
    outro: 'Rosa: "The docks are ours again. Solstice City is starting to feel like home, huh?"',
  },
];

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.defs = MISSIONS;
    this.activeIndex = -1;     // index into defs, -1 = free roam
    this.stage = 0;
    this.gang = [];
    this.beacon = null;
    this.beaconLight = null;
    this.stealCar = null;
    this.fightRemaining = 0;
    this.talkT = 0;
    this.buildBeacon();
  }

  buildBeacon() {
    const geo = new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff9f1c, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.visible = false;
    this.game.ctx.scene.add(this.beacon);
    this.beaconLight = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd166 }),
    );
    this.beaconLight.visible = false;
    this.game.ctx.scene.add(this.beaconLight);
  }

  get active() { return this.activeIndex >= 0 ? this.defs[this.activeIndex] : null; }
  get stageDef() { const a = this.active; return a ? a.stages[this.stage] : null; }

  get available() {
    return this.defs.filter((d, i) => !this.game.missionsDone.includes(d.id) && i !== this.activeIndex);
  }

  start(index) {
    this.activeIndex = index;
    this.stage = 0;
    this.game.audio.missionDone();
    const m = this.active;
    this.game.hud.toast(`MISSION: ${m.title}`, m.brief);
    this.game.hud.say(m.giver, this.stageText());
    if (this.stageDef.kind === 'steal') this.spawnStealCar();
    this.placeBeacon();
  }

  stageText() {
    const s = this.stageDef;
    if (!s) return '';
    if (s.kind === 'fight') return `Deal with the Vipers (${4 - this.fightRemaining}/4)`;
    return s.text;
  }

  placeBeacon() {
    const s = this.stageDef;
    if (!s) { this.beacon.visible = false; this.beaconLight.visible = false; return; }
    const t = s.kind === 'steal' && this.stealCar ? this.stealCar.pos : s.target;
    this.beacon.position.set(t.x, 30, t.z);
    this.beaconLight.position.set(t.x, 1.2, t.z);
    this.beacon.visible = true; this.beaconLight.visible = true;
  }

  // Called when the player presses E near the mission start marker.
  tryStartNearPlayer() {
    if (this.active) return false;
    const p = this.game.ctx.player.pos;
    const next = this.defs.find((d) => !this.game.missionsDone.includes(d.id));
    if (!next) return false;
    const start = next.stages[0].target;
    if (Math.hypot(p.x - start.x, p.z - start.z) < 10) {
      this.start(this.defs.indexOf(next));
      return true;
    }
    return false;
  }

  spawnGang() {
    const docks = PLACES.docks;
    const names = ['Viper', 'Viper', 'Viper', 'Viper'];
    for (let i = 0; i < 4; i++) {
      const g = new GangMember(this.game.ctx.scene,
        docks.x + (i % 2 === 0 ? -14 : 14) + (i > 1 ? 8 : -8),
        docks.z + (i < 2 ? -10 : 12), names[i]);
      this.gang.push(g);
    }
    this.fightRemaining = 4;
  }

  onGangKilled() {
    this.fightRemaining = Math.max(0, this.fightRemaining - 1);
    if (this.active && this.stageDef && this.stageDef.kind === 'fight' && this.fightRemaining === 0) {
      this.advance();
    }
  }

  advance() {
    const m = this.active;
    this.stage++;
    if (this.stage >= m.stages.length) { this.complete(); return; }
    const s = this.stageDef;
    if (s.kind === 'fight') this.spawnGang();
    if (s.kind === 'steal') this.spawnStealCar();
    this.game.hud.say(m.giver, this.stageText());
    this.placeBeacon();
  }

  spawnStealCar() {
    const marina = PLACES.marina;
    this.stealCar = new Car(this.game.ctx.scene, {
      color: 0xf2c14e, x: marina.x + 6, z: marina.z + 4, heading: Math.PI / 2, parked: true,
    });
    this.game.ctx.cars.push(this.stealCar);
    this.placeBeacon();
  }

  complete() {
    const m = this.active;
    this.game.money += m.reward;
    this.game.missionsDone.push(m.id);
    this.game.audio.missionDone();
    this.game.hud.toast(`MISSION COMPLETE: ${m.title}`, `+$${m.reward} — ${m.outro}`);
    this.game.ctx.effects.cashBurst(this.game.ctx.player.pos.x, 2, this.game.ctx.player.pos.z);
    this.activeIndex = -1;
    this.stage = 0;
    this.beacon.visible = false; this.beaconLight.visible = false;
    this.game.saveGame();
  }

  update(dt) {
    const ctx = this.game.ctx;
    if (this.beacon.visible) {
      this.beacon.rotation.y += dt * 0.8;
      this.beaconLight.position.y = 1.2 + Math.sin(ctx.time * 3) * 0.25;
    }
    if (!this.active) return;
    const s = this.stageDef;
    const p = ctx.player.inCar ? ctx.player.inCar.pos : ctx.player.pos;
    const inCar = ctx.player.inCar;
    const targetPos = s.kind === 'steal' && this.stealCar ? this.stealCar.pos : s.target;
    const d = Math.hypot(p.x - targetPos.x, p.z - targetPos.z);
    if (s.kind === 'goto' && d < s.radius) {
      if (s.needsCar && !inCar) {
        this.game.hud.say('Rosa', 'You need wheels for this one — bring a car.');
        return;
      }
      this.advance();
    } else if (s.kind === 'deliver' && inCar && d < s.radius) {
      this.advance();
    } else if (s.kind === 'steal') {
      if (inCar === this.stealCar) {
        this.game.wanted.addCrime(1, 'Grand theft auto — the Marina owner called it in.');
        this.advance();
      }
    }
    // Gang members act.
    for (const g of this.gang) g.update(dt, ctx);
    this.gang = this.gang.filter((g) => g.alive || g.health > -100);
  }
}
