// Canvas effects layer over the chart: sparks with motion trails, embers, gold coins, wall shards,
// shockwave rings, bloom flashes, light beams and glitch slices, plus a trauma-based screen shake.
// Everything is additive light on a transparent canvas, so the chart underneath stays readable.
// Purely cosmetic: nothing here reads or changes the market.

const MAX_PARTICLES = 1400;
const TAU = Math.PI * 2;
const rand = (min, max) => min + Math.random() * (max - min);
const easeOut = (t) => 1 - (1 - t) ** 3;

// One soft radial sprite per color, drawn scaled for every glow.
const sprites = new Map();
function glowSprite(color) {
  let sprite = sprites.get(color);
  if (sprite) return sprite;
  sprite = document.createElement("canvas");
  sprite.width = sprite.height = 64;
  const ctx = sprite.getContext("2d");
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, "rgba(255,255,255,0.75)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.22)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 64, 64);
  sprites.set(color, sprite);
  return sprite;
}

// Smooth noise for the shake, so it rolls instead of jittering.
function noise(seed, t) {
  return Math.sin(t * 1.7 + seed) * 0.5 + Math.sin(t * 3.1 + seed * 2.3) * 0.3 + Math.sin(t * 5.3 + seed * 4.1) * 0.2;
}

export class Fx {
  constructor(canvas, shakeTarget, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.shakeTarget = shakeTarget;
    this.reducedMotion = reducedMotion;
    this.enabled = true;
    this.particles = [];
    this.rings = [];
    this.glows = [];
    this.beams = [];
    this.glitchUntil = 0;
    this.glitchSource = null;
    this.trauma = 0;
    this.time = 0;
    this.slowUntil = 0;
    this.slowFactor = 1;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
  }

  get active() {
    return this.enabled && !this.reducedMotion;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (rect.width === this.width && rect.height === this.height && dpr === this.dpr) return;
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = dpr;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
  }

