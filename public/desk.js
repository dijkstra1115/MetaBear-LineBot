const $ = (s) => document.querySelector(s);
let token = "",
  config,
  toastTimer,
  imageData = "";
const localMode = ["localhost", "127.0.0.1"].includes(location.hostname);
const el = (tag, text, className) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
};
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 4000);
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    redirect: "manual",
    credentials: "same-origin",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-MetaBear-Request": "crm",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (response.type === "opaqueredirect" || response.status === 401) {
    if (!localMode) authFailure();
    throw new Error("登入已失效，請重新登入");
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    if (!localMode) authFailure();
    throw new Error("請重新登入後再操作");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作失敗，請再試一次");
  return data;
}
function authFailure() {
  $("#workspace").hidden = true;
  $("#login").hidden = true;
  $("#auth-state").hidden = false;
}
function resultLabel(result) {
  return (
    { tp: "止盈", sl: "止損", expired: "過期", closed: "已結束" }[result] ||
    "未標記"
  );
}
function dirLabel(direction) {
  return direction === "short" ? "做空" : "做多";
}
async function previewCount() {
  const categoryId = $("#signal-form").elements.namedItem("categoryId").value;
  if (!categoryId) return;
  const data = await api(`/api/desk/preview?category=${categoryId}`);
  $("#preview-count").textContent =
    `目前約 ${data.count} 位已入群訂閱者會收到。`;
  $("#preview-count").dataset.count = String(data.count);
}
async function loadSignals() {
  const data = await api("/api/desk/signals");
  const list = $("#signal-list");
  list.replaceChildren();
  if (!data.signals.length) {
    list.append(el("p", "還沒有發送紀錄。", "muted"));
    return;
  }
  for (const s of data.signals) {
    const card = el("article", undefined, "draft-card");
    card.append(
      el("strong", `${s.categoryId} ${dirLabel(s.direction)} ${s.leverage}`),
      el(
        "p",
        `進場 ${s.entry} · 止盈 ${s.takeProfit} · 止損 ${s.stopLoss}`,
        "muted",
      ),
      el(
        "p",
        `發送 ${s.audienceCount} 人 · 接受 ${s.counts.accepted || 0} · 略過 ${s.counts.skipped || 0} · ${resultLabel(s.result)}`,
        "muted",
      ),
    );
    if (s.status === "queued")
      card.append(el("p", "發送中，請稍後重新整理。", "muted"));
    const actions = el("div", undefined, "crm-actions");
    for (const [value, label] of [
      ["tp", "標記止盈"],
      ["sl", "標記止損"],
      ["expired", "標記過期"],
      ["closed", "標記結束"],
    ]) {
      const button = el("button", label, "quiet");
      button.type = "button";
      button.onclick = async () => {
        await api(`/api/desk/signals/${s.id}`, {
          method: "PATCH",
          body: JSON.stringify({ result: value }),
        });
        toast("已更新績效標記");
        await enterWorkspace(false);
      };
      actions.append(button);
    }
    card.append(actions);
    list.append(card);
  }
}
async function enterWorkspace(first = true) {
  config = await api("/api/desk/config");
  $("#login").hidden = true;
  $("#auth-state").hidden = true;
  $("#workspace").hidden = false;
  $("#environment").textContent = config.identity.email;
  $("#analyst-name").textContent = config.identity.name;
  $("#admin-link").hidden = config.identity.role !== "admin";
  $("#kill-banner").hidden = config.enabled;
  $("#kill-banner").textContent = !config.signalsEnabled
    ? "報單發送目前已暫停，請聯絡管理員。"
    : "這個分析師帳號已停用。";
  $("#desk-limits").textContent =
    `本時 ${config.limits.hourUsed}/${config.limits.hour} · 今日 ${config.limits.dayUsed}/${config.limits.day}`;
  const stats = $("#desk-stats");
  stats.replaceChildren();
  for (const [label, value] of [
    ["已發", config.stats.sent || 0],
    ["止盈", config.stats.tp || 0],
    ["止損", config.stats.sl || 0],
    ["過期", config.stats.expired || 0],
  ]) {
    const box = el("div", undefined, "crm-metric");
    box.append(el("small", label), el("strong", String(value)));
    stats.append(box);
  }
  const select = $("#signal-form").elements.namedItem("categoryId");
  const current = select.value;
  select.replaceChildren();
  for (const c of config.categories) select.append(new Option(c.label, c.id));
  if (current) select.value = current;
  if (first) await previewCount();
  await loadSignals();
}
$("#signal-form").addEventListener("change", (event) => {
  if (event.target.name === "categoryId")
    previewCount().catch((e) => toast(e.message));
});
$("#signal-image").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  imageData = "";
  if (!file) return;
  if (file.size > 800000) {
    event.target.value = "";
    toast("圖片需小於 800 KB");
    return;
  }
  imageData = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("無法讀取圖片"));
    reader.readAsDataURL(file);
  });
});
$("#signal-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const count = Number($("#preview-count").dataset.count || 0);
  if (!count) {
    toast("目前沒有已入群且訂閱此品項的用戶");
    return;
  }
  if (!confirm(`將立刻發送給約 ${count} 位訂閱者，確定送出？`)) return;
  const body = Object.fromEntries(new FormData(form));
  const button = event.submitter;
  button.disabled = true;
  try {
    await previewCount();
    const confirmCount = Number($("#preview-count").dataset.count || 0);
    await api("/api/desk/signals", {
      method: "POST",
      body: JSON.stringify({
        categoryId: body.categoryId,
        direction: body.direction,
        leverage: body.leverage,
        entry: body.entry,
        takeProfit: body.takeProfit,
        stopLoss: body.stopLoss,
        note: body.note,
        image: imageData || undefined,
        confirmCount,
      }),
    });
    form.reset();
    imageData = "";
    toast("已送進發送佇列");
    await enterWorkspace();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});
$("#refresh-signals").onclick = () =>
  enterWorkspace(false).catch((e) => toast(e.message));
$("#logout").onclick = async () => {
  token = "";
  if (config?.identity?.mode === "native" || !localMode) {
    try {
      await api("/auth/logout", { method: "POST", body: "{}" });
    } catch {
      /* still leave */
    }
    location.replace("/login");
    return;
  }
  location.reload();
};
$("#login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  token = $("#token").value.trim();
  e.submitter.disabled = true;
  try {
    await enterWorkspace();
  } catch (err) {
    $("#login-error").textContent = err.message;
    token = "";
  } finally {
    e.submitter.disabled = false;
  }
});
if (localMode) {
  $("#auth-state").hidden = true;
  $("#login").hidden = false;
} else {
  enterWorkspace().catch(() => authFailure());
}
