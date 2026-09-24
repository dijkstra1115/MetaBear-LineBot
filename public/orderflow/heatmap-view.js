import { PRICES, TIMING, clamp, ease } from "./heatmap-model.js";

const C = {
  ink: "#e1ebe7",
  muted: "#8ea8af",
  faint: "#5e7a83",
  grid: "#30464c",
  buy: "#a0dfce",
  sell: "#e0be8d",
};
const text = (x, y, value, color = C.muted, size = 12, attrs = "") =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${attrs}>${value}</text>`;
const rect = (x, y, w, h, color, attrs = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" ${attrs}/>`;
const line = (x1, y1, x2, y2, color, attrs = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${attrs}/>`;
const group = (svg, alpha = 1, attrs = "") =>
  `<g opacity="${clamp(alpha)}" ${attrs}>${svg}</g>`;
const mid = 'text-anchor="middle"',
  number = `${mid} class="number"`;
export const priceY = (price) => 170 - (price - 102) * 36;
export const timeX = (at, now) => 706 - ((now - at) / 60000) * 626;

// One fixed size scale across the whole lesson, including historical bands.
export function heatColor(size) {
  const stops = [
    [20, 36, 46],
    [91, 139, 132],
    [239, 211, 155],
  ];
  const t = clamp(size / 80) * 2,
    i = Math.min(1, Math.floor(t)),
    f = t - i;
  return `rgb(${stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * f)).join(",")})`;
}

export function cameraAt(playhead, reduced = false) {
  const into = reduced
    ? Number(playhead >= TIMING.focused)
    : ease((playhead - TIMING.zoomIn) / (TIMING.focused - TIMING.zoomIn));
  const out = reduced
    ? Number(playhead >= TIMING.panorama)
    : ease((playhead - TIMING.zoomOut) / (TIMING.panorama - TIMING.zoomOut));
  const focus = into * (1 - out),
    scale = 1 + 0.45 * focus;
  return { focus, scale, x: 650 - 150 * focus, y: 170 + 40 * focus };
}

export function drawHeatmap({ state, playhead, reduced }) {
  const { focus, scale, x, y } = cameraAt(playhead, reduced);
  const show = (at, duration = 600) =>
    reduced ? Number(playhead >= at) : ease((playhead - at) / duration);
  const born = 0.65 + 0.35 * show(0, 700);
  const event = state.event,
    eventAge = event ? playhead - event.playedAt : Infinity;
  const accentEvent = event && event.at >= 30000;
  const flash = reduced ? 0 : accentEvent ? 1 - ease(eventAge / 950) : 0;
  let world = "";
  for (const price of PRICES) {
    const y = priceY(price),
      selected = price === 102;
    const alpha = selected ? 1 : 1 - 0.68 * focus;
    let row = line(
      80,
      y,
      706,
      y,
      C.grid,
      'stroke-dasharray="2 6" stroke-opacity=".45"',
    );
    for (const band of state.bands.filter((b) => b.price === price)) {
      const left = timeX(band.start, state.time),
        right = timeX(band.end, state.time);
      row += rect(
        left,
        y - 11,
        right - left,
        22,
        heatColor(band.size),
        `data-heat-price="${price}" data-start="${band.start}" data-end="${band.end}" data-size="${band.size}"`,
      );
    }
    const depth = state.rows.find((r) => r.price === price);
    row += text(
      753,
      y + 4,
      price,
      selected && focus ? C.ink : C.muted,
      11,
      number,
    );
    row += line(
      715,
      y,
      786,
      y,
      C.grid,
      'stroke-dasharray="2 4" stroke-opacity=".65"',
    );
    row += rect(800, y - 14, 130, 28, "#152329", 'rx="4"');
    row += rect(
      800,
      y - 14,
      130 * clamp(depth.size / 80),
      28,
      heatColor(depth.size),
      'rx="4" fill-opacity=".62"',
    );
    row += text(813, y + 3, depth.side === "sell" ? "賣" : "買", C.muted, 8);
    row += text(
      873,
      y + 5,
      depth.size,
      depth.size ? C.ink : C.faint,
      16,
      `${number} data-current-price="${price}" data-size="${depth.size}"`,
    );
    if (selected) {
      row += group(
        rect(
          Math.max(80, timeX(0, state.time)) - 4,
          y - 16,
          938 - Math.max(80, timeX(0, state.time)),
          32,
          "none",
          `rx="5" stroke="#e1d6ae" stroke-opacity="${0.4 + 0.5 * flash}"`,
        ),
        focus,
      );
    }
    world += group(row, alpha * born);
  }
  world += group(
    line(706, 80, 706, 336, "#bad5c4", 'stroke-opacity=".45"'),
    born,
  );

  // Last-traded price changes only at real fills; cancellations add no dot.
  if (state.trades.length) {
    let path = "";
    for (const [i, trade] of state.trades.entries()) {
      const px = timeX(trade.at, state.time),
        py = priceY(trade.price);
      path += i ? ` H${px} V${py}` : `M${px} ${py}`;
    }
    path += ` H706`;
    world += `<path d="${path}" fill="none" stroke="#dfebe5" stroke-opacity=".58" stroke-width="1.1"/>`;
    for (const trade of state.trades) {
      const px = timeX(trade.at, state.time),
        py = priceY(trade.price),
        age = playhead - trade.playedAt;
      const color = C[trade.side],
        radius = 3.5 + Math.sqrt(trade.size) * 0.8;
      if (!reduced && age >= 0 && age < 800)
        world += `<circle cx="${px}" cy="${py}" r="${radius + ease(age / 800) * 12}" fill="none" stroke="${color}" opacity="${1 - ease(age / 800)}"/>`;
      world += `<circle cx="${px}" cy="${py}" r="${radius}" fill="${color}" stroke="#15212a" stroke-width="1.5" data-trade-at="${trade.at}" data-trade-size="${trade.size}"/>`;
      if (trade.size === 25)
        world += group(
          text(px, py - 16, "成交 25", C.ink, 10, mid),
          show(TIMING.fill, 250),
        );
    }
  }
  for (let at = 0; at <= state.time; at += 15000) {
    const px = timeX(at, state.time);
    if (px > 675) continue;
    world += group(
      line(px, 334, px, 339, C.faint) +
        text(
          px,
          352,
          at === 0 ? "14:30" : `:${String(at / 1000).padStart(2, "0")}`,
          C.muted,
          10,
          number,
        ),
      1 - focus * 0.7,
    );
  }
  world += group(
    text(360, 375, "時間 →", C.muted, 10, mid),
    show(1200) * (1 - focus),
  );

  let svg = `<defs><clipPath id="heat-window"><rect x="56" y="60" width="892" height="320" rx="8"/></clipPath><linearGradient id="heat-scale"><stop stop-color="${heatColor(0)}"/><stop offset=".5" stop-color="${heatColor(40)}"/><stop offset="1" stop-color="${heatColor(80)}"/></linearGradient></defs>`;
  svg += text(64, 32, "LIQUIDITY HEATMAP", C.muted, 10, 'letter-spacing="2.5"');
  svg += text(
    936,
    32,
    focus > 0.5 ? "102 元 · 掛賣的變化" : "一分鐘的掛單與成交",
    C.muted,
    11,
    'text-anchor="end"',
  );
  svg += `<g clip-path="url(#heat-window)">${group(world, 1, `data-camera-scale="${scale}" transform="translate(${x} ${y}) scale(${scale}) translate(-650 -170)"`)}</g>`;
  // Headings follow their columns horizontally, but stay outside the camera crop.
  svg += group(
    text(x + 56 * scale, 56, "現在", C.ink, 10, mid) +
      text(x + 215 * scale, 56, "此刻掛單 / 隻", C.muted, 11, mid) +
      text(x + 103 * scale, 56, "元", C.faint, 9, mid),
    born,
  );

  if (accentEvent && playhead < TIMING.zoomOut) {
    const label =
      event.kind === "add"
        ? "新增掛賣 +40"
        : event.kind === "cancel"
          ? "撤回掛賣 −40"
          : "主動買入 25";
    const detail =
      event.kind === "cancel"
        ? "最新成交仍是 102 元"
        : event.kind === "trade"
          ? "圓點留下這筆成交"
          : "40 → 80 隻";
    svg += group(
      rect(
        322,
        64,
        356,
        30,
        "#18282d",
        'rx="15" stroke="#54736a" stroke-opacity=".5"',
      ) +
        text(344, 84, label, C.ink, 12) +
        text(658, 83, detail, C.muted, 10, 'text-anchor="end"'),
      show(event.playedAt, 200),
    );
  }

  svg += text(64, 403, "可見掛單量 / 隻", C.muted, 10);
  svg += rect(175, 394, 132, 10, "url(#heat-scale)", 'rx="3"');
  svg +=
    text(164, 403, "0", C.faint, 9, 'text-anchor="end"') +
    text(318, 403, "80", C.muted, 9);
  svg += group(
    `<circle cx="732" cy="399" r="4" fill="${C.buy}"/>` +
      text(743, 403, "主動買入成交", C.muted, 10) +
      `<circle cx="853" cy="399" r="4" fill="${C.sell}"/>` +
      text(864, 403, "主動賣出成交", C.muted, 10),
    show(2600),
  );
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
