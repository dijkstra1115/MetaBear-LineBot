import {
  LEVEL,
  WINDOW_END,
  clamp,
  ease,
  mix,
  footprint,
  passiveAt,
  depthHistory,
  priceTrace,
  formatClock,
} from "./revisit-model.js";
import { drawRevisitMobile } from "./market-mobile-view.js";
import { formatPrice } from "./wick-view.js";
import { legacySize } from "./bear-market.js";
export const formatQuantity = legacySize;
const formatSize = formatQuantity;

const C = {
  ink: "#e1ebe7",
  muted: "#7f99a2",
  grid: "#293e46",
  buy: "#8bd7c4",
  sell: "#d8b689",
  down: "#d99c88",
  past: "#9aafbc",
};
const text = (x, y, value, color = C.muted, size = 12, attrs = "") =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${attrs}>${value}</text>`;
const line = (x, y, x2, y2, color = C.grid, attrs = "") =>
  `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${color}" ${attrs}/>`;
const rect = (x, y, w, h, color, attrs = "") =>
  `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" fill="${color}" ${attrs}/>`;
const group = (s, opacity = 1) => `<g opacity="${clamp(opacity)}">${s}</g>`;
const number = 'class="number"';
const smooth = (value, reduced) => (reduced ? Number(value >= 1) : ease(value));

function camera(p) {
  const { mode, elapsed, reduced } = p;
  if (mode === "preview") {
    const t = smooth(elapsed / 1800, reduced);
    return {
      min: mix(68416, 68418.5, t),
      max: mix(68440, 68425.5, t),
      x: 625,
      oldX: 440,
      wide: 1,
      book: 0,
      prints: 0,
      profile: 0,
      heat: 0,
    };
  }
  const wide = {
    min: 68418.5,
    max: 68425.5,
    x: 475,
    oldX: 375,
    wide: 0,
    book: 1,
    prints: 0,
    profile: 1,
    heat: 0,
  };
  const close = {
    min: 68419.7,
    max: 68422.4,
    x: 338,
    oldX: 338,
    wide: 0,
    book: 1,
    prints: 1,
    profile: 0,
    heat: 0,
  };
  if (mode === "rewind")
    return { ...wide, x: 625, oldX: 440, wide: 1, book: 0, profile: 0 };
  if (mode === "approach") {
    const t = smooth((elapsed - 1200) / 1600, reduced);
    return {
      ...close,
      min: mix(wide.min, close.min, t),
      max: mix(wide.max, close.max, t),
      x: mix(440, close.x, t),
      book: t,
      prints: 0,
    };
  }
  if (["first-print", "footprint"].includes(mode)) return close;
  if (mode === "profile") {
    const t = smooth((elapsed - 2800) / 3700, reduced);
    return {
      ...wide,
      min: mix(close.min, wide.min, t),
      max: mix(close.max, wide.max, t),
      x: mix(close.x, wide.x, t),
      transition: smooth(elapsed / 2800, reduced),
      retreat: t,
    };
  }
  if (mode === "return") return wide;
  if (["heatmap", "break"].includes(mode)) {
    const heat = mode === "break" ? 1 : smooth(elapsed / 1600, reduced);
    return {
      ...wide,
      x: mix(475, 355, heat),
      heat,
    };
  }
  if (mode === "after") {
    const restore = smooth(elapsed / 1500, reduced);
    const t = smooth((elapsed - 2200) / 7300, reduced);
    return {
      ...wide,
      x: mix(mix(355, 475, restore), 625, t),
      oldX: mix(375, 440, t),
      wide: t,
      book: 1 - t,
      heat: 1 - restore,
    };
  }
  return { ...wide, x: 625, oldX: 440, wide: 1, book: 0, heat: 0 };
}

function candle(c, x, y, width = 27, opacity = 1) {
  const color = c.close >= c.open ? C.buy : C.down;
  return (
    `<g data-candle="true" opacity="${opacity}">` +
    line(x, y(c.high), x, y(c.low), color, 'stroke-width="1.6"') +
    rect(
      x - width / 2,
      Math.min(y(c.open), y(c.close)),
      width,
      Math.max(2, Math.abs(y(c.open) - y(c.close))),
      color,
      'rx="1"',
    ) +
    "</g>"
  );
}

