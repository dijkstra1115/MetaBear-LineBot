// Finishing pass over the 2D frame, on the CPU: a five-level bloom pyramid, radial zoom blur, lens
// chromatic aberration, slice glitch, flash, filmic shoulder, grade, vignette and film grain.
// It runs inside every render worker, so it scales across cores, and integer-for-integer it gives
// the same frame on any machine (no GPU or driver in the loop). Every input is a look parameter the
// scenes set per frame.

import { hash } from "./lib.js";

export const DEFAULT_LOOK = {
  bloom: 0.9,
  threshold: 0.55,
  knee: 0.35,
  exposure: 1,
  sat: 1.06,
  contrast: 1.04,
  vignette: 0.55,
  grain: 0.035,
  ca: 0.0016,
  flash: 0,
  flashColor: [1, 1, 1],
  zoomBlur: 0,
  zoomCenter: [0.5, 0.5],
  glitch: 0,
  lift: 1,
  letterbox: 0,
  tint: [1, 1, 1],
};

export function createPost(canvas, W, H) {
  const out = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  const image = out.createImageData(W, H);
  const dst = image.data;

  // Bloom pyramid from quarter resolution down.
  const QW = W >> 2;
  const QH = H >> 2;
  const levels = [];
  for (let i = 0, w = QW, h = QH; i < 5; i++, w = Math.max(1, (w + 1) >> 1), h = Math.max(1, (h + 1) >> 1)) {
    levels.push({ w, h, a: new Float32Array(w * h * 3), u: new Float32Array(w * h * 3), t: new Float32Array(w * h * 3) });
  }

  // Static fields: vignette falloff and a grain tile.
  const vig = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const vx = (x / W - 0.5) * (W / H);
      const vy = y / H - 0.5;
      const d = Math.sqrt(vx * vx + vy * vy);
      const k = Math.min(1, Math.max(0, (d - 1.25) / (0.25 - 1.25)));
      vig[y * W + x] = k * k * (3 - 2 * k);
    }
  }
  // Lens aberration direction × falloff per pixel, in pixels per unit of `ca`.
  const caX = new Float32Array(W * H);
  const caY = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x / W - 0.5;
      const dy = y / H - 0.5;
      const k = 0.35 + (dx * dx + dy * dy) * 2.2;
      caX[y * W + x] = dx * k * W;
      caY[y * W + x] = dy * k * H;
    }
  }
  const GT = 512;
  const grainTile = new Float32Array(GT * GT);
  for (let i = 0; i < grainTile.length; i++) grainTile[i] = hash(i * 7 + 3) - 0.5;

  // 3×3 tent blur of a level's `src` into `dst` (separable, clamped edges).
  function tent(L, srcA, dstA) {
    const { w, h, t } = L;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const xl = x > 0 ? x - 1 : 0;
        const xr = x < w - 1 ? x + 1 : x;
        const o = (y * w + x) * 3;
        const ol = (y * w + xl) * 3;
        const or = (y * w + xr) * 3;
        t[o] = (srcA[ol] + 2 * srcA[o] + srcA[or]) * 0.25;
        t[o + 1] = (srcA[ol + 1] + 2 * srcA[o + 1] + srcA[or + 1]) * 0.25;
        t[o + 2] = (srcA[ol + 2] + 2 * srcA[o + 2] + srcA[or + 2]) * 0.25;
      }
    }
    for (let y = 0; y < h; y++) {
      const yu = y > 0 ? y - 1 : 0;
      const yd = y < h - 1 ? y + 1 : y;
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 3;
        const ou = (yu * w + x) * 3;
        const od = (yd * w + x) * 3;
        dstA[o] = (t[ou] + 2 * t[o] + t[od]) * 0.25;
        dstA[o + 1] = (t[ou + 1] + 2 * t[o + 1] + t[od + 1]) * 0.25;
        dstA[o + 2] = (t[ou + 2] + 2 * t[o + 2] + t[od + 2]) * 0.25;
      }
    }
  }

  function bloomPass(src, threshold, knee) {
    const A = levels[0].a;
    const inv = 1 / (16 * 255);
    const k2 = 2 * knee;
    const k4 = 4 * knee + 1e-4;
    for (let qy = 0; qy < QH; qy++) {
      for (let qx = 0; qx < QW; qx++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let yy = 0; yy < 4; yy++) {
          let p = ((qy * 4 + yy) * W + qx * 4) * 4;
          for (let xx = 0; xx < 4; xx++, p += 4) {
            r += src[p];
            g += src[p + 1];
            b += src[p + 2];
          }
        }
        r *= inv;
        g *= inv;
        b *= inv;
        const br = r > g ? (r > b ? r : b) : g > b ? g : b;
        let soft = br - threshold + knee;
        soft = soft < 0 ? 0 : soft > k2 ? k2 : soft;
        soft = (soft * soft) / k4;
        const hard = br - threshold;
        const wgt = (soft > hard ? soft : hard) / (br > 1e-4 ? br : 1e-4);
        const o = (qy * QW + qx) * 3;
        A[o] = r * wgt;
        A[o + 1] = g * wgt;
        A[o + 2] = b * wgt;
      }
    }
    // Downsample chain (2×2 box).
    for (let i = 1; i < levels.length; i++) {
      const P = levels[i - 1];
      const L = levels[i];
      for (let y = 0; y < L.h; y++) {
        const y0 = Math.min(P.h - 1, y * 2);
        const y1 = Math.min(P.h - 1, y * 2 + 1);
        for (let x = 0; x < L.w; x++) {
          const x0 = Math.min(P.w - 1, x * 2);
          const x1 = Math.min(P.w - 1, x * 2 + 1);
          const o = (y * L.w + x) * 3;
          for (let c = 0; c < 3; c++) {
            L.a[o + c] = (P.a[(y0 * P.w + x0) * 3 + c] + P.a[(y0 * P.w + x1) * 3 + c] + P.a[(y1 * P.w + x0) * 3 + c] + P.a[(y1 * P.w + x1) * 3 + c]) * 0.25;
          }
        }
      }
    }
    // Upsample chain: u[i] = tent(a[i] + bilinear(u[i+1])).
    const last = levels[levels.length - 1];
    tent(last, last.a, last.u);
    for (let i = levels.length - 2; i >= 0; i--) {
      const L = levels[i];
      const C = levels[i + 1];
      const sx = C.w / L.w;
      const sy = C.h / L.h;
      for (let y = 0; y < L.h; y++) {
        let fy = (y + 0.5) * sy - 0.5;
        if (fy < 0) fy = 0;
        const cy0 = Math.min(C.h - 1, fy | 0);
        const cy1 = Math.min(C.h - 1, cy0 + 1);
        const ty = fy - cy0;
        for (let x = 0; x < L.w; x++) {
          let fx = (x + 0.5) * sx - 0.5;
          if (fx < 0) fx = 0;
          const cx0 = Math.min(C.w - 1, fx | 0);
          const cx1 = Math.min(C.w - 1, cx0 + 1);
          const tx = fx - cx0;
          const o = (y * L.w + x) * 3;
          for (let c = 0; c < 3; c++) {
            const a = C.u[(cy0 * C.w + cx0) * 3 + c];
            const b = C.u[(cy0 * C.w + cx1) * 3 + c];
            const d = C.u[(cy1 * C.w + cx0) * 3 + c];
            const e = C.u[(cy1 * C.w + cx1) * 3 + c];
            L.t[o + c] = L.a[o + c] + (a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty;
          }
        }
      }
      // tent() uses L.t as scratch, so stage the sum through u.
      L.u.set(L.t);
      tent(L, L.u, L.u);
    }
    return levels[0].u;
  }

  return function render(source, look, time, frame) {
    const L = { ...DEFAULT_LOOK, ...look };
    const src = source.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const bloom = L.bloom > 0.001 ? bloomPass(src, L.threshold, L.knee) : null;
    const bAmt = L.bloom * 0.45;

    const ca = L.ca;
    const zb = L.zoomBlur > 0.004 ? L.zoomBlur : 0; // below ~1 px of smear the 12 taps are wasted
    const zcx = L.zoomCenter[0] * W;
    const zcy = (1 - L.zoomCenter[1]) * H; // look uses GL-style uv (y up)
    const fl = L.flash;
    const fr = L.flashColor[0] * fl;
    const fg = L.flashColor[1] * fl;
    const fb = L.flashColor[2] * fl;
    const exp = L.exposure / 255;
    const lr = 0.012 * L.lift;
    const lg = 0.016 * L.lift;
    const lb = 0.024 * L.lift;
    const tr = 1 + (L.tint[0] - 1) * 0.5;
    const tg = 1 + (L.tint[1] - 1) * 0.5;
    const tb = 1 + (L.tint[2] - 1) * 0.5;
    const sat = L.sat;
    const con = L.contrast;
    const vigAmt = L.vignette;
    // Grain at half the nominal amount: enough to dither gradients, little enough that x264
    // does not spend the whole bitrate on per-frame noise.
    const grain = L.grain * 0.5;
    const lbRows = Math.round(L.letterbox * 0.1281 * H);
    const gox = Math.floor(hash(frame * 3 + 1) * GT);
    const goy = Math.floor(hash(frame * 3 + 2) * GT);
    const gStep = Math.floor(time * 24);
    const Wm = W - 1;
    const Hm = H - 1;

    for (let y = 0; y < H; y++) {
      let row = y * W * 4;
      if (y < lbRows || y >= H - lbRows) {
        for (let x = 0; x < W; x++, row += 4) {
          dst[row] = 0;
          dst[row + 1] = 0;
          dst[row + 2] = 0;
          dst[row + 3] = 255;
        }
        continue;
      }
      // Slice glitch: whole bands jump sideways on a stepped clock.
      let shift = 0;
      if (L.glitch > 0) {
        const band = Math.floor((1 - y / H) * 34 + gStep * 7);
        if (hash(band * 131 + gStep * 7919 + (frame % 997)) > 1 - L.glitch * 0.55) shift = Math.round((hash(band * 37 + 11) - 0.5) * 0.12 * L.glitch * W);
      }
      // Bloom row interpolation.
      let by0 = 0;
      let by1 = 0;
      let bty = 0;
      if (bloom) {
        let fy = (y + 0.5) / 4 - 0.5;
        if (fy < 0) fy = 0;
        by0 = Math.min(QH - 1, fy | 0);
        by1 = Math.min(QH - 1, by0 + 1);
        bty = fy - by0;
      }
      for (let x = 0; x < W; x++, row += 4) {
        let sx = x + shift;
        if (sx < 0) sx = 0;
        else if (sx > Wm) sx = Wm;
        let r = 0;
        let g = 0;
        let b = 0;
        const ci = y * W + sx;
        const ox = caX[ci] * ca;
        const oy = caY[ci] * ca;
        if (zb > 0) {
          // Radial zoom blur: ten nearest taps toward the centre. Aberration is skipped here;
          // the smear hides it.
          let ws = 0;
          const vx = sx - zcx;
          const vy = y - zcy;
          for (let i = 0; i < 10; i++) {
            const k = i / 9;
            const w = 1 - k * 0.6;
            const s = zb * k * 0.16;
            let px = (sx - vx * s + 0.5) | 0;
            let py = (y - vy * s + 0.5) | 0;
            px = px < 0 ? 0 : px > Wm ? Wm : px;
            py = py < 0 ? 0 : py > Hm ? Hm : py;
            const p = (py * W + px) * 4;
            r += src[p] * w;
            g += src[p + 1] * w;
            b += src[p + 2] * w;
            ws += w;
          }
          r /= ws;
          g /= ws;
          b /= ws;
        } else {
          // Bilinear red and blue at the aberrated positions, green straight.
          let fx = sx - ox;
          let fy = y - oy;
          fx = fx < 0 ? 0 : fx > Wm ? Wm : fx;
          fy = fy < 0 ? 0 : fy > Hm ? Hm : fy;
          let x0 = fx | 0;
          let y0 = fy | 0;
          let x1 = x0 < Wm ? x0 + 1 : x0;
          let y1 = y0 < Hm ? y0 + 1 : y0;
          let tx = fx - x0;
          let ty = fy - y0;
          let a = src[(y0 * W + x0) * 4];
          let c = src[(y0 * W + x1) * 4];
          let d = src[(y1 * W + x0) * 4];
          let e = src[(y1 * W + x1) * 4];
          r = (a + (c - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty;
          g = src[(y * W + sx) * 4 + 1];
          fx = sx + ox;
          fy = y + oy;
          fx = fx < 0 ? 0 : fx > Wm ? Wm : fx;
          fy = fy < 0 ? 0 : fy > Hm ? Hm : fy;
          x0 = fx | 0;
          y0 = fy | 0;
          x1 = x0 < Wm ? x0 + 1 : x0;
          y1 = y0 < Hm ? y0 + 1 : y0;
          tx = fx - x0;
          ty = fy - y0;
          a = src[(y0 * W + x0) * 4 + 2];
          c = src[(y0 * W + x1) * 4 + 2];
          d = src[(y1 * W + x0) * 4 + 2];
          e = src[(y1 * W + x1) * 4 + 2];
          b = (a + (c - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty;
        }
        r *= exp;
        g *= exp;
        b *= exp;
        if (bloom) {
          let fx = (sx + 0.5) / 4 - 0.5;
          if (fx < 0) fx = 0;
          const bx0 = fx < QW - 1 ? fx | 0 : QW - 1;
          const bx1 = bx0 < QW - 1 ? bx0 + 1 : bx0;
          const tx = fx - bx0;
          const i00 = (by0 * QW + bx0) * 3;
          const i01 = (by0 * QW + bx1) * 3;
          const i10 = (by1 * QW + bx0) * 3;
          const i11 = (by1 * QW + bx1) * 3;
          const w00 = (1 - tx) * (1 - bty);
          const w01 = tx * (1 - bty);
          const w10 = (1 - tx) * bty;
          const w11 = tx * bty;
          r += (bloom[i00] * w00 + bloom[i01] * w01 + bloom[i10] * w10 + bloom[i11] * w11) * bAmt;
          g += (bloom[i00 + 1] * w00 + bloom[i01 + 1] * w01 + bloom[i10 + 1] * w10 + bloom[i11 + 1] * w11) * bAmt;
          b += (bloom[i00 + 2] * w00 + bloom[i01 + 2] * w01 + bloom[i10 + 2] * w10 + bloom[i11 + 2] * w11) * bAmt;
        }
        r += fr + lr;
        g += fg + lg;
        b += fb + lb;
        // Filmic shoulder so additive hot spots roll off instead of clipping.
        if (r > 1) r = r / (1 + (r - 1) * 0.6);
        if (g > 1) g = g / (1 + (g - 1) * 0.6);
        if (b > 1) b = b / (1 + (b - 1) * 0.6);
        r *= tr;
        g *= tg;
        b *= tb;
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = ((l + (r - l) * sat) - 0.5) * con + 0.5;
        g = ((l + (g - l) * sat) - 0.5) * con + 0.5;
        b = ((l + (b - l) * sat) - 0.5) * con + 0.5;
        const v = 1 + (vig[y * W + x] - 1) * vigAmt;
        const n = grainTile[((y + goy) & (GT - 1)) * GT + ((x + gox) & (GT - 1))] * grain * (1 - 0.4 * l);
        dst[row] = (r * v + n) * 255;
        dst[row + 1] = (g * v + n) * 255;
        dst[row + 2] = (b * v + n) * 255;
        dst[row + 3] = 255;
      }
    }
    out.putImageData(image, 0, 0);
  };
}
