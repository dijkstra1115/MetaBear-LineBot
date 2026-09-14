import { drawMarket } from "./market-snapshot.js";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);
const $ = (s) => document.querySelector(s);
const reduced = matchMedia("(prefers-reduced-motion: reduce)"),
  mobile = matchMedia("(max-width:760px)"),
  fine = matchMedia("(pointer:fine) and (hover:hover)");
const rig = $(".market-rig"),
  parallax = $(".pointer-rig"),
  panels = [...document.querySelectorAll(".scene-panel")],
  chapters = [...document.querySelectorAll("[data-scene]")],
  rail = [...document.querySelectorAll("[data-rail]")];
let motionPaused = reduced.matches,
  ctx,
  frame = 0,
  active = 0;
const poses = [
  { rotationX: 17, rotationY: -25, rotationZ: 5 },
  { rotationX: 6, rotationY: 12, rotationZ: -3 },
  { rotationX: 10, rotationY: -16, rotationZ: 3 },
  { rotationX: 7, rotationY: 13, rotationZ: -2 },
  { rotationX: 8, rotationY: -13, rotationZ: 2 },
];
const captions = [
  "BTC・ETH・美股行情",
  "邀請碼 ZD0CQ0 · 手續費 25% 返現",
  "台幣入金與信用卡買幣",
  "合約基礎與損益試算",
  "註冊、入金問題，LINE 問我",
];
document
  .querySelectorAll("[data-market]")
  .forEach((b) =>
    b.addEventListener("click", () => drawMarket(b.dataset.market)),
  );
drawMarket("btc");
function panelPose(index, scene) {
  return index === scene
    ? { x: 0, y: 0, z: 135, opacity: 1 }
    : {
        x: (index - scene) * 36,
        y: (index - scene) * 43,
        z: -150 - Math.abs(index - scene) * 110,
        opacity: 0.05,
      };
}
function setScene(scene) {
  gsap.set(rig, poses[scene]);
  panels.forEach((p, i) => gsap.set(p, panelPose(i, scene)));
}
function updateScroll() {
  frame = 0;
  const top = scrollY;
  let next = 0;
  chapters.forEach((section, i) => {
    if (section.getBoundingClientRect().top < innerHeight * 0.48) next = i;
  });
  if (active !== next) {
    active = next;
    rail.forEach((a, i) =>
      i === next
        ? a.setAttribute("aria-current", "location")
        : a.removeAttribute("aria-current"),
    );
    $("[data-scene-caption]").textContent = captions[mobile.matches ? 0 : next];
    if (motionPaused && !mobile.matches) setScene(next);
  }
  $(".reading-meter span").style.transform =
    `scaleX(${top / Math.max(1, document.documentElement.scrollHeight - innerHeight)})`;
  const hidden = $("#lab").getBoundingClientRect().top < innerHeight * 0.25;
  $(".explore-dock").style.opacity = hidden ? "0" : "1";
  $(".explore-dock").inert = hidden;
}
function buildMotion() {
  ctx?.revert();
  const scale = Math.min(
    mobile.matches ? (innerWidth * 0.83) / 600 : (innerWidth * 0.43) / 600,
    1.18,
  );
  gsap.set(rig, { xPercent: -50, yPercent: -50, scale });
  $("#motion-toggle").setAttribute("aria-pressed", String(motionPaused));
  $("#motion-toggle").textContent = motionPaused ? "▷ 啟用動態" : "Ⅱ 暫停動態";
  document.documentElement.classList.toggle("motion-paused", motionPaused);
  gsap.set(parallax, { rotationX: 0, rotationY: 0 });
  if (mobile.matches) {
    setScene(0);
    gsap.set(rig, { rotationX: 11, rotationY: -14, rotationZ: 3 });
    gsap.set(panels[0], { z: 0 });
    $("[data-scene-caption]").textContent = captions[0];
    return;
  }
  if (motionPaused) {
    setScene(active);
    return;
  }
  ctx = gsap.context(() => {
    gsap.set(rig, poses[0]);
    panels.forEach((p, i) =>
      gsap.set(
        p,
        i === 0
          ? { x: 0, y: 0, z: 135, opacity: 1 }
          : {
              x: 30 * i,
              y: 30 * i,
              z: 20 - i * 115,
              opacity: 0.23 - i * 0.025,
            },
      ),
    );
    const total = $(".market-journey").offsetHeight - innerHeight;
    const timeline = gsap.timeline({
      defaults: { ease: "power1.inOut" },
      scrollTrigger: {
        trigger: ".market-journey",
        start: "top top",
        end: "bottom bottom",
        scrub: 0.7,
      },
    });
    timeline.to({}, { duration: total }, 0);
    chapters.slice(1).forEach((section, i) => {
      const scene = i + 1,
        start = Math.max(0, section.offsetTop - innerHeight * 0.73),
        duration = innerHeight * 0.68;
      timeline.to(rig, { ...poses[scene], duration }, start);
      panels.forEach((p, j) =>
        timeline.to(p, { ...panelPose(j, scene), duration }, start),
      );
      timeline.to(
        ".floating-label",
        { opacity: scene === 4 ? 0 : 0.5, duration },
        start,
      );
    });
  });
  ScrollTrigger.refresh();
  updateScroll();
}
const tiltX = gsap.quickTo(parallax, "rotationX", {
    duration: 0.7,
    ease: "power2.out",
  }),
  tiltY = gsap.quickTo(parallax, "rotationY", {
    duration: 0.7,
    ease: "power2.out",
  });
