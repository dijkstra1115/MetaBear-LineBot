import { TIMING, clamp, ease } from "./absorption-story-model.js";
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
  num = `${mid} class="number"`;
export const priceY = (price) => 214 - (price - 101) * 92;
// The upper price row needs its event labels below the order, so the same
// camera can stay close without clipping incoming or completed fills.
export const eventLabelY = (price) => priceY(price) + (price >= 102 ? 48 : -37);
export function cameraAt(playhead, reduced = false) {
  const into = reduced
    ? Number(playhead >= TIMING.focused)
    : ease((playhead - TIMING.zoomIn) / (TIMING.focused - TIMING.zoomIn));
  const out = reduced
    ? Number(playhead >= TIMING.panorama)
    : ease((playhead - TIMING.zoomOut) / (TIMING.panorama - TIMING.zoomOut));
  const focus = into * (1 - out);
  return { focus, scale: 1 + 0.18 * focus, x: 620 - 72 * focus, y: 214 };
}
export function drawAbsorption({ story, state, playhead, reduced }) {
  const { focus, scale, x, y } = cameraAt(playhead, reduced);
  const show = (at, duration = 450) =>
    reduced ? Number(playhead >= at) : ease((playhead - at) / duration);
  let world = "";
  for (const price of [100, 101, 102]) {
    const py = priceY(price),
      selected = price === 101;
    const alpha =
      selected || price === state.price
        ? 1
        : 1 - (price === 100 ? 1 : 0.5) * focus;
    let row = line(
      82,
      py,
      922,
      py,
      C.grid,
      'stroke-opacity=".65" stroke-dasharray="2 7"',
    );
    row += text(562, py + 5, price, selected ? C.ink : C.muted, 15, num);
    if (price >= 101) {
      const qty = price === 101 ? state.remaining101 : state.remaining102;
      const initial = price === 101 ? story.initialSell : story.nextSell;
      row += rect(606, py - 23, initial * 3, 46, "#18292e", 'rx="4"');
      for (let unit = 0; unit < initial; unit += 10)
        row += line(
          606 + unit * 3,
          py - 23,
          606 + unit * 3,
          py + 23,
          C.sell,
          'stroke-opacity=".15"',
        );
      row += rect(
        606,
        py - 23,
        qty * 3,
        46,
        C.sell,
        `rx="4" fill-opacity=".48" data-ask-price="${price}" data-ask-size="${qty}"`,
      );
      row += text(877, py + 7, qty, C.ink, 22, num);
      if (!qty) row += text(698, py + 4, "這一檔已用完", C.muted, 12, mid);
    } else
      row +=
        rect(342, py - 16, 90, 32, C.buy, 'rx="4" fill-opacity=".18"') +
        text(390, py + 5, "掛買 30", C.muted, 12, mid);
    world += group(row, alpha);
  }
  world += text(742, 75, "等待成交的掛賣 / 隻", C.muted, 12, mid);
  world += text(490, 75, "這段的 K 線", C.muted, 11, mid);
  let pricePath = "";
  for (const [index, fill] of state.trades.entries()) {
    const px = 120 + index * 62,
      py = priceY(fill.price);
    pricePath += index ? ` H${px} V${py}` : `M${px} ${py}`;
    const age = playhead - fill.at;
    world += `<circle cx="${px}" cy="${py}" r="${4 + Math.sqrt(fill.size) * 0.65}" fill="${C.buy}" fill-opacity=".68" data-fill-at="${fill.at}" data-fill-size="${fill.size}"/>`;
    if (!reduced && age < 800)
      world += `<circle cx="${px}" cy="${py}" r="${10 + ease(age / 800) * 14}" fill="none" stroke="${C.buy}" opacity="${1 - ease(age / 800)}"/>`;
  }
  if (pricePath)
    world += `<path d="${pricePath} H485" fill="none" stroke="${C.buy}" stroke-opacity=".5" stroke-width="1.5"/>`;
  if (state.candle) {
    const top = priceY(state.candle.high),
      bottom = priceY(state.candle.low);
    world += line(490, top, 490, bottom, C.buy, 'stroke-width="2"');
    world += rect(
      479,
      top - (top === bottom ? 1 : 0),
      22,
      Math.max(2, bottom - top),
      C.buy,
      'rx="2" fill-opacity=".85"',
    );
  }
  const next = story.fills.find((fill) => fill.at > playhead);
  if (next && playhead >= next.at - 850 && !reduced) {
    const progress = ease((playhead - (next.at - 850)) / 850),
      labelY = eventLabelY(next.price);
    world += group(
      rect(240 + progress * 281, labelY - 18, 84, 26, "#223c3b", 'rx="13"') +
        text(282 + progress * 281, labelY, `買入 ${next.size}`, C.buy, 12, mid),
      Math.min(1, progress * 4),
    );
  }
  if (state.latest && playhead - state.latest.at < 1800) {
    const age = playhead - state.latest.at;
    world += group(
      text(
        700,
        eventLabelY(state.latest.price),
        `成交 ${state.latest.size}`,
        C.buy,
        13,
        mid,
      ),
      reduced ? 1 : 1 - ease((age - 1100) / 700),
    );
  }
  world += group(
    rect(
      472,
      184,
      438,
      60,
      "none",
      'rx="8" stroke="#d8bd87" stroke-opacity=".55"',
    ) + text(732, 266, "吸收 · 成交增加，價格停留", C.sell, 12, mid),
    show(14000) * (1 - show(TIMING.empty)),
  );

  let svg =
    '<defs><clipPath id="absorption-window"><rect x="56" y="57" width="888" height="270" rx="8"/></clipPath></defs>';
  svg += text(64, 32, "ABSORPTION / 101", C.muted, 10, 'letter-spacing="2.5"');
  svg += text(
    936,
    32,
    playhead < TIMING.empty ? "已知掛賣 80 · 沒有補單" : "掛賣有限，逐筆消耗",
    C.muted,
    11,
    'text-anchor="end"',
  );
  svg += `<g clip-path="url(#absorption-window)"><g data-camera-scale="${scale}" transform="translate(${x} ${y}) scale(${scale}) translate(-620 -214)">${world}</g></g>`;

  const row101 = state.rows.find((row) => row.price === 101),
    row102 = state.rows.find((row) => row.price === 102);
  svg += line(64, 338, 936, 338, C.grid, 'stroke-opacity=".7"');
  svg += text(64, 360, "成交足跡", C.muted, 11);
  svg += text(64, 386, "主動賣 / 主動買", C.faint, 10);
  svg +=
    text(274, 358, "101 元", C.muted, 11, mid) +
    text(274, 390, `0  /  ${row101?.buy ?? 0}`, C.buy, 24, num);
  svg += group(
    text(431, 358, "102 元", C.muted, 11, mid) +
      text(431, 390, `0  /  ${row102?.buy ?? 0}`, C.buy, 24, num),
    show(TIMING.higher),
  );
  svg += text(576, 360, "累積成交量", C.muted, 11);
  svg +=
    rect(576, 378, 260, 10, "#192b31", 'rx="5"') +
    rect(
      576,
      378,
      (260 * state.volume) / 88,
      10,
      C.buy,
      'rx="5" fill-opacity=".65"',
    );
  svg += text(
    884,
    390,
    `${state.volume} 隻`,
    C.ink,
    25,
    `${num} data-total-volume="${state.volume}"`,
  );
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
