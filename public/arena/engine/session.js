// Semi-turn play: the market runs in five-minute turns and stops for planning at the end of each turn
// (unless turn pauses are off), or early when something worth a decision happens (a tactical pause).
export const TURN_SECONDS = 300;
export const ALERT_KINDS = {
  bigFlow: "大單偵測",
  cascade: "連環強平",
  own: "你的委託",
  move: "價格急動",
  event: "突發事件",
};
// Your own order events worth a pause; a push you just sent is not one of them, and neither is each
// partial fill of a resting order: only the fill that completes it ("filled").
const OWN_ALERTS = new Set(["filled", "trigger", "stop", "take", "liquidation", "danger", "rejected"]);
const FLOW_WINDOW = 10;
const BIG_FLOW_MIN = 10000; // 100 BTC in ten seconds
const BIG_FLOW_MULTIPLE = 6;
const MOVE_ALERT = 0.008;
const CASCADE_MIN = 5000; // 50 BTC: a stray small liquidation is not worth a pause
const DANGER = 0.01;

export class Session {
  constructor(sim, { turnSeconds = TURN_SECONDS } = {}) {
    this.sim = sim;
    this.turnSeconds = turnSeconds;
    this.turn = 1;
    this.turnStart = sim.time;
    this.turnStartPrice = sim.last;
    this.phase = "plan";
    this.alerts = { turn: true, bigFlow: true, cascade: true, own: true, move: true, event: true };
    // The end of this turn stops the market even with turn pauses off: a ranked game ends there.
    this.finalTurn = Infinity;
    this.window = [];
    this.baseline = 2000;
    this.lastBigFlow = -Infinity;
    this.lastWave = -Infinity;
    this.moveAlerted = false;
    this.dangerKey = null;
    this.log = [];
  }

  get turnEnd() {
    return this.turnStart + this.turnSeconds;
  }

  get secondsLeft() {
    return this.turnEnd - this.sim.time;
  }

  // Runs up to `ticks` simulated seconds. Stops at the end of the turn or on the first enabled alert.
  // `turned` counts turns that ended along the way, including one that stopped the run.
  advance(ticks) {
    const sim = this.sim;
    const events = [];
    let turned = 0;
    this.phase = "run";
    for (let i = 0; i < ticks; i++) {
      const stats = sim.tick();
      const own = sim.player?.drainEvents() ?? [];
      events.push(...own);
      const alert = this.detect(stats, own);
      if (sim.time >= this.turnEnd) {
        const final = this.turn >= this.finalTurn;
        this.turn++;
        this.turnStart = sim.time;
        this.turnStartPrice = sim.last;
        this.moveAlerted = false;
        turned++;
        if (this.alerts.turn !== false || final) {
          this.phase = "plan";
          return { ticks: i + 1, stop: "turn", alert, events, turned };
        }
      }
      if (alert) {
        this.phase = "plan";
        this.log.unshift({ time: sim.time, ...alert });
        this.log.length = Math.min(this.log.length, 30);
        return { ticks: i + 1, stop: "alert", alert, events, turned };
      }
    }
    return { ticks, stop: null, alert: null, events, turned };
  }

  detect(stats, own) {
    const sim = this.sim;
    this.window.push({ buy: stats.aggressive.buy, sell: stats.aggressive.sell, price: sim.last, cvd: sim.cvd, oi: sim.oi });
    if (this.window.length > FLOW_WINDOW) this.window.shift();
    let buy = 0;
    let sell = 0;
    for (const row of this.window) {
      buy += row.buy;
      sell += row.sell;
    }
    const heavy = Math.max(buy, sell);
    const threshold = Math.max(BIG_FLOW_MIN, this.baseline * BIG_FLOW_MULTIPLE);
    this.baseline = this.baseline * 0.995 + heavy * 0.005;
    const first = this.window[0];
    const change = { from: first.price, to: sim.last, cvd: sim.cvd - first.cvd, oi: sim.oi - first.oi };
    let alert = null;
    const raise = (kind, data) => {
      if (!alert && this.alerts[kind]) alert = { kind, title: ALERT_KINDS[kind], ...change, ...data };
    };
    if (stats.event) raise("event", { name: stats.event.name, eventKind: stats.event.kind, text: stats.event.text });
    const worth = own.filter((event) => OWN_ALERTS.has(event.kind));
    if (worth.length) raise("own", { events: worth });
    const position = sim.player?.position;
    if (position) {
      const liq = sim.player.liquidationPrice();
      const key = `${position}:${liq}`;
      if (liq && Math.abs(liq / sim.markPrice() - 1) < DANGER && this.dangerKey !== key) {
        this.dangerKey = key;
        raise("own", { events: [{ kind: "danger", price: liq }] });
      }
    }
    if (stats.waves.length) {
      const lots = stats.waves.reduce((sum, wave) => sum + wave.lots, 0);
      if (sim.time - this.lastWave > 30 && lots >= CASCADE_MIN) raise("cascade", { side: stats.waves[0].side, lots, by: stats.waves[0].by });
      this.lastWave = sim.time;
    }
    if (heavy >= threshold && sim.time - this.lastBigFlow > 60) {
      this.lastBigFlow = sim.time;
      raise("bigFlow", { side: buy >= sell ? "buy" : "sell", lots: heavy });
    }
    if (!this.moveAlerted && Math.abs(sim.last / this.turnStartPrice - 1) > MOVE_ALERT) {
      this.moveAlerted = true;
      raise("move", { move: sim.last / this.turnStartPrice - 1 });
    }
    return alert;
  }
}
