import { candleAt } from "./primer-model.js";
import {
  visibleOrder,
  pairingAt,
  transfersAt,
  rowsAt,
} from "./primer-animation.js";
import { bear, actor } from "./primer-matching-view.js";
import { clamp, ease, mix } from "./revisit-model.js";
import {
  C,
  text,
  rect,
  line,
  panel,
  frame,
  candle,
  number,
  center,
} from "./mobile-svg.js";

const smooth = (v, reduced) => (reduced ? Number(v >= 1) : ease(v));
const rowY = (i) => 226 + i * 34;
const slot = (size, i) => {
  const row = size > 5 && i >= 5 ? 1 : 0;
  const count = row ? size - 5 : Math.min(size, 5),
    index = row ? i - 5 : i;
  return { x: 180 + (index - (count - 1) / 2) * 65, y: 376 + row * 53 };
};

function chart(state, p) {
  const first = candleAt(state, p.time),
    second = candleAt(state, p.time, 60000);
  const expand =
    p.scene >= 7 ? 1 : p.scene === 6 ? smooth(p.elapsed / 1250, p.reduced) : 0;
  const top = mix(39, 66, expand),
    bottom = mix(111, 324, expand);
  const y = (price) => bottom - ((price - 97) / 14) * (bottom - top);
  const x = mix(79, 160, expand);
  let s = panel(8, mix(116, 365, expand));
  s += text(
    26,
    29,
    p.scene >= 7
      ? "下一分鐘，開始另一根"
      : first.closed
        ? "14:30 · 已收盤"
        : "14:30 · 同一根 K 線",
    C.ink,
    13,
  );
  if (p.scene >= 7) {
    const oldX = mix(160, 97, smooth(p.elapsed / 1400, p.reduced));
    s += candle(first, oldX, y, 27) + candle(second, 259, y, 27);
    s += text(oldX, 352, "14:30", C.muted, 13, `${number} ${center}`);
    s += text(259, 352, second ? "14:31" : "等待成交", C.muted, 13, center);
    if (second)
      s += text(283, y(second.close) + 5, second.close, C.ink, 16, number);
    s += text(180, 416, "新成交記入新 K 線", C.ink, 17, center);
    s += text(180, 445, "上一根的開、高、低、收保持不變", C.muted, 13, center);
    return s;
  }
  if (p.scene < 2)
    s += line(x - 15, y(100), x + 15, y(100), C.ink, 'stroke-width="3"');
  else s += candle(first, x, y, mix(23, 32, expand));
  if (expand > 0) {
    s += text(x - 24, y(100) + 5, "開 100", C.muted, 14, 'text-anchor="end"');
    s += text(x + 26, y(first.high) + 5, `高 ${first.high}`, C.ink, 14);
    s += text(x + 26, y(first.low) + 7, `低 ${first.low}`, C.muted, 14);
    s += text(
      180,
      404,
      first.closed
        ? "收盤 99"
        : `最後 ${(Math.max(0, 60000 - p.time) / 1000).toFixed(2)} 秒`,
      C.ink,
      23,
      `${number} ${center}`,
    );
    s +=
      rect(30, 427, 300, 3, C.grid) +
      rect(30, 427, 300 * clamp((p.time - 59000) / 1000), 3, C.buy);
    s += text(180, 455, "一分鐘結束，市場仍繼續交易", C.muted, 13, center);
  } else {
    s += text(131, 57, first.closed ? "收盤" : "最新成交", C.muted, 13);
    s += text(
      131,
      88,
      `${state.price} 元`,
      first.close < first.open ? C.down : C.buy,
      26,
      number,
    );
    const note =
      p.scene < 2
        ? "掛單還沒成交"
        : p.scene < 4
          ? "起點 100"
          : `高 ${first.high} · 低 ${first.low}`;
    s += text(131, 111, note, C.muted, 13);
    if (p.scene === 3 && p.time >= 16018)
      s += text(329, 56, "103 → 110", C.buy, 13, `${number} text-anchor="end"`);
    if (p.scene === 5)
      s += text(329, 56, "開盤 100", C.muted, 13, 'text-anchor="end"');
  }
  return s;
}

