// Homepage hero: a living order book rendered as a 3D liquidity field.
// Columns are price levels, rows are moments in time (the front row is "now"
// and history recedes into the fog). Bids glow mint, asks amber, resting walls
// gold; a luminous price ribbon runs through the spread and throws off trades.
// Everything is a pure function of time, like the academy's motion lessons.
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";

const BG = new Color("#05090f");
const BID = new Color("#78e1d5");
const BID_LOW = new Color("#0e3438");
const ASK = new Color("#e0874d");
const ASK_LOW = new Color("#2e1a10");
const WALL = new Color("#ffd89a");

const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function noise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const h = (a, b) => hash(a * 57.3 + b * 131.7);
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function glowTexture(size = 128, inner = "rgba(255,255,255,1)", mid = "rgba(170,255,245,0.35)") {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  r.addColorStop(0, inner);
  r.addColorStop(0.25, mid);
  r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function mountHeroField(canvas, { small = false, still = false } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: !small, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75));
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 200);

  // ---------- the field ----------
  const NX = small ? 60 : 96;
  const NZ = small ? 40 : 58;
  const SX = small ? 0.62 : 0.42;
  const SZ = 0.66;
  const FRONT = 5;
  const RATE = 2.4; // rows per second
  const geo = new BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new ShaderMaterial({
    uniforms: {
      uBg: { value: BG },
      uNear: { value: 9 },
      uFar: { value: 36 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vColor;
      varying float vH;
      varying float vDepth;
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vColor = instanceColor;
        vH = position.y;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBg;
      uniform float uNear;
      uniform float uFar;
      varying vec3 vColor;
      varying float vH;
      varying float vDepth;
      void main() {
        vec3 c = vColor * (0.12 + 0.95 * pow(vH, 2.2));
        c += vColor * smoothstep(0.92, 1.0, vH) * 0.6;
        float f = smoothstep(uNear, uFar, vDepth);
        gl_FragColor = vec4(mix(c, uBg, f), 1.0);
      }`,
  });
  const field = new InstancedMesh(geo, mat, NX * NZ);
  field.instanceMatrix.setUsage(DynamicDrawUsage);
  field.instanceColor = new InstancedBufferAttribute(new Float32Array(NX * NZ * 3), 3);
  field.instanceColor.setUsage(DynamicDrawUsage);
  field.frustumCulled = false;
  scene.add(field);

  // Mid price (in world x) at absolute time index k.
  const mid = (k) =>
    5.2 * Math.sin(k * 0.021) +
    2.6 * Math.sin(k * 0.057 + 1.3) +
    1.1 * Math.sin(k * 0.13 + 0.7) +
    0.35 * Math.sin(k * 0.41);
  const colX = (i) => (i - (NX - 1) / 2) * SX;
  // Walls at fixed prices; each lives for a stretch of time until price reaches it.
  const WALLS = [
    { x: -8.4, from: -1e9, to: 1e9, amp: 1.5 },
    { x: 7.2, from: -1e9, to: 1e9, amp: 3.1 },
    { x: 2.6, from: 40, to: 260, amp: 2.2 },
    { x: -3.4, from: 300, to: 520, amp: 2.0 },
  ];
  const tmp = new Color();
  function depthAt(i, k) {
    const x = colX(i);
    const d = x - mid(k);
    const ad = Math.abs(d);
    if (ad < SX * 0.9) return [0.04, d];
    const shape = Math.min(1, (ad - SX * 0.9) / 1.6) * Math.exp(-ad * 0.075);
    let h = (0.2 + 1.05 * noise2(i * 0.35, k * 0.09) + 0.45 * noise2(i * 1.7, k * 0.33)) * shape;
    for (const w of WALLS) {
      const span = Math.max(0, Math.min(1, (k - w.from) / 30, (w.to - k) / 30));
      if (span <= 0) continue;
      // A wall sits on the side of the book it belongs to and is eaten when price crosses it.
      const onSide = Math.sign(w.x - mid(k)) === Math.sign(d) && Math.abs(w.x - mid(k)) > SX;
      const g = Math.exp(-((x - w.x) ** 2) / (SX * SX * 0.9));
      if (onSide) h += w.amp * g * span * (0.8 + 0.2 * Math.sin(k * 0.05 + w.x));
    }
    return [h, d];
  }

  // ---------- price ribbon ----------
  const RIB = NZ * 3;
  const ribPos = new Float32Array(RIB * 3);
  const ribGeo = new BufferGeometry();
  ribGeo.setAttribute("position", new BufferAttribute(ribPos, 3).setUsage(DynamicDrawUsage));
  const ribbon = new Line(ribGeo, new LineBasicMaterial({ color: 0xeafffb, transparent: true, opacity: 0.95 }));
  ribbon.frustumCulled = false;
  scene.add(ribbon);
  const beadGeo = new BufferGeometry();
  const beadPos = new Float32Array(RIB * 3);
  beadGeo.setAttribute("position", new BufferAttribute(beadPos, 3).setUsage(DynamicDrawUsage));
  const glow = glowTexture();
  const beads = new Points(
    beadGeo,
    new PointsMaterial({
      size: 1.1,
      map: glow,
      color: 0x9ff3ea,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  beads.frustumCulled = false;
  scene.add(beads);
  const head = new Points(
    new BufferGeometry().setAttribute(
      "position",
      new BufferAttribute(new Float32Array(3), 3).setUsage(DynamicDrawUsage),
    ),
    new PointsMaterial({
      size: 3.4,
      map: glow,
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  head.frustumCulled = false;
  scene.add(head);

  // ---------- trades ----------
  const NP = small ? 120 : 240;
  const LIFE = 2.6;
  const pPos = new Float32Array(NP * 3);
  const pCol = new Float32Array(NP * 3);
  const pGeo = new BufferGeometry();
  pGeo.setAttribute("position", new BufferAttribute(pPos, 3).setUsage(DynamicDrawUsage));
  pGeo.setAttribute("color", new BufferAttribute(pCol, 3).setUsage(DynamicDrawUsage));
  const sparks = new Points(
    pGeo,
    new PointsMaterial({
      size: 0.32,
      map: glowTexture(64),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  sparks.frustumCulled = false;
  scene.add(sparks);

  // ---------- dust & horizon ----------
  const ND = small ? 300 : 700;
  const dPos = new Float32Array(ND * 3);
  for (let i = 0; i < ND; i++) {
    dPos[i * 3] = (hash(i + 1) - 0.5) * 90;
    dPos[i * 3 + 1] = hash(i + 7) * 22 + 1;
    dPos[i * 3 + 2] = -hash(i + 13) * 70 + 8;
  }
  const dust = new Points(
    new BufferGeometry().setAttribute("position", new BufferAttribute(dPos, 3)),
    new PointsMaterial({
      size: 0.16,
      map: glowTexture(32),
      color: 0x7aa7b8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  scene.add(dust);
  const horizonTex = (() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const g = c.getContext("2d");
    const r = g.createRadialGradient(256, 256, 0, 256, 256, 256);
    r.addColorStop(0, "rgba(120,225,213,0.55)");
    r.addColorStop(0.35, "rgba(60,140,150,0.18)");
    r.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 512, 256);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  })();
  const horizon = new Mesh(
    new PlaneGeometry(120, 30),
    new ShaderMaterial({
      uniforms: { uMap: { value: horizonTex } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D uMap; varying vec2 vUv; void main(){ gl_FragColor = texture2D(uMap, vUv); }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  horizon.position.set(0, 2, -44);
  scene.add(horizon);

  // ---------- frame ----------
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let scroll = 0;
  const look = new Vector3();
  function frame(t) {
    const offset = t * RATE;
    const base = Math.floor(offset);
    const frac = offset - base;
    const m = field.instanceMatrix.array;
    const col = field.instanceColor.array;
    const w = SX * 0.78;
    const dz = SZ * 0.8;
    for (let j = 0; j < NZ; j++) {
      const k = base - j;
      const z = FRONT - (j + frac) * SZ;
      const fadeIn = j === 0 ? frac : 1;
      for (let i = 0; i < NX; i++) {
        const n = j * NX + i;
        const [h0, d] = depthAt(i, k);
        const h = Math.max(0.02, h0 * fadeIn);
        const o = n * 16;
        m[o] = w;
        m[o + 1] = 0;
        m[o + 2] = 0;
        m[o + 3] = 0;
        m[o + 4] = 0;
        m[o + 5] = h;
        m[o + 6] = 0;
        m[o + 7] = 0;
        m[o + 8] = 0;
        m[o + 9] = 0;
        m[o + 10] = dz;
        m[o + 11] = 0;
        m[o + 12] = colX(i);
        m[o + 13] = 0;
        m[o + 14] = z;
        m[o + 15] = 1;
        const s = Math.min(1, h / 2.2);
        if (d < 0) tmp.copy(BID_LOW).lerp(BID, s);
        else tmp.copy(ASK_LOW).lerp(ASK, s);
        if (h > 2.3) tmp.lerp(WALL, Math.min(1, (h - 2.3) / 1.4));
        col[n * 3] = tmp.r;
        col[n * 3 + 1] = tmp.g;
        col[n * 3 + 2] = tmp.b;
      }
    }
    field.instanceMatrix.needsUpdate = true;
    field.instanceColor.needsUpdate = true;

    // Ribbon through the spread; the head is "now".
    for (let r = 0; r < RIB; r++) {
      const jj = r / 3;
      const kk = offset - jj;
      const x = mid(kk);
      const z = FRONT - jj * SZ;
      ribPos[r * 3] = beadPos[r * 3] = x;
      ribPos[r * 3 + 1] = beadPos[r * 3 + 1] = 0.12;
      ribPos[r * 3 + 2] = beadPos[r * 3 + 2] = z;
    }
    ribGeo.attributes.position.needsUpdate = true;
    beadGeo.attributes.position.needsUpdate = true;
    const hx = mid(offset);
    const hp = head.geometry.attributes.position.array;
    hp[0] = hx;
    hp[1] = 0.2;
    hp[2] = FRONT;
    head.geometry.attributes.position.needsUpdate = true;
    head.material.size = 3.2 + Math.sin(t * 3) * 0.4;

    // Trades: each spark is born at the head and arcs away, deterministically.
    for (let p = 0; p < NP; p++) {
      const born = Math.floor((t - (p * LIFE) / NP) / LIFE) * LIFE + (p * LIFE) / NP;
      const age = t - born;
      const seed = Math.floor(born * 10) + p * 13;
      const buy = hash(seed) > 0.45;
      const bx = mid(born * RATE);
      const vx = (hash(seed + 1) - 0.5) * 2.4 + (buy ? -0.4 : 0.4);
      const vy = 1.2 + hash(seed + 2) * 2.8;
      const vz = -0.6 - hash(seed + 3) * 1.6;
      pPos[p * 3] = bx + vx * age;
      pPos[p * 3 + 1] = 0.2 + vy * age - 0.9 * age * age;
      pPos[p * 3 + 2] = FRONT - age * RATE * SZ + vz * age;
      const life = Math.max(0, 1 - age / LIFE);
      const c = buy ? BID : ASK;
      pCol[p * 3] = c.r * life;
      pCol[p * 3 + 1] = c.g * life;
      pCol[p * 3 + 2] = c.b * life;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;

    // Camera: low over the book, drifting with the pointer, rising as you scroll away.
    pointer.sx += (pointer.x - pointer.sx) * 0.05;
    pointer.sy += (pointer.y - pointer.sy) * 0.05;
    const s = scroll;
    const cx = hx * 0.25 + pointer.sx * 1.8 + Math.sin(t * 0.07) * 1.2;
    const shift = camera.aspect > 1.2 ? -3.2 : 0;
    camera.position.set(cx + shift, 6.6 + s * 9 - pointer.sy * 0.9, 13.5 - s * 5);
    look.set(hx * 0.35 + pointer.sx * 0.6 + shift, -0.2 - s * 4, -11 + s * 6);
    camera.lookAt(look);
    dust.rotation.y = t * 0.006;
    renderer.render(scene, camera);
  }

  // ---------- lifecycle ----------
  let raf = 0;
  let running = false;
  let visible = true;
  let start = performance.now() - 30000; // begin mid-story so walls are already standing
  let pausedAt = 0;
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    frame((now - start) / 1000);
  };
  const play = () => {
    if (running || still || !visible || document.hidden) return;
    running = true;
    if (pausedAt) start += performance.now() - pausedAt;
    raf = requestAnimationFrame(loop);
  };
  const pause = () => {
    if (!running) return;
    running = false;
    pausedAt = performance.now();
    cancelAnimationFrame(raf);
  };
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    // Keep the field filling narrow screens.
    camera.fov = camera.aspect < 1 ? 58 : 40;
    camera.updateProjectionMatrix();
    if (!running) frame((performance.now() - start) / 1000);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    visible ? play() : pause();
  });
  io.observe(canvas);
  const onVis = () => (document.hidden ? pause() : play());
  document.addEventListener("visibilitychange", onVis);
  const onMove = (e) => {
    pointer.x = e.clientX / innerWidth - 0.5;
    pointer.y = e.clientY / innerHeight - 0.5;
  };
  addEventListener("pointermove", onMove, { passive: true });
  resize();
  frame(30);
  play();

  return {
    setScroll(p) {
      scroll = Math.max(0, Math.min(1, p));
      if (!running) frame(((pausedAt || performance.now()) - start) / 1000);
    },
    setStill(v) {
      still = v;
      v ? pause() : play();
    },
    dispose() {
      pause();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      removeEventListener("pointermove", onMove);
      renderer.dispose();
    },
  };
}
