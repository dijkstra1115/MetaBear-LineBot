import { TIMING, ease } from "./slippage-model.js";
const C = {
  ink: "#e1ebe7",
  muted: "#8ea8af",
  faint: "#536e76",
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
const mid = 'text-anchor="middle"',
  number = `${mid} class="number"`;
export const priceY = (price) => 278 - (price - 101) * 46;
export function cameraAt(t, reduced = false) {
  const ramp = (at, duration) =>
    reduced ? Number(t >= at + duration) : ease((t - at) / duration);
  const deep = ramp(5000, 1100) * (1 - ramp(9300, 1700));
  const shallow =
    ramp(11000, 1300) *
    (1 - ramp(TIMING.zoomOut, TIMING.panorama - TIMING.zoomOut));
  return {
    deep,
    shallow,
    scale: 1 + 0.3 * (deep + shallow),
    x: 500 + 325 * deep - 325 * shallow,
  };
}
export function drawSlippage({ state, playhead: t, reduced }) {
  const camera = cameraAt(t, reduced);
  const show = (at, duration = 500) =>
    reduced ? Number(t >= at) : ease((t - at) / duration);
  let world = "",
    overlay = "";
  for (const [kind, x] of [
    ["deep", 250],
    ["shallow", 750],
  ]) {
    const data = state[kind],
      shallow = kind === "shallow",
      // Fade the whole non-focused book before its text crosses the crop.
      dim = 1 - ease(camera[shallow ? "deep" : "shallow"] / 0.1);
    const screenX = camera.x + (x - 500) * camera.scale;
    let panel = "",
      fixed = text(
        screenX - 170,
        79,
        shallow ? "較淺的委託簿" : "較深的委託簿",
        C.ink,
        17,
      );
    fixed += text(
      screenX + 164,
      79,
      "市價買 30",
      C.buy,
      11,
      'text-anchor="end"',
    );
    panel +=
      `<g opacity="${1 - camera.deep - camera.shallow}">` +
      text(x - 151, 109, "元", C.faint, 9, mid) +
      text(x + 158, 109, "掛賣 / 隻", C.faint, 9, mid) +
      "</g>";
    for (const row of [...data.asks].reverse()) {
      const y = priceY(row.price),
        fill = data.fills.find((f) => f.price === row.price),
        age = fill ? t - fill.playedAt : Infinity;
      const flash = reduced ? 0 : 1 - ease(age / 1100);
      panel += line(x - 129, y, x + 128, y, C.grid, 'stroke-dasharray="2 5"');
      panel += text(
        x - 151,
        y + 5,
        row.price,
        row.price === 101 ? C.ink : C.muted,
        14,
        number,
      );
      panel += rect(x - 125, y - 15, row.size * 6, 30, "#24313a", 'rx="4"');
      if (row.size === 0)
        panel += rect(
          x - 125,
          y - 15,
          240,
          30,
          "none",
          'rx="4" stroke="#355058" stroke-dasharray="4 6" stroke-opacity=".5"',
        );
      panel += rect(
        x - 125,
        y - 15,
        row.remaining * 6,
        30,
        C.sell,
        `rx="4" fill-opacity="${0.4 + 0.25 * flash}" data-${kind}-ask="${row.price}" data-remaining="${row.remaining}"`,
      );
      if (fill) {
        panel += rect(
          x - 125 + row.remaining * 6,
          y - 15,
          fill.size * 6,
          30,
          C.buy,
          'rx="3" fill-opacity=".25"',
        );
        panel += text(
          x - 125 + (row.remaining + fill.size / 2) * 6,
          y + 4,
          `買 ${fill.size}`,
          C.buy,
          fill.size < 10 ? 8 : 11,
          `${mid} data-fill-price="${row.price}" data-fill-size="${fill.size}"`,
        );
      }
      panel += text(
        x + 158,
        y + 5,
        row.remaining,
        row.remaining ? C.sell : C.faint,
        16,
        number,
      );
      if (
        shallow &&
        row.price === 103 &&
        t >= TIMING.shallowSecond &&
        t < TIMING.zoomOut
      )
        panel += text(x - 4, y + 4, "沒有掛賣", C.faint, 10, mid);
    }
    const nextTimes = shallow
      ? [TIMING.shallowFirst, TIMING.shallowSecond, TIMING.shallowThird]
      : [TIMING.deepFill];
    const nextIndex = nextTimes.findIndex((at) => at > t && at - t < 950);
    if (nextIndex >= 0 && !reduced) {
      const p = ease(1 - (nextTimes[nextIndex] - t) / 950),
        from = nextIndex ? priceY([101, 102][nextIndex - 1]) : 330,
        to = priceY(shallow ? [101, 102, 104][nextIndex] : 101);
      panel += `<circle cx="${x - 135}" cy="${from + (to - from) * p}" r="5" fill="${C.buy}"/>`;
    }
    if (data.fills.length) {
      const firstY = priceY(data.fills[0].price),
        lastY = priceY(data.last.price);
      panel += line(
        x - 135,
        firstY,
        x - 135,
        lastY,
        C.buy,
        'stroke-width="2" stroke-opacity=".7"',
      );
      panel += `<circle cx="${x - 135}" cy="${lastY}" r="4" fill="${C.buy}"/>`;
    }
    fixed += rect(
      screenX - 175,
      327,
      350,
      58,
      "#13252b",
      'rx="8" stroke="#29424a"',
    );
    fixed += text(
      screenX - 156,
      351,
      `已成交 ${data.filled} / 30`,
      C.muted,
      11,
    );
    fixed += text(screenX - 156, 370, "成交均價", C.faint, 10);
    fixed += text(
      screenX + 153,
      366,
      data.avg === null ? "—" : data.avg.toFixed(2),
      C.ink,
      28,
      `text-anchor="end" class="number" data-${kind}-average="${data.avg}"`,
    );
    world += `<g data-book="${kind}" opacity="${dim}">${panel}</g>`;
    overlay += `<g data-book-labels="${kind}" opacity="${dim}">${fixed}</g>`;
  }
  let svg =
    text(
      64,
      31,
      "SAME ORDER · DIFFERENT DEPTH",
      C.muted,
      10,
      'letter-spacing="2"',
    ) +
    text(
      936,
      31,
      "預期基準：送單前最優賣價 101 元",
      C.muted,
      11,
      'text-anchor="end"',
    );
  svg += `<defs><clipPath id="slippage-window"><rect x="52" y="47" width="896" height="340" rx="8"/></clipPath></defs><g clip-path="url(#slippage-window)"><g data-camera-scale="${camera.scale}" transform="translate(${camera.x} 215) scale(${camera.scale}) translate(-500 -215)">${world}</g>${overlay}</g>`;
  const resultAlpha = show(TIMING.panorama, 650);
  svg +=
    `<g opacity="${1 - resultAlpha}">` +
    rect(64, 397, 9, 9, C.sell, 'fill-opacity=".6"') +
    text(80, 405, "剩餘掛賣", C.muted, 10) +
    rect(155, 397, 9, 9, C.buy, 'fill-opacity=".5"') +
    text(171, 405, "本次已買到", C.muted, 10) +
    text(
      936,
      405,
      "相同數量 · 不同可見深度 · 教學慢放",
      C.faint,
      10,
      'text-anchor="end"',
    ) +
    "</g>";
  svg +=
    `<g opacity="${resultAlpha}">` +
    text(64, 406, "滑價不含手續費 · 兩次獨立模擬", C.faint, 10) +
    text(
      650,
      406,
      "102.50 − 101.00",
      C.ink,
      15,
      'text-anchor="end" class="number"',
    ) +
    text(
      936,
      406,
      "=  每隻 +1.50 元",
      C.sell,
      18,
      'text-anchor="end" class="number"',
    ) +
    "</g>";
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
