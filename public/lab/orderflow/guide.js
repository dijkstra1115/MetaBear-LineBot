// First-visit guide for the lab: four short steps that point at the chart, the chart switch,
// the indicator menu and the links to the academy and alerts. It never blocks the chart, shows
// once per browser, and can be reopened from the footer.

const SEEN_KEY = "mb-lab-guide-v1";

export const GUIDE_STEPS = [
  {
    target: ".stage",
    title: "這張圖在看什麼",
    body: "每根 K 棒是一段時間的成交。圓形泡泡是大單（綠色主動買、橘色主動賣，越大量越多），三角形是爆倉。下方副圖依序是 CVD、未平倉量 OI 與多空比。",
  },
  {
    target: '.seg[aria-label="圖表"]',
    title: "K 線與足跡",
    body: "切到「足跡」再放大，就能看到每個價位的主動賣（左）與主動買（右）。亮色數字是一邊壓過另一邊三倍以上的不平衡。",
  },
  {
    target: "details.ind",
    title: "指標可以一個個開關",
    body: "畫面太滿就先關掉看不懂的，從成交量分布和大單泡泡開始。設定會記在這個瀏覽器。",
  },
  {
    target: ".site-links",
    title: "先學，再看盤",
    body: "每個指標在學院都有一堂幾十秒的動畫課。想在價格到關鍵位、出現吸收或掃蕩時收到通知，可以訂閱提醒。提醒描述發生了什麼，不是買賣訊號。",
    links: [
      ["/orderflow/", "去學院"],
      ["/alerts/", "訂閱提醒"],
    ],
  },
];

// Replays and screen recordings never show it; otherwise only until the visitor finishes or skips it.
export function shouldShowGuide({ seen, replay, rec }) {
  return !seen && !replay && !rec;
}

function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private mode: the guide may show again next visit.
  }
}

export function maybeStartGuide({ replay = false, rec = false } = {}) {
  if (shouldShowGuide({ seen: readSeen(), replay, rec })) startGuide();
}

let open = null;

export function startGuide() {
  open?.close();
  const card = document.createElement("section");
  card.className = "guide";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-labelledby", "guide-title");
  card.innerHTML = `
    <p class="guide-count"></p>
    <h2 id="guide-title"></h2>
    <p class="guide-body"></p>
    <p class="guide-links"></p>
    <div class="guide-actions">
      <button type="button" data-guide="skip">略過</button>
      <span></span>
      <button type="button" data-guide="prev">上一步</button>
      <button type="button" data-guide="next">下一步</button>
    </div>`;
  document.body.append(card);
  let at = 0;
  let target = null;

  const show = (i) => {
    at = i;
    const step = GUIDE_STEPS[i];
    target?.classList.remove("guide-target");
    target = document.querySelector(step.target);
    target?.classList.add("guide-target");
    // The tool row scrolls sideways on phones; bring the step's control into view.
    target?.scrollIntoView?.({ block: "nearest", inline: "center" });
    card.querySelector(".guide-count").textContent = `${i + 1} / ${GUIDE_STEPS.length}`;
    card.querySelector("h2").textContent = step.title;
    card.querySelector(".guide-body").textContent = step.body;
    const links = card.querySelector(".guide-links");
    links.replaceChildren(
      ...(step.links ?? []).map(([href, label]) => {
        const a = document.createElement("a");
        a.href = href;
        a.textContent = label + " ↗";
        a.addEventListener("click", markSeen);
        return a;
      }),
    );
    links.hidden = !step.links;
    card.querySelector('[data-guide="prev"]').hidden = i === 0;
    const next = card.querySelector('[data-guide="next"]');
    next.textContent = i === GUIDE_STEPS.length - 1 ? "開始看盤" : "下一步";
    next.focus({ preventScroll: true });
  };

  const close = () => {
    target?.classList.remove("guide-target");
    card.remove();
    document.removeEventListener("keydown", onKey);
    markSeen();
    open = null;
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };

  card.addEventListener("click", (e) => {
    const action = e.target.closest("[data-guide]")?.dataset.guide;
    if (action === "skip") close();
    else if (action === "prev") show(Math.max(0, at - 1));
    else if (action === "next") at === GUIDE_STEPS.length - 1 ? close() : show(at + 1);
  });
  document.addEventListener("keydown", onKey);
  open = { close };
  show(0);
}
