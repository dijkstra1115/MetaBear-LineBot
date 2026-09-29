import { TIMING, clamp, ease } from "./order-block-model.js";
const C = {
  ink: "#e1ebe7",
  muted: "#8ea8af",
  faint: "#58717a",
  grid: "#30464c",
  buy: "#a0dfce",
  sell: "#e0be8d",
};
const text = (x, y, value, color = C.muted, size = 12, attrs = "") =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${attrs}>${value}</text>`;
const rect = (x, y, w, h, fill, attrs = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${attrs}/>`;
const line = (x1, y1, x2, y2, stroke, attrs = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" ${attrs}/>`;
const group = (svg, opacity = 1, attrs = "") =>
  `<g opacity="${clamp(opacity)}" ${attrs}>${svg}</g>`;
const mid = 'text-anchor="middle"';
export const columnX = (index) => 300 + (index - 4) * 330;
export const priceY = (price) => 210 - (price - 104) * 38;
export const originTradeX = (tick) => 155 + tick * 21;
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
    scale: 0.24 + 0.76 * focus,
    x: 500,
    y: 245 - 35 * focus,
    originX: 630 - 130 * focus,
    originY: 210,
  };
}
export function projectPoint(x, y, camera) {
  return {
    x: camera.x + (x - camera.originX) * camera.scale,
    y: camera.y + (y - camera.originY) * camera.scale,
  };
}
export function drawOrderBlock({ state, playhead, reduced = false }) {
  const camera = cameraAt(playhead, reduced),
    { focus, scale, x, y, originX, originY } = camera;
  const show = (at, duration = 500) =>
    reduced ? Number(playhead >= at) : ease((playhead - at) / duration);
  const detail = ease((focus - 0.65) / 0.35),
    macro = ease((0.4 - focus) / 0.4);
  const replayAlpha = show(TIMING.reset, 300);
  const event = state.event,
    age = event ? playhead - event.at : Infinity;
  const flash = reduced ? 0 : 1 - ease(age / 850);
  let svg = `<defs><clipPath id="ob-window"><rect x="56" y="80" width="888" height="278" rx="6"/></clipPath><linearGradient id="ob-zone-fill"><stop stop-color="#a0dfce" stop-opacity=".11"/><stop offset="1" stop-color="#a0dfce" stop-opacity=".035"/></linearGradient></defs>`;
  svg += text(64, 32, "ORDER BLOCK", C.muted, 10, 'letter-spacing="2.6"');
  svg += text(
    936,
    32,
    state.replay
      ? "具名買家執行情境 · 合成成交"
      : "已完成的模擬行情 · 11 根一分 K",
    C.muted,
    11,
    'text-anchor="end"',
  );

  // Fixed price coordinates are shared by candles, fills, waiting orders and zone.
  for (let price = 94; price <= 117; price++) {
    const py = projectPoint(0, priceY(price), camera).y;
    if (py < 90 || py > 340) continue;
    const isMacroTick = price % 5 === 0;
    const alpha = isMacroTick ? 0.5 + 0.35 * focus : 0.65 * detail;
    svg += group(
      line(
        75,
        py,
        925,
        py,
        C.grid,
        'stroke-opacity=".45" stroke-dasharray="2 7"',
      ) +
        text(
          938,
          py + 4,
          price,
          C.faint,
          10,
          'class="number" data-price-tick="true"',
        ),
      alpha,
    );
  }
  let world = "";
  if (state.zoneVisible) {
    const left = columnX(state.zone.originIndex) - 22;
    const top = priceY(state.zone.high),
      bottom = priceY(state.zone.low);
    const right = left + (2360 - left) * show(TIMING.zone, 2600);
    world += rect(
      left,
      top,
      Math.max(0, right - left),
      bottom - top,
      "url(#ob-zone-fill)",
      `data-ob-zone="true" data-zone-high="${state.zone.high}" data-zone-low="${state.zone.low}" stroke="${C.buy}" stroke-width="1.4" stroke-opacity=".55"`,
    );
  }
  // A locator selects time, never an already-known order block.
  world += group(
    rect(
      235,
      73,
      470,
      277,
      "#a0dfce",
      'fill-opacity=".025" stroke="#a0dfce" stroke-opacity=".42" stroke-width="3" rx="17" data-locator="true"',
    ),
    (1 - focus) * (1 - show(TIMING.lookBack)) * show(1000),
  );
  const priorY = priceY(state.referenceHigh);
  world += group(
    line(
      columnX(2),
      priorY,
      845,
      priorY,
      C.sell,
      'stroke-opacity=".65" stroke-width="1.3" stroke-dasharray="6 7" data-prior-high="105"',
    ),
    show(1600),
  );

  for (const [index, bar] of state.bars.entries()) {
    if (!bar) continue;
    const cx = columnX(index),
      selected = index === state.originIndex || index === state.impulseIndex;
    const color = bar.close >= bar.open ? C.buy : C.sell;
    const top = Math.min(priceY(bar.open), priceY(bar.close));
    const height = Math.max(3, Math.abs(priceY(bar.close) - priceY(bar.open)));
    const eventOnBar = event?.barIndex === index;
    let candle = line(
      cx,
      priceY(bar.high),
      cx,
      priceY(bar.low),
      color,
      'stroke-width="2.6"',
    );
    candle += rect(
      cx - 21,
      top - (height === 3 ? 1.5 : 0),
      42,
      height,
      color,
      'rx="2" fill-opacity=".78"',
    );
    if (selected)
      candle += group(
        line(
          cx - 27,
          priceY(bar.close),
          cx + 27,
          priceY(bar.close),
          C.ink,
          `stroke-opacity="${0.55 + (eventOnBar ? flash * 0.45 : 0)}" stroke-width="1.2"`,
        ),
        detail,
      );
    world += group(
      candle,
      selected ? 1 : 0.86 * (1 - focus),
      `data-candle="${index}" data-open="${bar.open}" data-high="${bar.high}" data-low="${bar.low}" data-close="${bar.close}" data-volume="${bar.volume}" data-closed="${bar.closed}"`,
    );
  }

  // These are A's actual resting bids. A owns the passive side of the gold
  // sell prints; increasing A's bought quantity does not turn the candle green.
  const bidAlpha = detail * show(TIMING.bids) * (1 - show(TIMING.urgency, 700));
  let bids = "";
  if (state.replay)
    for (const bid of state.bids) {
      const py = priceY(bid.price);
      bids += rect(112, py - 12, 118, 24, "#203035", 'rx="4"');
      bids += rect(
        112,
        py - 12,
        (118 * bid.remaining) / 20,
        24,
        C.buy,
        'rx="4" fill-opacity=".19"',
      );
      bids += text(
        171,
        py + 5,
        bid.remaining ? `${bid.remaining} 隻` : "已承接",
        bid.remaining ? C.buy : C.faint,
        bid.remaining ? 14 : 11,
        `${mid} data-bid-price="${bid.price}" data-remaining="${bid.remaining}"`,
      );
      bids += line(238, py, 275, py, C.grid, 'stroke-dasharray="2 4"');
      if (event?.passive && event.price === bid.price) {
        bids += group(
          rect(
            110,
            py - 14,
            122,
            28,
            "none",
            `rx="5" stroke="${C.buy}" stroke-opacity=".7"`,
          ),
          flash,
        );
        bids += group(
          line(74, py, 100, py, C.sell, 'stroke-width="1.5"') +
            `<path d="M94 ${py - 4} L100 ${py} L94 ${py + 4}" fill="none" stroke="${C.sell}"/>`,
          0.3 + 0.7 * flash,
        );
        if (!reduced && age < 850) {
          const progress = ease(age / 850);
          bids += `<circle cx="${238 + 38 * progress}" cy="${py}" r="5" fill="${C.sell}" opacity="${1 - progress * 0.6}"/>`;
        }
      }
    }
  bids += text(171, 219, "A 的限價買單", C.buy, 11, mid);
  world += group(bids, bidAlpha, 'data-bid-rows="true"');

  const execution = state.execution;
  const executionAlpha =
    detail * show(TIMING.reset + 350) * (1 - show(TIMING.lookBack - 600));
  const aggressive = playhead >= TIMING.urgency;
  const ratio = execution.filled / execution.target;
  let buyer = text(460, 99, "大買家 A", C.ink, 14, mid);
  buyer += `<circle cx="460" cy="140" r="28" fill="none" stroke="${C.grid}" stroke-width="3"/><circle cx="460" cy="140" r="28" fill="none" stroke="${C.buy}" stroke-width="3" pathLength="1" stroke-dasharray="${ratio} 1" transform="rotate(-90 460 140)"/>`;
  buyer += text(460, 131, "已買", C.muted, 9, mid);
  buyer += text(
    460,
    157,
    execution.filled,
    C.buy,
    22,
    `${mid} class="number" data-a-filled="${execution.filled}"`,
  );
  buyer += text(460, 202, `目標 ${execution.target} 隻`, C.muted, 11, mid);
  buyer += text(
    460,
    230,
    aggressive ? "期限接近 · 主動買入" : "先掛買 · 控制成本",
    aggressive ? C.sell : C.buy,
    12,
    mid,
  );
  buyer += text(
    460,
    254,
    execution.remaining ? `還差 ${execution.remaining} 隻` : "80 隻完成",
    C.ink,
    13,
    `${mid} data-a-remaining="${execution.remaining}"`,
  );
  buyer += group(
    text(
      460,
      286,
      `承接 ${execution.passiveFilled} ＋ 主動 ${execution.aggressiveFilled}`,
      C.muted,
      11,
      mid,
    ),
    show(TIMING.confirm),
  );
  world += group(buyer, executionAlpha, 'data-execution="true"');

  let orderRows = "";
  if (state.replay)
    for (const ask of state.asks) {
      const py = priceY(ask.price),
        active =
          event?.barIndex === state.impulseIndex && event.price === ask.price;
      orderRows += line(
        663,
        py,
        716,
        py,
        C.grid,
        'stroke-opacity=".65" stroke-dasharray="2 5"',
      );
      orderRows += rect(
        725,
        py - 11,
        110,
        22,
        "#203035",
        'rx="4" fill-opacity=".65"',
      );
      orderRows += rect(
        725,
        py - 11,
        (110 * ask.remaining) / ask.initial,
        22,
        C.sell,
        'rx="4" fill-opacity=".18"',
      );
      orderRows += text(
        782,
        py + 5,
        ask.remaining ? `${ask.remaining} 隻` : "已成交",
        ask.remaining ? C.sell : C.faint,
        ask.remaining ? 14 : 10,
        `${mid} data-ask-price="${ask.price}" data-remaining="${ask.remaining}"`,
      );
      if (active) {
        orderRows += group(
          rect(
            723,
            py - 13,
            114,
            26,
            "none",
            `rx="5" stroke="${C.buy}" stroke-opacity=".7"`,
          ),
          flash,
        );
        if (!reduced && age < 850) {
          const progress = ease(age / 850),
            px = 724 - (724 - 658) * progress;
          orderRows += `<circle cx="${px}" cy="${py}" r="5" fill="${C.buy}" opacity="${1 - progress * 0.7}" data-fill-motion="${event.id}"/>`;
        }
      }
    }
  const bookAlpha =
    detail * show(TIMING.book) * (1 - show(TIMING.lookBack - 600, 600));
  world += group(orderRows, bookAlpha, 'data-order-rows="true"');

  const lookBack =
    show(TIMING.lookBack, 1300) * (1 - show(TIMING.zone + 500, 600));
  world += group(
    `<path d="M613 111 C510 64 350 97 309 190" pathLength="1" stroke="${C.sell}" stroke-opacity=".65" stroke-width="1.5" stroke-dasharray="${show(TIMING.lookBack, 1100)} 1" fill="none"/><path d="M301 179 L309 190 L322 183" fill="none" stroke="${C.sell}" stroke-width="1.5"/>`,
    detail * lookBack,
    'data-look-back="true"',
  );
  if (state.confirmed && state.origin) {
    let bounds = "";
    for (const [label, price] of [
      ["高", state.origin.high],
      ["低", state.origin.low],
    ]) {
      const py = priceY(price);
      bounds += `<circle cx="300" cy="${py}" r="5" fill="#17272b" stroke="${C.sell}" stroke-width="1.7"/>`;
      bounds += line(309, py, 337, py, C.sell, 'stroke-opacity=".65"');
      bounds += text(345, py + 4, `${label} ${price}`, C.sell, 12);
    }
    world += group(bounds, detail * show(TIMING.lookBack + 1200));
  }
  if (state.zoneVisible)
    world += group(
      text(520, 254, "訂單塊 OB", C.buy, 21, mid) +
        text(
          520,
          280,
          `${state.zone.low}—${state.zone.high} 元`,
          C.ink,
          14,
          `${mid} class="number"`,
        ),
      detail * show(TIMING.zone + 700),
    );
  svg += `<g clip-path="url(#ob-window)"><g data-camera-scale="${scale}" transform="translate(${x} ${y}) scale(${scale}) translate(${-originX} ${-originY})">${world}</g></g>`;

  // Text layers live outside the moving crop; each follows its world anchor
  // horizontally, with enough glyph room above and below the chart.
  const originXOnScreen = projectPoint(columnX(state.originIndex), 0, camera).x;
  const impulseXOnScreen = projectPoint(
    columnX(state.impulseIndex),
    0,
    camera,
  ).x;
  const priorScreenY = projectPoint(0, priorY, camera).y;
  svg += group(
    text(76, priorScreenY - 11, "既有前高 105", C.sell, 11),
    show(1600),
  );
  svg += group(
    text(
      300,
      69,
      state.origin?.closed ? "收跌 K · A 買到 50 隻" : "14:30 · 掛買承接",
      C.muted,
      12,
      mid,
    ),
    detail * replayAlpha,
  );
  svg += group(
    text(
      630,
      69,
      state.confirmed ? "收盤 107 ＞ 105" : "14:31 · A 主動買入",
      state.confirmed ? C.buy : C.muted,
      12,
      mid,
    ),
    detail * show(TIMING.book),
  );
  svg += group(
    text(
      782,
      69,
      playhead < 21400 ? "新掛的賣單" : "等待賣出",
      C.sell,
      11,
      mid,
    ),
    bookAlpha,
  );
  svg += group(
    text(
      originXOnScreen,
      377,
      state.origin?.closed ? "14:30 · 已收盤" : "14:30 · 回看中",
      C.muted,
      11,
      mid,
    ) +
      text(
        impulseXOnScreen,
        377,
        state.impulse?.closed
          ? "14:31 · 已收盤"
          : playhead < TIMING.urgency
            ? "14:31"
            : "14:31 · 回看中",
        C.muted,
        11,
        mid,
      ),
    detail * replayAlpha,
  );
  svg += group(
    text(
      originXOnScreen,
      401,
      `成交 ${state.originVolume} 隻`,
      C.sell,
      12,
      `${mid} data-origin-volume="${state.originVolume}"`,
    ) +
      text(
        impulseXOnScreen,
        401,
        `成交 ${state.impulseVolume} 隻`,
        C.buy,
        12,
        `${mid} data-impulse-volume="${state.impulseVolume}"`,
      ),
    detail * replayAlpha,
    'data-footer="detail"',
  );

  if (macro) {
    for (const [index, bar] of state.bars.entries()) {
      if (!bar) continue;
      const px = projectPoint(columnX(index), 0, camera).x;
      if (px < 75 || px > 925) continue;
      svg += group(
        text(
          px,
          375,
          bar.label,
          index === state.originIndex ? C.ink : C.muted,
          10,
          mid,
        ),
        macro,
      );
    }
  }
  svg += group(
    text(500, 409, "一種形成情境 · 本例取整根高低", C.muted, 11, mid),
    macro,
    'data-footer="macro"',
  );
  const locatorCenter = projectPoint(470, 350, camera);
  svg += group(
    line(
      locatorCenter.x,
      locatorCenter.y + 5,
      locatorCenter.x,
      locatorCenter.y + 17,
      C.muted,
      'stroke-opacity=".5"',
    ) +
      text(locatorCenter.x, locatorCenter.y + 33, "回看這兩根", C.ink, 11, mid),
    macro * show(1000) * (1 - show(TIMING.lookBack)),
  );
  if (state.zoneVisible) {
    const zoneBottom = projectPoint(
      columnX(state.originIndex),
      priceY(state.zone.low),
      camera,
    );
    svg += group(
      line(
        zoneBottom.x,
        zoneBottom.y + 5,
        zoneBottom.x,
        310,
        C.buy,
        'stroke-opacity=".45"',
      ) +
        text(
          zoneBottom.x + 14,
          315,
          `訂單塊 OB · ${state.zone.low}—${state.zone.high} 元`,
          C.buy,
          13,
        ),
      macro * show(TIMING.zone),
    );
  }
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
