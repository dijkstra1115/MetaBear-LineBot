import {
  OPEN,
  CONTEXT,
  WICK_AFTER,
  SCENE_DURATIONS,
  scenePosition,
  continuationCamera,
  activeVolume,
} from "./wick-model.js";
import { legacyPrice as price, legacySize as size } from "./bear-market.js";
import { bear } from "./primer-matching-view.js";

const C = {
  ink: "#e1ebe7",
  muted: "#80999e",
  grid: "#344c51",
  buy: "#8bd7c4",
  sell: "#d8b689",
  down: "#d99c88",
};
const clamp = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const middle = 'text-anchor="middle"';
const number = 'class="number"';
const text = (x, y, s, color = C.muted, font = 12, attrs = "") =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${font}" ${attrs}>${s}</text>`;
const line = (x, y, x2, y2, color = C.grid, attrs = "") =>
  `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${color}" ${attrs}/>`;
const rect = (x, y, w, h, color, attrs = "") =>
  `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" fill="${color}" ${attrs}/>`;
const group = (svg, alpha = 1, attrs = "") =>
  `<g opacity="${clamp(alpha)}" ${attrs}>${svg}</g>`;
const continuation = new Set([
  "absorption",
  "depletion",
  "ascent",
  "high-absorption",
  "bid-depth",
  "descent",
  "support",
  "closing",
]);

export function desktopCamera(state, p) {
  const camera = continuation.has(p.mode)
    ? continuationCamera(
        state,
        p.time,
        Math.min(p.elapsed, SCENE_DURATIONS[p.scene]),
        p.mode,
        p.reduced,
      )
    : {
        min: mix(OPEN - 4, OPEN - 0.3, p.zoom),
        max: mix(OPEN + 20, OPEN + 1.2, p.zoom),
        wide: 0,
      };
  return {
    ...camera,
    y: (value) => 68 + ((camera.max - value) / (camera.max - camera.min)) * 238,
  };
}

// Convert an actual event time into the current chapter's viewing time.
// Feedback never repeats an earlier chapter's last trade or runs during a rewind.
export function desktopEventAge(p, at) {
  if (p.mode.includes("rewind") || p.mode === "approach" || at > p.time)
    return Infinity;
  let low = p.scene === 1 ? 3600 : p.scene === 11 ? 1200 : 0;
  let high = SCENE_DURATIONS[p.scene];
  if (at <= scenePosition(p.scene, low, p.reduced).time) return Infinity;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (scenePosition(p.scene, mid, p.reduced).time < at) low = mid;
    else high = mid;
  }
  return Math.max(0, p.elapsed - high);
}

function bookAlpha(p, camera) {
  const exit =
    p.mode === "closing"
      ? 1 - (p.reduced ? Number(p.elapsed >= 1800) : ease(p.elapsed / 1800))
      : 1;
  return ease((p.zoom - 0.5) * 2) * (1 - ease((camera.wide ?? 0) * 2)) * exit;
}

function book(story, state, p, camera) {
  const { y } = camera;
  let svg = "";
  for (const [side, key, x] of [
    ["buy", "bids", 140],
    ["sell", "asks", 640],
  ]) {
    const color = C[side];
    const focus =
      p.scene >= 7 && p.scene <= 9 ? side === "buy" : side === "sell";
    let column =
      bear(x + 8, 37, 6, color) +
      text(x + 24, 41, side === "buy" ? "被動買單" : "被動賣單", color, 12) +
      text(x + 220, 41, "等待成交", C.muted, 9, 'text-anchor="end"') +
      line(x, 53, x + 220, 53);
    const rows = state[key].slice(0, 8).map((r) => ({ ...r }));
    const fills = state.trades.filter(
      (t) => t.side !== side && desktopEventAge(p, t.at) < 600,
    );
    for (const t of fills) {
      if (
        !rows.some((r) => r.price === t.price) &&
        !state[key].some((r) => r.price === t.price)
      )
        rows.push({ price: t.price, size: 0 });
    }
    for (const row of rows) {
      const cy = y(row.price);
      if (cy < 70 || cy > 301) continue;
      const event = story.events.findLast(
        (e) =>
          e.at <= p.time &&
          e.price === row.price &&
          (e.kind === "add" ? e.side === side : e.side !== side),
      );
      const age = event ? desktopEventAge(p, event.at) : Infinity;
      const flash = p.reduced ? 0 : 1 - ease(age / 800);
      const consumed = row.size === 0;
      if (consumed && (p.reduced || age >= 600)) continue;
      const added = event?.kind === "add" && age < 1100;
      const exit = consumed ? ease((age - 150) / 450) : 0;
      let r =
        rect(
          x,
          cy - 12,
          220,
          24,
          "#142126",
          `rx="5" stroke="${color}" stroke-opacity="${0.2 + flash * 0.65}"`,
        ) +
        rect(x, cy - 12, 3, 24, color, 'rx="1" opacity=".65"') +
        text(x + 14, cy + 4, price(row.price), color, 14, number) +
        text(x + 48, cy + 3, "元", C.muted, 8) +
        rect(x + 67, cy - 2, 83, 4, color, 'opacity=".09" rx="2"') +
        rect(
          x + 67,
          cy - 2,
          83 * clamp(row.size / 2),
          4,
          color,
          'opacity=".7" rx="2"',
        ) +
        text(
          x + 208,
          cy + 4,
          consumed ? "已用完" : `${size(row.size)} 隻`,
          consumed ? C.ink : color,
          11,
          'text-anchor="end"',
        );
      if (added)
        r += text(
          side === "buy" ? x - 12 : x + 232,
          cy + 4,
          `+${size(event.size)} 補入`,
          color,
          10,
          side === "buy" ? 'text-anchor="end"' : "",
        );
      column += group(
        r,
        1 - exit,
        `data-book-side="${side}" data-price="${row.price}" data-book-size="${row.size}"${consumed ? ` data-consumed-at="${event.at}"` : ""}`,
      );
    }
    const nearest = state[key][0];
    if (nearest && (y(nearest.price) < 70 || y(nearest.price) > 301))
      column += text(
        x + 110,
        y(nearest.price) < 70 ? 79 : 298,
        `${y(nearest.price) < 70 ? "↑" : "↓"} 最近${side === "buy" ? "買" : "賣"}價 ${price(nearest.price)}`,
        color,
        11,
        middle,
      );
    svg += group(column, focus ? 1 : 0.64);
  }
  svg += text(
    500,
    331,
    "掛單長條使用相同比例 · 僅顯示鄰近價位",
    C.muted,
    9,
    middle,
  );
  return svg;
}

