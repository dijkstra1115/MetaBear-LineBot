import {
  C,
  text,
  line,
  rect,
  panel,
  frame,
  candle,
  number,
  center,
  stepPath,
} from "./mobile-svg.js";
import { legacyPrice as price, legacySize as size } from "./bear-market.js";
import {
  OPEN,
  CONTEXT,
  activeBuys,
  activeVolume,
  continuationCamera,
} from "./wick-model.js";
import {
  clamp,
  ease,
  mix,
  footprint,
  passiveAt,
  depthHistory,
  priceTrace,
  LEVEL,
} from "./revisit-model.js";
import { START, END, totals, deltaTrace, passiveSell } from "./delta-model.js";

const signed = (n) => `${n >= 0 ? "+" : "−"}${size(Math.abs(n))}`;
const plotClip = (top, bottom) =>
  `<defs><clipPath id="mobile-price-clip">${rect(14, top, 332, bottom - top)}</clipPath></defs>`;
const inPlot = (s) => `<g clip-path="url(#mobile-price-clip)">${s}</g>`;
function receipt(state, time, y = 418, start = 0) {
  const t = state.trades.filter((t) => t.at <= time && t.at >= start).at(-1);
  if (!t) return text(24, y + 18, "等待下一筆成交", C.muted, 14);
  const buy = t.side === "buy",
    color = buy ? C.buy : C.down;
  return (
    `<g data-trade-at="${t.at}">` +
    line(22, y - 17, 338, y - 17) +
    text(24, y, buy ? "主動買入" : "主動賣出", color, 14) +
    text(
      336,
      y,
      `${size(t.size)} 隻 × ${price(t.price)} 元`,
      C.ink,
      16,
      `${number} text-anchor="end"`,
    ) +
    text(24, y + 26, `對手方：被動掛${buy ? "賣" : "買"}`, C.muted, 13) +
    "</g>"
  );
}
function book(state, time, top = 256, bids = 1, asks = 1) {
  let s = "";
  const last = state.trades.at(-1);
  for (const [key, x, side, count] of [
    ["bids", 20, "buy", bids],
    ["asks", 190, "sell", asks],
  ]) {
    const color = side === "buy" ? C.buy : C.sell;
    s += text(x, top, side === "buy" ? "被動掛買" : "被動掛賣", color, 14);
    const rows = state[key].slice(0, count);
    const max = Math.max(...rows.map((r) => r.size), 1);
    rows.forEach((r, i) => {
      const y = top + 28 + i * 35;
      s += rect(x - 2, y - 17, 150, 29, color, 'fill-opacity=".035" rx="4"');
      s += rect(
        x - 2,
        y - 17,
        (150 * r.size) / max,
        29,
        color,
        'fill-opacity=".09" rx="4"',
      );
      s += text(x + 3, y + 3, price(r.price), C.ink, 18, number);
      s += text(
        x + 143,
        y + 3,
        `${size(r.size)} 隻`,
        color,
        14,
        `${number} text-anchor="end"`,
      );
      if (
        last &&
        last.side !== side &&
        last.price === r.price &&
        time - last.at < 600
      )
        s += rect(
          x - 2,
          y - 17,
          150,
          29,
          "none",
          `stroke="${color}" stroke-opacity=".7" rx="4"`,
        );
    });
  }
  return s;
}
function rewind(s, mode) {
  return mode.includes("rewind")
    ? s +
        rect(69, 173, 222, 68, C.panel, 'rx="8" stroke="#38505b"') +
        text(180, 214, "時間倒回", C.ink, 20, center)
    : s;
}

