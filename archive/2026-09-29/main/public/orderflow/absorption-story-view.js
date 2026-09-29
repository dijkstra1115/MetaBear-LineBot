import { TIMING, clamp, ease } from "./absorption-story-model.js";
const C = {
  ink: "#e1ebe7",
  muted: "#829ca3",
  faint: "#506970",
  grid: "#2b4148",
  buy: "#9edecb",
  sell: "#dfbc88",
  panel: "#101b20",
};
const mid = 'text-anchor="middle"',
  end = 'text-anchor="end"',
  num = 'class="number"';
const text = (x, y, s, c = C.muted, z = 11, a = "") =>
  `<text x="${x}" y="${y}" fill="${c}" font-size="${z}" ${a}>${s}</text>`;
const rect = (x, y, w, h, c, a = "") =>
  `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" fill="${c}" ${a}/>`;
const line = (x, y, x2, y2, c = C.grid, a = "") =>
  `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${c}" ${a}/>`;
const group = (s, o = 1, a = "") => `<g opacity="${clamp(o)}" ${a}>${s}</g>`;
const mix = (a, b, t) => a + (b - a) * t;
export const priceY = (p) => 236 - (p - 98) * 18;
export const worldX = (x) => 65 + x * 90;
export function cameraAt(t, reduced = false) {
  const into = reduced ? Number(t >= 7000) : ease((t - 4000) / 3000),
    out = reduced ? Number(t >= 46000) : ease((t - 42000) / 4000),
    pan = reduced
      ? t >= 32000
        ? 1
        : t >= 22000
          ? 0.5
          : 0
      : ease((t - 16000) / 17000);
  const focus = into * (1 - out),
    scale = mix(mix(1.25, 2, into), 1, out),
    center = mix(mix(350, 560, into) + 175 * pan, 470, out);
  return {
    focus,
    scale,
    center,
    out,
    x: (v) => 500 + (worldX(v) - center) * scale,
    y: (p) => mix(priceY(p), 227 - (p - 101) * 27, focus),
  };
}
export function drawAbsorption({ state, playhead, reduced = false }) {
  const t = playhead,
    cam = cameraAt(t, reduced),
    show = (at, d = 700) => (reduced ? Number(t >= at) : ease((t - at) / d));
  const heatAlpha = (cam.focus * 0.95 + cam.out * 0.4) * show(7000),
    cvdAlpha = show(7000),
    currentIndex = state.activeBarIndex,
    current = state.bars[currentIndex],
    latest = state.latestTrade;
  const phase =
    t < 7000
      ? "三次測壓 · 已完成行情"
      : t < 14000
        ? "選段回看 · 第三次測壓"
        : t < 22000
          ? "同一段行情 · 穿過 104"
          : t < 32000
            ? "106 元 · 買入被掛賣接住"
            : t < 42000
              ? "主動賣出 · 價格回落"
              : "同一份成交 · 完整結果";
  let svg =
    '<defs><clipPath id="pressure-price"><rect x="68" y="54" width="837" height="193"/></clipPath><clipPath id="pressure-data"><rect x="68" y="266" width="837" height="135"/></clipPath></defs>';
  svg +=
    text(62, 25, "PRESSURE / ABSORPTION", C.muted, 10, 'letter-spacing="2"') +
    text(939, 25, phase, C.muted, 10, end);
  svg +=
    text(62, 46, "足跡：左主動賣出｜右主動買入", C.muted, 9) +
    group(
      text(939, 46, "掛賣色帶：越亮，等待量越多", C.sell, 9, end),
      heatAlpha,
    );
  for (let p = 98; p <= 108; p++) {
    const y = cam.y(p);
    if (y < 58 || y > 243) continue;
    svg +=
      line(
        68,
        y,
        905,
        y,
        C.grid,
        'stroke-opacity=".35" stroke-dasharray="2 6"',
      ) + text(925, y + 3, p, p === 104 ? C.sell : C.faint, 9, num);
  }
  let heat = "";
  for (const s of state.heatSegments ?? []) {
    // Background candles keep their trades, but only the replay's book is drawn.
    if (s.startAt < TIMING.reset) continue;
    const x0 = cam.x(s.x0),
      x1 = cam.x(s.x1),
      y = cam.y(s.price);
    if (x1 < 68 || x0 > 905 || y < 52 || y > 250 || s.size <= 0) continue;
    heat += rect(
      x0,
      y - 8 * (1 + 0.65 * cam.focus),
      x1 - x0,
      16 * (1 + 0.65 * cam.focus),
      s.side === "sell" ? C.sell : C.buy,
      `opacity="${s.side === "sell" ? 0.06 + 0.46 * clamp(s.size / 180) : 0.1}" data-heat-size="${s.size}" data-heat-price="${s.price}"`,
    );
  }
  svg += group(heat, heatAlpha, 'clip-path="url(#pressure-price)"');
  svg += line(
    68,
    cam.y(104),
    905,
    cam.y(104),
    C.sell,
    `stroke-opacity="${t < 22000 ? 0.55 : 0.2}" stroke-dasharray="4 5"`,
  );
  if (t < 7000)
    svg += group(
      text(838, 81, "三次碰到 104", C.ink, 14, end) +
        text(838, 99, "量放大，仍未穿過", C.muted, 10, end),
      1 - cam.focus,
    );
  let candles = "",
    volumes = "",
    times = "";
  for (const b of state.bars) {
    if (!b) continue;
    const x = cam.x(b.index + 0.5),
      color = b.close >= b.open ? C.buy : C.sell,
      active = b.index === currentIndex,
      edge =
        b.index >= 3
          ? Math.min(
              clamp((x - 29 * cam.scale - 68) / 18),
              clamp((905 - x - 29 * cam.scale) / 18),
            )
          : 1,
      alpha = (b.index < 3 ? 1 - cam.focus : 1) * edge;
    if (x < 20 || x > 950) continue;
    const bodyY = Math.min(cam.y(b.open), cam.y(b.close)),
      fp = b.index >= 3,
      cw = (fp ? 5 : 12) * cam.scale;
    let body =
      line(x, cam.y(b.high), x, cam.y(b.low), color, 'stroke-opacity=".7"') +
      rect(
        x - cw / 2,
        bodyY - 1,
        cw,
        Math.max(2, Math.abs(cam.y(b.open) - cam.y(b.close))),
        color,
        'rx="1" fill-opacity=".8"',
      );
    if (fp)
      for (const row of b.footprint ?? []) {
        const y = cam.y(row.price),
          w = 23 * cam.scale,
          h = 14 * (1 + 0.65 * cam.focus);
        for (const [side, amount, imb, offset] of [
          ["sell", row.bid, row.sellImbalance, -29],
          ["buy", row.ask, row.buyImbalance, 6],
        ]) {
          const cx = x + offset * cam.scale,
            chosen = side === "buy" ? C.buy : C.sell,
            fresh =
              state.replay &&
              latest?.barIndex === b.index &&
              latest.price === row.price &&
              latest.side === side &&
              t - latest.at < 700;
          body +=
            rect(
              cx,
              y - h / 2,
              w,
              h,
              imb ? chosen : C.panel,
              `rx="2" fill-opacity="${imb ? 0.19 : 0.82}" stroke="${chosen}" stroke-opacity="${fresh ? 0.9 : imb ? 0.55 : 0.13}"`,
            ) +
            text(
              cx + w / 2,
              y + 3.2,
              amount || "·",
              imb ? chosen : amount ? C.ink : C.faint,
              10 + 2 * cam.focus,
              `${mid} ${num} data-footprint="${b.index}:${row.price}:${side}" data-volume="${amount}"`,
            );
        }
      }
    candles += group(
      body,
      alpha,
      `data-bar="${b.index}" data-open="${b.open}" data-high="${b.high}" data-low="${b.low}" data-close="${b.close}"`,
    );
    if (x > 85 && x < 886) {
      times += group(
        text(
          x,
          258,
          b.label ?? `14:${25 + b.index}`,
          active ? C.ink : C.muted,
          9,
          `${mid} ${num}`,
        ),
        alpha,
      );
      const vh = b.volume * 0.12,
        width = 26 * cam.scale;
      volumes += group(
        rect(
          x - width / 2,
          322 - vh,
          width,
          vh,
          color,
          `rx="2" fill-opacity="${b.index >= 3 ? 0.64 : 0.3}"`,
        ) +
          text(
            x,
            318 - vh,
            b.volume,
            b.index >= 3 ? C.ink : C.muted,
            11,
            `${mid} ${num} data-bar-volume="${b.index}"`,
          ),
        alpha,
      );
      if (t < 7000 && b.index >= 3)
        volumes += group(
          line(
            x - width / 2,
            326,
            x + width / 2,
            326,
            C.sell,
            'stroke-width="2"',
          ),
          1 - cam.focus,
        );
    }
  }
  svg += group(candles, 1, 'clip-path="url(#pressure-price)"') + times;
  if (state.replay && !current) {
    svg += rect(
      cam.x(currentIndex + 0.5) - 29 * cam.scale,
      cam.y(104) - 12,
      58 * cam.scale,
      cam.y(103) - cam.y(104) + 24,
      "none",
      'rx="3" stroke="#526970" stroke-dasharray="3 5"',
    );
  }
  const event = state.latestEvent;
  if (state.replay && event?.at >= 7000 && t - event.at < 1700) {
    const action =
      event.kind === "trade"
        ? event.side === "buy"
          ? "主動買入"
          : "主動賣出"
        : event.kind === "cancel"
          ? "撤回掛賣"
          : event.side === "sell"
            ? "補入掛賣"
            : "新增掛買";
    const color = event.side === "buy" ? C.buy : C.sell;
    svg += text(
      500,
      237,
      `${action} ${event.size} 隻 · ${event.price} 元`,
      color,
      10,
      mid,
    );
  }
  svg +=
    line(68, 266, 905, 266, C.grid, 'stroke-opacity=".45"') +
    text(62, 290, "量", C.muted, 10) +
    text(939, 290, "隻", C.faint, 9, end) +
    line(68, 323, 905, 323, C.grid, 'stroke-opacity=".45"') +
    group(volumes, 1, 'clip-path="url(#pressure-data)"');
  if (state.replay && t < 42000) {
    const label =
      t < 14000
        ? "104 掛賣"
        : t < 22000
          ? "最新成交"
          : t < 32000
            ? "106 掛賣"
            : "本根 Delta";
    const qty =
      t < 14000
        ? state.asks?.find((r) => r.price === 104)?.size
        : t < 22000
          ? state.price
          : t < 32000
            ? state.asks?.find((r) => r.price === 106)?.size
            : current?.delta;
    svg +=
      text(180, 68, label, C.muted, 9, end) +
      text(
        180,
        90,
        `${qty ?? 0}${t < 22000 && t >= 14000 ? " 元" : " 隻"}`,
        t >= 32000 ? C.sell : C.ink,
        16,
        `${end} ${num}`,
      );
  }
  if (t >= 22000 && t < 32000)
    svg += text(500, 58, "成交增加，最高仍在 106", C.ink, 11, mid);
  const points = state.cvdPoints ?? [],
    cy = (v) => 398 - v * 0.085;
  let cvd = "";
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    cvd += line(
      cam.x(a.x),
      cy(a.cvd),
      cam.x(b.x),
      cy(b.cvd),
      b.cvd >= a.cvd ? C.buy : C.sell,
      'stroke-width="1.8" stroke-linecap="round"',
    );
  }
  const last = points.at(-1);
  if (last)
    cvd += `<circle cx="${cam.x(last.x)}" cy="${cy(last.cvd)}" r="3" fill="${t >= 32000 ? C.sell : C.buy}"/>`;
  svg += group(
    line(
      68,
      398,
      905,
      398,
      C.grid,
      'stroke-dasharray="2 6" stroke-opacity=".35"',
    ) +
      text(62, 345, "CVD", C.muted, 10) +
      text(
        939,
        345,
        `${state.cvd >= 0 ? "+" : ""}${state.cvd}`,
        t >= 32000 ? C.sell : C.buy,
        13,
        `${end} ${num} data-cvd-value="${state.cvd}"`,
      ) +
      group(cvd, 1, 'clip-path="url(#pressure-data)"'),
    cvdAlpha,
  );
  const footer =
    t < 7000
      ? "三根測壓 K：成交 100 → 120 → 150 隻"
      : t < 13500
        ? "亮框：對角成交量 ≥ 3 倍 · 本課門檻"
        : t < 15500
          ? "撤回 50：成交量、CVD 與價格都不變"
          : t < 22000
            ? "104 變薄後，後續買單才逐價成交"
            : t < 32000
              ? "右側買入增加；106 的掛賣持續承接"
              : t < 42000
                ? "左側主動賣出增加；CVD 從高點轉下"
                : "可能的出貨路徑：高位賣出承接 → 主動賣出接手";
  svg += text(500, 419, footer, t >= 42000 ? C.sell : C.muted, 10, mid);
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
