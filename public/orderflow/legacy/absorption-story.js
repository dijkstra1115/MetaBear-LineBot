import {
  BASE_PRICE,
  CANDLE_INTERVAL,
  CHAPTER_ENDS,
  STORY_DURATION,
  createAbsorptionStory,
  snapshotAt,
} from "./absorption-model.js";

const $ = (selector) => document.querySelector(selector);
const story = createAbsorptionStory();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const smallScreen = matchMedia("(max-width: 720px)");
const price = (value) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
const quantity = (value) => value.toFixed(2);
const delta = (value) => (value >= 0 ? "+" : "") + quantity(value);
const scenes = [
  {
    title: "買單正要進來。",
    copy: "68,420.5 的賣單正在等候成交。鏡頭靠近一點，看看接下來留下什麼。",
    label: "掛單與成交，都在這個盤面裡。",
    camera: 0,
  },
  {
    title: "買單進來，賣單也持續補上。",
    copy: "成交明細不斷出現買入。同一時間，68,420.5 的賣單數量減少、又增加。數量剛被買走，很快又出現新的賣單。",
    label: "靠近 68,420.5，看數量如何變化。",
    camera: 1,
  },
  {
    title: "買了這麼多，卻還在原地。",
    copy: "把鏡頭拉遠：成交量持續累積，K 線卻只在原地小幅波動。每次新補上的賣單，都繼續承接買入。",
    label: "同一筆成交，K 線、成交量與主動買賣差一起變化。",
    camera: 0,
  },
  {
    title: "這次，減少的數量沒有再回來。",
    copy: "買單仍在進來，但 68,420.5 沒再出現新增賣單。眼前的數量逐漸變薄；只要還沒買完，成交就仍然留在這裡。",
    label: "盯住同一檔：它正在變薄。",
    camera: 0.7,
  },
  {
    title: "剩下的買單，開始往上找。",
    copy: "68,420.5 的餘量被吃完。後續買入接著成交在 68,421.0、68,421.5……價格的上移，來自一筆筆更高的成交。",
    label: "先成交完這一檔，再走到上一檔。",
    camera: 0,
  },
];

let stage = 0;
let time = 0;
let camera = 0;
let busy = false;
let paused = false;
let raf = 0;
let last = 0;
let playback = null;
let state = snapshotAt(story, 0);
let lastStateTime = -1;

function text(x, y, content, attrs = "") {
  return (
    '<text x="' + x + '" y="' + y + '" ' + attrs + ">" + content + "</text>"
  );
}
function line(x1, y1, x2, y2, color = "#273442", attrs = "") {
  return (
    '<line x1="' +
    x1 +
    '" y1="' +
    y1 +
    '" x2="' +
    x2 +
    '" y2="' +
    y2 +
    '" stroke="' +
    color +
    '" ' +
    attrs +
    "/>"
  );
}
function rect(x, y, width, height, color, attrs = "") {
  return (
    '<rect x="' +
    x +
    '" y="' +
    y +
    '" width="' +
    Math.max(0, width) +
    '" height="' +
    height +
    '" fill="' +
    color +
    '" ' +
    attrs +
    "/>"
  );
}
function publicTrades() {
  const grouped = [];
  for (const trade of state.trades) {
    const previous = grouped.at(-1);
    if (
      previous &&
      previous.at === trade.at &&
      previous.price === trade.price &&
      previous.side === trade.side
    ) {
      previous.size += trade.size;
    } else grouped.push({ ...trade });
  }
  return grouped;
}

