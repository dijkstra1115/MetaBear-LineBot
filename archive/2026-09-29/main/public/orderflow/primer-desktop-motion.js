import { sceneElapsedAt, scenePosition } from "./primer-model.js";
import { clamp, ease } from "./revisit-model.js";

export const FILL_FEEDBACK_MS = 1000;
export const ROW_EXIT_MS = 680;
const ramp = (value) => ease(clamp(value));

// A scene owns only NEW executions. A fill on its opening boundary was already
// shown in the preceding scene; seeking or advancing must not fire it again.
export function executionAge(p, at) {
  if (at <= scenePosition(p.scene, 0).time || at > p.time) return Infinity;
  return Math.max(0, p.elapsed - sceneElapsedAt(p.scene, at));
}

export function fillFeedback(state, p) {
  if (p.reduced || p.scene >= 6) return null;
  const trade = state.trades.at(-1);
  if (!trade) return null;
  const age = executionAge(p, trade.at);
  if (age >= FILL_FEEDBACK_MS) return null;
  return {
    trade,
    age,
    impact: 1 - ramp(age / 720),
    glow: 1 - ramp(age / FILL_FEEDBACK_MS),
    ring: ramp(age / 800),
  };
}

// Give the previous execution a short settling beat before the next units move.
// All motion remains on the maker's price level and finishes at the fill boundary.
export function matchingMotion(pair, index = 0, reduced = false) {
  const delay = 0.2 + index * 0.012;
  const progress = clamp((pair.progress - delay) / (1 - delay));
  return {
    travel: reduced ? 0 : ramp(progress),
    departure: reduced ? 0 : ramp(progress / 0.16),
    focus: reduced ? 1 : ramp((pair.progress - 0.1) / 0.18),
  };
}

export function rowExit(age) {
  return ramp((age - 140) / (ROW_EXIT_MS - 140));
}
