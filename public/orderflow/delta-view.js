import { legacySize as formatSize } from "./bear-market.js";
import { drawDeltaMobile } from "./market-mobile-view.js";
import {
  START,
  END,
  LEVEL,
  totals,
  deltaTrace,
  passiveSell,
} from "./delta-model.js";
import { clamp, ease, mix, priceTrace, formatClock } from "./revisit-model.js";
import { formatPrice } from "./wick-view.js";

const C = {
  ink: "#e1ebe7",
  muted: "#7f99a2",
  grid: "#293e46",
  buy: "#8bd7c4",
  sell: "#d8b689",
  down: "#d99c88",
};
const number = 'class="number"';
const text = (x, y, s, c = C.muted, size = 12, attrs = "") =>
  `<text x="${x}" y="${y}" fill="${c}" font-size="${size}" ${attrs}>${s}</text>`;
const line = (x, y, x2, y2, c = C.grid, attrs = "") =>
  `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${c}" ${attrs}/>`;
const rect = (x, y, w, h, c, attrs = "") =>
  `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" fill="${c}" ${attrs}/>`;
const group = (s, a = 1) => `<g opacity="${clamp(a)}">${s}</g>`;
const signed = (value) =>
  `${value >= 0 ? "+" : "−"}${formatSize(Math.abs(value))}`;
const smooth = (v, reduced) => (reduced ? Number(v >= 1) : ease(v));
const tx = (at) => 335 + clamp((at - START) / (END - START)) * 478;
const dy = (value) => 359 - value * 33;

// Both traces are step functions of public executions, not interpolated prices.
function step(points, field, y) {
  return points
    .map((p, i) =>
      i ? `H${tx(p.at)}V${y(p[field])}` : `M${tx(p.at)},${y(p[field])}`,
    )
    .join(" ");
}

function candle(state) {
  const c = state.candle,
    x = 133,
    w = 30;
  const y = (price) => 343 - ((price - 68418) / 6.6) * 259;
  const color = c.close >= c.open ? C.buy : C.down;
  let s = text(76, 32, "1 分鐘 K 線", C.ink, 12);
  s += text(76, 52, "14:33 · 尚未收盤", C.muted, 10);
  s += line(133, 73, 133, 357, C.grid, 'stroke-dasharray="2 6" opacity=".5"');
  s += `<g data-candle="true">${line(x, y(c.high), x, y(c.low), color, 'stroke-width="1.6"')}${rect(x - w / 2, Math.min(y(c.open), y(c.close)), w, Math.max(2, Math.abs(y(c.open) - y(c.close))), color, 'rx="1"')}</g>`;
  s += text(
    162,
    y(c.high) + 4,
    `高 ${formatPrice(c.high)}`,
    C.muted,
    10,
    number,
  );
  s += line(x + 20, y(c.close), x + 28, y(c.close), color);
  s += text(166, y(c.close) + 4, formatPrice(c.close), color, 13, number);
  s += text(76, 391, "整根 K 線", C.muted, 10);
  s += text(76, 410, "保留前半分鐘的高低點", C.muted, 10);
  return s;
}

function formula(count) {
  let s = "";
  for (const [x, label, value, color] of [
    [335, "主動買入", count.buy, C.buy],
    [507, "主動賣出", count.sell, C.down],
    [710, "累計差額", count.delta, C.ink],
  ]) {
    s += text(x, 292, label, color, 11);
    s += text(
      x,
      336,
      x === 710 ? signed(value) : formatSize(value),
      color,
      29,
      number,
    );
    s += text(x, 356, "隻", C.muted, 9, number);
  }
  s += text(465, 329, "−", C.muted, 19) + text(657, 329, "=", C.muted, 19);
  s += text(335, 379, "自 14:33:30 起算", C.muted, 10);
  return s;
}

