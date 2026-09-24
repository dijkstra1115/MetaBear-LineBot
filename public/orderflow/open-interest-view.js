import { TIMING, clamp, ease, positionLabel } from "./open-interest-model.js";
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
const group = (svg, opacity = 1, attrs = "") =>
  `<g opacity="${clamp(opacity)}" ${attrs}>${svg}</g>`;
const mid = 'text-anchor="middle"';
export const columnX = (index) => 500 + (index - 2) * 720;
export const priceY = (price) => 120 - (price - 102) * 100;
export const oiY = (oi, focus = 0) => 760 - (oi - 2) * (120 - 84 * focus);
export const tradeX = (row) => columnX(row.barIndex) - 180 + row.tick * 120;
export function cameraAt(playhead, reduced = false) {
  const into = reduced
    ? Number(playhead >= TIMING.focused)
    : ease((playhead - TIMING.zoomIn) / (TIMING.focused - TIMING.zoomIn));
  const out = reduced
    ? Number(playhead >= TIMING.panorama)
    : ease((playhead - TIMING.zoomOut) / (TIMING.panorama - TIMING.zoomOut));
  const focus = into * (1 - out);
  const scale = 0.25 + 0.75 * focus;
  return {
    focus,
    scale,
    x: 500,
    y: 220,
    originX: 500,
    originY: 760 - (102.5 + 7.5 * focus) / scale,
  };
}
export function drawOpenInterest({ state, playhead, reduced }) {
  const camera = cameraAt(playhead, reduced),
    { focus, scale, x, y, originX, originY } = camera;
  const sy = (wy) => y + (wy - originY) * scale;
  const show = (at, duration = 500) =>
    reduced ? Number(playhead >= at) : ease((playhead - at) / duration);
  let world = "";
  for (const bar of state.bars) {
    const cx = columnX(bar.index),
      color = bar.close >= bar.open ? C.buy : C.sell;
    let candle = line(
      cx,
      priceY(bar.high),
      cx,
      priceY(bar.low),
      color,
      'stroke-width="5"',
    );
    candle += rect(
      cx - 42,
      Math.min(priceY(bar.open), priceY(bar.close)),
      84,
      Math.max(5, Math.abs(priceY(bar.close) - priceY(bar.open))),
      color,
      'rx="4" fill-opacity=".82"',
    );
    candle += text(cx, 990, bar.label, C.muted, 39, mid);
    world += group(
      candle,
      bar.index === 2 ? 1 : 1 - 0.9 * focus,
      `data-candle="${bar.index}" data-open="${bar.open}" data-close="${bar.close}"`,
    );
  }
  // These are completed historical bars, never labelled as a live stream.
  let historicalPath = "";
  for (const [index, row] of state.history.entries())
    historicalPath += index
      ? ` H${tradeX(row)} V${oiY(row.after.oi, focus)}`
      : `M${tradeX(row)} ${oiY(row.after.oi, focus)}`;
  world += group(
    `<path data-history-oi="true" d="${historicalPath}" fill="none" stroke="${C.buy}" stroke-width="5" stroke-linejoin="round"/>`,
    1 - focus,
  );
  world += group(
    rect(
      240,
      -120,
      520,
      990,
      "#98d1bc",
      'rx="26" fill-opacity=".035" stroke="#a0dfce" stroke-width="3" stroke-opacity=".3"',
    ),
    1 - focus,
  );
  let selectedPath = `M240 ${oiY(state.initialOi, focus)}`;
  const selected = state.replay ? state.trades : state.bars[2].rows;
  for (const row of selected)
    selectedPath += ` H${tradeX(row)} V${oiY(row.after.oi, focus)}`;
  const selectedEnd =
    state.replay && selected.length < 4
      ? selected.length
        ? tradeX(selected.at(-1)) + 20
        : 300
      : 760;
  selectedPath += ` H${selectedEnd}`;
  let series = `<path data-selected-oi="true" d="${selectedPath}" fill="none" stroke="${C.buy}" stroke-width="${5 - 2.5 * focus}" stroke-linejoin="round"/>`;
  for (const row of selected)
    series += `<circle cx="${tradeX(row)}" cy="${oiY(row.after.oi, focus)}" r="${8 - 3 * focus}" fill="${C.buy}" data-replay-tick="${row.tick}" data-oi="${row.after.oi}"/>`;
  world += series;
  for (let index = 0; index < 4; index++) {
    const cx = 320 + index * 120,
      filled = selected.length > index;
    world += group(
      text(
        cx,
        810,
        String(index + 1).padStart(2, "0"),
        filled ? C.ink : C.faint,
        12,
        mid,
      ),
      focus,
    );
  }
  const active = state.active,
    rowPositions = state.executed
      ? active.after.positions
      : active.before.positions;
  const age = playhead - active.at,
    progress = reduced ? 1 : ease(age / 950),
    flash = reduced || age < 0 ? 0 : 1 - ease(age / 1000);
  let detail = text(
    500,
    504,
    `第 ${active.index + 1} 筆 · ${active.label}`,
    C.muted,
    13,
    mid,
  );
  const actor = (cx, role, account, action, color) => {
    const value = rowPositions[account] ?? 0;
    return (
      text(cx, 538, `${role} · ${account}`, color, 12, mid) +
      text(cx, 569, action, C.ink, 22, mid) +
      `<circle cx="${cx}" cy="614" r="29" fill="#192c31" stroke="${color}" stroke-opacity=".55"/>` +
      text(cx, 622, account, C.ink, 23, mid) +
      text(
        cx,
        670,
        positionLabel(value),
        color,
        14,
        `${mid} data-account="${account}" data-position="${value}"`,
      )
    );
  };
  detail += actor(240, "買方", active.buyer, active.buyerLabel, C.buy);
  detail += actor(760, "賣方", active.seller, active.sellerLabel, C.sell);
  detail +=
    line(283, 614, 436, 614, C.grid, 'stroke-dasharray="3 6"') +
    line(564, 614, 717, 614, C.grid, 'stroke-dasharray="3 6"');
  // Moving positions pass behind the opaque OI card, keeping its count legible.
  if (state.executed && !reduced && age < 1200) {
    const movingDot = (px, color) =>
      `<circle cx="${px}" cy="614" r="7" fill="${color}"/><circle cx="${px}" cy="614" r="14" fill="${color}" fill-opacity=".12"/>`;
    let motion = "";
    if (active.delta === 1)
      motion =
        movingDot(283 + 153 * progress, C.buy) +
        movingDot(717 - 153 * progress, C.sell);
    else if (active.delta === -1)
      motion =
        movingDot(436 - 153 * progress, C.buy) +
        movingDot(564 + 153 * progress, C.sell);
    else {
      const towardBuyer = active.buyerAction === "open";
      const px = towardBuyer ? 717 - 434 * progress : 283 + 434 * progress;
      motion = movingDot(px, towardBuyer ? C.buy : C.sell);
    }
    detail += group(motion, 1, 'data-position-motion="true"');
  }
  detail += rect(
    442,
    547,
    116,
    115,
    "#1b3035",
    `rx="14" data-oi-card="true" stroke="#a0dfce" stroke-opacity="${0.35 + 0.3 * flash}"`,
  );
  detail +=
    text(500, 570, "未平倉量", C.muted, 11, mid) +
    text(
      500,
      618,
      `${state.oi}`,
      C.ink,
      43,
      `${mid} class="number" data-open-contracts="${state.oi}"`,
    ) +
    text(500, 643, "口 · OI", C.muted, 11, mid);
  const delta =
    active.delta > 0 ? "+1 口" : active.delta < 0 ? "−1 口" : "不變";
  detail += text(
    500,
    691,
    state.executed
      ? `${active.before.oi} → ${active.after.oi} · ${delta}`
      : `成交前 · OI ${active.before.oi}`,
    state.executed ? C.buy : C.muted,
    16,
    mid,
  );
  world += group(detail, focus * show(TIMING.reset, 450));
  let svg = `<defs><clipPath id="oi-window"><rect x="58" y="52" width="884" height="342" rx="6"/></clipPath></defs>`;
  svg += text(64, 32, "OPEN INTEREST", C.muted, 10, 'letter-spacing="2.4"');
  svg += text(
    936,
    32,
    focus > 0.7
      ? "14:30 選段回看 · 每筆 1 口"
      : "已完成的模擬行情 · 選中 14:30",
    C.muted,
    11,
    'text-anchor="end"',
  );
  svg += `<g clip-path="url(#oi-window)"><g data-camera-scale="${scale}" transform="translate(${x} ${y}) scale(${scale}) translate(${-originX} ${-originY})">${world}</g></g>`;
  svg += group(text(64, 72, "價格 / 元", C.muted, 11), 1 - focus);
  for (const price of [104, 102, 100]) {
    const py = sy(priceY(price));
    if (py >= 90 && py <= 250)
      svg += group(
        text(918, py + 4, price, C.faint, 10, 'data-price-tick="true"'),
        1 - focus,
      );
  }
  svg += group(text(64, 282, "OI / 口", C.muted, 11), 1 - focus);
  for (const oi of [1, 2, 3]) {
    const py = sy(oiY(oi, focus));
    if (py >= 280 && py <= 380) svg += text(918, py + 4, oi, C.faint, 10);
  }
  svg += group(
    text(64, 409, `本段成交 ${state.volume} 口`, C.ink, 12) +
      text(
        936,
        409,
        "多空各一邊，OI 只計一份合約",
        C.muted,
        10,
        'text-anchor="end"',
      ),
    ease((focus - 0.55) / 0.45),
    'data-footer="detail"',
  );
  svg += group(
    text(64, 409, "同一份歷史 · K 線與 OI 共用成交資料", C.faint, 10) +
      text(
        936,
        409,
        "四筆 OI 變化：+1／−1／0／0",
        C.muted,
        11,
        'text-anchor="end"',
      ),
    ease((0.45 - focus) / 0.45),
    'data-footer="macro"',
  );
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