export function drawWickMobile(p) {
  const { state, time, zoom, mode, elapsed = 0, reduced = false } = p;
  const continuation = [
    "absorption",
    "depletion",
    "ascent",
    "high-absorption",
    "bid-depth",
    "descent",
    "support",
    "closing",
  ].includes(mode);
  const camera = continuation
    ? continuationCamera(state, time, elapsed, mode, reduced)
    : null;
  const min = camera?.min ?? mix(OPEN - 4, OPEN - 0.3, zoom),
    max = camera?.max ?? mix(OPEN + 20, OPEN + 1.2, zoom);
  const y = (v) => 224 - ((v - min) / (max - min)) * 172;
  const detail = mode.startsWith("recap") ? 0 : zoom;
  const x = mix(270, 95, detail * (1 - (camera?.wide ?? 0)));
  let s = panel(8, 232) + plotClip(48, 225);
  s += text(
    24,
    31,
    time >= 60000 ? "14:32 · 已收盤" : "14:32 · 1 分 K",
    C.ink,
    14,
  );
  s += text(
    335,
    31,
    detail > 0.5 ? "成交現場 · 放大" : "完整走勢",
    C.muted,
    13,
    'text-anchor="end"',
  );
  for (const v of [min, (min + max) / 2, max]) {
    s += line(
      25,
      y(v),
      336,
      y(v),
      C.grid,
      'stroke-dasharray="2 5" opacity=".5"',
    );
    s += text(24, y(v) - 5, price(v), C.muted, 12, number);
  }
  if (detail < 1) {
    s += `<g opacity="${1 - detail}">`;
    CONTEXT.slice(-3).forEach((c, i) => {
      s += inPlot(candle(c, 65 + i * 61, y, 19));
    });
    s += "</g>";
  }
  s += inPlot(candle(state.candle, x, y, 27));
  s += text(
    Math.min(x + 24, 309),
    Math.max(66, Math.min(219, y(state.price) + 5)),
    price(state.price),
    C.ink,
    18,
    number,
  );
  if (state.candle.high > max)
    s += text(
      336,
      51,
      `↑ 高 ${price(state.candle.high)}`,
      C.muted,
      12,
      `${number} text-anchor="end"`,
    );
  if (detail > 0.4) {
    const sellFocus = ["bid-depth", "descent", "support", "closing"].includes(
      mode,
    );
    const many = ["ascent", "bid-depth", "descent", "support"].includes(mode);
    s += book(
      state,
      time,
      263,
      sellFocus && many ? 3 : 1,
      !sellFocus && many ? 3 : 1,
    );
    if (!many) {
      const qty =
        mode === "high-absorption"
          ? activeBuys(state, 33000, 40000)
          : activeBuys(state, 8000, 20000);
      s += text(
        24,
        359,
        sellFocus
          ? "買單等待，主動賣出才會成交"
          : ["absorption", "high-absorption"].includes(mode)
            ? "主動買入與掛賣補量，交錯發生"
            : "主動買入，與等待中的掛賣成交",
        C.muted,
        13,
      );
      if (time >= 13100 && !sellFocus)
        s += text(24, 384, `這段主動買入 ${size(qty)} 隻`, C.buy, 16, number);
    }
    if (mode === "descent") {
      s += text(
        24,
        386,
        `下跌賣出 ${size(activeVolume(state, "sell", 41000, 50000))}`,
        C.down,
        14,
        number,
      );
      s += text(
        336,
        386,
        `上衝買入 ${size(activeBuys(state, 23000, 29000))}`,
        C.buy,
        14,
        `${number} text-anchor="end"`,
      );
    }
    if (mode === "ascent")
      s += text(
        24,
        386,
        `上衝主動買入 ${size(activeBuys(state, 23000, 29000))} 隻`,
        C.buy,
        14,
        number,
      );
    s += receipt(state, time, 418);
  } else {
    const phrase =
      time < 8000
        ? "從第一筆成交，開始這一分鐘"
        : time < 23000
          ? "買入持續，價格暫時停住"
          : time < 33000
            ? "賣單很薄，少量成交就能往上"
            : time < 41000
              ? "高處的賣單持續補入"
              : time < 50000
                ? "大量主動賣出，價格往下"
                : "高點留在影線，成交決定收盤";
    s += text(180, 288, phrase, C.ink, 16, center);
    s += text(
      180,
      323,
      `最高 ${price(state.candle.high)} · 目前 ${price(state.price)}`,
      C.muted,
      16,
      `${number} ${center}`,
    );
    s += receipt(state, time, 402);
  }
  return frame(rewind(s, mode));
}

