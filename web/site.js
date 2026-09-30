import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { initAll, motionOff } from "../public/mb.js";
import { drawMarket } from "./market-snapshot.js";
import { markets } from "./market-data.js";

gsap.registerPlugin(ScrollTrigger);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;

initAll();

// ---------------- motion preference ----------------
const listeners = new Set();
const onMotion = (fn) => listeners.add(fn);
function setMotion(on) {
  root.classList.toggle("motion-off", !on);
  try {
    localStorage.setItem("metabear-motion", on ? "on" : "off");
  } catch {
    /* storage may be unavailable */
  }
  syncMotionButton();
  listeners.forEach((fn) => fn(!motionOff()));
}
function syncMotionButton() {
  const b = $("#motion-toggle");
  if (!b) return;
  const off = motionOff();
  b.setAttribute("aria-pressed", String(off));
  b.textContent = off ? "▷ 啟用動態" : "Ⅱ 暫停動態";
}
$("#motion-toggle")?.addEventListener("click", () => setMotion(motionOff()));
syncMotionButton();

// ---------------- hero ----------------
const hero = $(".hero");
function splitChars(el) {
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const ch of child.textContent) {
          const s = document.createElement("span");
          s.className = node.classList?.contains("t-grad") ? "ch t-grad" : "ch";
          s.textContent = ch;
          frag.append(s);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === 1) walk(child);
    }
  };
  walk(el);
  return $$(".ch", el);
}
const title = $(".hero-title");
const spoken = Object.assign(document.createElement("span"), {
  className: "sr-only",
  textContent: title.textContent.trim(),
});
$$(".line", title).forEach((l) => l.setAttribute("aria-hidden", "true"));
title.prepend(spoken);
const chars = $$("[data-split]", hero).flatMap(splitChars);
if (motionOff()) hero.classList.add("is-in");
else {
  gsap.from(chars, {
    yPercent: 115,
    rotate: 8,
    opacity: 0,
    duration: 1.1,
    ease: "expo.out",
    stagger: 0.045,
    delay: 0.15,
    onStart: () => hero.classList.add("is-in"),
  });
}
const btc = markets.btc;
const quote = $("[data-hero-quote] strong");
if (quote) quote.textContent = "$" + btc.price.toLocaleString("en-US", { minimumFractionDigits: 2 });
$("[data-hero-quote] small").textContent = `${btc.quoteDate} 快照 · 非即時行情`;

// Three.js liquidity field (its own chunk; skipped without WebGL).
const heroCanvas = $(".hero-canvas");
function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
let field = null;
if (heroCanvas && webglOK() && !navigator.connection?.saveData) {
  import("./hero-field.js").then(({ mountHeroField }) => {
    field = mountHeroField(heroCanvas, { small: innerWidth < 760, still: motionOff() });
    requestAnimationFrame(() => hero.classList.add("webgl-ready"));
    ScrollTrigger.create({
      trigger: hero,
      start: "top top",
      end: "bottom top",
      onUpdate: (self) => field.setScroll(self.progress),
    });
    onMotion((on) => field.setStill(!on));
  });
}
if (!motionOff())
  gsap.to(".hero-copy", {
    yPercent: -18,
    opacity: 0.2,
    ease: "none",
    scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
  });

// ---------------- ticker ----------------
const ticker = $("[data-ticker]");
if (ticker) {
  const items = Object.values(markets).map((m) => {
    const first = m.candles[0][1];
    const last = m.candles.at(-1)[4];
    const ch = ((last - first) / first) * 100;
    const span = document.createElement("span");
    const b = document.createElement("b");
    b.textContent = m.price.toLocaleString("en-US", { minimumFractionDigits: 2 });
    const c = document.createElement("em");
    c.className = ch >= 0 ? "up" : "down";
    c.textContent = `${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(1)}% · 10日`;
    span.append(m.name + " ", b, " ", c);
    return span;
  });
  ticker.prepend(...items);
  // Duplicate once for a seamless loop.
  for (const s of [...ticker.children]) {
    const copy = s.cloneNode(true);
    copy.setAttribute("aria-hidden", "true");
    ticker.append(copy);
  }
}