function candle(c, x, w, y, color, attrs = "") {
  return (
    `<g data-candle data-open="${c.open}" data-high="${c.high}" data-low="${c.low}" data-close="${c.close}" ${attrs}>` +
    line(x, y(c.high), x, y(c.low), color, 'stroke-width="2"') +
    rect(
      x - w / 2,
      Math.min(y(c.open), y(c.close)) - (c.open === c.close ? 1 : 0),
      w,
      Math.max(2, Math.abs(y(c.open) - y(c.close))),
      color,
      'rx="2"',
    ) +
    "</g>"
  );
}

function receipt(state, p) {
  const latest = state.trades.at(-1);
  if (p.scene < 2 || !latest) return "";
  const color = latest.side === "buy" ? C.buy : C.sell;
  const count =
    p.scene >= 3 && p.scene <= 5
      ? activeVolume(
          state,
          "buy",
          p.scene === 5 ? 23000 : 8000,
          p.scene === 5 ? 29000 : 20000,
        )
      : p.scene === 8
        ? activeVolume(state, "sell", 41000, 50000)
        : null;
  let svg =
    rect(
      140,
      347,
      720,
      44,
      "#142126",
      'rx="8" stroke="#304c4d" stroke-opacity=".65"',
    ) +
    text(
      158,
      363,
      `最新${latest.side === "buy" ? "主動買入" : "主動賣出"}`,
      color,
      10,
    ) +
    text(
      158,
      382,
      `${size(latest.size)} 隻 × ${price(latest.price)} 元`,
      C.ink,
      15,
      number,
    ) +
    line(355, 358, 355, 380) +
    text(373, 363, "成交的對手方", C.muted, 9) +
    text(
      373,
      382,
      latest.side === "buy" ? "右側的被動賣單" : "左側的被動買單",
      color,
      11,
    );
  if (count !== null && count > 0)
    svg +=
      text(
        842,
        363,
        p.scene === 8 ? "本段主動賣出累計" : "本段主動買入累計",
        C.muted,
        9,
        'text-anchor="end"',
      ) +
      text(
        842,
        382,
        `${size(count)} 隻`,
        p.scene === 8 ? C.sell : C.buy,
        17,
        `text-anchor="end" ${number}`,
      );
  else
    svg +=
      text(842, 363, "已成交", C.muted, 9, 'text-anchor="end"') +
      text(
        842,
        382,
        `14:32:${(latest.at / 1000).toFixed(2).padStart(5, "0")}`,
        C.muted,
        12,
        `text-anchor="end" ${number}`,
      );
  return `<g data-trade-at="${latest.at}">${svg}</g>`;
}

