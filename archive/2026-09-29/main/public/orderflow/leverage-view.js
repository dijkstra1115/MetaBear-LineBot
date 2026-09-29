import { TIMING, clamp, ease } from "./leverage-model.js";

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
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

export function cameraAt(playhead, reduced = false) {
  const into = reduced
    ? Number(playhead >= TIMING.focused)
    : ease((playhead - TIMING.zoomIn) / (TIMING.focused - TIMING.zoomIn));
  const out = reduced
    ? Number(playhead >= TIMING.panorama)
    : ease((playhead - TIMING.zoomOut) / (TIMING.panorama - TIMING.zoomOut));
  const focus = into * (1 - out);
  return {
    focus,
    scale: 1 + 0.33 * focus,
    x: 560 - 15 * focus,
    y: 230 - 10 * focus,
  };
}

export function drawLeverage({ state, playhead, reduced }) {
  const { focus, scale, x, y } = cameraAt(playhead, reduced);
  const show = (at, duration = 550) =>
    reduced ? Number(playhead >= at) : ease((playhead - at) / duration);
  const eventAge = playhead - state.quote.at;
  const pulse = reduced || state.quote.at === 0 ? 0 : 1 - ease(eventAge / 700);
  const color = state.price < 100 ? C.sell : C.buy;
  let world = "";
  for (const [index, account] of state.accounts.entries()) {
    const cy = index ? 274 : 148;
    const alpha = index ? show(1400) : 1 - 0.42 * focus;
    let row = line(168, cy, 895, cy, C.grid, 'stroke-dasharray="2 7"');
    const radius = account.margin === 500 ? 44 : 32;
    row += `<circle cx="151" cy="${cy}" r="${radius + 7}" fill="none" stroke="${C.buy}" stroke-opacity=".12"/>`;
    row += `<circle cx="151" cy="${cy}" r="${radius}" fill="#1a3535" stroke="${C.buy}" stroke-opacity=".6"/>`;
    row += text(
      151,
      cy + 5,
      account.margin,
      C.ink,
      23,
      `${mid} class="number" data-margin="${account.margin}"`,
    );
    row += text(151, cy + radius + 24, "元保證金", C.muted, 10, mid);
    row += rect(238, cy - 15, 50, 30, "#17262c", 'rx="15"');
    row += text(263, cy + 5, `${account.leverage}×`, C.ink, 17, mid);
    row += `<path d="M306 ${cy} H350 M343 ${cy - 4} L350 ${cy} L343 ${cy + 4}" fill="none" stroke="${C.faint}"/>`;
    // Identically sized units preserve the visual meaning of position size.
    for (let unit = 0; unit < 5; unit++) {
      const px = 380 + unit * 72;
      const held = unit < account.quantity;
      const bornAt =
        state.samePosition && !index && unit > 0
          ? TIMING.compare
          : index
            ? 1550 + unit * 130
            : 350;
      row += rect(
        px,
        cy - 26,
        62,
        52,
        held ? "#1d3336" : "#101a20",
        `rx="5" stroke="${held ? C.buy : C.grid}" stroke-opacity="${held ? 0.5 : 0.26}"`,
      );
      if (held) {
        row += group(
          text(px + 31, cy - 3, "1 隻", C.ink, 14, mid) +
            text(px + 31, cy + 15, "100 元", C.muted, 10, mid),
          show(bornAt),
        );
        row += group(
          line(
            px + 6,
            cy + 26,
            px + 56,
            cy + 26,
            color,
            `stroke-width="${2 + pulse * 2}"`,
          ) +
            text(
              px + 31,
              cy - 39,
              `${signed(state.price - 100)} 元`,
              color,
              13,
              mid,
            ),
          show(TIMING.rise),
        );
      }
    }
    row += text(
      554,
      cy + 57,
      `${account.quantity} 隻 · 開倉部位 ${account.notional} 元`,
      C.muted,
      12,
      `${mid} data-quantity="${account.quantity}"`,
    );
    row += group(
      text(
        838,
        cy + 7,
        `${signed(account.pnl)}`,
        color,
        32,
        `${mid} class="number" data-pnl="${account.pnl}"`,
      ) + text(838, cy + 29, "元損益", C.muted, 10, mid),
      show(TIMING.rise),
    );
    if (state.samePosition)
      row += group(
        text(
          838,
          cy + 48,
          `${signed(account.returnOnMargin * 100)}% / 保證金`,
          C.faint,
          10,
          mid,
        ),
        show(TIMING.compare),
      );
    world += group(row, alpha);
  }
  let svg = `<defs><clipPath id="leverage-window"><rect x="58" y="76" width="884" height="299" rx="6"/></clipPath></defs>`;
  svg += text(64, 32, "MARGIN → EXPOSURE", C.muted, 10, 'letter-spacing="2.5"');
  svg += text(
    936,
    32,
    state.samePosition ? "同部位 · 不同保證金" : "同保證金 · 不同部位",
    C.muted,
    11,
    'text-anchor="end"',
  );
  svg += text(
    500,
    63,
    `100 → ${state.price} 元`,
    state.price === 100 ? C.ink : color,
    19,
    `${mid} class="number"`,
  );
  svg += `<g clip-path="url(#leverage-window)"><g data-camera-scale="${scale}" transform="translate(${x} ${y}) scale(${scale}) translate(-560 -230)">${world}</g></g>`;
  svg += text(64, 402, "線性做多合約 · 開倉價 100 元 · 忽略費用", C.faint, 10);
  svg += text(
    936,
    402,
    state.samePosition
      ? "部位不變，損益金額就不變"
      : "保證金 × 槓桿 = 開倉部位價值",
    C.muted,
    11,
    'text-anchor="end"',
  );
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
