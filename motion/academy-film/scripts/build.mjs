// Builds index.html from scripts/template.html and scripts/timeline.js: the opening line (one span per
// spoken word), the product UI placed in 3D, the lesson canvas and wall, and assets/audio/sfx.json for mix.mjs.
// Usage: node scripts/build.mjs
import fs from "node:fs";
import { C, END, SPLICE } from "./cues.mjs";

const r = (x) => +x.toFixed(3);
const hash = (i) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------- line one ----------
const WORD_KEYS = ["reading", "the", "market", "was", "never", "meant", "to", "feel", "fragmented"];
const WORD_TEXT = ["Reading", "the", "market", "was", "never", "meant", "to", "feel…", "fragmented."];
// the last word is split into letters so it can come apart as it is spoken
const LINE1 = WORD_TEXT.map((w, i) => (i === 8 ? `<span id="w-8" class="accent frag">${[...w].map((c, k) => `<i id="fl-${k}">${c}</i>`).join("")}</span>` : `<span id="w-${i}">${w}</span>`)).join("");
const WORDS = WORD_KEYS.map((k) => ({ t: C[k] }));

// ---------- icons ----------
const icon = {
  wave: '<svg viewBox="0 0 18 18"><path d="M1 12 L5 6 L9 11 L13 4 L17 9" fill="none" stroke="#8ff0e2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bars: '<svg viewBox="0 0 18 18"><path d="M3 15V9M7 15V4M11 15V7M15 15V11" stroke="#8ff0e2" stroke-width="2.2" stroke-linecap="round"/></svg>',
  candle: '<svg viewBox="0 0 18 18"><path d="M5 2v14M13 3v13" stroke="#8ff0e2" stroke-width="1.6"/><rect x="3" y="5" width="4" height="7" rx="1" fill="#8ff0e2"/><rect x="11" y="7" width="4" height="5" rx="1" fill="#f3a26b"/></svg>',
  sliders: '<svg viewBox="0 0 18 18"><path d="M2 5h14M2 13h14" stroke="#8ff0e2" stroke-width="1.8" stroke-linecap="round"/><circle cx="6" cy="5" r="2.4" fill="#0e1419" stroke="#8ff0e2" stroke-width="1.8"/><circle cx="12" cy="13" r="2.4" fill="#0e1419" stroke="#8ff0e2" stroke-width="1.8"/></svg>',
  chat: '<svg viewBox="0 0 18 18"><path d="M3 4h12v8H8l-4 3v-3H3z" fill="none" stroke="#8ff0e2" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  radar: '<svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="7" fill="none" stroke="#8ff0e2" stroke-width="1.6"/><circle cx="9" cy="9" r="3.5" fill="none" stroke="#8ff0e2" stroke-width="1.6"/><path d="M9 9 L15 5" stroke="#8ff0e2" stroke-width="1.8" stroke-linecap="round"/></svg>',
  gauge: '<svg viewBox="0 0 18 18"><path d="M2 13 A7 7 0 0 1 16 13" fill="none" stroke="#8ff0e2" stroke-width="2" stroke-linecap="round"/><path d="M9 13 L13 7" stroke="#f3a26b" stroke-width="2" stroke-linecap="round"/></svg>',
  post: '<svg viewBox="0 0 18 18"><rect x="2" y="3" width="14" height="12" rx="3" fill="none" stroke="#8ff0e2" stroke-width="1.8"/><path d="M5 7h8M5 10h5" stroke="#8ff0e2" stroke-width="1.6" stroke-linecap="round"/></svg>',
};
const head = (ic, title, right = "") => `<div class="ch"><span class="ic">${icon[ic]}</span>${title}<span class="sp"></span>${right}</div>`;
const seg = (opts, on) => `<span class="seg">${opts.map((o) => `<i${o === on ? ' class="on"' : ""}>${o}</i>`).join("")}</span>`;

