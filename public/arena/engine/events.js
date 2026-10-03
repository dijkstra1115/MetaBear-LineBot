import { roundPrice } from "./book.js";

// Sudden events. Each one is played by a hidden whale account that trades through the book like
// everyone else, plus shifts in mood and in how much the maker is willing to quote. Every event has
// an omen phase first: the signs are in public data (absorption on one side, CVD diverging from
// price, depth thinning, open interest building), but nothing is announced until the main phase.
export const EVENT_KINDS = {
  dump: {
    name: "大戶出貨・恐慌拋售",
    omen: "有人在賣方用冰山單默默出貨：主動買進一直被吸收，CVD 往上但價格推不動。",
    main: "大量市價賣單湧入，下方多單的停損與強平帶可能被連環引爆。",
  },
  squeeze: {
    name: "軋空",
    omen: "有人在買方用冰山單默默接貨：主動賣出一直被吸收，CVD 往下但價格跌不動，空單越積越多。",
    main: "大量市價買單湧入，上方空單的停損與強平帶可能被連環引爆。",
  },
  drought: {
    name: "流動性枯竭",
    omen: "造市商正在悄悄撤單：±1% 深度越來越薄，價差越來越大。",
    main: "近價掛單幾乎被撤光，一點點成交量就能把價格推很遠，出場也會滑價。",
  },
  accumulate: {
    name: "大戶建倉拉抬",
    omen: "有人在買方長時間吸收賣壓建倉：同一價位反覆成交、價格守得很穩。",
    main: "建倉完成，大戶開始主動往上買，市場情緒轉向樂觀。",
  },
};

const MIN = 60;

export class EventDirector {
  constructor(sim) {
    this.sim = sim;
    this.whale = sim.addAccount("whale", "whale");
    this.active = null;
    this.history = [];
    this.next = 0;
    this.started = null;
    this.quotes = [];
  }

  // The first event comes 40–120 simulated minutes into the session, then every two to five hours.
  arm() {
    this.next = this.sim.time + this.sim.rng.int(40, 120) * MIN;
  }

  step() {
    const sim = this.sim;
    this.started = null;
    if (!this.active) {
      if (sim.warming || !this.next || sim.time < this.next) {
        this.unwind();
        return;
      }
      this.begin();
    }
    const event = this.active;
    if (event.phase === "omen" && sim.time >= event.omenEnd) {
      event.phase = "main";
      event.mainStart = sim.time;
      this.started = event;
      this.clearQuotes();
      if (event.kind === "dump" || event.kind === "squeeze") sim.sentiment.value = clamp(sim.sentiment.value + event.dir * sim.rng.range(0.5, 0.8), -1, 1);
      if (event.kind === "accumulate") sim.sentiment.value = clamp(sim.sentiment.value + sim.rng.range(0.3, 0.5), -1, 1);
    }
    if (event.phase === "main" && sim.time >= event.mainEnd) {
      event.phase = "after";
      event.afterStart = sim.time;
    }
    if (event.phase === "after" && sim.time >= event.afterEnd) {
      this.finish();
      return;
    }
    this[event.kind](event);
  }

  begin() {
    const sim = this.sim;
    const rng = sim.rng;
    const kind = rng.pick([["dump", 3], ["squeeze", 2], ["drought", 2], ["accumulate", 2]]);
    const omen = kind === "accumulate" ? rng.int(20, 40) : rng.int(12, 25);
    const main = kind === "drought" ? rng.int(6, 14) : rng.int(5, 10);
    const dir = kind === "dump" ? -1 : kind === "squeeze" || kind === "accumulate" ? 1 : 0;
    this.active = {
      kind, dir, phase: "omen", start: sim.time,
      omenEnd: sim.time + omen * MIN, mainEnd: sim.time + (omen + main) * MIN, afterEnd: sim.time + (omen + main + rng.int(10, 20)) * MIN,
      budget: rng.int(1500, 4000) * 100, // lots the whale pushes at market in the main phase
      hidden: rng.int(300, 900) * 100, // lots it hides in icebergs during the omen
      startPrice: sim.last,
    };
    this.history.push(this.active);
    if (this.history.length > 20) this.history.shift();
  }

