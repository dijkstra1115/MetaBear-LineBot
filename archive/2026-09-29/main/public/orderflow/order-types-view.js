import { TIMING, ease } from "./order-types-model.js";
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
const mid = 'text-anchor="middle"';
const number = `${mid} class="number"`;
export const priceY = (price) => 252 - (price - 101) * 56;
export function cameraAt(t, reduced = false) {
  const ramp = (at, duration) =>
    reduced ? Number(t >= at + duration) : ease((t - at) / duration);
  const market = ramp(4000, 1200) * (1 - ramp(10300, 1700));
  const limit =
    ramp(12000, 1300) *
    (1 - ramp(TIMING.zoomOut, TIMING.panorama - TIMING.zoomOut));
  const focus = market + limit;
  return {
    market,
    limit,
    scale: 1 + 0.34 * focus,
    x: 500 + 335 * market - 335 * limit,
    y: 220,
  };
}
export function drawOrderTypes({ state, playhead: t, reduced }) {
  const camera = cameraAt(t, reduced);
  const show = (at, duration = 500) =>
    reduced ? Number(t >= at) : ease((t - at) / duration);
  let world = "",
    overlay = "";
  for (const [kind, x] of [
    ["market", 250],
    ["limit", 750],
  ]) {
    const data = state[kind],
      isLimit = kind === "limit";
    // Hide the non-focused order before its labels leave the stage edge.
    const dim = 1 - ease(camera[isLimit ? "market" : "limit"] / 0.1);
    let panel = rect(
      x - 185,
      64,
      370,
      318,
      "#101e24",
      'rx="12" stroke="#2b4148" stroke-opacity=".65"',
    );
    const screenX = camera.x + (x - 500) * camera.scale;
    let fixed = text(
      screenX - 157,
      79,
      isLimit ? "限價買入" : "市價買入",
      C.ink,
      17,
    );
    fixed += text(
      screenX + 157,
      79,
      isLimit ? "最高 101 元" : "依現有掛賣",
      isLimit ? C.buy : C.muted,
      11,
      'text-anchor="end"',
    );
    panel +=
      `<g opacity="${1 - camera.market - camera.limit}">` +
      text(x - 146, 119, "元", C.faint, 9, mid) +
      text(x + 142, 119, "掛賣 / 隻", C.faint, 9, mid) +
      "</g>";
    for (const row of [...data.asks].reverse()) {
      const y = priceY(row.price),
        last = data.last;
      const age =
        last && last.side === "buy" && last.price === row.price
          ? t - last.playedAt
          : Infinity;
      const flash = reduced ? 0 : 1 - ease(age / 800);
      const active = !isLimit || row.price <= state.limitPrice || t < 12000;
      panel += `<g opacity="${active ? 1 : 0.3}">`;
      panel += line(x - 127, y, x + 120, y, C.grid, 'stroke-dasharray="2 5"');
      panel += text(x - 146, y + 5, row.price, C.muted, 14, number);
      panel += rect(x - 115, y - 15, row.size * 6.4, 30, "#233039", 'rx="4"');
      panel += rect(
        x - 115,
        y - 15,
        row.remaining * 6.4,
        30,
        C.sell,
        `rx="4" fill-opacity="${0.42 + 0.3 * flash}" data-${kind}-ask="${row.price}" data-remaining="${row.remaining}"`,
      );
      panel += text(
        x + 142,
        y + 5,
        row.remaining,
        row.remaining ? C.sell : C.faint,
        16,
        number,
      );
      if (flash > 0)
        panel += text(
          x - 15,
          y - 24,
          `成交 ${last.size}`,
          C.buy,
          11,
          `${mid} opacity="${flash}"`,
        );
      panel += "</g>";
    }
    if (isLimit) {
      panel +=
        `<g opacity="${show(12000)}">` +
        line(
          x - 174,
          273,
          x + 173,
          273,
          C.buy,
          'stroke-dasharray="5 5" stroke-opacity=".65"',
        ) +
        text(x - 156, 290, "101 元價格上限", C.buy, 9) +
        "</g>";
    }
    const sent = t >= (isLimit ? TIMING.limitFill : TIMING.marketFirst);
    const upcoming = (
      isLimit
        ? [
            { playedAt: TIMING.limitFill, price: 101 },
            { playedAt: TIMING.arrival, price: 101 },
          ]
        : [
            { playedAt: TIMING.marketFirst, price: 101 },
            { playedAt: TIMING.marketSecond, price: 102 },
          ]
    ).find((e) => e.playedAt > t && e.playedAt - t < 850);
    if (upcoming && !reduced) {
      const p = ease(1 - (upcoming.playedAt - t) / 850),
        y = 316 + (priceY(upcoming.price) - 316) * p;
      panel += `<circle cx="${x}" cy="${y}" r="${7 - p * 3}" fill="${upcoming.playedAt === TIMING.arrival ? C.sell : C.buy}" opacity="${0.4 + p * 0.6}"/>`;
    }
    let badge = !sent
      ? "買入 30 隻"
      : data.resting
        ? `買 ${data.resting} 隻 · 等待中`
        : `已成交 ${data.filled} / 30`;
    if (isLimit && t >= TIMING.limitFill && t < TIMING.rest)
      badge = "已成交 10 / 30";
    if (isLimit && t >= TIMING.arrival && t < TIMING.arrival + 1800)
      badge = "再成交 8 · 等待 12";
    fixed += rect(
      screenX - 103,
      324,
      206,
      32,
      isLimit && data.resting ? "#19372f" : "#1b2c31",
      'rx="16" stroke="#54766a" stroke-opacity=".45"',
    );
    fixed += text(screenX, 345, badge, C.buy, 12, mid);
    fixed += `<g opacity="${show(isLimit ? TIMING.limitFill : TIMING.marketFirst)}">`;
    fixed +=
      text(screenX - 154, 378, "成交均價", C.muted, 10) +
      text(
        screenX + 154,
        379,
        data.avg === null ? "—" : `${data.avg.toFixed(2)} 元`,
        C.ink,
        17,
        `text-anchor="end" class="number" data-${kind}-average="${data.avg}"`,
      ) +
      "</g>";
    world += `<g data-book="${kind}" opacity="${dim}">${panel}</g>`;
    overlay += `<g data-book-labels="${kind}" opacity="${dim}">${fixed}</g>`;
  }
  let svg =
    text(
      64,
      31,
      "ONE INTENT · TWO ORDERS",
      C.muted,
      10,
      'letter-spacing="2.3"',
    ) +
    text(
      936,
      31,
      "相同起始掛賣 · 買入 30 隻",
      C.muted,
      11,
      'text-anchor="end"',
    );
  svg += `<defs><clipPath id="orders-window"><rect x="52" y="46" width="896" height="340" rx="10"/></clipPath></defs><g clip-path="url(#orders-window)"><g data-camera-scale="${camera.scale}" transform="translate(${camera.x} ${camera.y}) scale(${camera.scale}) translate(-500 -220)">${world}</g>${overlay}</g>`;
  svg += text(64, 408, "教學慢放 · 同一買入需求，兩次獨立模擬", C.faint, 10);
  svg += text(
    936,
    408,
    t >= TIMING.zoomOut
      ? "市價：成交 30　／　限價：成交 18，等待 12"
      : "元：價格　隻：數量",
    C.muted,
    11,
    'text-anchor="end"',
  );
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
