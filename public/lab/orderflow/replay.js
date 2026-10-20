// Replay mode for the order-flow lab: plays a recorded case (cases/<id>.data.json, built by
// scripts/replay-cases/build-case.mjs) as if it were live, one second of trades at a time, and a
// script (cases/<id>.json) that draws levels, notes, boxes and a position on the chart and shows
// captions. Everything here is a function of the replay clock, so seeking replays the same frame.

const MINUTE = 60_000;

/** Sums 1-second rows into one minute row [t, o, h, l, c, [[bin, buy, sell], …]]. */
function sumSlices(t, slices, from, to) {
  if (from >= to) return null;
  const levels = new Map();
  let h = -Infinity;
  let l = Infinity;
  for (let k = from; k < to; k++) {
    const [, , sh, sl, , lv] = slices[k];
    if (sh > h) h = sh;
    if (sl < l) l = sl;
    for (const [bin, buy, sell] of lv) {
      const x = levels.get(bin);
      if (x) {
        x[0] += buy;
        x[1] += sell;
      } else levels.set(bin, [buy, sell]);
    }
  }
  return [t, slices[from][1], h, l, slices[to - 1][4], [...levels.entries()].sort((a, b) => a[0] - b[0]).map(([bin, [buy, sell]]) => [bin, buy, sell])];
}

/**
 * Case data → lookups by replay time t (ms): the minute rows, large prints and OI readings a
 * live viewer would have had at t. A second counts once it has finished.
 */
export function prepare(data) {
  const { start, slices } = data;
  const sliceT = slices.map((s) => start + s[0] * 1000);
  const firstAfter = (t) => {
    let a = 0;
    let b = sliceT.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (sliceT[m] < t) a = m + 1;
      else b = m;
    }
    return a;
  };
  const minutes = []; // full minute rows of the replay, in order
  for (let k = 0; k < slices.length; ) {
    const t = Math.floor(sliceT[k] / MINUTE) * MINUTE;
    let j = k;
    while (j < slices.length && sliceT[j] < t + MINUTE) j++;
    minutes.push(sumSlices(t, slices, k, j));
    k = j;
  }
  const byTime = (list, t, at = (x) => x[0]) => {
    let a = 0;
    let b = list.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (at(list[m]) <= t) a = m + 1;
      else b = m;
    }
    return a; // count of items at or before t
  };
  return {
    start,
    end: data.end,
    /** History rows, finished replay minutes, and the forming minute up to t. */
    rowsUntil(t) {
      const minute = Math.floor(t / MINUTE) * MINUTE;
      const out = data.rows.slice();
      for (const r of minutes) {
        if (r[0] >= minute) break;
        out.push(r);
      }
      const forming = sumSlices(minute, slices, firstAfter(minute), firstAfter(t - 999));
      if (forming && forming[0] >= start) out.push(forming);
      return out;
    },
    printsUntil: (t) => byTime(data.prints, t),
    readingsUntil: (t) => byTime(data.metrics, t),
    /** First second in (from, to] whose high reaches `above` or low reaches `below`. */
    firstTouch(from, to, above, below) {
      for (let k = firstAfter(from); k < slices.length && sliceT[k] + 1000 <= to; k++) {
        const [, , h, l] = slices[k];
        if (h >= above) return { t: sliceT[k] + 1000, hit: "target-up" };
        if (l <= below) return { t: sliceT[k] + 1000, hit: "target-down" };
      }
      return null;
    },
  };
}

/** "21:08:30" on the script's date and offset → ms; full ISO strings pass through. */
export function stepTime(at, script) {
  if (/T/.test(at)) return Date.parse(at);
  const hms = at.length === 5 ? `${at}:00` : at;
  return Date.parse(`${script.date}T${hms}${script.tz ?? "+08:00"}`);
}

const blank = () => ({ speed: 10, caption: "", lines: new Map(), notes: new Map(), boxes: new Map(), position: null, view: {}, ended: false });

/**
 * Walks a script against the replay clock. Steps fire in order when the clock reaches them; a
 * step with `hold` freezes the clock for that many real milliseconds so the viewer can read.
 */
export class Player {
  constructor(script, prepared) {
    this.script = script;
    this.data = prepared;
    this.steps = script.steps.map((s) => ({ ...s, t: stepTime(s.at, script) })).sort((a, b) => a.t - b.t);
    this.restart();
  }

  /** Back to the start, with the first steps shown and their holds still to come. */
  restart() {
    this.seek(this.data.start);
    this.advance(0);
  }

  /** Jumps to t with every earlier step applied at once; steps at t itself fire on the next advance. */
  seek(t) {
    this.t = Math.max(this.data.start, Math.min(this.data.end, t));
    this.state = blank();
    this.next = 0;
    this.holdLeft = 0;
    while (this.next < this.steps.length && this.steps[this.next].t < this.t) this.apply(this.steps[this.next++], false);
    this.settle();
  }

