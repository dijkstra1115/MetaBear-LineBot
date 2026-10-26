// 盤面旁白 in paragraphs: stories (narrate.js groupEvents) that happen close together at about
// the same price become one chapter told as one sentence, in time order. Every clause comes from
// fixed phrases and the numbers in the collector's own event lines; nothing judges what comes next.
import { ALL_KINDS, choiceOf } from "./notify.js";
import { LEVEL_LABELS } from "./keylevels.js";
import { courses } from "../../orderflow/academy-catalog.js";
import { detailOf, fmt, rangeOf, spaced, timeOf } from "./narrate.js";

const MINUTE = 60_000;
export const GAP_MS = 20 * MINUTE; // a pause longer than this starts a new chapter
export const SPAN_MS = 60 * MINUTE; // a chapter covers at most an hour…
export const NEAR_PCT = 0.002; // …at prices within 0.2 % of its first story's level
// Things a few minutes apart belong together even across neighbouring levels (a cascade of
// liquidations, then open interest falling).
const QUICK_MS = 5 * MINUTE;
const QUICK_PCT = 0.005;
const KIND = new Map(ALL_KINDS.map((k) => [k.id, k]));
const COURSE = new Map(courses.map((c) => [c.id, c]));
const near = (a, b, pct) => Math.abs(a - b) / b <= pct;
const isLong = (s) => s.last - s.first > SPAN_MS;

/** Stories (oldest first or any order) → chapters, newest first. */
export function chaptersOf(stories) {
  const sorted = [...stories].sort((a, b) => a.first - b.first);
  const chapters = [];
  for (const s of sorted) {
    const long = isLong(s);
    const c = long
      ? null
      : [...chapters].reverse().find((c) => {
          if (c.long || s.first - c.last > GAP_MS || Math.max(c.last, s.last) - c.first > SPAN_MS) return false;
          return near(s.levelPrice, c.anchor, NEAR_PCT) || (s.first - c.last <= QUICK_MS && near(s.levelPrice, c.anchor, QUICK_PCT));
        });
    if (c) {
      c.stories.push(s);
      c.last = Math.max(c.last, s.last);
    } else chapters.push({ first: s.first, last: s.last, anchor: s.levelPrice, level: s.level, long, stories: [s] });
  }
  // Short chapters inside a long repeated story at the same level fold into it.
  const longs = chapters.filter((c) => c.long);
  const out = [];
  for (const c of chapters) {
    const host = !c.long && longs.find((l) => c.first >= l.first && c.last <= l.last && near(c.anchor, l.anchor, NEAR_PCT));
    if (host) host.stories.push(...c.stories);
    else out.push(c);
  }
  for (const c of out) {
    // One entry per kind, in order of first appearance; the host of a long chapter stays first.
    const byKind = new Map();
    for (const s of c.stories) {
      const m = byKind.get(s.choice);
      if (m) {
        m.items.push(...s.items);
        m.first = Math.min(m.first, s.first);
        m.last = Math.max(m.last, s.last);
      } else byKind.set(s.choice, { ...s, items: [...s.items] });
    }
    for (const m of byKind.values()) m.items.sort((a, b) => a.t - b.t);
    const [host, ...rest] = [...byKind.values()];
    c.parts = c.long ? [host, ...rest.sort((a, b) => a.first - b.first)] : [host, ...rest].sort((a, b) => a.first - b.first);
    c.items = c.parts.flatMap((p) => p.items).sort((a, b) => a.t - b.t);
    c.first = c.items[0].t;
    c.last = c.items.at(-1).t;
  }
  return out.sort((a, b) => b.last - a.last);
}

const qtyOf = (e) => Number(String(e.text).match(/([\d.]+) BTC/)?.[1]);
const sideName = (side) => (side === "buy" ? "主動買" : "主動賣");