function draw() {
  if (lastStateTime !== time) {
    state = snapshotAt(story, time);
    lastStateTime = time;
  }
  const mobile = smallScreen.matches;
  const W = mobile ? 390 : 900;
  const H = mobile ? 360 : 380;
  const zoom = reducedMotion.matches || mobile ? 0 : camera;
  $("#market").setAttribute(
    "viewBox",
    [20 * zoom, 8 * zoom, W - 20 * zoom, H - 5 * zoom].join(" "),
  );
  const buyColor = "#78e1d5";
  const sellColor = "#e8bd7d";
  let svg = "";
  const x0 = mobile ? 24 : 38;
  const cw = mobile ? 292 : 306;
  const py = mobile ? 30 : 60;
  const ph = mobile ? 60 : 120;
  const cy = mobile ? 144 : 250;
  const ch = mobile ? 22 : 72;
  const cx = (at) => x0 + (at / STORY_DURATION) * cw;
  const priceY = (value) => py + ph - ((value - BASE_PRICE) / 3) * ph;
  const cvdY = (value) => cy + ch - (value / 20) * ch;
  const chartOpacity = 1;
  svg += '<g opacity="' + (mobile ? 1 : chartOpacity) + '">';
  svg += text(
    x0,
    py - 16,
    "K 線 · 3 秒",
    'class="muted" font-size="' + (mobile ? 11 : 10) + '"',
  );
  for (const offset of [0, 1.5, 3]) {
    const y = priceY(BASE_PRICE + offset);
    svg += line(x0, y, x0 + cw, y, "#21303e", 'stroke-dasharray="2 5"');
    svg += text(
      x0 + cw + 8,
      y + 4,
      (BASE_PRICE + offset).toFixed(1),
      'class="muted num" font-size="' + (mobile ? 9 : 9) + '"',
    );
  }
  const candleWidth = ((cw * CANDLE_INTERVAL) / STORY_DURATION) * 0.46;
  const volumeBottom = mobile ? 119 : 224;
  const volumeHeight = mobile ? 12 : 17;
  svg += text(
    x0,
    mobile ? 102 : 200,
    "成交量 BTC",
    'class="muted" font-size="9"',
  );
  svg += line(x0, volumeBottom, x0 + cw, volumeBottom, "#21303e");
  svg += line(
    x0,
    priceY(state.price),
    x0 + cw,
    priceY(state.price),
    "#8b9dab",
    'stroke-dasharray="3 5" opacity=".45"',
  );
  state.candles.forEach((candle) => {
    const x = cx(candle.start + CANDLE_INTERVAL / 2);
    const color =
      candle.close > candle.open
        ? buyColor
        : candle.close < candle.open
          ? sellColor
          : "#ced8e1";
    const active =
      time >= candle.start && time < candle.start + CANDLE_INTERVAL;
    const bodyY = Math.min(priceY(candle.open), priceY(candle.close));
    const bodyHeight = Math.max(
      2,
      Math.abs(priceY(candle.open) - priceY(candle.close)),
    );
    svg +=
      '<g data-candle-start="' +
      candle.start +
      '" data-active="' +
      active +
      '">';
    svg += line(
      x,
      priceY(candle.high),
      x,
      priceY(candle.low),
      color,
      'stroke-width="1.5"',
    );
    svg += rect(
      x - candleWidth / 2,
      bodyY - (bodyHeight === 2 ? 1 : 0),
      candleWidth,
      bodyHeight,
      color,
      'opacity="' + (active ? 1 : 0.8) + '"',
    );
    const height = (candle.volume / 6) * volumeHeight;
    svg += rect(
      x - candleWidth / 2,
      volumeBottom - height,
      candleWidth,
      height,
      color,
      'opacity=".5"',
    );
    svg += "</g>";
  });
  const showDelta = stage >= 2;
  svg += '<g opacity="' + (showDelta ? 1 : 0.25) + '">';
  svg += text(
    x0,
    cy - 13,
    "累計主動買賣差",
    'class="muted" font-size="' + (mobile ? 10 : 10) + '"',
  );
  svg += line(x0, cy + ch, x0 + cw, cy + ch, "#273442");
  let running = 0;
  let dp = "M " + cx(0) + " " + cvdY(0);
  for (const trade of state.trades) {
    running += trade.side === "buy" ? trade.size : -trade.size;
    dp += " H " + cx(trade.at) + " V " + cvdY(running);
  }
  dp += " H " + cx(time);
  svg +=
    '<path d="' +
    dp +
    '" fill="none" stroke="' +
    buyColor +
    '" stroke-width="1.8"/>';
  svg += text(
    x0 + cw + 8,
    cvdY(state.cvd) + 4,
    delta(state.cvd),
    'class="num" fill="' + buyColor + '" font-size="10"',
  );
  svg += "</g>";
  for (const second of [0, 6, 12, 18])
    svg += text(
      cx(second * 1000),
      mobile ? 180 : 345,
      second + "s",
      'class="muted num" font-size="9" text-anchor="middle"',
    );
  svg += "</g>";

  const bx = mobile ? 24 : 438;
  const by = mobile ? 210 : 65;
  const rowHeight = mobile ? 16 : 28;
  const bw = mobile ? 342 : 238;
  svg += text(
    bx,
    by - 20,
    "公開掛單",
    'class="muted" font-size="' + (mobile ? 11 : 10) + '"',
  );
  svg += text(
    bx + bw,
    by - 20,
    "價格 USDT / 數量 BTC",
    'class="muted" font-size="9" text-anchor="end"',
  );
  const recentEvents = story.events.filter(
    (event) => event.at <= time && time - event.at < 780,
  );
  for (let i = 0; i < 9; i++) {
    const level = BASE_PRICE + 3 - i * 0.5;
    const y = by + i * rowHeight;
    const ask = state.asks.find((row) => row.price === level);
    const bid = state.bids.find((row) => row.price === level);
    const row = ask || bid;
    const color = ask ? sellColor : buyColor;
    const levelEvents = recentEvents.filter((event) => event.price === level);
    const additions = levelEvents.filter((event) => event.kind === "add");
    const latest = levelEvents.at(-1);
    const pulse = latest ? 1 - (time - latest.at) / 780 : 0;
    const addPulse = additions.length
      ? 1 - (time - additions.at(-1).at) / 780
      : 0;
    if (level === state.price)
      svg += rect(
        bx - 7,
        y - rowHeight / 2 + 2,
        bw + 14,
        rowHeight - 1,
        "#253341",
        'rx="2"',
      );
    if (row) {
      svg += rect(
        bx + 101,
        y - rowHeight / 2 + 3,
        (row.size / 5) * (bw - 101),
        rowHeight - 3,
        color,
        'opacity="' + (0.12 + addPulse * 0.23) + '"',
      );
    }
    svg += text(
      bx,
      y + 5,
      price(level),
      'class="num" fill="' +
        (row ? color : "#647384") +
        '" font-size="' +
        (mobile ? 12 : 13) +
        '"',
    );
    svg += text(
      bx + bw,
      y + 5,
      row ? quantity(row.size) : "—",
      'class="num" fill="' +
        (row ? "#dce4e9" : "#647384") +
        '" font-size="' +
        (mobile ? 12 : 13) +
        '" text-anchor="end"',
    );
    if (pulse > 0)
      svg += line(
        bx - 7,
        y - rowHeight / 2 + 3,
        bx - 7,
        y + rowHeight / 2,
        latest.kind === "add"
          ? sellColor
          : latest.side === "buy"
            ? buyColor
            : sellColor,
        'stroke-width="3" opacity="' + pulse + '"',
      );
    if (addPulse > 0 && !reducedMotion.matches)
      svg += text(
        bx + bw - 58,
        y + 4,
        "+" + quantity(additions.at(-1).size),
        'class="num" fill="' +
          sellColor +
          '" opacity="' +
          addPulse +
          '" font-size="10" text-anchor="end"',
      );
  }
  if (!mobile) {
    svg += line(407, 35, 407, 345);
    svg += line(705, 35, 705, 345);
    svg += text(733, 45, "逐筆成交", 'class="muted" font-size="10"');
    svg += text(
      875,
      45,
      "BTC",
      'class="muted num" font-size="10" text-anchor="end"',
    );
    const tape = publicTrades().slice(-9).reverse();
    tape.forEach((trade, index) => {
      const y = 81 + index * 28;
      const color = trade.side === "buy" ? buyColor : sellColor;
      const age = Math.min(1, (time - trade.at) / 700);
      if (age < 1)
        svg += rect(
          724,
          y - 17,
          161,
          25,
          color,
          'opacity="' + 0.13 * (1 - age) + '"',
        );
      svg += text(
        733,
        y,
        trade.side === "buy" ? "買" : "賣",
        'fill="' + color + '" font-size="10"',
      );
      svg += text(
        755,
        y,
        price(trade.price),
        'class="num" fill="' + color + '" font-size="11"',
      );
      svg += text(
        875,
        y,
        quantity(trade.size),
        'class="num" fill="' + color + '" font-size="11" text-anchor="end"',
      );
    });
    if (!tape.length)
      svg += text(733, 90, "等待成交", 'class="muted" font-size="11"');
    // A receipt after execution; never depict unobservable incoming orders.
    if (!reducedMotion.matches) {
      for (const trade of publicTrades().filter(
        (trade) => time - trade.at < 700,
      )) {
        const p = (time - trade.at) / 700;
        const y0 = by + ((BASE_PRICE + 3 - trade.price) / 0.5) * rowHeight;
        const x = 688 + p * 44;
        const y = y0 + (78 - y0) * p;
        svg +=
          '<circle cx="' +
          x +
          '" cy="' +
          y +
          '" r="3" fill="' +
          (trade.side === "buy" ? buyColor : sellColor) +
          '" opacity="' +
          (1 - p) +
          '"/>';
      }
    }
  }
  $("#world").innerHTML = svg;
  $("#last-price").textContent = price(state.price);
  $("#delta").textContent = delta(state.cvd);
  $("#clock").textContent = "00:" + (time / 1000).toFixed(2).padStart(5, "0");
  $("#progress").value = time;
  const latest = publicTrades().at(-1);
  $("#recent-fill").textContent = latest
    ? (latest.side === "buy" ? "買入 " : "賣出 ") +
      quantity(latest.size) +
      " @ " +
      price(latest.price)
    : "數量單位 BTC";
  $("#recent-fill").style.color =
    latest?.side === "sell" ? sellColor : buyColor;
  $("#caption").textContent =
    time === 0
      ? "市場暫停在第一筆成交之前。"
      : time <= 10000
        ? "成交與掛單更新，正在交錯發生。"
        : time <= 14000
          ? "68,420.5 的可見賣量：" +
            quantity(
              state.asks.find((row) => row.price === BASE_PRICE + 0.5)?.size ||
                0,
            ) +
            " BTC"
          : "買單逐檔成交，買方掛單也跟著更新。";
}

