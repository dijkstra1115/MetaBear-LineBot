// Key-level alert subscriptions (docs/ORDERFLOW-ALERT-SUBSCRIPTION.md), shared by the lab's 通知
// menu and the /alerts/ page. Anyone with a page open picks event types and gets a system
// notification while the tab is in the background, and a toast while it is in front or where the
// browser has no notifications (LINE's in-app browser, iPhone Safari outside the home screen).
// Members can take the same choice to LINE with a prefilled keyword. The events are the
// collector's own record (GET /api/orderflow/btcusdt/events), the ones the chart draws and LINE
// alerts send, so only events within 0.1 % of a key level ever arrive here.
//
// Nothing here runs at import, so tests load the module without a DOM.

/**
 * Event types a viewer can choose. `kinds` groups the collector kinds one choice covers, `hint` is
 * the one-line checklist text, `about` the longer card text and `lesson` the academy lesson id.
 */
export const NOTIFY_KINDS = [
  {
    id: "absorption",
    name: "吸收",
    group: "bar",
    lesson: "absorption-story",
    hint: "大量主動單推出新高或新低，卻收回 K 棒另一半",
    about: "5 分 K 推出近一小時的新高或新低，那一邊的主動成交異常大，收盤卻回到 K 棒的另一半：大量主動單被另一邊接住了。",
  },
  {
    id: "sweep",
    name: "掃蕩收回",
    group: "bar",
    lesson: "failed-auction",
    hint: "刺穿關鍵位後收回",
    about: "價格刺穿關鍵位，沒有站穩，當根或下一根 5 分 K 就收回關鍵位的另一邊。",
  },
  {
    id: "divergence",
    name: "CVD 背離",
    group: "bar",
    lesson: "delta-concept",
    hint: "價格創新高或新低，CVD 沒有跟上",
    about: "價格創下近兩小時的新高或新低，累積主動買賣差（CVD）卻沒有跟著創新高或新低。",
  },
  {
    id: "stackedRetest",
    name: "不平衡區回測",
    group: "bar",
    lesson: "imbalance",
    hint: "第一次回到堆疊不平衡區並守住",
    about: "某根 K 棒裡連續三層以上同方向的失衡，形成堆疊區；價格第一次回到這裡，收盤守住。",
  },
  {
    id: "breakout",
    name: "放量突破",
    group: "bar",
    lesson: "breakout-volume",
    hint: "放量收在近期區間之外",
    about: "成交量明顯放大，收盤站到近兩小時的區間之外，主動買賣差也站在同一邊。",
  },
  { id: "print", name: "大單", group: "live", lesson: "footprint", hint: "單筆主動大單", about: "一張主動單在同一瞬間吃掉大量掛單，成交量遠大於平常的單筆。" },
  { id: "liq", name: "連環爆倉", group: "live", lesson: "liquidation", hint: "短時間內同方向大量爆倉", about: "同一方向的強制平倉在一分鐘內大量出現。" },
  {
    id: "oi",
    name: "OI 急變",
    group: "live",
    lesson: "open-interest",
    hint: "5 分鐘未平倉量異常變化",
    about: "5 分鐘內未平倉量的變化遠超過過去一天的常態，再依價格方向判讀成新倉進場或平倉。",
  },
  {
    id: "wall",
    name: "掛單牆",
    group: "live",
    kinds: ["wall", "wall_eaten", "wall_pulled"],
    lesson: "btc-wall",
    hint: "大掛單出現、被吃掉或撤單",
    about: "某個 $10 價位帶出現大量掛單並掛了一陣子；之後被成交吃掉，或在價格碰到之前撤單，也會提醒。",
  },
  { id: "spoof", name: "疑似誘單", group: "live", lesson: "heatmap", hint: "價格接近時大掛單瞬間撤掉", about: "價格靠近時，一道大掛單在一秒內撤掉，期間幾乎沒有成交。" },
  {
    id: "iceberg",
    name: "冰山",
    group: "live",
    lesson: "absorption-story",
    hint: "成交量遠大於顯示的掛單，價位一直補單",
    about: "同一價格的成交量遠大於掛單簿上顯示過的量，掛單一直被補上。",
  },
];
const CHOICE_OF = new Map(NOTIFY_KINDS.flatMap((k) => (k.kinds ?? [k.id]).map((kind) => [kind, k.id])));
const IDS = NOTIFY_KINDS.map((k) => k.id);
const PREFS_KEY = "metabear-orderflow-notify";
const TITLE = "MetaBear 關鍵位事件";
const DISCLAIMER = "盤面事件，不是買賣建議。";
const TOAST_MS = 20_000;
const TOASTS_MAX = 3;
// One registration for every page: a worker can serve notifications for pages outside its scope.
const SW_URL = "/lab/orderflow/notify-sw.js";
const SW_SCOPE = "/lab/orderflow/";