// ---------- chart helpers ----------
const series = (n, seed, amp, base) => {
  const out = [];
  let v = base;
  for (let i = 0; i < n; i++) {
    v += (hash(seed + i) - 0.5) * amp + Math.sin((i + seed) * 0.35) * amp * 0.25;
    out.push(v);
  }
  return out;
};
const poly = (vals, w, h, lo, hi) => vals.map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / (hi - lo)) * h).toFixed(1)}`).join(" ");

function rsiCard() {
  const v = series(48, 3, 9, 52).map((x) => Math.max(18, Math.min(86, x)));
  const pts = poly(v, 420, 150, 0, 100);
  return `${head("wave", "RSI", seg(["15m", "1H", "4H"], "1H"))}
    <div class="row" style="height:64px;gap:10px"><span class="num" style="font-size:34px">71.42</span><span class="num up" style="font-size:18px">+6.18</span><span class="sp" style="flex:1"></span><span class="tag s">OVERBOUGHT</span></div>
    <svg width="460" height="170" viewBox="-20 -6 460 170" style="display:block">
      <rect x="0" y="0" width="420" height="45" fill="rgba(243,162,107,0.07)"/><rect x="0" y="105" width="420" height="45" fill="rgba(120,225,213,0.06)"/>
      <line x1="0" y1="45" x2="420" y2="45" stroke="rgba(243,162,107,0.5)" stroke-dasharray="4 5"/><line x1="0" y1="105" x2="420" y2="105" stroke="rgba(120,225,213,0.5)" stroke-dasharray="4 5"/>
      <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(201,183,255,0.35)"/><stop offset="1" stop-color="rgba(201,183,255,0)"/></linearGradient></defs>
      <polygon points="0,150 ${pts} 420,150" fill="url(#rg)"/><polyline points="${pts}" fill="none" stroke="#c9b7ff" stroke-width="2.4"/>
      <text x="426" y="49" fill="#8a9ca5" font-size="13" font-family="JetBrains Mono">70</text><text x="426" y="109" fill="#8a9ca5" font-size="13" font-family="JetBrains Mono">30</text>
    </svg>`;
}
function macdCard() {
  const hist = Array.from({ length: 30 }, (_, i) => Math.sin(i * 0.38 + 0.6) * 46 + (hash(i + 70) - 0.5) * 18);
  const bars = hist.map((v, i) => `<rect x="${i * 14}" y="${v > 0 ? 80 - v : 80}" width="9" height="${Math.abs(v).toFixed(1)}" rx="2" fill="${v > 0 ? "rgba(120,225,213,0.75)" : "rgba(243,162,107,0.75)"}"/>`).join("");
  const l1 = hist.map((v, i) => `${i * 14 + 4},${(80 - v * 0.9 - 6).toFixed(1)}`).join(" ");
  const l2 = hist.map((v, i) => `${i * 14 + 4},${(80 - Math.sin(i * 0.38 + 0.1) * 40).toFixed(1)}`).join(" ");
  return `${head("bars", "MACD", '<span class="num muted" style="font-size:15px">12 · 26 · 9</span>')}
    <div class="row" style="height:46px;gap:18px;font-size:15px"><span><span class="tag n">MACD</span> <span class="num up">0.0182</span></span><span><span class="tag n">SIGNAL</span> <span class="num">0.0141</span></span></div>
    <svg width="440" height="170" viewBox="-12 -8 440 170" style="display:block"><line x1="0" y1="80" x2="420" y2="80" stroke="rgba(255,255,255,0.12)"/>${bars}<polyline points="${l1}" fill="none" stroke="#7aa7ff" stroke-width="2"/><polyline points="${l2}" fill="none" stroke="#e8bd7d" stroke-width="2"/></svg>`;
}
function chartCard() {
  let p = 120, s = "";
  const W = 26, ema = [[], [], []], bbU = [], bbL = [];
  for (let i = 0; i < 28; i++) {
    const o = p;
    p += (hash(i + 40) - 0.47) * 22;
    const c = p, x = 18 + i * W;
    const top = Math.min(o, c), bot = Math.max(o, c);
    const col = c < o ? "#78e1d5" : "#f3a26b";
    s += `<line x1="${x}" y1="${(top - 6 - hash(i + 80) * 12).toFixed(1)}" x2="${x}" y2="${(bot + 6 + hash(i + 90) * 12).toFixed(1)}" stroke="${col}" stroke-width="2"/><rect x="${x - 7}" y="${top.toFixed(1)}" width="14" height="${Math.max(3, bot - top).toFixed(1)}" rx="2" fill="${col}"/>`;
    ema[0].push(`${x},${(p + Math.sin(i / 2) * 6).toFixed(1)}`);
    ema[1].push(`${x},${(118 + Math.sin(i / 4) * 22).toFixed(1)}`);
    ema[2].push(`${x},${(132 + Math.cos(i / 6) * 14).toFixed(1)}`);
    bbU.push(`${x},${(p - 34 - Math.sin(i / 3) * 6).toFixed(1)}`);
    bbL.push(`${x},${(p + 34 + Math.sin(i / 3) * 6).toFixed(1)}`);
  }
  const chips = ["EMA 20", "EMA 50", "EMA 200", "BB", "VWAP", "Ichimoku", "+6"].map((t, i) => `<span class="tag ${i === 6 ? "b" : "n"}" style="margin-right:6px">${t}</span>`).join("");
  return `${head("candle", 'BTC / USDT <span class="muted" style="font-weight:500;margin-left:6px">Perpetual</span>', '<span class="num" style="font-size:22px">104,761.5</span><span class="num up" style="font-size:16px;margin-left:10px">+0.96%</span>')}
    <div style="padding:12px 22px 0">${chips}</div>
    <svg width="760" height="300" viewBox="0 20 760 260" style="display:block;margin-top:6px">
      <polygon points="${bbU.join(" ")} ${bbL.slice().reverse().join(" ")}" fill="rgba(122,167,255,0.08)"/>
      <polyline points="${bbU.join(" ")}" fill="none" stroke="rgba(122,167,255,0.5)" stroke-width="1.5"/><polyline points="${bbL.join(" ")}" fill="none" stroke="rgba(122,167,255,0.5)" stroke-width="1.5"/>
      ${s}
      <polyline points="${ema[0].join(" ")}" fill="none" stroke="#e8bd7d" stroke-width="2"/><polyline points="${ema[1].join(" ")}" fill="none" stroke="#c9b7ff" stroke-width="2"/><polyline points="${ema[2].join(" ")}" fill="none" stroke="#7aa7ff" stroke-width="2"/>
      <line x1="0" y1="${p.toFixed(1)}" x2="760" y2="${p.toFixed(1)}" stroke="rgba(120,225,213,0.6)" stroke-dasharray="4 6"/>
    </svg>`;
}
function indCard() {
  const rows = [["EMA", "20 · 50 · 200", 1], ["Bollinger Bands", "20 · 2.0", 1], ["VWAP", "Session", 1], ["Ichimoku", "9 · 26 · 52", 1], ["Stoch RSI", "14 · 3 · 3", 1], ["Supertrend", "10 · 3", 0], ["Fibonacci", "Auto", 1]];
  return `${head("sliders", "Indicators", '<span class="tag b">11 ON</span>')}
    ${rows.map(([n, p, on]) => `<div class="row" style="height:58px;border-bottom:1.5px solid rgba(255,255,255,0.04)"><div style="flex:1"><div style="font-size:19px;font-weight:600">${n}</div><div class="num muted" style="font-size:13px">${p}</div></div><span class="tg${on ? "" : " off"}"></span></div>`).join("")}`;
}
function chatCard() {
  const m = [["CK", "#f3a26b", "CryptoKing", "LONG now. Last chance before 120K!!", "2m"], ["WA", "#7aa7ff", "WhaleAlerts", "Huge sell wall at 105K. Short it.", "2m"], ["MT", "#c9b7ff", "Mia · Trader", "RSI says overbought… wait?", "1m"], ["JD", "#78e1d5", "Jay", "Indicators are lagging, just ape.", "now"]];
  return `${head("chat", "# btc-signals", '<span class="tag s">128 NEW</span>')}
    ${m.map(([a, c, n, t, ago]) => `<div class="row" style="align-items:flex-start;padding-top:14px"><span class="av" style="background:${c}">${a}</span><div style="flex:1"><div style="font-size:16px;font-weight:700;margin-bottom:5px">${n} <span class="muted num" style="font-size:12px;font-weight:500;margin-left:6px">${ago}</span></div><div class="bubble">${t}</div></div></div>`).join("")}`;
}
function scanCard() {
  const r2 = [["BTC", "BUY", "b", 0.82], ["ETH", "SELL", "s", 0.64], ["SOL", "STRONG BUY", "b", 0.91], ["BNB", "SELL", "s", 0.57], ["XRP", "BUY", "b", 0.48]];
  return `${head("radar", "Signal Scanner", seg(["5m", "15m", "1H"], "15m"))}
    ${r2.map(([s, sig, k, c]) => `<div class="row" style="height:50px;border-bottom:1.5px solid rgba(255,255,255,0.04)"><span class="num" style="width:56px;font-size:17px">${s}</span><span class="tag ${k}" style="width:110px;text-align:center">${sig}</span><span style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,0.06);overflow:hidden"><i style="display:block;height:6px;width:${c * 100}%;background:${k === "b" ? "#78e1d5" : "#f3a26b"}"></i></span><span class="num muted" style="font-size:14px;width:44px;text-align:right">${Math.round(c * 100)}%</span></div>`).join("")}`;
}
function gaugeCard() {
  const a = Math.PI * (1 - 0.72);
  const nx = 120 + Math.cos(a) * 82, ny = 112 - Math.sin(a) * 82;
  return `${head("gauge", "Fear &amp; Greed")}
    <svg width="320" height="170" viewBox="0 -4 240 130" style="display:block;margin:4px auto 0">
      <defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#f3a26b"/><stop offset="0.5" stop-color="#e8bd7d"/><stop offset="1" stop-color="#78e1d5"/></linearGradient></defs>
      <path d="M28 112 A92 92 0 0 1 212 112" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="14" stroke-linecap="round"/>
      <path d="M28 112 A92 92 0 0 1 212 112" fill="none" stroke="url(#gg)" stroke-width="14" stroke-linecap="round" stroke-dasharray="289" stroke-dashoffset="${(289 * 0.28).toFixed(0)}"/>
      <line x1="120" y1="112" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#f1f6f6" stroke-width="4" stroke-linecap="round"/><circle cx="120" cy="112" r="7" fill="#f1f6f6"/>
    </svg>
    <div style="text-align:center;margin-top:-6px"><span class="num" style="font-size:34px">72</span> <span class="up" style="font-size:18px;font-weight:700">GREED</span></div>`;
}
function postCard() {
  return `${head("post", '<span class="av" style="width:30px;height:30px;font-size:12px;background:#e8bd7d;margin-right:4px">MX</span>Max <span class="muted" style="font-weight:500;margin-left:8px">@maxleverage</span>')}
    <div style="padding:16px 22px 6px;font-size:21px;line-height:1.45">BTC to <b>150K</b> by Friday.<br />Not financial advice. Probably.</div>
    <div class="row muted num" style="height:46px;font-size:14px;gap:26px"><span>♥ 2.4K</span><span>⟲ 618</span><span>💬 341</span></div>`;
}

function bookCard() {
  const asks = [[105.2, 18.4], [105.0, 9.1], [104.9, 31.7], [104.8, 6.2]];
  const bids = [[104.7, 12.9], [104.6, 44.0], [104.5, 8.8], [104.4, 21.5]];
  const row = ([p, q], side) => `<div class="row" style="height:36px;font-size:16px"><span class="num ${side}" style="width:90px">${p.toFixed(1)}</span><span style="flex:1;height:22px;position:relative"><i style="position:absolute;right:0;top:3px;height:16px;width:${Math.min(100, q * 2.2)}%;background:${side === "up" ? "rgba(120,225,213,0.18)" : "rgba(243,162,107,0.18)"};border-radius:4px"></i></span><span class="num muted" style="width:56px;text-align:right">${q}</span></div>`;
  return `${head("bars", "Order Book", '<span class="num muted" style="font-size:14px">0.1</span>')}<div style="padding-top:8px">${asks.map((x) => row(x, "dn")).join("")}<div class="row num" style="height:40px;font-size:20px">104.76 <span class="up" style="font-size:14px">▲</span></div>${bids.map((x) => row(x, "up")).join("")}</div>`;
}
function liqCard() {
  const rows = [["SHORT", "dn", "2.4M", "104.9"], ["SHORT", "dn", "860K", "105.1"], ["LONG", "up", "1.1M", "103.8"], ["SHORT", "dn", "3.2M", "105.4"]];
  return `${head("radar", "Liquidations", '<span class="tag s">LIVE</span>')}${rows.map(([sd, k, v, p]) => `<div class="row" style="height:50px;border-bottom:1.5px solid rgba(255,255,255,0.04);font-size:17px"><span class="tag ${k === "up" ? "b" : "s"}">${sd}</span><span class="num" style="flex:1">$${v}</span><span class="num muted">@ ${p}</span></div>`).join("")}`;
}

// x, y, z in the world; w, h of the card; a = resting opacity; opinion cards come into focus later
const CARD_DEFS = [
  { id: "chart", x: -560, y: -230, z: -1520, w: 760, h: 400, a: 0.95, html: chartCard() },
  { id: "rsi", x: 600, y: -300, z: -1270, w: 460, h: 300, a: 0.95, html: rsiCard() },
  { id: "macd", x: 740, y: 250, z: -1580, w: 440, h: 290, a: 0.9, html: macdCard() },
  { id: "ind", x: -760, y: 240, z: -1330, w: 360, h: 480, a: 0.9, html: indCard() },
  { id: "scan", x: -230, y: 340, z: -1720, w: 480, h: 330, a: 0.85, html: scanCard() },
  { id: "gauge", x: -170, y: -360, z: -1080, w: 320, h: 260, a: 0.9, html: gaugeCard() },
  { id: "chat", x: 400, y: 320, z: -1180, w: 500, h: 470, a: 0.97, html: chatCard() },
  { id: "post", x: 600, y: -330, z: -1230, w: 440, h: 200, a: 0.97, html: postCard() },
];
// near the lens from the first frame: soft, out-of-focus product UI drifting past the opening line
const FG_DEFS = [
  { id: "fg-book", x: -840, y: 250, z: 230, w: 380, h: 420, a: 0.9, html: bookCard() },
  { id: "fg-liq", x: 860, y: -300, z: 280, w: 400, h: 290, a: 0.9, html: liqCard() },
];
const OPINION = ["chat", "post", "gauge"];
const objHtml = (c, cls = "card") => `<div class="obj" id="o-${c.id}" data-x="${c.x}" data-y="${c.y}" data-z="${c.z}" data-alpha="0"><div class="face ${cls}" id="c-${c.id}" style="width:${c.w}px;height:${c.h}px">${c.html}</div></div>`;

// ---------- the question ----------
const QTEXT = "衝上去，怎麼又回來？";
const Q = [...QTEXT].map((ch, i) => ({ t: r(C.pick + 0.12 + i * 0.075) }));
const SEND = r(C.question + 0.72);
const qHtml = `<div class="ch" style="height:84px;padding:0 40px;font-size:26px"><img src="assets/img/badge.png" alt="" style="width:44px;height:44px" />MetaBear Academy<span class="sp"></span><span class="tag b">23 堂課</span></div>
  <div class="q-in"><div id="qph">想弄懂什麼？</div><div id="qtext">${[...QTEXT].map((ch, i) => `<span id="q-${i}">${ch}</span>`).join("")}<i id="caret"></i></div>
  <div id="qsend"><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 25 V6 M7 13 L15 5 L23 13" fill="none" stroke="#062521" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" /></svg></div></div>
  <div class="q-chips">${["K 線", "足跡圖", "訂單塊", "合約強平"].map((t) => `<span class="q-chip"><i></i>${t}</span>`).join("")}</div>
  <div id="ripple"></div><div id="cursor"></div>`;

// ---------- the lesson canvas: trades → candle → series → level ----------
const y = (p) => 600 - (p - 100) * 30;
const SERIES_OHLC = [
  [104, 106, 103, 105], [105, 107, 103.5, 104], [104, 104.5, 100.6, 103], [103, 106, 102.8, 105.5], [105.5, 108, 104.5, 107],
  [107, 107.5, 103, 103.5], [103.5, 104, 100.4, 102.8], [102.8, 105, 102.5, 104.6], [104.6, 106.5, 103.8, 106], [106, 106.2, 103, 103.4],
  [103.4, 103.8, 100.8, 103.2], [103.2, 105.6, 102.9, 105.2], [105.2, 107, 104.6, 106.4],
];
const cx = (i) => 90 + i * 82;
const HERO_OHLC = [106.4, 109.4, 105.8, 108.6];
const HERO = { x: 640, toX: cx(13) };
const TOUCH = [2, 6, 10].map((i) => ({ x: cx(i) + 15, y: y(SERIES_OHLC[i][2]) }));
const DOTS = Array.from({ length: 18 }, (_, i) => {
  const buy = hash(i + 200) > 0.38;
  const price = HERO_OHLC[2] + hash(i + 300) * (HERO_OHLC[1] - HERO_OHLC[2]);
  return { id: `dot-${i}`, buy, y: r(y(price)), x0: buy ? -30 : 1430, x1: buy ? 520 - hash(i + 1) * 120 : 800 + hash(i + 1) * 120, t: r(C.trades + ((C.candles1 - 0.45 - C.trades) * i) / 17) };
});
const candle = (id, [o, h, l, c], left, extra = "") => {
  const col = c >= o ? "#78e1d5" : "#f3a26b";
  return `<div class="cdl" id="${id}" style="left:${left}px;top:0${extra}"><div class="wk" style="top:${y(h)}px;height:${y(l) - y(h)}px;background:${col}"></div><div class="bd" style="top:${y(Math.max(o, c))}px;height:${Math.max(4, y(Math.min(o, c)) - y(Math.max(o, c)))}px;background:${col}"></div></div>`;
};
const canvasHtml = `<div class="lesson-top"><span class="kick">市場故事 01</span><span class="ttl">衝上去，怎麼又回來？</span><span class="sp" style="flex:1"></span><span class="tag n">BTC 永續 · 1 分 K</span></div>
  ${[100, 102, 104, 106, 108, 110].map((p) => `<div class="axis" style="top:${y(p) - 9}px">${p}</div>`).join("")}
  <div id="band" style="top:${y(102)}px;height:${y(100) - y(102)}px"></div>
  <div id="band-tag" style="top:${y(100) + 14}px">支撐區 100–102</div>
  ${SERIES_OHLC.map((c, i) => candle(`cdl-${i}`, c, cx(i), ";opacity:0")).join("")}
  <div class="cdl" id="hero-c" style="left:${HERO.x}px;top:0"><div class="wk" id="hero-wk" style="top:${y(HERO_OHLC[1])}px;height:${y(HERO_OHLC[2]) - y(HERO_OHLC[1])}px;background:#78e1d5"></div><div class="bd" id="hero-bd" style="top:${y(HERO_OHLC[3])}px;height:${y(HERO_OHLC[0]) - y(HERO_OHLC[3])}px;background:#78e1d5;box-shadow:0 0 40px rgba(120,225,213,0.55)"></div></div>
  ${TOUCH.map((t, i) => `<div class="touch" id="touch-${i}" style="left:${t.x}px;top:${t.y}px;opacity:0"></div>`).join("")}
  ${DOTS.map((d) => `<div class="dot${d.buy ? "" : " s"}" id="${d.id}"></div>`).join("")}
  <div class="lesson-bot"><span class="num muted" style="font-size:16px">0:12 / 0:36</span><span class="segs">${[1.2, 1, 1.4, 1, 0.8].map((g, i) => `<i style="flex:${g}"${i < 2 ? ' class="done"' : ""}></i>`).join("")}</span><span class="tag n">01 · 一分鐘裡的買賣現場</span></div>`;
const PLAN_ROWS = [["地點", "支撐區 100–102"], ["事件", "回測，賣壓被吸收"], ["確認", "收回區間上方"], ["執行", "確認後才進場"]];
const PLAN = [C.levels2 + 0.15, C.become3, C.become3 + 0.25, C.decisions].map((t) => ({ t: r(t) }));
const planHtml = `${head("sliders", "交易計畫", '<span class="tag b">4 / 4</span>')}
  ${PLAN_ROWS.map(([k, v], i) => `<div class="prow" id="prow-${i}"><div class="ck"><i id="ck-${i}" style="opacity:0"></i><svg viewBox="0 0 22 22" aria-hidden="true"><polyline id="ckp-${i}" points="4,12 9,17 18,6" fill="none" stroke="#062521" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="40" stroke-dashoffset="40" /></svg></div><b>${k}</b><span>${v}</span></div>`).join("")}`;

// ---------- the lesson wall ----------
const lessons = JSON.parse(fs.readFileSync("assets/img/lessons/lessons.json", "utf8"));
const TILES = lessons.slice(0, 18).map((l, i) => {
  const a = (i / 18) * Math.PI * 2 + 0.3;
  return { id: `t-${i}`, img: l.id, x: r(Math.cos(a) * (1250 + (i % 3) * 140)), y: r(Math.sin(a) * (560 + (i % 2) * 120)), z: -4250 - (i % 4) * 230 };
});

const WORLD = [
  `<div class="obj" data-x="0" data-y="0" data-z="0" id="o-line"><div class="face" id="line1" data-layout-allow-overflow>${LINE1}</div></div>`,
  ...FG_DEFS.map((c) => objHtml(c)),
  ...CARD_DEFS.map((c) => objHtml(c)),
  `<div class="obj" id="o-h1" data-x="0" data-y="-10" data-z="-1360"><div class="face headline" id="h1"><span id="h1a">Too Many</span> <span id="h1b">Indicators</span></div></div>`,
  `<div class="obj" id="o-h2" data-x="40" data-y="-40" data-z="-1240"><div class="face headline" id="h2"><span id="h2a">Too Many</span> <span id="h2b">Opinions</span></div></div>`,
  `<div class="obj" id="o-logo" data-x="0" data-y="-30" data-z="-2600" data-alpha="0"><div class="face logo" id="logo"><img id="logo-b" src="assets/img/badge.png" alt="" /><span id="logo-w">MetaBear Academy</span></div></div>`,
  `<div class="obj" id="o-logosub" data-x="0" data-y="100" data-z="-2600" data-alpha="0"><div class="face sub-mono" id="logosub">互動學院 · ORDERFLOW ACADEMY</div></div>`,
  objHtml({ id: "q", x: 0, y: 10, z: -3300, w: 1000, h: 340, html: qHtml }),
  objHtml({ id: "canvas", x: 0, y: -10, z: -4300, w: 1400, h: 760, html: canvasHtml }),
  objHtml({ id: "plan", x: 400, y: 40, z: -4020, w: 480, h: 440, html: planHtml }),
  ...TILES.map((t) => `<div class="obj" id="o-${t.id}" data-x="${t.x}" data-y="${t.y}" data-z="${t.z}" data-alpha="0"><div class="face tile" style="width:420px;height:236px"><img src="assets/img/lessons/${t.img}.jpg" alt="" /></div></div>`),
  `<div class="obj" id="o-l6" data-x="0" data-y="0" data-z="-3700"><div class="face" id="line6"><span id="e-0">Every</span><span id="e-1">move,</span><span id="e-2" class="accent">explained.</span></div></div>`,
].join("\n          ");

const FIN = r(C.voEnd + 0.55);
let html = fs.readFileSync("scripts/template.html", "utf8")
  .replace("__WORLD__", WORLD)
  .replace(/__END__/g, String(END))
  .replace("/*__TIMELINE__*/", fs.readFileSync("scripts/timeline.js", "utf8"))
  .replace("/*__DATA__*/", [
    `const C = ${JSON.stringify(C)};`,
    `const END = ${END};`,
    `const FIN = ${FIN};`,
    `const WORDS = ${JSON.stringify(WORDS)};`,
    `const NFRAG = ${[...WORD_TEXT[8]].length};`,
    `const CARDS = ${JSON.stringify(CARD_DEFS.map(({ id, a }) => ({ id, a })))};`,
    `const FGS = ${JSON.stringify(FG_DEFS.map(({ id, a }) => ({ id, a })))};`,
    `const OPINION = ${JSON.stringify(OPINION)};`,
    `const Q = ${JSON.stringify(Q)};`,
    `const SEND = ${SEND};`,
    `const DOTS = ${JSON.stringify(DOTS)};`,
    `const HERO = ${JSON.stringify(HERO)};`,
    `const NSERIES = ${SERIES_OHLC.length};`,
    `const NTOUCH = ${TOUCH.length};`,
    `const PLAN = ${JSON.stringify(PLAN)};`,
    `const TILES = ${JSON.stringify(TILES.map(({ id }) => ({ id })))};`,
  ].join("\n      "));
if (/__[A-Z0-9_]+__/.test(html)) throw Error("unfilled placeholder " + html.match(/__[A-Z0-9_]+__/)[0]);
fs.writeFileSync("index.html", html);

// ---------- sound: a bed and a handful of deliberate events ----------
const sfx = [];
const add = (type, t, o = {}) => sfx.push({ type, t: r(t), ...o });
const clipAt = (file, t, gain, o = {}) => add("sample", t, { file, gain, ...o });
add("drone", 0, { dur: END, gain: 0.065 });
add("swell", C.fragmented - 0.6, { dur: 1.4, gain: 0.06 });
add("air", C.fragmented + 0.05, { gain: 0.05 });
// fly through the word: the deep whoosh peaks ~0.25 s in, timed to the middle of the dive
clipAt("whoosh-deep", C.l1end + 0.2, 0.5);
add("thock", C.indicators, { gain: 0.1 });
add("thock", C.opinions, { gain: 0.1 });
// so we built…: the sub drop (62 → 27 Hz over ~2.8 s) is the squeeze of every tool into one point
clipAt("sub-drop", C.so - 0.15, 0.19);
// the logo lands out of the drop's tail
clipAt("whoosh-deep", C.metabear - 0.3, 0.35);
add("air", C.metabear + 0.05, { gain: 0.06 });
add("whoosh", C.pick - 0.7, { dur: 0.9, up: true, gain: 0.06 });
Q.forEach((q, i) => add("key", q.t, { gain: 0.16, pitch: 1700 + (i % 4) * 120 }));
clipAt("ui-thud", SEND, 0.55);
clipAt("whoosh-deep", C.watch - 0.4, 0.45);
add("pop", C.candles1 + 0.3, { gain: 0.14 });
add("whoosh", C.candles2 - 0.15, { dur: 0.7, up: false, gain: 0.05 });
clipAt("ui-thud", C.levels1 + 0.05, 0.4);
clipAt("ui-connection", C.and, 1.6);
PLAN.forEach((p, i) => clipAt("ui-thud", p.t, 0.32 + i * 0.06));
add("sub", C.decisions, { gain: 0.18 });
clipAt("whoosh-deep", C.l5end + 0.05, 0.4);
add("swell", C.every - 0.4, { dur: 1.8, gain: 0.05 });
// the lockup: whoosh into a deep bass drop; its crest (~0.3 s in) lands on the badge
clipAt("whoosh-bass-drop", FIN - 0.3, 0.17, { fadeOut: 0.8 });
fs.writeFileSync("assets/audio/sfx.json", JSON.stringify({ end: END, off: r(C.reading - 0.39), pitch: 1, splice: SPLICE, sfx }));
console.log(`index.html ${END}s · ${CARD_DEFS.length + FG_DEFS.length} cards · ${TILES.length} tiles · ${sfx.length} sounds`);
