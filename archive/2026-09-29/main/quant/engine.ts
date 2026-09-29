import {
  DEFAULT_CONFIG,
  type Config,
  type Frame,
  type Features,
  type State,
  type StepResult,
  type Decision,
  type Level,
  type Side,
} from "./types.js";

export function initialState(c: Config = DEFAULT_CONFIG): State {
  return {
    cash: c.initialBalance,
    positions: [],
    pending: [],
    paused: false,
    peakEquity: c.initialBalance,
    maxDrawdownPct: 0,
    day: "",
    dayStartEquity: c.initialBalance,
    haltedDay: null,
    lastDecision: {},
    lastExit: {},
    lastFrame: {},
    completed: 0,
    wins: 0,
    netProfit: 0,
    grossWins: 0,
    grossLosses: 0,
    totalFees: 0,
    totalFunding: 0,
  };
}
export function equity(s: State) {
  return (
    s.cash +
    s.positions.reduce(
      (v, p) =>
        v + (p.lastMark - p.entry) * p.qty * (p.side === "long" ? 1 : -1),
      0,
    )
  );
}
export function walkBook(levels: Level[], qty: number): number | null {
  let remaining = qty,
    value = 0;
  for (const [price, size] of levels) {
    const take = Math.min(remaining, size);
    value += take * price;
    remaining -= take;
    if (remaining < 1e-10) return value / qty;
  }
  return null;
}
export function features(f: Frame): Features {
  const end = Math.floor((f.time - 5000) / 60000) * 60000;
  const closed = f.candles
    .filter((b) => b.time + 60000 <= end)
    .sort((a, b) => a.time - b.time);
  const last = closed.at(-1),
    previous = closed.slice(-16, -1);
  const issues = [...f.issues];
  const sumFlow = (rows: Frame["perp"]) => {
    const selected = rows.filter((r) => r.time >= end - 300000 && r.time < end);
    const complete =
      selected.length === 5 &&
      selected.every((r, i) => r.time === end - 300000 + i * 60000);
    if (!complete) issues.push("等待完整五分鐘成交資料");
    const buy = selected.reduce((n, r) => n + r.buy, 0),
      sell = selected.reduce((n, r) => n + r.sell, 0);
    return {
      delta: buy - sell,
      ratio: buy + sell > 0 ? (buy - sell) / (buy + sell) : null,
    };
  };
  const perp = sumFlow(f.perp),
    spot = sumFlow(f.spot);
  const priceReady =
    closed.length >= 16 &&
    last?.time === end - 60000 &&
    closed.slice(-16).every((b, i) => b.time === end - 16 * 60000 + i * 60000);
  if (!priceReady) issues.push("K 線尚未完整或已過期");
  if (f.coverageStart > end - 300000)
    issues.push("串流暖機中，尚未連續收集五分鐘");
  if (!f.healthy || f.time - f.bookTime > 5000 || f.bookTime > f.time + 2000)
    issues.push("行情連線或深度過期");
  if (f.oiChangePct === null) issues.push("等待五分鐘 OI 基準");
  if (perp.ratio === null || spot.ratio === null) issues.push("成交量不足");
  const bid = f.bids[0]?.[0],
    ask = f.asks[0]?.[0];
  const mid = bid && ask ? (bid + ask) / 2 : 0;
  const validBook =
    mid > 0 && ask! > bid! && f.bids.length >= 50 && f.asks.length >= 50;
  if (!validBook) issues.push("買賣盤不完整");
  const notional = (levels: Level[]) =>
    levels.reduce((n, [p, q]) => n + p * q, 0);
  const bids = notional(f.bids.slice(0, 50)),
    asks = notional(f.asks.slice(0, 50));
  const atr = priceReady
    ? closed.slice(-14).reduce((n, b, i) => {
        const prev = closed[closed.length - 15 + i].close;
        return (
          n +
          Math.max(
            b.high - b.low,
            Math.abs(b.high - prev),
            Math.abs(b.low - prev),
          )
        );
      }, 0) / 14
    : null;
  const bands = [10, 25, 50].map((bps) => ({
    bps,
    bid: notional(f.bids.filter(([p]) => p >= mid * (1 - bps / 10000))),
    ask: notional(f.asks.filter(([p]) => p <= mid * (1 + bps / 10000))),
    covered:
      validBook &&
      f.bids.at(-1)![0] <= mid * (1 - bps / 10000) &&
      f.asks.at(-1)![0] >= mid * (1 + bps / 10000),
  }));
  return {
    windowEnd: end,
    close: last?.close ?? null,
    rangeHigh: priceReady ? Math.max(...previous.map((b) => b.high)) : null,
    rangeLow: priceReady ? Math.min(...previous.map((b) => b.low)) : null,
    atr,
    perpDelta: perp.delta,
    spotDelta: spot.delta,
    perpRatio: perp.ratio,
    spotRatio: spot.ratio,
    imbalance: validBook ? (bids - asks) / (bids + asks) : null,
    spreadBps: validBook ? ((ask - bid) / mid) * 10000 : null,
    oiChangePct: f.oiChangePct,
    ready: issues.length === 0,
    issues: [...new Set(issues)],
    bands,
  };
}
export function decide(f: Frame, x: Features, c: Config): Decision {
  const checks = [
    {
      label: "突破前十五根已收盤 K 線",
      long:
        x.close !== null &&
        x.rangeHigh !== null &&
        x.close > x.rangeHigh * 1.0001,
      short:
        x.close !== null &&
        x.rangeLow !== null &&
        x.close < x.rangeLow * 0.9999,
      value: x.close?.toFixed(2) ?? "—",
    },
    {
      label: "永續主動成交差 ≥ 10%",
      long: (x.perpRatio ?? 0) >= c.perpDelta,
      short: (x.perpRatio ?? 0) <= -c.perpDelta,
      value: percent(x.perpRatio),
    },
    {
      label: "現貨同向成交差 ≥ 3%",
      long: (x.spotRatio ?? 0) >= c.spotDelta,
      short: (x.spotRatio ?? 0) <= -c.spotDelta,
      value: percent(x.spotRatio),
    },
    {
      label: "買賣前五十檔失衡 ≥ 15%",
      long: (x.imbalance ?? 0) >= c.depthImbalance,
      short: (x.imbalance ?? 0) <= -c.depthImbalance,
      value: percent(x.imbalance),
    },
    {
      label: "OI 五分鐘變化非負",
      long: x.oiChangePct !== null && x.oiChangePct >= 0,
      short: x.oiChangePct !== null && x.oiChangePct >= 0,
      value: x.oiChangePct === null ? "—" : `${x.oiChangePct.toFixed(3)}%`,
    },
    {
      label: "價差 ≤ 3 bps",
      long: x.spreadBps !== null && x.spreadBps <= c.maxSpreadBps,
      short: x.spreadBps !== null && x.spreadBps <= c.maxSpreadBps,
      value: x.spreadBps === null ? "—" : `${x.spreadBps.toFixed(2)} bps`,
    },
  ];
  const action =
    x.ready && checks.every((v) => v.long)
      ? "long"
      : x.ready && checks.every((v) => v.short)
        ? "short"
        : "wait";
  return {
    id: `${c.version}:${f.symbol}:${Math.floor(f.time / c.decisionMs)}`,
    symbol: f.symbol,
    time: f.time,
    action,
    reasons: !x.ready
      ? x.issues
      : action === "wait"
        ? ["價格、成交差、深度與 OI 尚未同時符合進場條件"]
        : ["所有方向條件通過，送交固定風控"],
    checks,
    features: x,
    frameId: f.id,
    model: "rules",
    version: c.version,
  };
}
function percent(n: number | null) {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}

