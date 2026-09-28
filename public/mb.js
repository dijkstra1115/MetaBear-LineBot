// Shared behaviour for the MetaBear design system: header, mobile menu,
// scroll reveals, cursor spotlights and toasts. Plain ES module, no deps.
const doc = document;

export const motionOff = () =>
  doc.documentElement.classList.contains("motion-off") || matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initHeader() {
  const header = doc.querySelector("[data-header]");
  if (!header) return;
  const menu = header.querySelector(".mb-menu");
  let lastY = scrollY;
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = scrollY;
    header.classList.toggle("is-solid", y > 24);
    const open = header.classList.contains("menu-open");
    if (!open) header.classList.toggle("is-hidden", y > 320 && y > lastY + 4);
    if (y < lastY - 4 || y < 320) header.classList.remove("is-hidden");
    lastY = y;
  };
  addEventListener(
    "scroll",
    () => {
      if (!ticking) (requestAnimationFrame(update), (ticking = true));
    },
    { passive: true },
  );
  update();
  if (!menu) return;
  const setMenu = (open) => {
    header.classList.toggle("menu-open", open);
    menu.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-label", open ? "關閉選單" : "開啟選單");
    doc.documentElement.style.overflow = open ? "hidden" : "";
  };
  menu.addEventListener("click", () => setMenu(!header.classList.contains("menu-open")));
  header.querySelectorAll(".mb-nav a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && header.classList.contains("menu-open")) {
      setMenu(false);
      menu.focus();
    }
  });
  matchMedia("(min-width: 861px)").addEventListener("change", (e) => e.matches && setMenu(false));
}

export function initReveal(root = doc) {
  const items = [...root.querySelectorAll("[data-reveal]:not(.is-in)")];
  if (!items.length) return;
  if (!("IntersectionObserver" in window)) return items.forEach((el) => el.classList.add("is-in"));
  // Stagger siblings that enter together.
  const io = new IntersectionObserver(
    (entries) => {
      let n = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.style.setProperty("--i", String(n++));
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );
  items.forEach((el) => io.observe(el));
}

export function initSpotlight(root = doc) {
  if (!matchMedia("(pointer: fine)").matches) return;
  root.addEventListener(
    "pointermove",
    (e) => {
      const el = e.target.closest?.(".mb-spot");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    },
    { passive: true },
  );
}

let toastTimer;
export function toast(text) {
  const el = doc.querySelector(".mb-toast");
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

export function initCopyCode() {
  doc.querySelectorAll("[data-copy-code]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText("ZD0CQ0");
        toast("已複製邀請碼 ZD0CQ0");
      } catch {
        toast("邀請碼：ZD0CQ0，請手動複製。");
      }
    }),
  );
}

export function initAll() {
  initHeader();
  initReveal();
  initSpotlight();
  initCopyCode();
}
