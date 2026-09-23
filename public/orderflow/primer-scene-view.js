import {
  visibleOrder,
  pairingAt,
  transfersAt,
  rowsAt,
} from "./primer-animation.js";
export { pairingAt, transfersAt } from "./primer-animation.js";
import { drawPrimerMobile } from "./primer-mobile-view.js";
import { candleAt, sceneElapsedAt } from "./primer-model.js";
import { bear, actor } from "./primer-matching-view.js";
import { clamp, ease, mix } from "./revisit-model.js";

const C = {
  ink: "#e1ebe7",
  muted: "#7f99a2",
  grid: "#293e46",
  buy: "#8bd7c4",
  sell: "#d8b689",
  down: "#d99c88",
  panel: "#101b22",
};
const center = 'text-anchor="middle"',
  number = 'class="number"';
const text = (x, y, s, c = C.muted, size = 12, a = "") =>
  `<text x="${x}" y="${y}" fill="${c}" font-size="${size}" ${a}>${s}</text>`;
const line = (x, y, x2, y2, c = C.grid, a = "") =>
  `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${c}" ${a}/>`;
const rect = (x, y, w, h, c, a = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" ${a}/>`;
const group = (s, a = 1) => `<g opacity="${clamp(a)}">${s}</g>`;
const smooth = (v, reduced) => (reduced ? Number(v >= 1) : ease(v));
const py = (p) => 330 - (p - 97) * 17.3;
const rowY = (i) => 205 + i * 44;
const dockX = (size, i) => 375 + (i - (size - 1) / 2) * (size > 5 ? 44 : 69);
const dockRadius = (size) => (size > 5 ? 8 : 10);

function role(x, y, kind) {
  return `<g transform="translate(${x} ${y}) scale(.75) translate(0 ${kind === "exchange" ? -55 : -123})">${actor(0, kind)}</g>`;
}

function book(state, p, zoom, pairing) {
  let s = rect(160, 151, 430, 180, C.panel, 'rx="7" stroke="#34484f"');
  s += text(174, 175, p.scene >= 4 ? "被動掛買" : "等待買入", C.buy, 11);
  s += text(394, 175, p.scene >= 4 ? "被動掛賣" : "等待賣出", C.sell, 11);
  s += line(376, 185, 376, 315);
  for (const side of ["buy", "sell"]) {
    const color = side === "buy" ? C.buy : C.sell,
      x = side === "buy" ? 170 : 390;
    const rows = rowsAt(state, side, p.scene);
    const incoming = transfersAt(p.time).find(
      (op) => op.kind === "add" && op.side === side,
    );
    const afterArrival = incoming
      ? [...new Set([...rows.map((r) => r.price), incoming.price])].sort(
          (a, b) => (side === "buy" ? b - a : a - b),
        )
      : [];
    if (!rows.length) s += text(x + 94, 220, "等待委託", C.muted, 11, center);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      let y = rowY(i);
      if (incoming)
        y = mix(
          y,
          rowY(afterArrival.indexOf(r.price)),
          smooth((incoming.progress - 0.55) / 0.45, p.reduced),
        );
      const chosen = pairing?.side === side && pairing.maker.price === r.price;
      const bidFocus = p.scene === 4 && side === "buy" && r.price === 103;
      s += `<g data-book-side="${side}" data-price="${r.price}" data-book-size="${r.size}">`;
      s += rect(
        x,
        y - 18,
        190,
        36,
        color,
        `rx="4" fill-opacity="${chosen || bidFocus ? 0.09 : 0.035}" stroke="${color}" stroke-opacity="${chosen || bidFocus ? 0.65 : 0.13}"`,
      );
      s +=
        text(x + 10, y + 6, r.price, r.size ? C.ink : C.muted, 21, number) +
        text(x + 53, y + 5, "元", C.muted, 9);
      if (r.size) {
        for (let j = 0; j < Math.min(r.size, 5); j++) {
          const alpha =
            chosen && j < pairing.count && !p.reduced
              ? 1 - smooth(pairing.progress / 0.22, false)
              : 1;
          s += bear(
            x + 79 + j * 18,
            y,
            6.5,
            color,
            `data-unit="resting" opacity="${alpha}"`,
          );
        }
        s += text(
          x + 179,
          y + 13,
          `${r.size} 隻`,
          color,
          9,
          'text-anchor="end"',
        );
      } else s += text(x + 85, y + 4, "成交完", C.muted, 10);
      s += "</g>";
    }
  }
  return `<g data-camera-zoom="${zoom}" transform="translate(375 241) scale(${zoom}) translate(-375 -241)">${s}</g>`;
}

