import { TIMING, clamp, ease, money, percent } from "./liquidation-model.js";
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
export const marginWidth = (remaining) => 480 * clamp(remaining / 100);
export function cameraAt(playhead, reduced = false) {
  const into = reduced
    ? Number(playhead >= TIMING.focused)
    : ease((playhead - TIMING.zoomIn) / (TIMING.focused - TIMING.zoomIn));
  const out = reduced
    ? Number(playhead >= TIMING.panorama)
    : ease((playhead - TIMING.zoomOut) / (TIMING.panorama - TIMING.zoomOut));
  const focus = into * (1 - out);
  return { focus, scale: 1 + 0.12 * focus, x: 500 - 10 * focus, y: 220 };
}
export function drawLiquidation({ state, playhead, reduced }) {
  const { focus, scale, x, y } = cameraAt(playhead, reduced);
  const show = (at, duration = 500) =>
    reduced ? Number(playhead >= at) : ease((playhead - at) / duration);
  const age = playhead - state.quote.at;
  const flash = reduced || state.quote.at === 0 ? 0 : 1 - ease(age / 800);
  const ready = show(1600);
  let world = text(170, 112, "保證金", C.muted, 12, mid);
  world += `<circle cx="170" cy="174" r="45" fill="#193033" stroke="${C.buy}" stroke-opacity=".5"/>`;
  world +=
    text(170, 181, "100", C.ink, 29, `${mid} class="number"`) +
    text(170, 238, "元", C.muted, 12, mid);
  world += group(
    line(232, 174, 336, 174, C.faint) +
      rect(263, 158, 46, 32, "#18292f", 'rx="16"') +
      text(286, 180, "5×", C.ink, 20, mid),
    ready,
  );
  let units = text(602, 109, "500 元開倉部位", C.ink, 23, mid);
  for (let i = 0; i < 5; i++) {
    const px = 362 + i * 98;
    units += rect(
      px,
      142,
      88,
      65,
      "#1b3135",
      `rx="6" stroke="${C.buy}" stroke-opacity=".35"`,
    );
    units +=
      text(px + 44, 169, "100", C.ink, 22, `${mid} class="number"`) +
      text(px + 44, 190, "元開倉值", C.muted, 10, mid);
    units += group(
      text(px + 44, 230, `−${money(state.loss / 5)}`, C.sell, 18, mid) +
        line(
          px + 44,
          238,
          px + 44,
          265,
          C.sell,
          `stroke-opacity="${0.22 + flash * 0.5}" stroke-dasharray="3 4"`,
        ),
      show(TIMING.drop),
    );
  }
  world += group(units, ready);
  world += group(
    text(170, 286, "市場跌幅", C.muted, 12, mid) +
      text(
        170,
        329,
        `−${percent(state.marketDrop)}%`,
        state.loss ? C.sell : C.ink,
        34,
        `${mid} class="number" data-market-drop="${state.marketDrop}"`,
      ),
    show(3000),
  );
  const remaining = marginWidth(state.equity);
  world += text(362, 276, "你的 100 元保證金", C.muted, 12);
  world += rect(362, 294, 480, 26, "#533f2d", 'rx="3" fill-opacity=".68"');
  world += rect(
    362,
    294,
    remaining,
    26,
    C.buy,
    `rx="3" fill-opacity=".78" data-remaining="${state.equity}"`,
  );
  for (let i = 1; i < 4; i++)
    world += line(
      362 + i * 120,
      294,
      362 + i * 120,
      320,
      "#10191e",
      'stroke-width="2"',
    );
  world += text(
    362,
    345,
    `剩 ${money(state.equity)} 元`,
    C.buy,
    20,
    'class="number"',
  );
  world += text(
    842,
    345,
    `已虧 ${money(state.loss)} 元`,
    C.sell,
    20,
    'text-anchor="end" class="number"',
  );
  let svg = `<defs><clipPath id="liquidation-window"><rect x="58" y="72" width="884" height="300" rx="6"/></clipPath></defs>`;
  svg += text(
    64,
    32,
    "5× · MARGIN AT RISK",
    C.muted,
    10,
    'letter-spacing="2.2"',
  );
  svg += text(
    936,
    32,
    state.triggered ? "觸發強平 · 非結算餘額" : "開倉價 100 元 · 5 隻合約",
    C.muted,
    11,
    'text-anchor="end"',
  );
  svg += `<g clip-path="url(#liquidation-window)"><g data-camera-scale="${scale}" transform="translate(${x} ${y}) scale(${scale}) translate(-500 -220)">${world}</g></g>`;
  const ending = show(TIMING.trigger);
  svg += group(
    rect(
      295,
      47,
      410,
      30,
      "#352f24",
      'rx="15" stroke="#a38558" stroke-opacity=".35"',
    ) +
      text(
        500,
        67,
        `此例跌約 ${percent(state.marketDrop)}% → 已達強平門檻`,
        C.sell,
        13,
        mid,
      ),
    ending,
  );
  svg += group(
    line(630, 378, 894, 378, C.faint, 'stroke-dasharray="4 5"') +
      text(
        894,
        398,
        "−20%：只是假設不強平的歸零點",
        C.faint,
        10,
        'text-anchor="end"',
      ),
    show(TIMING.zoomOut),
  );
  svg += text(
    64,
    410,
    "線性逐倉做多 · 維持率示例 0.5% · 忽略費用 · 依標記價判定",
    C.faint,
    10,
  );
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
