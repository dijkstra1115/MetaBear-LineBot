import { PRICES, TIMING, ease } from "./stop-orders-model.js";
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
const mid = 'text-anchor="middle"',
  num = `${mid} class="number"`;
export const priceY = (price) => 262 - (price - 98) * 42;
export function cameraAt(t, reduced = false) {
  const ramp = (at, d) => (reduced ? Number(t >= at + d) : ease((t - at) / d));
  const market = ramp(6000, 1100) * (1 - ramp(14500, 1500));
  const limit =
    ramp(TIMING.limitTrigger, 1500) *
    (1 - ramp(TIMING.summary, TIMING.panorama - TIMING.summary));
  const focus = market + limit;
  return { focus, scale: 1 + 0.18 * focus, x: 500, y: 230 - 15 * focus };
}
export function drawStopOrders({ state, playhead: t, reduced }) {
  const current = state.current,
    isMarket = state.kind === "market",
    camera = cameraAt(t, reduced);
  const show = (at, d = 550) =>
    reduced ? Number(t >= at) : ease((t - at) / d);
  const mapX = (x) => camera.x + (x - 500) * camera.scale,
    mapY = (y) => camera.y + (y - 230) * camera.scale;
  let world = "";
  for (const price of PRICES) {
    const row = current.bids.find((r) => r.price === price),
      y = priceY(price),
      alpha = price >= 100 ? 1 - ease(camera.focus / 0.12) : 1;
    const ownFill = current.fills.find((f) => f.price === price),
      age = ownFill ? t - ownFill.playedAt : Infinity,
      flash = reduced ? 0 : 1 - ease(age / 1000);
    world += `<g opacity="${alpha}">`;
    world += line(
      277,
      y,
      895,
      y,
      C.grid,
      'stroke-dasharray="2 6" stroke-opacity=".6"',
    );
    world += rect(
      476 - row.size * 7,
      y - 15,
      row.size * 7,
      30,
      "#20353c",
      'rx="4"',
    );
    world += rect(
      476 - row.remaining * 7,
      y - 15,
      row.remaining * 7,
      30,
      C.buy,
      `rx="4" fill-opacity="${0.4 + 0.25 * flash}" data-bid-price="${price}" data-remaining="${row.remaining}"`,
    );
    world += text(
      299,
      y + 5,
      row.remaining,
      row.remaining ? C.buy : C.faint,
      15,
      'text-anchor="end" class="number"',
    );
    world += text(
      520,
      y + 5,
      price,
      price === current.bestBid ? C.ink : C.muted,
      15,
      num,
    );
    if (price === current.bestBid) {
      world += rect(552, y - 12, 88, 24, "#203a33", 'rx="12"');
      world += text(596, y + 4, "最佳掛買", C.buy, 10, mid);
    }
    if (ownFill && flash > 0)
      world += text(
        401,
        y - 23,
        `成交 ${ownFill.size}`,
        C.sell,
        12,
        `${mid} opacity="${flash}"`,
      );
    world += "</g>";
  }
  const triggerY = priceY(99);
  let orderY = triggerY;
  if (current.submitted) {
    orderY +=
      (priceY(98) - triggerY) *
      show(isMarket ? TIMING.submit : TIMING.limitSubmit, 650);
    if (isMarket)
      orderY += (priceY(97) - priceY(98)) * show(TIMING.firstFill, 650);
  }
  const status = !current.triggered
    ? "條件待命"
    : !current.submitted
      ? "條件已觸發"
      : current.filled === 20
        ? "本例已賣完"
        : isMarket
          ? "市價賣出"
          : `最低賣 ${state.limitPrice} 元`;
  const amount = current.submitted ? current.remaining : state.quantity;
  world += rect(
    704,
    orderY - 29,
    176,
    62,
    current.triggered ? "#382f25" : "#1a2b30",
    'rx="10" stroke="#a38c68" stroke-opacity=".7"',
  );
  world += text(
    792,
    orderY - 8,
    status,
    current.triggered ? C.sell : C.muted,
    11,
    mid,
  );
  world += text(
    792,
    orderY + 17,
    current.filled === 20
      ? "成交 20"
      : `${current.submitted ? "剩餘" : "預備賣"} ${amount}`,
    C.ink,
    21,
    `${num} data-current-order-remaining="${amount}"`,
  );
  if (!current.triggered)
    world += text(792, orderY + 52, "跌至 99 元才送單", C.faint, 10, mid);
  if (!isMarket && current.submitted) {
    world += text(
      792,
      orderY + 52,
      current.resting ? "餘 10 隻掛在 98 · 等待中" : "觸發價 99 · 賣出限價 98",
      C.sell,
      10,
      mid,
    );
  }
  {
    const pending = (
      isMarket
        ? [
            { at: TIMING.firstFill, price: 98 },
            { at: TIMING.secondFill, price: 97 },
          ]
        : [{ at: TIMING.limitFill, price: 98 }]
    ).find((fill) => t >= fill.at - 800 && t < fill.at);
    if (pending && !reduced) {
      const p = ease((t - (pending.at - 800)) / 800),
        x = 699 + (462 - 699) * p,
        y = priceY(pending.price) - 44 * Math.sin(Math.PI * p);
      world += rect(x - 30, y - 12, 60, 24, "#624a30", 'rx="12"');
      world += text(x, y + 4, "賣 10", C.sell, 11, mid);
    }
    const latest = current.fills.at(-1);
    if (latest && !reduced && t - latest.playedAt < 800) {
      const p = ease((t - latest.playedAt) / 800);
      world += `<circle cx="462" cy="${priceY(latest.price)}" r="${5 + 16 * p}" fill="none" stroke="${C.sell}" opacity="${1 - p}"/>`;
    }
  }
  let svg =
    text(
      64,
      31,
      state.rewinding
        ? "↶ 回到同一起點 · 改用限價止損"
        : state.summary
          ? "同一個觸發條件 · 兩種結果"
          : isMarket
            ? "01 · 市價止損"
            : "02 · 限價止損",
      C.ink,
      14,
    ) +
    text(
      936,
      31,
      "起始持有 20 隻 · 最新成交價觸發 99 元",
      C.muted,
      10,
      'text-anchor="end"',
    );
  svg += `<defs><clipPath id="stop-window"><rect x="52" y="102" width="896" height="244" rx="8"/></clipPath></defs><g clip-path="url(#stop-window)"><g data-camera-scale="${camera.scale}" transform="translate(${camera.x} ${camera.y}) scale(${camera.scale}) translate(-500 -230)">${world}</g></g>`;
  svg +=
    text(mapX(389), 83, "目前掛買 / 隻", C.buy, 12, mid) +
    text(mapX(520), 83, "元", C.faint, 10, mid) +
    text(mapX(792), 83, "當下賣單", C.sell, 12, mid);
  const lastY = mapY(priceY(current.price));
  svg +=
    text(158, lastY - 27, "最新成交價", C.muted, 10, mid) +
    rect(93, lastY - 16, 130, 34, "#182b31", 'rx="16" stroke="#4e676e"') +
    text(
      158,
      lastY + 7,
      current.price,
      C.ink,
      23,
      `${num} data-last-price="${current.price}"`,
    );
  if (state.summary) {
    svg +=
      `<g data-summary>` +
      rect(108, 355, 361, 50, "#172a2e", 'rx="8"') +
      text(127, 376, "市價 · 優先成交，可能滑價", C.muted, 11) +
      text(
        451,
        395,
        `成交 ${state.market.filled} · 均價 ${state.market.avg.toFixed(2)}`,
        C.ink,
        15,
        'text-anchor="end" class="number"',
      ) +
      rect(490, 355, 401, 50, "#292a24", 'rx="8"') +
      text(509, 376, "限價 · 最低賣 98，餘量等待", C.muted, 11) +
      text(
        873,
        395,
        `成交 ${state.limit.filled} · 均價 ${state.limit.avg.toFixed(2)} · 等待 ${state.limit.resting}`,
        C.sell,
        15,
        'text-anchor="end" class="number"',
      ) +
      "</g>";
  } else {
    const result = current.submitted
      ? `已賣 ${current.filled} / 20　均價 ${current.avg === null ? "—" : current.avg.toFixed(2)}${current.resting ? `　等待 ${current.resting} 隻` : ""}`
      : current.triggered
        ? "條件已達成 · 還未成交"
        : "條件尚未達成 · 還未送單";
    svg += text(500, 378, result, C.ink, 18, num);
    svg += text(
      500,
      407,
      isMarket
        ? "從最高掛買開始賣，再走到下一個價位"
        : current.resting
          ? "最低賣價 98 元 · 不接受剩下的 97 元掛買"
          : "觸發價 99 元 · 賣出限價 98 元",
      C.faint,
      10,
      mid,
    );
  }
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