function transfer(op, state, p, zoom) {
  const buy = op.side === "buy",
    color = buy ? C.buy : C.sell,
    from = buy ? 70 : 645;
  const x = buy ? 170 : 390;
  const queue = [
    ...state[buy ? "bids" : "asks"],
    { price: op.price, size: op.size },
  ].sort((a, b) => (buy ? b.price - a.price : a.price - b.price));
  const index =
    op.kind === "add"
      ? Math.max(
          0,
          queue.findIndex((r) => r.price === op.price),
        )
      : 0;
  const targetY = op.kind === "add" ? 241 + (rowY(index) - 241) * zoom : 389;
  let s = text(
    from,
    153,
    op.kind === "add"
      ? `${op.price} 元 · ${op.size} 隻`
      : op.limit
        ? `最多 ${op.limit} 元`
        : `立即${buy ? "買" : "賣"} ${op.size} 隻`,
    color,
    10,
    center,
  );
  for (let i = 0; i < op.size; i++) {
    const travel = 1 - (op.size - 1) * 0.04;
    const k = smooth((op.progress - i * 0.04) / travel, p.reduced);
    const end =
      op.kind === "add"
        ? 375 + (x + 79 + i * 18 - 375) * zoom
        : dockX(op.size, i);
    s += bear(
      mix(from + (i - (op.size - 1) / 2) * 15, end, k),
      mix(177, targetY, k) + Math.sin(k * Math.PI) * 18,
      mix(7, op.kind === "add" ? 6.5 : dockRadius(op.size), k),
      color,
      `data-unit="travelling" data-side="${op.side}"`,
    );
  }
  return s;
}

function dock(state, p, zoom, op, pairing) {
  const executed = op.fills.flatMap((f) => Array(f.size).fill(f));
  const color = op.side === "buy" ? C.buy : C.sell;
  const label = op.limit
    ? `這張買單：${op.size} 隻 · 最多付 ${op.limit} 元`
    : `主動${op.side === "buy" ? "買入" : "賣出"} ${op.size} 隻`;
  let s = `<g data-matching-order="${op.at}" data-matching-side="${op.side}">`;
  s += text(182, 347, label, color, 11);
  if (p.time >= op.at)
    s += text(
      589,
      347,
      `已成交 ${op.filled}／${op.size} 隻`,
      C.ink,
      11,
      `${number} text-anchor="end"`,
    );
  for (let i = 0; i < op.size; i++) {
    const x = dockX(op.size, i),
      filled = executed[i] !== undefined,
      width = op.size > 5 ? 36 : 46;
    const matching = pairing && i >= op.filled && i < op.filled + pairing.count;
    const progress = matching ? smooth(pairing.progress, p.reduced) : 0;
    s += rect(
      x - width / 2,
      357,
      width,
      61,
      filled ? color : C.grid,
      `rx="5" fill-opacity="${filled ? 0.08 : 0.25}" stroke="${filled ? color : C.grid}" stroke-opacity=".5"`,
    );
    if (p.time >= op.at)
      s += bear(
        x,
        filled ? 377 : mix(389, 377, progress),
        dockRadius(op.size),
        filled ? C.ink : color,
        `data-unit="${filled ? "matched" : "pending"}"`,
      );
    s += text(
      x,
      404,
      filled ? `${executed[i].price} 元` : "待成交",
      filled ? C.ink : C.muted,
      op.size > 5 ? 9 : 10,
      center,
    );
    if (filled && !p.reduced) {
      const age = p.elapsed - sceneElapsedAt(p.scene, executed[i].at);
      const after = clamp(age / 480);
      if (age >= 0 && age < 480)
        s += `<circle cx="${x}" cy="377" r="${dockRadius(op.size) + 3 + after * 7}" fill="none" stroke="${color}" opacity="${0.7 * (1 - after)}"/>`;
    }
  }
  // The pending maker units approach the matching tray. Public data changes only
  // at the actual fill boundary, including during backwards scrubbing.
  if (pairing) {
    const { maker, side, count } = pairing;
    const i = rowsAt(state, side, p.scene).findIndex(
      (r) => r.price === maker.price,
    );
    s += `<g data-pair-order="${op.at}" data-pair-price="${maker.price}" data-pair-progress="${pairing.progress}">`;
    for (let j = 0; j < count; j++) {
      const delay = j * 0.025;
      const progress = smooth(
        (pairing.progress - delay) / (1 - delay),
        p.reduced,
      );
      const fromX = 375 + ((side === "buy" ? 249 : 469) + j * 18 - 375) * zoom,
        fromY = 241 + (rowY(i) - 241) * zoom;
      s += bear(
        mix(fromX, dockX(op.size, op.filled + j), progress),
        mix(fromY, 377, progress) - Math.sin(progress * Math.PI) * 15,
        mix(6.5 * zoom, dockRadius(op.size), progress),
        side === "buy" ? C.buy : C.sell,
        `data-unit="matching-${side}"`,
      );
    }
    s += "</g>";
  }
  return s + "</g>";
}