window.addEventListener(
  "pointermove",
  (e) => {
    if (!motionPaused && !mobile.matches && fine.matches) {
      tiltX((e.clientY / innerHeight - 0.5) * -1.8);
      tiltY((e.clientX / innerWidth - 0.5) * 2.8);
    }
  },
  { passive: true },
);
window.addEventListener(
  "scroll",
  () => {
    if (!frame) frame = requestAnimationFrame(updateScroll);
  },
  { passive: true },
);
let resizeTimer;
window.addEventListener(
  "resize",
  () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildMotion, 150);
  },
  { passive: true },
);
reduced.addEventListener("change", () => {
  motionPaused = reduced.matches;
  buildMotion();
});
$("#motion-toggle").addEventListener("click", () => {
  motionPaused = !motionPaused;
  buildMotion();
});
buildMotion();
void document.fonts.ready.then(buildMotion);
let toastTimer;
function toast(text) {
  $(".site-toast").textContent = text;
  $(".site-toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($(".site-toast").hidden = true), 3500);
}
document.querySelectorAll("[data-copy-code]").forEach((b) =>
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText("ZD0CQ0");
      toast("已複製邀請碼 ZD0CQ0");
    } catch {
      toast("邀請碼：ZD0CQ0，請手動複製。");
    }
  }),
);
let direction = 1;
const form = $("#risk-form");
function updateRisk() {
  const margin = Number(form.elements.margin.value),
    leverage = Number(form.elements.leverage.value),
    change = Number(form.elements.change.value);
  if (!form.checkValidity() || !Number.isFinite(margin)) return;
  const notional = margin * leverage,
    pnl = ((notional * change) / 100) * direction,
    roi = (pnl / margin) * 100;
  const sign = (v) =>
    (v < 0 ? "−" : v > 0 ? "+" : "") +
    Math.abs(v).toLocaleString("zh-TW", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  $("#leverage-value").textContent = leverage + "×";
  $("#change-value").textContent =
    (change < 0 ? "−" : change > 0 ? "+" : "") + Math.abs(change) + "%";
  $("#pnl").replaceChildren(
    document.createTextNode(sign(pnl) + " "),
    Object.assign(document.createElement("span"), { textContent: "USDT" }),
  );
  $("#pnl").className = pnl < 0 ? "negative" : "positive";
  $("#notional").textContent = notional.toLocaleString("zh-TW") + " USDT";
  $("#roi").textContent = sign(roi) + "%";
  $("#direction-label").textContent =
    direction === 1 ? "做多 / LONG" : "做空 / SHORT";
  $("#calculation").textContent =
    `${margin.toLocaleString("zh-TW")} USDT × ${leverage} 倍 × ${change}%${direction < 0 ? " × (−1)" : ""} = ${sign(pnl)} USDT`;
  $("#lab-explanation").textContent =
    pnl <= -margin
      ? "此簡化虧損已達或超過保證金；實際交易可能更早觸發強平。"
      : `${direction === 1 ? "做多時價格上漲獲利、下跌虧損。" : "做空時價格下跌獲利、上漲虧損。"}相同保證金下，提高槓桿會增加名義倉位。`;
}
form.addEventListener("submit", (e) => e.preventDefault());
form.addEventListener("input", updateRisk);
document.querySelectorAll("[data-direction]").forEach((b) =>
  b.addEventListener("click", () => {
    direction = b.dataset.direction === "long" ? 1 : -1;
    document
      .querySelectorAll("[data-direction]")
      .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    updateRisk();
  }),
);
updateRisk();
window.addEventListener("pagehide", () => {
  ctx?.revert();
  gsap.killTweensOf(parallax);
  cancelAnimationFrame(frame);
});

window.addEventListener("pageshow", (e) => {
  if (e.persisted) buildMotion();
});
