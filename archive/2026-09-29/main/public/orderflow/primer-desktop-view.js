import { candleAt } from "./primer-model.js";
import {
  executionAge,
  fillFeedback,
  matchingMotion,
  rowExit,
  ROW_EXIT_MS,
} from "./primer-desktop-motion.js";
import {
  visibleOrder,
  pairingAt,
  transfersAt,
  rowsAt,
} from "./primer-animation.js";
import { bear } from "./primer-matching-view.js";
import { clamp, ease, mix } from "./revisit-model.js";

const C = {
  ink: "#e1ebe7",
  muted: "#80999e",
  grid: "#344c51",
  buy: "#8bd7c4",
  sell: "#d8b689",
  down: "#d99c88",
};
const center = 'text-anchor="middle"';
const number = 'class="number"';
const text = (x, y, s, color = C.muted, size = 12, attrs = "") =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${attrs}>${s}</text>`;
const line = (x, y, x2, y2, color = C.grid, attrs = "") =>
  `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${color}" ${attrs}/>`;
const rect = (x, y, w, h, color, attrs = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" ${attrs}/>`;
const group = (content, opacity = 1, attrs = "") =>
  `<g opacity="${clamp(opacity)}" ${attrs}>${content}</g>`;
const smooth = (value, reduced) =>
  reduced ? Number(value >= 1) : ease(clamp(value));

// Orders, executions and candles use ONE price coordinate system.
// Never interpolate a price between actual fills, including when the book has gaps.
export const priceY = (price) => 310 - (price - 98) * 20;
const rowX = (side) => (side === "buy" ? 142 : 640);
const rowWidth = 218;
const unitX = (side, i) => rowX(side) + 98 + i * 17;
const opacityIn = (p, time, span = 800) =>
  smooth((p.time - time) / span, p.reduced);

function grid(p) {
  let svg = "";
  const reveal =
    p.scene === 0 ? 0 : p.scene === 1 ? smooth(p.elapsed / 900, p.reduced) : 1;
  for (let price = 98; price <= 110; price++) {
    const alpha = price === 100 ? 0.5 : 0.35 * reveal;
    svg += group(
      line(
        110,
        priceY(price),
        897,
        priceY(price),
        C.grid,
        'stroke-dasharray="2 6"',
      ) + text(909, priceY(price) + 3, price, C.muted, 9, number),
      alpha,
    );
  }
  return svg;
}

function restingRow(row, side, state, p, pair, arriving = null) {
  const x = rowX(side),
    y = priceY(row.price),
    color = C[side];
  const selected = pair?.side === side && pair.maker.price === row.price;
  const lastFill = state.trades.findLast(
    (t) => t.price === row.price && t.side !== side && t.at > 0,
  );
  const age = lastFill ? executionAge(p, lastFill.at) : Infinity;
  const consumed = !row.size;
  if (consumed && (age >= ROW_EXIT_MS || p.reduced)) return "";
  const exit = consumed ? rowExit(age) : 0;
  const confirmation = !p.reduced && age < 720 ? 1 - ease(clamp(age / 720)) : 0;
  const focus = selected ? matchingMotion(pair, 0, p.reduced).focus : 0;
  const fade = arriving
    ? smooth(arriving.progress, p.reduced)
    : consumed
      ? 1 - exit
      : 1;
  const shift = arriving ? (side === "buy" ? -18 : 18) * (1 - fade) : 0;
  let s = rect(
    x,
    y - 9,
    rowWidth,
    18,
    color,
    `rx="5" fill-opacity="${0.055 + 0.115 * focus + 0.2 * confirmation}" stroke="${color}" stroke-opacity="${Math.min(1, 0.2 + 0.52 * focus + 0.65 * confirmation)}"`,
  );
  s += rect(
    x,
    y - 9,
    2,
    18,
    color,
    `rx="1" opacity="${0.6 + 0.4 * Math.max(focus, confirmation)}"`,
  );
  s += text(x + 14, y + 4, row.price, color, 14, number);
  s += text(x + 48, y + 3, "元", C.muted, 8);
  for (let j = 0; j < Math.min(row.size, 5); j++) {
    const moving = selected && j < pair.count;
    const alpha = moving ? 1 - matchingMotion(pair, j, p.reduced).departure : 1;
    s += bear(
      unitX(side, j),
      y,
      5.1,
      color,
      `data-unit="${arriving ? "travelling" : "resting"}" opacity="${alpha}"`,
    );
  }
  s += text(
    x + 204,
    y + 3,
    consumed ? `${lastFill.size} 隻成交` : `${row.size} 隻`,
    color,
    10,
    'text-anchor="end"',
  );
  return group(
    s,
    fade,
    `data-book-side="${side}" data-price="${row.price}" data-book-size="${row.size}"${consumed ? ` data-consumed-at="${lastFill.at}"` : ""} transform="translate(${shift} 0) translate(${side === "buy" ? x + rowWidth : x} 0) scale(${1 - exit * 0.035} 1) translate(${side === "buy" ? -x - rowWidth : -x} 0)"`,
  );
}

function orderBook(state, p, pair, feedback) {
  let svg = "";
  for (const side of ["buy", "sell"]) {
    const reveal = opacityIn(p, side === "buy" ? 600 : 3600);
    const attention = pair ? matchingMotion(pair, 0, p.reduced).focus : 0;
    const focus = pair && pair.side !== side ? 1 - 0.35 * attention : 1;
    let sideSvg = text(
      rowX(side),
      41,
      side === "buy" ? "等待買入" : "等待賣出",
      C[side],
      14,
    );
    sideSvg += text(
      rowX(side) + rowWidth,
      41,
      side === "buy" ? "BUY LIMIT" : "SELL LIMIT",
      C.muted,
      8,
      'text-anchor="end" letter-spacing="1.3"',
    );
    sideSvg += line(
      rowX(side),
      54,
      rowX(side) + rowWidth,
      54,
      C[side],
      'opacity=".18"',
    );
    const rows = rowsAt(state, side, p.scene);
    // Keep an exhausted level just long enough to confirm the execution. This
    // also covers later orders (e.g. the final 99 bid/ask), not only the first buy.
    if (
      feedback &&
      feedback.trade.side !== side &&
      !rows.some((row) => row.price === feedback.trade.price)
    )
      rows.push({ price: feedback.trade.price, size: 0 });
    for (const row of rows) sideSvg += restingRow(row, side, state, p, pair);
    for (const incoming of transfersAt(p.time).filter(
      (op) => op.kind === "add" && op.side === side,
    ))
      sideSvg += restingRow(incoming, side, state, p, pair, incoming);
    svg += group(sideSvg, reveal * focus);
  }
  return svg;
}

function matching(pair, p) {
  if (!pair) return "";
  const { side, maker, count } = pair;
  const color = C[side],
    y = priceY(maker.price),
    x = side === "buy" ? 360 : 640;
  const { travel: k, focus } = matchingMotion(pair, 0, p.reduced);
  let s = line(
    x,
    y,
    500,
    y,
    color,
    `stroke-width="1" opacity="${0.18 * focus}"`,
  );
  if (!p.reduced)
    s += line(
      x,
      y,
      mix(x, 500, k),
      y,
      color,
      `stroke-width="1.5" opacity="${0.75 * focus}"`,
    );
  for (let i = 0; i < count; i++) {
    const { travel, departure } = matchingMotion(pair, i, p.reduced);
    s += bear(
      mix(unitX(side, i), 500, travel),
      y,
      mix(5.1, 3.5, travel),
      color,
      `data-unit="matching-${side}" opacity="${departure}"`,
    );
  }
  // The price target is only an outline until the trade actually executes.
  s += `<circle cx="500" cy="${y}" r="${9 - k * 3}" fill="none" stroke="${color}" stroke-opacity="${focus * (0.2 + k * 0.3)}"/>`;
  return `<g data-pair-order="${pair.order.at}" data-pair-price="${maker.price}" data-pair-progress="${pair.progress}">${s}</g>`;
}

function activeOrder(state, p) {
  const order = visibleOrder(state, p);
  if (!order) return "";
  const color = C[order.side],
    units = order.fills.flatMap((f) => Array(f.size).fill(f));
  const arrival = transfersAt(p.time).find(
    (op) => op.kind === "submit" && op.at === order.at,
  );
  const alpha = arrival
    ? smooth(arrival.progress, p.reduced)
    : p.time >= order.at
      ? 1
      : 0;
  let s = rect(
    255,
    357,
    490,
    39,
    "#16252a",
    `rx="8" stroke="${color}" stroke-opacity=".24"`,
  );
  s += text(
    273,
    381,
    `${order.side === "buy" ? "買入" : "賣出"} ${order.size} 隻`,
    color,
    12,
  );
  if (order.limit) s += text(342, 381, `限價 ${order.limit}`, C.muted, 10);
  const start = order.size > 5 ? 415 : 440;
  for (let i = 0; i < order.size; i++) {
    const x = start + i * 23;
    const fill = units[i];
    const age = fill ? executionAge(p, fill.at) : Infinity;
    const confirmed = !p.reduced && age < 720 ? 1 - ease(clamp(age / 720)) : 0;
    s += rect(
      x - 8,
      368,
      16,
      16,
      fill ? color : "#1c3036",
      `rx="4" fill-opacity="${fill ? 0.22 + confirmed * 0.35 : 1}" stroke="${color}" stroke-opacity="${fill ? 0.7 + confirmed * 0.3 : 0.18}"`,
    );
    s += bear(
      x,
      376,
      4.9,
      fill ? C.ink : color,
      `data-unit="${arrival ? "travelling" : fill ? "matched" : "pending"}"`,
    );
  }
  s += text(
    727,
    381,
    `成交 ${order.filled} / ${order.size}`,
    C.ink,
    10,
    `${number} text-anchor="end"`,
  );
  s += line(273, 391, 727, 391, color, 'stroke-width="1.5" opacity=".1"');
  if (order.filled)
    s += line(
      273,
      391,
      273 + 454 * (order.filled / order.size),
      391,
      color,
      'stroke-width="1.5" stroke-linecap="round" opacity=".65"',
    );
  return group(
    s,
    alpha,
    `data-matching-order="${order.at}" data-matching-side="${order.side}"`,
  );
}

function candle(c, x, width = 28, alpha = 1) {
  if (!c) return "";
  const color = c.close > c.open ? C.buy : c.close < c.open ? C.down : C.muted;
  return (
    `<g data-candle="true" data-start="${c.start}" data-close="${c.close}" data-high="${c.high}" data-low="${c.low}" opacity="${alpha}">` +
    line(x, priceY(c.high), x, priceY(c.low), color, 'stroke-width="2"') +
    rect(
      x - width / 2,
      Math.min(priceY(c.open), priceY(c.close)),
      width,
      Math.max(2, Math.abs(priceY(c.close) - priceY(c.open))),
      color,
      'rx="2"',
    ) +
    "</g>"
  );
}

function priceMarker(c, x, label, impact = 0) {
  const color = c.close >= c.open ? C.buy : C.down,
    y = priceY(c.close);
  return (
    line(x + 17, y, x + 43, y, color, 'stroke-dasharray="2 3" opacity=".6"') +
    rect(
      x + 43,
      y - 11,
      80,
      22,
      c.close >= c.open ? "#203732" : "#332923",
      `rx="5" stroke="${color}" stroke-opacity="${0.45 + impact * 0.5}"`,
    ) +
    rect(
      x + 43,
      y - 11,
      80,
      22,
      color,
      `rx="5" fill-opacity="${impact * 0.22}"`,
    ) +
    text(x + 83, y + 4, `${label} ${c.close}`, color, 11, `${number} ${center}`)
  );
}

function chart(state, p, closeFocus, feedback) {
  const first = candleAt(state, p.time),
    second = candleAt(state, p.time, 60000);
  const final = p.mode === "next-minute";
  const move = final ? smooth(p.elapsed / 1300, p.reduced) : 0;
  const x = mix(500, 365, move),
    width = mix(28, 36, closeFocus);
  let svg = text(
    500,
    40,
    final ? "讓成交，繼續寫下一分鐘" : "同一分鐘 · 同一根 K 線",
    C.ink,
    11,
    center,
  );
  const current = final && second ? second : first,
    currentX = final && second ? 635 : x;
  svg += `<ellipse cx="${currentX}" cy="${priceY(current.close)}" rx="108" ry="68" fill="url(#price-glow)"/>`;
  svg += line(
    377,
    priceY(first.open),
    484,
    priceY(first.open),
    C.muted,
    'stroke-dasharray="3 5" opacity=".35"',
  );
  svg += candle(first, x, width);
  if (!final) {
    svg += priceMarker(
      first,
      x,
      first.closed ? "收盤" : p.scene < 2 ? "成交" : "目前",
      feedback?.impact ?? 0,
    );
    if (p.scene >= 2 && first.close !== first.open)
      svg += text(
        x - 26,
        priceY(first.open) + 4,
        `開盤 ${first.open}`,
        C.muted,
        10,
        'text-anchor="end"',
      );
    if (p.scene >= 4 && first.high > Math.max(first.open, first.close)) {
      svg += text(
        x + 30,
        priceY(first.high) + 4,
        `最高 ${first.high}`,
        C.sell,
        10,
      );
      if (p.scene === 4)
        svg += text(
          x - 24,
          (priceY(first.high) + priceY(first.close)) / 2 + 3,
          "上影線",
          C.sell,
          10,
          'text-anchor="end"',
        );
    }
    if (p.scene >= 5 && first.low < Math.min(first.open, first.close))
      svg += text(
        x + 30,
        priceY(first.low) + 6,
        `最低 ${first.low}`,
        C.muted,
        10,
      );
    svg += text(
      500,
      337,
      first.closed ? "14:30 · 已收盤" : "14:30 · 正在形成",
      C.muted,
      9,
      center,
    );
  } else {
    svg += group(text(x, 337, "14:30 · 已收盤", C.muted, 11, center), move);
    if (second) {
      svg +=
        candle(second, 635, 36, move) +
        priceMarker(second, 635, second.closed ? "收盤" : "目前");
    } else
      svg += line(
        618,
        priceY(state.price),
        652,
        priceY(state.price),
        C.muted,
        'stroke-dasharray="3 3"',
      );
    svg += group(
      text(
        635,
        337,
        second ? "14:31 · 新的一根" : "等待第一筆成交",
        C.muted,
        11,
        center,
      ),
      move,
    );
  }
  if (feedback) {
    const { trade, impact, glow, ring } = feedback;
    const y = priceY(trade.price),
      color = C[trade.side];
    svg += `<g data-execution-at="${trade.at}" data-fill-pulse="${trade.price}">`;
    // A restrained bloom, the matching level and the candle cap confirm the
    // SAME fill. No moving price marker or invented intermediate executions.
    svg += `<ellipse cx="${x}" cy="${y}" rx="${44 + ring * 26}" ry="${25 + ring * 13}" fill="url(#execution-glow-${trade.side})" opacity="${glow}"/>`;
    svg += line(
      trade.side === "buy" ? 640 : 360,
      y,
      x,
      y,
      color,
      `stroke-width="1.5" opacity="${impact * 0.65}"`,
    );
    svg += `<circle cx="${x}" cy="${y}" r="${8 + ring * 14}" fill="none" stroke="${color}" stroke-width="1" opacity="${glow * 0.5}"/>`;
    svg += line(
      x - width / 2,
      y,
      x + width / 2,
      y,
      C.ink,
      `data-candle-impact="${trade.at}" stroke-width="2" stroke-linecap="round" opacity="${impact * 0.8}"`,
    );
    svg += "</g>";
  }
  if (p.scene >= 6) {
    const c = final && second ? second : first;
    const entries = [
      ["開盤", c.open],
      ["最高", c.high],
      ["最低", c.low],
      [c.closed ? "收盤" : "目前", c.close],
    ];
    let strip = "";
    entries.forEach(([label, value], i) => {
      strip += text(338 + i * 108, 387, label, C.muted, 10);
      strip += text(373 + i * 108, 388, value, C.ink, 15, number);
    });
    svg += group(strip, closeFocus);
  }
  return svg;
}

export function drawPrimerDesktop({ state, ...p }) {
  const pair = pairingAt(state, p);
  const feedback = fillFeedback(state, p);
  const closeFocus =
    p.scene >= 7 ? 1 : p.scene === 6 ? smooth(p.elapsed / 1200, p.reduced) : 0;
  const zoom = p.reduced
    ? 1
    : p.scene === 2
      ? 1 + 0.065 * smooth(p.elapsed / 1300, false)
      : [3, 4].includes(p.scene)
        ? 1.065
        : p.scene === 5
          ? 1.065 - 0.065 * smooth(p.elapsed / 1300, false)
          : 1;
  const intro = p.scene === 0 ? smooth(p.elapsed / 600, p.reduced) : 1;
  let board = grid(p);
  board += group(
    orderBook(state, p, pair, feedback) + matching(pair, p),
    1 - closeFocus,
  );
  board += chart(state, p, closeFocus, feedback);
  if (p.scene === 3 && p.time >= 16018) {
    board += text(780, 208, "103 → 110", C.sell, 15, `${number} ${center}`);
    board += text(780, 228, "104–109 沒有成交", C.muted, 10, center);
    board += line(
      626,
      priceY(103) - 12,
      626,
      priceY(110) + 12,
      C.sell,
      'stroke-dasharray="3 5" opacity=".3"',
    );
  }
  const svg =
    `<defs><radialGradient id="price-glow"><stop stop-color="#8bd7c4" stop-opacity=".12"/><stop offset="1" stop-color="#8bd7c4" stop-opacity="0"/></radialGradient>` +
    ["buy", "sell"]
      .map(
        (side) =>
          `<radialGradient id="execution-glow-${side}"><stop stop-color="${C[side]}" stop-opacity=".3"/><stop offset="1" stop-color="${C[side]}" stop-opacity="0"/></radialGradient>`,
      )
      .join("") +
    "</defs>" +
    group(
      board,
      intro,
      `data-camera-zoom="${zoom}" transform="translate(500 195) scale(${zoom}) translate(-500 -195)"`,
    ) +
    group(activeOrder(state, p), 1 - closeFocus);
  return { svg, viewBox: "0 0 1000 400", width: 1000, height: 400 };
}
