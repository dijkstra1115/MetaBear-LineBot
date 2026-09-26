// A closed, fictional linear perpetual market. Price and OI come from matched
// orders and participant positions; no scenario writes either series directly.
export const CHALLENGE_STEP_MS = 1000;
export const CHALLENGE_FEE_BPS = { maker: 2, taker: 5 };
export const CHALLENGE_MAINTENANCE = 0.005;
const MAX_SIZE = 100000;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const notional = (price, lots) => (price * lots) / 10000;
const roundMoney = (n) => Math.round(n * 10000) / 10000;
function mixSeed(seed) {
  let value = seed >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

export class SeededRandom {
  constructor(seed = 1) {
    this.state = seed >>> 0 || 1;
  }
  next() {
    let n = this.state;
    n ^= n << 13;
    n ^= n >>> 17;
    n ^= n << 5;
    this.state = n >>> 0;
    return this.state / 4294967296;
  }
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(probability) {
    return this.next() < probability;
  }
}

export class FuturesBook {
  constructor() {
    this.time = 0;
    this.sequence = 0;
    this.accounts = {};
    this.orders = [];
    this.trades = [];
    this.liquidations = [];
    this.lastPrice = 10000;
    this.indexPrice = 10000;
    this.markPrice = 10000;
    this.fees = 0;
    this.insurance = 0;
  }
  addAccount(id, balance, leverage = 5) {
    if (this.accounts[id] || balance <= 0 || leverage < 1 || leverage > 30)
      throw Error("Invalid account");
    this.accounts[id] = { balance, position: 0, entry: 0, leverage };
  }
  book(side) {
    return this.orders
      .filter((o) => o.side === side && o.remaining > 0)
      .sort(
        (a, b) =>
          (side === "buy" ? b.price - a.price : a.price - b.price) || a.id - b.id,
      );
  }
  levels(side, count = 12) {
    const rows = [];
    for (const order of this.book(side)) {
      let row = rows.at(-1);
      if (!row || row.price !== order.price) {
        if (rows.length >= count) break;
        row = { price: order.price, size: 0, own: 0 };
        rows.push(row);
      }
      row.size += order.remaining;
      if (order.owner === "player") row.own += order.remaining;
    }
    return rows;
  }
  openInterest() {
    return Object.values(this.accounts).reduce(
      (total, account) => total + Math.max(0, account.position),
      0,
    );
  }
  equity(id, price = this.markPrice) {
    const account = this.accounts[id];
    return roundMoney(
      account.balance +
        (account.position * (price - account.entry)) / 10000,
    );
  }
  exposure(id, price = this.markPrice) {
    return notional(price, Math.abs(this.accounts[id].position));
  }
  freeCollateral(id) {
    const account = this.accounts[id];
    const buys = this.orders
      .filter((o) => o.owner === id && o.side === "buy")
      .reduce((sum, o) => sum + o.remaining, 0);
    const sells = this.orders
      .filter((o) => o.owner === id && o.side === "sell")
      .reduce((sum, o) => sum + o.remaining, 0);
    const worst = Math.max(
      Math.abs(account.position + buys),
      Math.abs(account.position - sells),
    );
    return this.equity(id) - notional(this.markPrice, worst) / account.leverage;
  }
  updateMark() {
    const bid = this.book("buy")[0]?.price;
    const ask = this.book("sell")[0]?.price;
    const midpoint = bid && ask ? (bid + ask) / 2 : this.lastPrice;
    // A single last-price print cannot force a liquidation.
    this.markPrice = Math.round(midpoint * 0.7 + this.indexPrice * 0.3);
  }
  cancel(id, owner) {
    const index = this.orders.findIndex((o) => o.id === id && o.owner === owner);
    if (index < 0) return false;
    this.orders.splice(index, 1);
    return true;
  }
  cancelAll(owner) {
    const before = this.orders.length;
    this.orders = this.orders.filter((o) => o.owner !== owner);
    return before - this.orders.length;
  }
  expire() {
    this.orders = this.orders.filter((o) => o.expires == null || o.expires > this.time);
  }
  validate(owner, command) {
    const account = this.accounts[owner];
    if (!account) return "帳戶不存在";
    const { side, type, size, price } = command;
    if (!["buy", "sell"].includes(side) || !["market", "limit"].includes(type))
      return "無效的委託";
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_SIZE)
      return "數量須為 0.01 BEAR 的倍數";
    if (type === "limit" && (!Number.isSafeInteger(price) || price < 100 || price > 1000000))
      return "限價超出允許範圍";
    if (this.equity(owner) <= 0) return "權益不足，無法下單";
    const buys = this.orders
      .filter((o) => o.owner === owner && o.side === "buy")
      .reduce((sum, o) => sum + o.remaining, 0);
    const sells = this.orders
      .filter((o) => o.owner === owner && o.side === "sell")
      .reduce((sum, o) => sum + o.remaining, 0);
    const existingWorst = Math.max(
      Math.abs(account.position + buys),
      Math.abs(account.position - sells),
    );
    const worst = Math.max(
      Math.abs(account.position + buys + (side === "buy" ? size : 0)),
      Math.abs(account.position - sells - (side === "sell" ? size : 0)),
    );
    const checkPrice = Math.max(this.markPrice, type === "limit" ? price : this.lastPrice);
    const fee = notional(checkPrice, size) * 0.0005;
    // Reducing an existing position must remain possible after its initial
    // margin has been impaired by a loss.
    const required = worst <= existingWorst
      ? fee
      : notional(checkPrice, worst) / account.leverage + fee;
    if (required > this.equity(owner) + 0.0001)
      return "保證金不足，請降低數量或槓桿";
    return null;
  }
  fillAccount(id, direction, lots, price, feeBps) {
    const a = this.accounts[id];
    const old = a.position;
    const change = direction * lots;
    let realized = 0;
    if (old && Math.sign(old) !== direction) {
      const closing = Math.min(Math.abs(old), lots);
      realized = (Math.sign(old) * (price - a.entry) * closing) / 10000;
    }
    const next = old + change;
    if (!old || Math.sign(old) === direction) {
      a.entry = next
        ? Math.round((Math.abs(old) * a.entry + lots * price) / Math.abs(next))
        : 0;
    } else if (!next) a.entry = 0;
    else if (Math.sign(next) !== Math.sign(old)) a.entry = price;
    a.position = next;
    const charge = (notional(price, lots) * feeBps) / 10000;
    a.balance = roundMoney(a.balance + realized - charge);
    this.fees = roundMoney(this.fees + charge);
  }
  submit(owner, command, options = {}) {
    const error = options.liquidation ? null : this.validate(owner, command);
    if (error) return { ok: false, error, filled: 0 };
    const order = {
      id: ++this.sequence,
      owner,
      side: command.side,
      type: command.type,
      price: command.type === "limit" ? command.price : null,
      size: command.size,
      remaining: command.size,
      time: this.time,
      expires: command.expires ?? null,
    };
    let selfBlocked = false;
    for (const maker of this.book(order.side === "buy" ? "sell" : "buy")) {
      if (!order.remaining) break;
      if (
        order.type === "limit" &&
        (order.side === "buy" ? maker.price > order.price : maker.price < order.price)
      ) break;
      if (maker.owner === owner) {
        selfBlocked = true;
        break;
      }
      const lots = Math.min(order.remaining, maker.remaining);
      const buyer = order.side === "buy" ? owner : maker.owner;
      const seller = order.side === "sell" ? owner : maker.owner;
      const beforeOI = this.openInterest();
      this.fillAccount(
        buyer,
        1,
        lots,
        maker.price,
        buyer === owner ? CHALLENGE_FEE_BPS.taker : CHALLENGE_FEE_BPS.maker,
      );
      this.fillAccount(
        seller,
        -1,
        lots,
        maker.price,
        seller === owner ? CHALLENGE_FEE_BPS.taker : CHALLENGE_FEE_BPS.maker,
      );
      order.remaining -= lots;
      maker.remaining -= lots;
      this.lastPrice = maker.price;
      this.trades.push({
        id: ++this.sequence,
        time: this.time,
        price: maker.price,
        size: lots,
        side: order.side,
        maker: maker.owner,
        taker: owner,
        oiDelta: this.openInterest() - beforeOI,
        liquidation: Boolean(options.liquidation),
      });
    }
    this.orders = this.orders.filter((o) => o.remaining > 0);
    if (order.remaining && order.type === "limit" && !selfBlocked) this.orders.push(order);
    this.updateMark();
    return {
      ok: true,
      order,
      filled: order.size - order.remaining,
      remaining: order.remaining,
      canceled: selfBlocked || order.type === "market",
    };
  }
  liquidate() {
    for (const [id, account] of Object.entries(this.accounts)) {
      if (!account.position) continue;
      const maintenance = this.exposure(id) * CHALLENGE_MAINTENANCE;
      if (this.equity(id) > maintenance) continue;
      this.cancelAll(id);
      const side = account.position > 0 ? "sell" : "buy";
      const size = Math.abs(account.position);
      const result = this.submit(id, { side, type: "market", size }, { liquidation: true });
      if (result.filled) {
        this.liquidations.push({ time: this.time, owner: id, side, size: result.filled });
        if (account.balance < 0 && !account.position) {
          this.insurance = roundMoney(this.insurance + account.balance);
          account.balance = 0;
        }
      }
    }
  }
}

