// 盤面旁白: turns the collector's key-level events into a short plain-language feed. Pure
// functions only, so the copy is testable; every number comes from an event or the chart, and the
// text describes what happened without saying what to do (docs/VISION.md, principle 4).
import { NOTIFY_KINDS, choiceOf } from "./notify.js";
import { LEVEL_LABELS } from "./keylevels.js";
import { courses } from "../../orderflow/academy-catalog.js";

const KIND = new Map(NOTIFY_KINDS.map((k) => [k.id, k]));
const COURSE = new Map(courses.map((c) => [c.id, c]));
// Repeats of one kind at one level within this long read as one story.
export const MERGE_MS = 90 * 60_000;
const MERGE_PCT = 0.002;

// What each kind of event looks like, as a phrase after the level ("VWAP 81,612：反覆掃過又收回").
const PHRASE = {
  sweep: (n) => (n > 1 ? "反覆掃過又收回" : "掃過又收回"),
  absorption: () => "大量主動單被接住",
  divergence: (n, side) => (side === "up" ? "價格破前低，CVD 沒有跟著創新低" : "價格破前高，CVD 沒有跟著創新高"),
  stackedRetest: () => "回測不平衡區並守住",
  breakout: () => "放量收在區間之外",
  print: (n) => (n > 1 ? `出現 ${n} 筆大單` : "出現大單"),
  liq: () => "出現連環爆倉",
  oi: () => "未平倉量急變",
  wall: () => "掛單牆有變化",
  spoof: () => "大掛單在價格接近時撤掉",
  iceberg: () => "成交遠大於顯示的掛單",
};

// Filter chips: which notify kinds each one shows.
export const FILTERS = [
  { id: "all", label: "全部", kinds: null },
  { id: "bar", label: "價格行為", kinds: NOTIFY_KINDS.filter((k) => k.group === "bar").map((k) => k.id) },
  { id: "flow", label: "大單爆倉", kinds: ["print", "liq", "oi"] },
  { id: "book", label: "掛單", kinds: ["wall", "spoof", "iceberg"] },
];

const hm = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false });
export const timeOf = (t) => hm.format(t);
// "17:35–18:05", or one time when both fall in the same minute.
const rangeOf = (a, b, sep) => (timeOf(a) === timeOf(b) ? timeOf(b) : `${timeOf(a)}${sep}${timeOf(b)}`);
export const fmt = (p) => Math.round(p).toLocaleString("en-US");
/** One space between Chinese and Latin letters, as the rest of the site writes "在 VWAP 附近 CVD 背離". */
export const spaced = (s) => s.replace(/(\p{Script=Han})([A-Za-z])/gu, "$1 $2").replace(/([A-Za-z0-9])(\p{Script=Han})/gu, "$1 $2");
const levelName = (level) => (level ? (LEVEL_LABELS[level] ?? level) : "");
// The level's own price from the stored line ("…｜前日 POC 81,815（差 $30）"); a wall or a divergence
// sits near the level, not on it.
export function levelPriceOf(e) {
  const m = String(e.text ?? "").split("｜")[1]?.match(/([\d,]+(?:\.\d+)?)（差/);
  const p = m ? Number(m[1].replace(/,/g, "")) : NaN;
  return Number.isFinite(p) ? p : e.price;
}
const whereOf = (g) => (g.level ? `${levelName(g.level)} ${fmt(g.levelPrice)}` : fmt(g.price));

/**
 * Groups events (oldest first, as the API sends them) into stories: one kind at one level, close in
 * price and time. Newest story first.
 */
export function groupEvents(events) {
  const groups = [];
  for (const e of events) {
    const choice = choiceOf(e.kind);
    if (!choice || !Number.isFinite(e.price)) continue;
    const level = e.level ?? null;
    const g = groups.find(
      (x) => x.choice === choice && x.level === level && e.t - x.last <= MERGE_MS && Math.abs(e.price - x.price) <= x.price * MERGE_PCT,
    );
    if (g) {
      g.items.push(e);
      g.last = e.t;
      g.price = e.price;
      g.levelPrice = levelPriceOf(e);
    } else groups.push({ choice, level, price: e.price, levelPrice: levelPriceOf(e), first: e.t, last: e.t, items: [e] });
  }
  return groups.sort((a, b) => b.last - a.last);
}

/** The detail of one event from its stored line, without the icon, the kind name, the time or the level note. */
export function detailOf(e) {
  let s = String(e.text ?? "").split("｜")[0];
  s = s.replace(/^\S+\s+/, "");
  s = s.replace(/（[^（）]*）\s*$/, "");
  s = s.replace(/^[^：]{1,8}：/, "");
  // Live events name their kind without a colon ("大單 主動買 …"); the card's badge already does.
  s = s.replace(/^(大單|連環爆倉|疑似誘單|冰山)\s+/, "");
  s = s.replace(/(\d{5,})(\.\d+)?/g, (m) => fmt(Number(m)));
  s = spaced(s);
  return s.trim();
}

/** Copy for one story card. */
export function cardOf(g) {
  const k = KIND.get(g.choice);
  const n = g.items.length;
  const where = whereOf(g);
  const phrase = (PHRASE[g.choice] ?? (() => k.name))(n, g.items.at(-1).side);
  const course = COURSE.get(k.lesson);
  return {
    choice: g.choice,
    badge: n > 1 ? `${k.name} ×${n}` : k.name,
    time: rangeOf(g.first, g.last, "–"),
    title: g.level ? `${where}：${phrase}` : `${phrase} · ${where}`,
    lines: g.items
      .slice(-4)
      .reverse()
      .map((e) => ({ t: e.t, time: timeOf(e.t), text: detailOf(e) })),
    plain: k.about,
    lesson: course?.href ? { id: course.id, title: course.title, href: `/orderflow/${course.href.replace(/^\.\//, "").replace(/\.html$/, "")}`, duration: course.duration } : null,
    at: g.last,
  };
}

/**
 * The 「現在」 card: where price sits against VWAP and the nearest prior-day level, then the latest
 * story of the last hour. levels: [{ name, price }] with display names.
 */
export function nowOf({ price, vwap, levels = [], groups = [], t }) {
  if (!Number.isFinite(price)) return null;
  const parts = [`價格 ${fmt(price)}`];
  if (Number.isFinite(vwap)) parts.push(`在 VWAP ${fmt(vwap)} ${price >= vwap ? "上方" : "下方"} $${fmt(Math.abs(price - vwap))}`);
  const near = levels
    .filter((L) => Number.isFinite(L.price) && Math.abs(L.price - price) >= 1)
    .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))[0];
  if (near) parts.push(`離${near.name} ${fmt(near.price)} 還差 $${fmt(Math.abs(near.price - price))}`);
  const head = spaced(parts.join("，") + "。");
  const recent = groups.find((g) => t - g.last <= 60 * 60_000);
  let sub = "最近一小時，關鍵位附近沒有新事件。";
  if (recent) {
    const k = KIND.get(recent.choice);
    const where = whereOf(recent);
    const n = recent.items.length;
    sub = spaced(n > 1 ? `${rangeOf(recent.first, recent.last, " 到 ")}，在${where}附近${k.name} ${n} 次。` : `${timeOf(recent.last)}，${where}附近出現${k.name}。`);
  }
  return { time: timeOf(t), head, sub };
}

export function filterGroups(groups, filterId) {
  const f = FILTERS.find((x) => x.id === filterId);
  return !f?.kinds ? groups : groups.filter((g) => f.kinds.includes(g.choice));
}
