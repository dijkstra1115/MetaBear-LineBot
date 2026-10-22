// Browser notifications for key-level events (docs/ORDERFLOW-ALERT-SUBSCRIPTION.md). Anyone with the
// page open picks event types and gets a system notification while the tab is in the background,
// and a toast on the page while it is in front or where the browser has no notifications (LINE's
// in-app browser, iPhone Safari outside the home screen). The events are the collector's own
// record (GET /api/orderflow/btcusdt/events), the ones the chart draws and LINE alerts send, so
// only events within 0.1 % of a key level ever arrive here.
//
// Nothing here runs at import, so tests load the module without a DOM.

/** Event types a viewer can choose; `kinds` groups the collector kinds one choice covers. */
export const NOTIFY_KINDS = [
  { id: "absorption", name: "吸收", group: "bar", hint: "大量主動單推出新高或新低，卻收回 K 棒另一半" },
  { id: "sweep", name: "掃蕩收回", group: "bar", hint: "刺穿關鍵位後收回" },
  { id: "divergence", name: "CVD 背離", group: "bar", hint: "價格創新高或新低，CVD 沒有跟上" },
  { id: "stackedRetest", name: "不平衡區回測", group: "bar", hint: "第一次回到堆疊不平衡區並守住" },
  { id: "breakout", name: "放量突破", group: "bar", hint: "放量收在近期區間之外" },
  { id: "print", name: "大單", group: "live", hint: "單筆主動大單" },
  { id: "liq", name: "連環爆倉", group: "live", hint: "短時間內同方向大量爆倉" },
  { id: "oi", name: "OI 急變", group: "live", hint: "5 分鐘未平倉量異常變化" },
  { id: "wall", name: "掛單牆", group: "live", kinds: ["wall", "wall_eaten", "wall_pulled"], hint: "大掛單出現、被吃掉或撤單" },
  { id: "spoof", name: "疑似誘單", group: "live", hint: "價格接近時大掛單瞬間撤掉" },
  { id: "iceberg", name: "冰山", group: "live", hint: "成交量遠大於顯示的掛單，價位一直補單" },
];
const CHOICE_OF = new Map(NOTIFY_KINDS.flatMap((k) => (k.kinds ?? [k.id]).map((kind) => [kind, k.id])));
const PREFS_KEY = "metabear-orderflow-notify";
const TITLE = "MetaBear 關鍵位事件";
const DISCLAIMER = "盤面事件，不是買賣建議。";
const TOAST_MS = 20_000;
const TOASTS_MAX = 3;

// Bar events carry their bar's close; a click should open the bar that closed.
const BAR_CHOICES = new Set(NOTIFY_KINDS.filter((k) => k.group === "bar").map((k) => k.id));
const openAt = (e) => (BAR_CHOICES.has(e.kind) ? e.t - 1 : e.t);

export const defaultSettings = () => ({ on: false, kinds: NOTIFY_KINDS.map((k) => k.id) });

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

/** What this browser can do: "system", "denied", "line" (in-app browser), "ios-home" or "none". */
export function notifySupport(nav = globalThis.navigator, win = globalThis) {
  const ua = nav?.userAgent ?? "";
  if (/\bLine\//i.test(ua)) return "line";
  if (!("Notification" in win)) return /iPhone|iPad|iPod/.test(ua) ? "ios-home" : "none";
  return win.Notification.permission === "denied" ? "denied" : "system";
}

const NOTES = {
  line: "LINE 內建瀏覽器不支援系統通知，只會在頁面上顯示提示。請點右上角，改用 Safari 或 Chrome 開啟本頁。",
  "ios-home": "iPhone 要先在 Safari 按「分享 → 加入主畫面」，從主畫面打開才收得到系統通知；現在只會在頁面上顯示提示。",
  none: "這個瀏覽器不支援系統通知，只會在頁面上顯示提示。",
  denied: "瀏覽器封鎖了這個網站的通知，只會在頁面上顯示提示。要收系統通知，請到瀏覽器的網站設定允許通知。",
  off: "開啟後，分頁在背景時會跳出系統通知，在前景時顯示在畫面上。網頁要開著才收得到。",
  on: "已開啟。分頁在背景時會跳出系統通知，在前景時顯示在畫面上。網頁要開著才收得到。",
};

export class Notifier {
  /** @param {{ toasts: HTMLElement, onOpen: (t: number) => void }} opts */
  constructor({ toasts, onOpen }) {
    this.toasts = toasts;
    this.onOpen = onOpen;
    this.seen = new Set();
    this.primed = false;
    this.settings = defaultSettings();
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
      if (saved && typeof saved.on === "boolean" && Array.isArray(saved.kinds)) this.settings = { on: saved.on, kinds: saved.kinds.filter((id) => CHOICE_OF.has(id) || NOTIFY_KINDS.some((k) => k.id === id)) };
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
      return await navigator.serviceWorker?.register("./notify-sw.js", { scope: "./" });
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
    this.settings.kinds = NOTIFY_KINDS.map((k) => k.id).filter((x) => kinds.has(x));
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
      const reg = await navigator.serviceWorker?.getRegistration("./");
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
      const item = document.createElement("div");
      item.className = "toast";
      item.setAttribute("role", "status");
      const text = document.createElement("p");
      text.textContent = e.text;
      const actions = document.createElement("div");
      actions.className = "toast-actions";
      const look = document.createElement("button");
      look.type = "button";
      look.textContent = "看圖";
      look.addEventListener("click", () => {
        this.onOpen(openAt(e));
        item.remove();
      });
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "關閉";
      close.addEventListener("click", () => item.remove());
      actions.append(look, close);
      const small = document.createElement("small");
      small.textContent = DISCLAIMER;
      item.append(text, small, actions);
      this.toasts.prepend(item);
      setTimeout(() => item.remove(), TOAST_MS);
    }
    while (this.toasts.children.length > TOASTS_MAX) this.toasts.lastElementChild.remove();
  }

  /** Builds the settings panel (switch, note, event types) into `root`. */
  mount(root, onChange = () => {}) {
    const switchBtn = document.createElement("button");
    switchBtn.type = "button";
    switchBtn.className = "notify-switch";
    const note = document.createElement("p");
    note.className = "notify-note";
    const refresh = () => {
      switchBtn.setAttribute("aria-pressed", String(this.on));
      switchBtn.textContent = this.on ? "關閉網頁通知" : "開啟網頁通知";
      note.textContent = this.note();
      root.closest("details")?.setAttribute("data-on", String(this.on));
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
      const set = document.createElement("fieldset");
      const lg = document.createElement("legend");
      lg.textContent = legend;
      set.append(lg);
      for (const k of NOTIFY_KINDS.filter((x) => x.group === group)) {
        const label = document.createElement("label");
        label.className = "check";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = this.settings.kinds.includes(k.id);
        box.addEventListener("change", () => this.setKind(k.id, box.checked));
        const name = document.createElement("span");
        name.textContent = k.name;
        const hint = document.createElement("small");
        hint.textContent = k.hint;
        label.append(box, name, hint);
        set.append(label);
      }
      root.append(set);
    }
    const foot = document.createElement("p");
    foot.className = "notify-foot";
    foot.textContent = `只通知發生在關鍵位（前日高低、POC、VAH、VAL、VWAP、堆疊區，0.1% 以內）的事件，同一關鍵位一小時內不重複。${DISCLAIMER}`;
    root.append(foot);
    refresh();
  }
}
