export function candlesInRange(candles, seconds, start, end) {
  const ticks = seconds * 4;
  const first = Math.floor(start / ticks) * ticks;
  const last = Math.ceil(end / ticks) * ticks;
  return candles.filter((bar) => bar.time >= first && bar.time < last);
}

export function aggregateCandles(candles, seconds) {
  if (seconds === 10) return candles;
  const ticks = seconds * 4;
  const result = [];
  for (const candle of candles) {
    const time = Math.floor(candle.time / ticks) * ticks;
    let group = result.at(-1);
    if (!group || group.time !== time) {
      group = { ...candle, time, footprint: {} };
      result.push(group);
    } else {
      group.high = Math.max(group.high, candle.high);
      group.low = Math.min(group.low, candle.low);
      group.close = candle.close;
      group.volume += candle.volume;
      group.buy += candle.buy;
      group.cvdClose = candle.cvdClose;
      group.footprintComplete &&= candle.footprintComplete;
      group.depth = candle.depth;
    }
    for (const [price, amounts] of Object.entries(candle.footprint || {})) {
      const row = (group.footprint[price] ||= [0, 0]);
      row[0] += amounts[0];
      row[1] += amounts[1];
    }
  }
  return result;
}

// Price bins change only presentation; each executed unit belongs to one row.
export function footprintRows(profile, increment = 1) {
  const rows = new Map();
  for (const [price, amounts] of Object.entries(profile || {})) {
    const bin = Math.floor(Number(price) / increment) * increment;
    const row = rows.get(bin) || { price: bin, sell: 0, buy: 0 };
    row.sell += amounts[0];
    row.buy += amounts[1];
    rows.set(bin, row);
  }
  return [...rows.values()].sort((a, b) => b.price - a.price);
}

export function priceIncrement(minimum) {
  const base = 10 ** Math.floor(Math.log10(Math.max(1, minimum)));
  return (
    [1, 2, 5, 10].map((n) => n * base).find((n) => n >= minimum) || base * 10
  );
}

export class ChartViewport {
  constructor() {
    this.spacing = 14;
    this.end = null;
  }
  live() {
    this.end = null;
  }
  range(firstTime, lastTime, width, ticks) {
    const count = width / this.spacing;
    const first = Math.floor(firstTime / ticks) * ticks;
    const last = Math.floor(lastTime / ticks) * ticks;
    const margin = Math.min(2, count * 0.12);
    const latest = last + (1 + margin) * ticks;
    const oldest =
      first + Math.min(count, (last - first) / ticks + 1 + margin) * ticks;
    const end = Math.max(oldest, Math.min(latest, this.end ?? latest));
    if (this.end !== null) this.end = end;
    return { start: end - count * ticks, end, count, latest, oldest };
  }
  zoom(factor, anchor, range, ticks) {
    const previous = this.spacing;
    this.spacing = Math.max(1, Math.min(180, previous * factor));
    // The time beneath the pointer is unchanged while zooming.
    if (this.end !== null || anchor < 0.95) {
      const nextCount = (range.count * previous) / this.spacing;
      const time = range.start + range.count * ticks * anchor;
      this.end = time + nextCount * ticks * (1 - anchor);
    }
  }
  pan(pixels, range, ticks) {
    this.end = Math.max(
      range.oldest,
      Math.min(range.latest, range.end - (pixels / this.spacing) * ticks),
    );
    if (this.end >= range.latest - 0.01) this.live();
  }
}
