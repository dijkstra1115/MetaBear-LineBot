import { LAB_STEPS, LAB_DEFAULT_SETTINGS, LAB_RATIOS, runLab, summarizeLab } from "./liquidity-lab-engine.js";

const $ = (id) => document.getElementById(id);
const formats = {
  pct: (n) => `${n.toFixed(2)}%`,
  money: (n) => n == null ? "—" : n.toFixed(3),
  price: (cents) => (cents / 100).toFixed(2),
};
const captions = {
  3: ["01", "充足供給", "高", "maker 限價單到達較密集"],
  1: ["02", "均衡供給", "中", "taker 與 maker 到達量接近"],
  0.75: ["03", "偏薄供給", "低", "部分委託深度開始斷續"],
  0.5: ["04", "極薄供給", "極低", "觀察空簿與未成交市價單"],
};
const colors = { up: "#71dfcb", down: "#ef8c9e", grid: "#2c4150", muted: "#8298a6", volume: "#476c7a", stale: "#dcb779" };
let sample;
let sharedScale = true;
let batchVersion = 0;
const settings = () => ({ distance: Number($("distance").value), lifetime: Number($("lifetime").value) });

function sampleMarkup(run) {
  const [number, title, level, note] = captions[run.makerRatio];
  const stats = run.stats;
  return `<article class="path" data-ratio="${run.makerRatio}">
    <div class="path-heading"><div><span class="path-number">${number} / MAKER SUPPLY</span><h2>${title}</h2><p>${note}</p></div><span class="supply-label">${level} · ${run.makerRatio.toFixed(2)} : 1</span></div>
    <div class="chart-wrap"><canvas aria-label="Maker 與 taker 比例 ${run.makerRatio.toFixed(2)} 比一的 K 線及成交量"></canvas></div>
    <div class="stats"><div><span>價格區間</span><strong>${formats.pct(stats.rangePct)}</strong></div><div><span>平均價差</span><strong>${formats.money(stats.avgSpread)}</strong></div><div><span>成交率</span><strong>${formats.pct(stats.fillPct)}</strong></div><div><span>空簿時間</span><strong class="${stats.emptyPct > 5 ? "warning" : ""}">${formats.pct(stats.emptyPct)}</strong></div></div>
  </article>`;
}

function drawChart(canvas, run, globalBounds) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const width = rect.width;
  const height = rect.height;
  const left = 42;
  const right = 10;
  const top = 18;
  const volumeTop = height * 0.79;
  const priceBottom = volumeTop - 18;
  const candles = run.candles;
  let min = sharedScale ? globalBounds.min : Math.min(...candles.map((c) => c.low));
  let max = sharedScale ? globalBounds.max : Math.max(...candles.map((c) => c.high));
  const pad = Math.max(3, (max - min) * 0.09);
  min -= pad;
  max += pad;
  const x = (i) => left + (i + 0.5) * (width - left - right) / candles.length;
  const y = (value) => top + ((max - value) / (max - min)) * (priceBottom - top);
  const step = (width - left - right) / candles.length;

  ctx.font = "10px Consolas, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const value = max - ((max - min) * i) / 4;
    const lineY = y(value);
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, lineY + 0.5);
    ctx.lineTo(width - right, lineY + 0.5);
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.fillText(formats.price(value), left - 6, lineY);
  }

  const maxVolume = Math.max(1, ...candles.map((c) => c.volume));
  candles.forEach((c, i) => {
    const cx = x(i);
    if (c.trades) {
      const up = c.close >= c.open;
      ctx.strokeStyle = up ? colors.up : colors.down;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, y(c.high));
      ctx.lineTo(cx, y(c.low));
      ctx.stroke();
      const bodyTop = Math.min(y(c.open), y(c.close));
      const bodyHeight = Math.max(1.4, Math.abs(y(c.open) - y(c.close)));
      ctx.fillRect(cx - Math.max(1, step * 0.34), bodyTop, Math.max(2, step * 0.68), bodyHeight);
      ctx.fillStyle = colors.volume;
      ctx.fillRect(cx - Math.max(1, step * 0.32), height - 26 - (c.volume / maxVolume) * (height - volumeTop - 34), Math.max(2, step * 0.64), (c.volume / maxVolume) * (height - volumeTop - 34));
    } else {
      ctx.fillStyle = colors.stale;
      ctx.fillRect(cx - step * 0.35, y(c.close), Math.max(1.5, step * 0.7), 1);
    }
  });

  ctx.strokeStyle = colors.grid;
  ctx.beginPath();
  ctx.moveTo(left, volumeTop);
  ctx.lineTo(width - right, volumeTop);
  ctx.stroke();
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = colors.muted;
  ctx.textAlign = "left";
  ctx.fillText("VOL", left, height - 9);
  ctx.textAlign = "right";
  ctx.fillText(`${String(Math.floor(LAB_STEPS / 60)).padStart(2, "0")}:${String(LAB_STEPS % 60).padStart(2, "0")}`, width - right, height - 9);
}

