// The film's one continuous world: a felt casino table under a pendant lamp, a brass coin, clay chips
// (one stack per player), and charts printed on the felt. Everything is a pure function of time t:
// renderAt(t) poses the camera, the coin, every chip and every on-screen label from window.MODEL
// (the numbers) and window.BEATS (the narration's word times). Bundled by scripts/build.mjs.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const W = 1080;
const H = 1920;
const M = window.MODEL;
const B = window.BEATS;
const INK = "#F1E8D2";
const GOLD = "#E8B44C";
const RED = "#D9483B";
const RED_TEXT = "#F0604A"; // red type on felt needs to be lighter than the red chips to read

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  inOut: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  inOut3: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  in2: (k) => k * k,
  in3: (k) => k * k * k,
  out2: (k) => 1 - (1 - k) * (1 - k),
  out3: (k) => 1 - Math.pow(1 - k, 3),
  expo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
};
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- layout (world units)
const CHIP_R = 0.5;
const CHIP_T = 0.08;
const PER_CHIP = 10; // dollars a chip
const HOME = V(0, 0, 0); // your stack
const BET = V(0, 0, -2.4); // the betting circle
const COIN_AT = V(0.2, 0, 1.6);
const COIN_R = 0.72;
const COIN_T = 0.085;
const PATHS_AT = V(0, 0, -8.8); // printed paths chart
const PATHS_SIZE = [9, 10.8];
const KELLY_AT = V(0, 0, 9.2); // printed Kelly hill
const KELLY_SIZE = [9, 9];
const COLS = 25;
const ROWS = 40;
const SP = 1.3;
const cellPos = (c, r) => V((c - 12) * SP, 0, (r - 19) * SP);

// Player i's cell: you sit at (12, 19) = HOME, the richest player at (17, 26), in front and to the right
// of you as the camera sees the crowd; everyone else is shuffled into the remaining cells.
const cellOf = new Array(M.N);
{
  const free = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) if (!(c === 12 && r === 19) && !(c === 17 && r === 26)) free.push([c, r]);
  free.sort((a, b) => hash(a[0] * 97 + a[1] * 13.7) - hash(b[0] * 97 + b[1] * 13.7));
  cellOf[M.YOU] = cellPos(12, 19);
  cellOf[M.rich] = cellPos(17, 26);
  let k = 0;
  for (let i = 0; i < M.N; i++) if (i !== M.YOU && i !== M.rich) cellOf[i] = cellPos(...free[k++]);
}
const RICH = cellOf[M.rich];
const maxCellDist = Math.max(...cellOf.map((p) => p.length()));

// Wealth → stack: one chip per $10; under one chip, the chip's area shrinks with the money.
function stackOf(w) {
  const n = w / PER_CHIP;
  return n >= 1 ? { r: CHIP_R, n } : { r: CHIP_R * Math.sqrt(Math.max(n, 0)), n: 1 };
}
// Wealth of player i at fractional round r (geometric interpolation between flips).
function wealthAt(run, i, r) {
  r = clamp(r, 0, M.R);
  const a = Math.floor(r);
  const b = Math.min(M.R, a + 1);
  const k = r - a;
  const wa = run.w[a][i];
  const wb = run.w[b][i];
  return wa * Math.pow(wb / wa, k);
}

// ---------------------------------------------------------------- renderer, scene, camera
const canvas = document.getElementById("world-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#040907");
const camera = new THREE.PerspectiveCamera(34, W / H, 0.05, 500);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const key = new THREE.DirectionalLight("#ffe2b8", 2.4);
key.position.set(-2.5, 7, 4);
scene.add(key);
const rim = new THREE.DirectionalLight("#cfe3ff", 0.9);
rim.position.set(3, 2.5, -6);
scene.add(rim);
scene.add(new THREE.HemisphereLight("#fff1d6", "#123a2a", 0.5));

const U = {
  uPoolC: { value: V(0, 0, 0) },
  uPoolR: { value: 6 },
  uKey: { value: V(-2.5, 7, 4).normalize() },
};

const GLSL_COMMON = /* glsl */ `
  uniform vec3 uPoolC; uniform float uPoolR; uniform vec3 uKey;
  float pool(vec3 p) { vec2 d = (p.xz - uPoolC.xz) / uPoolR; return exp(-dot(d, d) * 1.15); }
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fibre(vec2 p) {
    float fw = length(fwidth(p));
    float hi = vnoise(p * vec2(38., 27.)) * (1. - smoothstep(0.012, 0.04, fw));
    float mid = vnoise(p * 7.3 + 7.1) * (1. - smoothstep(0.08, 0.3, fw));
    float lo = vnoise(p * 1.3 + 3.7);
    return hi * 0.45 + mid * 0.33 + lo * 0.22;
  }
`;

