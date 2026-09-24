import { PRICES, TIMING, ease } from "./withdrawal-model.js";
const C = {
  ink: "#e1ebe7",
  muted: "#8ea8af",
  faint: "#58747c",
  grid: "#30464c",
  buy: "#a0dfce",
  sell: "#e0be8d",
};
const text = (x, y, v, c = C.muted, s = 12, a = "") =>
  `<text x="${x}" y="${y}" fill="${c}" font-size="${s}" ${a}>${v}</text>`;
const rect = (x, y, w, h, c, a = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" ${a}/>`;
const line = (x1, y1, x2, y2, c, a = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" ${a}/>`;
const mid = 'text-anchor="middle"',
  num = `${mid} class="number"`;
export const priceY = (price) => 274 - (price - 101) * 42;
export function cameraAt(t, reduced = false) {
  const r = (at, d) => (reduced ? Number(t >= at + d) : ease((t - at) / d));
  const focus =
    r(TIMING.zoomIn, TIMING.focused - TIMING.zoomIn) *
    (1 - r(TIMING.zoomOut, TIMING.panorama - TIMING.zoomOut));
  return { focus, scale: 1 + 0.27 * focus, x: 700 - 100 * focus, y: 218 };
}
export function drawWithdrawal({ state, playhead: t, reduced }) {
  const camera = cameraAt(t, reduced),
    show = (at, d = 500) => (reduced ? Number(t >= at) : ease((t - at) / d)),
    historyAlpha = 1 - ease(camera.focus / 0.1);
  let book = "",
    history = "";
  for (const price of PRICES) {
    const y = priceY(price),
      ask = state.asks.find((r) => r.price === price)?.size ?? 0,
      bid = state.bids.find((r) => r.price === price)?.size ?? 0;
    book += `<g opacity="${price === 99 ? historyAlpha : 1}">`;
    book +=
      line(
        455,
        y,
        903,
        y,
        C.grid,
        'stroke-dasharray="2 6" stroke-opacity=".7"',
      ) + text(649, y + 5, price, C.muted, 12, num);
    if (price >= 102) {
      book += rect(
        667,
        y - 14,
        Math.max(ask * 5.25, 0),
        28,
        C.sell,
        `rx="4" fill-opacity=".45" data-ask-price="${price}" data-size="${ask}"`,
      );
      book += text(
        908,
        y + 5,
        ask,
        ask ? C.sell : C.faint,
        14,
        'text-anchor="end" class="number"',
      );
    }
    if (bid) {
      book +=
        rect(
          583 - bid * 4.4,
          y - 14,
          bid * 4.4,
          28,
          C.buy,
          'rx="4" fill-opacity=".32"',
        ) +
        text(467, y + 5, bid, C.buy, 12, 'text-anchor="end" class="number"');
    }
    book += "</g>";
    history += line(
      88,
      y,
      385,
      y,
      C.grid,
      'stroke-dasharray="2 6" stroke-opacity=".5"',
    );
  }
  const lastY = priceY(state.price);
  book += line(
    460,
    lastY,
    903,
    lastY,
    C.ink,
    'stroke-opacity=".55" stroke-dasharray="6 5"',
  );
  const candle = state.candle,
    bodyTop = priceY(Math.max(candle.open, candle.close)),
    bodyBottom = priceY(Math.min(candle.open, candle.close)),
    fillAge = t - TIMING.buy,
    candlePulse =
      !reduced && fillAge >= 0 && fillAge < 1000 ? 1 - ease(fillAge / 1000) : 0;
  book += `<g data-candle-open="${candle.open}" data-candle-high="${candle.high}" data-candle-low="${candle.low}" data-candle-close="${candle.close}" data-last-price="${state.price}">`;
  book += line(
    622,
    priceY(candle.high),
    622,
    priceY(candle.low),
    C.buy,
    'stroke-width="2"',
  );
  book += rect(
    613,
    bodyTop - (bodyBottom === bodyTop ? 1 : 0),
    18,
    Math.max(2, bodyBottom - bodyTop),
    C.buy,
    'rx="2" fill-opacity=".85"',
  );
  if (candlePulse > 0) {
    book += rect(
      606,
      bodyTop - 7,
      32,
      Math.max(2, bodyBottom - bodyTop) + 14,
      "none",
      `rx="5" stroke="${C.buy}" stroke-opacity="${candlePulse * 0.8}" stroke-width="1.5"`,
    );
  }
  book += "</g>";
  for (const e of state.cancellations) {
    const age = t - e.at,
      progress = ease(age / 1300);
    if (!reduced && age < 1300) {
      book += `<g opacity="${1 - progress}" transform="translate(${progress * 54} ${-progress * 11})">${rect(667, priceY(e.price) - 14, e.size * 5.25, 28, C.sell, 'rx="4" fill-opacity=".38"')}${text(748, priceY(e.price) + 5, `撤回 ${e.size}`, C.sell, 11, mid)}</g>`;
    }
  }
  if (state.cancellations.length && t < TIMING.buy) {
    const top = priceY(103) - 21,
      bottom = priceY(102) + 21;
    book += rect(
      654,
      top,
      239,
      bottom - top,
      "none",
      'rx="6" stroke="#a98d68" stroke-dasharray="5 7" stroke-opacity=".65"',
    );
    book += text(
      774,
      (top + bottom) / 2 + 4,
      state.cancellations.length === 2 ? "掛賣撤走了" : "102 元空了",
      C.sell,
      12,
      mid,
    );
  }
  const incoming = show(18500, 1000) * (1 - show(TIMING.buy, 300));
  if (incoming > 0) {
    const p = reduced ? 0 : ease((t - 19900) / (TIMING.buy - 19900)),
      x = 472 + (738 - 472) * p,
      y = priceY(101) + (priceY(104) - priceY(101)) * p;
    book += `<g opacity="${incoming}">${rect(x - 47, y - 15, 94, 30, "#213e34", 'rx="15" stroke="#82bca7"')}${text(x, y + 5, "買入 5", C.buy, 12, mid)}</g>`;
  }
  if (t >= TIMING.buy) {
    if (!reduced && t - TIMING.buy < 1000)
      book += `<circle cx="738" cy="${priceY(104)}" r="${8 + ease((t - TIMING.buy) / 1000) * 25}" fill="none" stroke="${C.buy}" opacity="${1 - ease((t - TIMING.buy) / 1000)}"/>`;
  }
  const tx = (time) => 102 + (Math.min(time, 30000) / 30000) * 272;
  let path = "";
  for (const [i, f] of state.trades.entries())
    path += i
      ? ` H${tx(f.playedAt)} V${priceY(f.price)}`
      : `M${tx(f.playedAt)} ${priceY(f.price)}`;
  path += ` H${tx(t)}`;
  history += `<path d="${path}" fill="none" stroke="${C.ink}" stroke-width="1.8"/>`;
  for (const f of state.trades)
    history += `<circle cx="${tx(f.playedAt)}" cy="${priceY(f.price)}" r="4.5" fill="${C.buy}" data-trade-at="${f.playedAt}" data-trade-size="${f.size}"/>`;
  history +=
    text(92, 371, "先前", C.faint, 9) +
    text(385, 371, "現在", C.faint, 9, 'text-anchor="end"');
  let world = `<g opacity="${historyAlpha}" data-history>${history}</g>${book}`;
  let svg =
    text(
      64,
      31,
      "CANCELLED ORDERS · UNCHANGED LAST TRADE",
      C.muted,
      9,
      'letter-spacing="1.5"',
    ) + text(936, 31, "一段合成委託簿紀錄", C.muted, 11, 'text-anchor="end"');
  svg += `<defs><clipPath id="withdraw-window"><rect x="52" y="94" width="896" height="280" rx="8"/></clipPath></defs><g clip-path="url(#withdraw-window)"><g data-camera-scale="${camera.scale}" transform="translate(${camera.x} ${camera.y}) scale(${camera.scale}) translate(-700 -218)">${world}</g></g>`;
  const mapX = (x) => camera.x + (x - 700) * camera.scale;
  if (t >= TIMING.buy) {
    const fillLabelY = camera.y + (priceY(104) - 218) * camera.scale - 24;
    svg += text(
      mapX(767),
      fillLabelY,
      "成交 5",
      C.buy,
      12,
      `${mid} data-fill-label`,
    );
  }
  svg +=
    text(mapX(520), 86, "掛買 / 隻", C.buy, 11, mid) +
    text(mapX(635), 86, "K 線 / 元", C.muted, 10, mid) +
    text(mapX(774), 86, "掛賣 / 隻", C.sell, 11, mid);
  svg += `<g opacity="${historyAlpha}">${text(92, 86, "成交紀錄", C.ink, 13)}${text(385, 86, "只有成交才留下點", C.faint, 9, 'text-anchor="end"')}</g>`;
  svg +=
    rect(210, 382, 262, 28, "#172a30", 'rx="14"') +
    text(229, 402, "最新成交", C.muted, 10) +
    text(
      449,
      403,
      `${state.price} 元`,
      C.ink,
      19,
      'text-anchor="end" class="number" data-price-value',
    );
  svg +=
    rect(496, 382, 262, 28, "#172a30", 'rx="14"') +
    text(515, 402, "本段成交量", C.muted, 10) +
    text(
      735,
      403,
      `${state.volume} 隻`,
      C.ink,
      19,
      'text-anchor="end" class="number" data-volume-value',
    );
  if (t >= TIMING.cancelFirst && t < TIMING.buy)
    svg += text(922, 402, "都沒有變", C.sell, 11, 'text-anchor="end"');
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
