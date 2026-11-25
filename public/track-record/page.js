// 實盤交易紀錄: one card per trade from cards.json (scripts/track-record/build-cards.mjs). Each card
// draws the trade on the real minutes around it and shows the point-group messages and the logic.

const MINUTE = 60_000;
const C = { bg: "#05090f", grid: "rgba(120,160,190,0.08)", text: "#c4d0d6", dim: "#73899c", up: "#78e1d5", down: "#f09a5a", gold: "#e8bd7d", white: "#edf2ed" };
const SIDE = { long: "多", short: "空" };
const MATCH = { direct: "", likely: "，沒有點名，依時間與內容推定是這筆" };
const SOURCE = { Binance: "Binance 永續合約逐筆成交", BingX: "BingX 下單合約的 1 分鐘 K 線" };
const NAME = { GOLD: "黃金", BTC: "BTC", ETH: "ETH", SOL: "SOL" };

const taipei = (t, withDate = true) => {
  const d = new Date(t + 8 * 3_600_000).toISOString();
  return withDate ? `${d.slice(0, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)} ${d.slice(11, 16)}` : d.slice(11, 16);
};
const at = (iso) => Date.parse(iso.replace(/\+08:00$/, ":00+08:00"));
const fmt = (p) => p.toLocaleString("en-US", { maximumFractionDigits: 2 });
const signed = (v, d) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(d)}`;
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === "class" ? (n.className = v) : n.setAttribute(k, v);
  for (const k of kids) n.append(k);
  return n;
};

/** Minute bars → bars of `step` minutes. */
function group(bars, step) {
  if (step === 1) return bars;
  const out = new Map();
  for (const [t, o, h, l, c] of bars) {
    const k = Math.floor(t / (step * MINUTE)) * step * MINUTE;
    const b = out.get(k);
    if (!b) out.set(k, [k, o, h, l, c]);
    else (b[2] = Math.max(b[2], h)), (b[3] = Math.min(b[3], l)), (b[4] = c);
  }
  return [...out.values()];
}

function draw(canvas, card) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  if (!card.bars.length) return;
  const step = card.bars.length > 160 ? 5 : 1;
  const bars = group(card.bars, step);
  const axisW = 64;
  const plotW = W - axisW;
  const top = 12;
  const bottom = H - 22;
  const target = card.legs.at(-1).target;
  const prices = [...bars.flatMap((b) => [b[2], b[3]]), card.entry, card.stop, card.legs[0].target, target];
  let lo = Math.min(...prices);
  let hi = Math.max(...prices);
  const pad = (hi - lo) * 0.06;
  lo -= pad;
  hi += pad;
  const y = (p) => top + ((hi - p) / (hi - lo)) * (bottom - top);
  const t0 = bars[0][0];
  const slot = plotW / (bars.length + 2);
  const x = (t) => (((t - t0) / (step * MINUTE)) + 0.5) * slot;

  // Grid and price axis.
  ctx.font = "11px 'JetBrains Mono Variable', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  const tick = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => (hi - lo) / s <= 6) ?? 1000;
  for (let p = Math.ceil(lo / tick) * tick; p <= hi; p += tick) {
    ctx.strokeStyle = C.grid;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y(p)) + 0.5);
    ctx.lineTo(plotW, Math.round(y(p)) + 0.5);
    ctx.stroke();
    ctx.fillStyle = C.dim;
    ctx.fillText(fmt(p), plotW + 8, y(p));
  }
  ctx.textBaseline = "alphabetic";
  // Time labels every ~90 px, skipping one that would run into the previous label.
  const every = Math.max(1, Math.ceil(90 / slot));
  let lastX = -Infinity;
  bars.forEach((b, i) => {
    const lx = x(b[0]) - 16;
    if (i % every || lx < 0 || lx > plotW - 34 || lx < lastX + 44) return;
    ctx.fillStyle = C.dim;
    ctx.fillText(taipei(b[0], false), lx, H - 6);
    lastX = lx;
  });

  // Position box: profit zone to the final target, risk zone to the first stop, entry to exit.
  const x0 = x(card.openT);
  const x1 = card.exit ? x(card.exit.t) : plotW;
  ctx.fillStyle = "rgba(120,225,213,0.13)";
  ctx.fillRect(x0, Math.min(y(card.entry), y(target)), x1 - x0, Math.abs(y(target) - y(card.entry)));
  ctx.fillStyle = "rgba(240,154,90,0.13)";
  ctx.fillRect(x0, Math.min(y(card.entry), y(card.stop)), x1 - x0, Math.abs(y(card.stop) - y(card.entry)));
  const level = (p, color, dash) => {
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x0, Math.round(y(p)) + 0.5);
    ctx.lineTo(plotW, Math.round(y(p)) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  level(card.entry, C.white, []);
  level(card.stop, C.down, [5, 4]);
  level(target, C.up, [5, 4]);

  // 事後分析 zones: the order blocks and FVGs the entry sat in, up to the entry.
  const TF = { 1: "1m", 5: "5m", 15: "15m", 60: "1h" };
  ctx.font = "10.5px 'JetBrains Mono Variable', ui-monospace, monospace";
  (card.analysis?.zones ?? []).forEach((z, i) => {
    const zx = Math.max(0, x(z.t));
    const ya = Math.max(top, y(z.hi));
    const yb = Math.min(bottom, y(z.lo));
    if (yb <= ya || zx >= x0) return;
    ctx.fillStyle = "rgba(232,189,125,0.10)";
    ctx.fillRect(zx, ya, x0 - zx, yb - ya);
    ctx.strokeStyle = "rgba(232,189,125,0.45)";
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(Math.round(zx) + 0.5, Math.round(ya) + 0.5, Math.round(x0 - zx), Math.round(yb - ya));
    ctx.setLineDash([]);
    ctx.fillStyle = C.gold;
    ctx.fillText(`${TF[z.tf]} ${z.kind === "ob" ? "OB" : "FVG"}`, zx + 4 + i * 52, ya + 11);
  });

  // Candles.
  const bw = Math.max(1, Math.min(9, slot * 0.62));
  for (const [t, o, h, l, c] of bars) {
    const cx = Math.round(x(t)) + 0.5;
    ctx.strokeStyle = ctx.fillStyle = c >= o ? C.up : C.down;
    ctx.beginPath();
    ctx.moveTo(cx, y(h));
    ctx.lineTo(cx, y(l));
    ctx.stroke();
    const yo = y(Math.max(o, c));
    ctx.fillRect(cx - bw / 2, yo, bw, Math.max(1, y(Math.min(o, c)) - yo));
  }

  // Axis tags for the three levels.
  const tag = (p, text, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(plotW, y(p) - 9, axisW, 18);
    ctx.fillStyle = C.bg;
    ctx.textBaseline = "middle";
    ctx.fillText(text, plotW + 6, y(p));
    ctx.textBaseline = "alphabetic";
  };
  tag(target, fmt(target), C.up);
  tag(card.stop, fmt(card.stop), C.down);
  tag(card.entry, fmt(card.entry), C.white);

  // Entry, partial closes and the exit.
  const dot = (t, p, color, r = 4.5) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x(t), y(p), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.bg;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineWidth = 1;
  };
  dot(card.openT, card.entry, C.white);
  for (const f of card.fills.slice(0, -1)) dot(f.t, f.price, C.gold, 4);
  if (card.exit) {
    const color = card.exit.r > 0 ? C.up : card.exit.r < 0 ? C.down : C.white;
    dot(card.exit.t, card.exit.price, color, 5.5);
    const text = `${card.exit.label} ${signed(card.exit.r, 1)}R`;
    ctx.font = "600 12px 'Noto Sans TC Variable', system-ui, sans-serif";
    const w = ctx.measureText(text).width + 12;
    const lx = Math.min(plotW - w - 4, x(card.exit.t) + 10);
    const ly = y(card.exit.price) + (card.exit.r < 0 === (card.side === "long") ? 14 : -30);
    ctx.fillStyle = color;
    ctx.fillRect(lx, ly, w, 20);
    ctx.fillStyle = C.bg;
    ctx.fillText(text, lx + 6, ly + 14);
  }
}

function render(card) {
  const posted = at(card.posted);
  const r = card.exit?.r ?? 0;
  const kind = r > 0 ? "win" : r < 0 ? "loss" : "even";
  const head = el(
    "header",
    { class: "tr-head" },
    el("span", { class: "tr-when" }, taipei(posted)),
    el("span", { class: "tr-title" }, `${NAME[card.symbol] ?? card.symbol} `, el("span", { class: `tr-side ${card.side}` }, SIDE[card.side] === "多" ? "做多" : "做空")),
    el("span", { class: `tr-badge ${kind}` }, card.exit ? `${card.exit.label} ${signed(card.exit.r, 2)}R · ${signed(card.exit.pct, 2)}%` : "持倉中"),
  );

  const canvas = el("canvas", { role: "img", "aria-label": `${NAME[card.symbol]} ${taipei(posted)} 的 K 線，標出進場 ${fmt(card.entry)}、停損 ${fmt(card.stop)}、目標 ${fmt(card.legs.at(-1).target)}` });
  const levels = el(
    "div",
    { class: "tr-levels" },
    el("span", {}, "進場 ", el("b", {}, fmt(card.entry))),
    el("span", { class: "stop" }, "停損 ", el("b", {}, fmt(card.stop))),
    el("span", { class: "target" }, "目標 ", el("b", {}, card.targets.map(fmt).join(" / "))),
    ...(card.exit ? [el("span", {}, "出場 ", el("b", {}, `${fmt(card.exit.price)}（${taipei(card.exit.t, false)}）`))] : []),
  );
  const replay = el("a", { href: `/lab/orderflow/?case=${card.case}&m=${card.market}` }, "▶ 在訂單流實驗室重播");
  const figure = el("figure", { class: "tr-chart" }, canvas, levels, el("figcaption", {}, el("span", {}, `資料：${SOURCE[card.source] ?? card.source}`), replay));

  const feed = el("ol", { class: "tr-feed" }, ...card.timeline.map((m) => el("li", {}, el("time", {}, taipei(at(m.t), false)), el("span", {}, m.text))));
  const calls = el("section", {}, el("h3", {}, "點位群原文", el("small", {}, "開單當下公開")), feed);

  let logic;
  if (card.logic.length) {
    logic = el(
      "section",
      {},
      el("h3", {}, "開單邏輯", el("small", {}, "分析群原文")),
      ...card.logic.map((l) => {
        const lt = at(l.t);
        const when = lt > posted ? `開單後 ${taipei(lt)} 補充` : `${taipei(lt)} 開單前`;
        return el("blockquote", { class: "tr-quote" }, el("span", { class: "tr-meta" }, `${when}${MATCH[l.match] ?? ""}`), l.text);
      }),
    );
  } else {
    logic = el(
      "section",
      { class: "tr-facts" },
      el("h3", {}, "開單邏輯"),
      el("p", { class: "tr-none" }, "當時沒有留下開單說明。"),
      el("h4", {}, "盤面紀錄"),
      el("p", {}, "以下依真實數據描述當時發生了什麼，不是開單理由。"),
      el("ul", {}, ...card.facts.map((f) => el("li", {}, f))),
      ...(card.analysis ? analysisOf(card) : []),
    );
  }
  const text = el("div", { class: "tr-text" }, calls, logic, ...(card.notes.length ? [el("ul", { class: "tr-notes" }, ...card.notes.map((n) => el("li", {}, n)))] : []));
  const article = el("article", { class: "tr-card", id: card.id }, head, el("div", { class: "tr-body" }, figure, text));
  return { article, canvas };
}

let validation = null;

/** 事後分析: the LuxAlgo order blocks and FVGs the entry sat in, with how far the check can be trusted. */
function analysisOf(card) {
  const a = card.analysis;
  const ob = validation?.ob;
  const out = [el("h4", {}, "事後分析"), el("p", {}, "用 MetaBear 平常看的 LuxAlgo Smart Money Concepts（預設設定），檢查進場那一刻價格落在 1m、5m、15m、1h 的哪些區域。這是事後依數據比對，不是當時的開單理由。")];
  if (a.lines.length) {
    out.push(el("p", { class: "tr-lead-in" }, `進場價 ${fmt(card.entry)} 位於：`), el("ul", {}, ...a.lines.map((l) => el("li", {}, l)), ...(a.overlap ? [el("li", {}, a.overlap)] : [])));
  } else {
    out.push(el("ul", {}, el("li", {}, `程式沒有比對到訂單塊或 FVG。這不代表當時沒有理由${ob ? `：在寫下開單邏輯的單裡，程式只找到 ${ob.labelled} 個訂單塊中的 ${ob.found} 個` : ""}。`)));
  }
  if (a.historyDays < 5) out.push(el("p", {}, `這筆只取得進場前 ${a.historyDays} 天的 K 線，大時區的結構可能和當時圖上看到的不同。`));
  return out;
}

const RESULT = { win: "止盈", loss: "停損", breakeven: "保本", partial: "部分獲利" };

/** Trades with no chart: the group messages and why they could not be redrawn. */
function renderSkipped(list) {
  const items = list
    .sort((a, b) => (b.posted ?? "").localeCompare(a.posted ?? ""))
    .map((t) =>
      el(
        "li",
        {},
        el("b", {}, `${t.posted ? taipei(at(t.posted)) : "時間不明"} ${NAME[t.symbol] ?? t.symbol} ${t.side === "long" ? "做多" : "做空"} · ${RESULT[t.result] ?? "結果不明"}`),
        el("span", { class: "tr-why" }, `沒有重畫：${t.reason}`),
        el("ol", { class: "tr-feed" }, ...t.timeline.map((m) => el("li", {}, el("time", {}, taipei(at(m.t), false)), el("span", {}, m.text)))),
      ),
    );
  return el("section", { class: "tr-card tr-skipped" }, el("header", { class: "tr-head" }, el("span", { class: "tr-title" }, "沒有圖的交易")), el("ul", {}, ...items));
}

const box = document.getElementById("cards");
try {
  const res = await fetch("/track-record/cards.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(String(res.status));
  const { cards, skipped = [], setupValidation } = await res.json();
  validation = setupValidation;
  const ob = validation?.ob;
  if (ob) {
    document.querySelector(".tr-intro")?.append(
      el("p", { class: "tr-small" }, `沒有留下開單說明的單附「事後分析」：用 LuxAlgo Smart Money Concepts 比對進場價落在哪些訂單塊或 FVG。先拿 ${validation.trades ?? ""} 筆有寫下開單邏輯的單驗證，程式找到其中提到的 ${ob.labelled} 個訂單塊中的 ${ob.found} 個；隨機挑的時間點也有約 ${Math.round(ob.baseRate * 100)}% 會落在訂單塊內，所以「符合」不等於當時就是這個理由。`),
    );
  }
  const drawn = [];
  for (const card of cards.sort((a, b) => b.posted.localeCompare(a.posted))) {
    const { article, canvas } = render(card);
    box.append(article);
    drawn.push([canvas, card]);
  }
  if (skipped.length) box.append(renderSkipped(skipped));
  const redraw = () => drawn.forEach(([canvas, card]) => draw(canvas, card));
  redraw();
  let pending = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(redraw);
  });
  document.fonts?.ready.then(redraw);
} catch (err) {
  box.textContent = `交易紀錄載入失敗（${err.message}），請重新整理。`;
}
