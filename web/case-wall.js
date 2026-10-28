// Homepage case wall: one card per stretch (poster, then a muted preview on hover), and a dialog
// that plays the stretch's film with every trade the rule took in it, stops included.
// Cards are built with DOM calls, not HTML strings, because the CSP allows no inline styles.
import { SEGMENTS } from "./case-wall-data.js";

// The web encodes and posters (motion/replays/segments/scripts/export-web.mjs) live in the R2
// bucket metabear-media behind media.metabear.io; the local preview serves copies from public/media/.
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const MEDIA_BASE = LOCAL ? "/media/cases/" : "https://media.metabear.io/cases/";

const side = (t) => (t.dir === "long" ? "多" : "空");
const result = (t) => (t.result === "tp" ? `止盈 +${t.r}R` : "停損 −1R");
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

  for (const s of SEGMENTS) {
    const li = el("li", "case-item");
    li.setAttribute("data-reveal", "");
    const card = el("button", "case-card mb-spot");
    card.type = "button";
    card.setAttribute("aria-label", `播放 ${s.range} ${s.rule}：${s.trades.length} 筆，含 ${s.stops} 筆停損`);
    const media = el("span", "case-media");
    const img = el("img");
    img.src = `${MEDIA_BASE}segment-${s.id}.webp`;
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
    body.append(el("span", "case-meta mb-mono", `${s.range} · ${s.rule}`), el("strong", "case-tag", s.title));
    const count = el("span", "case-result");
    count.append(el("b", "mb-num", String(s.trades.length)), el("span", null, `筆 · 含 ${s.stops} 筆停損`));
    body.append(count);
    card.append(media, body);
    li.append(card);
    wall.append(li);

    card.addEventListener("click", () => open(s));
    if (hoverPreview) {
      card.addEventListener("pointerenter", () => {
        if (motionOff()) return;
        if (!video.src) video.src = `${MEDIA_BASE}segment-${s.id}.mp4`;
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
  const q = (sel) => dialog.querySelector(sel);
  function open(s) {
    q("[data-case-kicker]").textContent = `${s.range} · ${s.rule} · 這段的每一筆`;
    q("[data-case-title]").textContent = s.title;
    const outcome = q("[data-case-outcome]");
    outcome.replaceChildren(el("b", "mb-num", String(s.trades.length)), document.createTextNode(` 筆，含 ${s.stops} 筆停損`));
    q("[data-case-rule]").textContent = s.ruleLine;
    const list = q("[data-case-trades]");
    // Each trade opens its own 1-minute footprint short (motion/replays/trade-shorts); "回到整段"
    // goes back to the stretch's film.
    const whole = q("[data-case-whole]");
    const play = (name, li) => {
      for (const x of list.children) x.classList.toggle("is-playing", x === li);
      whole.hidden = !li;
      player.poster = `${MEDIA_BASE}${name}.webp`;
      player.src = `${MEDIA_BASE}${name}.mp4`;
      player.play().catch(() => {});
    };
    list.replaceChildren(
      ...s.trades.map((t, k) => {
        const li = el("li", t.result === "tp" ? "tp" : "stop");
        const btn = el("button");
        btn.type = "button";
        btn.setAttribute("aria-label", `播放第 ${k + 1} 筆的 1 分足跡：${t.at} ${t.why}，${result(t)}`);
        btn.append(el("time", "mb-mono", t.at), el("span", null, t.why), el("b", "mb-num", result(t)));
        btn.addEventListener("click", () => play(`trade-${s.id}-${k + 1}`, li));
        li.append(btn);
        return li;
      }),
    );
    whole.onclick = () => play(`segment-${s.id}`, null);
    play(`segment-${s.id}`, null);
    dialog.showModal();
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
