// HUD: DOM panels (money, health, stars, clock, mission, hints) plus the
// canvas minimap. The DOM lives in index.html; this class only updates it.
import { clamp } from './util.js';
import { WORLD, districtAt } from './city.js';

export class HUD {
  constructor(doc) {
    this.doc = doc;
    this.el = {};
    for (const id of ['money', 'health-fill', 'health-num', 'district', 'stars', 'clock', 'mission-title', 'mission-text', 'speed', 'ammo', 'hint', 'toast', 'dialogue', 'minimap', 'damage', 'crosshair', 'objective-distance']) {
      this.el[id] = doc.getElementById(id);
    }
    this.mm = this.el.minimap.getContext('2d');
    this.toastTimer = 0;
    this.dialogueTimer = 0;
  }

  showToast(text, dur = 3) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    this.toastTimer = dur;
  }

  showDialogue(text, dur = 5) {
    this.el.dialogue.textContent = text;
    this.el.dialogue.style.opacity = '1';
    this.dialogueTimer = dur;
  }

  setHint(text) {
    this.el.hint.textContent = text;
  }

  update(dt, s) {
    // s: {money, health, maxHealth, wanted, clockMin, temp, district, speedKmh,
    //     ammo, reserve, reloading, objective:{title,text}, objectivePos, player,
    //     inCar, traffic, police, missionMarker, damaged}
    this.el.money.textContent = '$ ' + Math.floor(s.money).toLocaleString('en-US');
    const hp = clamp(s.health / s.maxHealth, 0, 1);
    this.el['health-fill'].style.width = (hp * 100).toFixed(0) + '%';
    this.el['health-fill'].style.background = hp > 0.5 ? '#58d68d' : hp > 0.25 ? '#f5b942' : '#e74c3c';
    this.el['health-num'].textContent = Math.ceil(s.health) + '';
    this.el.district.textContent = 'SOLSTICE CITY  •  ' + s.district;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < s.wanted ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.style.color = s.wanted > 0 ? '#ffd34d' : '#c8ccd2';
    const hh = Math.floor(s.clockMin / 60) % 24;
    const mm = Math.floor(s.clockMin % 60);
    this.el.clock.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + '  ☀ ' + s.temp + '°C';
    this.el['mission-title'].textContent = s.objective.title;
    this.el['mission-text'].textContent = s.objective.text;
    if (s.objectivePos) {
      const d = Math.hypot(s.objectivePos.x - s.player.x, s.objectivePos.z - s.player.z);
      this.el['objective-distance'].textContent = Math.round(d) + ' m';
      this.el['objective-distance'].style.display = 'block';
    } else {
      this.el['objective-distance'].style.display = 'none';
    }
    this.el.speed.textContent = Math.round(s.speedKmh) + ' km/h';
    this.el.ammo.textContent = (s.reloading ? 'RELOADING…' : '🔫 ' + s.ammo + ' / ' + s.reserve);
    this.el.crosshair.style.display = s.inCar ? 'none' : 'block';
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.opacity = '0';
    }
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.el.dialogue.style.opacity = '0';
    }
    // Damage vignette flash.
    this.el.damage.style.opacity = s.damaged ? '0.55' : '0';
    this.drawMinimap(s);
  }

  drawMinimap(s) {
    const ctx = this.mm;
    const W = 200, H = 200;
    const scale = W / (WORLD.half * 2 + 40);
    const toX = (x) => (x + WORLD.half + 20) * scale;
    const toZ = (z) => (z + WORLD.half + 20) * scale;
    ctx.clearRect(0, 0, W, H);
    // Sea + sand.
    ctx.fillStyle = '#274e63';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2e7fc2';
    ctx.fillRect(toX(WORLD.seaX), 0, W - toX(WORLD.seaX), H);
    ctx.fillStyle = '#e8d49a';
    ctx.fillRect(toX(190), 0, toX(WORLD.seaX) - toX(190), H);
    // Land.
    ctx.fillStyle = '#3f6b46';
    ctx.fillRect(0, 0, toX(190), H);
    // Roads.
    ctx.strokeStyle = '#5a5f66';
    ctx.lineWidth = 5;
    for (const c of WORLD.roadCoords) {
      ctx.beginPath(); ctx.moveTo(toX(-WORLD.half), toZ(c)); ctx.lineTo(toX(WORLD.seaX), toZ(c)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toX(c), toZ(-WORLD.half)); ctx.lineTo(toX(c), toZ(WORLD.half)); ctx.stroke();
    }
    // Mission marker.
    if (s.missionMarker) {
      ctx.fillStyle = '#ffb020';
      const mx = toX(s.missionMarker.x), mz = toZ(s.missionMarker.z);
      ctx.save();
      ctx.translate(mx, mz);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    }
    // Traffic (yellow), police (red), player (white arrow).
    ctx.fillStyle = '#f2c230';
    for (const c of s.traffic) { ctx.fillRect(toX(c.x) - 1.5, toZ(c.z) - 1.5, 3, 3); }
    ctx.fillStyle = '#ff4444';
    for (const c of s.police) { ctx.beginPath(); ctx.arc(toX(c.x), toZ(c.z), 3, 0, Math.PI * 2); ctx.fill(); }
    const px = toX(s.player.x), pz = toZ(s.player.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(s.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North label.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', W - 14, 14);
  }
}