function candle(c, x, width = 32, alpha = 1) {
  if (!c) return "";
  const color = c.close > c.open ? C.buy : c.close < c.open ? C.down : C.muted;
  return (
    `<g data-candle="true" data-start="${c.start}" data-close="${c.close}" data-high="${c.high}" data-low="${c.low}" opacity="${alpha}">` +
    line(x, py(c.high), x, py(c.low), color, 'stroke-width="1.8"') +
    rect(
      x - width / 2,
      Math.min(py(c.open), py(c.close)),
      width,
      Math.max(2, Math.abs(py(c.close) - py(c.open))),
      color,
      'rx="1"',
    ) +
    "</g>"
  );
}

function chart(state, p, expand) {
  const first = candleAt(state, p.time),
    second = candleAt(state, p.time, 60000);
  const left = mix(716, 185, expand),
    width = 960 - left,
    x = mix(840, 570, expand);
  let s = rect(left, 36, width, 329, C.panel, 'rx="7" stroke="#293e46"');
  const final = p.mode === "next-minute";
  s += text(
    left + 21,
    60,
    final
      ? "下一分鐘，開始另一根"
      : p.scene < 2
        ? "這一分鐘的成交"
        : first.closed
          ? "14:30 · 已收盤"
          : "14:30 · 同一根 K 線",
    C.ink,
    12,
  );
  for (const price of p.scene === 0 ? [100] : [110, 103, 100, 98]) {
    s += line(
      left + 21,
      py(price),
      944,
      py(price),
      C.grid,
      'stroke-dasharray="2 5" opacity=".45"',
    );
    s += text(left + 15, py(price) - 5, price, C.muted, 9, number);
  }
  if (final) {
    const move = smooth(p.elapsed / 1400, p.reduced),
      oldX = mix(570, 390, move);
    s +=
      candle(first, oldX, 38) +
      text(oldX, 347, "14:30 · 已收盤", C.muted, 11, center);
    s += candle(second, 740, 38);
    s += text(
      740,
      347,
      second?.closed
        ? "14:31 · 已收盤"
        : second
          ? "14:31 · 正在形成"
          : "14:31 · 等待第一筆成交",
      C.muted,
      11,
      center,
    );
    if (second)
      s += text(
        785,
        py(second.close) + 4,
        `${second.closed ? "收盤" : "目前"} ${second.close}`,
        C.ink,
        12,
        number,
      );
    else
      s += line(
        723,
        py(state.price),
        757,
        py(state.price),
        C.muted,
        'stroke-dasharray="3 3"',
      );
    s += text(
      210,
      395,
      p.time === 120000
        ? "接著進入 14:32，看看另一段價格急漲與回落。"
        : "上一根保留開、高、低、收；新成交記進下一根。",
      C.muted,
      12,
    );
    return s;
  }
  if (p.scene < 2) {
    s += line(x - 16, py(100), x + 16, py(100), C.ink, 'stroke-width="2"');
    s += `<circle cx="${x}" cy="${py(100)}" r="4" fill="${C.ink}"/>`;
    s += text(x + 31, py(100) + 4, "成交 100", C.ink, 12, number);
    s += text(x, 345, "掛單增加，成交價不變", C.muted, 10, center);
    return s;
  }
  s += candle(first, x, mix(32, 44, expand));
  const closed = first.closed;
  s += text(
    x + 34,
    py(first.close) + 4,
    `${closed ? "收盤" : "目前"} ${first.close}`,
    first.close < first.open ? C.down : C.buy,
    12,
    number,
  );
  if (first.close !== first.open)
    s += text(
      x - 34,
      py(first.open) + 4,
      `${p.scene >= 5 ? "開盤" : "起點"} ${first.open}`,
      C.muted,
      10,
      `${number} text-anchor="end"`,
    );
  if (p.scene >= 4 && first.high > Math.max(first.open, first.close)) {
    s += text(
      x + 34,
      py(first.high) + 4,
      `最高 ${first.high}`,
      C.ink,
      11,
      number,
    );
    if (p.scene === 4)
      s += text(
        x - 31,
        (py(first.high) + py(first.close)) / 2,
        "上影線",
        C.sell,
        10,
        'text-anchor="end"',
      );
  }
  if (p.scene >= 5 && first.low < Math.min(first.open, first.close))
    s += text(
      x + 34,
      py(first.low) + 4,
      `最低 ${first.low}`,
      C.ink,
      11,
      number,
    );
  if (p.scene === 5)
    s += text(
      x,
      345,
      p.time >= 49006
        ? "反彈到 99，仍低於開盤 100"
        : first.close < first.open
          ? "橘色：目前低於開盤"
          : "顏色比較目前與開盤",
      C.muted,
      10,
      center,
    );
  else
    s += text(
      x,
      345,
      closed ? "這一分鐘的開、高、低、收" : "分鐘還沒結束，這根持續更新",
      C.muted,
      10,
      center,
    );
  const last = state.trades.at(-1),
    recent = last.at > 0 && p.time - last.at < 1200;
  if (recent)
    s += `<circle data-fill-pulse="${last.price}" cx="${x}" cy="${py(first.close)}" r="${p.reduced ? 5 : 7 + 2 * Math.sin(p.elapsed / 300)}" fill="none" stroke="${last.side === "buy" ? C.buy : C.sell}" opacity=".5"/>`;
  if (p.mode === "close") {
    const remain = Math.max(0, 60000 - p.time) / 1000;
    s += text(
      210,
      399,
      closed ? "這根收盤，市場仍繼續交易。" : "最後 1 秒 · 慢放",
      C.muted,
      12,
    );
    s +=
      rect(210, 377, 680, 2, C.grid) +
      rect(210, 377, 680 * (1 - remain), 2, C.buy);
    s += text(
      891,
      399,
      closed ? "一分鐘完成" : `剩餘 ${remain.toFixed(2)} 秒`,
      C.ink,
      14,
      `${number} text-anchor="end"`,
    );
  }
  return s;
}