  clear() {
    this.particles.length = 0;
    this.rings.length = 0;
    this.glows.length = 0;
    this.beams.length = 0;
    this.trauma = 0;
    this.glitchUntil = 0;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.shakeTarget) this.shakeTarget.style.transform = "";
  }

  /* ---------- Emitters ---------- */

  push(particle) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(particle);
  }

  // Sparks: fast streaks that slow down and fall. `angle` and `arc` aim the spray.
  sparks(x, y, { color = "#ffd77a", count = 24, speed = 520, angle = -Math.PI / 2, arc = TAU, gravity = 900, life = 0.9, size = 2, drag = 2.6 } = {}) {
    if (!this.active) return;
    for (let i = 0; i < count; i++) {
      const direction = angle + (Math.random() - 0.5) * arc;
      const velocity = speed * rand(0.25, 1);
      this.push({ kind: "spark", x, y, vx: Math.cos(direction) * velocity, vy: Math.sin(direction) * velocity, gravity, drag, life: life * rand(0.5, 1), age: 0, size: size * rand(0.6, 1.3), color });
    }
  }

  // Embers: slow glowing motes that drift up and flicker out.
  embers(x, y, { color = "#ffad42", count = 6, spread = 30, life = 1.8, size = 2.2 } = {}) {
    if (!this.active) return;
    for (let i = 0; i < count; i++) {
      this.push({ kind: "ember", x: x + rand(-spread, spread), y: y + rand(-spread * 0.3, spread * 0.3), vx: rand(-14, 14), vy: rand(-60, -20), gravity: -10, drag: 0.6, life: life * rand(0.6, 1), age: 0, size: size * rand(0.6, 1.4), color, phase: rand(0, TAU) });
    }
  }

  // Gold coins: spin (squashed ellipses), arc up and fall.
  coins(x, y, { count = 18, speed = 620, spread = 1.4 } = {}) {
    if (!this.active) return;
    for (let i = 0; i < count; i++) {
      const direction = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const velocity = speed * rand(0.45, 1);
      this.push({ kind: "coin", x, y, vx: Math.cos(direction) * velocity, vy: Math.sin(direction) * velocity, gravity: 1300, drag: 0.4, life: rand(1.2, 1.8), age: 0, size: rand(6, 10), spin: rand(8, 16), phase: rand(0, TAU) });
    }
  }

  // Shards of a broken wall along a horizontal line, thrown away from `direction` (-1 up, 1 down).
  shards(x0, x1, y, { color = "#ffd77a", count = 22, direction = -1 } = {}) {
    if (!this.active) return;
    for (let i = 0; i < count; i++) {
      const x = x0 + (x1 - x0) * Math.random();
      const size = rand(5, 14);
      const points = [];
      const corners = 3 + Math.floor(Math.random() * 2);
      for (let c = 0; c < corners; c++) {
        const a = (c / corners) * TAU + rand(-0.4, 0.4);
        points.push([Math.cos(a) * size * rand(0.5, 1), Math.sin(a) * size * rand(0.3, 0.7)]);
      }
      this.push({ kind: "shard", x, y, vx: rand(-160, 160), vy: direction * rand(120, 420), gravity: 1100, drag: 0.8, life: rand(0.8, 1.3), age: 0, rotation: rand(0, TAU), spin: rand(-9, 9), points, color });
    }
  }

  // An expanding shockwave ring.
  ring(x, y, { color = "#2de2a6", radius = 180, width = 3, life = 0.7, delay = 0 } = {}) {
    if (!this.active) return;
    this.rings.push({ x, y, color, radius, width, life, age: -delay });
  }

  // A soft bloom of light at a point.
  glow(x, y, { color = "#ffd77a", radius = 160, life = 0.5, alpha = 0.9 } = {}) {
    if (!this.enabled) return;
    this.glows.push({ x, y, color, radius, life, age: 0, alpha });
  }

  // A light beam across the chart at a price row, or down a column (vertical: true).
  beam(at, { color = "#ff4f6e", from = 0, to = null, thickness = 26, life = 0.9, vertical = false } = {}) {
    if (!this.enabled) return;
    this.beams.push({ at, color, from, to, thickness, life, age: 0, vertical });
  }

  // Horizontal slices of the chart jump sideways for a moment.
  glitch(source, seconds = 0.6) {
    if (!this.active) return;
    this.glitchSource = source;
    this.glitchUntil = this.time + seconds;
  }

  // Trauma goes in, shake comes out as trauma squared: small hits barely move, big ones rock.
  shake(amount) {
    if (!this.active) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  // Bullet time: the market runs slower for a moment. The engine is untouched; only the real time
  // fed into it shrinks.
  slowmo(factor = 0.3, seconds = 0.6) {
    if (!this.active) return;
    this.slowFactor = factor;
    this.slowUntil = this.time + seconds;
  }

  timeScale() {
    if (this.time >= this.slowUntil) return 1;
    // Ease back to full speed over the last third.
    const left = (this.slowUntil - this.time) / 0.3;
    return left >= 1 ? this.slowFactor : this.slowFactor + (1 - this.slowFactor) * (1 - left);
  }

  /* ---------- Frame ---------- */

  frame(dt) {
    this.time += dt;
    this.resize();
    this.update(dt);
    this.draw();
    this.applyShake();
  }

  update(dt) {
    const alive = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      const damping = Math.exp(-p.drag * dt);
      p.vx *= damping;
      p.vy = p.vy * damping + p.gravity * dt;
      p.px = p.x;
      p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "shard" || p.kind === "coin") p.rotation = (p.rotation ?? 0) + (p.spin ?? 0) * dt;
      if (p.y > this.height + 40) continue;
      alive.push(p);
    }
    this.particles = alive;
    for (const list of [this.rings, this.glows, this.beams]) {
      for (const item of list) item.age += dt;
    }
    this.rings = this.rings.filter((ring) => ring.age < ring.life);
    this.glows = this.glows.filter((glow) => glow.age < glow.life);
    this.beams = this.beams.filter((beam) => beam.age < beam.life);
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
  }

  draw() {
    const { ctx, dpr, width, height } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.enabled) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this.time < this.glitchUntil && this.glitchSource) this.drawGlitch();

    ctx.globalCompositeOperation = "lighter";
    for (const beam of this.beams) {
      const t = beam.age / beam.life;
      const fade = t < 0.12 ? t / 0.12 : 1 - easeOut((t - 0.12) / 0.88);
      const sprite = glowSprite(beam.color);
      const thickness = beam.thickness * (1 + t * 0.6);
      ctx.globalAlpha = Math.max(0, fade) * 0.9;
      if (beam.vertical) {
        const top = beam.from;
        const bottom = beam.to ?? height;
        ctx.drawImage(sprite, beam.at - thickness / 2, top, thickness, bottom - top);
        ctx.fillStyle = beam.color;
        ctx.fillRect(beam.at - 1, top, 2, bottom - top);
      } else {
        const left = beam.from;
        const right = beam.to ?? width;
        ctx.drawImage(sprite, left - 40, beam.at - thickness / 2, right - left + 80, thickness);
        ctx.globalAlpha = Math.max(0, fade);
        ctx.fillStyle = "#fff";
        ctx.fillRect(left, beam.at - 0.75, right - left, 1.5);
      }
    }

    for (const glow of this.glows) {
      const t = glow.age / glow.life;
      const radius = glow.radius * (0.6 + easeOut(t) * 0.6);
      ctx.globalAlpha = glow.alpha * (1 - t) ** 2;
      ctx.drawImage(glowSprite(glow.color), glow.x - radius, glow.y - radius, radius * 2, radius * 2);
    }

    for (const ring of this.rings) {
      if (ring.age < 0) continue;
      const t = ring.age / ring.life;
      const radius = 6 + ring.radius * easeOut(t);
      const fade = (1 - t) ** 1.6;
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = fade * 0.25;
      ctx.lineWidth = ring.width * 5 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, radius, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = fade;
      ctx.lineWidth = ring.width * (1 - t * 0.7);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, radius, 0, TAU);
      ctx.stroke();
    }

    for (const p of this.particles) {
      const t = p.age / p.life;
      if (p.kind === "spark") {
        const fade = 1 - t;
        const tail = 0.045;
        ctx.globalAlpha = fade;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * (1 - t * 0.5);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x - p.vx * tail, p.y - p.vy * tail);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        if (p.size > 1.6) {
          const r = p.size * 4;
          ctx.globalAlpha = fade * 0.5;
          ctx.drawImage(glowSprite(p.color), p.x - r, p.y - r, r * 2, r * 2);
        }
      } else if (p.kind === "ember") {
        const flicker = 0.6 + 0.4 * Math.sin(p.age * 18 + p.phase);
        const fade = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
        const r = p.size * 3.5;
        ctx.globalAlpha = Math.max(0, fade * flicker);
        ctx.drawImage(glowSprite(p.color), p.x - r, p.y - r, r * 2, r * 2);
      }
    }

    ctx.globalCompositeOperation = "source-over";
    for (const p of this.particles) {
      const t = p.age / p.life;
      const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      if (p.kind === "coin") {
        const squash = Math.cos(p.age * p.spin + p.phase);
        const w = Math.max(0.8, Math.abs(squash) * p.size);
        ctx.globalAlpha = fade;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = squash > 0 ? "#ffd56b" : "#e0a52a";
        ctx.beginPath();
        ctx.ellipse(0, 0, w, p.size, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "#a8690c";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        if (w > p.size * 0.4) {
          ctx.fillStyle = "#fff4c6";
          ctx.beginPath();
          ctx.ellipse(-w * 0.3, -p.size * 0.35, w * 0.25, p.size * 0.22, -0.5, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      } else if (p.kind === "shard") {
        ctx.globalAlpha = fade;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        p.points.forEach(([px, py], index) => (index ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawGlitch() {
    const { ctx, width, height, dpr } = this;
    const source = this.glitchSource;
    const slices = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < slices; i++) {
      const sliceHeight = rand(4, 34);
      const y = rand(0, height - sliceHeight);
      const offset = rand(-28, 28);
      try {
        ctx.drawImage(source, 0, y * dpr, width * dpr, sliceHeight * dpr, offset, y, width, sliceHeight);
      } catch { /* the source may be mid-resize */ }
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,0,90,0.18)" : "rgba(0,230,255,0.18)";
      ctx.fillRect(0, y, width, sliceHeight);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  applyShake() {
    if (!this.shakeTarget) return;
    if (!this.active || this.trauma <= 0.001) {
      if (this.shaking) {
        this.shakeTarget.style.transform = "";
        this.shaking = false;
      }
      return;
    }
    const amount = this.trauma * this.trauma;
    const t = this.time * 22;
    const x = 16 * amount * noise(1, t);
    const y = 11 * amount * noise(7, t);
    const angle = 0.9 * amount * noise(13, t);
    this.shakeTarget.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${angle.toFixed(3)}deg)`;
    this.shaking = true;
  }
}