function liveBook(state, time) {
  let s = text(666, 43, "此刻可見 · 被動掛單", C.muted, 12);
  s += text(666, 64, "尚未成交 · 最近買賣價", C.muted, 10);
  const last = state.trades.at(-1);
  for (const [side, row, top] of [
    ["sell", state.asks[0], 98],
    ["buy", state.bids[0], 204],
  ]) {
    if (!row) continue;
    const color = side === "buy" ? C.buy : C.sell;
    const pulse =
      last && last.side !== side && last.price === row.price
        ? 1 - clamp((time - last.at) / 900)
        : 0;
    s += rect(
      654,
      top,
      267,
      77,
      color,
      `fill-opacity="${0.035 + pulse * 0.05}" stroke="${color}" stroke-opacity="${0.18 + pulse * 0.3}" rx="3"`,
    );
    s += text(
      667,
      top + 19,
      side === "buy" ? "被動掛買 · Maker" : "被動掛賣 · Maker",
      color,
      10,
    );
    s += text(667, top + 45, formatPrice(row.price), C.ink, 19, number);
    s += text(
      905,
      top + 45,
      `${formatSize(row.size)}`,
      color,
      20,
      `${number} text-anchor="end"`,
    );
    s += text(905, top + 18, "隻", C.muted, 9, 'text-anchor="end"');
    s += rect(667, top + 62, 238, 3, C.grid);
    s += rect(
      667,
      top + 62,
      238 * Math.min(1, row.size / 1.2),
      3,
      color,
      'opacity=".8"',
    );
  }
  return s;
}

function prints(state, time, y, reduced, settled) {
  const rows = footprint(state);
  let s = text(224, 43, "各價位主動成交量", C.ink, 13);
  s += text(224, 64, "14:32:50 起 · 已成交 隻", C.muted, 10);
  s += text(274, 86, "主動賣出", C.sell, 11, 'text-anchor="middle"');
  s += text(401, 86, "主動買入", C.buy, 11, 'text-anchor="middle"');
  for (const row of rows) {
    s += text(
      192,
      y(row.price) + 5,
      formatPrice(row.price),
      C.muted,
      12,
      `${number} text-anchor="end"`,
    );
    s += line(
      208,
      y(row.price),
      463,
      y(row.price),
      C.grid,
      'stroke-dasharray="2 5"',
    );
    for (const [side, x, color] of [
      ["sell", 236, C.sell],
      ["buy", 364, C.buy],
    ]) {
      if (!row[side]) continue;
      s += rect(
        x,
        y(row.price) - 22,
        75,
        44,
        "#172930",
        `rx="3" stroke="${color}" stroke-opacity=".3"`,
      );
      s += text(
        x + 37.5,
        y(row.price) + 7,
        formatSize(row[side]),
        color,
        20,
        `${number} text-anchor="middle"`,
      );
    }
  }
  const latest = state.trades.at(-1);
  if (
    !settled &&
    latest &&
    latest.at >= 50000 &&
    latest.at < 60000 &&
    time - latest.at < 650
  ) {
    const t = reduced ? 1 : ease((time - latest.at) / 650);
    const tx = latest.side === "sell" ? 274 : 401;
    const ty = y(latest.price);
    s += `<circle cx="${mix(493, tx, t)}" cy="${mix(366, ty, t)}" r="${mix(5, 15, t)}" fill="none" stroke="${latest.side === "sell" ? C.sell : C.buy}" opacity="${1 - t}"/>`;
  }
  return s;
}

