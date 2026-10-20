// Admin page for the order-flow alerts: switches, thresholds, a test message and the latest
// events, over /api/orderflow/btcusdt/alerts with the ORDERFLOW_ADMIN_TOKEN.
const API = "/api/orderflow/btcusdt/alerts";
const KEY = "metabear-orderflow-admin";
const $ = (id) => document.getElementById(id);

// Editable settings, in display order; times are shown in seconds.
const FIELDS = [
  ["printBtc", "大單（BTC）"],
  ["liqUsd", "連環爆倉金額（USD）"],
  ["liqWindowMs", "爆倉累計時間（秒）"],
  ["oiZ", "OI 變化 z 分數"],
  ["oiMinPct", "OI 最小變化（%）"],
  ["wallBtc", "掛單牆最少（BTC，$10 價位帶）"],
  ["wallRatio", "掛單牆倍數（× 全簿中位數）"],
  ["wallHoldMs", "掛單牆要持續（秒）"],
  ["spoofBtc", "誘單：消失量（BTC）"],
  ["spoofRatio", "誘單：原本 × 全簿中位數"],
  ["spoofWindowMs", "誘單：在幾秒內消失"],
  ["spoofHoldMs", "誘單：原本掛了幾秒"],
  ["spoofNearPct", "誘單：價格距離（%）"],
  ["spoofTradeRatio", "誘單：成交占比上限"],
  ["icebergBtc", "冰山成交量（BTC）"],
  ["icebergRatio", "冰山倍數（× 顯示量）"],
  ["cooldownMs", "同一事件冷卻（秒）"],
  ["levelTolPct", "關鍵位距離（%）"],
  ["levelCooldownMs", "同一關鍵位冷卻（秒）"],
  ["dailyCap", "每天最多推送（則）"],
];
const STATES = { pending: "待送", sent: "已送", muted: "已關閉", capped: "超過上限", logged: "只記錄", undelivered: "未送達", offlevel: "不在關鍵位", repeat: "同一關鍵位冷卻中" };
const seconds = (key) => key.endsWith("Ms");
const taipei = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

let token = "";
let current = null;
try {
  token = localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY) ?? "";
} catch {}

async function call(method, body) {
  const res = await fetch(API, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new Error("權杖不正確");
  if (!res.ok) throw new Error(`伺服器回應 ${res.status}`);
  return res.json();
}

function render(d) {
  current = d;
  $("summary").textContent = `模式：${d.mode === "live" ? "推送到 LINE" : "只記錄"}。今天已推送 ${d.sentToday} 則，上限 ${d.dailyCap} 則（上限只限制市場通知）。`;
  $("marketOn").checked = d.config.marketOn === 1;
  $("healthOn").checked = d.config.healthOn === 1;
  $("levelOn").checked = d.config.levelOn === 1;
  $("levels").textContent = d.levels?.length
    ? `目前的關鍵位（台灣日）：${d.levels.map((L) => `${L.label} ${L.price.toLocaleString("en-US")}`).join("、")}`
    : "目前沒有關鍵位：收集器還沒有前一個台灣日的資料。";
  const form = $("config");
  form.replaceChildren(
    ...FIELDS.filter(([k]) => k in d.config).map(([k, label]) => {
      const row = document.createElement("label");
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.min = "0";
      input.name = k;
      input.value = String(seconds(k) ? d.config[k] / 1000 : d.config[k]);
      const hint = document.createElement("small");
      hint.textContent = `預設 ${seconds(k) ? d.defaults[k] / 1000 : d.defaults[k]}`;
      row.append(label, input, hint);
      return row;
    }),
  );
  $("recent").replaceChildren(
    ...d.recent.map((r) => {
      const tr = document.createElement("tr");
      for (const text of [taipei.format(Date.parse(r.t)), STATES[r.state] ?? r.state, r.text]) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.append(td);
      }
      if (r.state === "sent") tr.className = "sent";
      return tr;
    }),
  );
}

async function enter() {
  try {
    render(await call("GET"));
    $("login").hidden = true;
    $("panel").hidden = false;
  } catch (err) {
    $("login-error").textContent = err.message;
    $("login").hidden = false;
    $("panel").hidden = true;
  }
}

async function act(button, body, done) {
  button.disabled = true;
  try {
    render(await call("POST", body));
    $("saved").textContent = done;
  } catch (err) {
    $("saved").textContent = err.message;
  } finally {
    button.disabled = false;
  }
}

$("login").addEventListener("submit", (e) => {
  e.preventDefault();
  token = $("token").value.trim();
  try {
    sessionStorage.setItem(KEY, token);
    if ($("remember").checked) localStorage.setItem(KEY, token);
  } catch {}
  enter();
});

$("logout").addEventListener("click", () => {
  token = "";
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {}
  $("token").value = "";
  $("panel").hidden = true;
  $("login").hidden = false;
});

$("save").addEventListener("click", () => {
  const config = { marketOn: $("marketOn").checked ? 1 : 0, healthOn: $("healthOn").checked ? 1 : 0, levelOn: $("levelOn").checked ? 1 : 0 };
  for (const input of $("config").querySelectorAll("input")) {
    const v = Number(input.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    const value = seconds(input.name) ? Math.round(v * 1000) : v;
    if (value !== current.config[input.name]) config[input.name] = value;
  }
  act($("save"), { config }, "已儲存，馬上生效。");
});

$("reset").addEventListener("click", () => {
  if (!confirm("全部恢復預設？市場通知與健康通知都會重新打開。")) return;
  act($("reset"), { config: null }, "已恢復預設。");
});

$("test").addEventListener("click", () => act($("test"), { test: true }, "已送出測試通知，請看 LINE。"));

if (token) enter();