  finish() {
    this.clearQuotes();
    this.sim.maker.depthFactor = 1;
    this.active.endPrice = this.sim.last;
    this.active = null;
    this.next = this.sim.time + this.sim.rng.int(120, 300) * MIN;
  }

  // Icebergs one or two ticks off the touch on one side, refilled as they are taken, until the
  // hidden budget is spent.
  absorb(event, side) {
    const sim = this.sim;
    const book = sim.book;
    this.quotes = this.quotes.filter((id) => book.orders.has(id));
    if (this.quotes.length || event.hidden <= 0) return;
    const touch = side === "sell" ? book.bestAsk() : book.bestBid();
    if (touch == null) return;
    const price = roundPrice(side === "sell" ? touch : touch);
    const lots = Math.min(event.hidden, sim.rng.int(80, 200) * 100);
    event.hidden -= lots;
    const arrival = book.submit(side, price, lots, { owner: "whale", acct: "whale", iceberg: { display: sim.rng.int(2, 5) * 100 } });
    if (arrival.resting) this.quotes.push(arrival.id);
  }

  // Market chunks every few seconds until the budget is gone.
  push(event, side) {
    const sim = this.sim;
    if (event.budget <= 0 || sim.time % sim.rng.int(2, 4) !== 0) return;
    const lots = Math.min(event.budget, sim.rng.int(30, 120) * 100);
    event.budget -= lots;
    const bound = roundPrice(sim.last * (side === "buy" ? 1.01 : 0.99));
    const arrival = sim.book.submit(side, bound, lots, { owner: "whale", acct: "whale", rest: false });
    event.budget += lots - arrival.matched;
  }

  dump(event) {
    if (event.phase === "omen") this.absorb(event, "sell");
    else if (event.phase === "main") this.push(event, "sell");
  }

  squeeze(event) {
    if (event.phase === "omen") this.absorb(event, "buy");
    else if (event.phase === "main") this.push(event, "buy");
  }

  accumulate(event) {
    if (event.phase === "omen") this.absorb(event, "buy");
    else if (event.phase === "main") {
      event.budget = Math.min(event.budget, 150000);
      this.push(event, "buy");
    }
  }

  // The maker pulls its near quotes back gradually in the omen, nearly all of them in the main
  // phase, and restores them in the aftermath.
  drought(event) {
    const sim = this.sim;
    const maker = sim.maker;
    if (event.phase === "omen") {
      const t = (sim.time - event.start) / (event.omenEnd - event.start);
      maker.depthFactor = 1 - 0.4 * t;
    } else if (event.phase === "main") maker.depthFactor = 0.3;
    else maker.depthFactor = 0.3 + 0.7 * (sim.time - event.afterStart) / (event.afterEnd - event.afterStart);
  }

  // Between events the whale works its position back to flat with small limit orders at the touch.
  unwind() {
    const sim = this.sim;
    const position = this.whale.position;
    if (!position || sim.time % 5 !== 0) return;
    const side = position > 0 ? "sell" : "buy";
    const touch = side === "sell" ? sim.book.bestBid() : sim.book.bestAsk();
    if (touch == null) return;
    const lots = Math.min(Math.abs(position), sim.rng.int(3, 10) * 100);
    sim.book.submit(side, touch, lots, { owner: "whale", acct: "whale", rest: false });
  }

  clearQuotes() {
    for (const id of this.quotes) this.sim.book.cancel(id);
    this.quotes = [];
  }

  // What the reveal shows.
  describe() {
    const event = this.active;
    if (!event) return null;
    const kind = EVENT_KINDS[event.kind];
    return { kind: event.kind, name: kind.name, phase: event.phase, text: event.phase === "omen" ? kind.omen : kind.main };
  }
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
