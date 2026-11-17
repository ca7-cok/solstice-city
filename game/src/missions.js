// Story missions: three named jobs with dialogue, markers, timers and pay.
// A mission is a list of steps; each step is goto / interact / steal /
// eliminate / deliver. The HUD reads currentObjective() for its panel.
import * as THREE from 'three';
import { dist2, fmtTime } from './util.js';

export const MISSIONS = [
  {
    id: 'first-light',
    name: 'FIRST LIGHT',
    pay: 400,
    blurb: 'A sunrise drop for an old friend. No questions, no shortcuts.',
    steps: [
      { type: 'interact', at: 'plaza', text: 'Meet Sol at the plaza fountain', radius: 4 },
      { type: 'goto', at: 'marina', text: 'Drive the package to Marina Bay', radius: 6 },
      { type: 'interact', at: 'marina', text: 'Hand the package to the courier', radius: 4 },
    ],
  },
  {
    id: 'hot-wheels',
    name: 'HOT WHEELS',
    pay: 600,
    blurb: 'A yellow Comet GT is parked on 6th. Bring it to the chop shop — fast.',
    steps: [
      { type: 'steal', at: 'hotwheelsCar', text: 'Steal the yellow Comet GT (E)', radius: 6 },
      { type: 'drive', at: 'chopshop', text: 'Deliver it to the chop shop in Southside', radius: 7, timeLimit: 90 },
    ],
  },
  {
    id: 'dockside-deal',
    name: 'DOCKSIDE DEAL',
    pay: 900,
    blurb: 'The Harbor crew is moving crates tonight. Take the crate, leave no witnesses.',
    steps: [
      { type: 'goto', at: 'docks', text: 'Reach the Harbor Docks', radius: 8 },
      { type: 'eliminate', at: 'docks', text: 'Deal with the dock guards (0/3)', radius: 26, count: 3 },
      { type: 'interact', at: 'docks', text: 'Grab the crate (E)', radius: 4 },
      { type: 'goto', at: 'plaza', text: 'Bring the crate back to the plaza', radius: 6 },
    ],
  },
];

function makeBeacon(color) {
  const g = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.6, 42, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 21;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color }),
  );
  diamond.position.y = 7;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(pillar, diamond, ring);
  g.userData.diamond = diamond;
  g.userData.ring = ring;
  return g;
}

export class MissionManager {
  constructor(scene, markers) {
    this.scene = scene;
    this.markers = markers;
    this.active = null; // {def, stepIdx, stepStart, kills, timeLeft}
    this.done = new Set();
    this.beacon = makeBeacon(0xffb020);
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.dialogue = '';
    this.dialogueUntil = 0;
  }

  available() {
    return MISSIONS.filter((m) => !this.done.has(m.id) && (!this.active || this.active.def.id !== m.id));
  }

  start(id, now) {
    const def = MISSIONS.find((m) => m.id === id);
    if (!def || this.done.has(id) || this.active) return false;
    this.active = { def, stepIdx: 0, stepStart: now, kills: 0, timeLeft: 0 };
    this.say(def.name + ' — ' + def.blurb, now, 6);
    this.updateBeacon();
    return true;
  }

  say(text, now, dur = 4) {
    this.dialogue = text;
    this.dialogueUntil = now + dur;
  }

  currentStep() {
    return this.active ? this.active.def.steps[this.active.stepIdx] : null;
  }

  currentObjective() {
    if (!this.active) {
      const next = this.available()[0];
      return next
        ? { title: 'FREE ROAM', text: 'Next job: ' + next.name + ' — go to the ◆ marker and press E. Steal a car with E near one.' }
        : { title: 'FREE ROAM', text: 'All jobs done. The city is yours — keep the money coming.' };
    }
    const step = this.currentStep();
    let text = step.text;
    if (step.type === 'eliminate') text = 'Deal with the dock guards (' + this.active.kills + '/' + step.count + ')';
    if (step.timeLimit) {
      const left = Math.max(0, step.timeLimit - (this.active.elapsed || 0));
      text += ' — ' + fmtTime(left) + ' left';
    }
    return { title: this.active.def.name, text };
  }

