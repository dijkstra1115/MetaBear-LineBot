(() => {
  // /admin's 訂單流通知 tab: members' key-level alerts on LINE, and the thresholds and switches of
  // the order-flow collector whose events go to LINE (src/orderflow-subs.ts collectorSettings).
  // Editable settings, in display order; {u} is the market's coin, times are shown in seconds.
  const FIELDS = [
    ["printBtc", "大單（{u}）"],
    ["crossBtc", "跨所同步大單：每家（{u}）"],
    ["liqUsd", "連環爆倉金額（USD）"],
    ["liqWindowMs", "爆倉累計時間（秒）"],
    ["oiZ", "OI 變化 z 分數"],
    ["oiMinPct", "OI 最小變化（%）"],
    ["wallBtc", "掛單牆最少（{u}，${bin} 價位帶）"],
    ["wallRatio", "掛單牆倍數（× 全簿中位數）"],
    ["wallHoldMs", "掛單牆要持續（秒）"],
    ["spoofBtc", "誘單：消失量（{u}）"],
    ["spoofRatio", "誘單：原本 × 全簿中位數"],
    ["spoofWindowMs", "誘單：在幾秒內消失"],
    ["spoofHoldMs", "誘單：原本掛了幾秒"],
    ["spoofNearPct", "誘單：價格距離（%）"],
    ["spoofTradeRatio", "誘單：成交占比上限"],
    ["icebergBtc", "冰山成交量（{u}）"],
    ["icebergRatio", "冰山倍數（× 顯示量）"],
    ["cooldownMs", "同一事件冷卻（秒）"],
    ["levelTolPct", "關鍵位距離（%）"],
    ["levelCooldownMs", "同一關鍵位冷卻（秒）"],
    ["dailyCap", "管理員每天最多推送（則）"],
  ];
  const STATES = {
    pending: "待送",
    sent: "已送",
    muted: "已關閉",
    capped: "超過上限",
    logged: "只記錄",
    undelivered: "未送達",
    offlevel: "不在關鍵位",
    repeat: "同一關鍵位冷卻中",
  };
  const SOURCES = { all: "全市場", bybit: "Bybit", binance: "Binance", okx: "OKX", bingx: "BingX" };
  const seconds = (key) => key.endsWith("Ms");
  const taipei = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const $ = (s) => document.querySelector(s);
  let market = "btc";
  let current = null;

  const collector = (options) =>
    api(`/api/orderflow-alerts/collector?m=${market}`, options);

  async function loadMembers() {
    const alerts = await api("/api/orderflow-alerts");
    const sent = alerts.last24h;
    $("#orderflow-alerts-kill").textContent = alerts.enabled
      ? "暫停關鍵位提醒"
      : "恢復關鍵位提醒";
    $("#orderflow-alerts-status").textContent =
      (alerts.enabled
        ? "推播中。暫停後，新的事件不再排入，佇列裡尚未送出的會略過。"
        : "已暫停。會員的訂閱保留，恢復後只推送之後的新事件。") +
      ` 訂閱 ${alerts.subscribers} 人 · 近 24 小時送達 ${sent.accepted || 0} · 略過 ${sent.skipped || 0} · 失敗 ${sent.failed || 0}`;
  }

  function render(d) {
    current = d;
    const unit = d.market === "eth" ? "ETH" : "BTC";
    $("#of-summary").textContent =
      `${unit} · ${SOURCES[d.source] ?? d.source}收集器 · ${d.mode === "live" ? "推送到 LINE" : "只記錄"}。` +
      `管理員今天已收到 ${d.sentToday} 則，上限 ${d.dailyCap} 則（上限只限制市場通知）。`;
    $("#of-marketOn").checked = d.config.marketOn === 1;
    $("#of-healthOn").checked = d.config.healthOn === 1;
    $("#of-levelOn").checked = d.config.levelOn === 1;
    $("#of-levels").textContent = d.levels?.length
      ? `目前的關鍵位：${d.levels.map((L) => `${L.label} ${L.price.toLocaleString("en-US")}`).join("、")}`
      : "目前沒有關鍵位：收集器還沒有前一天的資料。";
    $("#of-config").replaceChildren(
      ...FIELDS.filter(([k]) => k in d.config).map(([k, label]) => {
        const row = el("label", label.replace("{u}", unit).replace("{bin}", String(d.config.wallBin)));
        const input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.min = "0";
        input.name = k;
        input.value = String(seconds(k) ? d.config[k] / 1000 : d.config[k]);
        row.append(
          input,
          el("small", `預設 ${seconds(k) ? d.defaults[k] / 1000 : d.defaults[k]}`, "muted"),
        );
        return row;
      }),
    );
    $("#of-recent").replaceChildren(
      ...d.recent.map((r) => {
        const tr = document.createElement("tr");
        for (const text of [taipei.format(Date.parse(r.t)), STATES[r.state] ?? r.state, r.text])
          tr.append(el("td", text));
        if (r.state === "sent") tr.className = "of-sent";
        return tr;
      }),
    );
  }

  async function load() {
    await Promise.all([loadMembers(), collector().then(render)]);
  }

  async function post(button, body, done) {
    button.disabled = true;
    try {
      render(await collector({ method: "POST", body: JSON.stringify(body) }));
      toast(done);
    } finally {
      button.disabled = false;
    }
  }

  for (const b of document.querySelectorAll("[data-of-market]"))
    b.onclick = run(async () => {
      market = b.dataset.ofMarket;
      for (const other of document.querySelectorAll("[data-of-market]")) {
        other.classList.toggle("active", other === b);
        other.setAttribute("aria-pressed", String(other === b));
      }
      render(await collector());
    });
  $("#of-refresh").onclick = run(load);
  $("#of-save").onclick = run(() => {
    const config = {};
    for (const k of ["marketOn", "healthOn", "levelOn"]) {
      const v = $(`#of-${k}`).checked ? 1 : 0;
      if (v !== current.config[k]) config[k] = v;
    }
    for (const input of $("#of-config").querySelectorAll("input")) {
      const v = Number(input.value);
      if (!Number.isFinite(v) || v <= 0) continue;
      const value = seconds(input.name) ? Math.round(v * 1000) : v;
      if (value !== current.config[input.name]) config[input.name] = value;
    }
    if (!Object.keys(config).length) return toast("沒有變更");
    return post($("#of-save"), { config }, "已儲存，馬上生效");
  });
  $("#of-reset").onclick = run(() => {
    if (!confirm("全部恢復預設？市場通知與健康通知都會重新打開。")) return;
    return post($("#of-reset"), { config: null }, "已恢復預設");
  });
  $("#of-test").onclick = run(() =>
    post($("#of-test"), { test: true }, "已送出測試通知，請看 LINE"),
  );
  $("#orderflow-alerts-kill").onclick = run(async () => {
    const alerts = await api("/api/orderflow-alerts");
    if (
      alerts.enabled &&
      !confirm("暫停後，所有會員都不會收到關鍵位提醒，直到恢復為止。確定暫停？")
    )
      return;
    await api("/api/orderflow-alerts/settings", {
      method: "POST",
      body: JSON.stringify({ enabled: !alerts.enabled }),
    });
    toast(alerts.enabled ? "已暫停關鍵位提醒" : "已恢復關鍵位提醒");
    await loadMembers();
  });
  window.CrmOrderflow = { load };
})();
