"use strict";
// Independent chart state: source changes clear it before any new response is shown.
const liquidityHeatmap = (() => {
  const el = (id) => document.getElementById(id),
    canvas = el("heatmap-chart");
  const fmt = (v) =>
    Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const compact = (v) =>
    v >= 1e6
      ? `${(v / 1e6).toFixed(2)}M`
      : v >= 1000
        ? `${(v / 1000).toFixed(1)}K`
        : fmt(v);
  const time = (v) => new Date(v).toISOString().slice(11, 19);
  let mode = "live",
    symbol = "BTCUSDT",
    minutes = 60,
    range = 1,
    side = "both",
    threshold = 5;
  let state = null,
    controller = null,
    requestedStamp = null,
    context = "",
    geometry = null,
    selected = null;
  let lastAttempt = 0,
    error = false;
  const palette = [
    [14, 12, 27],
    [44, 31, 83],
    [61, 66, 139],
    [49, 127, 147],
    [108, 192, 146],
    [246, 232, 91],
  ];
  const color = (value) => {
    const t =
      Math.min(1, Math.pow(value / Math.max(1, state.colorMax), 0.55)) *
      (palette.length - 1);
    const i = Math.min(palette.length - 2, Math.floor(t)),
      f = t - i;
    return `rgb(${palette[i].map((v, k) => Math.round(v + (palette[i + 1][k] - v) * f)).join(",")})`;
  };
  function clear() {
    state = null;
    selected = null;
    geometry = null;
    el("heatmap-tooltip").hidden = true;
    el("heatmap-source").textContent =
      mode === "demo" ? "合成示例" : `BYBIT · ${symbol.slice(0, -4)}`;
    el("heatmap-depth").textContent = "正在讀取保存的深度…";
    el("heatmap-coverage").textContent = "—";
    el("heatmap-density").textContent = "—";
    draw();
  }
  async function fetchData(stamp, force = false) {
    if (!context) return;
    if (
      !force &&
      (controller ||
        (stamp === requestedStamp &&
          !error &&
          Date.now() - lastAttempt < 10000))
    )
      return;
    controller?.abort();
    const current = new AbortController();
    controller = current;
    lastAttempt = Date.now();
    const timer = setTimeout(() => current.abort(), 15000);
    if (!state) {
      el("heatmap-empty").hidden = false;
      el("heatmap-empty").textContent = "正在讀取深度歷史…";
    }
    try {
      const query = new URLSearchParams({
        mode,
        symbol,
        minutes: String(minutes),
        range: String(range),
      });
      const response = await fetch(`/api/quant/heatmap?${query}`, {
        signal: current.signal,
      });
      if (!response.ok) throw Error("heatmap_unavailable");
      const result = await response.json();
      if (current !== controller) return;
      state = result;
      requestedStamp = stamp;
      error = false;
      selected = null;
      el("heatmap-tooltip").hidden = true;
      render();
    } catch (e) {
      if (current !== controller) return;
      error = true;
      el("heatmap-status").textContent =
        "熱力圖暫時無法更新；保留的圖像為先前快照，請稍後重試。";
      if (!state) {
        el("heatmap-empty").hidden = false;
        el("heatmap-empty").textContent = "深度歷史暫時無法讀取";
      }
    } finally {
      clearTimeout(timer);
      if (controller === current) controller = null;
    }
  }
  function update(nextMode, nextSymbol, stamp) {
    const nextContext = `${nextMode}:${nextSymbol}`;
    if (context !== nextContext) {
      controller?.abort();
      controller = null;
      context = nextContext;
      mode = nextMode;
      symbol = nextSymbol;
      requestedStamp = null;
      clear();
    }
    void fetchData(stamp);
  }
  function render() {
    if (!state) return;
    const latest = state.latest;
    el("heatmap-source").textContent =
      mode === "demo" ? "合成示例" : `BYBIT · ${symbol.slice(0, -4)}`;
    el("heatmap-depth").textContent = latest
      ? `實際深度 ${fmt(latest.bidLevels)} 買檔 / ${fmt(latest.askLevels)} 賣檔`
      : "等待深度快照";
    el("heatmap-coverage").textContent = latest
      ? `最新覆蓋 −${((1 - latest.low / latest.mid) * 100).toFixed(2)}% / +${((latest.high / latest.mid - 1) * 100).toFixed(2)}%`
      : "—";
    el("heatmap-density").textContent =
      `有資料 ${state.observedColumns} / ${state.totalColumns} 欄`;
    el("heatmap-binning").textContent =
      `${fmt(state.binSize)} USDT / 價格格 · ${state.interval / 1000}s / 時間欄 · UTC`;
    el("heatmap-scale-max").textContent = `${compact(state.colorMax)} (P99)`;
    const mixed = state.columns.some((c) => c && c.source === "recorded-ws");
    const old = mode === "live" && latest && Date.now() - latest.time > 30000;
    el("heatmap-status").textContent =
      mode === "demo"
        ? "合成示例｜用來展示固定價位的大單變化，不計入真實行情績效。顏色是掛單金額，非清算預測。"
        : `${old ? "資料已過期，顯示最後保存快照。 " : ""}${state.error ? "深度 API 異常，僅呈現可用 WS 深度。 " : ""}${mixed ? "部分歷史使用先前保存的 1,000 檔；各欄覆蓋範圍不同。 " : ""}斜線區域未觀測，不代表零掛單。這是可見限價掛單，可能撤回，並非清算預測。`;
    el("heatmap-empty").hidden = state.observedColumns > 0;
    if (!state.observedColumns)
      el("heatmap-empty").textContent =
        "此時間範圍尚無深度紀錄，收集後會逐欄出現";
    draw();
  }
  function draw() {
    const width = canvas.clientWidth,
      height = canvas.clientHeight,
      dpr = Math.min(devicePixelRatio || 1, 2);
    if (!width || !height) return;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const profile = width > 760 ? 102 : 0,
      box = { l: 12, r: width - 72 - profile, t: 22, b: height - 29 };
    ctx.fillStyle = "#0a101b";
    ctx.fillRect(box.l, box.t, box.r - box.l, box.b - box.t);
    // Hatching is the default; only genuinely observed price ranges overwrite it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.l, box.t, box.r - box.l, box.b - box.t);
    ctx.clip();
    ctx.strokeStyle = "#29313c";
    ctx.lineWidth = 0.5;
    for (let x = box.l - height; x < box.r; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, box.b);
      ctx.lineTo(x + height, box.t);
      ctx.stroke();
    }
    ctx.restore();
    if (!state || !state.latest) {
      geometry = null;
      return;
    }
    const y = (p) =>
      box.b - ((p - state.low) / (state.high - state.low)) * (box.b - box.t);
    const cw = (box.r - box.l) / state.columns.length;
    const cutoff = (state.colorMax * threshold) / 100;
    el("heatmap-threshold-value").textContent = `≥ ${compact(cutoff)}`;
    const amount = (cell) =>
      side === "bid" ? cell[1] : side === "ask" ? cell[2] : cell[1] + cell[2];
    const clippedY = (p) => Math.max(box.t, Math.min(box.b, y(p)));
    for (let i = 0; i < state.columns.length; i++) {
      const col = state.columns[i];
      if (!col) continue;
      const x = box.l + i * cw;
      ctx.fillStyle = "#130f23";
      ctx.fillRect(
        x,
        clippedY(col.high),
        Math.ceil(cw),
        Math.max(0, clippedY(col.low) - clippedY(col.high)),
      );
      for (const cell of col.cells) {
        const value = amount(cell);
        if (value <= 0 || value < cutoff) continue;
        const bottom = Math.max(state.low + cell[0] * state.binSize, col.low);
        const top = Math.min(
          state.low + (cell[0] + 1) * state.binSize,
          col.high,
        );
        if (top < bottom || top < state.low || bottom > state.high) continue;
        ctx.fillStyle = color(value);
        ctx.fillRect(
          x,
          clippedY(top),
          Math.ceil(cw),
          Math.max(0.7, clippedY(bottom) - clippedY(top)),
        );
      }
    }
    ctx.font = "10px Consolas,monospace";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#8fa4b6";
    for (let i = 0; i <= 5; i++) {
      const p = state.low + ((state.high - state.low) * i) / 5,
        yy = y(p);
      ctx.strokeStyle = "#7890a322";
      ctx.beginPath();
      ctx.moveTo(box.l, yy);
      ctx.lineTo(box.r, yy);
      ctx.stroke();
      ctx.fillText(fmt(p), box.r + 9, yy);
    }
    const labelCount = width < 500 ? 3 : 6;
    for (let i = 0; i < labelCount; i++) {
      const t =
          state.start + ((state.end - state.start) * i) / (labelCount - 1),
        x = box.l + ((box.r - box.l) * i) / (labelCount - 1);
      ctx.textAlign =
        i === 0 ? "left" : i === labelCount - 1 ? "right" : "center";
      ctx.fillText(time(t).slice(0, 5), x, box.b + 17);
    }
    ctx.textAlign = "left";
    // No interpolation across absent columns, disconnected sessions, or off-screen prices.
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.l, box.t, box.r - box.l, box.b - box.t);
    ctx.clip();
    ctx.beginPath();
    let previous = null;
    state.columns.forEach((col, i) => {
      if (!col) {
        previous = null;
        return;
      }
      const x = box.l + (i + 0.5) * cw,
        yy = y(col.mid);
      if (previous && previous.session === col.session) ctx.lineTo(x, yy);
      else ctx.moveTo(x, yy);
      previous = col;
    });
    ctx.strokeStyle = "#050a12";
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = "#f4f2e8";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.restore();
    if (profile) {
      const last = state.columns.findLast(Boolean),
        px = box.r + 73;
      ctx.fillStyle = "#8fa4b6";
      ctx.font = "9px Consolas,monospace";
      ctx.fillText("最新掛單", px, 10);
      if (last) {
        const max = Math.max(1, ...last.cells.map(amount));
        for (const cell of last.cells) {
          const yy = y(state.low + (cell[0] + 1) * state.binSize),
            h = (box.b - box.t) / state.rowCount;
          const value = amount(cell);
          if (!value || value < cutoff) continue;
          ctx.fillStyle = cell[1] >= cell[2] ? "#78e1d5aa" : "#e58491aa";
          ctx.fillRect(
            px,
            yy,
            ((profile - 12) * value) / max,
            Math.max(0.7, h),
          );
        }
      }
    }
    geometry = { box, cw, y, width, height };
    if (selected) showSelection(ctx);
  }
  function showSelection(ctx) {
    if (!state || !geometry || !selected) return;
    const { box, cw, y } = geometry,
      { col: index, row } = selected,
      col = state.columns[index];
    const low = state.low + row * state.binSize,
      high = low + state.binSize,
      x = box.l + (index + 0.5) * cw,
      yy = y((low + high) / 2);
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "#d4e6efaa";
    ctx.beginPath();
    ctx.moveTo(x, box.t);
    ctx.lineTo(x, box.b);
    ctx.moveTo(box.l, yy);
    ctx.lineTo(box.r, yy);
    ctx.stroke();
    ctx.setLineDash([]);
    const tip = el("heatmap-tooltip");
    tip.hidden = false;
    const cell = col?.cells.find((v) => v[0] === row) ?? [row, 0, 0];
    const overlaps =
      col && ((high > col.low && low < col.high) || cell[1] + cell[2] > 0);
    const detail = !overlaps
      ? "未觀測 · 不代表零掛單"
      : `買盤 ${fmt(cell[1])} USDT\n賣盤 ${fmt(cell[2])} USDT${low < col.low || high > col.high ? "\n此價格格只有部分範圍被觀測" : ""}`;
    const source = col
      ? col.source === "synthetic"
        ? "合成示例"
        : col.source === "bybit-full-rest"
          ? "深度 REST 快照"
          : "歷史 WS 深度"
      : "";
    tip.textContent = `${time(col?.bookTime ?? state.start + index * state.interval)} UTC · ${source}\n${fmt(low)} – ${fmt(high)} USDT\n${detail}`;
    tip.style.left = `${x > geometry.width / 2 ? 18 : Math.max(18, geometry.width - 270)}px`;
  }
  function selectAt(event) {
    if (!geometry || !state) return;
    const rect = canvas.getBoundingClientRect(),
      x = event.clientX - rect.left,
      y = event.clientY - rect.top,
      { box, cw } = geometry;
    if (x < box.l || x > box.r || y < box.t || y > box.b) {
      selected = null;
      el("heatmap-tooltip").hidden = true;
      draw();
      return;
    }
    selected = {
      col: Math.min(state.columns.length - 1, Math.floor((x - box.l) / cw)),
      row: Math.min(
        state.rowCount - 1,
        Math.floor(((box.b - y) / (box.b - box.t)) * state.rowCount),
      ),
    };
    draw();
  }
  canvas.addEventListener("pointermove", selectAt);
  canvas.addEventListener("pointerdown", selectAt);
  canvas.addEventListener("pointerleave", () => {
    selected = null;
    el("heatmap-tooltip").hidden = true;
    draw();
  });
  canvas.addEventListener("keydown", (event) => {
    if (
      !state ||
      !geometry ||
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Enter",
        "Escape",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    if (event.key === "Escape") {
      selected = null;
      el("heatmap-tooltip").hidden = true;
      draw();
      return;
    }
    selected ??= {
      col: Math.max(0, state.columns.findLastIndex(Boolean)),
      row: Math.max(
        0,
        Math.min(
          state.rowCount - 1,
          Math.floor((state.reference - state.low) / state.binSize),
        ),
      ),
    };
    if (event.key === "ArrowLeft") selected.col = Math.max(0, selected.col - 1);
    if (event.key === "ArrowRight")
      selected.col = Math.min(state.columns.length - 1, selected.col + 1);
    if (event.key === "ArrowUp")
      selected.row = Math.min(state.rowCount - 1, selected.row + 1);
    if (event.key === "ArrowDown") selected.row = Math.max(0, selected.row - 1);
    draw();
  });
  for (const button of document.querySelectorAll("[data-heat-minutes]"))
    button.addEventListener("click", () => {
      minutes = Number(button.dataset.heatMinutes);
      for (const b of document.querySelectorAll("[data-heat-minutes]")) {
        b.classList.toggle("selected", b === button);
        b.setAttribute("aria-pressed", String(b === button));
      }
      clear();
      void fetchData(requestedStamp, true);
    });
  el("heatmap-range").addEventListener("change", () => {
    range = Number(el("heatmap-range").value);
    clear();
    void fetchData(requestedStamp, true);
  });
  el("heatmap-side").addEventListener("change", () => {
    side = el("heatmap-side").value;
    draw();
  });
  el("heatmap-threshold").addEventListener("input", () => {
    threshold = Number(el("heatmap-threshold").value);
    draw();
  });
  return { update, resize: draw };
})();