  /** Advances by `dtMs` of real time; returns true when the clock or the overlays changed. */
  advance(dtMs) {
    if (this.state.ended) return false;
    if (this.holdLeft > 0) {
      this.holdLeft -= dtMs;
      return false;
    }
    let target = Math.min(this.data.end, this.t + dtMs * this.state.speed);
    while (this.next < this.steps.length && this.steps[this.next].t <= target) {
      const step = this.steps[this.next++];
      this.t = step.t;
      this.apply(step, true);
      if (step.hold) {
        this.holdLeft = step.hold;
        target = this.t;
        break;
      }
    }
    this.t = target;
    if (this.t >= this.data.end) this.state.ended = true;
    this.settle();
    return true;
  }

  apply(step, live) {
    const s = this.state;
    if (step.speed) s.speed = step.speed;
    if ("caption" in step) s.caption = step.caption ?? "";
    for (const key of ["tf", "mode", "barW", "ind", "printMin"]) if (key in step) s.view[key] = step[key];
    // Overlays fired while playing fade in; ones restored by a seek are simply there.
    const since = live ? performance.now() : -Infinity;
    if (step.line) s.lines.set(step.line.id ?? String(step.line.price), { ...step.line, since });
    if (step.note) s.notes.set(step.note.id ?? step.at, { ...step.note, t: step.note.at ? stepTime(step.note.at, this.script) : step.t, since });
    if (step.box) s.boxes.set(step.box.id ?? step.at, { ...step.box, t0: stepTime(step.box.from, this.script), t1: stepTime(step.box.to, this.script), since });
    for (const id of step.clear ?? []) {
      const [kind, key] = id.split(":");
      if (kind === "all") (s.lines.clear(), s.notes.clear(), s.boxes.clear());
      else s[{ line: "lines", note: "notes", box: "boxes" }[kind]]?.delete(key);
    }
    if (step.position) {
      const p = step.position;
      const dir = p.side === "short" ? -1 : 1;
      const risk = Math.abs(p.entry - p.stop);
      s.position = { ...p, dir, risk, target: p.target ?? p.entry + dir * risk * (p.r ?? 2), openT: step.t, exit: null };
    }
    if (step.end) s.ended = true;
  }

  /** Resolves the open position against the trades up to the clock. */
  settle() {
    const p = this.state.position;
    if (!p) return;
    const up = p.dir > 0 ? p.target : p.stop;
    const down = p.dir > 0 ? p.stop : p.target;
    const touch = this.data.firstTouch(p.openT, this.t, up, down);
    p.exit = touch ? { t: touch.t, price: touch.hit === "target-up" ? up : down, won: (touch.hit === "target-up") === p.dir > 0 } : null;
  }
}

/** Profit of a position at `price`, in R and percent. */
export function pnl(p, price) {
  const move = (price - p.entry) * p.dir;
  return { r: move / p.risk, pct: (move / p.entry) * 100 };
}

const RGB = { gold: "232,189,125", buy: "120,225,213", sell: "240,154,90", text: "237,242,237" };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Fades an overlay in over a third of a second of real time, also while the clock holds.
const fade = (since) => Math.min(1, Math.max(0, (performance.now() - since) / 330));

/**
 * Draws the script's overlays. g: { ctx, plotW, axisW, top, bottom, xAt(t), yOf(p), font, fmtPrice, last }
 * where last is the newest price.
 */
