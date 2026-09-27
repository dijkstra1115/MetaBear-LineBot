// Scripted Flow Arena traders. Each bot is called once per simulated second, before the tick, as
// bot(run, me, state): `run` is the public market (book, liquidation map, tape, iceberg read,
// news headline), `me` is the bot's own trader account, `state` is the bot's private memory.
// Bots only read what a player can see.

const sideOf = (direction) => direction > 0 ? "buy" : "sell";
const flat = (me) => !me.account.position && !me.orders().length;
// Order sizes are written for a solo market. In a bigger room each contract stands for more BTC,
// so a bot trades fewer contracts to put the same capital to work; band sizes stay as they are.
const q = (run, lots) => Math.max(10, Math.round(lots / run.scale / 10) * 10);
// The brightest band within reach, weighed by size over distance.
const pickBand = (run, minLots = 2000, reach = 0.02) => {
  const fuel = run.fuel(0.025);
  const last = run.market.last;
  return [
    fuel.shortPeak && { direction: 1, peak: fuel.shortPeak, distance: fuel.shortPeak.price / last - 1 },
    fuel.longPeak && { direction: -1, peak: fuel.longPeak, distance: 1 - fuel.longPeak.price / last },
  ].filter((item) => item && item.peak.lots >= minLots && item.distance < reach && item.distance > 0.002)
    .sort((a, b) => b.peak.lots / b.distance - a.peak.lots / a.distance)[0];
};
// A public iceberg read sitting between the price and the band.
const guarded = (run, target) => run.icebergSignals().some((signal) => target.direction > 0
  ? signal.side === "sell" && signal.price > run.market.last && signal.price < target.peak.price
  : signal.side === "buy" && signal.price < run.market.last && signal.price > target.peak.price);

