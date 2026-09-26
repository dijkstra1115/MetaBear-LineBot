import { CANDLE_TICKS, STEP_MS } from "./exchange-market.js";

export const formatPrice = (value) =>
  (value / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const formatSize = (value) =>
  (value / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const formatCash = (value, digits = 2) =>
  (value / 10000).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
export const formatTime = (ticks) => {
  const seconds =
    ticks < 0
      ? Math.ceil((Math.abs(ticks) * STEP_MS) / 1000)
      : Math.floor((ticks * STEP_MS) / 1000);
  const hours = Math.floor(seconds / 3600);
  return (
    (ticks < 0 ? "−" : "") +
    (hours ? String(hours).padStart(2, "0") + ":" : "") +
    String(Math.floor(seconds / 60) % 60).padStart(2, "0") +
    ":" +
    String(seconds % 60).padStart(2, "0")
  );
};

import {
  aggregateCandles,
  candlesInRange,
  footprintRows,
  priceIncrement,
  ChartViewport,
} from "./exchange-chart-data.js";
export { aggregateCandles } from "./exchange-chart-data.js";
const compact = (lots) => {
  const n = lots / 100;
  return Math.abs(n) >= 1000
    ? `${(n / 1000).toFixed(1)}k`
    : n.toFixed(n % 1 ? 2 : 0);
};
const mint = "#9adcca",
  gold = "#dfb785";

export class ExchangeChart {
  constructor(canvas, meta, onView = () => {}) {
    this.canvas = canvas;
    this.meta = meta;
    this.onView = onView;
    this.mode = "candles";
    this.frame = CANDLE_TICKS / 4;
    this.viewport = new ChartViewport();
    this.indicators = {
      volume: true,
      footprint: false,
      cvd: false,
      heatmap: false,
      delta: false,
    };
    this.pointer = null;
    this.world = null;
    this.pointers = new Map();
    this.resize = new ResizeObserver(() => this.draw());
    this.resize.observe(canvas.parentElement);
    const point = (e) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (this.mode !== "candles" || e.button !== 0) return;
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, point(e));
      this.pointer = point(e);
      this.drag = { x: e.clientX, y: e.clientY };
      this.pinch = null;
    });
    canvas.addEventListener("pointermove", (e) => {
      this.pointer = point(e);
      if (this.pointers.has(e.pointerId)) {
        this.pointers.set(e.pointerId, point(e));
        if (this.pointers.size === 2) {
          const [a, b] = [...this.pointers.values()];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (this.pinch && distance > 0)
            this.zoom(distance / this.pinch, (a.x + b.x) / 2);
          this.pinch = distance;
        } else if (this.drag && this.geometry) {
          this.viewport.pan(
            e.clientX - this.drag.x,
            this.geometry.range,
            this.frame * 4,
          );
        }
        this.drag = { x: e.clientX, y: e.clientY };
      }
      this.draw();
    });
    const release = (e) => {
      this.pointers.delete(e.pointerId);
      this.drag = null;
      this.pinch = null;
      if (canvas.hasPointerCapture(e.pointerId))
        canvas.releasePointerCapture(e.pointerId);
      this.draw();
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("pointerleave", () => {
      if (!this.pointers.size) this.pointer = null;
      this.draw();
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (this.mode !== "candles") return;
        e.preventDefault();
        const delta =
          e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 300 : 1);
        if (
          (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) &&
          this.geometry
        ) {
          this.viewport.pan(
            -(e.deltaX || delta),
            this.geometry.range,
            this.frame * 4,
          );
          this.draw();
        } else
          this.zoom(
            Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.006),
            point(e).x,
          );
      },
      { passive: false },
    );
    canvas.addEventListener("dblclick", () => this.live());
    canvas.addEventListener("keydown", (e) => {
      if (this.mode !== "candles" || !this.geometry) return;
      if (
        ["ArrowLeft", "ArrowRight", "Home", "End", "+", "=", "-"].includes(
          e.key,
        )
      ) {
        e.preventDefault();
        if (e.key === "End") this.live();
        else if (e.key === "Home")
          this.viewport.end = this.geometry.range.oldest;
        else if (["+", "=", "-"].includes(e.key))
          this.zoom(e.key === "-" ? 0.75 : 1.333);
        else
          this.viewport.pan(
            (e.key === "ArrowLeft" ? 1 : -1) * this.geometry.plotW * 0.3,
            this.geometry.range,
            this.frame * 4,
          );
        this.draw();
      }
    });
  }

  live() {
    this.viewport.live();
    this.draw();
  }
  zoom(factor, px) {
    if (!this.geometry || this.mode !== "candles") return;
    const { left, plotW, range } = this.geometry;
    const anchor =
      px === undefined ? 1 : Math.max(0, Math.min(1, (px - left) / plotW));
    this.viewport.zoom(factor, anchor, range, this.frame * 4);
    this.draw();
  }
  draw(world = this.world) {
    if (!world) return;
    if (
      this.world &&
      (world.seed !== this.lastSeed || world.tick < this.lastTick)
    )
      this.viewport.live();
    this.world = world;
    this.lastSeed = world.seed;
    this.lastTick = world.tick;
    const { width, height } = this.canvas.getBoundingClientRect();
    if (width < 50 || height < 50) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (
      this.canvas.width !== Math.round(width * dpr) ||
      this.canvas.height !== Math.round(height * dpr)
    ) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    const c = this.canvas.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, width, height);
    c.font = "10px Consolas, monospace";
    c.lineWidth = 1;
    if (this.mode === "depth") {
      this.depth(c, width, height, world);
      this.onView({ depth: true });
    } else this.candles(c, width, height, world);
  }

  candles(c, width, height, world) {
    if (!world.candles.length) return;
    const right = width < 500 ? 60 : 72,
      left = 10,
      top = 22;
    const plotW = width - right - left,
      bottom = height - 27;
    const ticks = this.frame * 4;
    const range = this.viewport.range(
      world.candles[0].time,
      world.candles.at(-1).time,
      plotW,
      ticks,
    );
    const from = Math.floor(range.start / ticks) * ticks;
    const raw = candlesInRange(
      world.candles,
      this.frame,
      range.start,
      range.end,
    );
    const bars = aggregateCandles(raw, this.frame);
    if (!bars.length) return;
    const paneCount =
      Number(this.indicators.volume) +
      Number(this.indicators.cvd) +
      Number(this.indicators.delta);
    const paneH = paneCount
      ? Math.min(64, ((bottom - top) * 0.4) / paneCount)
      : 0;
    const priceBottom = bottom - paneH * paneCount - (paneCount ? 12 : 0);
    const plotH = priceBottom - top;
    let low = Math.min(...bars.map((b) => b.low)),
      high = Math.max(...bars.map((b) => b.high));
    const pad = Math.max((high - low) * 0.13, 15);
    low -= pad;
    high += pad;
    const increment = priceIncrement(((high - low) * 17) / plotH);
    const footprint = this.indicators.footprint && this.viewport.spacing >= 92;
    if (footprint) {
      low -= increment;
      high += increment;
    }
    const y = (p) => top + ((high - p) / (high - low)) * plotH;
    const x = (time) =>
      left + ((time - range.start) / ticks) * this.viewport.spacing;
    const center = (bar) => x(bar.time) + this.viewport.spacing / 2;
    this.geometry = { left, plotW, range };
    c.textAlign = "left";
    for (let i = 0; i <= 4; i++) {
      const price = high - ((high - low) * i) / 4,
        py = y(price);
      c.strokeStyle = "#213038";
      c.setLineDash([2, 5]);
      c.beginPath();
      c.moveTo(left, py);
      c.lineTo(width - right, py);
      c.stroke();
      c.fillStyle = "#6e848d";
      c.fillText(formatPrice(price), width - right + 7, py + 3);
    }
    c.setLineDash([]);
    c.save();
    c.beginPath();
    c.rect(left, top, plotW, bottom - top);
    c.clip();
    if (this.indicators.heatmap)
      this.heatmap(c, raw, x, y, top, priceBottom, increment);
    if (range.start < 0 && range.end >= 0) {
      c.strokeStyle = "#40544c";
      c.setLineDash([2, 6]);
      c.beginPath();
      c.moveTo(x(0), top);
      c.lineTo(x(0), bottom);
      c.stroke();
      c.setLineDash([]);
    }
    for (const bar of bars) {
      const color = bar.close >= bar.open ? mint : gold;
      const px = footprint ? x(bar.time) + 4 : center(bar);
      const bodyW = footprint
        ? 3
        : Math.max(1, Math.min(14, this.viewport.spacing * 0.62));
      c.strokeStyle = color;
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(px, y(bar.high));
      c.lineTo(px, y(bar.low));
      c.stroke();
      c.fillRect(
        px - bodyW / 2,
        Math.min(y(bar.open), y(bar.close)),
        bodyW,
        Math.max(1.5, Math.abs(y(bar.open) - y(bar.close))),
      );
      if (footprint)
        this.footprint(c, bar, x(bar.time), y, increment, top, priceBottom);
    }
    // Present-day orders are only meaningful at the live chart edge.
    if (this.viewport.end === null)
      for (const order of world.exchange.orders.filter(
        (o) => o.owner === "player",
      )) {
        if (order.price < low || order.price > high) continue;
        const py = y(order.price);
        c.strokeStyle = order.side === "buy" ? "#9adcca66" : "#dfb78566";
        c.setLineDash([4, 4]);
        c.beginPath();
        c.moveTo(left, py);
        c.lineTo(width - right, py);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = order.side === "buy" ? mint : gold;
        c.fillText(
          `${order.side === "buy" ? "買" : "賣"} ${formatSize(order.remaining)}`,
          left + 4,
          py - 5,
        );
      }
    for (const trade of world.exchange.playerTrades) {
      if (trade.time < from || trade.time >= range.end) continue;
      const buy =
        trade.taker === "player" ? trade.side === "buy" : trade.side === "sell";
      const px =
        x(Math.floor(trade.time / ticks) * ticks) + this.viewport.spacing / 2;
      const py = y(trade.price) + (buy ? 10 : -10);
      c.fillStyle = buy ? "#b4eedc" : "#f3d5ad";
      c.beginPath();
      c.moveTo(px, py + (buy ? -5 : 5));
      c.lineTo(px - 4, py + (buy ? 2 : -2));
      c.lineTo(px + 4, py + (buy ? 2 : -2));
      c.closePath();
      c.fill();
    }
    let paneTop = priceBottom + 12;
    const paneList = [];
    for (const name of ["volume", "delta", "cvd"])
      if (this.indicators[name]) {
        paneList.push({ name, top: paneTop, bottom: paneTop + paneH });
        this.indicatorPane(c, name, bars, center, left, plotW, paneTop, paneH);
        paneTop += paneH;
      }
    c.restore();
    const last = world.exchange.lastPrice;
    if (last >= low && last <= high) {
      const py = y(last),
        color = last >= bars[0].open ? mint : gold;
      c.strokeStyle = color;
      c.globalAlpha = 0.5;
      c.setLineDash([3, 4]);
      c.beginPath();
      c.moveTo(left, py);
      c.lineTo(width - right, py);
      c.stroke();
      c.globalAlpha = 1;
      c.setLineDash([]);
      c.fillStyle = color;
      c.fillRect(width - right + 2, py - 10, right - 4, 20);
      c.fillStyle = "#10211b";
      c.textAlign = "left";
      c.fillText(formatPrice(last), width - right + 7, py + 3);
    }
    const labelEvery = Math.max(1, Math.ceil(85 / this.viewport.spacing));
    c.textAlign = "center";
    for (const bar of bars)
      if (
        Math.round(bar.time / ticks) % labelEvery === 0 &&
        center(bar) > left + 25 &&
        center(bar) < width - right - 25
      ) {
        c.fillStyle = "#6b8089";
        c.fillText(formatTime(bar.time), center(bar), height - 9);
      }
    let selected = bars.at(-1),
      hovered = false;
    if (
      this.pointer &&
      this.pointer.x >= left &&
      this.pointer.x < width - right &&
      this.pointer.y >= top &&
      this.pointer.y < bottom
    ) {
      const at =
        range.start + ((this.pointer.x - left) / this.viewport.spacing) * ticks;
      selected =
        bars.find((b) => at >= b.time && at < b.time + ticks) || selected;
      hovered = true;
      c.strokeStyle = "#728d96";
      c.setLineDash([3, 4]);
      c.beginPath();
      c.moveTo(center(selected), top);
      c.lineTo(center(selected), bottom);
      c.moveTo(left, this.pointer.y);
      c.lineTo(width - right, this.pointer.y);
      c.stroke();
      c.setLineDash([]);
      if (this.pointer.y <= priceBottom) {
        const price = high - ((this.pointer.y - top) / plotH) * (high - low);
        c.fillStyle = "#29404a";
        c.fillRect(width - right + 2, this.pointer.y - 10, right - 4, 20);
        c.fillStyle = "#d5e1df";
        c.textAlign = "left";
        c.fillText(formatPrice(price), width - right + 7, this.pointer.y + 3);
      }
      const labelX = Math.max(
        left + 33,
        Math.min(width - right - 33, center(selected)),
      );
      c.fillStyle = "#29404a";
      c.fillRect(labelX - 33, height - 24, 66, 21);
      c.fillStyle = "#d5e1df";
      c.textAlign = "center";
      c.fillText(formatTime(selected.time), labelX, height - 9);
    }
    for (const pane of paneList) {
      const value =
        pane.name === "volume"
          ? selected.volume
          : pane.name === "delta"
            ? 2 * selected.buy - selected.volume
            : selected.cvdClose;
      c.fillStyle = "#9eb3b8";
      c.textAlign = "right";
      c.fillText(compact(value), width - 8, pane.top + 14);
    }
    let detail = "";
    if (hovered && this.indicators.heatmap && this.pointer.y <= priceBottom) {
      const at =
        range.start + ((this.pointer.x - left) / this.viewport.spacing) * ticks;
      const book = raw.find(
        (b) => at >= b.time && at < b.time + CANDLE_TICKS,
      )?.depth;
      const price = high - ((this.pointer.y - top) / plotH) * (high - low);
      const bin = Math.floor(price / increment) * increment;
      if (book) {
        const total = (rows) =>
          rows
            .filter(([p]) => p >= bin && p < bin + increment)
            .reduce((n, [, size]) => n + size, 0);
        detail = `掛單快照 ${formatTime(book.time)} · ${formatPrice(bin)}–${formatPrice(bin + increment - 1)} · 買 ${compact(total(book.bids))} / 賣 ${compact(total(book.asks))}`;
      } else detail = "此時段無掛單快照";
    }
    this.meta.textContent = `開 ${formatPrice(selected.open)}  高 ${formatPrice(selected.high)}  低 ${formatPrice(selected.low)}  收 ${formatPrice(selected.close)}  Δ ${compact(2 * selected.buy - selected.volume)}`;
    this.onView({
      depth: false,
      live: this.viewport.end === null,
      footprint,
      increment,
      detail,
      footprintMissing: !selected.footprintComplete,
      cvdAnchor: world.cvdAnchor,
      from: Math.max(from, world.candles[0].time),
      to: bars.at(-1).time,
      count: world.candles.length,
    });
  }

  footprint(c, bar, left, y, increment, top, bottom) {
    const width = this.viewport.spacing - 12,
      mid = left + 9 + width / 2;
    if (!bar.footprintComplete) {
      c.fillStyle = "#60777f";
      c.textAlign = "center";
      c.fillText("無逐價資料", mid, (y(bar.high) + y(bar.low)) / 2);
      return;
    }
    const rows = footprintRows(bar.footprint, increment);
    const max = Math.max(1, ...rows.map((r) => r.sell + r.buy));
    c.font = "10px Consolas, monospace";
    for (const row of rows) {
      const py = (y(row.price) + y(row.price + increment)) / 2;
      const h = Math.abs(y(row.price) - y(row.price + increment));
      if (py < top + 5 || py > bottom - 5) continue;
      c.fillStyle = `rgba(20, 32, 38, ${this.indicators.heatmap ? 0.9 : 0.5})`;
      c.fillRect(left + 8, py - h / 2 + 1, width, Math.max(1, h - 2));
      c.globalAlpha = 0.1 + ((row.sell + row.buy) / max) * 0.25;
      c.fillStyle = row.buy >= row.sell ? mint : gold;
      c.fillRect(left + 8, py - h / 2 + 1, width, Math.max(1, h - 2));
      c.globalAlpha = 1;
      c.fillStyle = gold;
      c.textAlign = "right";
      c.fillText(compact(row.sell), mid - 4, py + 3, width / 2 - 5);
      c.fillStyle = mint;
      c.textAlign = "left";
      c.fillText(compact(row.buy), mid + 4, py + 3, width / 2 - 5);
      c.fillStyle = "#4d666e";
      c.fillRect(mid, py - 5, 1, 10);
    }
    c.textAlign = "left";
  }

  heatmap(c, bars, x, y, top, bottom, increment) {
    const cells = [],
      binSize = Math.max(1, Math.floor(increment / 2));
    let max = 1;
    for (const bar of bars)
      if (bar.depth) {
        const levels = new Map();
        for (const [price, size] of [...bar.depth.bids, ...bar.depth.asks]) {
          const bin = Math.floor(price / binSize) * binSize;
          if (y(bin) < top || y(bin + binSize) > bottom) continue;
          levels.set(bin, (levels.get(bin) || 0) + size);
        }
        for (const [price, size] of levels) {
          cells.push({ time: bar.time, price, size });
          max = Math.max(max, size);
        }
      }
    for (const cell of cells) {
      const strength = Math.sqrt(cell.size / max);
      c.fillStyle =
        strength > 0.7
          ? `rgba(230,177,88,${0.14 + strength * 0.4})`
          : `rgba(67,132,153,${0.08 + strength * 0.37})`;
      c.fillRect(
        x(cell.time),
        y(cell.price + binSize),
        Math.max(1, x(cell.time + CANDLE_TICKS) - x(cell.time)),
        Math.max(1.5, y(cell.price) - y(cell.price + binSize)),
      );
    }
  }

  indicatorPane(c, name, bars, center, left, width, top, height) {
    const label = { volume: "VOL", delta: "DELTA", cvd: "CVD" }[name];
    const value = (bar) =>
      name === "volume"
        ? bar.volume
        : name === "delta"
          ? 2 * bar.buy - bar.volume
          : bar.cvdClose;
    const values = bars.map(value);
    let min =
      name === "cvd"
        ? Math.min(...values)
        : name === "delta"
          ? -Math.max(1, ...values.map(Math.abs))
          : 0;
    let max =
      name === "cvd"
        ? Math.max(...values)
        : Math.max(1, ...values.map(Math.abs));
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const y = (v) =>
      top + height - 4 - ((v - min) / (max - min)) * Math.max(6, height - 20);
    c.strokeStyle = "#28373d";
    c.beginPath();
    c.moveTo(left, top);
    c.lineTo(left + width, top);
    c.stroke();
    if (name === "cvd") {
      c.strokeStyle = "#99bddd";
      c.lineWidth = 1.5;
      c.beginPath();
      bars.forEach((b, i) =>
        i ? c.lineTo(center(b), y(value(b))) : c.moveTo(center(b), y(value(b))),
      );
      c.stroke();
      c.lineWidth = 1;
    } else {
      const w = Math.max(1, Math.min(28, this.viewport.spacing * 0.65));
      bars.forEach((b) => {
        const v = value(b);
        c.fillStyle = (name === "volume" ? b.close >= b.open : v >= 0)
          ? "#9adcca80"
          : "#dfb78580";
        c.fillRect(
          center(b) - w / 2,
          Math.min(y(0), y(v)),
          w,
          Math.max(1, Math.abs(y(0) - y(v))),
        );
      });
    }
    c.textAlign = "left";
    c.fillStyle = "#849da7";
    c.fillText(label, left + 3, top + 12);
  }
  depth(c, width, height, world) {
    const bids = world.exchange.levels("buy"),
      asks = world.exchange.levels("sell");
    const mid =
      bids.length && asks.length
        ? (bids[0].price + asks[0].price) / 2
        : world.exchange.lastPrice;
    const range =
      Math.max(
        80,
        ...[bids.slice(0, 25).at(-1), asks.slice(0, 25).at(-1)]
          .filter(Boolean)
          .map((o) => Math.abs(o.price - mid)),
      ) * 1.1;
    const left = 14,
      right = width - 60,
      top = 28,
      bottom = height - 38;
    const px = (p) =>
      left + ((p - (mid - range)) / (range * 2)) * (right - left);
    let max = 1;
    const rows = [bids, asks].map((side) => {
      let total = 0;
      return side
        .filter((r) => Math.abs(r.price - mid) <= range)
        .map((r) => {
          total += r.size;
          max = Math.max(max, total);
          return { ...r, total };
        });
    });
    const py = (n) => bottom - (n / max) * (bottom - top);
    for (let i = 0; i < 5; i++) {
      const amount = (max * i) / 4;
      c.strokeStyle = "#24343b";
      c.setLineDash([2, 5]);
      c.beginPath();
      c.moveTo(left, py(amount));
      c.lineTo(right, py(amount));
      c.stroke();
      c.fillStyle = "#6c848d";
      c.textAlign = "left";
      c.fillText((amount / 100).toFixed(0), right + 8, py(amount) + 4);
    }
    c.setLineDash([]);
    rows.forEach((side, index) => {
      if (!side.length) return;
      c.beginPath();
      c.moveTo(px(mid), bottom);
      let previous = bottom;
      for (const row of side) {
        c.lineTo(px(row.price), previous);
        c.lineTo(px(row.price), py(row.total));
        previous = py(row.total);
      }
      c.lineTo(px(side.at(-1).price), bottom);
      c.closePath();
      c.fillStyle = index ? "#dfb78514" : "#9adcca14";
      c.fill();
      c.beginPath();
      c.moveTo(px(mid), bottom);
      previous = bottom;
      for (const row of side) {
        c.lineTo(px(row.price), previous);
        c.lineTo(px(row.price), py(row.total));
        previous = py(row.total);
      }
      c.strokeStyle = index ? "#dfb785" : "#9adcca";
      c.lineWidth = 1.5;
      c.stroke();
      c.lineWidth = 1;
    });
    for (let i = 0; i < 5; i++) {
      const price = mid - range + (range * 2 * i) / 4;
      c.textAlign = "center";
      c.fillStyle = "#6c848d";
      c.fillText(formatPrice(price), px(price), height - 15);
    }
    c.textAlign = "left";
    c.fillStyle = "#6c848d";
    c.fillText("BEAR", right + 5, 15);
    this.meta.textContent = `買盤 ${formatSize(bids.reduce((n, b) => n + b.size, 0))}  /  賣盤 ${formatSize(asks.reduce((n, b) => n + b.size, 0))} BEAR`;
  }
}