function compare(state, top) {
  const historical =
      footprint(state).find((r) => r.price === LEVEL)?.volume ?? 0,
    current = passiveAt(state);
  let s = panel(top, 117) + text(25, top + 25, "101 元：過去與現在", C.ink, 15);
  for (const [y, label, qty, color] of [
    [top + 55, "已成交 · 固定 10 秒", historical, C.muted],
    [top + 90, "目前被動掛買", current, C.buy],
  ]) {
    s +=
      text(25, y, label, color, 13) +
      text(334, y, `${size(qty)} 隻`, color, 18, `${number} text-anchor="end"`);
  }
  return s;
}

export function drawRevisitMobile({ story, state, ...p }) {
  const { time, mode } = p,
    heat =
      ["heatmap", "break"].includes(mode) ||
      (mode === "recap" && time >= 75000);
  const old =
    time < 60000 ||
    ["approach", "first-print", "footprint", "profile"].includes(mode);
  const table = ["first-print", "footprint", "profile"].includes(mode);
  let s = "";
  if (heat) {
    const y = (v) => 242 - ((v - 68418.5) / 7) * 167,
      tx = (t) => 105 + clamp((t - 75000) / 15000) * 226;
    s += panel(8, 268) + plotClip(69, 249);
    s += text(24, 32, "101 元的被動掛買", C.ink, 15);
    s += text(24, 55, "色帶越亮＝掛買量越多", C.buy, 12);
    s += text(336, 55, "白線＝成交價", C.ink, 12, 'text-anchor="end"');
    s += inPlot(candle(state.candle, 65, y, 23));
    for (const level of [68424.5, 68422.5, 68420.5, 68418.5]) {
      s += line(27, y(level), 332, y(level), C.grid, 'stroke-dasharray="2 5"');
      s += text(26, y(level) - 5, price(level), C.muted, 12, number);
    }
    for (const segment of depthHistory(story, Math.min(time, 90000)))
      s += rect(
        tx(segment.at),
        y(LEVEL) - 9,
        tx(segment.end) - tx(segment.at),
        18,
        C.buy,
        `data-depth-price="${LEVEL}" data-until="${segment.end}" fill-opacity="${segment.size === 0 ? 0 : 0.06 + 0.8 * Math.min(1, segment.size / 0.65)}"`,
      );
    const points = priceTrace(state, Math.min(time, 90000)),
      last = points.at(-1);
    s += `<path data-price-trace="true" d="${stepPath(points, tx, y)}" fill="none" stroke="${C.ink}" stroke-width="2"/>`;
    if (last)
      s += `<circle data-latest-price="${last.price}" cx="${tx(last.at)}" cy="${y(last.price)}" r="4" fill="${C.ink}"/>`;
    s +=
      text(58, 266, "K 線", C.muted, 12, center) +
      text(105, 266, "14:33:15", C.muted, 12, number) +
      text(332, 266, "30 秒", C.muted, 12, `${number} text-anchor="end"`);
    s += compare(state, 287) + receipt(state, time, 435);
    return frame(s, 480);
  }
  const bottom = table ? 164 : 241,
    y = (v) => bottom - ((v - 68418) / 22) * (bottom - 57);
  s += panel(8, bottom + 22) + plotClip(47, bottom + 5);
  s += text(24, 32, old ? "14:32 · 回看成交" : "14:33 · 形成中", C.ink, 15);
  const previous = time >= 60000 ? story.previousCandle : state.candle;
  if (!old)
    s +=
      inPlot(candle(previous, 94, y, 23, 'opacity=".35"')) +
      text(94, bottom + 20, "14:32", C.muted, 12, center);
  s += inPlot(candle(old ? previous : state.candle, old ? 120 : 242, y, 28));
  const last = old ? previous.close : state.price;
  s += text(old ? 162 : 275, y(last) + 5, price(last), C.ink, 18, number);
  s += text(
    336,
    53,
    `高點 ${price(previous.high)}`,
    C.muted,
    12,
    'text-anchor="end"',
  );
  if (table) {
    const top = 208,
      rows = footprint(state).slice(0, 5),
      profile = mode === "profile";
    const totalMax = Math.max(...rows.map((r) => r.volume), 1);
    s += text(
      24,
      top,
      profile ? "已成交量 · 固定 10 秒" : "成交足跡 · 逐筆累加",
      C.ink,
      15,
    );
    s += text(24, top + 24, "價位", C.muted, 12);
    if (!profile)
      s +=
        text(196, top + 24, "主動賣出", C.down, 12, 'text-anchor="end"') +
        text(335, top + 24, "主動買入", C.buy, 12, 'text-anchor="end"');
    else
      s += text(
        336,
        top + 24,
        "買量 ＋ 賣量",
        C.muted,
        12,
        'text-anchor="end"',
      );
    rows.forEach((r, i) => {
      const yy = top + 52 + i * 30;
      s += text(24, yy, price(r.price), C.ink, 17, number);
      if (profile) {
        s += rect(
          87,
          yy - 14,
          (164 * r.volume) / totalMax,
          20,
          C.buy,
          'fill-opacity=".25" rx="2"',
        );
        s += text(
          336,
          yy,
          `${size(r.volume)} 隻`,
          C.ink,
          16,
          `${number} text-anchor="end"`,
        );
      } else
        s +=
          text(
            196,
            yy,
            size(r.sell),
            C.down,
            17,
            `${number} text-anchor="end"`,
          ) +
          text(335, yy, size(r.buy), C.buy, 17, `${number} text-anchor="end"`);
    });
    if (!rows.length)
      s += text(24, top + 63, "等待這個時段的第一筆成交", C.muted, 14);
    s += receipt(state, time, 437, 50000);
  } else {
    s += compare(state, 281) + receipt(state, time, 431);
  }
  return frame(rewind(s, mode), 480);
}

