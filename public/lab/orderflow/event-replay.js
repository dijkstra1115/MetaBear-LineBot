// 一鍵覆盤: the script for replaying one narration story (narrate.js) bar by bar on 1-minute bars.
// Pure functions of the story and the 1-minute rows [t, o, h, l, c, …]; captions and the closing
// facts only describe what happened, from the event lines and the bars (docs/VISION.md).
import { ALL_KINDS, NOTIFY_KINDS, choiceOf } from "./notify.js";
import { LEVEL_LABELS } from "./keylevels.js";
import { BAR_KINDS } from "./watch.js";
import { detailOf, fmt, levelPriceOf, spaced, timeOf } from "./narrate.js";

const MINUTE = 60_000;
const BAR_MS = 5 * MINUTE; // bar detectors work on 5-minute bars stamped at their close
export const LEAD_MS = 20 * MINUTE; // context before the first event
export const TAIL_MS = 15 * MINUTE; // what came after the last one
export const START_MS = 5 * MINUTE; // bars already drawn when playback starts
// One bar a second, faster for long stories so a replay lasts about a minute and a half at 1×.
export const barsPerSecond = (win) => Math.max(1, Math.round((win.to - win.from) / MINUTE / 90));
const KIND = new Map(ALL_KINDS.map((k) => [k.id, k]));
const kindOf = (e) => KIND.get(choiceOf(e.kind));
const kindsOf = (group) => new Set(group.items.map(kindOf));
const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];
const floorMin = (t) => Math.floor(t / MINUTE) * MINUTE;

/** When each event shows on 1-minute bars: [start, end) of its bar (one minute for live events). */
export function spanOf(e) {
  if (BAR_KINDS.includes(e.kind)) return { start: e.t - BAR_MS, end: e.t };
  const start = floorMin(e.t);
  return { start, end: start + MINUTE };
}

// A story can keep growing all day at one level; a replay covers its latest hour.
export const FOCUS_MS = 60 * MINUTE;
export const FOCUS_MAX = 8;

/** The part of a story a replay plays: its events within an hour of the newest, at most eight. */
export function focusOf(group) {
  const last = group.items.at(-1).t;
  const items = group.items.filter((e) => last - e.t <= FOCUS_MS).slice(-FOCUS_MAX);
  const earlier = group.items.slice(0, group.items.length - items.length);
  return { ...group, items, first: items[0].t, earlier };
}

/** Candle width for a replay: the chart's own, unless the story would not fit in 80% of the plot. */
export const fitBarW = (barW, plotW, minutes) => Math.max(4, Math.min(barW, (plotW * 0.8) / (minutes + 1)));

/** The replay window for a story, never past `now`'s last finished minute. */
export function windowOf(group, now) {
  const spans = group.items.map(spanOf);
  const from = floorMin(spans[0].start - LEAD_MS);
  const to = Math.min(floorMin(spans.at(-1).end + TAIL_MS), floorMin(now));
  return { from, to, spans };
}

const levelName = (g) => (g.level ? (LEVEL_LABELS[g.level] ?? g.level) : "");
const closeAt = (rows, t) => {
  let c = null;
  for (const r of rows) if (r[0] < t) c = r[4];
  return c;
};

/**
 * Captions in time order: { t, kicker, head, sub }; each shows from bar time t until the next.
 * rows: the 1-minute rows inside the window.
 */
