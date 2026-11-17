// All sound in Solstice City is synthesised with WebAudio — no audio files.
export class AudioEngine {
  constructor() {
    this.ctx = null; this.master = null; this.musicGain = null;
    this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenLfo = null;
    this.musicTimer = null; this.muted = false;
    this.chords = [
      [130.81, 164.81, 196.00], // Cmaj
      [110.00, 130.81, 164.81], // Am
      [87.31, 110.00, 130.81],  // F
      [98.00, 123.47, 146.83],  // G
    ];
    this.chordIdx = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    // Engine hum: two detuned saws through a lowpass.
    this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineOsc2 = this.ctx.createOscillator(); engineOsc2.type = 'square';
    engineOsc2.frequency.value = 28;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp); engineOsc2.connect(lp);
    lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); engineOsc2.start();
    this.engineOsc2 = engineOsc2;
    // Police siren: triangle wailing between two pitches.
    this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenLfo = this.ctx.createOscillator(); this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.55;
    const sirenLfoGain = this.ctx.createGain(); sirenLfoGain.gain.value = 190;
    this.sirenLfo.connect(sirenLfoGain); sirenLfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start(); this.sirenLfo.start();
    // Music: warm pad chords + soft bass pulse, one chord every 4 seconds.
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.musicTimer = setInterval(() => this.playChord(), 4000);
    this.playChord();
  }

  playChord() {
    if (!this.ctx || this.muted) return;
    const chord = this.chords[this.chordIdx % this.chords.length]; this.chordIdx++;
    const t = this.ctx.currentTime;
    for (const freq of chord) {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.8);
      g.gain.linearRampToValueAtTime(0.0001, t + 3.9);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + 4);
    }
    // Bass pulse on the root.
    const b = this.ctx.createOscillator(); b.type = 'sine'; b.frequency.value = chord[0] / 2;
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(0.5, t); bg.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    b.connect(bg); bg.connect(this.musicGain); b.start(t); b.stop(t + 1.3);
  }

  setEngine(speed01, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.10 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(26 + speed01 * 60, t, 0.08);
  }

  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.4);
  }

  blip(freq, dur, type = 'sine', vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  noiseBurst(dur = 0.18, vol = 0.5, lowpass = 3000) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  }

  gunshot() { this.noiseBurst(0.16, 0.55, 2600); this.blip(140, 0.1, 'square', 0.25); }
  crash() { this.noiseBurst(0.35, 0.5, 900); this.blip(70, 0.3, 'sine', 0.3); }
  punch() { this.noiseBurst(0.1, 0.35, 700); }
  pickup() { this.blip(880, 0.12, 'sine', 0.22); setTimeout(() => this.blip(1318, 0.18, 'sine', 0.22), 90); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'triangle', 0.25), i * 110)); }
  denied() { this.blip(180, 0.2, 'square', 0.18); }
  door() { this.blip(300, 0.08, 'square', 0.12); }
}
