// A deliberately small zero-intelligence order-book experiment.
// One pre-generated taker tape is replayed against different maker arrival rates.
export const LAB_STEPS = 2160;
export const LAB_WARMUP = 800;
export const LAB_CANDLE_TICKS = 12;
export const LAB_TAKER_RATE = 0.75;
export const LAB_MAKER_CANDIDATES = 8;
export const LAB_RATIOS = [3, 1, 0.75, 0.5];
export const LAB_DEFAULT_SETTINGS = Object.freeze({ distance: 1, lifetime: 3 });

export class LabRandom {
  constructor(seed) {
    this.state = seed >>> 0 || 1;
  }
  next() {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  }
}

export function makeLabTape(seed = 44021, steps = LAB_STEPS) {
  const takerRng = new LabRandom(seed ^ 0x9e3779b9);
  const makerRng = new LabRandom(seed ^ 0x85ebca6b);
  const takers = [];
  const makers = [];
  for (let tick = 0; tick < steps + LAB_WARMUP; tick++) {
    const active = tick >= LAB_WARMUP;
    const arrival = active && takerRng.next() < LAB_TAKER_RATE;
    // Draw all fields regardless of arrival: the taker stream is independent
    // of maker participation and can be replayed across every condition.
    const side = takerRng.next() < 0.5 ? "buy" : "sell";
    const large = takerRng.next() < 0.055;
    const size = Math.round((large ? 9 + takerRng.next() * 13 : 1 + takerRng.next() * 4) * 100);
    takers.push(arrival ? { side, size } : null);
    const candidates = [];
    for (let i = 0; i < LAB_MAKER_CANDIDATES; i++) {
      candidates.push({
        gate: makerRng.next(),
        side: makerRng.next() < 0.5 ? "buy" : "sell",
        distance: Math.min(65, 2 + Math.floor(-Math.log(Math.max(1e-9, makerRng.next())) * 9)),
        size: Math.round((2 + makerRng.next() * 6) * 100),
        lifetime: 50 + Math.floor(makerRng.next() * 81),
      });
    }
    makers.push(candidates);
  }
  return { seed, steps, takers, makers };
}

function best(book, side) {
  let result = null;
  for (const order of book) {
    if (order.side !== side || order.remaining <= 0) continue;
    if (!result || (side === "buy" ? order.price > result.price : order.price < result.price)) result = order;
  }
  return result;
}