export function drawDeltaMobile({
  story,
  state,
  scene,
  mode,
  time,
  elapsed,
  reduced,
}) {
  const count = totals(state, time),
    points = priceTrace(state, time, START),
    last = points.at(-1);
  const tx = (t) => 54 + clamp((t - START) / (END - START)) * 260;
  const py = (v) => 227 - ((v - 68418.1) / 3.1) * 130,
    dy = (v) => 398 - v * 42;
  const build =
    scene >= 3
      ? 1
      : mode === "build"
        ? reduced
          ? Number(elapsed >= 1800)
          : ease(elapsed / 1800)
        : 0;
  const depth = mode === "depth" ? 1 : 0;
  let s = panel(8, 64);
  const cy = (v) => 59 - ((v - 68418) / 6.6) * 38;
  s += candle(state.candle, 40, cy, 14);
  s += text(66, 30, "14:33 · 完整 1 分 K", C.ink, 14);
  s += text(
    66,
    54,
    `高 ${price(state.candle.high)} · 低 ${price(state.candle.low)} · 形成中`,
    C.muted,
    12,
  );
  s += text(
    22,
    94,
    depth ? "101 元的被動掛賣" : "成交價 · 局部放大",
    C.ink,
    15,
  );
  for (const v of [68420.5, 68419.5, 68418.5]) {
    s += line(
      54,
      py(v),
      314,
      py(v),
      v === LEVEL ? C.sell : C.grid,
      'stroke-dasharray="3 5" opacity=".5"',
    );
    s += text(
      43,
      py(v) + 4,
      price(v),
      C.muted,
      12,
      `${number} text-anchor="end"`,
    );
  }
  if (depth) {
    const qty = passiveSell(state),
      y = py(LEVEL);
    s += rect(77, y - 12, 175, 24, C.sell, 'fill-opacity=".07" rx="3"');
    s += rect(
      77,
      y - 12,
      (175 * qty) / 0.8,
      24,
      C.sell,
      'fill-opacity=".65" rx="3" data-passive-sell="true"',
    );
    s += text(
      332,
      y + 5,
      `${size(qty)} 隻`,
      C.sell,
      17,
      `${number} text-anchor="end"`,
    );
    const added = story.events
      .filter(
        (e) =>
          e.kind === "add" &&
          e.side === "sell" &&
          e.price === LEVEL &&
          e.at <= time,
      )
      .at(-1);
    if (added && time - added.at < 1600)
      s += text(78, 177, `補入 +${size(added.size)} 隻`, C.sell, 16, number);
    s += text(78, 214, "掛單補量不計入 CVD", C.muted, 13);
  } else if (last) {
    s += `<path data-price-trace="true" d="${stepPath(points, tx, py)}" fill="none" stroke="${C.ink}" stroke-width="2"/>`;
    s += `<circle data-latest-price="${last.price}" cx="${tx(time)}" cy="${py(last.price)}" r="4" fill="${C.ink}"/>`;
  }
  if (scene > 0 && !mode.includes("rewind")) {
    if (build < 1) {
      let f = text(22, 288, "累計主動買入 − 主動賣出", C.ink, 15);
      for (const [x, label, value, color] of [
        [25, "買入", count.buy, C.buy],
        [143, "賣出", count.sell, C.down],
        [263, "差額", count.delta, C.ink],
      ])
        f +=
          text(x, 320, label, color, 13) +
          text(
            x,
            354,
            x === 263 ? signed(value) : size(value),
            color,
            24,
            number,
          );
      f +=
        text(110, 349, "−", C.muted, 20) +
        text(230, 349, "=", C.muted, 20) +
        text(24, 392, "自 14:33:30 起算 · 單位：隻", C.muted, 13);
      s += `<g opacity="${1 - build}">${f}</g>`;
    }
    if (build > 0) {
      let g =
        text(22, 280, "CVD", C.ink, 15) +
        text(
          334,
          280,
          `${signed(count.delta)} 隻`,
          C.buy,
          19,
          `${number} text-anchor="end"`,
        );
      for (const v of [0, 2])
        g +=
          line(54, dy(v), 314, dy(v), C.grid, 'stroke-dasharray="3 5"') +
          text(
            43,
            dy(v) + 4,
            v === 0 ? "0" : "+400",
            C.muted,
            12,
            `${number} text-anchor="end"`,
          );
      g += `<path data-cvd-trace="true" d="${stepPath(deltaTrace(state, time), tx, dy, "delta")}" fill="none" stroke="${C.buy}" stroke-width="2"/>`;
      g += `<circle data-cvd-value="${count.delta}" cx="${tx(time)}" cy="${dy(count.delta)}" r="4" fill="${C.buy}"/>`;
      g += line(
        tx(time),
        100,
        tx(time),
        399,
        C.muted,
        'stroke-dasharray="2 5" opacity=".25"',
      );
      s += `<g opacity="${build}">${g}</g>`;
    }
  } else
    s += text(
      180,
      323,
      time < 109000 ? "買入增加，價格卻未突破" : "主動賣出增加，價格再回落",
      C.ink,
      16,
      center,
    );
  s +=
    text(54, 247, "14:33:30", C.muted, 12, number) +
    text(314, 247, "59 秒", C.muted, 12, `${number} text-anchor="end"`);
  s += receipt(state, time, 439, START);
  return frame(rewind(s, mode), 480);
}
