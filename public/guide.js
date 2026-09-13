const $ = (s) => document.querySelector(s);
const node = (tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};
let data,
  gallery = [],
  picture = 0;
const order = ["register", "code", "kyc", "deposit", "uid"];
function paragraphs(text) {
  const root = $("#guide-copy");
  root.replaceChildren();
  for (const part of text.split("\n\n")) {
    const p = node("p");
    for (const chunk of part.split(/(https:\/\/[^\s]+)/g)) {
      if (chunk.startsWith("https://")) {
        const a = node(
          "a",
          chunk.includes("youtu") ? "觀看 KYC 影片 ↗" : chunk,
        );
        a.href = chunk;
        a.target = "_blank";
        a.rel = "noreferrer";
        p.append(a);
      } else p.append(document.createTextNode(chunk));
    }
    root.append(p);
  }
}
function showImage(i) {
  picture = i;
  $("#full-image").src = gallery[i].src;
  $("#full-image").alt = gallery[i].caption;
  $("#image-caption").textContent = gallery[i].caption;
  $("#image-position").textContent = `${i + 1} / ${gallery.length}`;
  $("#previous-image").disabled = i === 0;
  $("#next-image").disabled = i === gallery.length - 1;
  if (!$("#image-dialog").open) $("#image-dialog").showModal();
}
function render(focus = false) {
  const params = new URLSearchParams(location.search);
  const lesson = params.get("lesson");
  const isLesson = Object.hasOwn(data.lessons, lesson);
  const key = Object.hasOwn(data.steps, params.get("step"))
    ? params.get("step")
    : "register";
  const item = isLesson
    ? { title: lesson, text: data.lessons[lesson] }
    : data.steps[key];
  document.title = `${item.title}｜MetaBear 學習中心`;
  $("#guide-title").textContent = item.title;
  $("#guide-category").textContent = isLesson
    ? "UNDERSTAND THE MARKET"
    : "GETTING STARTED / BINGX";
  paragraphs(item.text);
  $("#method-options").hidden = isLesson || key !== "deposit";
  $("#register-link").hidden = isLesson || !["register", "code"].includes(key);
  const next = isLesson
    ? Object.keys(data.lessons)[Object.keys(data.lessons).indexOf(lesson) + 1]
    : item.parent
      ? "uid"
      : order[order.indexOf(key) + 1];
  $("#next-step").hidden = !next;
  $("#next-step").href = next
    ? `/learn?${isLesson ? "lesson" : "step"}=${encodeURIComponent(next)}`
    : "/learn";
  $("#next-step").textContent = next
    ? "下一步：" + (isLesson ? next : data.steps[next].title) + " →"
    : "";
  for (const a of document.querySelectorAll(".learn-sidebar nav a"))
    a.setAttribute(
      "aria-current",
      (isLesson ? a.dataset.lesson === lesson : a.dataset.step === key)
        ? "page"
        : "false",
    );
  gallery =
    item.images ??
    (item.image ? [{ src: item.image, caption: item.title }] : []);
  $("#gallery-section").hidden = !gallery.length;
  $("#gallery-count").textContent = `${gallery.length} IMAGES`;
  $("#guide-media").replaceChildren();
  gallery.forEach((img, i) => {
    const fig = node("figure");
    const b = node("button");
    b.setAttribute("aria-label", `放大第 ${i + 1} 張：${img.caption}`);
    const image = node("img");
    image.src = img.src;
    image.alt = img.caption;
    image.loading = "lazy";
    b.append(image);
    b.onclick = () => showImage(i);
    fig.append(
      b,
      node("figcaption", `${String(i + 1).padStart(2, "0")} / ${img.caption}`),
    );
    $("#guide-media").append(fig);
  });
  if (focus) $("#guide-title").focus({ preventScroll: true });
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (
    !data ||
    !a ||
    e.ctrlKey ||
    e.metaKey ||
    e.shiftKey ||
    e.altKey ||
    e.button !== 0 ||
    a.target
  )
    return;
  const u = new URL(a.href);
  if (u.origin !== location.origin || u.pathname != "/learn") return;
  e.preventDefault();
  history.pushState(null, "", u);
  render(true);
  $("#guide-title").scrollIntoView({ block: "start", behavior: "instant" });
});
addEventListener("popstate", () => data && render());
$("#close-image").onclick = () => $("#image-dialog").close();
$("#previous-image").onclick = () => picture > 0 && showImage(picture - 1);
$("#next-image").onclick = () =>
  picture + 1 < gallery.length && showImage(picture + 1);
$("#image-dialog").addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight" && picture + 1 < gallery.length) {
    e.preventDefault();
    showImage(picture + 1);
  }
  if (e.key === "ArrowLeft" && picture > 0) {
    e.preventDefault();
    showImage(picture - 1);
  }
});
fetch("/content.json")
  .then((r) => {
    if (!r.ok) throw Error();
    return r.json();
  })
  .then((d) => {
    data = d;
    for (const [key, s] of Object.entries(data.steps)) {
      const a = node("a", s.title);
      a.href = "/learn?step=" + key;
      a.dataset.step = key;
      if (s.parent) a.dataset.child = "true";
      $("#guide-tabs").append(a);
    }
    for (const key of Object.keys(data.lessons)) {
      const a = node("a", key);
      a.href = "/learn?lesson=" + encodeURIComponent(key);
      a.dataset.lesson = key;
      $("#lesson-tabs").append(a);
    }
    render();
  })
  .catch(() => {
    $("#guide-title").textContent = "教學暫時無法載入";
    $("#guide-error").textContent = "請重新整理，或聯繫 LINE 小幫手。";
  });
