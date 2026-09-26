import { MarketWorld } from "./exchange-market.js";

export const SESSION_VERSION = 3;
export const HISTORY_TICKS = 20 * 60 * 4;
export const SNAPSHOT_EVERY = 120;

export class ExchangeSession {
  constructor(seed = 78432) {
    this.world = new MarketWorld(seed);
    this.commands = [];
    this.branch = 1;
    this.head = 0;
    this.origin = this.world.exchange.lastPrice;
    this.initialEquity =
      this.world.exchange.accounts.player.cash +
      this.world.exchange.accounts.player.base * this.origin;
    this.snapshots = [
      { tick: 0, state: this.world.snapshot(true), commandIndex: 0 },
    ];
  }

  get earliest() {
    return this.snapshots[0].tick;
  }
  get inPast() {
    return this.world.tick < this.head;
  }

  applyRecorded(tick) {
    for (const entry of this.commands)
      if (entry.tick === tick) this.world.command(entry.command);
  }

  advance(ticks = 1) {
    if (!Number.isInteger(ticks) || ticks < 0 || ticks > 4000)
      throw Error("Invalid tick count");
    for (let i = 0; i < ticks; i++) {
      this.world.step();
      if (this.world.tick <= this.head) this.applyRecorded(this.world.tick);
      else {
        this.head = this.world.tick;
        if (this.head % SNAPSHOT_EVERY === 0)
          this.snapshots.push({
            tick: this.head,
            state: this.world.snapshot(true),
            commandIndex: this.commands.length,
          });
        while (
          this.snapshots.length > 1 &&
          this.snapshots[1].tick <= this.head - HISTORY_TICKS
        )
          this.snapshots.shift();
      }
    }
  }

  seek(target) {
    target = Math.max(this.earliest, Math.min(this.head, Math.floor(target)));
    const checkpoint = this.snapshots.findLast((s) => s.tick <= target);
    this.world.restore(checkpoint.state);
    let index = checkpoint.commandIndex;
    while (
      index < this.commands.length &&
      this.commands[index].tick === this.world.tick
    )
      this.world.command(this.commands[index++].command);
    while (this.world.tick < target) {
      this.world.step();
      while (
        index < this.commands.length &&
        this.commands[index].tick === this.world.tick
      )
        this.world.command(this.commands[index++].command);
    }
  }

  fork() {
    if (!this.inPast) return false;
    this.head = this.world.tick;
    this.commands = this.commands.filter((e) => e.tick <= this.head);
    this.snapshots = this.snapshots.filter((s) => s.tick <= this.head);
    this.branch++;
    return true;
  }

  execute(command) {
    // Rejected orders never destroy a future timeline.
    if (!command.action) {
      const error = this.world.exchange.validate("player", command);
      if (error) return { ok: false, error };
    } else if (
      command.action === "cancel" &&
      !this.world.exchange.orders.some(
        (o) => o.owner === "player" && o.id === command.id,
      )
    ) {
      return { ok: false, error: "此委託已不在簿上" };
    }
    const branched = this.fork();
    const result = this.world.command(command);
    if (result.ok)
      this.commands.push({
        tick: this.world.tick,
        command: structuredClone(command),
      });
    return { ...result, branched };
  }

  serialize() {
    // One oldest checkpoint + commands is sufficient; intermediate checkpoints are a runtime cache.
    return JSON.stringify({
      version: SESSION_VERSION,
      seed: this.world.seed,
      branch: this.branch,
      head: this.head,
      cursor: this.world.tick,
      origin: this.origin,
      initialEquity: this.initialEquity,
      checkpoint: this.snapshots[0],
      commands: this.commands,
    });
  }

  static load(raw) {
    const data = JSON.parse(raw);
    if (
      ![2, SESSION_VERSION].includes(data.version) ||
      !Number.isSafeInteger(data.head) ||
      data.head < 0 ||
      !Number.isSafeInteger(data.cursor) ||
      data.cursor < 0 ||
      data.cursor > data.head ||
      !data.checkpoint?.state ||
      !Array.isArray(data.commands) ||
      data.commands.length > 100000 ||
      data.head - data.checkpoint.tick > HISTORY_TICKS + SNAPSHOT_EVERY
    )
      throw Error("Invalid save");
    const session = new ExchangeSession(data.seed);
    session.commands = data.commands;
    session.branch = data.branch;
    session.head = data.head;
    session.origin = data.origin;
    session.initialEquity = data.initialEquity;
    session.snapshots = [data.checkpoint];
    session.seek(data.cursor);
    return session;
  }
}