function overview(state, p, camera) {
  const { y } = camera;
  if (p.scene < 2 || p.mode === "closing" || p.scene === 11) {
    let chart =
      text(112, 35, "WICK / 一根上影線", C.muted, 10, 'letter-spacing="1.8"') +
      text(
        888,
        35,
        p.scene === 0 ? "9 根已完成一分 K · 合成行情" : "同一份歷史 · 選段回看",
        C.muted,
        10,
        'text-anchor="end"',
      );
    for (let i = 0; i < 9; i++)
      chart += text(
        172 + i * 82,
        333,
        `14:${28 + i}`,
        i === 4 ? C.ink : C.muted,
        9,
        middle,
      );
    chart += rect(
      476,
      65,
      48,
      241,
      "none",
      'rx="5" stroke="#8bd7c4" stroke-opacity=".4"',
    );
    chart += text(
      500,
      361,
      p.scene >= 10
        ? "同一份成交，留下這根上影線"
        : "放大這一分鐘，看裡面的成交",
      C.muted,
      11,
      middle,
    );
    if (state.candle.high > state.candle.close + 0.5)
      chart +=
        line(
          514,
          y(state.candle.high),
          552,
          y(state.candle.high),
          C.sell,
          'stroke-opacity=".5"',
        ) +
        text(562, y(state.candle.high) - 7, "最高成交", C.muted, 10) +
        text(
          562,
          y(state.candle.high) + 16,
          price(state.candle.high),
          C.sell,
          19,
          number,
        );
    if (p.time >= 60000)
      chart +=
        line(
          455,
          y(state.candle.close),
          485,
          y(state.candle.close),
          C.buy,
          'stroke-opacity=".4"',
        ) +
        text(
          450,
          y(state.candle.close) + 7,
          `收盤 ${price(state.candle.close)}`,
          C.buy,
          12,
          'text-anchor="end"',
        ) +
        text(
          460,
          y(state.candle.high) + 37,
          "上影線",
          C.sell,
          10,
          'text-anchor="end"',
        );
    return chart;
  }
  let svg =
    text(500, 37, "14:32 — 14:33", C.muted, 10, `${middle} ${number}`) +
    text(500, 329, "同一根 K 線 · 同一分鐘", C.muted, 10, middle);
  const compare = p.mode === "ascent" || p.mode === "high-absorption";
  if (compare) {
    svg +=
      text(160, 116, "剛才 · 賣單持續補回", C.muted, 11) +
      text(
        160,
        155,
        `${size(activeVolume(state, "buy", 8000, 20000))}`,
        C.ink,
        32,
        number,
      ) +
      text(160, 181, "隻主動買入，仍在 102 附近", C.muted, 10) +
      line(160, 203, 347, 203) +
      text(160, 234, "這次 · 上方掛單很薄", C.buy, 11) +
      text(
        160,
        273,
        `${size(activeVolume(state, "buy", 23000, 29000))}`,
        C.buy,
        32,
        number,
      ) +
      text(
        160,
        299,
        `隻主動買入，走到 ${price(state.candle.high)}`,
        C.muted,
        10,
      );
  } else if (p.scene === 0 || p.scene === 1) {
    svg +=
      text(157, 130, "一分鐘的行情", C.muted, 12) +
      text(157, 164, "先看形狀", C.ink, 25) +
      text(157, 190, "再走進每一筆成交。", C.muted, 12);
  } else if (p.mode === "closing" || p.scene === 11) {
    const finished = p.time >= 60000;
    svg +=
      text(
        160,
        121,
        finished ? "這一分鐘留下的紀錄" : "同一段行情",
        C.muted,
        12,
      ) +
      text(
        160,
        158,
        finished ? "高點留下，價格退回。" : "形狀裡，有成交的經過。",
        C.ink,
        20,
      ) +
      text(160, 188, `開盤 ${price(state.candle.open)}`, C.muted, 12, number);
    if (finished)
      svg += text(
        160,
        216,
        `收盤 ${price(state.candle.close)}`,
        C.buy,
        17,
        number,
      );
  }
  if (state.candle.high > state.candle.close + 0.5) {
    svg +=
      line(
        530,
        y(state.candle.high),
        636,
        y(state.candle.high),
        C.sell,
        'stroke-opacity=".45"',
      ) +
      text(650, y(state.candle.high) - 7, "最高成交", C.muted, 10) +
      text(
        650,
        y(state.candle.high) + 14,
        price(state.candle.high),
        C.sell,
        19,
        number,
      );
    if (
      p.scene >= 10 &&
      state.candle.high - Math.max(state.candle.close, state.candle.open) > 2
    )
      svg +=
        line(
          594,
          y(state.candle.high) + 10,
          594,
          y(Math.max(state.candle.open, state.candle.close)) - 10,
          C.sell,
          'stroke-opacity=".3"',
        ) +
        text(
          608,
          (y(state.candle.high) +
            y(Math.max(state.candle.open, state.candle.close))) /
            2,
          "上影線",
          C.sell,
          11,
        );
  }
  return svg;
}

