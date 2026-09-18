const $ = (s) => document.querySelector(s);
const stageNames = {
  new: "新加入",
  registering: "註冊中",
  kyc: "KYC 教學",
  deposit: "入金教學",
  review: "待核實",
  joined: "已入群",
};
const prefNames = {
  unknown: "未設定",
  spot: "現貨",
  futures: "合約",
  both: "現貨＋合約",
  learning: "先學基礎",
};
const statusNames = {
  pending: "待核實",
  verified: "已核實",
  rejected: "需補正",
};
let token = "",
  page = 1,
  total = 0,
  detailId = "",
  config,
  filters = "",
  toastTimer,
  audienceFilters = "",
  listVersion = 0;
const el = (tag, text, className) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
};
const field = (form, name) => form.elements.namedItem(name);
const month = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
const amount = (v) =>
  v === null || v === undefined
    ? "未紀錄"
    : Number(v).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
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
  if (
    response.type === "opaqueredirect" ||
    response.status === 401 ||
    response.status === 403
  ) {
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
function run(fn) {
  return (...args) =>
    Promise.resolve(fn(...args)).catch((e) => toast(e.message));
}
function serializeFilters() {
  const p = new URLSearchParams();
  for (const [k, v] of new FormData($("#filters"))) if (v) p.set(k, v);
  return p.toString();
}
async function loadCustomers() {
  const version = ++listVersion;
  const data = await api(`/api/customers?${filters}&page=${page}`);
  if (version !== listVersion) return;
  total = data.total;
  $("#customer-count").textContent = total;
  $("#customer-rows").replaceChildren();
  $("#empty").hidden = !!data.customers.length;
  for (const c of data.customers) {
    const tr = el("tr");
    const user = el("td");
    const wrap = el("div", undefined, "user-cell");
    wrap.append(el("span", (c.display_name || "新")[0], "avatar"));
    const names = el("div");
    names.append(
      el("span", c.display_name || "待補稱呼", "user-name"),
      el(
        "span",
        c.line_handle ||
          `${c.line_user_id.slice(0, 7)}…${c.line_user_id.slice(-4)}`,
        "user-id",
      ),
    );
    wrap.append(names);
    user.append(wrap);
    tr.append(user, el("td", c.uid || "尚未提交", "mono"));
    const stage = el("td");
    stage.append(
      el(
        "span",
        stageNames[c.stage],
        `badge ${c.stage === "joined" ? "green" : c.stage === "review" ? "orange" : "grey"}`,
      ),
    );
    if (c.support_requested)
      stage.append(
        el(
          "span",
          c.support_status === "claimed"
            ? `客服已接手${c.support_owner ? ` · ${c.support_owner}` : ""}`
            : "等待客服認領",
          "cell-secondary",
        ),
      );
    else
      stage.append(
        el(
          "span",
          c.referral_status
            ? `推薦 ${statusNames[c.referral_status]}`
            : "推薦關係未登記",
          "cell-secondary",
        ),
      );
    if (c.qualification)
      stage.append(
        el(
          "span",
          {
            eligible: "資格通過",
            needs_action: "待完成條件",
            pending: "待確認",
          }[c.qualification] +
            (c.vip_status === "accepted" ? " · 邀請已發送" : ""),
          "cell-secondary",
        ),
      );
    tr.append(stage, el("td", prefNames[c.preference]));
    const v = el("td", amount(c.volume_usdt), "mono");
    if (c.volume_usdt !== null)
      v.append(
        el(
          "span",
          "USDT · " +
            (c.volume_source === "bingx_api"
              ? "BingX API"
              : c.volume_source === "affiliate_report"
                ? "報表核對"
                : "手動"),
          "cell-secondary",
        ),
      );
    tr.append(v, el("td", c.last_trade_day || "尚無紀錄", "mono"));
    tr.append(
      el(
        "td",
        c.blocked ? "已封鎖" : c.marketing_consent ? "已訂閱" : "未訂閱",
      ),
    );
    const td = el("td");
    const button = el("button", "查看 ↗", "quiet");
    button.addEventListener(
      "click",
      run(() => openCustomer(c.line_user_id)),
    );
    td.append(button);
    tr.append(td);
    $("#customer-rows").append(tr);
  }
  $("#page-label").textContent =
    `${page} / ${Math.max(1, Math.ceil(total / 50))}`;
  $("#prev-page").disabled = page <= 1;
  $("#next-page").disabled = page * 50 >= total;
}
async function loadStats() {
  const data = await api("/api/stats");
  const counts = Object.fromEntries(data.stages.map((x) => [x.stage, x.count]));
  $("#stage-strip").replaceChildren();
  for (const [key, label] of Object.entries(stageNames)) {
    const b = el("button", undefined, `stage ${key}`);
    b.append(
      el("small", label),
      el("strong", String(counts[key] || 0)),
      el("span", undefined, "stage-line"),
    );
    b.addEventListener(
      "click",
      run(async () => {
        field($("#filters"), "stage").value = key;
        filters = serializeFilters();
        page = 1;
        await loadCustomers();
      }),
    );
    $("#stage-strip").append(b);
  }
  const routing = data.routing || {};
  const totalRoutes = Number(routing.total || 0);
  const clarificationRate = totalRoutes
    ? Math.round((Number(routing.clarifications || 0) / totalRoutes) * 100)
    : 0;
  $("#routing-summary").textContent = totalRoutes
    ? `近 ${routing.days} 天路由 ${totalRoutes} 次 · 需澄清 ${clarificationRate}% · 路由平均 ${Number(routing.average_latency_ms || 0).toLocaleString("zh-TW")} ms · Queue 平均 ${Number(routing.average_queue_delay_ms || 0).toLocaleString("zh-TW")} ms／最慢 ${Number(routing.maximum_queue_delay_ms || 0).toLocaleString("zh-TW")} ms`
    : "近 7 天尚無自然提問路由資料。";
  const reportMonth = field($("#filters"), "month").value || month();
  const report = await api("/api/analytics/volume?month=" + reportMonth);
  const box = $("#volume-report");
  box.hidden = false;
  box.replaceChildren();
  for (const [label, value] of [
    ["本月成交量 USDT", amount(report.volume)],
    ["本月有成交", report.traders],
    ["涵蓋但無成交", report.silent],
    ["同步超過 2 天", report.stale],
    ["近 30 天有開單", report.tradedLast30Days],
    ["本月新用戶", report.newcomers],
  ]) {
    const d = el("div");
    d.append(el("small", label), el("strong", String(value)));
    box.append(d);
  }
}
async function refresh() {
  await Promise.all([loadCustomers(), loadStats()]);
}
async function showView(view) {
  for (const e of document.querySelectorAll(".view"))
    e.hidden = e.id !== view + "-view";
  for (const b of document.querySelectorAll(".nav-item"))
    b.classList.toggle("active", b.dataset.view === view);
  $("#breadcrumb").textContent = {
    customers: "客戶名單",
    campaigns: "受眾與推播",
    content: "教學內容",
    simulator: "對話測試",
    automation: "自動審核與同步",
    knowledge: "常見問題知識庫",
    signals: "報單與分析師",
  }[view];
  if (view === "campaigns")
    await Promise.all([loadAudience(), loadDrafts(), loadRuns()]);
  if (view === "signals") await loadSignalsAdmin();
  if (view === "automation") await window.CrmAutomation.load();
  if (view === "knowledge") await window.CrmKnowledge.load();
}
const localMode = ["localhost", "127.0.0.1"].includes(location.hostname);
function authFailure() {
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  $("#workspace").hidden = true;
  $("#login").hidden = true;
  $("#auth-state").hidden = false;
  $("#auth-state h1").textContent = "請重新登入";
  $("#auth-state p").textContent = "登入工作階段已結束，請重新驗證後繼續操作。";
}
async function enterWorkspace() {
  config = await api("/api/config");
  $("#login").hidden = true;
  $("#auth-state").hidden = true;
  $("#workspace").hidden = false;
  $("#token").value = "";
  $("#environment").textContent = config.development
    ? "本機 · 不發送 LINE"
    : config.identity.email;
  $("#load-demo").hidden = !config.development;
  $("#sim-nav").hidden = !config.development;
  $("#assistant-status").textContent = config.assistant?.configured
    ? "已設定 OpenAI " + config.assistant.model + " · 自然提問會使用 API 額度"
    : "尚未設定 OpenAI · 使用常見問題備援規則";
  field($("#filters"), "month").value = month();
  filters = serializeFilters();
  const tagSelect = field($("#filters"), "tag");
  tagSelect.replaceChildren(new Option("全部標籤", ""));
  $("#tag-options").replaceChildren();
  for (const tag of config.tags || []) {
    tagSelect.append(new Option(tag, tag));
    const label = el("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = tag;
    label.append(input, document.createTextNode(tag));
    $("#tag-options").append(label);
  }
  renderContent();
  $(".referral-card strong").textContent = config.business.code;
  await window.CrmAutomation?.ready();
  await refresh();
}
$("#login-form").addEventListener("submit", async (e) => {
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
$("#logout").onclick = async () => {
  token = "";
  if (config?.identity?.mode === "native") {
    try {
      await api("/auth/logout", { method: "POST", body: "{}" });
      location.replace("/login");
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  if (!localMode) {
    location.href = "/cdn-cgi/access/logout";
    return;
  }
  location.reload();
};
if (localMode) {
  $("#auth-state").hidden = true;
  $("#login").hidden = false;
} else {
  enterWorkspace().catch(() => authFailure());
}
for (const b of document.querySelectorAll("[data-view]"))
  b.addEventListener(
    "click",
    run(() => showView(b.dataset.view)),
  );
$("#refresh").onclick = run(refresh);
$("#filters").addEventListener(
  "submit",
  run(async (e) => {
    e.preventDefault();
    filters = serializeFilters();
    page = 1;
    await loadCustomers();
  }),
);
$("#reset-filters").onclick = run(async () => {
  $("#filters").reset();
  field($("#filters"), "month").value = month();
  filters = serializeFilters();
  page = 1;
  await loadCustomers();
});
$("#prev-page").onclick = run(async () => {
  page--;
  await loadCustomers();
});
$("#next-page").onclick = run(async () => {
  page++;
  await loadCustomers();
});
$("#load-demo").onclick = run(async () => {
  await api("/api/demo", { method: "POST", body: "{}" });
  await refresh();
  toast("已載入本機示範名單");
});
async function openCustomer(id) {
  const data = await api(`/api/customers/${id}`);
  detailId = id;
  $("#detail-title").textContent = data.customer.display_name || "待補稱呼";
  $("#detail-id").textContent = id;
  window.CrmKnowledge.conversation(id);
  const f = $("#customer-form");
  f.reset();
  for (const key of [
    "display_name",
    "line_handle",
    "stage",
    "preference",
    "notes",
    "owner_name",
  ])
    field(f, key).value = data.customer[key];
  const selectedTags = new Set(
    String(data.customer.tags || "")
      .split(/[,，、\s]+/)
      .filter(Boolean),
  );
  for (const input of $("#tag-options").querySelectorAll("input"))
    input.checked = selectedTags.has(input.value);
  field(f, "support_status").value = data.support?.status || "resolved";
  for (const key of [
    "uid",
    "referral_status",
    "deposit_status",
    "verification_note",
    "deposit_note",
  ])
    field(f, key).value =
      data.account?.[key] ?? (key.endsWith("status") ? "pending" : "");
  $("#detail-consent").textContent =
    (data.customer.blocked
      ? "已封鎖"
      : data.customer.marketing_consent
        ? "已訂閱行銷通知"
        : "未訂閱行銷通知") + "。訂閱意願由用戶在 LINE 設定，後台不代為開啟。";
  $("#detail-trade").textContent = data.customer.last_trade_day
    ? "上次開單（BingX 有量日）：" + data.customer.last_trade_day
    : "尚無 BingX 成交紀錄。";
  $("#detail-error").textContent = "";
  $("#volume-error").textContent = "";
  const vf = $("#volume-form");
  vf.reset();
  field(vf, "month").value = month();
  $("#volume-history").replaceChildren();
  for (const v of data.volumes) {
    const p = el("p");
    p.append(el("span", v.month), el("span", `${amount(v.volume_usdt)} USDT`));
    $("#volume-history").append(p);
  }
  $("#audit-history").replaceChildren();
  for (const a of data.audit) {
    const labels = {
      "customer.update": "更新客戶資料",
      "volume.update": "更新交易量",
      consent: "用戶更新通知意願",
    };
    $("#audit-history").append(
      el(
        "p",
        `${new Date(a.created_at).toLocaleString("zh-TW")} · ${labels[a.action] || a.action}`,
      ),
    );
  }
  if (!$("#customer-dialog").open) $("#customer-dialog").showModal();
  await window.CrmAutomation.customer(id, data.account?.uid);
}
$("#close-detail").onclick = () => $("#customer-dialog").close();
$("#customer-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const data = {};
  for (const key of [
    "display_name",
    "line_handle",
    "stage",
    "preference",
    "notes",
    "owner_name",
  ])
    data[key] = field(f, key).value;
  data.tags = [...$("#tag-options").querySelectorAll("input:checked")]
    .map((input) => input.value)
    .join(",");
  data.support_status = field(f, "support_status").value;
  if (field(f, "uid").value.trim()) {
    data.account = {};
    for (const key of [
      "uid",
      "referral_status",
      "deposit_status",
      "verification_note",
      "deposit_note",
    ])
      data.account[key] = field(f, key).value;
  }
  const b = e.submitter;
  b.disabled = true;
  try {
    await api(`/api/customers/${detailId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    await openCustomer(detailId);
    await refresh();
    toast("已儲存客戶資料");
  } catch (err) {
    $("#detail-error").textContent = err.message;
  } finally {
    b.disabled = false;
  }
});
$("#volume-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const data = Object.fromEntries(new FormData(f));
  data.volume_usdt = Number(data.volume_usdt);
  const b = e.submitter;
  b.disabled = true;
  try {
    await api(`/api/customers/${detailId}/volume`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    await openCustomer(detailId);
    await loadCustomers();
    toast("已儲存本月交易量");
  } catch (err) {
    $("#volume-error").textContent = err.message;
  } finally {
    b.disabled = false;
  }
});
async function loadAudience() {
  audienceFilters = filters;
  const data = await api("/api/audience?" + audienceFilters);
  $("#audience-count").textContent = data.total;
  const p = new URLSearchParams(audienceFilters);
  $("#audience-filters").textContent =
    `月份 ${data.month} · ${stageNames[p.get("stage")] || "全部進度"} · ${prefNames[p.get("preference")] || "全部偏好"}${p.get("min") ? " · 至少 " + p.get("min") + " USDT" : ""}${p.get("max") ? " · 至多 " + p.get("max") + " USDT" : ""}${p.get("q") ? " · 搜尋 " + p.get("q") : ""} · 已訂閱、未封鎖`;
  $("#audience-names").replaceChildren();
  for (const c of data.customers) {
    const d = el("div");
    d.append(
      el("span", c.display_name || "待補稱呼"),
      el("small", c.uid || "UID 未提交"),
    );
    $("#audience-names").append(d);
  }
  if (data.total > 50)
    $("#audience-names").append(
      el("p", "此處顯示前 50 位，草稿會記錄全部符合條件人數。"),
    );
}
$("#audience-refresh").onclick = run(loadAudience);
$("#draft-form").addEventListener(
  "submit",
  run(async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    data.filters = audienceFilters;
    const b = e.submitter;
    b.disabled = true;
    try {
      await api("/api/campaigns", {
        method: "POST",
        body: JSON.stringify(data),
      });
      e.target.reset();
      await loadDrafts();
      toast("已儲存草稿，尚未發送");
    } finally {
      b.disabled = false;
    }
  }),
);
async function loadDrafts() {
  const drafts = await api("/api/campaigns");
  $("#drafts").replaceChildren();
  if (!drafts.length) $("#drafts").append(el("p", "還沒有通知草稿。", "muted"));
  for (const d of drafts) {
    const item = el("article", undefined, "draft-item");
    item.append(
      el("h3", d.title),
      el(
        "small",
        `${new Date(d.created_at).toLocaleString("zh-TW")} · 儲存時受眾 ${d.audience_count} 位 · 草稿（發送狀態見推播紀錄）`,
      ),
      el("p", d.body),
    );
    const preview = el("button", "預覽並確認推播 ↗", "secondary");
    preview.onclick = run(async () => {
      preview.disabled = true;
      try {
        await previewCampaign(d.id);
      } finally {
        preview.disabled = false;
      }
    });
    item.append(preview);
    $("#drafts").append(item);
  }
}
function renderContent() {
  $("#content-cards").replaceChildren();
  for (const [key, s] of Object.entries(config.steps)) {
    const card = el("article", undefined, "content-item");
    card.append(el("h2", s.title), el("p", s.text));
    const a = el(
      "a",
      s.image || s.images?.length ? "查看原始圖片與文字 ↗" : "查看文字教學 ↗",
    );
    a.href = "/learn?step=" + key;
    a.target = "_blank";
    a.rel = "noreferrer";
    card.append(a);
    $("#content-cards").append(card);
  }
}
async function simulate(text, displayText = text) {
  const chat = $("#chat");
  chat.append(el("div", displayText, "bubble mine"));
  const data = await api("/api/simulate", {
    method: "POST",
    body: JSON.stringify({ userId: $("#sim-user").value, text }),
  });
  for (const m of data.messages) {
    const bubble = el("div", m.text, "bubble");
    if (m.type === "image") {
      const img = el("img");
      img.src = m.originalContentUrl;
      img.alt = "教學圖片";
      bubble.append(img);
    }
    if (m.type === "flex") {
      for (const component of m.contents.body.contents) {
        if (component.type === "text") bubble.append(el("p", component.text));
        if (component.type === "image") {
          const img = el("img");
          img.src = component.url;
          img.alt = m.altText;
          bubble.append(img);
        }
      }
    }
    chat.append(bubble);
    if (m.quickReply) {
      const quick = el("div", undefined, "quick-replies");
      for (const { action } of m.quickReply.items) {
        if (action.type === "message" || action.type === "postback") {
          const b = el("button", action.label);
          b.onclick = run(() =>
            simulate(
              action.type === "message"
                ? action.text
                : new URLSearchParams(action.data).get("text"),
              action.label,
            ),
          );
          quick.append(b);
        } else {
          const a = el("a", action.label);
          a.href = action.uri;
          a.target = "_blank";
          a.rel = "noreferrer";
          quick.append(a);
        }
      }
      chat.append(quick);
    }
  }
  chat.scrollTop = chat.scrollHeight;
  await refresh();
}
$("#sim-form").addEventListener(
  "submit",
  run(async (e) => {
    e.preventDefault();
    const text = $("#sim-text").value;
    $("#sim-text").value = "";
    const b = e.submitter;
    b.disabled = true;
    try {
      await simulate(text);
    } finally {
      b.disabled = false;
    }
  }),
);
for (const b of document.querySelectorAll("[data-sim]"))
  b.onclick = run(() => simulate(b.dataset.sim));

let campaignPreview;
async function previewCampaign(id) {
  const data = await api("/api/campaigns/" + id + "/preview", {
    method: "POST",
    body: "{}",
  });
  campaignPreview = data.run;
  $("#campaign-title").textContent = data.run.title;
  $("#campaign-body").textContent = data.run.body;
  const remaining =
    data.quota.remaining === null ? "無上限" : data.quota.remaining + " 則";
  $("#campaign-summary").textContent =
    "這次最多發送 " +
    data.run.audience_count +
    " 位 · LINE 本月剩餘 " +
    remaining +
    " · 發送前會重新檢查訂閱與篩選條件。";
  $("#campaign-recipients").replaceChildren();
  for (const c of data.recipients) {
    const r = el("div");
    r.append(
      el("span", c.display_name || "待補稱呼"),
      el("small", c.line_user_id.slice(0, 8) + "…" + c.line_user_id.slice(-4)),
    );
    $("#campaign-recipients").append(r);
  }
  $("#campaign-error").textContent = data.quota.disabled
    ? "本機不會發送 LINE 訊息。"
    : "";
  $("#campaign-send").disabled = data.quota.disabled;
  $("#campaign-send").textContent =
    "確認發送給 " + data.run.audience_count + " 位";
  $("#campaign-dialog").showModal();
}
$("#campaign-close").onclick = () => $("#campaign-dialog").close();
$("#campaign-send").onclick = async () => {
  const b = $("#campaign-send");
  b.disabled = true;
  $("#campaign-error").textContent = "";
  try {
    await api("/api/campaigns/" + campaignPreview.draft_id + "/send", {
      method: "POST",
      body: JSON.stringify({
        runId: campaignPreview.id,
        confirmCount: campaignPreview.audience_count,
      }),
    });
    $("#campaign-dialog").close();
    toast("已確認推播，請在下方查看處理狀態");
    await loadRuns();
  } catch (err) {
    $("#campaign-error").textContent = err.message;
  } finally {
    b.disabled = false;
  }
};
async function loadRuns() {
  const runs = await api("/api/campaign-runs");
  $("#campaign-runs").replaceChildren();
  if (!runs.length)
    $("#campaign-runs").append(el("p", "尚未確認任何推播。", "muted"));
  for (const r of runs) {
    const item = el("article", undefined, "draft-item");
    item.append(
      el("h3", r.title),
      el(
        "small",
        new Date(r.confirmed_at).toLocaleString("zh-TW") +
          " · " +
          (r.status === "completed" ? "處理完成" : "排程處理中"),
      ),
      el(
        "p",
        "LINE 已接受 " +
          (r.counts.accepted || 0) +
          " · 略過 " +
          (r.counts.skipped || 0) +
          " · 失敗 " +
          (r.counts.failed || 0) +
          " · 待處理 " +
          ((r.counts.pending || 0) + (r.counts.sending || 0)),
      ),
      el("p", r.body),
    );
    if (r.counts.failed)
      item.append(
        el(
          "p",
          "部分請求失敗。請核對 LINE 帳戶額度及設定，避免直接重發整批訊息。",
          "callout",
        ),
      );
    $("#campaign-runs").append(item);
  }
}
$("#runs-refresh").onclick = run(loadRuns);
function dirLabel(direction) {
  return direction === "short" ? "做空" : "做多";
}
async function loadSignalsAdmin() {
  const [staff, signals] = await Promise.all([
    api("/api/staff"),
    api("/api/signals"),
  ]);
  $("#signal-kill").textContent = signals.enabled
    ? "暫停全部報單"
    : "恢復報單發送";
  $("#signal-kill-status").textContent = signals.enabled
    ? "報單發送中。急停後，佇列裡尚未送出的訊息會略過。"
    : "報單已急停。分析師暫時無法發送。";
  const list = $("#staff-list");
  list.replaceChildren();
  if (!staff.staff.length) list.append(el("p", "尚未新增分析師。", "muted"));
  for (const s of staff.staff) {
    const item = el("article", undefined, "draft-item");
    item.append(
      el("h3", s.name),
      el(
        "small",
        s.email +
          " · " +
          (s.owner
            ? "管理員兼分析師"
            : s.enabled
              ? "啟用中"
              : "已停用") +
          " · " +
          (s.bound ? "已綁 LINE" : "尚未綁定") +
          " · 報單 " +
          s.signals,
      ),
    );
    const actions = el("div", undefined, "crm-actions");
    const bind = el("button", "取得綁定指令", "quiet");
    bind.type = "button";
    bind.onclick = run(async () => {
      const data = await api(
        `/api/staff/${encodeURIComponent(s.email)}/line-enrollment`,
        { method: "POST", body: "{}" },
      );
      await navigator.clipboard.writeText(data.command).catch(() => {});
      toast("已產生綁定指令，請交給分析師傳到 MetaBear LINE：" + data.command);
    });
    actions.append(bind);
    if (!s.owner) {
      const toggle = el("button", s.enabled ? "停用" : "啟用", "quiet");
      toggle.type = "button";
      toggle.onclick = run(async () => {
        await api(`/api/staff/${encodeURIComponent(s.email)}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: !s.enabled }),
        });
        await loadSignalsAdmin();
      });
      actions.append(toggle);
    }
    item.append(actions);
    list.append(item);
  }
  const signalList = $("#admin-signal-list");
  signalList.replaceChildren();
  if (!signals.signals.length)
    signalList.append(el("p", "尚無報單紀錄。", "muted"));
  for (const s of signals.signals) {
    const item = el("article", undefined, "draft-item");
    item.append(
      el(
        "h3",
        `${s.analystName} · ${s.categoryId} ${dirLabel(s.direction)} ${s.leverage}`,
      ),
      el(
        "small",
        `${s.createdAt} · ${s.status} · 發送 ${s.audienceCount} · 接受 ${s.counts.accepted || 0} · 略過 ${s.counts.skipped || 0} · 失敗 ${s.counts.failed || 0}`,
      ),
      el("p", `進場 ${s.entry} · 止盈 ${s.takeProfit} · 止損 ${s.stopLoss}`),
    );
    signalList.append(item);
  }
}
$("#staff-form").addEventListener(
  "submit",
  run(async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    await api("/api/staff", { method: "POST", body: JSON.stringify(data) });
    form.reset();
    toast("已加入分析師");
    await loadSignalsAdmin();
  }),
);
$("#staff-refresh").onclick = run(loadSignalsAdmin);
$("#signals-refresh").onclick = run(loadSignalsAdmin);
$("#signal-kill").onclick = run(async () => {
  const current = await api("/api/signals");
  await api("/api/signals/settings", {
    method: "POST",
    body: JSON.stringify({ enabled: !current.enabled }),
  });
  await loadSignalsAdmin();
});