export function simulateLab(tape, makerRatio, settings = LAB_DEFAULT_SETTINGS) {
  if (!(makerRatio > 0 && makerRatio <= 8)) throw Error("makerRatio must be in (0, 8]");
  if (!(settings.distance > 0 && settings.lifetime > 0)) throw Error("maker settings must be positive");
  const book = [];
  const candles = [];
  const path = [];
  let last = 10000;
  let makerOrders = 0;
  let takerOrders = 0;
  let requested = 0;
  let executed = 0;
  let fills = 0;
  let emptyTicks = 0;
  let spreadSum = 0;
  let spreadSamples = 0;
  let impactSum = 0;
  let maxSpread = 0;
  let high = last;
  let low = last;
  const acceptance = (makerRatio * LAB_TAKER_RATE) / LAB_MAKER_CANDIDATES;

  for (let tick = 0; tick < tape.takers.length; tick++) {
    for (let i = book.length - 1; i >= 0; i--)
      if (book[i].expires <= tick || book[i].remaining <= 0) book.splice(i, 1);

    for (const candidate of tape.makers[tick]) {
      if (candidate.gate >= acceptance) continue;
      const bid = best(book, "buy")?.price;
      const ask = best(book, "sell")?.price;
      const anchor = bid && ask ? Math.round((bid + ask) / 2) : last;
      const quoteDistance = Math.max(1, Math.round(candidate.distance * settings.distance));
      let price = anchor + (candidate.side === "buy" ? -quoteDistance : quoteDistance);
      // Every maker order is passive, including after one side of the book empties.
      if (candidate.side === "buy" && ask) price = Math.min(price, ask - 1);
      if (candidate.side === "sell" && bid) price = Math.max(price, bid + 1);
      book.push({ side: candidate.side, price: Math.max(100, price), remaining: candidate.size, expires: tick + Math.round(candidate.lifetime * settings.lifetime) });
      if (tick >= LAB_WARMUP) makerOrders++;
    }

    const activeTick = tick - LAB_WARMUP;
    let candle = null;
    if (activeTick >= 0) {
      const bucket = Math.floor(activeTick / LAB_CANDLE_TICKS);
      candle = candles[bucket];
      if (!candle) {
        candle = { time: bucket * LAB_CANDLE_TICKS, open: last, high: last, low: last, close: last, volume: 0, trades: 0 };
        candles.push(candle);
      }
    }
    const taker = tape.takers[tick];
    if (taker) {
      takerOrders++;
      requested += taker.size;
      let remaining = taker.size;
      const before = last;
      while (remaining > 0) {
        const maker = best(book, taker.side === "buy" ? "sell" : "buy");
        if (!maker) break;
        const quantity = Math.min(remaining, maker.remaining);
        remaining -= quantity;
        maker.remaining -= quantity;
        executed += quantity;
        fills++;
        last = maker.price;
        high = Math.max(high, last);
        low = Math.min(low, last);
        candle.high = Math.max(candle.high, last);
        candle.low = Math.min(candle.low, last);
        candle.close = last;
        candle.volume += quantity;
        candle.trades++;
      }
      impactSum += Math.abs(last - before);
    }
    if (activeTick >= 0) {
      const bid = best(book, "buy")?.price;
      const ask = best(book, "sell")?.price;
      if (bid && ask) {
        const spread = ask - bid;
        spreadSum += spread;
        spreadSamples++;
        maxSpread = Math.max(maxSpread, spread);
      } else emptyTicks++;
      path.push(last);
    }
  }
  const closeReturns = candles.slice(1).map((c, i) => Math.log(c.close / candles[i].close));
  const realizedVol = Math.sqrt(closeReturns.reduce((sum, x) => sum + x * x, 0)) * 100;
  const absoluteReturns = closeReturns.map(Math.abs);
  const meanAbsReturn = absoluteReturns.reduce((sum, x) => sum + x, 0) / (absoluteReturns.length || 1);
  const variance = absoluteReturns.reduce((sum, x) => sum + (x - meanAbsReturn) ** 2, 0);
  const lagCovariance = absoluteReturns.slice(1).reduce((sum, x, i) => sum + (x - meanAbsReturn) * (absoluteReturns[i] - meanAbsReturn), 0);
  return {
    makerRatio,
    candles,
    path,
    stats: {
      makerOrders,
      takerOrders,
      fills,
      fillPct: requested ? (executed / requested) * 100 : 0,
      rangePct: ((high - low) / 10000) * 100,
      endPct: ((last - 10000) / 10000) * 100,
      realizedVolPct: realizedVol,
      volCluster: variance ? lagCovariance / variance : 0,
      avgSpread: spreadSamples ? spreadSum / spreadSamples / 100 : null,
      maxSpread: maxSpread / 100,
      avgImpact: takerOrders ? impactSum / takerOrders / 100 : 0,
      emptyPct: (emptyTicks / tape.steps) * 100,
    },
  };
}

export function runLab(seed = 44021, ratios = LAB_RATIOS, steps = LAB_STEPS, settings = LAB_DEFAULT_SETTINGS) {
  const tape = makeLabTape(seed, steps);
  return { seed, tape, settings, runs: ratios.map((ratio) => simulateLab(tape, ratio, settings)) };
}

export function summarizeLab(seeds, ratios = LAB_RATIOS, steps = LAB_STEPS, settings = LAB_DEFAULT_SETTINGS) {
  const totals = ratios.map((ratio) => ({ makerRatio: ratio, rangePct: 0, realizedVolPct: 0, volCluster: 0, avgSpread: 0, avgImpact: 0, fillPct: 0, emptyPct: 0, spreadCount: 0 }));
  for (const seed of seeds) {
    const { runs } = runLab(seed, ratios, steps, settings);
    runs.forEach(({ stats }, index) => {
      const total = totals[index];
      for (const key of ["rangePct", "realizedVolPct", "volCluster", "avgImpact", "fillPct", "emptyPct"]) total[key] += stats[key];
      if (stats.avgSpread != null) {
        total.avgSpread += stats.avgSpread;
        total.spreadCount++;
      }
    });
  }
  return totals.map(({ spreadCount, ...total }) => ({
    ...total,
    rangePct: total.rangePct / seeds.length,
    realizedVolPct: total.realizedVolPct / seeds.length,
    volCluster: total.volCluster / seeds.length,
    avgSpread: spreadCount ? total.avgSpread / spreadCount : null,
    avgImpact: total.avgImpact / seeds.length,
    fillPct: total.fillPct / seeds.length,
    emptyPct: total.emptyPct / seeds.length,
  }));
}