// The felt: baize green lit by the lamp's pool, fibre texture, dark room past the table's edge.
const felt = new THREE.Mesh(
  new THREE.PlaneGeometry(240, 240).rotateX(-Math.PI / 2),
  new THREE.ShaderMaterial({
    uniforms: { ...U, uHi: { value: new THREE.Color("#1F5C45") }, uLo: { value: new THREE.Color("#0A2018") }, uRoom: { value: new THREE.Color("#040907") } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: GLSL_COMMON + /* glsl */ `
      uniform vec3 uHi, uLo, uRoom; varying vec3 vW;
      void main(){
        float pl = pool(vW);
        float f = fibre(vW.xz);
        vec3 col = mix(uLo, uHi, pl) * (0.86 + 0.28 * f);
        float e = max(abs(vW.x), abs(vW.z));
        float rail = smoothstep(46.0, 46.4, e) * (1.0 - smoothstep(48.6, 49.0, e));
        col = mix(col, vec3(0.05, 0.025, 0.012) * (0.6 + pl), rail);
        col = mix(col, uRoom, smoothstep(48.6, 49.0, e));
        gl_FragColor = vec4(col, 1.);
        #include <colorspace_fragment>
      }`,
  }),
);
scene.add(felt);

// Printed layers: ink on the felt (canvas textures), lit by the same lamp, broken by the fibre.
function printMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, map: { value: tex }, uOpacity: { value: 1 } },
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: GLSL_COMMON + /* glsl */ `
      uniform sampler2D map; uniform float uOpacity; varying vec2 vUv; varying vec3 vW;
      void main(){
        vec4 c = texture2D(map, vUv);
        float f = fibre(vW.xz);
        float a = c.a * uOpacity * (0.8 + 0.2 * f);
        vec3 col = c.rgb * mix(0.4, 1.08, pool(vW));
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
}
function makePrint(wu, hu, wpx, hpx, at) {
  const cv = document.createElement("canvas");
  cv.width = wpx;
  cv.height = hpx;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wu, hu).rotateX(-Math.PI / 2), printMaterial(tex));
  mesh.position.copy(at).setY(0.004);
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { cv, ctx: cv.getContext("2d"), tex, mesh, key: "", wu, hu, at };
}
const betPrint = makePrint(2.8, 2.8, 1024, 1024, BET);
const youPrint = makePrint(2.2, 2.2, 1024, 1024, HOME);
const pathsPrint = makePrint(PATHS_SIZE[0], PATHS_SIZE[1], 2560, 3072, PATHS_AT);
const kellyPrint = makePrint(KELLY_SIZE[0], KELLY_SIZE[1], 2560, 2560, KELLY_AT);

// Chips: one instanced cylinder per stack. Local y runs 0..1 over the stack, aChips says how many
// chips tall it is, so the side shows a groove per chip and six edge inserts that turn chip to chip.
const chipGeo = new THREE.CylinderGeometry(1, 1, 1, 72, 1).translate(0, 0.5, 0);
function chipMaterial(transparent) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U },
    transparent,
    depthWrite: !transparent,
    vertexShader: /* glsl */ `
      attribute float aChips; attribute vec3 aBody; attribute vec3 aInsert; attribute float aAlpha; attribute float aSeed;
      varying vec3 vL; varying vec3 vLN; varying vec3 vN; varying vec3 vW; varying float vChips; varying vec3 vBody; varying vec3 vIns; varying float vAlpha; varying float vSeed;
      void main(){
        vL = position; vLN = normal; vChips = aChips; vBody = aBody; vIns = aInsert; vAlpha = aAlpha; vSeed = aSeed;
        mat4 m = modelMatrix * instanceMatrix;
        vec4 w = m * vec4(position, 1.); vW = w.xyz;
        vN = normalize(mat3(m) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: GLSL_COMMON + /* glsl */ `
      varying vec3 vL; varying vec3 vLN; varying vec3 vN; varying vec3 vW; varying float vChips; varying vec3 vBody; varying vec3 vIns; varying float vAlpha; varying float vSeed;
      float h11(float x){ return fract(sin(x * 91.7 + vSeed * 17.3) * 43758.5); }
      void main(){
        vec3 N = normalize(vN);
        vec3 base = vBody;
        float edge = 0.;
        if (abs(vLN.y) < 0.5) {
          float c = vL.y * vChips;
          float fc = fract(c); float id = floor(c);
          float fw = fwidth(c);
          float detail = 1. - smoothstep(0.12, 0.45, fw);
          float ang = atan(vL.z, vL.x) / 6.28318 + 0.5;
          float ins = step(fract(ang * 6. + h11(id)), 0.2) * smoothstep(0.16, 0.2, fc) * (1. - smoothstep(0.8, 0.84, fc));
          base = mix(base, vIns, ins * detail);
          float groove = smoothstep(0., 0.07 + fw, fc) * (1. - smoothstep(0.93 - fw, 1., fc));
          base *= mix(1., mix(0.55, 1., groove), detail);
          edge = 1. - groove;
        } else {
          float r = length(vL.xz);
          float ring = smoothstep(0.6, 0.62, r) * (1. - smoothstep(0.7, 0.72, r));
          float ang = atan(vL.z, vL.x) / 6.28318 + 0.5;
          float notch = step(fract(ang * 12. + vSeed), 0.5) * smoothstep(0.86, 0.88, r);
          base = mix(base * 1.04, vIns, max(ring, notch * 0.9));
          edge = smoothstep(0.9, 1.0, r);
        }
        float pl = pool(vW);
        float diff = max(dot(N, uKey), 0.);
        vec3 amb = mix(vec3(0.09, 0.2, 0.15), vec3(0.42, 0.38, 0.32), N.y * 0.5 + 0.5);
        vec3 V = normalize(cameraPosition - vW);
        float spec = pow(max(dot(N, normalize(uKey + V)), 0.), 36.) * 0.14;
        vec3 col = base * (amb + vec3(1.0, 0.9, 0.75) * diff * 1.05) * mix(0.28, 1.05, pl) + spec * pl;
        float a = vAlpha;
        if (vAlpha < 0.999) a = vAlpha * (0.45 + 0.55 * edge);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
}
function makeStacks(count, transparent) {
  const geo = chipGeo.clone();
  const attr = (name, size) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(count * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a;
  };
  const mesh = new THREE.InstancedMesh(geo, chipMaterial(transparent), count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const s = { mesh, chips: attr("aChips", 1), body: attr("aBody", 3), ins: attr("aInsert", 3), alpha: attr("aAlpha", 1), seed: attr("aSeed", 1), count, used: 0 };
  for (let i = 0; i < count; i++) s.seed.setX(i, hash(i * 3.1));
  mesh.renderOrder = transparent ? 3 : 2;
  scene.add(mesh);
  return s;
}
const crowd = makeStacks(M.N, false);
const loose = makeStacks(48, false);
const ghosts = makeStacks(12, true);

// Contact shadows: a soft dark disc under every stack and under the coin.
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function makeShadows(count) {
  const geo = shadowGeo.clone();
  const a = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aShade", a);
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `attribute float aShade; varying vec2 vUv; varying float vS; void main(){ vUv = uv; vS = aShade; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position,1.); }`,
      fragmentShader: `varying vec2 vUv; varying float vS; void main(){ float r = length(vUv - .5) * 2.; float a = pow(clamp(1. - r, 0., 1.), 1.8) * vS; gl_FragColor = vec4(0.005, 0.02, 0.012, a * 0.62); }`,
    }),
    count,
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { mesh, shade: a };
}
const crowdShadows = makeShadows(M.N);
const looseShadows = makeShadows(49);

const C = {
  ivoryBody: new THREE.Color("#E6DCC5"),
  ivoryIns: new THREE.Color("#B8372C"),
  goldBody: new THREE.Color("#D9A440"),
  goldIns: new THREE.Color("#F4EAD4"),
  lostBody: new THREE.Color("#6E3A30"),
  lostIns: new THREE.Color("#9C6A5C"),
  aheadBody: new THREE.Color("#F2E7CC"),
  ghostInk: new THREE.Color("#F1E8D2"),
  ghostRed: new THREE.Color("#E0533F"),
};
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
function setStack(S, i, pos, r, n, body, ins, quat = null, alpha = 1) {
  _q.copy(quat || new THREE.Quaternion());
  _s.set(r, n * CHIP_T, r);
  _m.compose(pos, _q, _s);
  S.mesh.setMatrixAt(i, _m);
  S.chips.setX(i, n);
  S.body.setXYZ(i, body.r, body.g, body.b);
  S.ins.setXYZ(i, ins.r, ins.g, ins.b);
  S.alpha.setX(i, alpha);
}
function hideStack(S, i) {
  _m.makeScale(0, 0, 0);
  S.mesh.setMatrixAt(i, _m);
}
function setShadow(SH, i, pos, r, shade) {
  _m.compose(_p.set(pos.x, 0.003, pos.z), _q.identity(), _s.set(r * 2.9, 1, r * 2.9));
  SH.mesh.setMatrixAt(i, _m);
  SH.shade.setX(i, shade);
}
function commit(S) {
  S.mesh.instanceMatrix.needsUpdate = true;
  for (const k of ["chips", "body", "ins", "alpha"]) S[k].needsUpdate = true;
}

// The dashed START ring that floats at the $100 height around your stack.
const startRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.7, 0.011, 8, 160).rotateX(Math.PI / 2),
  new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform float uOpacity; varying vec3 vP; void main(){ float a = atan(vP.z, vP.x) / 6.28318; float d = step(fract(a * 36.), 0.55); gl_FragColor = vec4(vec3(0.88, 0.82, 0.7), d * uOpacity); }`,
  }),
);
startRing.renderOrder = 4;
scene.add(startRing);

// ---------------------------------------------------------------- the coin
function coinFace(label, sub, rot) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1024;
  const g = cv.getContext("2d");
  const bump = document.createElement("canvas");
  bump.width = bump.height = 1024;
  const b = bump.getContext("2d");
  const grad = g.createRadialGradient(430, 380, 40, 512, 512, 560);
  grad.addColorStop(0, "#F3CF7A");
  grad.addColorStop(0.55, "#D7A548");
  grad.addColorStop(1, "#A9772B");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 1024);
  b.fillStyle = "#808080";
  b.fillRect(0, 0, 1024, 1024);
  for (const [ctx, ink] of [
    [g, "rgba(96,60,16,0.55)"],
    [b, "#ffffff"],
  ]) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(512, 512, 452, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(512, 512, 418, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(512 + Math.cos(a) * 436, 512 + Math.sin(a) * 436, 5, 0, Math.PI * 2);
      ctx.fillStyle = ink;
      ctx.fill();
    }
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "400 380px 'League Gothic'";
    ctx.fillText(label, 512, 500);
    ctx.font = "700 64px Montserrat";
    ctx.letterSpacing = "18px";
    ctx.fillText(sub, 521, 772);
    ctx.letterSpacing = "0px";
  }
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bm = new THREE.CanvasTexture(bump);
  // Cylinder caps map u/v rotated a quarter turn from the face as the camera sees it.
  for (const tx of [map, bm]) {
    tx.center.set(0.5, 0.5);
    tx.rotation = rot;
  }
  return new THREE.MeshStandardMaterial({ map, bumpMap: bm, bumpScale: 3.2, metalness: 1, roughness: 0.5, envMapIntensity: 0.24 });
}
let coin;
function buildCoin() {
  const edge = document.createElement("canvas");
  edge.width = 2048;
  edge.height = 64;
  const e = edge.getContext("2d");
  for (let x = 0; x < 2048; x += 8) {
    e.fillStyle = x % 16 ? "#606060" : "#f0f0f0";
    e.fillRect(x, 0, 8, 64);
  }
  const edgeBump = new THREE.CanvasTexture(edge);
  const side = new THREE.MeshStandardMaterial({ color: "#C8963E", bumpMap: edgeBump, bumpScale: 1.6, metalness: 1, roughness: 0.45, envMapIntensity: 0.38 });
  const geo = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_T, 128, 1);
  // Cylinder cap UVs map the disc to the square texture; flip the bottom so its text reads upright.
  coin = new THREE.Mesh(geo, [side, coinFace("×1.5", "HEADS", Math.PI / 2), coinFace("×0.6", "TAILS", -Math.PI / 2)]);
  coin.renderOrder = 2;
  scene.add(coin);
}
const coinShadow = makeShadows(1);

