// HUD: DOM readouts, the canvas minimap, toasts and dialogue.
import { CITY } from './city.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {
      money: document.getElementById('money'),
      healthBar: document.getElementById('health-bar'),
      district: document.getElementById('district'),
      wanted: document.getElementById('wanted'),
      clock: document.getElementById('clock'),
      objective: document.getElementById('objective'),
      dialogue: document.getElementById('dialogue'),
      minimap: document.getElementById('minimap'),
      speedo: document.getElementById('speedo'),
      ammo: document.getElementById('ammo'),
      toast: document.getElementById('toast'),
      crosshair: document.getElementById('crosshair'),
      hint: document.getElementById('hint'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = null;
    this.dialogueTimer = null;
    this.gameTime = 14 * 60 + 32; // 14:32
  }

  showHud() {
    for (const id of ['hud-top-left', 'hud-top-right', 'hud-bottom-left', 'hud-bottom-right']) {
      document.getElementById(id).classList.remove('hidden');
    }
    this.el.hint.classList.remove('hidden');
    setTimeout(() => this.el.hint.classList.add('hidden'), 9000);
  }

  hideHud() {
    for (const id of ['hud-top-left', 'hud-top-right', 'hud-bottom-left', 'hud-bottom-right']) {
      document.getElementById(id).classList.add('hidden');
    }
  }

  toast(title, sub = '') {
    this.el.toast.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    this.el.toast.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.el.toast.style.opacity = '0'; }, 3200);
  }

  say(who, line) {
    this.el.dialogue.style.display = 'block';
    this.el.dialogue.querySelector('.who').textContent = who + ': ';
    this.el.dialogue.querySelector('.line').textContent = line;
    clearTimeout(this.dialogueTimer);
    this.dialogueTimer = setTimeout(() => { this.el.dialogue.style.display = 'none'; }, 6000);
  }

  update(dt) {
    const g = this.game, ctx = g.ctx;
    this.gameTime += dt * 0.5; // game clock runs slowly
    const hh = Math.floor(this.gameTime / 60) % 24;
    const mm = Math.floor(this.gameTime % 60);
    this.el.clock.innerHTML = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} &nbsp;☀ 28°C`;
    this.el.money.textContent = '$ ' + Math.round(g.money).toLocaleString('en-US');
    const p = ctx.player;
    this.el.healthBar.style.width = Math.max(0, p.health) + '%';
    this.el.healthBar.style.background = p.health > 50
      ? 'linear-gradient(90deg,#37d67a,#a5f2b0)'
      : p.health > 25 ? 'linear-gradient(90deg,#f2a541,#ffd166)' : 'linear-gradient(90deg,#e63946,#ff8fa3)';
    const pos = p.inCar ? p.inCar.pos : p.pos;
    this.el.district.textContent = ctx.city.districtName(pos.x, pos.z);
    // Wanted stars.
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < g.wanted.stars ? '★' : '<span class="off">★</span>';
    this.el.wanted.innerHTML = stars;
    // Objective.
    const m = g.missions.active;
    if (m) {
      this.el.objective.innerHTML = `<span class="m-title">${m.title} — ${m.giver.toUpperCase()}</span><br><span class="m-sub">${g.missions.stageText()}</span>`;
    } else if (g.missionsDone.length >= 3) {
      this.el.objective.innerHTML = `<span class="m-title">SOLSTICE CITY — COMPLETE</span><br><span class="m-sub">All three jobs done. The city is yours, Mara. Free roam, buy nothing, owe no one.</span>`;
    } else {
      const next = g.missions.defs.find((d) => !g.missionsDone.includes(d.id));
      this.el.objective.innerHTML = `<span class="m-title">FREE ROAM</span><br><span class="m-sub">Next job: <b style="color:#ff9f1c">${next.title}</b> — go to the <b style="color:#ff9f1c">◆</b> marker and press <b>E</b>. Steal a car with <b>E</b> near one.</span>`;
    }
    // Speed + ammo.
    const speed = p.inCar ? Math.abs(p.inCar.speed) * 3.6 : Math.abs(p.speed) * 3.6;
    this.el.speedo.innerHTML = `${Math.round(speed)} <small>km/h</small>`;
    this.el.ammo.textContent = `🔫 ${p.ammo} / ${p.reserveAmmo}`;
    this.el.crosshair.style.display = (!p.inCar && g.state === 'playing') ? 'block' : 'none';
    this.drawMinimap();
  }

  drawMinimap() {
    const g = this.game, ctx = g.ctx;
    const c = this.mapCtx, S = 188, R = S / 2;
    const range = 230; // world units shown across the disc
    const p = ctx.player.inCar ? ctx.player.inCar.pos : ctx.player.pos;
    const scale = S / (range * 2);
    const toMap = (x, z) => [R + (x - p.x) * scale, R + (z - p.z) * scale];
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.clip();
    // Sea + sand + land.
    c.fillStyle = '#12344d'; c.fillRect(0, 0, S, S);
    const [bx] = toMap(CITY.beachX, 0);
    c.fillStyle = '#e8d29a'; c.fillRect(bx, 0, S - bx, S);
    c.fillStyle = '#2e86c1'; c.fillRect(toMap(CITY.seaX, 0)[0], 0, S, S);
    c.fillStyle = '#3a4a3a';
    c.fillRect(0, 0, bx, S);
    // Roads.
    c.strokeStyle = '#5a636e'; c.lineWidth = 5;
    for (const line of ctx.city.roadCentres()) {
      const [x] = toMap(line, 0); const [, z] = toMap(0, line);
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S); c.stroke();
      c.beginPath(); c.moveTo(0, z); c.lineTo(S, z); c.stroke();
    }
    // Mission marker.
    const m = g.missions.active;
    const target = m ? (m.stages[g.missions.stage].kind === 'steal' && g.missions.stealCar
      ? g.missions.stealCar.pos : m.stages[g.missions.stage].target)
      : (g.missions.defs.find((d) => !g.missionsDone.includes(d.id)) || {}).stages?.[0]?.target;
    if (target) {
      const [mx, mz] = toMap(target.x, target.z);
      c.fillStyle = '#ff9f1c';
      c.beginPath(); c.moveTo(mx, mz - 8); c.lineTo(mx + 7, mz); c.lineTo(mx, mz + 8); c.lineTo(mx - 7, mz); c.closePath(); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke();
    }
    // Traffic (yellow), peds (grey), gang (red), police (flashing blue/red).
    const dot = (x, z, color, r = 3) => {
      const [dx, dz] = toMap(x, z);
      c.fillStyle = color; c.beginPath(); c.arc(dx, dz, r, 0, Math.PI * 2); c.fill();
    };
    for (const car of ctx.cars) {
      if (!car.alive) continue;
      dot(car.pos.x, car.pos.z, car.isPolice ? (Math.floor(ctx.time * 4) % 2 ? '#ff2222' : '#2266ff') : '#ffd166', car.isPolice ? 4 : 3);
    }
    for (const ped of ctx.peds) if (ped.alive) dot(ped.pos.x, ped.pos.z, '#b8c4cc', 2);
    for (const gang of g.missions.gang) if (gang.alive) dot(gang.pos.x, gang.pos.z, '#ff4444', 3.5);
    // Player arrow (always centre, rotated by heading).
    const heading = ctx.player.inCar ? ctx.player.inCar.heading : ctx.player.heading;
    c.save();
    c.translate(R, R); c.rotate(-heading);
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 4); c.lineTo(-6, 7); c.closePath(); c.fill();
    c.strokeStyle = '#111'; c.lineWidth = 1; c.stroke();
    c.restore();
    c.restore();
    // North tick.
    c.fillStyle = '#fff'; c.font = 'bold 11px sans-serif'; c.textAlign = 'center';
    c.fillText('N', R, 13);
  }
}