function profile(
  state,
  y,
  { x = 103, scale = 175, labels = true, opacity = 1 } = {},
) {
  let s = "";
  if (labels) {
    s += text(x, 43, "已成交量", C.past, 12);
    s += text(x, 64, "14:32:50–14:33:00", C.muted, 10, number);
    s += text(x, 82, "固定這 10 秒 · 已成交 隻", C.muted, 10);
  }
  for (const row of footprint(state)) {
    s += rect(
      x,
      y(row.price) - 9,
      row.volume * scale,
      18,
      C.past,
      'fill-opacity=".35" rx="1"',
    );
    s += text(
      x + row.volume * scale + 9,
      y(row.price) + 5,
      formatSize(row.volume),
      C.past,
      13,
      number,
    );
  }
  s += text(x, 334, "成交量分布 · Volume Profile", C.muted, 10);
  return group(s, opacity);
}

function profileTransition(state, p, c, y) {
  const merge = c.transition,
    retreat = c.retreat;
  const x = mix(236, 103, retreat),
    scale = mix(235, 175, retreat);
  let s =
    text(x, 43, "已成交量", C.past, 12) +
    text(x, 64, "14:32:50–14:33:00", C.muted, 10, number) +
    text(x, 82, "固定這 10 秒 · 已成交 隻", C.muted, 10);
  for (const row of footprint(state)) {
    for (const [side, startX, color] of [
      ["sell", 236, C.sell],
      ["buy", 364, C.buy],
    ]) {
      if (!row[side]) continue;
      const target = x + (side === "buy" ? row.sell * scale : 0);
      const bx = mix(startX, target, merge);
      const w = mix(75, row[side] * scale, merge),
        h = mix(44, 18, merge);
      s += rect(
        bx,
        y(row.price) - h / 2,
        w,
        h,
        merge < 1 ? color : C.past,
        `fill-opacity="${mix(0.12, 0.35, merge)}" rx="2"`,
      );
      s += group(
        text(
          bx + w / 2,
          y(row.price) + 7,
          formatSize(row[side]),
          color,
          20,
          `${number} text-anchor="middle"`,
        ),
        1 - ease(merge / 0.45),
      );
    }
    s += group(
      text(
        x + row.volume * scale + 9,
        y(row.price) + 5,
        formatSize(row.volume),
        C.past,
        13,
        number,
      ),
      ease((merge - 0.55) / 0.45),
    );
  }
  s += group(text(x, 334, "成交量分布 · Volume Profile", C.muted, 10), merge);
  return s;
}

function heatmap(story, state, time, y) {
  const start = 75000,
    end = 90000,
    x = 435,
    width = 383;
  const cursor = (t) =>
    x + ((Math.min(end, t) - start) / (end - start)) * width;
  const levelY = y(LEVEL);
  let s = text(x, 43, "被動買單熱力圖", C.ink, 13);
  s += text(x, 65, "越亮＝掛買量越多", C.buy, 11);
  s += line(x + 230, 61, x + 251, 61, C.ink, 'stroke-width="1.6"');
  s += text(x + 258, 65, "最新成交價", C.ink, 11);
  s += text(355, 88, "1 分鐘 K 線", C.muted, 10, 'text-anchor="middle"');
  s += text(355, 349, "14:33 · 形成中", C.muted, 10, 'text-anchor="middle"');
  s += rect(x, 99, width, 227, "#0b151b", 'fill-opacity=".45" rx="3"');
  s += line(
    x,
    levelY,
    840,
    levelY,
    C.buy,
    'opacity=".28" stroke-dasharray="3 5"',
  );
  s += text(851, levelY - 32, "此刻被動掛買", C.muted, 11);
  s += text(851, levelY - 11, formatPrice(LEVEL), C.ink, 14, number);
  s += text(
    851,
    levelY + 14,
    `${formatSize(passiveAt(state))} 隻`,
    C.buy,
    16,
    number,
  );
  for (const segment of depthHistory(story, Math.min(time, end))) {
    s += rect(
      cursor(segment.at),
      levelY - 10,
      cursor(segment.end) - cursor(segment.at),
      20,
      C.buy,
      `data-depth-price="${LEVEL}" data-until="${segment.end}" fill-opacity="${segment.size === 0 ? 0 : 0.06 + 0.8 * Math.min(1, segment.size / 0.65)}"`,
    );
  }
  const points = priceTrace(state, Math.min(time, end));
  if (points.length) {
    const path = points
      .map((point, i) =>
        i
          ? `H${cursor(point.at)} V${y(point.price)}`
          : `M${cursor(point.at)},${y(point.price)}`,
      )
      .join(" ");
    s += `<path data-price-trace="true" d="${path}" stroke="${C.ink}" fill="none" stroke-width="1.7" stroke-linejoin="round"/>`;
    const last = points.at(-1);
    s += `<circle data-latest-price="${last.price}" cx="${cursor(last.at)}" cy="${y(last.price)}" r="3.5" fill="${C.ink}"/>`;
  }
  s += line(
    cursor(time),
    98,
    cursor(time),
    326,
    C.ink,
    'stroke-width="1" opacity=".15"',
  );
  for (const [at, label, anchor] of [
    [75000, "14:33:15", "start"],
    [80000, "20", "middle"],
    [85000, "25", "middle"],
    [90000, "30 秒", "end"],
  ])
    s += text(
      cursor(at),
      349,
      label,
      C.muted,
      10,
      `${number} text-anchor="${anchor}"`,
    );
  return `<g data-heatmap="true">${s}</g>`;
}

