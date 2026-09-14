(() => {
  let articles = [],
    editing = null,
    customer = null,
    cursor = null,
    generation = 0;
  const form = document.querySelector("#kb-form");
  const field = (name) => form.elements.namedItem(name);
  async function load() {
    articles = await api("/api/knowledge");
    const list = document.querySelector("#kb-list");
    list.replaceChildren();
    for (const item of articles) {
      const card = el("article", undefined, "panel");
      card.append(
        el(
          "small",
          `${item.status === "published" ? "已發布" : "草稿"} · 版本 ${item.revision}`,
        ),
        el("h2", item.title),
        el(
          "p",
          item.answer.slice(0, 150) + (item.answer.length > 150 ? "…" : ""),
        ),
        el(
          "p",
          item.requires_support ? "回答後需人工核實" : "一般解法",
          "muted",
        ),
      );
      const button = el("button", "編輯解法", "secondary");
      button.onclick = () => edit(item);
      card.append(button);
      list.append(card);
    }
    document.querySelector("#kb-status").textContent =
      `共 ${articles.length} 則；${articles.filter((a) => a.status === "published").length} 則供 Bot 使用。`;
  }
  function edit(item = null) {
    editing = item;
    form.reset();
    document.querySelector("#kb-error").textContent = "";
    document.querySelector("#kb-title").textContent = item
      ? "編輯解法"
      : "新增常見問題";
    for (const key of ["title", "keywords", "answer", "source_note"])
      field(key).value = item?.[key] || "";
    field("requires_support").checked = !!item?.requires_support;
    field("status").value = item?.status || "draft";
    document.querySelector("#kb-dialog").showModal();
  }
  form.onsubmit = async (event) => {
    event.preventDefault();
    event.submitter.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(form));
      body.requires_support = field("requires_support").checked;
      if (editing) body.revision = editing.revision;
      await api("/api/knowledge" + (editing ? "/" + editing.id : ""), {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      document.querySelector("#kb-dialog").close();
      await load();
      toast("知識庫已儲存");
    } catch (error) {
      document.querySelector("#kb-error").textContent = error.message;
    } finally {
      event.submitter.disabled = false;
    }
  };
  async function fetchMessages(older = false) {
    const requestGeneration = generation,
      id = customer;
    if (!id) return;
    const button = document.querySelector("#conversation-older");
    button.disabled = true;
    try {
      const data = await api(
        `/api/customers/${id}/messages` +
          (older && cursor ? `?before=${cursor}` : ""),
      );
      if (requestGeneration !== generation) return;
      const list = document.querySelector("#conversation-list");
      if (!older) list.replaceChildren();
      const fragment = document.createDocumentFragment();
      const labels = {
        received: "已收到",
        prepared: "準備傳送",
        accepted: "LINE 已接受",
        failed: "傳送失敗",
        unconfirmed: "傳送結果未確認",
        not_sent: "未發送",
      };
      for (const m of data.messages) {
        const row = el(
          "article",
          undefined,
          "conversation-message " + m.direction,
        );
        row.append(
          el(
            "small",
            `${m.direction === "user" ? "用戶" : "Bot"} · ${new Date(m.occurred_at).toLocaleString("zh-TW")} · ${labels[m.delivery_status] || m.delivery_status}`,
          ),
          el("p", m.content),
        );
        if (
          m.direction === "user" &&
          m.message_type === "text" &&
          !m.content.startsWith("[")
        ) {
          const draft = el("button", "整理成知識草稿", "quiet");
          draft.type = "button";
          draft.onclick = () => {
            edit();
            field("title").value = m.content.slice(0, 150);
          };
          row.append(draft);
        }
        if (
          ["image", "flex"].includes(m.message_type) &&
          m.direction === "bot"
        ) {
          try {
            const url = new URL(JSON.parse(m.metadata_json).imageUrl);
            if (url.origin === location.origin) {
              const link = el("a", "開啟教學圖片");
              link.href = url.href;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              row.append(link);
            }
          } catch {}
        }
        fragment.append(row);
      }
      if (older) list.prepend(fragment);
      else list.append(fragment);
      if (!list.children.length)
        list.append(
          el("p", "尚無對話紀錄；上線前的歷史訊息無法補回。", "muted"),
        );
      cursor = data.nextBefore;
      button.hidden = !cursor;
    } catch (error) {
      if (requestGeneration === generation) toast(error.message);
    } finally {
      button.disabled = false;
    }
  }
  function conversation(id) {
    customer = id;
    cursor = null;
    generation++;
    document
      .querySelector("#conversation-list")
      .replaceChildren(el("p", "正在載入對話…", "muted"));
    fetchMessages();
  }
  document.querySelector("#kb-new").onclick = () => edit();
  document.querySelector("#kb-close").onclick = () =>
    document.querySelector("#kb-dialog").close();
  document.querySelector("#conversation-refresh").onclick = () => {
    generation++;
    fetchMessages();
  };
  document.querySelector("#conversation-older").onclick = () =>
    fetchMessages(true);
  window.CrmKnowledge = { load, conversation };
})();