export const CHALLENGES = Object.freeze([
  {
    id: "first-flow",
    number: "01",
    duration: 150,
    target: 0.6,
    maxDrawdown: null,
    maxExposure: null,
    accent: "mint",
    boss: "流動性提供者",
  },
  {
    id: "false-break",
    number: "02",
    duration: 180,
    target: 0.9,
    maxDrawdown: 5,
    maxExposure: null,
    accent: "coral",
    boss: "匿名大戶",
  },
  {
    id: "covering-rally",
    number: "03",
    duration: 195,
    target: 0.8,
    maxDrawdown: 4,
    maxExposure: 400,
    accent: "violet",
    boss: "趨勢獵手",
  },
  {
    id: "thin-book",
    number: "04",
    duration: 210,
    target: 1,
    maxDrawdown: 3.5,
    maxExposure: 300,
    maxMarginUsage: 60,
    accent: "amber",
    boss: "薄簿獵手",
  },
]);

function referenceOffset(id, t, branch) {
  if (id === "first-flow")
    return t < 22 ? 0 : t < 105 ? (t - 22) * 5 : 415 + (t - 105) * 1.5;
  if (id === "false-break")
    return t < 35 ? 0 : t < 74 ? (t - 35) * 4 : branch === "continuation" ? 156 + (t - 74) * 2.5 : t < 115 ? 156 - (t - 74) * 11 : -295;
  if (id === "covering-rally")
    return t < 45 ? -t * 3 : t < 120 ? -135 + (t - 45) * 5 : branch === "fresh" ? 240 + (t - 120) * 1.2 : 240 - (t - 120) * 2;
  return t < 40 ? 0 : t < 92 ? (t - 40) * 5 : branch === "continuation" ? 260 + (t - 92) * 1.8 : t < 145 ? 260 - (t - 92) * 10 : -270;
}

