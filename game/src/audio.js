// Synthesized sound: every effect and the music loop are built with WebAudio,
// so the game ships zero audio files and makes zero network requests.
import { clamp } from './util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.musicTimer = null;
    this.muted = false;
    this.started = false;
  }

  // Must be called from a user gesture (the NEW GAME click).
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.14;
    this.musicGain.connect(this.master);
    // Car engine: a low sawtooth whose pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    // Police siren: two-tone wail driven by an LFO.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 750;
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.7;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 220;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
    this.started = true;
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // A short blip with a pitch slide; the building block for most effects.
  blip(freqA, freqB, dur, type, vol, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freqA, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t0 + dur);
    g.gain.setValueAtTime(vol || 0.25, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // Filtered noise burst (gunshots, impacts, skids).
  noise(dur, vol, filterFreq, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1800;
    const g = this.ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }

  shoot() { this.noise(0.12, 0.5, 2600); this.blip(190, 60, 0.09, 'square', 0.18); }
  punch() { this.noise(0.08, 0.35, 900); }
  hit() { this.blip(320, 140, 0.08, 'triangle', 0.2); }
  pickup() { this.blip(520, 780, 0.12, 'sine', 0.25); this.blip(780, 1040, 0.14, 'sine', 0.2, 0.09); }
  coin() { this.blip(880, 880, 0.07, 'sine', 0.22); this.blip(1318, 1318, 0.16, 'sine', 0.22, 0.07); }
  click() { this.blip(700, 500, 0.05, 'square', 0.12); }
  crash() { this.noise(0.35, 0.5, 700); this.blip(120, 40, 0.3, 'sawtooth', 0.25); }
  missionStart() { [523, 659, 784].forEach((f, i) => this.blip(f, f, 0.16, 'triangle', 0.22, i * 0.1)); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => this.blip(f, f, 0.2, 'triangle', 0.24, i * 0.11)); }
  busted() { [392, 330, 262, 196].forEach((f, i) => this.blip(f, f * 0.94, 0.3, 'sawtooth', 0.18, i * 0.22)); }
  step() { this.noise(0.05, 0.08, 500); }

  setEngine(speedRatio, inCar) {
    if (!this.ctx) return;
    const target = inCar ? 0.05 + 0.09 * clamp(speedRatio, 0, 1) : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(55 + 130 * clamp(speedRatio, 0, 1), this.ctx.currentTime, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.4);
  }

  // Lazy beach-city groove: warm pad chords (C – Am – F – G) with a soft bass.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const chords = [
      [130.81, 164.81, 196.0, 261.63],
      [110.0, 164.81, 220.0, 261.63],
      [87.31, 174.61, 220.0, 261.63],
      [98.0, 146.83, 196.0, 246.94],
    ];
    let step = 0;
    const playChord = () => {
      if (!this.ctx || this.muted) { this.musicTimer = setTimeout(playChord, 900); return; }
      const chord = chords[step % chords.length];
      const t0 = this.ctx.currentTime + 0.05;
      chord.forEach((freq, i) => {
        const o = this.ctx.createOscillator();
        o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(i === 0 ? 0.5 : 0.16, t0 + 0.4);
        g.gain.setValueAtTime(i === 0 ? 0.5 : 0.16, t0 + 3.1);
        g.gain.linearRampToValueAtTime(0.0001, t0 + 3.6);
        o.connect(g); g.connect(this.musicGain);
        o.start(t0); o.stop(t0 + 3.7);
      });
      step++;
      this.musicTimer = setTimeout(playChord, 3600);
    };
    playChord();
  }
}