function cvd(state, time, count) {
  let s =
    text(335, 271, "CVD", C.ink, 12) +
    text(378, 271, "主動買入 − 主動賣出", C.muted, 10);
  for (const value of [0, 2]) {
    s += line(
      335,
      dy(value),
      813,
      dy(value),
      C.grid,
      value === 0 ? 'stroke-dasharray="3 5"' : 'opacity=".35"',
    );
    s += text(
      318,
      dy(value) + 4,
      value === 0 ? "0" : "+400",
      C.muted,
      10,
      `${number} text-anchor="end"`,
    );
  }
  const points = deltaTrace(state, time);
  const path = step(points, "delta", dy),
    end = points.at(-1);
  if (end) {
    s += `<path d="${path} L${tx(time)},${dy(0)} H335 Z" fill="${C.buy}" fill-opacity=".045"/>`;
    s += `<path data-cvd-trace="true" d="${path}" fill="none" stroke="${C.buy}" stroke-width="2" stroke-linejoin="round"/>`;
    s += `<circle data-cvd-value="${count.delta}" cx="${tx(time)}" cy="${dy(count.delta)}" r="3.5" fill="${C.buy}"/>`;
  }
  s += text(848, 315, signed(count.delta), C.buy, 25, number);
  s += text(850, 336, "隻", C.muted, 10);
  s += text(335, 393, "自 14:33:30 累計 · 起點不變", C.muted, 10);
  return s;
}

function receipt(state, time) {
  const t = state.trades.filter((t) => t.at >= START && t.at <= time).at(-1);
  if (!t) return text(335, 412, "等待下一筆成交", C.muted, 11);
  const buy = t.side === "buy",
    color = buy ? C.buy : C.down;
  return (
    text(335, 412, buy ? "主動買入" : "主動賣出", color, 11) +
    text(
      415,
      412,
      `${buy ? "+" : "−"}${formatSize(t.size)} 隻`,
      color,
      12,
      number,
    ) +
    text(515, 412, `@ ${formatPrice(t.price)}`, C.ink, 11, number) +
    text(690, 412, `對手方：被動${buy ? "掛賣" : "掛買"}`, C.muted, 10) +
    text(
      928,
      412,
      formatClock(t.at),
      C.muted,
      10,
      `${number} text-anchor="end"`,
    )
  );
}

