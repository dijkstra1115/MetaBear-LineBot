import { TIMING, clamp, ease, rateLabel, signed } from "./funding-model.js";
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
export function cameraAt(playhead, reduced = false) {
  const into = reduced
    ? Number(playhead >= TIMING.focused)
    : ease((playhead - TIMING.zoomIn) / (TIMING.focused - TIMING.zoomIn));
  const out = reduced
    ? Number(playhead >= TIMING.panorama)
    : ease((playhead - TIMING.zoomOut) / (TIMING.panorama - TIMING.zoomOut));
  const focus = into * (1 - out);
  return { focus, scale: 1 + 0.13 * focus, x: 500, y: 216 };
}
export function drawFunding({ state, playhead, reduced }) {
  const { focus, scale, x, y } = cameraAt(playhead, reduced);
  const show = (at, duration = 550) =>
    reduced ? Number(playhead >= at) : ease((playhead - at) / duration);
  const direction = state.payer === "long" ? 1 : -1;
  const color = direction === 1 ? C.buy : C.sell;
  const seconds = Math.max(0, Math.ceil((state.cycle.at - playhead) / 1000));
  let world = "";
  for (const [side, cx, accent, net] of [
    ["多方", 225, C.buy, state.longNet],
    ["空方", 775, C.sell, state.shortNet],
  ]) {
    world += `<circle cx="${cx}" cy="194" r="69" fill="#17292e" stroke="${accent}" stroke-opacity=".4"/>`;
    world +=
      text(cx, 145, side, accent, 16, mid) +
      text(cx, 191, "10,000", C.ink, 30, `${mid} class="number"`) +
      text(cx, 216, "USDT 部位", C.muted, 11, mid) +
      text(cx, 244, "結算時仍持有", C.faint, 9, mid);
    world +=
      text(cx, 291, "本段資金費收支", C.muted, 11, mid) +
      text(
        cx,
        322,
        `${signed(net)} USDT`,
        net > 0 ? C.buy : net < 0 ? C.sell : C.ink,
        24,
        `${mid} class="number" data-cashflow="${net}"`,
      );
  }
  world += text(500, 113, state.cycle.label, C.muted, 12, mid);
  world += text(
    500,
    151,
    rateLabel(state.rate),
    color,
    28,
    `${mid} class="number"`,
  );
  const left = 324,
    right = 676;
  world += line(left, 200, right, 200, C.grid, 'stroke-width="1.5"');
  if (state.settled) {
    world += `<path d="M${direction === 1 ? left : right} 200 H${direction === 1 ? right : left}" fill="none" stroke="${color}" stroke-opacity=".8" stroke-width="2"/>`;
    world += `<path d="${direction === 1 ? `M668 194 L676 200 L668 206` : `M332 194 L324 200 L332 206`}" fill="none" stroke="${color}" stroke-width="2"/>`;
    const progress = reduced ? 1 : ease((playhead - state.cycle.at) / 1000);
    const dotX =
      direction === 1
        ? left + (right - left) * progress
        : right - (right - left) * progress;
    world += group(
      `<circle cx="${dotX}" cy="200" r="6" fill="${color}"/><circle cx="${dotX}" cy="200" r="12" fill="${color}" fill-opacity=".1"/>`,
      reduced ? 0 : 1 - ease((playhead - state.cycle.at - 850) / 450),
    );
    world +=
      rect(433, 176, 134, 49, "#122027", 'rx="12"') +
      text(
        500,
        207,
        `${state.amount} USDT`,
        C.ink,
        24,
        `${mid} class="number"`,
      );
  } else
    world +=
      rect(430, 180, 140, 39, "#122027", 'rx="12"') +
      text(500, 205, `結算倒數 ${seconds}`, C.muted, 15, mid);
  world += group(
    text(
      500,
      255,
      `10,000 × ${Math.abs(state.rate * 100).toFixed(2)}% = ${state.amount}`,
      C.muted,
      14,
      mid,
    ),
    show(TIMING.zoomIn),
  );
  let svg = `<defs><clipPath id="funding-window"><rect x="58" y="73" width="884" height="277" rx="6"/></clipPath></defs>`;
  svg += text(
    64,
    32,
    "FUNDING · BETWEEN POSITIONS",
    C.muted,
    10,
    'letter-spacing="2"',
  );
  svg += text(
    936,
    32,
    "部位固定 · 兩次示例結算",
    C.muted,
    11,
    'text-anchor="end"',
  );
  svg += `<g clip-path="url(#funding-window)"><g data-camera-scale="${scale}" transform="translate(${x} ${y}) scale(${scale}) translate(-500 -216)">${world}</g></g>`;
  for (const [index, settlement] of state.settlements.entries()) {
    const cx = 350 + index * 300;
    svg += group(
      rect(
        cx - 136,
        364,
        272,
        29,
        "#16262c",
        'rx="14" stroke="#415c62" stroke-opacity=".4"',
      ) +
        text(
          cx,
          383,
          `${rateLabel(settlement.rate)}　${settlement.rate > 0 ? "多 → 空" : "空 → 多"}　${Math.abs(settlement.long)} USDT`,
          C.muted,
          11,
          mid,
        ),
      show(settlement.at, 450),
      `data-settlement-at="${settlement.at}"`,
    );
  }
  svg += text(
    64,
    410,
    "教學用 USDT 永續 · 數量 100 × 標記價 100 USDT",
    C.faint,
    9,
  );
  svg += text(
    936,
    410,
    "以 Bybit 機制為例 · 結算間隔依合約而異",
    C.faint,
    9,
    'text-anchor="end"',
  );
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
