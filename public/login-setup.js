const find = (s) => document.querySelector(s);
const message = (text) => {
  find("#login-message").textContent = text;
};
async function api(method = "GET") {
  const response = await fetch("/api/auth/line-enrollment", {
    method,
    credentials: "same-origin",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      "X-MetaBear-Request": "crm",
    },
    ...(method === "POST" ? { body: "{}" } : {}),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("請重新登入管理員後台，再開啟此設定頁。");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "設定失敗，請稍後再試");
  return data;
}
async function refresh() {
  const data = await api();
  find("#binding-status").textContent =
    data.email + (data.bound ? " · 已完成 LINE 綁定" : " · 尚未綁定 LINE");
  find("#generate").hidden = false;
  find("#generate").textContent = data.bound
    ? "重新綁定我的 LINE"
    : "取得綁定碼";
  find("#refresh-binding").hidden = false;
  find("#test-login").hidden = !data.bound;
  if (data.bound) {
    find("#binding-command").hidden = true;
    find("#command").value = "";
    message("綁定完成。請測試接收驗證碼並登入。");
  }
}
find("#generate").onclick = async () => {
  find("#generate").disabled = true;
  try {
    const data = await api("POST");
    find("#command").value = data.command;
    find("#binding-command").hidden = false;
    message("請將綁定指令傳給 MetaBear LINE。");
  } catch (error) {
    message(error.message);
  } finally {
    find("#generate").disabled = false;
  }
};
find("#copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(find("#command").value);
    message("已複製，請貼到 MetaBear LINE 對話。");
  } catch {
    find("#command").select();
    message("請手動複製選取的綁定指令。");
  }
};
find("#refresh-binding").onclick = () =>
  refresh().catch((error) => message(error.message));
refresh().catch((error) => message(error.message));
