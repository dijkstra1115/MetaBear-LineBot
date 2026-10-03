// A player's copy of a room's market. It moves only on what the room sends — actions in the
// room's order and one tick per second — so it stays identical to the room's own copy.
import { FlowArenaRun } from "./flow-arena-engine.js";
import { performAction, runChecksum } from "./arena-protocol.js";

export class ArenaReplica {
  // start: the room's start (or sync) message; you: this player's seat id.
  constructor(start, you) {
    this.run = new FlowArenaRun(start.seed, { traders: start.traders, you });
    this.desync = null;
    for (const message of start.log ?? []) this.apply(message);
  }

  // Returns the engine's result for actions, so the caller can react to its own echoed orders.
  apply(message) {
    switch (message.type) {
      case "action":
        return performAction(this.run, message.trader, message.op, message.args);
      case "tick":
        if (message.n !== this.run.time + 1) this.desync ??= { at: this.run.time, reason: `tick ${message.n} after ${this.run.time}` };
        this.run.tick();
        return null;
      case "check":
      case "end":
        if (message.hash !== runChecksum(this.run)) this.desync ??= { at: this.run.time, reason: "checksum" };
        return null;
      default:
        return null;
    }
  }
}