// LINE: the bot reads the keyword (docs/ORDERFLOW-ALERT-SUBSCRIPTION.md, 關鍵字格式方案 A; parsed back
// by parseLineKeyword in src/bot.ts). LINE_READY false shows only the requirements, as a stop switch.
export const LINE_READY = true;
export const LINE_BASIC_ID = "@804bmpkh";
export const LINE_DAILY_MAX = 3; // the collector's default dailyCap
export const QUIET_CHOICES = [
  ["", "不設定"],
  ["00-08", "00:00–08:00"],
  ["23-08", "23:00–08:00"],
  ["22-09", "22:00–09:00"],
];

// Bar events carry their bar's close; a click should open the bar that closed.
const BAR_CHOICES = new Set(NOTIFY_KINDS.filter((k) => k.group === "bar").map((k) => k.id));
const openAt = (e) => (BAR_CHOICES.has(e.kind) ? e.t - 1 : e.t);

export const defaultSettings = () => ({ on: false, kinds: [...IDS], daily: LINE_DAILY_MAX, quiet: "" });

/** Settings from storage, keeping only what is still valid. */
export function readSettings(saved) {
  const out = defaultSettings();
  if (!saved || typeof saved !== "object") return out;
  if (typeof saved.on === "boolean") out.on = saved.on;
  if (Array.isArray(saved.kinds)) out.kinds = IDS.filter((id) => saved.kinds.includes(id));
  if (Number.isInteger(saved.daily) && saved.daily >= 1 && saved.daily <= LINE_DAILY_MAX) out.daily = saved.daily;
  if (QUIET_CHOICES.some(([v]) => v === saved.quiet)) out.quiet = saved.quiet;
  return out;
}

/**
 * The events not seen before that a viewer asked for: switched on, a chosen type, and not a repeat
 * at the same level within the hour (LINE skips those too). Every event is marked seen, so turning
 * notifications on later never replays history.
 */
