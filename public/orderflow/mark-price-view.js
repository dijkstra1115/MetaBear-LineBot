import { TIMING, clamp, ease, money } from "./mark-price-model.js";
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
export const priceY = (price) => 132 + (100 - price) * 21;
export const timeX = (at) => 120 + (at / 23500) * 610;
export function cameraAt(playhead, reduced = false) {
  const into = reduced
    ? Number(playhead >= TIMING.focused)
    : ease((playhead - TIMING.zoomIn) / (TIMING.focused - TIMING.zoomIn));
  const out = reduced
    ? Number(playhead >= TIMING.panorama)
    : ease((playhead - TIMING.zoomOut) / (TIMING.panorama - TIMING.zoomOut));
  const focus = into * (1 - out);
  return { focus, scale: 1 + 0.28 * focus, x: 450 + 35 * focus, y: 215 };
}
export function drawMarkPrice({ state, playhead, reduced }) {
  const { focus, scale, x, y } = cameraAt(playhead, reduced);
  const show = (at, duration = 550) =>
    reduced ? Number(playhead >= at) : ease((playhead - at) / duration);
  let world = "";
  for (const price of [100, 96, 92]) {
    world += line(
      120,
      priceY(price),
      758,
      priceY(price),
      C.grid,
      'stroke-dasharray="2 7" stroke-opacity=".5"',
    );
    world += text(
      100,
      priceY(price) + 4,
      price,
      C.faint,
      10,
      'text-anchor="end"',
    );
  }
  for (const kind of ["last", "mark"]) {
    const color = kind === "last" ? C.sell : C.buy;
    let path = "";
    for (const [i, observation] of state.observations.entries()) {
      const px = timeX(observation.at),
        py = priceY(observation[kind]);
      path += i ? ` H${px} V${py}` : `M${px} ${py}`;
      if (i && observation[kind] !== state.observations[i - 1][kind])
        world += `<circle cx="${px}" cy="${py}" r="2.6" fill="${color}" data-series="${kind}" data-at="${observation.at}" data-price="${observation[kind]}"/>`;
    }
    const tailX = timeX(Math.min(23500, Math.max(state.at, playhead)));
    path += ` H${tailX}`;
    world += `<path d="${path}" fill="none" stroke="${color}" stroke-width="${kind === "mark" ? 2.5 : 1.8}" stroke-linejoin="round"/>`;
    const px = timeX(state.at),
      py = priceY(state[kind]);
    world += `<circle cx="${px}" cy="${py}" r="4" fill="${color}"/>`;
  }
  if (state.deviated) {
    const px = timeX(state.at) + 17,
      top = priceY(state.mark),
      bottom = priceY(state.last);
    world += line(
      px,
      top + 8,
      px,
      bottom - 8,
      C.muted,
      'stroke-dasharray="3 5" stroke-opacity=".7"',
    );
    world += text(px + 15, (top + bottom) / 2 + 4, "短暫偏離", C.ink, 12);
  }
  world +=
    text(120, 334, "剛才", C.faint, 10) +
    text(754, 334, "時間 →", C.faint, 10, 'text-anchor="end"');
  let svg = `<defs><clipPath id="mark-price-window"><rect x="58" y="93" width="884" height="253" rx="6"/></clipPath></defs>`;
  svg += text(
    64,
    32,
    "LAST PRICE / MARK PRICE",
    C.muted,
    10,
    'letter-spacing="2.2"',
  );
  svg += text(
    936,
    32,
    "教學合成行情 · 以 Bybit 機制為例",
    C.muted,
    10,
    'text-anchor="end"',
  );
  svg += text(
    64,
    77,
    `最後成交  ${money(state.last)}`,
    C.sell,
    18,
    'class="number"',
  );
  svg += text(
    936,
    77,
    `標記價格  ${money(state.mark)}`,
    C.buy,
    18,
    'text-anchor="end" class="number"',
  );
  svg += `<g clip-path="url(#mark-price-window)"><g data-camera-scale="${scale}" transform="translate(${x} ${y}) scale(${scale}) translate(-450 -215)">${world}</g></g>`;
  const reference = show(TIMING.reference);
  svg += group(
    rect(
      246,
      360,
      178,
      29,
      "#192b30",
      'rx="14" stroke="#486265" stroke-opacity=".4"',
    ) +
      text(335, 379, "多市場指數等參考", C.muted, 11, mid) +
      line(433, 374, 491, 374, C.faint) +
      `<path d="M485 370 L491 374 L485 378" fill="none" stroke="${C.faint}"/>` +
      text(507, 379, "標記價格", C.buy, 12) +
      line(574, 374, 627, 374, C.faint) +
      `<path d="M621 370 L627 374 L621 378" fill="none" stroke="${C.faint}"/>` +
      text(643, 379, "風險估值", C.ink, 12),
    reference,
  );
  svg += text(64, 410, "教學合成行情 · 價格均為示例", C.faint, 10);
  svg += text(
    936,
    410,
    "標記價也會變動，且不保證成交於此價",
    C.faint,
    10,
    'text-anchor="end"',
  );
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
