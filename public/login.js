const find = (s) => document.querySelector(s);
let preview = false;
const message = (text, error = false) => {
  find("#login-message").textContent = text;
  find("#login-message").dataset.error = String(error);
};
async function auth(path, data) {
  const response = await fetch(path, {
    method: data ? "POST" : "GET",
    credentials: "same-origin",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      "X-MetaBear-Request": "crm",
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("登入服務暫時無法使用，請稍後再試");
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "登入失敗，請稍後再試");
  return body;
}
find("#request-code").onsubmit = async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "正在傳送…";
  message("");
  try {
    const data = await auth("/auth/request", {
      email: find("#email").value.trim(),
    });
    find("#request-code").hidden = true;
    find("#verify-code").hidden = false;
    message(data.message);
    find("#code").focus();
  } catch (error) {
    message(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "取得登入驗證碼";
  }
};
find("#verify-code").onsubmit = async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "正在驗證…";
  try {
    const data = await auth("/auth/verify", {
      code: find("#code").value.trim(),
    });
    if (preview) {
      await auth("/auth/session");
      find("#verify-code").hidden = true;
      find("#login-description").textContent = "LINE 登入驗證成功";
      message(
        "已確認你可以透過 LINE 登入。正式切換後，就能直接進入 MetaBear 工作台。",
      );
      return;
    }
    const next = new URLSearchParams(location.search).get("next");
    location.replace(
      data.role === "analyst" || next === "desk" ? "/desk" : "/admin",
    );
  } catch (error) {
    message(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "登入工作台";
  }
};
find("#restart").onclick = () => {
  find("#verify-code").hidden = true;
  find("#request-code").hidden = false;
  find("#code").value = "";
  message("兩次索取需間隔 60 秒，請也確認是否已收到驗證碼。");
  find("#email").focus();
};
auth("/auth/config")
  .then((config) => {
    preview = config.preview === true;
    if (config.mode === "native") {
      find("#login-description").textContent =
        config.channel === "line"
          ? "輸入工作台 Email，驗證碼會傳到已綁定的 LINE。"
          : "輸入工作台 Email，我們會寄送一次性登入驗證碼。";
      find("#request-code").hidden = false;
    } else {
      find("#login-description").textContent =
        "獨立登入正在準備中，目前請使用既有的管理員登入。";
      find("#existing-login").hidden = false;
    }
  })
  .catch((error) => message(error.message, true));