export function pickFresh(events, seen, settings) {
  const fresh = [];
  for (const e of events) {
    const key = `${e.t}|${e.kind}|${e.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (settings.on && !e.repeat && settings.kinds.includes(CHOICE_OF.get(e.kind))) fresh.push(e);
  }
  return fresh;
}

/** The subscribe keyword: "訂閱警報 吸收,掃蕩收回 每天3則 安靜00-08", or 全部 for every type. */
export function lineKeyword({ kinds, daily, quiet }) {
  const names = kinds.length === IDS.length ? "全部" : NOTIFY_KINDS.filter((k) => kinds.includes(k.id)).map((k) => k.name.replace(/\s+/g, "")).join(",");
  return ["訂閱警報", names, `每天${daily}則`, quiet ? `安靜${quiet}` : ""].filter(Boolean).join(" ");
}

/** The choice id a collector event kind belongs to, or undefined. */
export const choiceOf = (kind) => CHOICE_OF.get(kind);

/** "吸收、掃蕩收回" for a list of choice ids, or 全部. */
export function kindNames(kinds) {
  return kinds.length === IDS.length ? "全部" : NOTIFY_KINDS.filter((k) => kinds.includes(k.id)).map((k) => k.name).join("、");
}

/** Whether a Taiwan hour (0–23) falls in a quiet-hours choice such as "23-08". */
export function inQuiet(quiet, hour) {
  if (!quiet) return false;
  const [from, to] = quiet.split("-").map(Number);
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

/**
 * Reads a subscribe keyword back: { ok: true, settings: { kinds, daily, quiet } } or { ok: false,
 * error }. Lenient about spacing and separators people type by hand; a bare 訂閱警報 means every
 * type at the most messages a day.
 * @param {string} text
 * @returns {{ ok: true, settings: { kinds: string[], daily: number, quiet: string } } | { ok: false, error: string } | null}
 */
export function parseLineKeyword(text) {
  const m = /^訂閱警報(?:\s+([\s\S]*))?$/.exec(String(text).replace(/　/g, " ").trim());
  if (!m) return null;
  const byName = new Map(NOTIFY_KINDS.map((k) => [k.name.replace(/\s+/g, ""), k.id]));
  let kinds = null;
  let daily = LINE_DAILY_MAX;
  let quiet = "";
  for (const token of (m[1] ?? "").split(/\s+/).filter(Boolean)) {
    const perDay = /^每天(\d{1,2})則$/.exec(token);
    const hush = /^安靜(\d{2}-\d{2})$/.exec(token);
    if (perDay) {
      daily = Number(perDay[1]);
      if (daily < 1 || daily > LINE_DAILY_MAX) return { ok: false, error: `每天最多可以選 1 到 ${LINE_DAILY_MAX} 則。` };
    } else if (hush) {
      if (!QUIET_CHOICES.some(([v]) => v && v === hush[1])) return { ok: false, error: `安靜時段可以選 ${QUIET_CHOICES.filter(([v]) => v).map(([v]) => v).join("、")}。` };
      quiet = hush[1];
    } else if (token === "全部") kinds = [...IDS];
    else {
      const ids = token.split(/[,，、]/).filter(Boolean).map((name) => byName.get(name));
      if (!ids.length || ids.some((id) => !id)) return { ok: false, error: "看不懂其中的事件名稱。" };
      kinds = IDS.filter((id) => ids.includes(id) || kinds?.includes(id));
    }
  }
  return { ok: true, settings: { kinds: kinds ?? [...IDS], daily, quiet } };
}

/** Opens the official account's chat with the text typed in; LINE still needs the user to send it. */
export const lineUrl = (text) => `https://line.me/R/oaMessage/${encodeURIComponent(LINE_BASIC_ID)}/?${encodeURIComponent(text)}`;

/** What this browser can do: "system", "denied", "line" (in-app browser), "ios-home" or "none". */
export function notifySupport(nav = globalThis.navigator, win = globalThis) {
  const ua = nav?.userAgent ?? "";
  if (/\bLine\//i.test(ua)) return "line";
  if (!("Notification" in win)) return /iPhone|iPad|iPod/.test(ua) ? "ios-home" : "none";
  return win.Notification.permission === "denied" ? "denied" : "system";
}

/**
 * Per event type over the feed: how many in the last `days` days and the newest one. `avg` is per
 * day, or null while the feed covers less than `minDays` (too short to say how often).
 */
export function kindStats(events, now, days = 7, minDays = 3) {
  const from = now - days * 86_400_000;
  const first = events.length ? events[0].t : now;
  const span = Math.min(days, (now - first) / 86_400_000);
  const out = Object.fromEntries(IDS.map((id) => [id, { count: 0, avg: null, last: null }]));
  for (const e of events) {
    const s = out[CHOICE_OF.get(e.kind)];
    if (!s) continue;
    if (e.t >= from) s.count++;
    if (!s.last || e.t > s.last.t) s.last = e;
  }
  if (span >= minDays) for (const s of Object.values(out)) s.avg = s.count / span;
  return out;
}

const NOTES = {
  line: "LINE 內建瀏覽器不支援系統通知，只會在頁面上顯示提示。請點右上角，改用 Safari 或 Chrome 開啟本頁。",
  "ios-home": "iPhone 要先在 Safari 按「分享 → 加入主畫面」，從主畫面打開才收得到系統通知；現在只會在頁面上顯示提示。",
  none: "這個瀏覽器不支援系統通知，只會在頁面上顯示提示。",
  denied: "瀏覽器封鎖了這個網站的通知，只會在頁面上顯示提示。要收系統通知，請到瀏覽器的網站設定允許通知。",
  off: "開啟後，分頁在背景時會跳出系統通知，在前景時顯示在畫面上。網頁要開著才收得到。",
  on: "已開啟。分頁在背景時會跳出系統通知，在前景時顯示在畫面上。網頁要開著才收得到。",
};
const LINE_TERMS = "需要綁定 BingX 邀請碼，並在 60 日內累計入金 200 USDT（內部轉帳不算）；已加入 VIP 群的會員可以直接開通。關掉網頁也收得到。";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export class Notifier {
  /** @param {{ toasts: HTMLElement, onOpen: (t: number) => void, onReplay?: (e: object) => void }} opts */
  constructor({ toasts, onOpen, onReplay = null }) {
    this.toasts = toasts;
    this.onOpen = onOpen;
    this.onReplay = onReplay;
    this.seen = new Set();
    this.primed = false;
    this.settings = defaultSettings();
    try {
      this.settings = readSettings(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null"));
    } catch {
      // Private windows and blocked storage start from the defaults.
    }
    // A click on a notification shown by the service worker comes back as a message.
    navigator.serviceWorker?.addEventListener("message", (e) => {
      if (e.data?.type === "orderflow-event") this.onOpen(Number(e.data.at));
    });
    if (this.settings.on && notifySupport() === "system" && Notification.permission === "granted") this.registerWorker();
  }

  get on() {
    return this.settings.on;
  }

  save() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.settings));
    } catch {}
  }

  // Android Chrome shows page notifications only through a service worker; it caches nothing.
  async registerWorker() {
    try {
      return await navigator.serviceWorker?.register(SW_URL, { scope: SW_SCOPE });
    } catch {
      return null;
    }
  }

  async setOn(on) {
    this.settings.on = on;
    this.save();
    if (on && notifySupport() === "system" && Notification.permission === "default") await Notification.requestPermission().catch(() => {});
    if (on && notifySupport() === "system" && Notification.permission === "granted") await this.registerWorker();
  }

  setKind(id, chosen) {
    const kinds = new Set(this.settings.kinds);
    if (chosen) kinds.add(id);
    else kinds.delete(id);
    this.settings.kinds = IDS.filter((x) => kinds.has(x));
    this.save();
  }

  note() {
    const support = notifySupport();
    if (support !== "system") return NOTES[support];
    if (this.on && Notification.permission !== "granted") return NOTES.denied;
    return this.on ? NOTES.on : NOTES.off;
  }

  /** Feeds the latest events; the first call only learns what has already happened. */
  ingest(events) {
    const fresh = pickFresh(events, this.seen, this.primed ? this.settings : { ...this.settings, on: false });
    this.primed = true;
    if (fresh.length) this.deliver(fresh);
  }

  deliver(list) {
    const front = document.visibilityState === "visible";
    const system = notifySupport() === "system" && Notification.permission === "granted";
    if (front || !system) this.toast(list);
    else this.system(list);
  }

  async system(list) {
    const last = list.at(-1);
    const body = list.length === 1 ? `${last.text}\n${DISCLAIMER}` : `${list.length} 則：\n${list.slice(-3).map((e) => e.text).join("\n")}\n${DISCLAIMER}`;
    const options = { body, tag: "metabear-orderflow", icon: "/metabear-logo-transparent-64.png", data: { at: openAt(last) } };
    try {
      const reg = await navigator.serviceWorker?.getRegistration(SW_SCOPE);
      if (reg) return await reg.showNotification(TITLE, options);
      const n = new Notification(TITLE, options);
      n.onclick = () => {
        window.focus();
        this.onOpen(openAt(last));
        n.close();
      };
    } catch {
      this.toast(list);
    }
  }

  toast(list) {
    for (const e of list) {
      const item = el("div", "toast");
      item.setAttribute("role", "status");
      const actions = el("div", "toast-actions");
      // The lab replays the story this event belongs to (event-replay.js).
      if (this.onReplay) {
        const replay = el("button", "toast-replay", "▶ 覆盤");
        replay.type = "button";
        replay.addEventListener("click", () => {
          this.onReplay(e);
          item.remove();
        });
        actions.append(replay);
      }
      const look = el("button", "", "看圖");
      look.type = "button";
      look.addEventListener("click", () => {
        this.onOpen(openAt(e));
        item.remove();
      });
      const close = el("button", "", "關閉");
      close.type = "button";
      close.addEventListener("click", () => item.remove());
      actions.append(look, close);
      item.append(el("p", "", e.text), el("small", "", DISCLAIMER), actions);
      this.toasts.prepend(item);
      setTimeout(() => item.remove(), TOAST_MS);
    }
    while (this.toasts.children.length > TOASTS_MAX) this.toasts.lastElementChild.remove();
  }

  /**
   * Builds the subscription panel into `root`: the web switch and its note, the event types, and
   * LINE, either in full (`line: "full"`, the /alerts/ page) or as a link there (`line: "link"`).
   */
  mount(root, { onChange = () => {}, line = "link" } = {}) {
    const switchBtn = el("button", "notify-switch");
    switchBtn.type = "button";
    const note = el("p", "notify-note");
    const lineParts = { keyword: null, button: null };
    const kindBoxes = new Map();
    const refresh = () => {
      switchBtn.setAttribute("aria-pressed", String(this.on));
      switchBtn.textContent = this.on ? "關閉網頁通知" : "開啟網頁通知";
      note.textContent = this.note();
      root.closest("details")?.setAttribute("data-on", String(this.on));
      if (lineParts.keyword) {
        const text = lineKeyword(this.settings);
        lineParts.keyword.textContent = text;
        const none = this.settings.kinds.length === 0;
        lineParts.button.textContent = none ? "請至少選一種事件" : "透過 LINE 接收通知";
        lineParts.button.setAttribute("aria-disabled", String(none));
        if (none) lineParts.button.removeAttribute("href");
        else lineParts.button.href = lineUrl(text);
      }
    };
    switchBtn.addEventListener("click", async () => {
      await this.setOn(!this.on);
      refresh();
      onChange();
    });
    root.append(switchBtn, note);
    for (const [group, legend] of [
      ["bar", "K 棒事件（5 分 K 收盤）"],
      ["live", "即時事件"],
    ]) {
      const set = el("fieldset");
      set.append(el("legend", "", legend));
      for (const k of NOTIFY_KINDS.filter((x) => x.group === group)) {
        const label = el("label", "check");
        const box = el("input");
        box.type = "checkbox";
        box.checked = this.settings.kinds.includes(k.id);
        kindBoxes.set(k.id, box);
        box.addEventListener("change", () => {
          this.setKind(k.id, box.checked);
          refresh();
          onChange();
        });
        label.append(box, el("span", "", k.name), el("small", "", k.hint));
        set.append(label);
      }
      root.append(set);
    }
    root.append(el("p", "notify-foot", `只通知發生在關鍵位（前日高低、POC、VAH、VAL、VWAP、堆疊區，0.1% 以內）的事件，同一關鍵位一小時內不重複。${DISCLAIMER}`));

    const box = el("section", "notify-line");
    box.append(el("h3", "", "LINE 通知（會員）"), el("p", "", LINE_TERMS));
    if (line === "link") {
      const a = el("a", "notify-line-link", "設定 LINE 通知 →");
      a.href = "/alerts/#line";
      box.append(a);
    } else if (!LINE_READY) {
      const soon = el("button", "notify-line-button", "LINE 通知即將開放");
      soon.type = "button";
      soon.disabled = true;
      box.append(soon);
    } else {
      const daily = el("select");
      for (let n = 1; n <= LINE_DAILY_MAX; n++) daily.append(new Option(`${n} 則`, String(n), false, n === this.settings.daily));
      daily.addEventListener("change", () => {
        this.settings.daily = Number(daily.value);
        this.save();
        refresh();
      });
      const quiet = el("select");
      for (const [value, label] of QUIET_CHOICES) quiet.append(new Option(label, value, false, value === this.settings.quiet));
      quiet.addEventListener("change", () => {
        this.settings.quiet = quiet.value;
        this.save();
        refresh();
      });
      const row = (text, input) => {
        const label = el("label", "notify-select", text);
        label.append(input);
        return label;
      };
      lineParts.keyword = el("code", "notify-keyword");
      lineParts.button = el("a", "notify-line-button");
      lineParts.button.target = "_blank";
      lineParts.button.rel = "noopener noreferrer";
      box.append(
        row("每天最多", daily),
        row("安靜時段（台灣時間）", quiet),
        lineParts.keyword,
        lineParts.button,
        el("p", "notify-foot", "按下後會打開 MetaBear 官方 LINE，輸入框已經填好上面這段文字，按「傳送」就完成。勾選的事件和網頁通知相同。"),
      );
    }
    root.append(box);
    refresh();
    // Another control on the page (the lab's narration rail) changed the settings.
    this.syncPanel = () => {
      for (const [id, input] of kindBoxes) input.checked = this.settings.kinds.includes(id);
      refresh();
    };
  }
}