// Coin pose. theta rotates the coin about the world x axis (0 = heads up, PI = tails up,
// PI/2 = heads facing the camera); spin turns a coin standing on its edge about the vertical axis.
function toss(t, t0, t1, from, to, peak, th0, th1) {
  const k = seg(t, t0, t1);
  const p = from.clone().lerp(to, k);
  p.y = lerp(from.y, to.y, k) + 4 * peak * k * (1 - k);
  return { p, theta: lerp(th0, th1, k), k };
}
function landWobble(t, tLand, amp = 0.07) {
  const s = t - tLand;
  return s < 0 ? 0 : amp * Math.exp(-s * 7) * Math.sin(s * 34);
}
const REST = COIN_T / 2 + 0.002;
const OFF_LEFT = V(-3.4, REST, 3.2);
function coinState(t) {
  const C0 = COIN_AT.clone().setY(REST);
  const st = { visible: true, p: C0.clone(), theta: 0, spin: 0, edge: 0, wob: 0 };
  // 1. Hook: a slow-motion toss already in the air at frame 0, heads up at 3.25 s.
  const omega = (4 * Math.PI - (Math.PI / 2 - 0.25)) / 3.25;
  if (t < 3.25) {
    const k = (t + 0.6) / 3.85;
    st.p.y = REST + 4 * 2.6 * k * (1 - k);
    st.theta = Math.PI / 2 - 0.25 + omega * t;
    return st;
  }
  if (t < 5.7) {
    st.theta = 4 * Math.PI;
    st.wob = landWobble(t, 3.25);
    return st;
  }
  // The hundred flips: the coin spins on its edge, slows, wobbles and drops tails up on "out".
  const fall = B.out + 0.05;
  if (t < fall + 0.6) {
    const up = E.out2(seg(t, 5.7, 5.95));
    const down = seg(t, fall, fall + 0.22);
    st.edge = up * (1 - E.in2(down));
    st.p.y = REST + (COIN_R - REST) * st.edge;
    st.spin = (t - 5.7) * 26 - Math.max(0, t - 7.0) * Math.max(0, t - 7.0) * 9;
    st.theta = down > 0 ? Math.PI : 0;
    st.wob = landWobble(t, fall + 0.22, 0.05);
    st.prec = 0.16 * seg(t, 6.6, fall);
    return st;
  }
  if (t < B.pair) return { visible: false };
  // 3. Pair and gap: tossed in from the left, heads; flipped to tails; then the two real tosses.
  const tl = [
    { t0: B.heads - 0.45, t1: B.heads + 0.35, from: OFF_LEFT, peak: 1.6, face: 0, turns: 3 },
    { t0: B.tails - 0.55, t1: B.tails + 0.25, peak: 1.4, face: 1, turns: 2 },
    { t0: B.win - 0.05, t1: B.c150 - 0.32, peak: 2.0, face: 0, turns: 4 },
    { t0: B.lose - 0.05, t1: B.c90 - 0.6, peak: 2.0, face: 1, turns: 4 },
    { t0: B.gap - 0.15, t1: B.drop40 - 0.05, peak: 1.8, face: 1, turns: 3 },
    { t0: B.gives - 0.9, t1: B.gives - 0.1, peak: 1.8, face: 0, turns: 3 },
  ];
  let face = 0;
  if (t < tl[0].t0) return { visible: false };
  for (let i = 0; i < tl.length; i++) {
    const s = tl[i];
    const next = tl[i + 1];
    if (t < s.t0) break;
    const prevFace = i === 0 ? 0 : tl[i - 1].face;
    const th0 = prevFace * Math.PI;
    const th1 = (prevFace + s.turns * 2 + (s.face - prevFace)) * Math.PI;
    if (t < s.t1) {
      const o = toss(t, s.t0, s.t1, s.from || C0, C0, s.peak, th0, th1);
      st.p = o.p;
      st.theta = o.theta;
      return st;
    }
    face = s.face;
    st.theta = th1;
    st.wob = landWobble(t, s.t1);
    if (next && t < next.t0) return st;
  }
  // 5. Crowd: the coin is flipped up out of the frame for everyone at once.
  if (t < B.crowd + 0.1) return st;
  if (t < B.coda - 0.2) {
    const k = seg(t, B.crowd + 0.1, B.crowd + 0.9);
    if (k >= 1) return { visible: false };
    st.p.y = REST + E.in2(k) * 14;
    st.theta = face * Math.PI + k * 6 * Math.PI;
    return st;
  }
  // 10. Coda: it falls back into the opening framing, in slow motion, and lands heads.
  const tLand = B.yourself - 0.55;
  if (t < tLand) {
    const k = seg(t, B.coda - 0.2, tLand);
    st.p.y = REST + (1 - E.in2(k)) * 3.4 + Math.sin(k * Math.PI) * 0.3;
    st.theta = lerp(Math.PI / 2 + 1.2 * Math.PI, 4 * Math.PI, E.out2(k));
    return st;
  }
  st.theta = 4 * Math.PI;
  st.wob = landWobble(t, tLand);
  return st;
}
const _qx = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
function poseCoin(t) {
  const st = coinState(t);
  coin.visible = !!st.visible;
  if (!st.visible) {
    setShadow(coinShadow, 0, HOME, 0, 0);
    coinShadow.mesh.instanceMatrix.needsUpdate = true;
    coinShadow.shade.needsUpdate = true;
    return;
  }
  coin.position.copy(st.p);
  if (st.edge) {
    // Standing: axis tilted from vertical by edge*90°, spinning about world y, precessing as it slows.
    _qx.setFromAxisAngle(V(1, 0, 0), (Math.PI / 2) * st.edge + (st.theta || 0));
    _qy.setFromAxisAngle(V(0, 1, 0), st.spin);
    _qz.setFromAxisAngle(V(0, 0, 1), (st.prec || 0) * Math.sin(st.spin * 0.5));
    coin.quaternion.copy(_qy).multiply(_qz).multiply(_qx);
  } else {
    _qx.setFromAxisAngle(V(1, 0, 0), st.theta + st.wob);
    _qz.setFromAxisAngle(V(0, 0, 1), st.wob * 0.6);
    coin.quaternion.copy(_qz).multiply(_qx);
  }
  const lift = Math.max(0, st.p.y - REST);
  setShadow(coinShadow, 0, st.p, COIN_R * 0.82 * (1 + lift * 0.25), 1 / (1 + lift * 1.6));
  coinShadow.mesh.instanceMatrix.needsUpdate = true;
  coinShadow.shade.needsUpdate = true;
}

