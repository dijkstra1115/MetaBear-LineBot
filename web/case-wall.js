// Homepage case wall: one card per replay short (poster, then a muted preview on hover), and a
// dialog that plays the short with the trade's levels and the evidence seen before the entry.
// Cards are built with DOM calls, not HTML strings, because the CSP allows no inline styles.
import { CASES } from "./case-wall-data.js";

// The web encodes and posters (motion/replays/case-shorts/scripts/export-web.mjs) live in the R2
// bucket metabear-media behind media.metabear.io; the local preview serves copies from public/media/.
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const MEDIA_BASE = LOCAL ? "/media/cases/" : "https://media.metabear.io/cases/";

const fmt = (p) => p.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const side = (c) => (c.dir === "long" ? "做多" : "做空");
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export function initCaseWall({ motionOff }) {
  const wall = document.querySelector("[data-case-wall]");
  const dialog = document.querySelector("[data-case-player]");
  if (!wall || !dialog) return;
  const hoverPreview = matchMedia("(hover: hover) and (pointer: fine)").matches;

  for (const c of CASES) {
    const li = el("li", "case-item");
    li.setAttribute("data-reveal", "");
    const card = el("button", "case-card mb-spot");
    card.type = "button";
    card.setAttribute("aria-label", `播放覆盤 #${c.no}：${c.title}，${c.minutes} 分鐘 +${c.r}R`);
    const media = el("span", "case-media");
    const img = el("img");
    img.src = `${MEDIA_BASE}case-${c.id}.webp`;
    img.alt = "";
    img.width = 540;
    img.height = 960;
    img.loading = "lazy";
    img.decoding = "async";
    const video = el("video");
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.preload = "none";
    video.setAttribute("aria-hidden", "true");
    media.append(img, video, el("span", "case-play", "▶"));
    const body = el("span", "case-body");
    body.append(
      el("span", "case-meta mb-mono", `#${String(c.no).padStart(2, "0")} · ${c.date.slice(5).replace("-", "/")}`),
      el("strong", "case-tag", c.tag),
    );
    const result = el("span", "case-result");
    result.append(el("b", "mb-num", `+${c.r}R`), el("span", null, `${c.minutes} 分鐘 · ${side(c)}`));
    body.append(result);
    card.append(media, body);
    li.append(card);
    wall.append(li);

    card.addEventListener("click", () => open(c));
    if (hoverPreview) {
      card.addEventListener("pointerenter", () => {
        if (motionOff()) return;
        if (!video.src) video.src = `${MEDIA_BASE}case-${c.id}.mp4`;
        card.classList.add("is-previewing");
        video.play().catch(() => card.classList.remove("is-previewing"));
      });
      card.addEventListener("pointerleave", () => {
        card.classList.remove("is-previewing");
        video.pause();
      });
    }
  }

  const player = dialog.querySelector("[data-case-video]");
  const q = (s) => dialog.querySelector(s);
  function open(c) {
    q("[data-case-kicker]").textContent = `CASE ${String(c.no).padStart(2, "0")} · ${c.date} · ${c.tag}`;
    q("[data-case-title]").textContent = c.title;
    const outcome = q("[data-case-outcome]");
    outcome.replaceChildren(el("b", "mb-num", `+${c.r}R`), document.createTextNode(` ${c.minutes} 分鐘到目標`));
    const levels = q("[data-case-levels]");
    levels.replaceChildren();
    for (const [k, v, cls] of [
      [`${side(c)} ${c.entryAt}`, fmt(c.entry), c.dir],
      [`停損 ${c.riskPct}%`, fmt(c.stop), "stop"],
      [`目標 ${c.r}R`, fmt(c.target), "target"],
    ]) {
      const row = el("div", `case-level ${cls}`);
      row.append(el("dt", null, k), el("dd", "mb-num", v));
      levels.append(row);
    }
    const list = q("[data-case-evidence]");
    list.replaceChildren(
      ...c.evidence.map((e) => {
        const li = el("li");
        li.append(el("time", "mb-mono", e.at), el("span", null, e.text));
        return li;
      }),
    );
    player.poster = `${MEDIA_BASE}case-${c.id}.webp`;
    player.src = `${MEDIA_BASE}case-${c.id}.mp4`;
    dialog.showModal();
    player.play().catch(() => {});
  }
  dialog.addEventListener("close", () => {
    player.pause();
    player.removeAttribute("src");
    player.load();
  });
  q("[data-case-close]").addEventListener("click", () => dialog.close());
  // A click on the backdrop (the dialog element itself, outside the panel) closes it.
  dialog.addEventListener("click", (e) => e.target === dialog && dialog.close());
}