export const ARENA_BOTS = {
  // Blind: buy 2,000 BTC every 20 seconds and sell it 2 seconds later.
  pump: (run, me) => {
    if (run.time % 20 === 5 && !me.account.position) me.submit("buy", "market", q(run, 4000));
    if (run.time % 20 === 7 && me.account.position) me.close();
  },
  // Max leverage, max size, one shot.
  yolo20x: (run, me) => {
    if (run.time === 0) me.setLeverage(20);
    if (run.time === 3) me.submit("buy", "market", Math.min(me.maxOpenLots(), 40000));
    if (run.time === 8 && me.account.position) me.close();
  },
  // Two-sided passive quotes around the mid; flatten half the inventory past a cap.
  maker: (run, me, s, { width = 0.0015, size = 500, cap = 2000 } = {}) => {
    if (run.time > 116) { me.cancelAll(); if (me.account.position) me.close(); return; }
    me.cancelAll();
    size = q(run, size);
    cap = q(run, cap);
    const mid = run.markPrice();
    const pos = me.account.position;
    if (Math.abs(pos) >= cap) { me.closePart(0.5); return; }
    if (pos < cap) me.submit("buy", "limit", size, Math.round(mid * (1 - width)));
    if (pos > -cap) me.submit("sell", "limit", size, Math.round(mid * (1 + width)));
  },
  // Follow net taker flow on the tape.
  flow: (run, me) => {
    if (run.time < 10 || run.time > 114) { if (me.account.position && run.time > 114) me.close(); return; }
    const recent = run.market.tradeLog.filter((trade) => trade.time > run.time - 8 && trade.takerOwner !== me.id);
    const net = recent.reduce((sum, trade) => sum + (trade.aggressorSide === "buy" ? trade.lots : -trade.lots), 0);
    const want = net > 1500 ? 1 : net < -1500 ? -1 : 0;
    const pos = Math.sign(me.account.position);
    if (pos && pos !== want) me.close();
    if (want && pos !== want) me.submit(sideOf(want), "market", q(run, 1000));
  },
  // Rest an exit twice the push beyond the band, walk the price there in clips; when the cascade
  // fills the exit, the extra half flips you into the snap-back for a few seconds.
  ladderFlip: (run, me, s, { gap = 0.01, size = 5000, clip = 1000, hold = 5 } = {}) => {
    size = q(run, size);
    clip = q(run, clip);
    if (s.flip) {
      if (run.time >= s.flip) { me.cancelAll(); if (me.account.position) me.close(); s.flip = null; s.plan = null; s.cool = run.time + 3; }
      return;
    }
    if (s.plan) {
      const plan = s.plan;
      const pos = me.account.position;
      if (!me.orders().length || Math.sign(pos) === -plan.direction) { me.cancelAll(); s.flip = run.time + hold; return; }
      if (run.time - plan.start > 8 + size / clip || plan.lastPush?.stalled) { me.cancelAll(); if (pos) me.close(); s.plan = null; s.cool = run.time + 3; return; }
      if (Math.abs(pos) < size) plan.lastPush = me.submit(sideOf(plan.direction), "market", clip);
      return;
    }
    if (!flat(me) || run.time < 2 || run.time > 100 || run.time < (s.cool ?? 0)) return;
    const target = pickBand(run);
    if (!target || guarded(run, target)) return;
    if (!me.submit(sideOf(-target.direction), "limit", size * 2, Math.round(target.peak.price * (1 + target.direction * gap))).ok) return;
    s.plan = { direction: target.direction, start: run.time };
    s.plan.lastPush = me.submit(sideOf(target.direction), "market", clip);
  },
  // Read stacked bands: the exit goes past the last band a chain can reach one wave at a time.
  chain: (run, me, s, { hop = 0.009, minChain = 4000, size = 5000, clip = 1000, hold = 5, perSecond = 1 } = {}) => {
    size = q(run, size);
    clip = q(run, clip);
    if (s.flip) {
      if (run.time >= s.flip) { me.cancelAll(); if (me.account.position) me.close(); s.flip = null; s.plan = null; s.cool = run.time + 3; }
      return;
    }
    if (s.plan) {
      const plan = s.plan;
      const pos = me.account.position;
      if (!me.orders().length || Math.sign(pos) === -plan.direction) { me.cancelAll(); s.flip = run.time + hold; return; }
      if (run.time - plan.start > 10 + size / clip || plan.lastPush?.stalled) { me.cancelAll(); if (pos) me.close(); s.plan = null; s.cool = run.time + 3; return; }
      for (let i = 0; i < perSecond && Math.abs(me.account.position) < size; i++) plan.lastPush = me.submit(sideOf(plan.direction), "market", clip);
      return;
    }
    if (!flat(me) || run.time < 2 || run.time > 100 || run.time < (s.cool ?? 0)) return;
    const last = run.market.last;
    const levels = run.estimatedLevels(25000);
    let best = null;
    for (const direction of [1, -1]) {
      const bands = levels.filter((row) => (direction > 0 ? row.short : row.long) >= 300 && (direction > 0 ? row.price > last : row.price < last))
        .map((row) => ({ price: row.price, lots: direction > 0 ? row.short : row.long, d: Math.abs(row.price / last - 1) }))
        .sort((a, b) => a.d - b.d);
      if (!bands.length || bands[0].d > 0.02) continue;
      let reach = bands[0];
      let total = 0;
      for (const band of bands) { if (band.d - reach.d > hop) break; reach = band; total += band.lots; }
      if (total >= minChain && (!best || total / bands[0].d > best.total / best.first)) best = { direction, reach, total, first: bands[0].d };
    }
    if (!best || guarded(run, { direction: best.direction, peak: best.reach })) return;
    const exit = Math.round(best.reach.price * (1 + best.direction * 0.004));
    if (!me.submit(sideOf(-best.direction), "limit", size * 2, exit).ok) return;
    s.plan = { direction: best.direction, start: run.time };
    s.plan.lastPush = me.submit(sideOf(best.direction), "market", clip);
  },
  chainFast: (run, me, s) => ARENA_BOTS.chain(run, me, s, { perSecond: 2 }),
  chainBig3x: (run, me, s) => ARENA_BOTS.chain(run, me, s, { size: 8000, clip: 2000 }),
  // Fade a chain of two or more waves one second after it fires.
  fade: (run, me, s) => {
    if (me.account.position) { if (run.time >= s.exitAt) me.close(); return; }
    const wave = run.liquidationFeed.filter((item) => !item.warm).at(-1);
    if (wave && wave.chain >= 2 && run.time - wave.time === 1 && s.faded !== wave.id && run.time < 112) {
      s.faded = wave.id;
      me.submit(wave.side === "short" ? "sell" : "buy", "market", q(run, 2500));
      s.exitAt = run.time + 6;
    }
  },
  // Trade the direction of a news headline for 8 seconds.
  news: (run, me, s) => {
    const event = run.activeEvent;
    if (me.account.position) { if (run.time >= s.exitAt) me.close(); return; }
    if (event?.side && s.seen !== event.start && run.time < 112) {
      s.seen = event.start;
      me.submit(event.side > 0 ? "buy" : "sell", "market", q(run, 1500));
      s.exitAt = run.time + 8;
    }
  },
  // A rookie gambler: goes in with the last 20 seconds' trend and holds for a +2% win with no stop,
  // twice at most. At high leverage its liquidation price stays in reach all round.
  holder: (run, me, s) => {
    s.at ??= 8 + (run.seed % 12);
    if (me.account.position) {
      if ((run.market.last / s.entry - 1) * s.direction >= 0.02) me.close();
      return;
    }
    if (run.time < s.at || (s.tries ?? 0) >= 2 || run.time > 100 || run.priceTrail.length < 20) return;
    s.direction = run.market.last >= run.priceTrail.at(-20) ? 1 : -1;
    if (!me.submit(sideOf(s.direction), "market", q(run, 1600)).ok) return;
    s.entry = run.market.last;
    s.tries = (s.tries ?? 0) + 1;
    s.at = run.time + 15;
  },
  // The balance test's tape reader: probe, skip guarded bands, push, exit after 3 s; fade finished chains.
  expert: (run, me, s) => {
    const sizeFor = (target) => {
      let lots = 500;
      while (lots < 10000) {
        const preview = run.previewOrder(sideOf(target.direction), "market", lots, null, me.id);
        if (preview.worstPrice != null && (target.direction > 0 ? preview.worstPrice >= target.peak.price : preview.worstPrice <= target.peak.price)) break;
        lots += 500;
      }
      return lots;
    };
    s.avoid ??= new Map();
    if (me.account.position && !s.probing) { if (run.time >= s.exitAt) me.close(); return; }
    if (s.probing) {
      const target = s.probing;
      s.probing = null;
      if (s.stalled || guarded(run, target)) { me.close(); s.avoid.set(target.peak.price, run.time + 30); s.cool = run.time + 3; return; }
      me.submit(sideOf(target.direction), "market", Math.max(q(run, 500), sizeFor(target)));
      s.exitAt = run.time + 3;
      s.cool = run.time + 7;
      return;
    }
    if (run.time < 3 || run.time > 112) return;
    const wave = run.liquidationFeed.filter((item) => !item.warm).at(-1);
    if (wave && wave.chain >= 2 && run.time - wave.time === 1 && s.faded !== wave.id) {
      s.faded = wave.id;
      me.submit(wave.side === "short" ? "sell" : "buy", "market", q(run, 2500));
      s.exitAt = run.time + 6;
      return;
    }
    if (run.time < (s.cool ?? 0)) return;
    const target = pickBand(run);
    if (!target || (s.avoid.get(target.peak.price) ?? 0) > run.time) return;
    if (guarded(run, target)) { s.cool = run.time + 2; return; }
    const probe = me.submit(sideOf(target.direction), "market", q(run, 1000));
    s.stalled = probe.stalled || probe.impact * target.direction < 0.12;
    s.probing = target;
  },
};

// Opponents by difficulty, each with a display name and leverage. Rookies run high leverage, so
// their liquidation prices sit close enough to hunt; experts keep theirs far away.
export const ARENA_BOT_ROSTER = {
  rookie: [{ bot: "holder", name: "死抱不放", leverage: 20 }, { bot: "pump", name: "莽撞推手", leverage: 10 }],
  skilled: [{ bot: "news", name: "快訊追手", leverage: 20 }, { bot: "fade", name: "反手客", leverage: 10 }, { bot: "ladderFlip", name: "埋伏者", leverage: 5 }],
  expert: [{ bot: "chain", name: "讀盤手", leverage: 3 }, { bot: "chainBig3x", name: "重倉手", leverage: 3 }],
};