export function drawPrimer({ state, ...p }) {
  if (p.mobile) return drawPrimerMobile({ state, ...p });
  const expand =
    p.scene >= 7 ? 1 : p.scene === 6 ? smooth(p.elapsed / 1250, p.reduced) : 0;
  const zoom =
    p.scene >= 2 && p.scene <= 4
      ? 1 + 0.06 * smooth(p.elapsed / 900, p.reduced)
      : 1;
  let market =
    role(70, 80, "buy") + role(645, 80, "sell") + role(375, 42, "exchange");
  const op = visibleOrder(state, p),
    pairing = pairingAt(state, p);
  market += book(state, p, zoom, pairing);
  if (op) market += dock(state, p, zoom, op, pairing);
  else {
    const last = state.trades.at(-1);
    const sentence =
      p.scene === 0
        ? "上一筆成交 100 元 · 掛單還在等待"
        : p.scene === 1
          ? "110 元只是賣家報價，還沒有在那裡成交"
          : p.scene === 4
            ? p.time >= 32006
              ? "主動賣出 2 隻 ↔ 被動掛買 · 103 元成交"
              : "買方掛 103 元，等待賣方接受"
            : `最近成交：${last.size} 隻 × ${last.price} 元`;
    market +=
      rect(160, 355, 430, 56, C.panel, 'rx="5" stroke="#293e46"') +
      (transfersAt(p.time).some((op) => op.kind === "submit")
        ? ""
        : text(375, 387, sentence, C.muted, 11, center));
  }
  for (const op of transfersAt(p.time)) market += transfer(op, state, p, zoom);
  let svg = group(market, 1 - expand) + chart(state, p, expand);
  if (p.scene === 3 && p.time >= 16018)
    svg +=
      text(707, 394, "103 → 110", C.buy, 17, number) +
      text(707, 417, "104–109 沒有成交", C.muted, 11);
  if (p.scene === 4 && p.time >= 32006)
    svg +=
      text(716, 397, "目前回到 103", C.ink, 13) +
      text(716, 418, "最高成交仍是 110", C.muted, 11);
  if (p.scene === 5)
    svg +=
      text(716, 397, "實體：開盤到目前", C.ink, 12) +
      text(716, 418, "影線：已成交的高低點", C.muted, 11);
  return { svg };
}