function receipt(state, time, opacity) {
  const latest = state.trades.at(-1);
  if (!latest) return "";
  const buy = latest.side === "buy",
    color = buy ? C.buy : C.sell;
  return group(
    rect(164, 369, 757, 45, "#0c171d", 'stroke="#263b42" rx="3"') +
      text(179, 389, `最新主動${buy ? "買入" : "賣出"} · Taker`, color, 11) +
      text(384, 390, `${formatSize(latest.size)} 隻`, C.ink, 15, number) +
      text(497, 390, `@ ${formatPrice(latest.price)}`, C.ink, 15, number) +
      text(
        906,
        389,
        formatClock(latest.at),
        C.muted,
        11,
        `${number} text-anchor="end"`,
      ) +
      text(384, 405, `對手方：被動掛${buy ? "賣" : "買"} · Maker`, C.muted, 10),
    opacity,
  );
}

export function drawRevisit({ story, state, ...p }) {
  if (p.mobile)
    return {
      ...drawRevisitMobile({ story, state, ...p }),
      mobileLens:
        p.scene >= 4 ? "過去已成交量與此刻掛單量，分開比較" : undefined,
    };
  const c = camera(p),
    { time, mode, elapsed, reduced } = p;
  const y = (price) => 321 - ((price - c.min) / (c.max - c.min)) * 269;
  const oldMoment =
    time < WINDOW_END ||
    ["approach", "first-print", "footprint"].includes(mode) ||
    (mode === "profile" && c.retreat < 1);
  const historicalCandle =
    time >= WINDOW_END ? story.previousCandle : state.candle;
  const isRewind = mode.includes("rewind");
  const close = ["approach", "first-print", "footprint"].includes(mode);
  // The price crop is vertical. A 630px right edge used to cut the 625px
  // candle's body in half while leaving its wick, making it look off-centre.
  let s = `<defs><clipPath id="price-clip"><rect x="80" y="98" width="844" height="231"/></clipPath></defs>`;
  for (const gy of [110, 181, 252, 323])
    s += line(80, gy, 923, gy, C.grid, 'opacity=".32"');
  const levelY = y(LEVEL);
  if (!close) {
    s += line(
      86,
      levelY,
      mix(622, 842, c.wide),
      levelY,
      C.sell,
      'opacity=".37" stroke-dasharray="3 5"',
    );
    s += text(86, levelY + 29, "101 · 上次接住的價位", C.sell, 11);
  }
  let candles = "";
  if (mode === "profile") {
    candles += candle(
      historicalCandle,
      mix(338, 375, c.retreat),
      y,
      27,
      0.66 * (1 - c.transition) + 0.28 * c.retreat,
    );
    candles += candle(state.candle, c.x, y, 31, c.retreat);
  } else if (oldMoment)
    candles += candle(
      historicalCandle,
      mode === "rewind" ? 440 : c.x,
      y,
      27,
      close ? 0.66 : 1,
    );
  else {
    candles += candle(
      story.previousCandle,
      c.oldX,
      y,
      27,
      0.28 * (1 - ease(c.heat * 2)),
    );
    candles += candle(state.candle, c.x, y, 32);
  }
  // The previous wick remains a clipped continuation, not a diagonal glyph or
  // a fabricated shorter wick. Its off-screen high is named explicitly.
  s += `<g clip-path="url(#price-clip)">${candles}</g>`;
  if (close) s += text(87, 23, "↑ 同一根 K 線，高點 136 在上方", C.muted, 10);
  else
    s += group(
      text(c.oldX - 58, 88, "↑ 前一根高點 136", C.muted, 10),
      mode === "profile" ? c.retreat : 1 - ease(c.heat * 2),
    );

  if (c.profile && mode !== "profile")
    s += profile(state, y, { opacity: mode === "recap-rewind" ? 0.55 : 1 });
  if (mode === "profile") s += profileTransition(state, p, c, y);
  if (c.prints && !isRewind)
    s += group(prints(state, time, y, reduced, p.progress === 1), c.prints);
  if (c.book && !isRewind)
    s += group(liveBook(state, time), c.book * (1 - ease(c.heat * 2)));
  if (c.heat && !isRewind)
    s += group(heatmap(story, state, time, y), ease((c.heat - 0.4) / 0.6));

  if (!close && !(mode === "rewind" && time < WINDOW_END)) {
    let annotations = line(
      c.x + 18,
      y(state.price),
      mix(551, 781, c.wide),
      y(state.price),
      C.ink,
      'opacity=".35" stroke-dasharray="2 4"',
    );
    annotations += text(
      mix(554, 790, c.wide),
      y(state.price) + 5,
      formatPrice(state.price),
      C.ink,
      13,
      number,
    );
    annotations += text(
      c.oldX,
      349,
      "14:32",
      C.muted,
      10,
      `${number} text-anchor="middle"`,
    );
    annotations += text(
      c.x,
      349,
      "14:33 · 形成中",
      C.muted,
      10,
      `${number} text-anchor="middle"`,
    );
    s += group(
      annotations,
      mode === "profile" ? ease((c.retreat - 0.6) / 0.4) : 1 - ease(c.heat * 2),
    );
  }
  if (close || (mode === "rewind" && time < WINDOW_END))
    s += text(
      mode === "rewind" ? 440 : c.x,
      349,
      "14:32 · 回看尾端",
      C.muted,
      10,
      'text-anchor="middle"',
    );

  const detail = !isRewind && !["preview", "profile", "recap"].includes(mode);
  if (detail)
    s += receipt(state, time, mode === "after" ? 1 - ease(c.wide * 2) : 1);

  if (["preview", "recap"].includes(mode) || (mode === "after" && c.wide > 0)) {
    let clue = "後續行情 · 14:33";
    if (time >= 70000) clue = "價格再次接近 101";
    if (time >= 83006) clue = "成交價跌破 101";
    if (mode === "recap") {
      clue =
        time < 77000
          ? "固定統計：過去 10 秒的成交量"
          : time < 83000
            ? "目前可見買量減少"
            : "主動賣出在更低價成交";
    }
    s += group(
      text(86, 393, clue, C.ink, 16),
      mode === "after" ? ease((c.wide - 0.55) / 0.45) : 1,
    );
  }
  if (isRewind)
    s +=
      rect(
        347,
        166,
        310,
        65,
        "#0b151b",
        'fill-opacity=".94" stroke="#38505b" rx="3"',
      ) +
      text(502, 193, "時間倒回", C.ink, 15, 'text-anchor="middle"') +
      text(
        502,
        216,
        mode === "rewind" ? "回到 14:32:50" : "回到 14:33:00",
        C.muted,
        11,
        'text-anchor="middle"',
      );
  return { svg: s, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
