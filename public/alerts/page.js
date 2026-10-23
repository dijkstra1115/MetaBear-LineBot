// The /alerts/ page (docs/ORDERFLOW-ALERT-SUBSCRIPTION.md): the shared subscription panel
// (notify.js) with LINE in full, a card per event type with how often it happened at a key level
// lately and a link to the newest one, and toasts while the page is open.
import { NOTIFY_KINDS, Notifier, kindStats } from "/lab/orderflow/notify.js";

const API = "/api/orderflow/btcusdt";
const DAY = 86_400_000;
const $ = (id) => document.getElementById(id);
const labAt = (t) => `/lab/orderflow/?tf=1&at=${t}`;
const when = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

const notifier = new Notifier({ toasts: $("toasts"), onOpen: (t) => location.assign(labAt(t)) });
notifier.mount($("notify-panel"), { line: "full", onChange: () => load() });

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

// One card per type, built once; load() fills in the numbers.
const cards = new Map();
for (const k of NOTIFY_KINDS) {
  const card = el("article", "alerts-card mb-panel mb-spot");
  card.dataset.reveal = "";
  const stat = el("p", "alerts-card-stat", "讀取中…");
  const links = el("div", "alerts-card-links");
  const lesson = el("a", "mb-link", "對應課程 →");
  lesson.href = `/orderflow/${k.lesson}`;
  const last = el("a", "mb-link", "");
  last.hidden = true;
  links.append(lesson, last);
  card.append(el("p", "alerts-card-group", k.group === "bar" ? "K 棒事件 · 5 分 K 收盤" : "即時事件"), el("h3", "", k.name), el("p", "alerts-card-about", k.about), stat, links);
  $("kind-cards").append(card);
  cards.set(k.id, { stat, last });
}

function render(stats) {
  for (const [id, { stat, last }] of cards) {
    const s = stats?.[id];
    if (!s) stat.textContent = "暫時讀不到資料。";
    else if (s.avg == null) stat.textContent = "次數統計中（資料還不到 3 天）。";
    else stat.textContent = s.avg === 0 ? "最近 7 天沒有在關鍵位出現。" : `最近 7 天平均每天約 ${s.avg < 1 ? s.avg.toFixed(1) : Math.round(s.avg)} 次。`;
    last.hidden = !s?.last;
    if (s?.last) {
      last.textContent = `最近一次 ${when.format(s.last.t)} ↗`;
      last.href = labAt(s.last.t);
    }
  }
}

let loadedAt = 0;
async function load() {
  loadedAt = Date.now();
  // Today and the 29 days before it, the most the feed keeps: one shared URL per day.
  const since = Math.floor(Date.now() / DAY) * DAY - 29 * DAY;
  try {
    // Revalidate: Cloudflare stretches the API's short max-age to hours in browsers.
    const res = await fetch(`${API}/events?since=${since}`, { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const { events } = await res.json();
    notifier.ingest(events);
    render(kindStats(events, Date.now()));
  } catch {
    render(null);
  }
}

load();
// Every 15 s while notifications are on, otherwise once a minute for the cards.
setInterval(() => {
  if (notifier.on || Date.now() - loadedAt >= 60_000) load();
}, 15_000);