/** Pure replayable portfolio transition. Only consumes observations available at f.time. */
export function step(
  previous: State,
  f: Frame,
  c: Config = DEFAULT_CONFIG,
): StepResult {
  const s = structuredClone(previous),
    fills: StepResult["fills"] = [],
    events: StepResult["events"] = [];
  const out: StepResult = {
    state: s,
    decision: null,
    fills,
    events,
    equity: equity(s),
  };
  if (f.time <= (s.lastFrame[f.symbol] ?? 0)) return out;
  s.lastFrame[f.symbol] = f.time;
  const day = new Date(f.time).toISOString().slice(0, 10);
  if (s.day !== day) {
    s.day = day;
    s.dayStartEquity = equity(s);
    s.haltedDay = null;
  }
  const event = (kind: string, message: string, amount?: number) =>
    events.push({
      id: `${f.id}:${kind}:${events.length}`,
      time: f.time,
      symbol: f.symbol,
      kind,
      message,
      ...(amount === undefined ? {} : { amount }),
    });
  const executable =
    f.time - f.bookTime <= 5000 &&
    f.bookTime <= f.time + 2000 &&
    f.bids.length > 0 &&
    f.asks.length > 0 &&
    f.bids[0][0] < f.asks[0][0] &&
    f.mark > 0;
  let p = s.positions.find((p) => p.symbol === f.symbol);
  if (p && executable) {
    const liquidationMark = p.side === "long" ? f.bids[0][0] : f.asks[0][0];
    p.lastMark = liquidationMark;
    p.markTime = f.time;
    if (p.fundingNext !== null && f.time >= p.fundingNext) {
      // Funding is explicitly estimated from the last observed published rate.
      if (p.fundingRate !== null) {
        const amount =
          -p.qty * f.mark * p.fundingRate * (p.side === "long" ? 1 : -1);
        s.cash += amount;
        p.funding += amount;
        s.totalFunding += amount;
        event("funding", "依前次觀測費率估算 funding", amount);
      } else {
        p.fundingUncertain = true;
        event("funding_missing", "缺少結算費率，績效標為 funding 不完整");
      }
      if (f.time - p.fundingNext > 60000) {
        p.fundingUncertain = true;
        event("funding_gap", "服務跨越結算時段中斷，funding 可能不完整");
      }
      p.fundingNext = null;
    }
    if (f.nextFundingTime !== null && f.nextFundingTime > f.time) {
      p.fundingNext = f.nextFundingTime;
      p.fundingRate = f.fundingRate;
    }
    const stop =
      p.side === "long" ? liquidationMark <= p.stop : liquidationMark >= p.stop;
    const target =
      p.side === "long"
        ? liquidationMark >= p.target
        : liquidationMark <= p.target;
    const timeout = f.time - p.openedAt >= c.maxHoldMs;
    if (stop || target || timeout) {
      const avg = walkBook(p.side === "long" ? f.bids : f.asks, p.qty);
      if (avg !== null) {
        const price =
          avg * (1 + ((p.side === "long" ? -1 : 1) * c.slippageBps) / 10000);
        const gross = (price - p.entry) * p.qty * (p.side === "long" ? 1 : -1),
          fee = (price * p.qty * c.feeBps) / 10000;
        const net = gross - fee - p.entryFee + p.funding;
        fills.push({
          id: `${p.id}:exit`,
          positionId: p.id,
          symbol: p.symbol,
          time: f.time,
          kind: "exit",
          side: p.side,
          qty: p.qty,
          price,
          fee,
          grossPnl: gross,
          netPnl: net,
          reason: stop ? "停損" : target ? "停利" : "時間出場",
          decisionId: null,
          fundingUncertain: p.fundingUncertain,
        });
        s.cash += gross - fee;
        s.totalFees += fee;
        s.netProfit += net;
        s.completed++;
        if (net > 0) {
          s.wins++;
          s.grossWins += net;
        } else s.grossLosses -= net;
        s.positions = s.positions.filter((v) => v.id !== p!.id);
        s.lastExit[f.symbol] = f.time;
        p = undefined;
      } else event("exit_depth", "出場深度不足，持倉保留並等待下一快照");
    }
  }
  if (equity(s) <= s.dayStartEquity * (1 - c.dailyLossFraction))
    s.haltedDay = day;
  const pending = s.pending.find((v) => v.symbol === f.symbol);
  if (pending) {
    const remove = () => {
      s.pending = s.pending.filter((v) => v !== pending);
    };
    if (
      s.paused ||
      s.haltedDay === day ||
      f.time - pending.created > c.pendingTtlMs
    ) {
      remove();
      event("cancel", "待成交計畫已過期或風控禁止新倉");
    } else if (
      !p &&
      f.healthy &&
      executable &&
      f.time >= pending.created + c.latencyMs &&
      f.bookTime > pending.created
    ) {
      const px = pending.side === "long" ? f.asks[0][0] : f.bids[0][0];
      const spread = ((f.asks[0][0] - f.bids[0][0]) / px) * 10000;
      const free = Math.max(
        0,
        equity(s) * c.maxExposure -
          s.positions.reduce((n, v) => n + v.qty * v.lastMark, 0),
      );
      const unitCost =
        pending.stopDistance + (px * 2 * (c.feeBps + c.slippageBps)) / 10000;
      const increment = f.symbol === "BTCUSDT" ? 0.001 : 0.01;
      const qty =
        Math.floor(
          Math.min((equity(s) * c.riskFraction) / unitCost, free / px) /
            increment,
        ) * increment;
      const avg =
        qty > 0
          ? walkBook(pending.side === "long" ? f.asks : f.bids, qty)
          : null;
      if (
        spread > c.maxSpreadBps ||
        Math.abs(px / pending.referencePrice - 1) > 0.003 ||
        avg === null ||
        qty * px < 5
      ) {
        remove();
        event("reject", "成交時價差、價格偏移、倉位或深度未通過風控");
      } else {
        const dir = pending.side === "long" ? 1 : -1,
          price = avg * (1 + (dir * c.slippageBps) / 10000),
          fee = (price * qty * c.feeBps) / 10000;
        // Slippage can increase notional: enforce the exposure cap again at the actual fill.
        const entryMark = pending.side === "long" ? f.bids[0][0] : f.asks[0][0];
        const equityAfter = equity(s) - fee + (entryMark - price) * qty * dir;
        const existingExposure = s.positions.reduce(
          (n, v) => n + v.qty * v.lastMark,
          0,
        );
        if (price * qty + existingExposure > equityAfter * c.maxExposure) {
          remove();
          event("reject", "成交滑價與費用後超過最大曝險");
        } else {
          const id = pending.decisionId;
          s.positions.push({
            id,
            symbol: f.symbol,
            side: pending.side,
            qty,
            entry: price,
            stop: price - dir * pending.stopDistance,
            target: price + dir * pending.stopDistance * c.rewardRisk,
            openedAt: f.time,
            entryFee: fee,
            funding: 0,
            lastMark: pending.side === "long" ? f.bids[0][0] : f.asks[0][0],
            markTime: f.time,
            fundingNext:
              f.nextFundingTime !== null && f.nextFundingTime > f.time
                ? f.nextFundingTime
                : null,
            fundingRate: f.fundingRate,
            fundingUncertain:
              f.nextFundingTime === null || f.nextFundingTime <= f.time,
          });
          s.cash -= fee;
          s.totalFees += fee;
          fills.push({
            id: `${id}:entry`,
            positionId: id,
            symbol: f.symbol,
            time: f.time,
            kind: "entry",
            side: pending.side,
            qty,
            price,
            fee,
            grossPnl: 0,
            netPnl: null,
            reason: "訂單流突破",
            decisionId: id,
            fundingUncertain: false,
          });
          remove();
        }
      }
    }
  }
  const slot = Math.floor(f.time / c.decisionMs);
  if (s.lastDecision[f.symbol] !== slot) {
    s.lastDecision[f.symbol] = slot;
    const d = decide(f, features(f), c);
    out.decision = d;
    if (s.positions.some((v) => v.symbol === f.symbol)) {
      d.action = "hold";
      d.reasons = ["既有部位由停損、停利與持有時間管理"];
    } else if (
      s.paused ||
      s.haltedDay === day ||
      f.time - (s.lastExit[f.symbol] ?? 0) < c.cooldownMs
    ) {
      d.action = "wait";
      d.reasons = [
        s.paused
          ? "已暫停新倉"
          : s.haltedDay === day
            ? "達到 UTC 單日虧損上限"
            : "平倉冷卻期間",
      ];
    } else if (
      (d.action === "long" || d.action === "short") &&
      !s.pending.some((v) => v.symbol === f.symbol)
    ) {
      s.pending.push({
        decisionId: d.id,
        symbol: f.symbol,
        side: d.action,
        created: f.time,
        referencePrice: f.mark,
        stopDistance: Math.max(
          (d.features.atr ?? 0) * c.stopAtr,
          (f.mark * c.minStopBps) / 10000,
        ),
      });
    }
  }
  out.equity = equity(s);
  s.peakEquity = Math.max(s.peakEquity, out.equity);
  if (out.equity <= s.dayStartEquity * (1 - c.dailyLossFraction))
    s.haltedDay = day;
  s.maxDrawdownPct = Math.max(
    s.maxDrawdownPct,
    ((s.peakEquity - out.equity) / s.peakEquity) * 100,
  );
  return out;
}