export function drawOverlay(player, g) {
  const { ctx, plotW, axisW, top, bottom, xAt, yOf, font, fmtPrice } = g;
  const s = player.state;
  const t = player.t;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, plotW + axisW, bottom - top);
  ctx.clip();

  for (const line of s.lines.values()) {
    const rgb = RGB[line.color ?? "gold"];
    const y = Math.round(yOf(line.price)) + 0.5;
    const x0 = line.from ? Math.max(0, xAt(stepTime(line.from, player.script)) ?? 0) : 0;
    ctx.globalAlpha = fade(line.since);
    ctx.strokeStyle = `rgba(${rgb},0.9)`;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(plotW, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `600 12px ${font}`;
    ctx.textBaseline = "bottom";
    ctx.fillStyle = `rgb(${rgb})`;
    if (line.label) ctx.fillText(line.label, x0 + 8, y - 4);
    ctx.fillRect(plotW, y - 9, axisW, 18);
    ctx.fillStyle = "#05090f";
    ctx.textBaseline = "middle";
    ctx.font = `11px ${font}`;
    ctx.fillText(fmtPrice(line.price), plotW + 8, y);
    ctx.globalAlpha = 1;
  }

  for (const box of s.boxes.values()) {
    const x0 = xAt(box.t0);
    const x1 = xAt(box.t1);
    if (x0 == null || x1 == null) continue;
    const y0 = yOf(box.high);
    const y1 = yOf(box.low);
    ctx.globalAlpha = fade(box.since);
    ctx.fillStyle = `rgba(${RGB.gold},0.14)`;
    ctx.fillRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6);
    ctx.strokeStyle = `rgb(${RGB.gold})`;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6);
    if (box.label) {
      ctx.font = `600 12px ${font}`;
      ctx.textBaseline = "bottom";
      ctx.fillStyle = `rgb(${RGB.gold})`;
      ctx.fillText(box.label, x0, y0 - 6);
    }
    ctx.globalAlpha = 1;
  }

  const p = s.position;
  if (p) {
    const x0 = xAt(p.openT) ?? 0;
    const endT = p.exit ? p.exit.t : t;
    // Like a charting tool's position box: at least eight bars wide, growing with the trade.
    const x1 = Math.min(plotW, Math.max(x0 + 8 * g.barW, (xAt(endT) ?? plotW) + 6));
    const yE = yOf(p.entry);
    const yT = yOf(p.target);
    const yS = yOf(p.stop);
    ctx.fillStyle = `rgba(${RGB.buy},0.16)`;
    ctx.fillRect(x0, Math.min(yE, yT), x1 - x0, Math.abs(yT - yE));
    ctx.fillStyle = `rgba(${RGB.sell},0.16)`;
    ctx.fillRect(x0, Math.min(yE, yS), x1 - x0, Math.abs(yS - yE));
    ctx.strokeStyle = `rgba(${RGB.text},0.8)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, Math.round(yE) + 0.5);
    ctx.lineTo(x1, Math.round(yE) + 0.5);
    ctx.stroke();
    ctx.font = `11px ${font}`;
    ctx.textBaseline = "middle";
    const label = (text, y, rgb) => {
      const w = ctx.measureText(text).width + 12;
      const lx = Math.min(plotW - w - 4, x1 + 6);
      ctx.fillStyle = `rgba(${rgb},0.92)`;
      roundRect(ctx, lx, y - 9, w, 18, 3);
      ctx.fill();
      ctx.fillStyle = "#05090f";
      ctx.fillText(text, lx + 6, y);
    };
    const rTarget = Math.abs(p.target - p.entry) / p.risk;
    const side = p.side === "short" ? "空" : "多";
    const signed = (v, d) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;
    if (p.exit) {
      // The result sits where the trade ended; the entry keeps its price.
      const { r, pct } = pnl(p, p.exit.price);
      label(`${p.exit.won ? "止盈" : "停損"} ${signed(r, 1)}R (${signed(pct, 2)}%)`, yOf(p.exit.price), p.exit.won ? RGB.buy : RGB.sell);
      label(p.exit.won ? `停損 ${fmtPrice(p.stop)}` : `目標 ${fmtPrice(p.target)}`, p.exit.won ? yS : yT, p.exit.won ? RGB.sell : RGB.buy);
      label(`${side} ${fmtPrice(p.entry)}`, yE, RGB.text);
    } else {
      label(`目標 ${fmtPrice(p.target)} · ${rTarget.toFixed(rTarget % 1 ? 1 : 0)}R`, yT, RGB.buy);
      label(`停損 ${fmtPrice(p.stop)}`, yS, RGB.sell);
      const { r, pct } = pnl(p, g.last);
      label(`${side} ${fmtPrice(p.entry)}  ${signed(r, 2)}R (${signed(pct, 2)}%)`, yE, r >= 0 ? RGB.buy : RGB.sell);
    }
  }

  for (const note of s.notes.values()) {
    const x = xAt(note.t);
    if (x == null) continue;
    const y = yOf(note.price);
    ctx.globalAlpha = fade(note.since);
    ctx.font = `600 13px ${font}`;
    const lines = String(note.text).split("\n");
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18;
    const h = lines.length * 18 + 10;
    // The preferred side, unless the note would leave the price pane there.
    let below = note.side === "below";
    if (below && y + 26 + h > bottom - 4) below = false;
    else if (!below && y - 26 - h < top + 4) below = true;
    const bx = Math.max(4, Math.min(plotW - w - 4, x - w / 2));
    const by = below ? y + 26 : y - 26 - h;
    ctx.strokeStyle = `rgba(${RGB.gold},0.9)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(Math.max(bx + 6, Math.min(bx + w - 6, x)), below ? by : by + h);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${RGB.gold})`;
    ctx.fill();
    ctx.fillStyle = "rgba(5,9,15,0.92)";
    roundRect(ctx, bx, by, w, h, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgb(${RGB.text})`;
    ctx.textBaseline = "top";
    lines.forEach((l, k) => ctx.fillText(l, bx + 9, by + 6 + k * 18));
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
