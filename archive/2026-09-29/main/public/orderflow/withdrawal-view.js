import {
  PRICES,
  TIMING,
  TARGET_INDEX,
  clamp,
  ease,
} from "./withdrawal-model.js";
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
const group = (svg, alpha = 1, attrs = "") =>
  `<g opacity="${clamp(alpha)}" ${attrs}>${svg}</g>`;
const mid = 'text-anchor="middle"';
export const columnX = (index) => 500 + (index - TARGET_INDEX) * 270;
export const priceY = (price) => 260 - (price - 101) * 44;
export function cameraAt(t, reduced = false) {
  const ramp = (at, end) =>
    reduced ? Number(t >= end) : ease((t - at) / (end - at));
  const focus =
    ramp(TIMING.zoomIn, TIMING.focused) *
    (1 - ramp(TIMING.zoomOut, TIMING.panorama));
  return {
    focus,
    scale: 0.29 + 0.71 * focus,
    x: 500,
    y: 245 - 15 * focus,
    originX: 500,
    originY: 214,
  };
}
export function projectPoint(x, y, camera) {
  return {
    x: camera.x + (x - camera.originX) * camera.scale,
    y: camera.y + (y - camera.originY) * camera.scale,
  };
}
export function drawWithdrawal({ state, playhead: t, reduced = false }) {
  const camera = cameraAt(t, reduced),
    { focus, scale, x, y, originX, originY } = camera;
  const show = (at, duration = 500) =>
    reduced ? Number(t >= at) : ease((t - at) / duration);
  const detail = ease((focus - 0.65) / 0.35) * show(TIMING.reset, 450);
  const macro = ease((0.42 - focus) / 0.42);
  const bookAlpha = detail * (1 - show(28000, 600));
  let svg = `<defs><clipPath id="withdraw-window"><rect x="56" y="80" width="888" height="278" rx="6"/></clipPath></defs>`;
  svg += text(
    64,
    32,
    "THE MISSING TRADES",
    C.muted,
    10,
    'letter-spacing="2.2"',
  );
  svg += text(
    936,
    32,
    state.replay
      ? "14:30 選段回看 · 合成委託簿"
      : "已完成的模擬行情 · 11 根一分 K",
    C.muted,
    11,
    'text-anchor="end"',
  );
  for (let price = 97; price <= 107; price++) {
    const py = projectPoint(0, priceY(price), camera).y;
    if (py < 94 || py > 341) continue;
    const alpha = price % 2 === 0 ? 0.6 : detail * 0.75;
    svg += group(
      line(
        76,
        py,
        920,
        py,
        C.grid,
        'stroke-opacity=".5" stroke-dasharray="2 7"',
      ) + text(936, py + 4, price, C.faint, 10, 'data-price-tick="true"'),
      alpha,
    );
  }
  let world = "";
  const locatorAlpha = (1 - focus) * show(600) * (1 - show(TIMING.zoomOut));
  world += group(
    rect(
      439,
      96,
      122,
      190,
      C.buy,
      'rx="14" fill-opacity=".035" stroke="#a0dfce" stroke-opacity=".5" stroke-width="2.5"',
    ),
    locatorAlpha,
    'data-locator="true"',
  );
  for (const [index, bar] of state.bars.entries()) {
    if (!bar) continue;
    const cx = columnX(index),
      selected = index === TARGET_INDEX;
    const color = bar.close >= bar.open ? C.buy : C.sell;
    const top = priceY(Math.max(bar.open, bar.close));
    const height = Math.max(3, Math.abs(priceY(bar.open) - priceY(bar.close)));
    let candle = line(
      cx,
      priceY(bar.high),
      cx,
      priceY(bar.low),
      color,
      'stroke-width="2.6"',
    );
    candle += rect(
      cx - 19,
      top - (bar.open === bar.close ? 1.5 : 0),
      38,
      height,
      color,
      'rx="2" fill-opacity=".8"',
    );
    if (selected && state.replay) {
      const age = t - TIMING.buy;
      const pulse = !reduced && age >= 0 ? 1 - ease(age / 850) : 0;
      candle += group(
        rect(
          cx - 27,
          top - 7,
          54,
          height + 14,
          "none",
          `rx="5" stroke="${C.buy}" stroke-width="1.5"`,
        ),
        pulse,
      );
    }
    world += group(
      candle,
      selected ? 1 : 0.86 * (1 - focus),
      `data-context-index="${index}" data-candle-open="${bar.open}" data-candle-high="${bar.high}" data-candle-low="${bar.low}" data-candle-close="${bar.close}" data-candle-volume="${bar.volume}"`,
    );
  }
  let book = "";
  for (const price of PRICES) {
    if (price === 99) continue;
    const py = priceY(price),
      ask = state.asks.find((r) => r.price === price)?.size ?? 0;
    const bid = state.bids.find((r) => r.price === price)?.size ?? 0;
    if (price >= 102) {
      book += rect(
        641,
        py - 13,
        174,
        26,
        "#203035",
        'rx="4" fill-opacity=".45"',
      );
      book += rect(
        641,
        py - 13,
        ask * 4.25,
        26,
        C.sell,
        `rx="4" fill-opacity=".27" data-ask-price="${price}" data-size="${ask}"`,
      );
      book += text(
        838,
        py + 5,
        ask,
        ask ? C.sell : C.faint,
        14,
        'text-anchor="end" class="number"',
      );
      book += line(
        533,
        py,
        625,
        py,
        C.grid,
        'stroke-opacity=".7" stroke-dasharray="2 5"',
      );
    }
    if (bid) {
      book += rect(
        194,
        py - 13,
        164,
        26,
        "#203035",
        'rx="4" fill-opacity=".45"',
      );
      book += rect(
        358 - bid * 5,
        py - 13,
        bid * 5,
        26,
        C.buy,
        'rx="4" fill-opacity=".24"',
      );
      book += text(
        172,
        py + 5,
        bid,
        C.buy,
        14,
        'text-anchor="end" class="number"',
      );
      book += line(
        373,
        py,
        467,
        py,
        C.grid,
        'stroke-opacity=".6" stroke-dasharray="2 5"',
      );
    }
  }
  book += line(
    407,
    priceY(state.targetPrice),
    856,
    priceY(state.targetPrice),
    C.ink,
    'stroke-opacity=".4" stroke-dasharray="6 6"',
  );
  for (const cancellation of state.cancellations) {
    const age = t - cancellation.at,
      progress = ease(age / 1050);
    if (state.replay && age >= 0 && age < 1050)
      book += group(
        rect(
          641 + 35 * progress,
          priceY(cancellation.price) - 13 - 10 * progress,
          cancellation.size * 4.25,
          26,
          C.sell,
          'rx="4" fill-opacity=".45"',
        ) +
          text(
            706 + 35 * progress,
            priceY(cancellation.price) + 5 - 10 * progress,
            `撤回 ${cancellation.size}`,
            C.sell,
            11,
            mid,
          ),
        reduced ? 0 : 1 - progress,
      );
  }
  if (state.replay && state.cancellations.length && t < TIMING.buy) {
    const both = state.cancellations.length === 2;
    let gap = both
      ? rect(
          630,
          priceY(103) - 19,
          222,
          priceY(102) - priceY(103) + 38,
          "none",
          'rx="7" stroke="#a98d68" stroke-opacity=".6" stroke-dasharray="4 6"',
        )
      : "";
    gap += text(
      743,
      both ? (priceY(103) + priceY(102)) / 2 + 4 : priceY(102) + 5,
      both ? "兩檔都撤走" : "102 元空了",
      C.sell,
      11,
      mid,
    );
    book += group(
      gap,
      show((both ? TIMING.cancelSecond : TIMING.cancelFirst) + 1050, 400),
    );
  }
  const incoming = show(18400, 550) * (1 - show(TIMING.buy, 200));
  if (incoming > 0) {
    const progress = reduced ? 0 : ease((t - 19800) / (TIMING.buy - 19800));
    const px = 341 + 354 * progress,
      py = 86 + (priceY(104) - 86) * progress;
    book += group(
      rect(
        px - 46,
        py - 14,
        92,
        28,
        "#213e34",
        'rx="14" stroke="#82bca7" stroke-opacity=".7"',
      ) + text(px, py + 4, "市價買 5", C.buy, 12, mid),
      incoming,
    );
  }
  if (state.replay && t >= TIMING.buy) {
    const age = t - TIMING.buy;
    if (!reduced && age < 900)
      book += `<circle cx="641" cy="${priceY(104)}" r="${9 + 24 * ease(age / 900)}" stroke="${C.buy}" fill="none" opacity="${1 - ease(age / 900)}"/>`;
    book += text(729, priceY(104) - 23, "104 元 · 成交 5 隻", C.buy, 12, mid);
  }
  world += group(book, bookAlpha, 'data-book="true"');
  const printAlpha =
    detail * show(8600) * (1 - show(28000)) + macro * show(1000);
  let prints = "";
  for (const fill of state.trades) {
    const py = priceY(fill.price);
    prints += `<circle cx="500" cy="${py}" r="5.5" fill="#142a2b" stroke="${C.ink}" stroke-width="1.7" data-trade-at="${fill.playedAt}" data-trade-size="${fill.size}"/>`;
    prints += group(
      line(473, py, 437, py, C.ink, 'stroke-opacity=".45"') +
        text(
          426,
          py + 4,
          `${fill.price} × ${fill.size}`,
          C.ink,
          12,
          'text-anchor="end"',
        ),
      detail,
    );
  }
  world += group(prints, printAlpha, 'data-trade-prints="true"');
  svg += `<g clip-path="url(#withdraw-window)"><g data-camera-scale="${scale}" transform="translate(${x} ${y}) scale(${scale}) translate(${-originX} ${-originY})">${world}</g></g>`;
  svg += group(
    text(276, 69, "掛買 / 隻", C.buy, 11, mid) +
      text(500, 69, "14:30 · 同一根 K 線", C.muted, 12, mid) +
      text(743, 69, "等待賣出 / 隻", C.sell, 11, mid),
    bookAlpha,
  );
  svg += group(
    text(
      332,
      383,
      `最新成交 ${state.targetPrice} 元`,
      C.ink,
      16,
      `${mid} data-price-value="${state.targetPrice}"`,
    ) +
      text(
        668,
        383,
        `本根成交 ${state.volume} 隻`,
        C.ink,
        16,
        `${mid} data-volume-value="${state.volume}"`,
      ),
    detail * (1 - show(28000)),
  );
  svg += group(
    text(
      500,
      408,
      t < TIMING.cancelFirst
        ? "先前 101 元成交 5 隻"
        : t < TIMING.buy
          ? "只撤回掛賣 · 成交價與量都沒變"
          : "中間 102、103 元沒有成交",
      t < TIMING.buy ? C.muted : C.sell,
      11,
      mid,
    ),
    detail * (1 - show(28000)),
  );
  if (macro)
    for (const [index, bar] of state.bars.entries()) {
      if (!bar) continue;
      const labelX = projectPoint(columnX(index), 0, camera).x;
      if (labelX < 76 || labelX > 924) continue;
      svg += group(
        text(
          labelX,
          373,
          bar.label,
          index === TARGET_INDEX ? C.ink : C.muted,
          10,
          mid,
        ),
        macro,
      );
    }
  const targetBottom = projectPoint(500, priceY(101), camera);
  svg += group(
    line(500, targetBottom.y + 7, 500, 301, C.muted, 'stroke-opacity=".45"') +
      text(500, 320, "101 → 104", C.ink, 17, mid) +
      text(500, 342, "這根 K，只有兩筆成交", C.muted, 11, mid),
    macro * show(1000),
  );
  svg += group(
    text(
      500,
      409,
      t < TIMING.reset
        ? "中間兩檔 · 接著回看委託簿"
        : "102、103 撤單 55 隻 · 本根成交 10 隻",
      C.muted,
      11,
      mid,
    ),
    macro,
  );
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
