(() => {
  let revision = 0;
  const labels = {
    pending: "等待處理",
    running: "同步中",
    done: "已完成",
    failed: "需要處理",
    cancelled: "已取消",
    sending: "發送中",
    accepted: "LINE 已接受",
    eligible: "资格通過",
    needs_action: "待完成條件",
  };
  const time = (value) =>
    value
      ? new Date(value).toLocaleString("zh-TW", { hour12: false })
      : "尚無紀錄";
  const number = (value) =>
    value == null
      ? "未回傳資料"
      : Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 8 });
  function metric(title, value) {
    const box = el("div", undefined, "crm-metric");
    box.append(el("small", title), el("strong", value));
    return box;
  }
  function table(headers, rows) {
    const t = el("table"),
      head = el("thead"),
      tr = el("tr");
    headers.forEach((h) => tr.append(el("th", h)));
    head.append(tr);
    t.append(head);
    const body = el("tbody");
    rows.forEach((cells) => {
      const row = el("tr");
      cells.forEach((cell) => row.append(el("td", String(cell ?? "—"))));
      body.append(row);
    });
    t.append(body);
    return t;
  }
  async function ready() {
    const data = await api("/api/automation/settings");
    revision = data.team.revision;
    document.querySelector(".workspace-name").textContent =
      data.team.name + " · BingX";
    document.querySelector(".referral-card strong").textContent =
      data.team.referral_code;
    document.querySelector(".referral-card span").textContent =
      "已入金即可" +
      (data.team.allow_internal_transfer ? " · 允許內部轉帳" : "");
    const form = $("#team-form");
    ["name", "referral_code", "inviter_uid", "vip_url", "support_url"].forEach(
      (key) => (field(form, key).value = data.team[key]),
    );
    ["allow_indirect", "allow_internal_transfer", "automation_enabled"].forEach(
      (key) => (field(form, key).checked = !!data.team[key]),
    );
    $("#crm-readiness").textContent =
      `BingX 憑證：${data.bingxConfigured ? "已設定" : "未設定"} · LINE：${data.lineConfigured ? "已設定" : "未設定"} · 自動化：${data.team.automation_enabled ? "已開啟" : "已關閉"} · 發送模式：${data.deliveryMode === "live" ? "正式發送" : "不發送"} · 每團隊獨立資料庫`;
    $("#crm-dispatch").disabled =
      !data.bingxConfigured || !data.team.automation_enabled;
  }
  async function load() {
    await ready();
    const data = await api("/api/automation/summary");
    const q = Object.fromEntries(
      data.qualifications.map((row) => [row.qualification, row.count]),
    );
    const v = Object.fromEntries(
      data.deliveries.map((row) => [row.status, row.count]),
    );
    $("#crm-overview").replaceChildren(
      metric("資格已通過", q.eligible ?? 0),
      metric("待完成條件", q.needs_action ?? 0),
      metric("邀請已發送", v.accepted ?? 0),
      metric("邀請需處理", v.failed ?? 0),
    );
    $("#crm-jobs").replaceChildren(
      data.jobs.length
        ? table(
            ["時間", "用戶", "工作", "狀態", "說明"],
            data.jobs.map((row) => [
              time(row.created_at),
              row.line_user_id.slice(0, 9) + "…",
              row.kind === "full" ? "完整同步" : "資格審核",
              labels[row.status] ?? row.status,
              row.error || "—",
            ]),
          )
        : el("p", "目前沒有同步工作", "empty"),
    );
  }
  async function customer(id, uid) {
    const data = await api("/api/automation/customers/" + id);
    if (detailId !== id) return;
    const root = $("#crm-customer");
    root.replaceChildren(el("h3", "BingX 資格與行為資料"));
    if (!uid) {
      root.append(el("p", "登記 UID 後即可進行查詢。", "muted"));
      return;
    }
    const actions = el("div", undefined, "crm-actions");
    const sync = el("button", "重新同步 BingX", "secondary");
    sync.type = "button";
    sync.onclick = run(async () => {
      sync.disabled = true;
      try {
        await api("/api/automation/customers/" + id + "/sync", {
          method: "POST",
          body: "{}",
        });
        toast("已排入同步；稍後點「更新資料」查看結果");
        await customer(id, uid);
      } finally {
        sync.disabled = false;
      }
    });
    const refreshButton = el("button", "更新資料 ↻", "quiet");
    refreshButton.type = "button";
    refreshButton.onclick = run(() => customer(id, uid));
    actions.append(sync, refreshButton);
    root.append(actions);
    const s = data.snapshot,
      info = s?.data;
    root.append(
      el(
        "p",
        s
          ? `${s.stale ? "資料待更新" : (labels[s.qualification] ?? s.qualification)} · 核對時間 ${time(s.checked_at)}${s.reasons.length ? " · " + s.reasons.join("；") : ""}`
          : "尚未取得交易所資料",
        "callout",
      ),
    );
    if (info) {
      const status = (value) =>
        value === true ? "已完成" : value === false ? "未完成" : "待確認";
      root.append(
        table(
          ["項目", "結果"],
          [
            ["邀請碼", info.inviteCode],
            ["邀請人 UID", info.inviterUid],
            [
              "邀請型別",
              info.directInvitation === true
                ? "直接邀請"
                : info.directInvitation === false
                  ? "間接邀請"
                  : "待確認",
            ],
            ["KYC", status(info.kyc)],
            ["入金", status(info.deposited)],
            ["曾交易", status(info.traded)],
            ["資產淨值 / USDT", number(info.balance)],
            ["註冊時間", time(info.registeredAt)],
            ["等級", info.level],
            [
              "返傭比例",
              info.commissionRatio == null ? "—" : info.commissionRatio + "%",
            ],
            [
              "福利比例／到期",
              `${info.benefitRatio ?? "—"}% / ${time(info.benefitExpiresAt)}`,
            ],
          ],
        ),
      );
    }
    const summary = data.summary;
    if (summary) {
      const stats = el("div", undefined, "crm-metrics");
      stats.append(
        metric("近 7 天交易量", number(summary.volume7)),
        metric("近 30 天交易量", number(summary.volume30)),
        metric("近 30 天佣金", number(summary.commission30)),
        metric("最後觀測交易日", summary.lastObservedTrade ?? "未觀測"),
      );
      root.append(stats);
    }
    root.append(
      el(
        "p",
        "交易金額為 USDT；統計至前一日。無回傳紀錄不等同零；最後交易日僅涵蓋已同步歷史。",
        "muted",
      ),
    );
    if (data.coverage.length)
      root.append(
        el(
          "p",
          data.coverage
            .map(
              (c) =>
                `${c.business_type === "all" ? "全部" : c.business_type === "spot" ? "現貨" : "永續"}：${c.start_day}～${c.end_day}，${time(c.synced_at)} 更新`,
            )
            .join("；"),
          "muted",
        ),
      );
    if (summary?.months.length)
      root.append(
        el("h4", "每月 API 交易量（已觀測資料）"),
        table(
          ["月份", "交易量", "佣金"],
          summary.months.map((m) => [
            m.month,
            number(m.volume),
            number(m.commission),
          ]),
        ),
      );
    if (data.metrics.length) {
      const details = el("details");
      details.append(el("summary", "每日交易與手續費"));
      details.append(
        table(
          ["日期", "類型", "交易量", "佣金", "實收手續費"],
          data.metrics
            .slice(0, 180)
            .map((m) => [
              m.day,
              m.business_type === "all"
                ? "全部"
                : m.business_type === "spot"
                  ? "現貨"
                  : "永續",
              number(m.volume),
              number(m.commission),
              number(m.collected_fees),
            ]),
        ),
      );
      root.append(details);
    }
    root.append(el("h4", "入金明細"));
    root.append(
      data.deposits.length
        ? table(
            ["時間", "類型", "幣種", "金額"],
            data.deposits.map((d) => [
              time(d.occurred_at),
              d.type_name === "Internal Transfer-transfer in"
                ? "內部轉帳－轉入"
                : d.type_name,
              d.currency,
              number(d.amount),
            ]),
          )
        : el("p", "查詢期間無回傳入金明細", "muted"),
    );
    root.append(el("h4", "VIP 邀請紀錄"));
    root.append(
      data.deliveries.length
        ? table(
            ["狀態", "說明", "發送／入群時間"],
            data.deliveries.map((d) => [
              labels[d.status] ?? d.status,
              d.detail,
              `${time(d.accepted_at)} / ${time(d.joined_at)}`,
            ]),
          )
        : el("p", "尚未發送邀請", "muted"),
    );
    if (s?.qualification === "eligible" && !s.stale) {
      const note = el("input");
      note.placeholder = "已入群核對依據";
      note.maxLength = 500;
      note.setAttribute("aria-label", "已入群核對依據");
      const joined = el("button", "確認已入群", "secondary");
      joined.type = "button";
      joined.onclick = run(async () => {
        joined.disabled = true;
        try {
          await api("/api/automation/customers/" + id + "/joined", {
            method: "POST",
            body: JSON.stringify({ uid, note: note.value }),
          });
          await openCustomer(id);
          await refresh();
        } finally {
          joined.disabled = false;
        }
      });
      root.append(note, joined);
    }
    if (data.jobs.length)
      root.append(
        el("h4", "最近同步結果"),
        table(
          ["工作", "狀態", "說明"],
          data.jobs
            .slice(0, 5)
            .map((j) => [
              j.kind === "full" ? "完整同步" : "資格審核",
              labels[j.status] ?? j.status,
              j.error || time(j.finished_at),
            ]),
        ),
      );
  }
  $("#team-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      button = event.submitter;
    button.disabled = true;
    $("#team-error").textContent = "";
    try {
      const data = Object.fromEntries(new FormData(form));
      for (const key of [
        "allow_indirect",
        "allow_internal_transfer",
        "automation_enabled",
      ])
        data[key] = field(form, key).checked;
      data.revision = revision;
      await api("/api/automation/settings", {
        method: "PUT",
        body: JSON.stringify(data),
      });
      await load();
      toast("設定已儲存，下一次審核將使用新規則");
    } catch (error) {
      $("#team-error").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  $("#crm-reload").onclick = run(load);
  $("#crm-dispatch").onclick = run(async () => {
    const button = $("#crm-dispatch");
    button.disabled = true;
    try {
      await api("/api/automation/sync", { method: "POST", body: "{}" });
      await load();
      toast("已將待更新用戶排入同步");
    } finally {
      button.disabled = false;
    }
  });
  window.CrmAutomation = { ready, load, customer };
})();