// One clause per kind in a chapter. short: the noun form used after 「期間另有」.
function clauseOf(p, { short = false } = {}) {
  const n = p.items.length;
  const last = p.items.at(-1);
  const d = detailOf(last);
  const times = (s) => (n > 1 ? `${n} 次${s}` : s);
  switch (p.choice) {
    case "sweep": {
      const dirs = new Set(p.items.map((e) => e.side));
      const verb = dirs.size > 1 ? "刺穿或跌破" : dirs.has("up") ? "跌破" : "刺穿";
      return n > 1 ? `${n} 次${verb}又收回` : d;
    }
    case "print": {
      const buys = p.items.filter((e) => e.side === "buy").length;
      const one = buys === 0 || buys === n ? sideName(p.items[0].side) : "";
      const qtys = p.items.map(qtyOf).filter(Number.isFinite);
      const detail = one && n <= 3 && qtys.length === n ? `（${qtys.map((q) => fmt(q)).join("、")} BTC）` : one ? "" : `（${buys} 筆主動買、${n - buys} 筆主動賣）`;
      const noun = `${n > 1 ? `${n} 筆` : "一筆"}${one}大單${detail}`;
      return short ? noun : `出現${noun}`;
    }
    case "cross": {
      if (n > 1) return `${n} 次多家交易所同時出現大單`;
      return short ? "多家交易所同時大單" : d;
    }
    case "liq": {
      const m = String(last.text).match(/(多單|空單) (\$[\d.]+[MK]?)，(\d+) 筆/);
      const s = m ? `${m[1]}連環爆倉 ${m[2]}（${m[3]} 筆）` : "連環爆倉";
      return n > 1 ? `${n} 次${s}` : s;
    }
    case "oi": {
      const pct = Number(String(last.text).match(/OI 5 分鐘 ([+-]?[\d.]+)%/)?.[1]);
      const s = Number.isFinite(pct) ? `未平倉量 5 分鐘${pct < 0 ? "減少" : "增加"} ${Math.abs(pct).toFixed(2)}%` : "未平倉量急變";
      return n > 1 ? `${n} 次未平倉量急變` : s;
    }
    case "divergence":
      if (short) return times("CVD 背離");
      return times(last.side === "up" ? "價格破前低、CVD 沒有跟著創新低" : "價格破前高、CVD 沒有跟著創新高");
    case "absorption": {
      const s = /買方/.test(String(last.text)) ? "大量主動買被接住" : "大量主動賣被接住";
      return n > 1 ? `${n} 次${s}` : short ? s : `出現${s}`;
    }
    case "breakout":
      return times("放量收在區間之外");
    case "wall":
      return n > 1 ? `掛單牆出現或撤掉 ${n} 次` : d;
    default:
      return n > 1 ? `${KIND.get(p.choice)?.name ?? p.choice} ${n} 次` : d;
  }
}

// Alternate the connectors so three or four clauses don't repeat the same word.
const AFTER = ["接著", "然後"];
const ALONG = ["也", "同時"];

/** The chapter's sentence: in time order, 「接著」 when one thing follows another, 「也」 when they overlap. */
export function sentenceOf(c) {
  if (c.long && c.parts.length > 1) {
    const [host, ...rest] = c.parts;
    return spaced(`${clauseOf(host)}；期間另有${rest.map((p) => clauseOf(p, { short: true })).join("、")}。`);
  }
  let text = clauseOf(c.parts[0]);
  let after = 0;
  let along = 0;
  for (let i = 1; i < c.parts.length; i++) {
    const p = c.parts[i];
    const word = p.first > c.parts[i - 1].last ? AFTER[after++ % 2] : ALONG[along++ % 2];
    text += `，${word}${clauseOf(p)}`;
  }
  return spaced(text + "。");
}

// The kind the chapter is mostly about: a long chapter's repeated story, else the most events.
const mainOf = (c) => (c.long ? c.parts[0] : [...c.parts].sort((a, b) => b.items.length - a.items.length)[0]);

/** Copy for one chapter card. */
export function chapterCard(c) {
  const levels = new Set(c.parts.map((p) => p.level));
  const name = c.level ? `${LEVEL_LABELS[c.level] ?? c.level} ${fmt(c.anchor)}` : fmt(c.anchor);
  const course = COURSE.get(KIND.get(mainOf(c).choice)?.lesson);
  return {
    key: `${c.first}|${Math.round(c.anchor)}`,
    time: rangeOf(c.first, c.last, "–"),
    count: c.items.length,
    title: levels.size > 1 ? `${name} 附近` : name,
    text: sentenceOf(c),
    kinds: c.parts.map((p) => ({ choice: p.choice, label: `${KIND.get(p.choice)?.name ?? p.choice}${p.items.length > 1 ? ` ×${p.items.length}` : ""}` })),
    lines: c.items.map((e) => ({ t: e.t, time: timeOf(e.t), choice: choiceOf(e.kind), name: KIND.get(choiceOf(e.kind))?.name ?? e.kind, text: detailOf(e) })),
    abouts: c.parts.map((p) => ({ choice: p.choice, name: KIND.get(p.choice)?.name ?? p.choice, about: KIND.get(p.choice)?.about ?? "" })),
    lesson: course?.href ? { id: course.id, title: course.title, href: `/orderflow/${course.href.replace(/^\.\//, "").replace(/\.html$/, "")}`, duration: course.duration } : null,
    choices: c.parts.map((p) => p.choice),
  };
}

/** A chapter as one story for the replay (event-replay.js), with the card's title and lesson. */
export function chapterStory(c) {
  const { title, lesson } = chapterCard(c);
  return { choice: mainOf(c).choice, level: c.level, price: c.anchor, levelPrice: c.anchor, first: c.first, last: c.last, items: c.items, card: { title, lesson } };
}

/** The chapter holding the event at t of that kind. */
export function findChapter(chapters, { t, kind }) {
  return chapters.find((c) => c.items.some((e) => e.t === t && (!kind || e.kind === kind))) ?? null;
}