export function beatsOf(group, win, rows) {
  const n = group.items.length;
  // A chapter (chapters.js) can mix kinds: then each beat names its own kind.
  const mixed = kindsOf(group).size > 1;
  const k = kindOf(group.items[0]);
  // A moving level such as VWAP: where it stood at the first event, not now.
  const ref = group.level ? levelPriceOf(group.items[0]) : null;
  const where = ref != null ? `${levelName(group)} ${fmt(ref)}` : fmt(group.price);
  const beats = [];
  const start = win.from + START_MS;
  const c0 = closeAt(rows, start) ?? rows[0]?.[1] ?? null;
  let head = `${timeOf(start)}，價格 ${fmt(c0 ?? group.price)}`;
  if (ref != null && c0 != null) head += `，在 ${where} ${c0 >= ref ? "上方" : "下方"} $${fmt(Math.abs(c0 - ref))}`;
  let intro = mixed ? `接下來這一段的 ${n} 件事都標在圖上。` : n > 1 ? `接下來 ${n} 次${k.name}都標在圖上。` : `接下來看${k.name}發生的那一根。`;
  const earlier = group.earlier ?? [];
  if (earlier.length) intro = `今天稍早從 ${timeOf(earlier[0].t)} 起已經出現 ${earlier.length} ${mixed ? "件" : "次"}；${intro}`;
  beats.push({ t: start, kicker: "開始", head: spaced(head + "。"), sub: spaced(intro) });
  group.items.forEach((e, i) => {
    const span = win.spans[i];
    const ek = kindOf(e);
    const same = group.items.slice(0, i).filter((x) => kindOf(x) === ek);
    const before = same.map((x) => timeOf(x.t));
    let sub = ek.hint + "。";
    if (same.length) sub = `前面在 ${before.join("、")} 也出現過${mixed ? ek.name : ""}。`;
    if (!mixed && i === n - 1 && n > 1 && ek.id === "sweep") sub = `前面在 ${before.join("、")}；${n} 次都沒有在 ${levelName(group) || "這個價位"} 的另一邊站穩。`;
    beats.push({
      t: span.end,
      kicker: mixed ? `${CIRCLED[i] ?? i + 1} ${timeOf(e.t)} · ${ek.name}` : n > 1 ? `${CIRCLED[i] ?? i + 1} ${timeOf(e.t)} · 第 ${i + 1} 次` : `${timeOf(e.t)}`,
      head: detailOf(e),
      sub: spaced(sub),
      event: i,
    });
  });
  return beats.filter((b) => b.t <= win.to);
}

/** The caption showing at replay time `cut` (bars before cut are drawn). */
export function beatAt(beats, cut) {
  let at = null;
  for (const b of beats) if (b.t <= cut) at = b;
  return at;
}

/** Closing facts: how many times, the range after the last event, and where it closed. */
export function outroOf(group, win, rows) {
  const mixed = kindsOf(group).size > 1;
  const k = kindOf(group.items[0]);
  const lastEnd = win.spans.at(-1).end;
  const after = rows.filter((r) => r[0] >= lastEnd && r[0] < win.to);
  const close = closeAt(rows, win.to);
  const ref = group.level ? group.levelPrice : null;
  return {
    kicker: `覆盤結束 · ${timeOf(win.from)}–${timeOf(win.to)}`,
    count: mixed
      ? { label: `${levelName(group) ? `${levelName(group)} 附近` : "這一段"}發生的事`, value: `${group.items.length} 件`, times: group.items.map((e) => timeOf(e.t)).join(" · ") }
      : { label: `${levelName(group) ? `在 ${levelName(group)} ` : ""}${k.name}`, value: `${group.items.length} 次`, times: group.items.map((e) => timeOf(e.t)).join(" · ") },
    after: after.length
      ? { label: `${timeOf(group.items.at(-1).t)} 之後 ${Math.round((win.to - lastEnd) / MINUTE)} 分鐘`, high: fmt(Math.max(...after.map((r) => r[2]))), low: fmt(Math.min(...after.map((r) => r[3]))) }
      : null,
    close: close != null ? { label: `${timeOf(win.to)} 收在`, value: fmt(close), vs: ref != null ? `${levelName(group)} ${close >= ref ? "上方" : "下方"} $${fmt(Math.abs(close - ref))}` : "" } : null,
  };
}

/** Share link for a story: its newest event, so the link survives new events at the same level. */
export function replayParams(group) {
  const e = group.items.at(-1);
  return { replay: String(e.t), k: e.kind, ...(e.level ? { lv: e.level } : {}) };
}

/** The story a shared link names: the group holding the event at t of that kind. */
export function findStory(groups, { t, kind }) {
  return groups.find((g) => g.items.some((e) => e.t === t && (!kind || e.kind === kind))) ?? null;
}