function controls() {
  document.body.dataset.stage = stage;
  document.body.dataset.busy = String(busy);
  document.body.dataset.paused = String(paused);
  $("#back").disabled = stage === 0;
  $("#action").disabled = busy || stage === scenes.length - 1;
  $("#action").innerHTML =
    stage === 0
      ? '開始觀看 <span aria-hidden="true">→</span>'
      : busy
        ? "播放中"
        : stage === scenes.length - 1
          ? "觀看完成"
          : '下一幕 <span aria-hidden="true">→</span>';
  $("#pause").disabled = !busy;
  $("#pause").textContent = paused ? "繼續" : "暫停";
  $("#closing").hidden = stage !== scenes.length - 1 || busy;
}
function narrative() {
  const scene = scenes[stage];
  $("#chapter").textContent =
    stage === 0 ? "序幕 / 04" : String(stage).padStart(2, "0") + " / 04";
  $("#scene-title").textContent = scene.title;
  $("#scene-copy").textContent = scene.copy;
  $("#camera-label").textContent = scene.label;
}
function describe() {
  $("#market-description").textContent =
    "行情進度 " +
    (time / 1000).toFixed(1) +
    " 秒；最新成交 " +
    price(state.price) +
    "；主動買入 " +
    quantity(state.buy) +
    " BTC，主動賣出 " +
    quantity(state.sell) +
    " BTC，累計差 " +
    delta(state.cvd) +
    " BTC。最佳賣價 " +
    price(state.asks[0].price) +
    "，掛單 " +
    quantity(state.asks[0].size) +
    " BTC。目前 K 線開 " +
    price(state.candles.at(-1).open) +
    "、高 " +
    price(state.candles.at(-1).high) +
    "、低 " +
    price(state.candles.at(-1).low) +
    "、收 " +
    price(state.candles.at(-1).close) +
    "。";
}
function frame(now) {
  if (!busy || paused || !playback) return;
  const elapsed = Math.min(100, now - last);
  last = now;
  playback.elapsed += elapsed;
  const p = Math.min(1, playback.elapsed / playback.duration);
  const eased = 1 - Math.pow(1 - Math.min(1, playback.elapsed / 1600), 3);
  time = playback.fromTime + (playback.toTime - playback.fromTime) * p;
  camera =
    playback.fromCamera + (playback.toCamera - playback.fromCamera) * eased;
  draw();
  if (p === 1) {
    busy = false;
    playback = null;
    describe();
    controls();
  } else raf = requestAnimationFrame(frame);
}
function cancel() {
  cancelAnimationFrame(raf);
  playback = null;
  busy = false;
  paused = false;
}
$("#action").addEventListener("click", () => {
  if (busy || stage === scenes.length - 1) return;
  stage++;
  const toTime = CHAPTER_ENDS[stage];
  playback = {
    fromTime: time,
    toTime,
    fromCamera: camera,
    toCamera: scenes[stage].camera,
    duration: (toTime - time) / 0.8,
    elapsed: 0,
  };
  busy = true;
  paused = false;
  narrative();
  controls();
  last = performance.now();
  raf = requestAnimationFrame(frame);
});
$("#back").addEventListener("click", () => {
  if (stage === 0) return;
  cancel();
  stage--;
  time = CHAPTER_ENDS[stage];
  camera = scenes[stage].camera;
  narrative();
  draw();
  describe();
  controls();
});
function togglePause() {
  if (!busy) return;
  paused = !paused;
  cancelAnimationFrame(raf);
  if (!paused) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  describe();
  controls();
}
$("#pause").addEventListener("click", togglePause);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && busy && !paused) togglePause();
});
window.addEventListener("pagehide", cancel);
// Restore a usable paused scene if this page returns from the back-forward cache.
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  time = CHAPTER_ENDS[stage];
  camera = scenes[stage].camera;
  draw();
  describe();
  controls();
});
smallScreen.addEventListener("change", draw);
reducedMotion.addEventListener("change", draw);
narrative();
draw();
describe();
controls();