// ---------------- academy showcase ----------------
const showcase = $("[data-showcase]");
if (showcase) {
  const canvas = $("[data-screen-canvas]", showcase);
  const features = $$("[data-feature]", showcase);
  const bar = $("[data-screen-progress]", showcase);
  let preview = null;
  let catalog = null;
  let index = 0;
  let inView = false;
  let cycling = false;
  let manual = false;

  const setActive = (i) => {
    features.forEach((f, j) => {
      f.classList.toggle("is-active", j === i);
      $(".feature-bar i", f).style.transform = "scaleX(0)";
    });
    const f = features[i];
    const c = catalog?.courses.find((x) => x.id === f.dataset.feature);
    if (c) {
      $("[data-screen-title]").textContent = c.title;
      $("[data-screen-sub]").textContent = c.description;
      $("[data-screen-kicker]").textContent =
        `${catalog.kinds[c.kind].code} ${c.number} · ${catalog.kinds[c.kind].label}`;
    }
    $("[data-screen-link]").href = f.getAttribute("href");
  };
  const progress = (p) => {
    bar.style.transform = `scaleX(${p})`;
    $(".feature-bar i", features[index]).style.transform = `scaleX(${p})`;
  };
  async function cycle() {
    if (cycling) return;
    cycling = true;
    while (inView && !motionOff()) {
      const f = features[index];
      setActive(index);
      const done = await preview.play(f.dataset.feature, Number(f.dataset.from), Number(f.dataset.to), {
        onTick: progress,
      });
      if (!done) break;
      if (!manual) index = (index + 1) % features.length;
      manual = false;
    }
    cycling = false;
  }
  async function still() {
    preview.stop();
    const f = features[index];
    setActive(index);
    const { posterTime } = await import("/orderflow/motion/preview.js");
    const lesson = await preview.show(f.dataset.feature, 0);
    await preview.show(f.dataset.feature, posterTime(lesson));
    progress(0);
  }
  const boot = async () => {
    const [mod, cat] = await Promise.all([
      import("/orderflow/motion/preview.js"),
      import("/orderflow/academy-catalog.js"),
    ]);
    catalog = cat;
    preview = mod.createPreview(canvas, { width: Math.min(1280, canvas.clientWidth * Math.min(devicePixelRatio, 2)) });
    await mod.loadLesson(features[0].dataset.feature);
    showcase.classList.add("ready");
    motionOff() ? still() : cycle();
    features.forEach((f, i) => {
      f.addEventListener("pointerenter", (e) => {
        if (e.pointerType !== "mouse" || i === index) return;
        index = i;
        manual = true;
        preview.stop();
        cycling = false;
        motionOff() ? still() : cycle();
      });
    });
    onMotion((on) => (on ? cycle() : still()));
  };
  let booted = false;
  new IntersectionObserver(
    ([e]) => {
      inView = e.isIntersecting;
      if (inView && !booted) {
        booted = true;
        boot();
      } else if (inView && preview && !motionOff()) cycle();
      else if (!inView && preview) preview.stop();
    },
    { rootMargin: "200px 0px" },
  ).observe(showcase);
}

// Count-up stats.
$$("[data-count]").forEach((el) => {
  const to = Number(el.dataset.count);
  if (motionOff()) return;
  const o = { v: 0 };
  el.textContent = "0";
  ScrollTrigger.create({
    trigger: el,
    start: "top 90%",
    once: true,
    onEnter: () =>
      gsap.to(o, {
        v: to,
        duration: 1.6,
        ease: "power3.out",
        onUpdate: () => (el.textContent = String(Math.round(o.v))),
      }),
  });
});