export function drawDelta({
  story,
  state,
  scene,
  mode,
  time,
  elapsed,
  reduced,
  mobile = false,
}) {
  if (mobile)
    return {
      ...drawDeltaMobile({ story, state, scene, mode, time, elapsed, reduced }),
      mobileLens:
        scene === 0
          ? "完整 K 線保留高低點，下方放大最新成交"
          : "成交價與 CVD 共用時間軸 · 自 14:33:30 累計",
    };
  let lower = scene === 0 || mode === "rewind" ? 0 : 1;
  if (mode === "count") lower = smooth((elapsed - 1200) / 1000, reduced);
  const bottom = mix(342, 222, lower);
  const py = (price) => bottom - ((price - 68418.1) / 3.1) * (bottom - 80);
  const count = totals(state, time);
  const points = priceTrace(state, time, START);
  const plotEnd = points.at(-1);
  const depth =
    mode === "depth"
      ? smooth((elapsed - 1200) / 1100, reduced)
      : mode === "fall"
        ? 1 - smooth(elapsed / 1000, reduced)
        : 0;
  const build =
    scene >= 3 ? 1 : mode === "build" ? smooth(elapsed / 1800, reduced) : 0;
  let s = candle(state) + line(269, 24, 269, 412, C.grid, 'opacity=".7"');
  s += group(
    text(335, 32, "成交價 · 局部放大", C.ink, 12) +
      (build > 0
        ? text(813, 32, "與下方共用時間軸", C.muted, 10, 'text-anchor="end"')
        : ""),
    1 - depth,
  );
  s += group(text(335, 32, "同價位的主動成交與被動掛賣", C.ink, 12), depth);
  for (const price of [68420.5, 68419.5, 68418.5]) {
    const focus = price === LEVEL;
    s += line(
      335,
      py(price),
      813,
      py(price),
      focus ? C.sell : C.grid,
      focus ? 'stroke-dasharray="4 6" opacity=".55"' : 'opacity=".5"',
    );
    s += text(
      318,
      py(price) + 4,
      formatPrice(price),
      focus ? C.sell : C.muted,
      10,
      `${number} text-anchor="end"`,
    );
  }
  if (plotEnd) {
    let chart = `<path data-price-trace="true" d="${step(points, "price", py)}" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/>`;
    // Same X for price and CVD; do not shift either point towards its label.
    chart += line(
      tx(time),
      70,
      tx(time),
      lower ? 365 : bottom + 8,
      C.muted,
      'stroke-dasharray="2 5" opacity=".25"',
    );
    chart += `<circle data-latest-price="${plotEnd.price}" cx="${tx(time)}" cy="${py(plotEnd.price)}" r="3.5" fill="${C.ink}"/>`;
    chart += text(
      848,
      py(plotEnd.price) + 4,
      formatPrice(plotEnd.price),
      C.ink,
      13,
      number,
    );
    if (mode === "preview") {
      const clue =
        time < 95500
          ? "反彈"
          : time < 109000
            ? "買入增加，仍未突破"
            : "主動賣出，價格回落";
      chart += text(335, 57, clue, time < 109000 ? C.buy : C.down, 11);
    }
    s += group(chart, 1 - depth);
  }
  if (depth > 0) {
    const size = passiveSell(state),
      y = py(LEVEL);
    const last = state.trades.filter((t) => t.at <= time).at(-1),
      buy = last.side === "buy";
    let book =
      text(350, 58, "主動成交", C.muted, 10) +
      text(608, 58, "被動掛賣 · 尚未成交", C.sell, 10);
    book += rect(596, y - 10, 215, 20, C.sell, 'fill-opacity=".07" rx="2"');
    book += rect(
      596,
      y - 10,
      (215 * size) / 0.8,
      20,
      C.sell,
      'fill-opacity=".65" rx="2" data-passive-sell="true"',
    );
    book +=
      text(848, y + 5, formatSize(size), C.sell, 23, number) +
      text(850, y + 25, "隻", C.muted, 9);
    book += `<circle cx="451" cy="${py(last.price)}" r="5" fill="${buy ? C.buy : C.down}"/>`;
    if (buy)
      book +=
        line(465, y, 580, y, C.buy, 'stroke-width="1.4"') +
        `<path d="M574,${y - 3} L580,${y} L574,${y + 3}" fill="none" stroke="${C.buy}"/>`;
    book += text(
      451,
      py(last.price) + 26,
      `${buy ? "買入" : "賣出"} ${formatSize(last.size)}`,
      buy ? C.buy : C.down,
      11,
      'text-anchor="middle"',
    );
    const lastAdd = story.events
      .filter(
        (e) =>
          e.kind === "add" &&
          e.side === "sell" &&
          e.price === LEVEL &&
          e.at <= time,
      )
      .at(-1);
    if (lastAdd && time - lastAdd.at < 1600)
      book += text(
        608,
        177,
        `補入 +${formatSize(lastAdd.size)} 隻`,
        C.sell,
        12,
        number,
      );
    book += text(608, 206, "補量不計入 CVD", C.muted, 10);
    s += group(book, depth);
  }
  const axisY = lower > 0 ? mix(244, 376, build) : 366;
  for (const [at, label] of [
    [90000, "14:33:30"],
    [100000, "40"],
    [110000, "50"],
    [119000, "59 秒"],
  ])
    s += text(
      tx(at),
      axisY,
      label,
      C.muted,
      10,
      `${number} text-anchor="${at === 90000 ? "start" : at === 119000 ? "end" : "middle"}"`,
    );
  if (lower) {
    s += group(formula(count), lower * (1 - ease(build * 2)));
    s += group(cvd(state, time, count), lower * ease((build - 0.4) / 0.6));
  }
  if (scene === 6) {
    s += rect(329, 382, 500, 15, "#101b22");
    s += text(
      335,
      393,
      `${formatSize(count.buy)} 買入 − ${formatSize(count.sell)} 賣出 = ${signed(count.delta)} 隻　·　自 14:33:30`,
      C.muted,
      10,
      number,
    );
  }
  s += receipt(state, time);
  return { svg: s };
}
