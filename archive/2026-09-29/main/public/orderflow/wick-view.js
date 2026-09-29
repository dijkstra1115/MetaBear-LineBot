import {
  OPEN,
  CONTEXT,
  FIRST_BUY_AT,
  activeBuys,
  activeVolume,
  continuationCamera,
  RECAP_BEATS,
} from "./wick-model.js";
import { drawWickMobile } from "./market-mobile-view.js";
import {
  legacyPrice as formatPrice,
  legacySize as formatSize,
} from "./bear-market.js";
export { formatPrice, formatSize };
const C = {
  ink: "#e1ebe7",
  muted: "#7f99a2",
  grid: "#293e46",
  buy: "#8bd7c4",
  sell: "#d8b689",
  down: "#d99c88",
};
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
const text = (x, y, value, color = C.muted, size = 12, attrs = "") =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${attrs}>${value}</text>`;
const line = (x, y, x2, y2, color = C.grid, attrs = "") =>
  `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${color}" ${attrs}/>`;
const rect = (x, y, w, h, color, attrs = "") =>
  `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" fill="${color}" ${attrs}/>`;
const group = (content, opacity = 1) =>
  `<g opacity="${clamp(opacity)}">${content}</g>`;

export function drawWick({
  story,
  state,
  time,
  zoom,
  mode,
  elapsed = 0,
  mobile = false,
  reduced = false,
  settled = false,
}) {
  if (mobile)
    return drawWickMobile({
      story,
      state,
      time,
      zoom,
      mode,
      elapsed,
      reduced,
      settled,
    });
  const continuation = [
    "absorption",
    "depletion",
    "ascent",
    "high-absorption",
    "bid-depth",
    "descent",
    "support",
    "closing",
  ].includes(mode);
  const focusBids = ["bid-depth", "descent", "support", "closing"].includes(
    mode,
  );
  const camera = continuation
    ? continuationCamera(state, time, elapsed, mode, reduced)
    : null;
  const compact = camera?.compact ?? 0,
    wide = camera?.wide ?? 0;
  const W = mobile ? 390 : 1000,
    H = mobile ? 460 : 430;
  const top = mobile ? 49 : 43,
    bottom = mobile ? 350 : 327;
  const min = camera?.min ?? mix(OPEN - 4, OPEN - 0.3, zoom),
    max = camera?.max ?? mix(OPEN + 20, OPEN + 1.2, zoom);
  const y = (p) => top + ((max - p) / (max - min)) * (bottom - top);
  const hero = mix(mobile ? 274 : 680, mobile ? 73 : 286, zoom) + wide * 80;
  const gap = mix(mobile ? 52 : 120, mobile ? 88 : 190, zoom);
  const candleWidth = mix(mobile ? 17 : 30, mobile ? 29 : 43, zoom);
  let svg = "";
  const left = mobile ? 28 : 115,
    right = mobile ? 320 : 850;
  for (const value of [OPEN, OPEN + 10, OPEN + 20])
    svg += group(
      line(left, y(value), right, y(value), C.grid, 'stroke-dasharray="2 7"') +
        text(
          right + 8,
          y(value) + 4,
          formatPrice(value),
          C.muted,
          mobile ? 10 : 12,
          'class="number"',
        ),
      1 - zoom,
    );
  svg += group(
    rect(
      hero - (mobile ? 28 : 50),
      top - 12,
      mobile ? 56 : 100,
      bottom - top + 34,
      C.buy,
      'opacity=".035" rx="3"',
    ),
    1 - zoom,
  );

  function candle(c, x, width, opacity = 1, active = false) {
    const cy = (p) =>
      continuation ? Math.max(top, Math.min(bottom, y(p))) : y(p);
    const color = active ? (c.close >= c.open ? C.buy : C.down) : "#607c85";
    let body = line(
      x,
      cy(c.high),
      x,
      cy(c.low),
      color,
      `stroke-width="${active ? 2.3 : 1.4}"`,
    );
    if (Math.abs(c.open - c.close) < 0.001)
      body += line(
        x - width / 2,
        y(c.close),
        x + width / 2,
        y(c.close),
        active ? C.ink : color,
        'stroke-width="2"',
      );
    else
      body += rect(
        x - width / 2,
        Math.min(cy(c.open), cy(c.close)),
        width,
        Math.max(1.5, Math.abs(cy(c.close) - cy(c.open))),
        color,
        'rx="1"',
      );
    return group(body, opacity);
  }
  CONTEXT.forEach((c, i) => {
    const x = hero - (4 - i) * gap;
    svg += candle(c, x, candleWidth, 1 - ease(zoom * 1.7));
    svg += group(
      text(
        x,
        bottom + 35,
        "14:" + (28 + i),
        C.muted,
        mobile ? 10 : 12,
        'class="number" text-anchor="middle"',
      ),
      1 - zoom,
    );
  });
  svg += candle(state.candle, hero, candleWidth, 1, true);
  if (continuation && min > OPEN) {
    svg += text(
      hero,
      bottom + 18,
      "起點在下方",
      C.muted,
      11,
      'text-anchor="middle"',
    );
  }
  if (wide > 0) {
    svg += group(
      line(
        hero + 30,
        y(state.candle.high),
        615,
        y(state.candle.high),
        C.grid,
        'stroke-dasharray="2 5"',
      ) +
        text(
          630,
          y(state.candle.high) + 4,
          formatPrice(state.candle.high),
          C.buy,
          15,
          'class="number"',
        ) +
        text(hero - 36, y(OPEN) + 4, "起點", C.muted, 12, 'text-anchor="end"'),
      wide,
    );
  }
  svg += group(
    text(
      hero,
      bottom + 35,
      "14:32",
      C.ink,
      mobile ? 11 : 13,
      'class="number" text-anchor="middle"',
    ) +
      (mode === "closing" && state.candle.high > max
        ? ""
        : text(
            hero,
            top - 17,
            "這一分鐘",
            C.buy,
            mobile ? 11 : 13,
            'text-anchor="middle"',
          )),
    1 - zoom,
  );
  svg += group(
    line(
      hero + candleWidth / 2 + 5,
      y(state.price),
      right,
      y(state.price),
      C.buy,
      'stroke-dasharray="3 5" opacity=".45"',
    ),
    1 - zoom,
  );

  // Let quote cards leave before the price scale contracts, so they never pile up.
  const quoteExit =
    mode === "closing"
      ? 1 - (reduced ? Number(elapsed >= 1800) : ease(elapsed / 1800))
      : 1;
  const quoteAlpha =
    ease((zoom - 0.45) / 0.55) * (1 - ease(wide * 2)) * quoteExit;
  const latest = state.trades.at(-1);
  if (quoteAlpha > 0) {
    const bx = mobile ? 151 : 488,
      bw = mobile ? 211 : 305;
    let book = text(
      bx,
      top - 13,
      "被動掛單 · 等待成交",
      C.muted,
      mobile ? 11 : 13,
    );
    const named = time >= 4400 && (mode === "execution" || continuation);
    if (compact > 0) {
      const nearby = focusBids ? state.bids : state.asks;
      for (const row of nearby.slice(1, 3)) {
        const cy = y(row.price);
        if (cy < top + 16 || cy > bottom - 16) continue;
        book += group(
          line(bx, cy + 15, bx + bw, cy + 15, C.grid) +
            text(
              bx + 14,
              cy + 5,
              formatPrice(row.price),
              C.muted,
              14,
              'class="number"',
            ) +
            rect(
              bx + 170,
              cy - 2,
              Math.max(2, 108 * Math.min(1, row.size / 1.8)),
              3,
              focusBids ? C.buy : C.sell,
              'opacity=".5"',
            ),
          compact * 0.7,
        );
      }
    }
    for (const [side, row] of [
      ["sell", state.asks[0]],
      ["buy", state.bids[0]],
    ]) {
      const color = side === "sell" ? C.sell : C.buy;
      const cy = y(row.price),
        isAsk = side === "sell";
      if (continuation && (cy < top + 17 || cy > bottom - 17)) {
        if (side === "buy" && cy > bottom - 17 && compact > 0.5)
          book += text(
            bx,
            bottom - 5,
            "↓ 被動買單 " + formatPrice(row.price),
            C.buy,
            12,
          );
        if (side === "sell" && cy < top + 17 && compact > 0.5)
          book += text(
            bx,
            top + 14,
            "↑ 被動賣單 " + formatPrice(row.price),
            C.sell,
            12,
          );
        continue;
      }
      const event = story.events
        .filter(
          (e) =>
            e.at <= time &&
            time - e.at < 500 &&
            e.price === row.price &&
            ((e.kind === "add" && e.side === side) ||
              (e.kind === "trade" && e.side !== side)),
        )
        .at(-1);
      let qty = row.size;
      if (event && !reduced && !settled) {
        const from =
          event.kind === "add" ? row.size - event.size : row.size + event.size;
        qty = mix(from, row.size, ease((time - event.at) / 450));
      }
      const pulse =
        (mode === "execution" || continuation) &&
        latest?.at >= FIRST_BUY_AT &&
        !reduced &&
        !settled &&
        latest.side !== side
          ? Math.max(0, 1 - (time - latest.at) / 900)
          : 0;
      book += rect(
        bx,
        cy - mix(32, 17, compact),
        bw,
        mix(67, 34, compact),
        "#13232a",
        `rx="4" stroke="${color}" stroke-opacity="${0.22 + pulse * 0.6}"`,
      );
      book += rect(
        bx,
        cy - mix(32, 17, compact),
        3,
        mix(67, 34, compact),
        color,
        'opacity=".65"',
      );
      book += group(
        text(
          bx + 14,
          cy - 13,
          (isAsk ? "被動掛賣" : "被動掛買") +
            (named ? " · Maker" : " · 等待成交"),
          color,
          mobile ? 14 : 13,
        ),
        1 - compact,
      );
      book += text(
        bx + 14,
        cy + 8,
        formatPrice(row.price),
        C.ink,
        mobile ? 17 : 19,
        'class="number"',
      );
      book += text(
        bx + bw - 13,
        cy + 8,
        formatSize(row.size) + " 隻",
        color,
        mobile ? 14 : 15,
        'class="number" text-anchor="end"',
      );
      book += group(
        rect(bx + 14, cy + 20, bw - 28, 3, color, 'opacity=".12" rx="1"') +
          rect(
            bx + 14,
            cy + 20,
            (bw - 28) * Math.min(1, qty / 1.8),
            3,
            color,
            'opacity=".6" rx="1"',
          ),
        1 - compact,
      );
      if (compact > 0)
        book += group(
          text(
            bx + bw + 12,
            cy + 5,
            isAsk ? "被動賣單" : "被動買單",
            color,
            11,
          ),
          compact,
        );
      if (
        continuation &&
        compact === 0 &&
        event?.kind === "add" &&
        (event.side === "sell" || mode === "support" || mode === "closing")
      ) {
        book += text(bx + bw + 12, cy - 13, "補入", color, 12);
      }
    }
    book += text(
      bx,
      continuation
        ? bottom + 25
        : Math.min(H - 75, y(state.bids[0].price) + 56),
      compact > 0.5
        ? `僅聚焦鄰近價位 · ${focusBids ? "下方" : "上方"}仍有掛單`
        : "僅聚焦最近的買賣價位",
      C.muted,
      mobile ? 11 : 12,
    );
    book += line(
      hero + candleWidth / 2 + 5,
      y(state.price),
      bx - 12,
      y(state.price),
      C.buy,
      'stroke-dasharray="3 5" opacity=".65"',
    );
    if (state.candle.high > max && mode !== "closing") {
      book += text(
        hero,
        top - 15,
        "↑ 高點 " + formatPrice(state.candle.high),
        C.muted,
        12,
        'class="number" text-anchor="middle"',
      );
    } else if (state.candle.high <= max) {
      book += text(
        hero,
        top + 8,
        "同一根",
        C.muted,
        mobile ? 10 : 12,
        'text-anchor="middle"',
      );
      book += text(
        hero,
        top + 25,
        "K 線",
        C.ink,
        mobile ? 12 : 14,
        'text-anchor="middle"',
      );
    }
    svg += group(book, quoteAlpha);
    if ((mode === "execution" || continuation) && latest?.at >= FIRST_BUY_AT) {
      const rx = mobile ? 28 : 210,
        ry = mobile ? 388 : 359,
        rw = mobile ? 334 : 585;
      const opacity = reduced ? 1 : ease((time - FIRST_BUY_AT) / 380);
      const fillColor = latest.side === "buy" ? C.buy : C.sell;
      const action = latest.side === "buy" ? "主動買入" : "主動賣出";
      let receipt = rect(
        rx,
        ry,
        rw,
        54,
        "#192d30",
        'rx="4" stroke="#3b6766" stroke-opacity=".55"',
      );
      receipt += text(
        rx + 14,
        ry + 19,
        named ? `最新${action} · Taker` : `一筆${action}，已成交`,
        fillColor,
        mobile ? 13 : 13,
      );
      receipt += text(
        rx + 14,
        ry + 39,
        `${formatSize(latest.size)} 隻  @  ${formatPrice(latest.price)}`,
        C.ink,
        mobile ? 15 : 16,
        'class="number"',
      );
      receipt += text(
        rx + rw - 13,
        ry + 19,
        "14:32:" + (latest.at / 1000).toFixed(2).padStart(5, "0"),
        C.muted,
        mobile ? 10 : 11,
        'class="number" text-anchor="end"',
      );
      if (!mobile)
        receipt += text(
          rx + 330,
          ry + 39,
          latest.side === "buy" ? "↔ 對手方：被動掛賣" : "↔ 對手方：被動掛買",
          C.muted,
          12,
        );
      svg += group(receipt, opacity * quoteAlpha);
      if (!reduced && !settled && time - latest.at < 1000) {
        const t = ease((time - latest.at) / 1000);
        svg += `<circle cx="${mix(bx - 8, hero, t)}" cy="${y(latest.price)}" r="${mobile ? 3 : 4}" fill="${fillColor}" opacity="${Math.sin(Math.PI * t) * quoteAlpha}"/>`;
      }
    }
  }
  if (
    ["absorption", "depletion", "ascent", "high-absorption"].includes(mode) &&
    time >= 13100
  ) {
    const sx = 864 - wide * 88;
    const prior = activeBuys(state, 8000, 20000);
    let stats =
      text(
        sx,
        115,
        mode === "absorption" ? "這段主動買入" : "剛才主動買入",
        C.muted,
        12,
      ) +
      text(
        sx,
        140,
        formatSize(prior),
        mode === "absorption" ? C.buy : C.muted,
        24,
        'class="number"',
      ) +
      text(sx + 76, 140, "隻", C.muted, 11) +
      text(sx, 160, time < 20000 ? "08 秒起 · 累計" : "08–20 秒", C.muted, 11) +
      line(sx, 177, sx + 125, 177, C.grid);
    if ((mode === "ascent" || mode === "high-absorption") && time >= 23500) {
      stats +=
        text(sx, 221, "這段主動買入", C.buy, 12) +
        text(
          sx,
          250,
          formatSize(activeBuys(state, 23000, 29000)),
          C.buy,
          24,
          'class="number"',
        ) +
        text(sx + 89, 250, "隻", C.muted, 11) +
        text(
          sx,
          270,
          time < 29000 ? "23 秒起 · 累計" : "23–29 秒",
          C.muted,
          11,
        );
    }
    svg += group(
      stats,
      (reduced ? 1 : ease((time - 13100) / 550)) *
        (mode === "high-absorption" ? wide : 1),
    );
    if (wide > 0)
      svg += group(
        text(
          hero,
          394,
          "同一根 K 線，已經走到高處。",
          C.ink,
          17,
          'text-anchor="middle"',
        ),
        wide,
      );
  }
  if (mode === "descent" && time >= 41500) {
    const sx = 864;
    const sold = activeVolume(state, "sell", 41000, 50000);
    svg += group(
      text(sx, 112, "這段主動賣出", C.sell, 12) +
        text(sx, 143, formatSize(sold), C.sell, 25, 'class="number"') +
        text(sx, 165, "隻 · 累計已成交", C.muted, 10) +
        text(sx, 183, "41–50 秒", C.muted, 11) +
        line(sx, 204, sx + 113, 204, C.grid) +
        text(sx, 233, "上衝時主動買入", C.muted, 11) +
        text(
          sx,
          259,
          formatSize(activeBuys(state, 23000, 29000)),
          C.buy,
          20,
          'class="number"',
        ) +
        text(sx, 281, "隻 · 23–29 秒", C.muted, 10),
      reduced ? 1 : ease((elapsed - 1100) / 450),
    );
  }
  if (mode === "closing" && state.candle.high > max) {
    svg += text(
      hero,
      top - 15,
      "↑ 高點 " + formatPrice(state.candle.high),
      C.muted,
      12,
      'class="number" text-anchor="middle"',
    );
  }
  if (mode === "closing" && zoom < 0.35) {
    const opacity = reduced ? 1 : ease((0.35 - zoom) / 0.35);
    let landmarks = "";
    for (const [value, label] of [
      [state.candle.high, "最高成交"],
      [state.price, time >= 60000 ? "這一分鐘收盤" : "最新成交"],
    ]) {
      if (value > max) continue;
      landmarks += line(hero + 23, y(value), hero + 45, y(value), C.muted);
      landmarks += text(hero + 56, y(value) - 5, label, C.muted, 12);
      landmarks += text(
        hero + 56,
        y(value) + 16,
        formatPrice(value),
        C.ink,
        15,
        'class="number"',
      );
    }
    svg += group(landmarks, opacity);
  }
  if (mode === "recap") {
    const beat = RECAP_BEATS.find(
      (item) => time >= item.start && time < item.end,
    );
    if (beat) {
      const opacity = reduced
        ? 1
        : ease((time - beat.start) / 600) * ease((beat.end - time) / 600);
      svg += group(
        line(151, 76, 151, 120, C.buy, 'stroke-width="2"') +
          text(170, 87, beat.label + " · 剛才看過的成交", C.muted, 11) +
          text(170, 116, beat.text, C.ink, 20),
        opacity,
      );
    }
  }
  if (mode === "rewind" || mode === "recap-rewind") {
    const width = mobile ? 192 : 264,
      x = (W - width) / 2,
      cy = mobile ? 173 : 165;
    svg += rect(
      x,
      cy,
      width,
      72,
      "#0b151bef",
      'rx="4" stroke="#5d777a" stroke-opacity=".5"',
    );
    svg += text(
      W / 2,
      cy + 29,
      mode === "recap-rewind" ? "回看同一分鐘" : "回到一分鐘前",
      C.ink,
      mobile ? 17 : 21,
      'text-anchor="middle"',
    );
    svg += text(
      W / 2,
      cy + 51,
      mode === "recap-rewind"
        ? "沿著剛才的成交，再看一次"
        : "同一段行情 · 從起點看起",
      C.muted,
      mobile ? 10 : 12,
      'text-anchor="middle"',
    );
  }
  return { svg, viewBox: `0 0 ${W} ${H}`, width: W, height: H };
}
