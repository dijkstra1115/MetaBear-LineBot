// Outro — four stories fold into the MetaBear mark and the academy URL.
import {
  C,
  F,
  W,
  H,
  clamp,
  ease,
  lerp,
  prog,
  tw,
  text,
  rgba,
  glow,
  ring,
  burst,
  candle,
  line,
  bear,
  pulse,
  rrect,
  revealText,
  drawMark,
  measure,
  TAU,
} from "../core.js";

const TILES = [
  { n: "01", title: "撮合與 K 線", sub: "一筆成交，怎麼變成 K 線？" },
  { n: "02", title: "影線", sub: "衝上去的價格，怎麼又回來了？" },
  {
    n: "03",
    title: "足跡・分布・熱圖",
    sub: "同樣回到這裡，怎麼這次穿過去了？",
  },
  { n: "04", title: "CVD", sub: "買入又多了，價格怎麼還回不去？" },
];
const TW = 360;
const TH = 300;
const GAP = 34;
const X0 = W / 2 - (TW * 4 + GAP * 3) / 2;

export const cues = [
  { t: 0, kind: "impact" },
  ...TILES.map((_, i) => ({
    t: 0.3 + i * 0.22,
    kind: "pluck",
    note: 4 + i * 2,
  })),
  { t: 2.7, kind: "whoosh", dur: 0.7 },
  { t: 3.35, kind: "impact", big: true },
  { t: 4.3, kind: "shimmer" },
  { t: 5.6, kind: "type" },
];

function icon(ctx, i, cx, cy, t) {
  if (i === 0) {
    candle(ctx, cx + 40, 34, cy + 20, cy - 70, cy + 34, cy + 28, {
      color: C.sell,
      glow: 10,
    });
    for (let k = 0; k < 3; k++)
      bear(
        ctx,
        cx - 60 + k * 30,
        cy + 14 - Math.sin(t * 3 + k) * 4,
        26,
        k < 2 ? C.buy : C.sell,
      );
  } else if (i === 1) {
    candle(ctx, cx, 40, cy + 40, cy - 80, cy + 44, cy + 26, {
      glow: 12,
      wickGlow: 0.6 + 0.3 * Math.sin(t * 4),
      wickGlowColor: C.gold,
    });
  } else if (i === 2) {
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 14; c++) {
        const v =
          r === 2
            ? Math.max(0, 1 - c / 10)
            : 0.18 + 0.2 * Math.sin(c * 0.9 + r * 2);
        ctx.fillStyle = rgba(r === 2 ? C.teal : C.buy, 0.15 + v * 0.8);
        ctx.fillRect(cx - 110 + c * 16, cy - 60 + r * 24, 14, 20);
      }
    line(ctx, cx - 110, cy - 2, cx + 40, cy - 2, C.white, 2, 0.9);
    line(ctx, cx + 40, cy - 2, cx + 40, cy + 46, C.white, 2, 0.9);
    line(ctx, cx + 40, cy + 46, cx + 114, cy + 46, C.white, 2, 0.9);
  } else {
    const pts = [];
    for (let k = 0; k <= 20; k++)
      pts.push([
        cx - 110 + k * 11,
        cy + 40 - Math.min(k, 12) * 7 + Math.max(0, k - 12) * 5,
      ]);
    ctx.save();
    ctx.strokeStyle = C.teal;
    ctx.lineWidth = 3;
    ctx.shadowColor = C.teal;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
    line(ctx, cx - 110, cy + 60, cx + 110, cy + 60, C.muted, 1, 0.6, [4, 4]);
  }
}