export function drawPrimerMobile({ state, ...p }) {
  const pairing = pairingAt(state, p),
    op = visibleOrder(state, p);
  const incoming = transfersAt(p.time);
  let market = "";
  for (const [x, kind] of [
    [43, "buy"],
    [180, "exchange"],
    [317, "sell"],
  ]) {
    const origin = kind === "exchange" ? 55 : 123;
    market += `<g transform="translate(${x} 151) scale(.55) translate(0 ${-origin})">${actor(0, kind)}</g>`;
  }
  market += panel(194, 123);
  market += text(23, 211, p.scene >= 4 ? "被動掛買" : "等待買入", C.buy, 13);
  market += text(195, 211, p.scene >= 4 ? "被動掛賣" : "等待賣出", C.sell, 13);
  for (const side of ["buy", "sell"]) {
    const rows = rowsAt(state, side, p.scene),
      left = side === "buy" ? 20 : 192,
      color = side === "buy" ? C.buy : C.sell;
    const arriving = incoming.find((o) => o.kind === "add" && o.side === side);
    const future = arriving
      ? [...new Set([...rows.map((r) => r.price), arriving.price])].sort(
          (a, b) => (side === "buy" ? b - a : a - b),
        )
      : [];
    if (!rows.length) market += text(left + 10, 253, "等待委託", C.muted, 13);
    rows.forEach((r, i) => {
      const y = arriving
        ? mix(
            rowY(i),
            rowY(future.indexOf(r.price)),
            smooth((arriving.progress - 0.55) / 0.45, p.reduced),
          )
        : rowY(i);
      const selected =
        pairing?.side === side && pairing.maker.price === r.price;
      market += `<g data-book-side="${side}" data-price="${r.price}" data-book-size="${r.size}">`;
      market += rect(
        left,
        y - 9,
        148,
        30,
        color,
        `fill-opacity="${selected ? 0.12 : 0.035}" rx="4"`,
      );
      market += text(
        left + 3,
        y + 7,
        r.price,
        r.size ? C.ink : C.muted,
        18,
        number,
      );
      if (r.size) {
        for (let j = 0; j < Math.min(r.size, 5); j++)
          market += bear(
            left + 54 + j * 16,
            y + 1,
            5.5,
            color,
            `data-unit="resting" opacity="${selected && j < pairing.count && !p.reduced ? 1 - ease(pairing.progress / 0.22) : 1}"`,
          );
        market += text(
          left + 142,
          y + 20,
          `${r.size} 隻`,
          color,
          11,
          'text-anchor="end"',
        );
      } else market += text(left + 52, y + 8, "成交完", C.muted, 12);
      market += "</g>";
    });
  }
  if (op) {
    const executed = op.fills.flatMap((f) => Array(f.size).fill(f));
    const color = op.side === "buy" ? C.buy : C.sell;
    market += text(
      22,
      340,
      op.limit
        ? `買 ${op.size} 隻 · 最多 ${op.limit} 元`
        : `主動${op.side === "buy" ? "買入" : "賣出"} ${op.size} 隻`,
      color,
      14,
    );
    market += text(
      336,
      340,
      `成交 ${op.filled}/${op.size}`,
      C.ink,
      13,
      `${number} text-anchor="end"`,
    );
    for (let i = 0; i < op.size; i++) {
      const pos = slot(op.size, i),
        filled = executed[i],
        matching = pairing && i >= op.filled && i < op.filled + pairing.count;
      const k = matching ? smooth(pairing.progress, p.reduced) : 0;
      market += rect(
        pos.x - 27,
        pos.y - 22,
        54,
        48,
        filled ? color : C.grid,
        `fill-opacity=".09" stroke="${filled ? color : C.grid}" rx="5"`,
      );
      if (p.time >= op.at)
        market += bear(
          pos.x,
          filled ? pos.y - 7 : mix(pos.y + 1, pos.y - 7, k),
          8,
          filled ? C.ink : color,
          `data-unit="${filled ? "matched" : "pending"}"`,
        );
      market += text(
        pos.x,
        pos.y + 18,
        filled ? `${filled.price} 元` : "待成交",
        filled ? C.ink : C.muted,
        12,
        center,
      );
    }
    if (pairing) {
      const i = rowsAt(state, pairing.side, p.scene).findIndex(
        (r) => r.price === pairing.maker.price,
      );
      for (let j = 0; j < pairing.count; j++) {
        const delay = j * 0.025,
          k = smooth((pairing.progress - delay) / (1 - delay), p.reduced),
          pos = slot(op.size, op.filled + j);
        market += bear(
          mix((pairing.side === "buy" ? 74 : 246) + j * 16, pos.x, k),
          mix(rowY(i) + 1, pos.y - 7, k) - Math.sin(k * Math.PI) * 12,
          mix(5.5, 8, k),
          pairing.side === "buy" ? C.buy : C.sell,
          `data-unit="matching-${pairing.side}"`,
        );
      }
    }
  } else {
    market += text(
      180,
      366,
      p.scene < 2 ? "報價還在等待成交" : "掛買不會直接改變價格",
      C.ink,
      15,
      center,
    );
    market += text(
      180,
      397,
      p.scene < 2 ? "買賣條件不同，先等待。" : "接受報價，才會撮合。",
      C.muted,
      14,
      center,
    );
  }
  for (const o of incoming) {
    const buy = o.side === "buy",
      from = buy ? 43 : 317,
      color = buy ? C.buy : C.sell;
    const rows = [...state[buy ? "bids" : "asks"], { price: o.price }].sort(
      (a, b) => (buy ? b.price - a.price : a.price - b.price),
    );
    const i = Math.max(
      0,
      rows.findIndex((r) => r.price === o.price),
    );
    for (let j = 0; j < o.size; j++) {
      const k = smooth(
        (o.progress - j * 0.04) / (1 - (o.size - 1) * 0.04),
        p.reduced,
      );
      const pos =
        o.kind === "add"
          ? { x: (buy ? 74 : 246) + j * 16, y: rowY(i) + 1 }
          : slot(o.size, j);
      const endY = o.kind === "add" ? pos.y : pos.y + 1;
      market += bear(
        mix(from + (j - (o.size - 1) / 2) * 7, pos.x, k),
        mix(183, endY, k),
        mix(5.5, o.kind === "add" ? 5.5 : 8, k),
        color,
        `data-unit="travelling" data-side="${o.side}"`,
      );
    }
  }
  const fade =
    p.scene >= 7
      ? 0
      : p.scene === 6
        ? 1 - smooth(p.elapsed / 1000, p.reduced)
        : 1;
  return frame(chart(state, p) + `<g opacity="${fade}">${market}</g>`);
}