// ---------------------------------------------------------------- your chips (close-ups)
// Each chip of your stack is its own instance so it can drop, fly or slide; slot k sits at height k.
function chipDrop(t, t0, fromH = 1.0) {
  const k = seg(t, t0, t0 + 0.24);
  const settle = t > t0 + 0.24 ? 0.03 * Math.exp(-(t - t0 - 0.24) * 18) * Math.sin((t - t0 - 0.24) * 40) : 0;
  return (1 - E.in2(k)) * fromH + settle;
}
function chipFly(t, t0, k, side) {
  const s = Math.max(0, t - t0);
  const d = V(side * (2.4 + hash(k) * 1.6), 3.2 + hash(k + 9) * 1.4, 1.2 + hash(k + 3));
  return { off: V(d.x * s, d.y * s - 4.9 * s * s, d.z * s), rot: s * (8 + hash(k + 1) * 6), gone: s > 0.9 };
}
// The plan of your chips over the film: [time, count] steps plus the moves between them.
function yourChips(t) {
  const out = []; // { pos, quat, alpha, ghost, color }
  const slot = (base, k) => base.clone().setY(k * CHIP_T);
  const push = (pos, quat = null) => out.push({ pos, quat });
  // Hook: ten chips at home, slid into the betting circle on "Bet everything".
  if (t < B.lapse) {
    for (let k = 0; k < 10; k++) {
      const m = E.inOut(seg(t, B.bet + 0.15 + k * 0.025, B.bet + 0.85 + k * 0.025));
      push(slot(HOME.clone().lerp(BET, m), k));
    }
    return { chips: out };
  }
  if (t < B.split + 0.25) {
    const r = seg(t, B.lapse + 0.05, B.out) * M.R;
    const w = wealthAt(M.allIn, M.YOU, r);
    const fade = 1 - seg(t, B.split, B.split + 0.25);
    return { chips: [], stack: { pos: BET, w: w * fade }, lapseRound: r };
  }
  if (t < B.crowd + 0.3) {
    // Split / pair / gap: your stack at home, rebuilt from the top on the split.
    const events = [];
    // Pair: +5 (win), −6 (lose). Gap: +1 back to 10, −4 (40% drop), +3 (the coin's 50%).
    events.push({ at: B.c150 - 0.3, add: 5 });
    events.push({ at: B.c90 - 0.5, add: -6 });
    events.push({ at: B.gap - 0.1, add: 1 });
    events.push({ at: B.drop40, add: -4 });
    events.push({ at: B.gives - 0.05, add: 3 });
    const states = []; // per chip: dropAt / flyAt
    for (let k = 0; k < 10; k++) states.push({ k, drop: B.split + 0.2 + k * 0.06, fly: Infinity });
    let top = 10;
    for (const ev of events) {
      if (ev.add > 0) {
        for (let j = 0; j < ev.add; j++) states.push({ k: top + j, drop: ev.at + j * 0.07, fly: Infinity });
        top += ev.add;
      } else {
        for (let j = 0; j < -ev.add; j++) {
          const s = states.filter((x) => x.fly === Infinity && x.k === top - 1 - j)[0];
          if (s) s.fly = ev.at + j * 0.05;
        }
        top += ev.add;
      }
    }
    for (const s of states) {
      if (t < s.drop) continue;
      if (t >= s.fly) {
        const f = chipFly(t, s.fly, s.k, s.k % 2 ? 1 : -1);
        if (f.gone) continue;
        const p = slot(HOME, s.k).add(f.off);
        out.push({ pos: p, quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(f.rot, 0, f.rot * 0.6)) });
        continue;
      }
      const p = slot(HOME, s.k);
      p.y += chipDrop(t, s.drop, s.drop < B.pair ? 1.4 : 0.9);
      out.push({ pos: p });
    }
    return { chips: out };
  }
  // Kelly: twelve chips all in, then nine slide back home on "bet less", three stay in the circle.
  if (t >= B.kelly - 0.5 && t < B.rerun) {
    for (let k = 0; k < 12; k++) {
      if (k < 3) {
        push(slot(BET, k));
        continue;
      }
      const m = E.inOut(seg(t, B.betLess + (11 - k) * 0.045, B.betLess + 0.6 + (11 - k) * 0.045));
      const p = BET.clone().lerp(HOME, m).setY(lerp(k, k - 3, m) * CHIP_T);
      p.y += Math.sin(m * Math.PI) * 0.25;
      push(p);
    }
    return { chips: out };
  }
  // Coda and share: twelve at home; a quarter (3) slides into the circle on "yourself".
  if (t >= B.coda - 0.2) {
    for (let k = 0; k < 12; k++) {
      if (k < 9) {
        push(slot(HOME, k));
        continue;
      }
      const m = E.inOut(seg(t, B.yourself + (k - 9) * 0.06, B.yourself + 0.6 + (k - 9) * 0.06));
      const p = HOME.clone().lerp(BET, m).setY(lerp(k, k - 9, m) * CHIP_T);
      p.y += Math.sin(m * Math.PI) * 0.25;
      push(p);
    }
    return { chips: out };
  }
  return { chips: [] };
}

// ---------------------------------------------------------------- the crowd
// Where each player's stack is at time t: emerging from your stack, at its cell, or folding back.
const EMERGE = [
  { t0: B.thousand, fold: B.pair - 0.05, run: null },
  { t0: B.crowd + 0.25, fold: B.paths + 0.35, run: "allIn" },
  { t0: B.rerun + 0.1, fold: B.coda - 0.95, run: "kelly" },
];
function crowdPhase(t) {
  for (const e of EMERGE) if (t >= e.t0 && t < e.fold + 0.9) return e;
  return null;
}
function lapseRound(t) {
  if (t >= B.flip100 - 0.1 && t < B.rerun) return clamp(E.inOut(seg(t, B.flip100 - 0.1, B.past10k - 0.05)) * M.R, 0, M.R);
  if (t >= B.rerun) return clamp(E.inOut(seg(t, B.sameFlips - 0.2, B.c186 - 0.6)) * M.R, 0, M.R);
  return 0;
}