  markerPos(step) {
    return this.markers[step.at];
  }

  updateBeacon() {
    const step = this.currentStep();
    if (!step) { this.beacon.visible = false; return; }
    const p = this.markerPos(step);
    this.beacon.position.set(p.x, 0, p.z);
    this.beacon.visible = true;
  }

  // Called every frame; returns an event object when something notable happens.
  update(dt, now, ctx) {
    if (this.active) {
      const step = this.currentStep();
      if (step.timeLimit) {
        this.active.elapsed = (this.active.elapsed || 0) + dt;
        if (this.active.elapsed > step.timeLimit) {
          const failed = this.active.def;
          this.active = null;
          this.updateBeacon();
          this.say(failed.name + ' failed — the window closed.', now, 5);
          return { type: 'failed', mission: failed };
        }
      }
    }
    if (this.beacon.visible) {
      this.beacon.userData.diamond.rotation.y += dt * 1.5;
      this.beacon.userData.diamond.position.y = 7 + Math.sin(now * 2) * 0.5;
      this.beacon.userData.ring.scale.setScalar(1 + Math.sin(now * 3) * 0.08);
    }
    return null;
  }

  // Player pressed E: try to advance an interact/steal step, or start a job.
  interact(now, ctx) {
    if (this.active) {
      const step = this.currentStep();
      const p = this.markerPos(step);
      const d = dist2(ctx.player.x, ctx.player.z, p.x, p.z);
      if (d > step.radius + 2) return { type: 'none' };
      if (step.type === 'interact') {
        if (step.at === 'plaza' && this.active.def.id === 'first-light' && this.active.stepIdx === 0) {
          this.say('Sol: "Package is light, money is heavy. Marina Bay, pier two. Don\'t open it."', now, 6);
        }
        return this.advance(now, ctx);
      }
      if (step.type === 'steal') return { type: 'none' }; // handled by car logic
      return { type: 'none' };
    }
    // No active job: starting one needs the player at the plaza marker.
    const next = this.available()[0];
    if (!next) return { type: 'none' };
    const p = this.markers.plaza;
    if (dist2(ctx.player.x, ctx.player.z, p.x, p.z) > 7) return { type: 'none' };
    this.start(next.id, now);
    // The first step is meeting Sol at this same fountain: one press starts
    // the job and shakes his hand.
    const again = this.interact(now, ctx);
    return again.type === 'advanced' ? { type: 'started', mission: next } : { type: 'started', mission: next };
  }

  // Step completed by movement / kills / delivery.
  advance(now, ctx) {
    if (!this.active) return { type: 'none' };
    const def = this.active.def;
    this.active.stepIdx++;
    if (this.active.stepIdx >= def.steps.length) {
      this.done.add(def.id);
      this.active = null;
      this.updateBeacon();
      return { type: 'completed', mission: def };
    }
    this.active.elapsed = 0;
    this.active.stepStart = now;
    this.updateBeacon();
    const step = this.currentStep();
    this.say(def.name + ': ' + step.text, now, 5);
    return { type: 'advanced', mission: def, step };
  }

  // Called when the player reaches a goto/drive marker, steals the target car,
  // or scores a kill during an eliminate step.
  checkProgress(now, ctx) {
    if (!this.active) return null;
    const step = this.currentStep();
    const p = this.markerPos(step);
    const d = dist2(ctx.player.x, ctx.player.z, p.x, p.z);
    if ((step.type === 'goto' || step.type === 'drive') && d < step.radius) {
      return this.advance(now, ctx);
    }
    return null;
  }

  onKill(now) {
    if (!this.active) return null;
    const step = this.currentStep();
    if (step.type !== 'eliminate') return null;
    this.active.kills++;
    if (this.active.kills >= step.count) return this.advance(now, {});
    return { type: 'kill', kills: this.active.kills, needed: step.count };
  }
}