// ---------------- start: horizontal pinned track on desktop ----------------
const mm = gsap.matchMedia();
mm.add("(min-width: 1100px)", () => {
  if (motionOff()) return;
  const section = $(".start");
  const track = $("[data-start-track]");
  section.classList.add("is-pinned");
  const distance = () => Math.max(0, track.scrollWidth - innerWidth);
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: ".start-pin",
      start: "top top",
      end: () => "+=" + distance(),
      pin: true,
      scrub: 0.8,
      invalidateOnRefresh: true,
    },
  });
  tl.to(track, { x: () => -distance(), ease: "none" }, 0).fromTo(
    "[data-start-progress]",
    { scaleX: 0.33 },
    { scaleX: 1, ease: "none" },
    0,
  );
  return () => section.classList.remove("is-pinned");
});
onMotion(() => ScrollTrigger.refresh());

// ---------------- market snapshot ----------------
const marketCard = $(".market-card");
function showMarket(key) {
  drawMarket(key);
  $$(".market-candle", marketCard).forEach((g, i) => g.style.setProperty("--i", String(i)));
  marketCard.classList.remove("drawing");
  void marketCard.offsetWidth;
  if (!motionOff()) marketCard.classList.add("drawing");
}
$$("[data-market]").forEach((b) => b.addEventListener("click", () => showMarket(b.dataset.market)));
showMarket("btc");

// ---------------- risk lab ----------------
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
    Math.abs(v).toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $("#leverage-value").textContent = leverage + "×";
  $("#change-value").textContent = (change < 0 ? "−" : change > 0 ? "+" : "") + Math.abs(change) + "%";
  $("#pnl").replaceChildren(
    document.createTextNode(sign(pnl) + " "),
    Object.assign(document.createElement("span"), { textContent: "USDT" }),
  );
  $("#pnl").className = pnl < 0 ? "negative" : "positive";
  $("#notional").textContent = notional.toLocaleString("zh-TW") + " USDT";
  $("#roi").textContent = sign(roi) + "%";
  $("#direction-label").textContent = direction === 1 ? "做多 / LONG" : "做空 / SHORT";
  $("#calculation").textContent =
    `${margin.toLocaleString("zh-TW")} USDT × ${leverage} 倍 × ${change}%${direction < 0 ? " × (−1)" : ""} = ${sign(pnl)} USDT`;
  $("#lab-explanation").textContent =
    pnl <= -margin
      ? "此簡化虧損已達或超過保證金；實際交易可能更早觸發強平。"
      : `${direction === 1 ? "做多時價格上漲獲利、下跌虧損。" : "做空時價格下跌獲利、上漲虧損。"}相同保證金下，提高槓桿會增加名義倉位。`;
  $("[data-margin-bar]").style.transform = `scaleX(${1 / leverage})`;
  $("[data-notional-bar]").style.transform = "scaleX(1)";
}
form.addEventListener("submit", (e) => e.preventDefault());
form.addEventListener("input", updateRisk);
$$("[data-direction]").forEach((b) =>
  b.addEventListener("click", () => {
    direction = b.dataset.direction === "long" ? 1 : -1;
    $$("[data-direction]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    updateRisk();
  }),
);
updateRisk();

// ---------------- ask: chat plays in when seen ----------------
const phone = $("[data-phone]");
if (phone)
  new IntersectionObserver(
    ([e], io) => {
      if (e.isIntersecting) {
        phone.classList.add("is-in");
        io.disconnect();
      }
    },
    { threshold: 0.35 },
  ).observe(phone);

// The floating LINE button steps aside over the footer and the hero CTAs.
const float = $(".line-float");
const hideFloat = new Set();
const floatIO = new IntersectionObserver((entries) => {
  for (const e of entries) e.isIntersecting ? hideFloat.add(e.target) : hideFloat.delete(e.target);
  float.classList.toggle("is-hidden", hideFloat.size > 0);
});
[$(".mb-footer"), $(".hero-actions")].forEach((el) => el && floatIO.observe(el));

addEventListener("load", () => ScrollTrigger.refresh());
document.fonts?.ready.then(() => ScrollTrigger.refresh());