function drawAll() {
  if (!sample) return;
  const bounds = {
    min: Math.min(...sample.runs.flatMap((r) => r.candles.map((c) => c.low))),
    max: Math.max(...sample.runs.flatMap((r) => r.candles.map((c) => c.high))),
  };
  document.querySelectorAll(".path").forEach((node, index) => drawChart(node.querySelector("canvas"), sample.runs[index], bounds));
}

function showSample(seed) {
  const parameters = settings();
  sample = runLab(seed, LAB_RATIOS, LAB_STEPS, parameters);
  $("paths").innerHTML = sample.runs.map(sampleMarkup).join("");
  const count = sample.runs[0].stats.takerOrders;
  $("taker-count").textContent = `固定 taker 訂單 ${count} 筆 · 隨機買賣方向 · 每局 ${LAB_STEPS} 秒（${LAB_STEPS / 60} 分鐘）`;
  requestAnimationFrame(drawAll);
  const url = new URL(location.href);
  url.searchParams.set("seed", String(seed));
  url.searchParams.set("distance", String(parameters.distance));
  url.searchParams.set("lifetime", String(parameters.lifetime));
  history.replaceState(null, "", url);
  showBatch(parameters);
}

function showBatch(parameters) {
  const version = ++batchVersion;
  $("batch-rows").innerHTML = '<tr><td colspan="7">正在計算 40 組種子…</td></tr>';
  setTimeout(() => {
    if (version !== batchVersion) return;
    const seeds = Array.from({ length: 40 }, (_, i) => 58001 + i);
    const rows = summarizeLab(seeds, LAB_RATIOS, LAB_STEPS, parameters);
    if (version !== batchVersion) return;
    $("batch-rows").innerHTML = rows.map((r) => `<tr><th>${r.makerRatio.toFixed(2)} : 1</th><td>${formats.pct(r.rangePct)}</td><td>${formats.money(r.avgSpread)}</td><td>${formats.money(r.avgImpact)}</td><td>${r.volCluster.toFixed(2)}</td><td>${formats.pct(r.fillPct)}</td><td>${formats.pct(r.emptyPct)}</td></tr>`).join("");
  }, 20);
}

$("run").addEventListener("click", () => {
  const seed = Number($("seed").value);
  if (!Number.isSafeInteger(seed) || seed <= 0 || seed > 4294967295) {
    $("seed").setCustomValidity("請輸入 1 至 4294967295 的整數");
    $("seed").reportValidity();
    return;
  }
  $("seed").setCustomValidity("");
  showSample(seed);
});
$("shuffle").addEventListener("click", () => {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  $("seed").value = String(seed);
  showSample(seed);
});
for (const id of ["distance", "lifetime"]) $(id).addEventListener("change", () => showSample(sample.seed));
document.querySelectorAll('input[name="scale"]').forEach((radio) => radio.addEventListener("change", () => {
  sharedScale = document.querySelector('input[name="scale"]:checked').value === "shared";
  drawAll();
}));
new ResizeObserver(drawAll).observe($("paths"));
const params = new URL(location.href).searchParams;
const requestedSeed = Number(params.get("seed"));
const initialSeed = Number.isSafeInteger(requestedSeed) && requestedSeed > 0 && requestedSeed <= 4294967295 ? requestedSeed : 44021;
$("seed").value = String(initialSeed);
for (const [id, fallback] of Object.entries(LAB_DEFAULT_SETTINGS)) {
  const value = params.get(id);
  $(id).value = value && [...$(id).options].some((option) => option.value === value) ? value : String(fallback);
}
showSample(initialSeed);