export function draw(ctx, t) {
  const fold = tw(t, 2.6, 3.35, ease.inExpo);
  // Tiles
  TILES.forEach((tile, i) => {
    const p = ease.outBack(prog(t, 0.3 + i * 0.22, 0.9 + i * 0.22));
    if (p <= 0 || fold >= 1) return;
    const bx = X0 + i * (TW + GAP);
    const by = 330;
    const cx = bx + TW / 2;
    const cy = by + TH / 2;
    ctx.save();
    const tx = lerp(cx, W / 2, fold);
    const ty = lerp(cy, 540, fold);
    ctx.translate(tx, ty + (1 - p) * 120);
    const sc = lerp(1, 0.05, fold) * lerp(0.85, 1, clamp(p));
    ctx.scale(sc, sc);
    ctx.rotate(fold * (i - 1.5) * 0.4);
    ctx.globalAlpha = clamp(p) * (1 - fold * 0.5);
    rrect(ctx, -TW / 2, -TH / 2, TW, TH, 20);
    ctx.fillStyle = rgba(C.panel, 0.92);
    ctx.fill();
    ctx.strokeStyle = rgba(C.teal, 0.4);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    icon(ctx, i, 0, -40, t);
    text(ctx, tile.n, -TW / 2 + 26, TH / 2 - 70, {
      family: F.display,
      size: 40,
      weight: 700,
      color: C.gold,
    });
    text(ctx, tile.title, -TW / 2 + 80, TH / 2 - 72, {
      family: F.tc,
      size: 30,
      weight: 800,
      color: C.text,
    });
    text(ctx, tile.sub, -TW / 2 + 26, TH / 2 - 30, {
      family: F.tc,
      size: 18,
      weight: 500,
      color: C.muted,
    });
    ctx.restore();
  });
  const head = tw(t, 0.4, 1.0) * (1 - tw(t, 2.4, 2.8));
  revealText(
    ctx,
    "四個故事，從一筆成交開始",
    W / 2,
    250,
    {
      family: F.tc,
      size: 44,
      weight: 800,
      color: C.text,
      align: "center",
      stagger: 0.03,
      rise: 20,
      blur: 8,
      alpha: head,
    },
    t - 0.4,
  );

  // Collapse point → mark
  glow(ctx, W / 2, 540, 260, C.teal, pulse(t, 3.35, 3) * 1.2);
  ring(ctx, W / 2, 440, t, 3.35, { r1: 1100, dur: 1.5, w: 5, color: C.teal });
  ring(ctx, W / 2, 440, t, 3.5, { r1: 800, dur: 1.4, w: 2, color: C.gold });
  burst(ctx, W / 2, 440, t, 3.35, {
    n: 60,
    speed: 1100,
    life: 1.2,
    seed: 77,
    color: C.teal,
    flare: 200,
  });

  const my = lerp(540, 330, tw(t, 3.35, 4.2, ease.outCubic));
  if (t > 3.3) {
    // orbiting ticks
    ctx.save();
    ctx.translate(W / 2, my);
    ctx.rotate(t * 0.15);
    const ra = tw(t, 3.5, 4.4) * 0.8;
    for (let k = 0; k < 120; k++) {
      const ang = (k / 120) * TAU;
      const long = k % 10 === 0;
      ctx.strokeStyle = rgba(long ? C.gold : C.teal, (long ? 0.6 : 0.25) * ra);
      ctx.lineWidth = long ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(
        Math.cos(ang) * (200 - (long ? 18 : 8)),
        Math.sin(ang) * (200 - (long ? 18 : 8)),
      );
      ctx.lineTo(Math.cos(ang) * 200, Math.sin(ang) * 200);
      ctx.stroke();
    }
    ctx.restore();
  }
  drawMark(ctx, W / 2, my, 220, tw(t, 3.35, 4.7, ease.lin));

  revealText(
    ctx,
    "MetaBear 交易學院",
    W / 2,
    640,
    {
      family: F.tc,
      size: 84,
      weight: 900,
      color: C.text,
      align: "center",
      stagger: 0.045,
      rise: 40,
      blur: 12,
    },
    t - 4.3,
  );
  revealText(
    ctx,
    "讀懂市場，再進場。",
    W / 2,
    718,
    {
      family: F.tc,
      size: 40,
      weight: 500,
      color: C.gold,
      align: "center",
      stagger: 0.04,
      rise: 20,
    },
    t - 4.9,
  );

  // URL typing
  const url = "metabear.io/orderflow";
  const typed = Math.floor(clamp((t - 5.6) / 0.9) * url.length);
  const ua = tw(t, 5.5, 5.8);
  if (ua > 0) {
    const w = measure(ctx, url, { family: F.mono, size: 34, weight: 600 }) + 70;
    ctx.save();
    ctx.globalAlpha = ua;
    rrect(ctx, W / 2 - w / 2, 772, w, 70, 35);
    ctx.fillStyle = rgba(C.teal, 0.12);
    ctx.fill();
    ctx.strokeStyle = rgba(C.teal, 0.7);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    const shown = url.slice(0, typed);
    const x0 = W / 2 - (w - 70) / 2;
    text(ctx, shown, x0, 808, {
      family: F.mono,
      size: 34,
      weight: 600,
      color: C.teal,
      base: "middle",
      alpha: ua,
    });
    const cur =
      x0 + measure(ctx, shown, { family: F.mono, size: 34, weight: 600 }) + 4;
    if (Math.floor(t * 2.5) % 2 === 0 || t < 6.6)
      line(ctx, cur, 790, cur, 826, C.teal, 3, ua);
  }
  text(ctx, "四個互動故事 · 手機也能看", W / 2, 890, {
    family: F.tc,
    size: 26,
    weight: 500,
    color: C.muted,
    align: "center",
    alpha: tw(t, 6.6, 7.1),
  });
  text(
    ctx,
    "影片中的行情皆為教學用合成資料，不構成任何投資建議。",
    W / 2,
    1010,
    {
      family: F.tc,
      size: 18,
      weight: 400,
      color: C.dim,
      align: "center",
      alpha: tw(t, 6.8, 7.4),
    },
  );
}