export class ChallengeRun {
  constructor(challengeId = CHALLENGES[0].id, seed = 1) {
    this.definition = CHALLENGES.find((item) => item.id === challengeId);
    if (!this.definition) throw Error("Unknown challenge");
    this.seed = seed >>> 0 || 1;
    this.rng = new SeededRandom(mixSeed(this.seed));
    this.profile = {
      polarity: this.rng.chance(0.5) ? 1 : -1,
      pace: 0.86 + this.rng.next() * 0.26,
      delay: this.rng.int(0, 9),
      branch: this.rng.chance(0.5) ? "continuation" : "trap",
    };
    if (challengeId === "covering-rally") this.profile.branch = this.rng.chance(0.5) ? "fresh" : "covering";
    this.indexNoise = 0;
    this.burstRng = new SeededRandom(mixSeed(this.seed ^ 0x5b17d3a9));
    this.flowBurst = null;
    this.nextFlowBurst = this.burstRng.int(13, 21);
    this.book = new FuturesBook();
    this.time = 0;
    this.candles = [];
    this.events = [];
    this.messages = [];
    this.actionCount = 0;
    this.peakEquity = 10000;
    this.maxDrawdown = 0;
    this.peakExposure = 0;
    this.peakMarginUsage = 0;
    this.equityHistory = [{ time: 0, value: 10000 }];
    this.lastTradeIndex = 0;
    this.cvd = 0;
    this.initialEquity = 10000;
    this.finished = false;
    this.protection = null;
    this.book.addAccount("player", this.initialEquity, 5);
    this.book.addAccount("boss", 450000, 7);
    for (let i = 0; i < 3; i++)
      this.book.addAccount(`maker-${i}`, 1000000, 10);
    this.nextMakerQuote = [0, 0, 0];
    for (let i = 0; i < 9; i++)
      this.book.addAccount(`crowd-${i}`, 120000, 8);
    for (let i = 0; i < 4; i++)
      this.book.addAccount(`entrant-${i}`, 250000, 8);
    for (let i = 0; i < 6; i++)
      this.book.addAccount(`cover-${i}`, 250000, 8);
    this.previousPhase = 0;
    this.requote();
    this.capture();
  }
  event(title, detail, tone = "neutral") {
    this.events.unshift({ time: this.time, title, detail, tone });
    this.events.length = Math.min(this.events.length, 24);
  }
  send(owner, side, size, type = "market", price = null, lifetime = 6) {
    const command = {
      side,
      type,
      size: Math.max(1, Math.round(size)),
      price,
      expires: type === "limit" ? this.time + lifetime : null,
    };
    return this.book.submit(owner, command);
  }
  phaseTime() {
    return Math.floor((this.time - this.profile.delay) / this.profile.pace);
  }
  flowSide(side) {
    return this.profile.polarity === 1 ? side : side === "buy" ? "sell" : "buy";
  }
  sendFlow(owner, side, size) {
    return this.send(owner, this.flowSide(side), size);
  }
  requote() {
    const x = this.book;
    for (let i = 0; i < 3; i++) {
      if (this.time < this.nextMakerQuote[i]) continue;
      const id = `maker-${i}`;
      x.cancelAll(id);
      const inventory = x.accounts[id].position / 100;
      const center = Math.round(
        x.indexPrice * 0.72 + x.lastPrice * 0.28 - inventory * 1.1 + this.rng.int(-8, 8),
      );
      const phase = this.phaseTime();
      const thin =
        (this.definition.id === "false-break" && phase >= 47 && phase < 75) ||
        (this.definition.id === "thin-book" && phase >= 54 && phase < 105);
      const depth = thin ? this.rng.int(3, 5) : this.rng.int(6, 9);
      const sizeFactor = thin ? 0.32 + this.rng.next() * 0.15 : 0.85 + this.rng.next() * 0.3;
      for (let level = 0; level < depth; level++) {
        const distance = Math.max(3, 12 + level * 9 + i * 2 + this.rng.int(-4, 5));
        const size = Math.round(
          (900 + this.rng.int(0, 600) + level * 85) * sizeFactor,
        );
        for (const side of ["buy", "sell"]) {
          const opposite = x.book(side === "buy" ? "sell" : "buy")[0]?.price;
          let quote = center + (side === "buy" ? -distance : distance);
          if (opposite != null) quote = side === "buy" ? Math.min(quote, opposite - 1) : Math.max(quote, opposite + 1);
          this.send(
            id,
            side,
            size,
            "limit",
            Math.max(100, quote),
            this.rng.int(10, 18),
          );
        }
      }
      this.nextMakerQuote[i] = this.time + this.rng.int(4, 9);
    }
  }
  scriptedActions() {
    const t = this.phaseTime();
    if (t <= this.previousPhase) return;
    const at = (point) => this.previousPhase < point && t >= point;
    const id = this.definition.id;
    if (id === "first-flow") {
      if (at(22)) this.event("主動成交加速", "留意被掃過的價位是否繼續補單。", "mint");
      if (t >= 22 && t <= 105 && t % 6 === 0)
        this.sendFlow(`crowd-${t % 9}`, "buy", this.rng.int(1000, 2600));
      if (at(88)) this.event("價格回測", "觀察委託簿是否仍能承接主動單。", "neutral");
    } else if (id === "false-break") {
      if (at(35)) this.event("價位反覆受測", "同一區域出現連續主動成交。", "neutral");
      if (at(48)) this.event("一側深度縮小", "價差可能擴大；留意突破後的成交。", "amber");
      if (at(60)) {
        this.sendFlow("boss", "buy", 31000);
        this.event("委託簿被掃穿", "大筆市價單穿過多個價位。", "mint");
      }
      if (t >= 61 && t <= 87 && t % 5 === 0)
        this.sendFlow(`crowd-${t % 9}`, "buy", this.rng.int(900, 2400));
      if (t >= 69 && t <= 110 && t % 4 === 1) {
        if (this.profile.branch === "trap") this.sendFlow("boss", "sell", 5000);
        else this.sendFlow(`entrant-${t % 4}`, "buy", this.rng.int(2200, 4700));
      }
      if (at(102)) this.event("突破接受度待確認", "比較價格、主動量與新掛單是否同步。", "neutral");
    } else if (id === "covering-rally") {
      if (at(16)) this.event("單側壓力增加", "價格和未平倉量開始分化。", "coral");
      if (t >= 12 && t <= 45 && t % 5 === 2) {
        this.sendFlow(`crowd-${t % 9}`, "sell", this.rng.int(1100, 2500));
        if (this.profile.branch === "covering")
          this.sendFlow(`cover-${Math.floor((t - 12) / 5) % 6}`, "sell", this.rng.int(2600, 3900));
      }
      if (at(55)) this.event("方向快速切換", "觀察價格推進時 OI 是增加還是減少。", "mint");
      if (t >= 55 && t <= 111 && t % 4 === 3) {
        if (this.profile.branch === "covering") {
          const owner = `cover-${Math.floor((t - 55) / 4) % 6}`;
          const closing = Math.max(0, -this.book.accounts[owner].position * this.profile.polarity);
          if (closing) this.sendFlow(owner, "buy", closing);
        } else this.sendFlow(`entrant-${t % 4}`, "buy", this.rng.int(1400, 2800));
      }
      if (at(120)) this.event("後續承接待確認", "第一波推進之後，觀察是否仍有新成交。", "amber");
    } else {
      if (at(40)) this.event("價格反覆測試", "主動成交增加，但價位尚未站穩。", "neutral");
      if (at(55)) this.event("掛單突然稀薄", "部分流動性撤離，價差開始擴大。", "amber");
      if (at(73)) {
        this.sendFlow("boss", "buy", 42000);
        this.event("薄簿被掃穿", "大額市價單穿過多個價位。", "mint");
      }
      if (t >= 74 && t <= 99 && t % 4 === 2)
        this.sendFlow(`crowd-${t % 9}`, "buy", this.rng.int(1200, 3000));
      if (t >= 89 && t <= 139 && t % 3 === 2) {
        if (this.profile.branch === "trap") this.sendFlow("boss", "sell", 4800);
        else this.sendFlow(`entrant-${t % 4}`, "buy", this.rng.int(1800, 4000));
      }
      if (at(123)) this.event("成交密集區", "比較價格延續、OI 與新的掛單深度。", "neutral");
    }
    this.previousPhase = t;
  }
  ambientActions() {
    const t = this.time;
    this.requote();
    for (let i = 0; i < 9; i++) {
      if ((t + i * 4) % (7 + (i % 5)) !== 0) continue;
      const id = `crowd-${i}`;
      const signal = this.book.indexPrice - this.book.lastPrice;
      const buyChance = clamp(0.5 + signal / 900 + ((i % 3) - 1) * 0.08, 0.18, 0.82);
      const side = this.rng.chance(buyChance) ? "buy" : "sell";
      this.send(id, side, this.rng.int(180, 1050));
    }
    // Short clusters of aggressive orders create irregular, trade-backed
    // candles. They can briefly run against the scenario's broader flow.
    const phase = this.phaseTime();
    const preserveOiRead = this.definition.id === "covering-rally" && phase <= 120;
    if (!this.flowBurst && !preserveOiRead && t >= this.nextFlowBurst) {
      const referenceMove = referenceOffset(this.definition.id, phase + 6, this.profile.branch)
        - referenceOffset(this.definition.id, phase, this.profile.branch);
      const scenarioSide = Math.sign(referenceMove) * this.profile.polarity || this.profile.polarity;
      this.flowBurst = {
        side: this.burstRng.chance(0.58) ? scenarioSide : -scenarioSide,
        remaining: this.burstRng.int(3, 5),
        size: this.burstRng.int(5500, 8500),
      };
    }
    if (this.flowBurst) {
      const burst = this.flowBurst;
      this.send(`crowd-${(t + 3) % 9}`, burst.side > 0 ? "buy" : "sell", Math.round(burst.size * (0.8 + this.burstRng.next() * 0.5)));
      burst.remaining--;
      if (!burst.remaining) {
        this.flowBurst = null;
        this.nextFlowBurst = t + this.burstRng.int(14, 25);
      }
    }
    if (t % 19 === 6) {
      const trend = this.book.lastPrice - this.book.indexPrice;
      this.send(
        "boss",
        trend > 100 ? "sell" : "buy",
        this.rng.int(900, 2400),
      );
    }
  }
  capture() {
    const x = this.book;
    const trades = x.trades.slice(this.lastTradeIndex);
    this.lastTradeIndex = x.trades.length;
    const bucket = Math.floor(this.time / 5) * 5;
    let candle = this.candles.at(-1);
    if (!candle || candle.time !== bucket) {
      const price = candle?.close ?? x.lastPrice;
      candle = {
        time: bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
        delta: 0,
        cvd: this.cvd,
        oi: x.openInterest(),
      };
      this.candles.push(candle);
    }
    for (const trade of trades) {
      candle.high = Math.max(candle.high, trade.price);
      candle.low = Math.min(candle.low, trade.price);
      candle.close = trade.price;
      candle.volume += trade.size;
      candle.delta += trade.side === "buy" ? trade.size : -trade.size;
      this.cvd += trade.side === "buy" ? trade.size : -trade.size;
    }
    candle.cvd = this.cvd;
    candle.oi = x.openInterest();
    const equity = x.equity("player");
    this.peakEquity = Math.max(this.peakEquity, equity);
    this.maxDrawdown = Math.max(
      this.maxDrawdown,
      ((this.peakEquity - equity) / this.peakEquity) * 100,
    );
    this.peakExposure = Math.max(
      this.peakExposure,
      (x.exposure("player") / Math.max(equity, 0.01)) * 100,
    );
    this.peakMarginUsage = Math.max(
      this.peakMarginUsage,
      ((equity - x.freeCollateral("player")) / Math.max(equity, 0.01)) * 100,
    );
    this.equityHistory.push({ time: this.time, value: equity });
  }
  step() {
    if (this.finished) return false;
    this.time++;
    this.book.time = this.time;
    this.book.expire();
    const offset = referenceOffset(this.definition.id, this.phaseTime(), this.profile.branch);
    this.indexNoise = clamp(this.indexNoise * 0.82 + this.rng.int(-22, 22), -110, 110);
    this.book.indexPrice = Math.max(
      100,
      Math.round(10000 + offset * this.profile.polarity + this.indexNoise + this.rng.int(-10, 10)),
    );
    this.ambientActions();
    this.scriptedActions();
    this.book.updateMark();
    this.book.liquidate();
    this.checkProtection();
    this.capture();
    if (this.time >= this.definition.duration) {
      this.finished = true;
      this.event("回合結束", "查看通關條件與關鍵盤面。", "neutral");
    }
    return true;
  }
  advance(seconds = 1) {
    for (let i = 0; i < seconds && !this.finished; i++) this.step();
  }
  setLeverage(leverage) {
    if (![1, 2, 3, 5, 10, 20].includes(leverage)) return false;
    const account = this.book.accounts.player;
    const previous = account.leverage;
    account.leverage = leverage;
    if (this.book.freeCollateral("player") < -0.0001) {
      account.leverage = previous;
      return false;
    }
    return true;
  }
  order(side, type, size, price) {
    if (this.finished) return { ok: false, error: "本回合已結束" };
    const previous = Math.sign(this.book.accounts.player.position);
    const result = this.book.submit("player", { side, type, size, price });
    if (result.ok) {
      this.actionCount++;
      const current = Math.sign(this.book.accounts.player.position);
      if (previous && previous !== current) this.protection = null;
      this.capture();
    }
    return result;
  }
  closePosition() {
    const position = this.book.accounts.player.position;
    if (!position) return { ok: false, error: "目前沒有部位" };
    this.book.cancelAll("player");
    return this.order(position > 0 ? "sell" : "buy", "market", Math.abs(position));
  }
  reducePosition(fraction) {
    const position = this.book.accounts.player.position;
    if (!position) return { ok: false, error: "目前沒有部位" };
    if (!(fraction > 0 && fraction < 1)) return { ok: false, error: "無效的減倉比例" };
    const size = Math.max(1, Math.floor(Math.abs(position) * fraction));
    return this.order(position > 0 ? "sell" : "buy", "market", size);
  }
  setProtection(stopLoss, takeProfit) {
    const position = this.book.accounts.player.position;
    if (!position) return { ok: false, error: "先建立部位才能設定風險指令" };
    const mark = this.book.markPrice;
    for (const value of [stopLoss, takeProfit])
      if (value != null && (!Number.isSafeInteger(value) || value < 100 || value > 1000000))
        return { ok: false, error: "價格須介於 1 與 10,000 USDT" };
    if (stopLoss == null && takeProfit == null) return { ok: false, error: "請填入止損或止盈價格" };
    if (position > 0 ? (stopLoss != null && stopLoss >= mark) || (takeProfit != null && takeProfit <= mark) : (stopLoss != null && stopLoss <= mark) || (takeProfit != null && takeProfit >= mark))
      return { ok: false, error: "止損與止盈需分別位於標記價格兩側" };
    this.protection = { stopLoss, takeProfit, direction: Math.sign(position) };
    return { ok: true };
  }
  checkProtection() {
    const plan = this.protection;
    const position = this.book.accounts.player.position;
    if (!plan || !position || Math.sign(position) !== plan.direction) {
      this.protection = null;
      return;
    }
    const mark = this.book.markPrice;
    const stopped = plan.stopLoss != null && (position > 0 ? mark <= plan.stopLoss : mark >= plan.stopLoss);
    const profited = plan.takeProfit != null && (position > 0 ? mark >= plan.takeProfit : mark <= plan.takeProfit);
    if (!stopped && !profited) return;
    const result = this.closePosition();
    if (result.filled) this.event(stopped ? "止損觸發" : "止盈觸發", `標記價格觸及設定價，已市價平倉 ${roundMoney(result.filled / 100)} BEAR。`, stopped ? "coral" : "mint");
  }
  reviewWindow() {
    const phase = this.definition.id === "first-flow" ? [22, 105] : this.definition.id === "false-break" ? [55, 110] : this.definition.id === "covering-rally" ? [55, 115] : [55, 145];
    const fromTime = Math.round(phase[0] * this.profile.pace + this.profile.delay);
    const toTime = Math.round(phase[1] * this.profile.pace + this.profile.delay);
    const from = this.candles.find((candle) => candle.time >= fromTime) ?? this.candles[0];
    const to = this.candles.findLast((candle) => candle.time <= toTime) ?? this.candles.at(-1);
    return {
      fromTime: from.time,
      toTime: to.time,
      pricePct: ((to.close / from.close) - 1) * 100,
      cvdDelta: to.cvd - from.cvd,
      oiDelta: to.oi - from.oi,
    };
  }
  result() {
    const equity = this.book.equity("player");
    const returnPct = ((equity / this.initialEquity) - 1) * 100;
    const checks = [
      { label: "收益目標", value: returnPct, target: this.definition.target, pass: returnPct >= this.definition.target },
    ];
    if (this.definition.maxDrawdown != null)
      checks.push({
        label: "最大回撤",
        value: this.maxDrawdown,
        target: this.definition.maxDrawdown,
        pass: this.maxDrawdown <= this.definition.maxDrawdown,
      });
    if (this.definition.maxExposure != null)
      checks.push({
        label: "最高資金曝險",
        value: this.peakExposure,
        target: this.definition.maxExposure,
        pass: this.peakExposure <= this.definition.maxExposure,
      });
    if (this.definition.maxMarginUsage != null)
      checks.push({
        label: "最高保證金使用率",
        value: this.peakMarginUsage,
        target: this.definition.maxMarginUsage,
        pass: this.peakMarginUsage <= this.definition.maxMarginUsage,
      });
    return { equity, returnPct, checks, pass: checks.every((check) => check.pass) };
  }
}
