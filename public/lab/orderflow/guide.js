// First-visit guide for the lab: five short steps that point at the chart, the narration rail,
// the chart switch, the indicator menu and the links to the academy and alerts. Each step lights its
// target and dims the rest; it shows once per browser and can be reopened from the footer.

const SEEN_KEY = "mb-lab-guide-v1";

export const GUIDE_STEPS = [
  {
    target: ".stage",
    title: "這張圖在看什麼",
    body: "每根 K 棒是一段時間的成交。圓形泡泡是大單（綠色主動買、橘色主動賣，越大量越多）。右邊價格軸上的青色、橘色條是估算的清算價位：上方是空單、下方是多單。左上角列出主圖指標和數值，滑過去可以隱藏或設定。",
  },
  {
    target: "#narration",
    title: "盤面旁白",
    body: "旁邊（手機在下方）用白話寫出剛才在關鍵位發生了什麼。點開一張卡片，圖表會移到那一段並把它亮起來，也可以看動畫解說或設成提醒。",
  },
  {
    target: '.seg[aria-label="圖表"]',
    title: "K 線與足跡",
    body: "切到「足跡」再放大，就能看到每個價位的主動賣（左）與主動買（右）。亮色數字是一邊壓過另一邊三倍以上的不平衡。",
  },
  {
    target: ".ind",
    title: "指標",
    body: "一開始只放 K 線、大單、關鍵位和 CVD。成交量分布、熱力圖、OI 等都在「指標」裡個別開關，大單門檻也在這裡調，設定會記在這個瀏覽器。",
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
  // A frame around the step's target whose shadow dims the rest of the page.
  const spot = document.createElement("div");
  spot.className = "guide-spot";
  spot.setAttribute("aria-hidden", "true");
  document.body.append(spot, card);
  let at = 0;
  let target = null;

  const place = () => {
    const r = target && !target.closest("[hidden]") ? target.getBoundingClientRect() : null;
    if (!r || !r.width || !r.height) {
      // Nothing to point at (a hidden rail): dim everything.
      for (const [k, v] of [["top", "50%"], ["left", "50%"], ["width", "0px"], ["height", "0px"]]) spot.style.setProperty(k, v);
      spot.classList.add("is-empty");
      return;
    }
    spot.classList.remove("is-empty");
    // Kept on screen: a tall rail's frame stops at the viewport edges.
    const top = Math.max(2, r.top - 4);
    const left = Math.max(2, r.left - 4);
    const bottom = Math.min(innerHeight - 2, r.bottom + 4);
    const right = Math.min(innerWidth - 2, r.right + 4);
    spot.style.setProperty("top", `${top}px`);
    spot.style.setProperty("left", `${left}px`);
    spot.style.setProperty("width", `${Math.max(0, right - left)}px`);
    spot.style.setProperty("height", `${Math.max(0, bottom - top)}px`);
  };

  const show = (i) => {
    at = i;
    const step = GUIDE_STEPS[i];
    target = document.querySelector(step.target);
    // The tool row scrolls sideways on phones: center the step's control in it, without moving
    // the page (scrollIntoView used to push the whole page down and cut off the rail's top).
    const row = target?.closest(".tools");
    if (row && target) {
      const t = target.getBoundingClientRect();
      const box = row.getBoundingClientRect();
      row.scrollLeft += t.left + t.width / 2 - (box.left + box.width / 2);
    }
    place();
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
    card.remove();
    spot.remove();
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
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
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
  open = { close };
  show(0);
}
