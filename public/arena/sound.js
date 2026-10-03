// Synthesized sound for the arena: no audio files, everything is oscillators and filtered noise
// through one compressor so stacked explosions do not clip.

const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];

export class Sound {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
  }

  context() {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.knee.value = 10;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.22;
        this.master = ctx.createGain();
        this.master.gain.value = 0.85;
        this.master.connect(compressor).connect(ctx.destination);
        const length = ctx.sampleRate;
        this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
        this.ctx = ctx;
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  tone(frequency = 520, duration = 0.1, wave = "sine", volume = 0.05, slideTo = null, delay = 0) {
    const ctx = this.context();
    if (!ctx) return;
    try {
      const start = ctx.currentTime + delay;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(frequency, start);
      if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(this.master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    } catch { /* audio is optional */ }
  }

  noise(duration = 0.3, volume = 0.1, { type = "lowpass", from = 2000, to = 200, q = 0.8 } = {}, delay = 0) {
    const ctx = this.context();
    if (!ctx) return;
    try {
      const start = ctx.currentTime + delay;
      const source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.Q.value = q;
      filter.frequency.setValueAtTime(from, start);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter).connect(gain).connect(this.master);
      source.start(start, Math.random() * 0.5);
      source.stop(start + duration + 0.05);
    } catch { /* audio is optional */ }
  }

  click() {
    this.tone(1400, 0.035, "triangle", 0.018);
  }

  // A market order leaving: two quick notes, up for buys, down for sells.
  order(side) {
    const up = side === "buy";
    this.tone(up ? 620 : 740, 0.07, "triangle", 0.045);
    this.tone(up ? 930 : 495, 0.11, "triangle", 0.04, null, 0.055);
    this.noise(0.08, 0.025, { type: "highpass", from: 4000, to: 2500 });
  }

  queued() {
    this.tone(560, 0.05, "sine", 0.035);
    this.tone(840, 0.07, "sine", 0.03, null, 0.05);
  }

  fill(side) {
    this.tone(side === "buy" ? 880 : 660, 0.08, "triangle", 0.03);
  }

  // An explosion: a sub drop, a filtered roar and a crack on top.
  boom(strength = 0.5) {
    const s = Math.max(0, Math.min(1, strength));
    this.tone(120 + s * 30, 0.25 + s * 0.45, "sine", 0.12 + s * 0.1, 32);
    this.noise(0.25 + s * 0.6, 0.08 + s * 0.12, { type: "lowpass", from: 1600 + s * 2400, to: 90 });
    this.noise(0.05, 0.05 + s * 0.05, { type: "highpass", from: 3000, to: 1500 });
  }

  // Each wave of a cascade climbs the pentatonic scale.
  wave(index, side) {
    const step = PENTATONIC[Math.min(index, PENTATONIC.length - 1)];
    const base = side === "short" ? 392 : 330;
    this.tone(base * 2 ** (step / 12), 0.12, "square", 0.022);
    this.tone(base * 2 ** ((step + 12) / 12), 0.08, "sine", 0.015, null, 0.02);
  }

  // A new cascade tier: a rising sweep.
  riser(tier) {
    this.noise(0.45, 0.05 + tier * 0.012, { type: "bandpass", from: 300, to: 3500 + tier * 900, q: 3 });
    this.tone(180 + tier * 40, 0.45, "sawtooth", 0.025, 600 + tier * 200);
  }

  // A push running into hidden size: a dull, heavy thud.
  impact() {
    this.tone(82, 0.32, "square", 0.06, 46);
    this.noise(0.3, 0.12, { type: "lowpass", from: 600, to: 80 });
    this.tone(55, 0.4, "sine", 0.12, 38);
  }

  // A bell-like coin: the inharmonic partial makes it read as metal.
  coin(step = 0) {
    const f = 1320 * 2 ** (Math.min(step, 12) / 12);
    this.tone(f, 0.28, "sine", 0.035);
    this.tone(f * 2.76, 0.12, "sine", 0.012);
    this.tone(f * 1.5, 0.3, "sine", 0.03, null, 0.07);
    this.tone(f * 1.5 * 2.76, 0.12, "sine", 0.01, null, 0.07);
  }

  chime(step = 0) {
    const base = 660 * 2 ** (Math.min(step, 10) / 12);
    this.tone(base, 0.14, "triangle", 0.045);
    this.tone(base * 1.5, 0.2, "triangle", 0.04, null, 0.07);
  }

  fanfare() {
    [0, 4, 7, 12, 16].forEach((semi, index) => this.tone(523 * 2 ** (semi / 12), 0.22 + index * 0.04, "triangle", 0.045, null, index * 0.085));
    this.noise(0.6, 0.03, { type: "highpass", from: 6000, to: 9000 }, 0.35);
  }

  heartbeat(critical = false) {
    const volume = critical ? 0.2 : 0.15;
    this.tone(64, 0.12, "sine", volume, 44);
    this.tone(54, 0.15, "sine", volume * 0.8, 40, 0.16);
  }

  whoosh() {
    this.noise(0.4, 0.05, { type: "bandpass", from: 500, to: 2600, q: 1.2 });
  }

  alarm() {
    this.tone(330, 0.14, "triangle", 0.04);
    this.tone(262, 0.2, "triangle", 0.04, null, 0.13);
  }

  pause() {
    this.tone(600, 0.1, "triangle", 0.04);
    this.tone(900, 0.14, "triangle", 0.035, null, 0.08);
  }

  stamp() {
    this.noise(0.12, 0.08, { type: "lowpass", from: 2500, to: 300 });
    this.tone(110, 0.18, "sine", 0.1, 60);
  }

  tick(index = 0) {
    this.tone(700 + index * 60, 0.04, "triangle", 0.022);
  }

  fail() {
    this.tone(240, 0.3, "sawtooth", 0.03, 110);
    this.tone(180, 0.36, "sawtooth", 0.025, 80, 0.08);
  }

  shatter() {
    this.noise(0.35, 0.07, { type: "highpass", from: 2400, to: 6000 });
    for (let i = 0; i < 4; i++) this.tone(2000 + Math.random() * 2600, 0.08, "triangle", 0.012, null, i * 0.035);
  }

  start() {
    this.tone(392, 0.09, "triangle", 0.04);
    this.tone(587, 0.12, "triangle", 0.04, null, 0.06);
  }
}