// ---------------------------------------------------------------- printed charts
function inkFont(ctx, weight, px, family = "Montserrat") {
  ctx.font = `${weight} ${px}px ${family === "Montserrat" ? "Montserrat" : "'League Gothic'"}`;
}
function drawBet(p, o) {
  const g = p.ctx;
  g.clearRect(0, 0, 1024, 1024);
  g.strokeStyle = INK;
  g.lineWidth = 14;
  g.beginPath();
  g.arc(512, 512, 440, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.arc(512, 512, 400, 0, Math.PI * 2);
  g.stroke();
  inkFont(g, 800, 96);
  g.fillStyle = INK;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.letterSpacing = "30px";
  g.fillText("BET", 527, 205);
  g.letterSpacing = "0px";
  p.tex.needsUpdate = true;
}
function drawYou(p) {
  const g = p.ctx;
  g.clearRect(0, 0, 1024, 1024);
  g.strokeStyle = GOLD;
  g.lineWidth = 16;
  g.beginPath();
  g.arc(512, 512, 330, 0, Math.PI * 2);
  g.stroke();
  inkFont(g, 800, 84);
  g.fillStyle = GOLD;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.letterSpacing = "26px";
  g.fillText("YOU", 525, 930);
  g.letterSpacing = "0px";
  p.tex.needsUpdate = true;
}
// Paths chart: flips 0..100 across, wealth on a log scale up the table (−z is up on screen).
const PC = { x0: 380, x1: 2380, y0: 2620, y1: 560, lo: -1.6, hi: 7 };
const px = (r) => lerp(PC.x0, PC.x1, r / M.R);
const py = (w) => lerp(PC.y0, PC.y1, (Math.log10(Math.max(w, 1e-3)) - PC.lo) / (PC.hi - PC.lo));
const FAN = Array.from({ length: 70 }, (_, k) => 1 + k * 13);
function drawPath(g, vals, prog, color, width, alpha = 1) {
  const n = Math.floor(prog * M.R);
  if (prog <= 0) return;
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath();
  for (let r = 0; r <= n; r++) {
    const y = Math.max(PC.y1 - 60, Math.min(PC.y0 + 40, py(vals(r))));
    r ? g.lineTo(px(r), y) : g.moveTo(px(r), y);
  }
  const fr = prog * M.R - n;
  if (n < M.R && fr > 0) {
    const a = vals(n);
    const b = vals(n + 1);
    g.lineTo(px(n + fr), Math.max(PC.y1 - 60, Math.min(PC.y0 + 40, py(a * Math.pow(b / a, fr)))));
  }
  g.stroke();
  g.globalAlpha = 1;
}
function drawPaths(p, s) {
  const k = [s.axes, s.fan, s.mean, s.you, s.erg, s.strike].map((v) => v.toFixed(3)).join();
  if (k === p.key) return;
  p.key = k;
  const g = p.ctx;
  g.clearRect(0, 0, 2560, 3072);
  g.globalAlpha = s.axes;
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(PC.x0, PC.y1 - 80);
  g.lineTo(PC.x0, PC.y0);
  g.lineTo(PC.x1 + 40, PC.y0);
  g.stroke();
  inkFont(g, 700, 84);
  g.textAlign = "right";
  g.textBaseline = "middle";
  for (const [w, lab] of [
    [1, "$1"],
    [100, "$100"],
    [1e4, "$10K"],
    [1e6, "$1M"],
  ]) {
    g.globalAlpha = s.axes * 0.85;
    g.fillText(lab, PC.x0 - 34, py(w));
    g.globalAlpha = s.axes * (w === 100 ? 0.7 : 0.22);
    g.setLineDash(w === 100 ? [26, 22] : [4, 18]);
    g.lineWidth = w === 100 ? 5 : 3;
    g.beginPath();
    g.moveTo(PC.x0, py(w));
    g.lineTo(PC.x1, py(w));
    g.stroke();
    g.setLineDash([]);
  }
  g.globalAlpha = s.axes * 0.85;
  g.textAlign = "center";
  g.textBaseline = "top";
  g.fillText("0", PC.x0, PC.y0 + 30);
  g.fillText("100 FLIPS", PC.x1 - 130, PC.y0 + 30);
  g.textAlign = "left";
  inkFont(g, 700, 70);
  g.fillText("START $100", PC.x0 + 24, py(100) + 26);
  for (const i of FAN) drawPath(g, (r) => M.allIn.w[r][i], s.fan, INK, 3, 0.2);
  drawPath(g, (r) => M.allIn.stats[r].mean, s.mean, INK, 13);
  drawPath(g, (r) => M.allIn.w[r][M.YOU], s.you, GOLD, 15);
  // Labels sit on the lines they name.
  g.textBaseline = "alphabetic";
  if (s.mean > 0.85) {
    g.globalAlpha = seg(s.mean, 0.85, 1);
    g.fillStyle = INK;
    g.textAlign = "right";
    inkFont(g, 800, 80);
    g.fillText("ENSEMBLE AVERAGE", PC.x1, py(M.allIn.stats[M.R].mean) - 70);
    inkFont(g, 400, 150, "League");
    g.fillText("$10,257", PC.x1, py(M.allIn.stats[M.R].mean) - 170);
  }
  if (s.you > 0.85) {
    g.globalAlpha = seg(s.you, 0.85, 1);
    g.fillStyle = GOLD;
    g.textAlign = "right";
    inkFont(g, 800, 80);
    g.fillText("TIME AVERAGE · YOU", PC.x1, py(M.allIn.w[M.R][M.YOU]) + 120);
    inkFont(g, 400, 150, "League");
    g.fillText("$0.52", PC.x1, py(M.allIn.w[M.R][M.YOU]) + 260);
  }
  if (s.erg > 0) {
    g.globalAlpha = s.erg;
    g.fillStyle = INK;
    g.textAlign = "left";
    inkFont(g, 400, 250, "League");
    g.letterSpacing = "12px";
    g.fillText("ERGODIC", PC.x0 + 70, py(3e5));
    g.letterSpacing = "0px";
    if (s.strike > 0) {
      g.globalAlpha = 1;
      g.strokeStyle = RED;
      g.lineWidth = 28;
      g.lineCap = "round";
      g.beginPath();
      const y0 = py(3e5) - 80;
      g.moveTo(PC.x0 + 50, y0 + 40);
      g.lineTo(PC.x0 + 50 + 700 * s.strike, y0 + 40 - 90 * s.strike);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  p.tex.needsUpdate = true;
}
// Kelly hill: bet size across, the typical (median) wealth after 100 flips up the table.
const KC = { x0: 400, x1: 2360, y0: 2080, y1: 520, top: 200 };
const kx = (f) => lerp(KC.x0, KC.x1, f);
const ky = (w) => lerp(KC.y0, KC.y1, w / KC.top);
function kellyWorld(f) {
  // Canvas pixel → world point on the felt (canvas y grows toward the camera, +z).
  const u = kx(f) / 2560;
  const v = ky(M.typical(f)) / 2560;
  return V(KELLY_AT.x + (u - 0.5) * KELLY_SIZE[0], 0, KELLY_AT.z + (v - 0.5) * KELLY_SIZE[1]);
}
function drawKelly(p, s) {
  const k = [s.axes, s.curve, s.p100, s.p50, s.p25, s.peak, s.name].map((v) => v.toFixed(3)).join();
  if (k === p.key) return;
  p.key = k;
  const g = p.ctx;
  g.clearRect(0, 0, 2560, 2560);
  g.globalAlpha = s.axes;
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(KC.x0, KC.y1 - 60);
  g.lineTo(KC.x0, KC.y0);
  g.lineTo(KC.x1 + 30, KC.y0);
  g.stroke();
  inkFont(g, 700, 80);
  g.textBaseline = "top";
  g.textAlign = "center";
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    g.globalAlpha = s.axes * 0.85;
    g.fillText(`${Math.round(f * 100)}%`, kx(f), KC.y0 + 30);
  }
  g.fillText("YOUR BET, EACH FLIP", (KC.x0 + KC.x1) / 2, KC.y0 + 130);
  g.textAlign = "right";
  g.textBaseline = "middle";
  for (const w of [0, 100, 200]) g.fillText(`$${w}`, KC.x0 - 30, ky(w));
  g.save();
  g.translate(KC.x0 - 200, (KC.y0 + KC.y1) / 2);
  g.rotate(-Math.PI / 2);
  g.textAlign = "center";
  g.fillText("TYPICAL RESULT, 100 FLIPS", 0, 0);
  g.restore();
  g.globalAlpha = s.axes * 0.7;
  g.setLineDash([26, 22]);
  g.beginPath();
  g.moveTo(KC.x0, ky(100));
  g.lineTo(KC.x1, ky(100));
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = s.axes * 0.85;
  g.textAlign = "right";
  g.textBaseline = "bottom";
  g.fillText("START $100", KC.x1, ky(100) - 18);
  // The hill.
  if (s.curve > 0) {
    g.globalAlpha = 1;
    g.strokeStyle = INK;
    g.lineWidth = 13;
    g.lineCap = "round";
    g.beginPath();
    const n = 200;
    for (let j = 0; j <= n * s.curve; j++) {
      const f = j / n;
      j ? g.lineTo(kx(f), ky(M.typical(f))) : g.moveTo(kx(f), ky(M.typical(f)));
    }
    g.stroke();
  }
  const dot = (f, a, color) => {
    if (a <= 0) return;
    g.globalAlpha = a;
    g.fillStyle = color;
    g.beginPath();
    g.arc(kx(f), ky(M.typical(f)), 20, 0, Math.PI * 2);
    g.fill();
  };
  const note = (f, a, big, small, color, dx, dy, align = "center") => {
    if (a <= 0) return;
    g.globalAlpha = a;
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = "alphabetic";
    inkFont(g, 400, 170, "League");
    g.fillText(big, kx(f) + dx, ky(M.typical(f)) + dy);
    inkFont(g, 800, 76);
    g.fillText(small, kx(f) + dx, ky(M.typical(f)) + dy + 92);
  };
  dot(1, s.p100, RED);
  note(1, s.p100, "$0.52", "−5% A FLIP", RED, -10, -230, "right");
  dot(0.5, s.p50, INK);
  note(0.5, s.p50, "$100", "0% A FLIP", INK, 70, -150, "left");
  if (s.peak > 0) {
    g.globalAlpha = s.peak;
    g.strokeStyle = GOLD;
    g.lineWidth = 6;
    g.setLineDash([18, 16]);
    g.beginPath();
    g.moveTo(kx(0.25), ky(M.typical(0.25)) + 40);
    g.lineTo(kx(0.25), KC.y0);
    g.stroke();
    g.setLineDash([]);
  }
  dot(0.25, s.p25, GOLD);
  note(0.25, s.p25, "$186", "+0.6% A FLIP", GOLD, 0, -175);
  if (s.name > 0) {
    g.globalAlpha = s.name;
    g.fillStyle = GOLD;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.textAlign = "right";
    inkFont(g, 400, 260, "League");
    g.fillText("KELLY", KC.x1, ky(172));
    inkFont(g, 700, 66);
    g.fillStyle = INK;
    g.fillText("p/a − q/b", KC.x1, ky(172) + 90);
    g.fillText("= 0.5/0.4 − 0.5/0.5", KC.x1, ky(172) + 170);
    g.fillText("= 25%", KC.x1, ky(172) + 250);
  }
  g.globalAlpha = 1;
  p.tex.needsUpdate = true;
}

// ---------------------------------------------------------------- camera
// Keys: time, camera position, look-at target. Each move eases in and out into its key.
const K = (t, p, q, d = 1.2, e = "inOut") => ({ t, p: V(...p), q: V(...q), d, e });
const CROWD_VIEW = { p: [0, 32, 34], q: [0, 0, -2] };
const STACK_VIEW = { p: [0.1, 5.3, 10.4], q: [0.1, 0.66, 0.75] };
function tableView(at, h, tilt = 1.6) {
  return { p: [at.x, h, at.z + tilt], q: [at.x, 0, at.z] };
}
const kv = { p: [KELLY_AT.x, 26.5, KELLY_AT.z + 2.4], q: [KELLY_AT.x, 0, KELLY_AT.z + 0.35] };
const TOP_Y = stackOf(M.allIn.w[M.R][M.rich]).n * CHIP_T;
const CLIMB0 = B.thisOne + 0.35;
const CLIMB1 = B.million + 0.45;
const pv = { p: [PATHS_AT.x, 28.5, PATHS_AT.z + 2.6], q: [PATHS_AT.x, 0, PATHS_AT.z + 0.3] };
const KEYS = [
  K(B.bet + 0.25, [0.5, 5.6, 9.4], [0.1, 0.25, -0.5], 1.1),
  K(B.lapse - 0.1, [0.35, 8.4, 6.8], [0.05, 1.9, -2.3], 1.2),
  K(B.split + 0.95, [0, 4.2, 7.4], [0, 0.75, 0], 0.95),
  K(B.thousand + 1.7, CROWD_VIEW.p, CROWD_VIEW.q, 1.75),
  K(B.pair + 1.0, STACK_VIEW.p, STACK_VIEW.q, 1.1),
  K(B.avg5 + 0.6, [0.2, 7.8, 9.4], [0.1, 0.1, -3.3], 1.2),
  K(B.crowd + 1.4, CROWD_VIEW.p, CROWD_VIEW.q, 1.3),
  K(B.middle + 0.55, [-0.45, 4.6, 5.4], [0, 0.05, -1.25], 1.35),
  K(B.thisOne - 0.15, [1.5, 13, 17], [2.5, 0, 2.5], 1.4),
  K(B.thisOne + 0.35, [RICH.x - 3.4, 2.2, RICH.z + 6.2], [RICH.x, 1.6, RICH.z], 0.45),
];
function follow(t) {
  const c = coinState(t);
  const y = c.visible ? c.p.y : REST;
  return { p: V(COIN_AT.x, y + 4.3, COIN_AT.z + 7.2), q: V(COIN_AT.x, y + 0.5, COIN_AT.z) };
}
function keyCam(t) {
  let prev = KEYS[0];
  if (t < prev.t) {
    const f = follow(t);
    const k = E.inOut(seg(t, prev.t - prev.d, prev.t));
    return { p: f.p.lerp(prev.p, k), q: f.q.lerp(prev.q, k) };
  }
  for (let i = 1; i < KEYS.length; i++) {
    const k = KEYS[i];
    const start = k.t - k.d;
    if (t < start) break;
    if (t < k.t) {
      const e = E[k.e](seg(t, start, k.t));
      return { p: prev.p.clone().lerp(k.p, e), q: prev.q.clone().lerp(k.q, e) };
    }
    prev = k;
  }
  return { p: prev.p.clone(), q: prev.q.clone() };
}
function camAt(t) {
  // 6. The climb: up the tower exponentially to its top ($7,499,730 = 59,998 units).
  if (t >= CLIMB0 && t < B.paths - 0.4) {
    const k = E.inOut(seg(t, CLIMB0, CLIMB1));
    const y = 2.2 * Math.pow((TOP_Y + 3) / 2.2, k);
    return { p: V(RICH.x - 3.4, y, RICH.z + 6.2), q: V(RICH.x, Math.max(1.6, y - 2.4 * Math.min(1, y / 4)), RICH.z) };
  }
  // 7. Down onto the printed paths chart, then the dive into the end of your line.
  if (t >= B.paths - 0.4 && t < B.kelly - 0.25) {
    const k = E.inOut(seg(t, B.paths - 0.4, B.paths + 1.0));
    const y = Math.pow(10, lerp(Math.log10(TOP_Y + 3), Math.log10(pv.p[1]), k));
    const p = V(lerp(RICH.x - 3.4, pv.p[0], k), y, lerp(RICH.z + 6.2, pv.p[2], k));
    const q = V(lerp(RICH.x, pv.q[0], k), Math.max(0, y - lerp(2.4, pv.p[1], Math.min(1, k * 1.15))), lerp(RICH.z, pv.q[2], k));
    // End of your gold line, in world space.
    const u = px(M.R) / 2560;
    const v = py(M.allIn.w[M.R][M.YOU]) / 3072;
    const end = V(PATHS_AT.x + (u - 0.5) * PATHS_SIZE[0], 0, PATHS_AT.z + (v - 0.5) * PATHS_SIZE[1]);
    const d = E.in3(seg(t, B.oneUniverse - 0.15, B.kelly - 0.25));
    return { p: p.lerp(end.clone().add(V(0, 0.4, 0.15)), d), q: q.lerp(end, d) };
  }
  // 8. Kelly: on your chips in the circle, then up over the printed hill.
  if (t >= B.kelly - 0.25 && t < B.rerun) {
    const a = { p: V(0.85, 3.0, 5.4), q: V(0.05, 0.3, -1.25) };
    const k = E.inOut(seg(t, B.betAll - 0.15, B.betAll + 1.15));
    const drift = seg(t, B.kelly - 0.25, B.betAll) * 0.35;
    const b = { p: V(...kv.p), q: V(...kv.q) };
    return { p: a.p.clone().add(V(0, -drift * 0.4, -drift)).lerp(b.p, k), q: a.q.clone().lerp(b.q, k) };
  }
  // 9. Rerun: back over the crowd, into you, out again.
  if (t >= B.rerun && t < B.coda - 0.3) {
    const keys = [
      { t: B.rerun, p: V(...kv.p), q: V(...kv.q) },
      { t: B.sameFlips + 0.4, p: V(0, 44, 30), q: V(0, 0, -2.5), d: 1.5 },
      { t: B.c186 + 0.1, p: V(0, 33, 22), q: V(0, 0, -1.2), d: 1.4 },
      { t: B.seven + 0.9, p: V(0.4, 46, 26), q: V(0, 0, -2.5), d: 1.3 },
    ];
    let prev = keys[0];
    for (let i = 1; i < keys.length; i++) {
      const s = keys[i].t - keys[i].d;
      if (t < s) break;
      if (t < keys[i].t) {
        const e = E.inOut(seg(t, s, keys[i].t));
        return { p: prev.p.clone().lerp(keys[i].p, e), q: prev.q.clone().lerp(keys[i].q, e) };
      }
      prev = keys[i];
    }
    return { p: prev.p.clone(), q: prev.q.clone() };
  }
  // 10–11. Coda: back to the opening framing for the coin, then to your stack and the circle.
  if (t >= B.coda - 0.3) {
    const from = { p: V(0.4, 46, 26), q: V(0, 0, -2.5) };
    const k = E.inOut(seg(t, B.coda - 0.3, B.coda + 0.9));
    const coinCam = follow(t);
    const end = { p: V(0.4, 5.4, 9.2), q: V(0.1, 0.45, -0.5) };
    const k2 = E.inOut(seg(t, B.yourself - 0.7, B.yourself + 0.5));
    const k3 = seg(t, B.share, B.duration);
    const p = from.p.clone().lerp(coinCam.p, k).lerp(end.p, k2).add(V(0, -k3 * 0.5, -k3 * 0.9));
    const q = from.q.clone().lerp(coinCam.q, k).lerp(end.q, k2);
    return { p, q };
  }
  return keyCam(t);
}

// ---------------------------------------------------------------- overlay (DOM labels and numbers)
const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
function project(p) {
  _v.copy(p).project(camera);
  return { x: (_v.x + 1) * 0.5 * W, y: (1 - _v.y) * 0.5 * H, behind: _v.z > 1 };
}
// Visibility window: blur-in on t0 (0.45 s, expo), blur-out at t1 (0.2 s).
function win(t, t0, t1, inDur = 0.45, outDur = 0.2) {
  const a = E.expo(seg(t, t0, t0 + inDur));
  const b = 1 - seg(t, t1, t1 + outDur);
  return Math.max(0, Math.min(a, b));
}
function setEl(id, o, x = null, y = null) {
  const el = $(id);
  if (!el) return;
  el.style.opacity = o.toFixed(3);
  el.style.filter = o > 0 && o < 1 ? `blur(${((1 - o) * 7).toFixed(2)}px)` : "none";
  el.style.visibility = o <= 0.001 ? "hidden" : "visible";
  if (x !== null) el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
}
// A label with a leader line down to a point in the world.
// A label whose line ends on a point in the world: vertical labels (class v) stand on a line of
// `len` px, side labels (class l or r) sit level with the point, the line running to it.
function leader(id, o, anchor, len = 80) {
  const s = project(anchor);
  setEl(id, s.behind ? 0 : o, s.x, s.y);
  const el = $(id);
  const line = el.querySelector(".lead");
  if (!line) return;
  if (el.classList.contains("v")) line.style.height = `${len}px`;
  else line.style.width = `${len}px`;
}
const money = (v) => {
  if (v >= 10) return "$" + Math.round(v).toLocaleString("en-US");
  return "$" + v.toFixed(2);
};
function setText(id, s) {
  const el = $(id);
  if (el && el.textContent !== s) el.textContent = s;
}

function overlay(t, ctx) {
  // 1. Hook.
  setEl("o-heads", win(t, -1, B.bet - 0.3));
  setEl("o-tails", win(t, -1, B.bet - 0.3));
  setEl("o-ev", win(t, -1, B.bet - 0.3));
  const hookN = win(t, B.lapse + 0.1, B.split + 0.15, 0.3);
  setEl("o-hook", hookN);
  if (hookN > 0) {
    const r = ctx.lapseRound || (t > B.out ? M.R : 0);
    setText("o-hook-num", money(wealthAt(M.allIn, M.YOU, r)));
    setText("o-hook-flip", `FLIP ${Math.floor(r)} / 100 · ALL IN`);
    $("o-hook-num").style.color = r > 1 ? RED_TEXT : INK;
  }
  // 2. Split.
  leader("o-you", win(t, B.aboutYou - 0.1, B.thousand + 0.1), V(0, 0.85, 0), 110);
  setEl("o-avgdef", win(t, B.together - 0.15, B.pair - 0.1));
  // 3–4. Pair and gap: the stack's value above it, START on the ring, the gap in red.
  const n = ctx.youCount;
  const val = n * PER_CHIP;
  const pairOn = win(t, B.pair + 0.6, B.avg5 - 0.2);
  if (pairOn > 0) {
    leader("o-val", pairOn, V(0, Math.max(n, 10) * CHIP_T + 0.08, 0), 46);
    setText("o-val-num", money(val));
    $("o-val-num").style.color = val < 100 ? RED_TEXT : val > 100 ? GOLD : INK;
  } else setEl("o-val", 0);
  leader("o-start", win(t, B.pair + 0.9, B.avg5 - 0.2), V(0.72, 0.8, 0), 46);
  setEl("o-rule-h", win(t, B.heads, B.gap - 0.2));
  setEl("o-rule-t", win(t, B.tails, B.gap - 0.2));
  leader("o-down", win(t, B.down, B.gap - 0.2), V(-0.52, 0.76, 0), 56);
  leader("o-67", win(t, B.need67, B.avg5 - 0.2), V(-0.52, 0.7, 0), 56);
  leader("o-50", win(t, B.gives + 0.2, B.avg5 - 0.2), V(0.52, 0.36, 0), 56);
  setEl("o-avg5", win(t, B.avg5, B.crowd + 0.2));
  setEl("o-you5", win(t, B.you5, B.crowd + 0.2));
  // 5. Crowd.
  const crowdOn = win(t, B.flip100 - 0.2, B.thisOne - 0.2);
  setEl("o-crowd", crowdOn);
  if (crowdOn > 0) {
    const r = lapseRound(t);
    const st = M.allIn.stats;
    const a = Math.floor(r);
    const mean = st[a].mean * Math.pow(st[Math.min(M.R, a + 1)].mean / st[a].mean, r - a);
    setText("o-flip", `FLIP ${Math.floor(r)} / 100`);
    setText("o-avg-num", money(mean));
    setText("o-mid-num", money(wealthAt(M.allIn, M.YOU, r)));
    $("o-mid").style.opacity = (0.35 + 0.65 * seg(t, B.middle - 0.2, B.middle + 0.3)).toFixed(3);
    $("o-mid-num").style.color = seg(t, B.middle - 0.2, B.middle + 0.3) > 0.5 ? RED_TEXT : INK;
  }
  setEl("o-poorer", win(t, B.c52 + 0.55, B.thisOne - 0.2));
  // 6. Tower.
  const tw = win(t, B.thisOne + 0.25, B.paths - 0.3, 0.3);
  setEl("o-tower", tw);
  if (tw > 0) {
    const k = E.inOut(seg(t, B.thisOne + 0.35, B.million + 0.45));
    const w = M.allIn.w[M.R][M.rich];
    setText("o-tower-num", money(Math.pow(10, lerp(Math.log10(110), Math.log10(w), k))));
  }
  setEl("o-share73", win(t, B.p73 - 0.1, B.paths - 0.3));
  $("o-bar-fill").style.transform = `scaleX(${(0.731 * E.out3(seg(t, B.p73, B.p73 + 0.9))).toFixed(4)})`;
  // 9. Rerun.
  const rr = win(t, B.sameFlips - 0.3, B.worse - 0.2);
  setEl("o-crowd2", rr);
  if (rr > 0) {
    const r = lapseRound(t);
    const st = M.kelly.stats;
    const a = Math.floor(r);
    const mean = st[a].mean * Math.pow(st[Math.min(M.R, a + 1)].mean / st[a].mean, r - a);
    setText("o-flip2", `FLIP ${Math.floor(r)} / 100 · BETTING 25%`);
    setText("o-avg2-num", money(mean));
    setText("o-mid2-num", money(wealthAt(M.kelly, M.YOU, r)));
    $("o-mid2").style.opacity = (0.4 + 0.6 * seg(t, B.c186 - 0.6, B.c186)).toFixed(3);
    $("o-avg2").style.opacity = (0.4 + 0.6 * seg(t, B.c364 - 0.9, B.c364 - 0.4)).toFixed(3);
    $("o-was").style.opacity = seg(t, B.c364 - 0.6, B.c364).toFixed(3);
  }
  setEl("o-ahead", win(t, B.seven - 0.1, B.worse - 0.2));
  setEl("o-compare", win(t, B.worse - 0.1, B.coda - 0.1));
  for (const [id, at] of [
    ["o-cmp-avg", B.worse + 0.25],
    ["o-cmp-you", B.richer - 0.25],
  ])
    $(id).style.opacity = E.expo(seg(t, at, at + 0.4)).toFixed(3);
  // 10. Coda echoes the opening rules.
  setEl("o-heads2", win(t, B.coda + 0.3, B.yourself - 0.6));
  setEl("o-tails2", win(t, B.coda + 0.3, B.yourself - 0.6));
  leader("o-bet25", win(t, B.yourself + 0.5, B.share + 0.2), BET.clone().setY(0.3), 90);
  leader("o-bet25k", win(t, B.betLess + 0.45, B.betAll - 0.1), BET.clone().setY(0.3), 90);
}

// ---------------------------------------------------------------- frame
let built = false;
function renderAt(t) {
  if (!built) return;
  t = clamp(t, 0, B.duration);
  const cam = camAt(t);
  camera.position.copy(cam.p);
  camera.lookAt(cam.q);
  camera.updateMatrixWorld();
  const dist = cam.p.distanceTo(cam.q);
  camera.near = Math.max(0.05, dist / 400);
  camera.far = Math.max(400, cam.p.y * 3 + 400);
  camera.updateProjectionMatrix();
  U.uPoolC.value.copy(cam.q);
  U.uPoolR.value = clamp(dist * (crowdPhase(t) ? 0.46 : 0.62), 2.5, 1e7);
  if (t >= CLIMB0 - 0.4 && t < B.paths) {
    U.uPoolC.value.set(RICH.x, 0, RICH.z);
    U.uPoolR.value = 14;
  }

  poseCoin(t);

  // Prints.
  betPrint.mesh.material.uniforms.uOpacity.value = Math.max(win(t, -1, B.split + 0.6, 0.1, 0.5), win(t, B.kelly - 0.6, B.rerun + 0.5, 0.3, 0.5), win(t, B.coda + 0.5, 999, 0.6));
  youPrint.mesh.material.uniforms.uOpacity.value = Math.max(win(t, B.aboutYou - 0.1, B.thousand + 1.0, 0.4, 0.6), win(t, B.middle - 0.2, B.tower + 0.6, 0.3, 0.4), win(t, B.c186 - 0.8, B.seven, 0.3, 0.5));
  const pathsOn = win(t, B.paths + 0.2, B.kelly - 0.27, 0.5, 0.01);
  pathsPrint.mesh.material.uniforms.uOpacity.value = pathsOn;
  if (pathsOn > 0)
    drawPaths(pathsPrint, {
      axes: 1,
      fan: E.inOut(seg(t, B.paths + 0.4, B.ensemble + 0.2)),
      mean: E.inOut(seg(t, B.ensemble - 0.1, B.ensemble + 1.1)),
      you: E.inOut(seg(t, B.yourPath, B.yourPath + 1.4)),
      erg: E.expo(seg(t, B.ergodic - 0.05, B.ergodic + 0.4)),
      strike: E.out3(seg(t, B.isnt - 0.05, B.isnt + 0.3)),
    });
  const kellyOn = win(t, B.betAll - 0.3, B.rerun + 0.05, 0.6, 0.35);
  kellyPrint.mesh.material.uniforms.uOpacity.value = kellyOn;
  if (kellyOn > 0)
    drawKelly(kellyPrint, {
      axes: 1,
      curve: E.inOut(seg(t, B.betAll - 0.1, B.betAll + 0.9)),
      p100: E.expo(seg(t, B.betAll + 1.1, B.betAll + 1.5)),
      p50: E.expo(seg(t, B.betHalf + 0.9, B.betHalf + 1.3)),
      p25: E.expo(seg(t, B.betQuarter + 0.9, B.betQuarter + 1.3)),
      peak: E.expo(seg(t, B.peaks - 0.05, B.peaks + 0.4)),
      name: E.expo(seg(t, B.kellyName - 0.05, B.kellyName + 0.45)),
    });

  // Your chips.
  const yc = yourChips(t);
  let li = 0;
  const youCount = yc.chips.filter((c) => !c.quat).length;
  for (const c of yc.chips) {
    if (li >= loose.count - 2) break;
    setStack(loose, li, c.pos, CHIP_R, 1, C.goldBody, C.goldIns, c.quat);
    setShadow(looseShadows, li, c.pos, CHIP_R, c.pos.y < CHIP_T * 0.6 && !c.quat ? 1 : 0);
    li++;
  }
  if (yc.stack) {
    const s = stackOf(yc.stack.w);
    setStack(loose, li, yc.stack.pos, s.r, s.n, C.goldBody, C.goldIns);
    setShadow(looseShadows, li, yc.stack.pos, s.r, s.r > 0.01 ? 1 : 0);
    li++;
  }
  // The Kelly marker: your gold chip riding the hill from 100% to 50% to 25%.
  if (t >= B.betAll + 0.9 && t < B.rerun + 1.0) {
    const f1 = E.inOut(seg(t, B.betHalf + 0.1, B.betHalf + 1.1));
    const f2 = E.inOut(seg(t, B.betQuarter + 0.1, B.betQuarter + 1.1));
    const f = lerp(lerp(1, 0.5, f1), 0.25, f2);
    const pos = kellyWorld(f);
    const drop = chipDrop(t, B.betAll + 0.9, 1.2);
    const fade = 1 - seg(t, B.rerun + 0.4, B.rerun + 1.0);
    pos.y = drop;
    setStack(loose, li, pos, CHIP_R * 0.62 * fade, 1, C.goldBody, C.goldIns);
    setShadow(looseShadows, li, pos, CHIP_R * 0.62 * fade, fade);
    li++;
  }
  for (let i = li; i < loose.count; i++) {
    hideStack(loose, i);
    setShadow(looseShadows, i, HOME, 0, 0);
  }
  commit(loose);
  looseShadows.mesh.instanceMatrix.needsUpdate = true;
  looseShadows.shade.needsUpdate = true;

  // Ghost slots: the four chips you need to get back (ivory), the one the coin can't give (red).
  let gi = 0;
  const g67 = win(t, B.need67, B.avg5 - 0.25, 0.4, 0.3);
  if (g67 > 0)
    for (let k = 6; k < 10; k++) {
      const filled = k < 9 && t >= B.gives + 0.1 + (k - 6) * 0.07;
      if (filled) continue;
      const red = k === 9 && t >= B.c50 - 0.05;
      setStack(ghosts, gi++, V(0, k * CHIP_T + 0.002, 0), CHIP_R * 1.01, 1, red ? C.ghostRed : C.ghostInk, red ? C.ghostRed : C.ghostInk, null, g67 * (red ? 0.75 : 0.5));
    }
  const gDown = win(t, B.down - 0.1, B.gap - 0.15, 0.4, 0.2);
  if (gDown > 0) setStack(ghosts, gi++, V(0, 9 * CHIP_T + 0.002, 0), CHIP_R * 1.01, 1, C.ghostRed, C.ghostRed, null, gDown * 0.75);
  for (let i = gi; i < ghosts.count; i++) hideStack(ghosts, i);
  commit(ghosts);

  startRing.position.set(0, 10 * CHIP_T, 0);
  startRing.material.uniforms.uOpacity.value = win(t, B.pair + 0.9, B.avg5 - 0.2, 0.5, 0.3) * 0.9;

  // The crowd.
  const ph = crowdPhase(t);
  if (!ph) {
    for (let i = 0; i < M.N; i++) {
      hideStack(crowd, i);
      setShadow(crowdShadows, i, HOME, 0, 0);
    }
  } else {
    const run = ph.run ? M[ph.run] : null;
    const r = run ? lapseRound(t) : 0;
    const shrink = ph.run === "allIn" ? E.in2(seg(t, ph.fold - 0.6, ph.fold)) : 0;
    for (let i = 0; i < M.N; i++) {
      const cell = cellOf[i];
      // A ripple out from your stack: each copy rises in its own cell; they sink back outer first.
      const d = cell.length() / maxCellDist;
      const e = E.out3(seg(t, ph.t0 + d * 1.1, ph.t0 + d * 1.1 + 0.45));
      const fk = E.in2(seg(t, ph.fold + (1 - d) * 0.5, ph.fold + (1 - d) * 0.5 + 0.35));
      const grow = e * (1 - fk);
      const pos = cell;
      const w = run ? wealthAt(run, i, r) : 100;
      const s = stackOf(w);
      let n = s.n * (1 - shrink) * grow;
      let rad = s.r * (0.55 + 0.45 * grow);
      if (grow <= 0.002 || n <= 0) {
        hideStack(crowd, i);
        setShadow(crowdShadows, i, HOME, 0, 0);
        continue;
      }
      // Your instance is hidden while your own chips are on stage.
      if (i === M.YOU && (!run || t >= B.coda - 0.2)) {
        hideStack(crowd, i);
        setShadow(crowdShadows, i, HOME, 0, 0);
        continue;
      }
      let body = C.ivoryBody;
      let ins = C.ivoryIns;
      if (i === M.YOU) {
        body = C.goldBody;
        ins = C.goldIns;
      } else if (run && r > 0.5) {
        if (w < 100 - 1e-6) {
          const k = clamp((100 - w) / 60);
          body = C.ivoryBody.clone().lerp(C.lostBody, k);
          ins = C.ivoryIns.clone().lerp(C.lostIns, k);
        } else if (ph.run === "kelly" && t > B.seven - 0.2) {
          body = C.aheadBody;
        }
      }
      setStack(crowd, i, pos, rad, Math.max(n, 0.02), body, ins);
      setShadow(crowdShadows, i, pos, rad, Math.min(1, grow * 2));
    }
  }
  commit(crowd);
  crowdShadows.mesh.instanceMatrix.needsUpdate = true;
  crowdShadows.shade.needsUpdate = true;

  overlay(t, { lapseRound: yc.lapseRound, youCount });
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- boot
window.__hf = window.__hf || {};
window.__hf.buildReady = window.__hf.buildReady || {};
window.__hf.buildReady["world"] = (async () => {
  await Promise.all([document.fonts.load("400 120px 'League Gothic'"), document.fonts.load("700 60px Montserrat"), document.fonts.load("800 60px Montserrat")]);
  buildCoin();
  drawBet(betPrint);
  drawYou(youPrint);
  built = true;
  renderAt(window.__hfThreeTime || 0);
})();
window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
window.__worldRenderAt = renderAt;