export function drawWickDesktop({ story, state, ...p }) {
  const camera = desktopCamera(state, p),
    { y } = camera;
  const alpha = bookAlpha(p, camera);
  const latest = state.trades.at(-1);
  const age = latest ? desktopEventAge(p, latest.at) : Infinity;
  const pulse = p.reduced ? 0 : 1 - ease(age / 750);
  const direction = latest?.side === "sell" ? C.sell : C.buy;
  const color = state.candle.close >= state.candle.open ? C.buy : C.down;
  let svg =
    '<defs><clipPath id="wick-price-clip"><rect x="105" y="62" width="790" height="244"/></clipPath><radialGradient id="wick-impact"><stop stop-color="#a0dfce" stop-opacity=".3"/><stop offset="1" stop-color="#a0dfce" stop-opacity="0"/></radialGradient></defs>';
  const step =
    camera.max - camera.min > 12 ? 5 : camera.max - camera.min > 6 ? 2 : 0.5;
  for (
    let value = Math.ceil(camera.min / step) * step;
    value <= camera.max;
    value += step
  ) {
    const cy = y(value);
    if (cy < 67 || cy > 309) continue;
    svg +=
      line(115, cy, 888, cy, C.grid, 'stroke-dasharray="2 6" opacity=".3"') +
      text(905, cy + 3, price(value), C.muted, 9, number);
  }
  // The same nine-candle panorama returns at the end of the original minute.
  let candles = "";
  if (p.scene < 2 || p.mode === "closing" || p.scene === 11) {
    CONTEXT.forEach((c, i) => {
      candles += group(
        candle(
          c,
          172 + i * 82,
          20,
          y,
          c.close >= c.open ? C.buy : C.sell,
          `data-context-index="${i}"`,
        ),
        (1 - p.zoom) * 0.72,
      );
    });
    WICK_AFTER.forEach((c, i) => {
      candles += group(
        candle(
          c,
          582 + i * 82,
          20,
          y,
          c.close >= c.open ? C.buy : C.sell,
          `data-context-index="${i + 5}"`,
        ),
        (1 - p.zoom) * 0.72,
      );
    });
  }
  candles += candle(state.candle, 500, 28, y, color);
  if (pulse > 0 && alpha > 0)
    candles += group(
      `<circle cx="500" cy="${y(state.price)}" r="38" fill="url(#wick-impact)"/>` +
        line(
          480,
          y(state.price),
          520,
          y(state.price),
          C.ink,
          'stroke-width="3"',
        ),
      pulse,
      `data-execution-at="${latest.at}"`,
    );
  svg += `<g clip-path="url(#wick-price-clip)">${candles}</g>`;
  svg += group(overview(state, p, camera), 1 - alpha);
  if (alpha > 0) {
    svg += group(book(story, state, p, camera), alpha);
    svg += group(receipt(state, p), alpha);
    svg += text(
      500,
      41,
      y(state.candle.high) < 62
        ? `↑ 最高 ${price(state.candle.high)}`
        : "同一根 K 線",
      C.muted,
      10,
      middle,
    );
    svg += text(
      500,
      318,
      y(OPEN) > 310 ? `↓ 開盤 ${price(OPEN)}` : `開盤 ${price(OPEN)}`,
      C.muted,
      9,
      middle,
    );
    if (latest && age < 650 && !p.reduced) {
      const travel = ease(age / 500),
        startX = latest.side === "buy" ? 628 : 372;
      svg += group(
        line(
          startX,
          y(latest.price),
          500,
          y(latest.price),
          direction,
          'stroke-width="1.5"',
        ) +
          `<circle cx="${mix(startX, 500, travel)}" cy="${y(latest.price)}" r="3" fill="${direction}"/>`,
        (1 - ease(age / 650)) * alpha,
        `data-fill-pulse="${latest.at}"`,
      );
    }
  }
  const cy = y(state.price);
  svg += group(
    line(516, cy, 545, cy, color, 'stroke-opacity=".65"') +
      rect(
        545,
        cy - 11,
        65,
        22,
        "#182d2c",
        `rx="5" stroke="${color}" stroke-opacity="${0.45 + pulse * 0.5}"`,
      ) +
      text(
        577.5,
        cy + 4,
        price(state.price),
        C.ink,
        14,
        `${number} ${middle} data-latest-price="${state.price}"`,
      ),
    p.scene < 2 || p.mode === "closing" || p.scene === 11 ? alpha : 1,
  );
  if (p.mode.includes("rewind"))
    svg +=
      rect(380, 154, 240, 75, "#0c171bf5", 'rx="9" stroke="#38504e"') +
      text(500, 184, "回到同一分鐘的起點", C.ink, 17, middle) +
      text(500, 208, "時間倒回 · 14:32", C.muted, 11, middle);
  return { svg, width: 1000, height: 400, viewBox: "0 0 1000 400" };
}
