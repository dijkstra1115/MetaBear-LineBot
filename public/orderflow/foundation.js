import { FoundationLesson } from "./foundation-model.js";
import { GuidedLesson } from "./guided-model.js";
import { curriculum, courseById } from "./curriculum.js";
import {
  drawGuidedScene,
  drawGuidedTraveler,
  drawGuidedTransition,
  prepareGuidedViewTransition,
} from "./guided-charts.js";
import {
  lessonShell,
  matchingQuiz,
  completedCourses,
  recordCompletion,
} from "./lesson-shell.js";

const matchingSteps = [
  {
    chapter: 0,
    title: "先有願意等待的人。",
    copy: "Maker 先說好價格，把訂單掛著等。有人想在 110 賣，也有人想在 99 買；還沒成交，價格就不會因此改變。",
    action: "在 101 掛一筆賣單",
    role: "這一次，你是 Maker",
    hint: "限價賣出 1 單位，等待別人來買。",
    caption: "100 上的淡線就是這根 K 線的起點，也是目前的成交價。",
    camera: "全景 · 看見等待中的掛單",
  },
  {
    chapter: 1,
    title: "有人等待，也有人想立刻成交。",
    copy: "你在 101 掛好了賣單，最新成交價仍是 100。現在換個角色：Taker 不等，把市價買單交給市場，先找最便宜的賣方。",
    action: "市價買入 1 單位",
    role: "這一次，你是 Taker",
    hint: "主動買入，找最低價的 Maker 賣單。",
    caption: "多了一張 101 的掛單，但還沒有新成交。",
    camera: "全景 · 掛單不等於成交",
  },
  {
    chapter: 2,
    title: "只再買 1 單位，會走多遠？",
    copy: "剛才的買單在 101 成交，那張賣單已經用完。102 到 109 沒有任何賣單，下一個願意賣的人，等在 110。",
    action: "再市價買入 1 單位",
    role: "再送一筆 Taker 買單",
    hint: "數量一樣。先猜猜，下一筆會成交在哪裡？",
    caption: "101 已成交。中間沒有賣單，下一張在 110。",
    camera: "全景 · 找找下一個賣方",
  },
  {
    chapter: 2,
    title: "價格跳上去，不需要很多買單。",
    copy: "只有 1 單位的主動買單，直接在 110 找到 Maker。102 到 109 沒有成交；K 線只是把這段期間的起點與高點連起來。",
    action: "換成 Taker 賣出",
    role: "接下來，換個方向想",
    hint: "先拉遠鏡頭，看看願意買的人在哪裡。",
    caption: "成交 1 單位，101 → 110。空價位直接跳過。",
    camera: "放大 · 110 的成交現場",
  },
  {
    chapter: 3,
    title: "現在，有人想立刻賣出。",
    copy: "主動賣單要找 Maker 買方。100 到 109 都沒有人掛買單，最高的買價只在 99。這筆賣單會回到那裡成交。",
    action: "市價賣出 1 單位",
    role: "這一次，你是賣方 Taker",
    hint: "主動賣出，找最高價的 Maker 買單。",
    caption: "賣方 Taker 出現，先找願意接手的 Maker。",
    camera: "拉遠 · 從高點回看買方",
  },
  {
    chapter: 3,
    title: "一筆賣出，留下長長的上影線。",
    copy: "賣單在 99 成交，最新成交價回到 99。但這段時間確實成交過 110，所以 K 線保留最高點，留下長上影線。",
    action: "看完整的這根 K 線",
    role: "把成交與 K 線對起來",
    hint: "拉遠鏡頭，回看剛才的三筆主動訂單。",
    caption: "成交 1 單位，110 → 99。高點留下，收盤回落。",
    camera: "放大 · 99 的成交現場",
  },
  {
    chapter: 3,
    title: "你看到的是價格走過的路。",
    copy: "兩筆主動買入、一筆主動賣出，每筆都只有 1 單位。掛單之間的空缺，讓少量成交也能留下很長的上影線。",
    action: "再操作一次",
    role: "Maker 等待，Taker 主動成交",
    hint: "每筆成交都有買方和賣方；主動的一方決定吃哪一側掛單。",
    caption: "同一段時間：起點 100 → 買到 101 → 買到 110 → 賣到 99。",
    camera: "全景 · 一根 K 線的形成",
  },
];
const cameras = {
  wide: [0, 0, 640, 370],
  // Keep the candle and the matched order together in the shared price space.
  high: [75, -20, 540, 312.1875],
  low: [75, 25, 540, 312.1875],
};
const y = (price) => 53 + (110 - price) * 23;
const mix = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function mountFoundation(root, requestedId) {
  const course = courseById(requestedId);
  const matching = course.id === "matching";
  const steps = matching ? matchingSteps : course.steps;
  const quiz = course.quiz || matchingQuiz;
  const createLesson = () =>
    matching ? new FoundationLesson() : new GuidedLesson(course);
  root.className = "foundation";
  root.dataset.course = course.id;
  root.innerHTML = lessonShell(course, matching);
  document.title = course.short + " · MetaBear 訂單流學院";
  const $ = (id) => root.querySelector(`#${id}`);
  let lesson = createLesson();
  let busy = false,
    paused = false,
    revision = 0;
  let camera = [...cameras.wide];
  let quizOpen = false;
  let predictionIndex = null;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const compact = matchMedia("(max-width: 999px)");

  function setCamera(next) {
    camera = next;
    $("f-book").setAttribute("viewBox", next.join(" "));
    $("f-zoom-badge").textContent =
      `${(640 / next[2]).toFixed(1).replace(".0", "")}×`;
  }

  function drawBook(snapshot) {
    const { step, asks, bids, price } = snapshot;
    const book = [
      ...asks.map((order) => ({ ...order, side: "sell" })),
      ...bids.map((order) => ({ ...order, side: "buy" })),
    ];
    const lines = Array.from({ length: 12 }, (_, i) => 110 - i)
      .map(
        (p) => `
      <g class="f-price-row"><line x1="57" y1="${y(p)}" x2="606" y2="${y(p)}"/><text x="39" y="${y(p) + 4}" text-anchor="end">${p}</text></g>`,
      )
      .join("");
    const cards = book
      .map(
        (order) =>
          `<g class="f-maker-order" transform="translate(363 ${y(order.price) - 18})"><rect width="236" height="36" rx="9"/><circle cx="20" cy="18" r="10"/><text class="f-maker-letter" x="20" y="22" text-anchor="middle">M</text><text x="38" y="23">${compact.matches ? "" : "Maker "}${order.side === "sell" ? "賣" : "買"}方</text><text class="f-order-qty" x="219" y="23" text-anchor="end">${order.price} · ${order.size} 單位</text></g>`,
      )
      .join("");
    const gap =
      step >= 2 && step <= 4
        ? `<g class="f-gap"><path d="M 459 ${y(109)} h 8 V ${y(step === 4 ? 100 : 102)} h -8"/><text x="488" y="${y(106) - 5}">${step === 4 ? "沒有買單" : "沒有賣單"}</text><text class="f-gap-small" x="488" y="${y(106) + 15}">跳過，不成交</text></g>`
        : "";
    const lastFill =
      step >= 2
        ? `<g class="f-fill-marker"><circle cx="352" cy="${y(price)}" r="5"/><text x="333" y="${y(price) - 11}" text-anchor="end">${step === 4 ? "上一筆成交" : "成交 1 單位"}</text></g><g class="f-maker-order f-filled-order" transform="translate(363 ${y(price) - 18})"><rect width="236" height="36" rx="9"/><text x="15" y="23">${compact.matches ? "" : "Maker "}${step >= 5 ? "買" : "賣"}方</text><text class="f-order-qty" x="219" y="23" text-anchor="end">${price} · 已成交</text></g>`
        : "";
    $("f-book-world").innerHTML =
      `${lines}<line class="f-last-price-line" x1="58" x2="608" y1="${y(price)}" y2="${y(price)}"/>${gap}${cards}${lastFill}`;
    $("f-book-desc").textContent =
      `最新成交價 ${price}。${asks.length ? asks.map((o) => `${o.price} 有 Maker 賣單 ${o.size} 單位`).join("；") : "沒有剩餘賣單"}。${bids.length ? bids.map((o) => `${o.price} 有 Maker 買單 ${o.size} 單位`).join("；") : "沒有剩餘買單"}。`;
    $("f-traveler").innerHTML = "";
    if (step === 4) drawTraveler("sell", 165, y(110));
  }

  function drawTraveler(side, x, py) {
    $("f-traveler").innerHTML =
      `<g class="f-taker-order ${side === "sell" ? "f-selling" : ""}" transform="translate(${x} ${py - 19})"><rect width="172" height="38" rx="19"/><circle cx="21" cy="19" r="11"/><text class="f-taker-letter" x="21" y="24" text-anchor="middle">T</text><text x="40" y="24">${compact.matches ? "" : "Taker "}${side === "buy" ? "買入" : "賣出"} 1 單位</text></g>`;
  }

  function drawCandle(snapshot) {
    const { open, high, low, close } = snapshot.candle;
    const top = Math.min(y(open), y(close));
    const down = close < open;
    const flat = high === low;
    const description = `本段 K 線：開 ${open}、高 ${high}、低 ${low}、目前收 ${close}。`;
    $("f-candle").setAttribute("aria-label", description);
    $("f-book-desc").textContent += description;
    $("f-candle").innerHTML = flat
      ? `<line class="f-candle-flat" x1="111" x2="153" y1="${y(open)}" y2="${y(open)}"/><text class="f-candle-label" x="132" y="${y(open) + 35}" text-anchor="middle">行情 ${close}</text>`
      : `<g class="f-candle-shape ${down ? "f-candle-down" : ""}"><line x1="132" x2="132" y1="${y(high)}" y2="${y(low)}"/><rect x="117" y="${top}" width="30" height="${Math.max(2, Math.abs(y(close) - y(open)))}" rx="1"/></g>
          ${snapshot.step >= 5 ? `<path class="f-wick-bracket" d="M 136 ${y(high)} H 165"/><text class="f-candle-label" x="176" y="${y(high) + 5}">最高 ${high}</text><text class="f-wick-label" x="172" y="${y(106)}">上影線</text>` : ""}`;
  }

  function render({ focus = false } = {}) {
    const snapshot = lesson.snapshot();
    const { step } = snapshot;
    const content = steps[step];
    const complete = step === steps.length - 1;
    root.dataset.step = step;
    root.dataset.phase = complete ? "complete" : "demonstration";
    $("f-story-title").textContent = content.title;
    $("f-story-copy").textContent =
      complete && predictionIndex !== null && course.prediction?.feedback
        ? course.prediction.feedback[predictionIndex]
        : content.copy;
    $("f-step-count").textContent =
      `${String(step + 1).padStart(2, "0")} / ${String(steps.length).padStart(2, "0")}`;
    $("f-action").textContent = complete
      ? quizOpen
        ? "重播本課"
        : "進入理解題 ↓"
      : content.action;
    $("f-action").classList.toggle(
      "f-sell-action",
      matching
        ? step === 4
        : course.id !== "confluence" &&
            content.ops.some(
              (op) =>
                (op.type === "trade" && op.side === "sell") ||
                op.type === "liquidate",
            ),
    );
    $("f-action").disabled = busy || (content.prediction && !reflectionReady());
    $("f-role").textContent = complete
      ? "本課演示已完成"
      : content.role ||
        (step === steps.length - 1
          ? "把剛才的觀察，用自己的話說出來"
          : "一次，只觀察一個變化");
    $("f-hint").textContent = complete
      ? "保留最後結果，接著用一道題確認你看懂了什麼。"
      : content.hint ||
        (content.prediction
          ? "先選擇暫時判讀，再用下一筆成交檢驗。"
          : "可以隨時回到上一步，重看發生了什麼。");
    $("f-caption").textContent =
      content.caption || guidedCaption(snapshot, content);
    const relation = ["contracts", "funding", "basis"].includes(content.view);
    $("f-price-label").textContent = relation
      ? content.view === "contracts"
        ? "未平倉量"
        : "示例成交量"
      : "最新成交";
    $("f-price").textContent = relation
      ? content.view === "contracts"
        ? snapshot.oi
        : snapshot.stats.volume
      : snapshot.price;
    $("f-camera-label").textContent = complete
      ? "演示完成 · 保留結果，準備回顧"
      : content.camera ||
        `第 ${step + 1} 幕 · ${content.view === "book" ? "跟著訂單，看見成交" : "把剛才的紀錄攤開"}`;
    $("f-back").disabled = step === 0;
    $("f-taker-key").hidden = matching && step === 0;
    $("f-recap").hidden = !quizOpen;
    $("f-reflection").hidden = !content.prediction;
    $("f-pause").hidden = !busy || motion.matches;
    $("f-scene").setAttribute("aria-busy", String(busy));
    root.querySelectorAll("[data-chapter]").forEach((item) => {
      const index = Number(item.dataset.chapter);
      const chapter =
        content.chapter ??
        Math.min(3, Math.floor((step / (steps.length - 1)) * 3));
      item.classList.toggle("f-done", index < chapter);
      if (index === chapter) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    drawScene(snapshot);
    if (matching && step === steps.length - 1)
      $("f-trade-list").innerHTML = snapshot.trades
        .map(
          (trade, i) =>
            `<li><span>${i === 0 ? "起點" : trade.side === "buy" ? "主動買" : "主動賣"}</span><strong>${trade.price}</strong><small>${trade.size} 單位</small></li>`,
        )
        .join("");
    if (!matching && step === steps.length - 1) {
      const review = $("f-reflection-review");
      review.hidden = !content.prediction && course.id !== "confluence";
      review.replaceChildren();
      if (course.prediction && predictionIndex !== null) {
        const title = document.createElement("strong"),
          paragraph = document.createElement("p");
        title.textContent = "揭露下一筆以前，我選擇的判讀";
        paragraph.textContent = course.prediction.options[predictionIndex];
        review.append(title, paragraph);
      }
    }
    if (focus) {
      const target = content.prediction
        ? root.querySelector("[data-prediction]")
        : $("f-action");
      target?.focus({ preventScroll: true });
    }
  }

  function drawScene(snapshot, content = steps[snapshot.step]) {
    if (matching) {
      drawBook(snapshot);
      drawCandle(snapshot);
    } else drawGuidedScene(root, snapshot, content);
  }
  function reflectionReady() {
    return predictionIndex !== null;
  }
  function guidedCaption(snapshot, content) {
    if (content.view === "absorption")
      return `主動買 ${snapshot.stats.buy} · 主動賣 ${snapshot.stats.sell} · 101 剩餘賣量 ${snapshot.asks.find((r) => r.price === 101)?.size || 0}。`;
    if (content.view === "liquidation")
      return `標記價 ${snapshot.markPrice} 用來看風險；最新成交 ${snapshot.price} 來自實際撮合。`;
    if (content.view === "contracts")
      return "成交量數交換；OI 數尚未結束的合約。";
    if (["funding", "basis"].includes(content.view))
      return "本課付款與參考價格示例，沒有新增主動買賣成交。";
    if (content.view === "comparison")
      return "同樣的下單量，對照不同掛單深度的結果。";
    if (content.view === "heatmap")
      return "每一欄留下當時的掛單；舊紀錄不會被新盤面覆蓋。";
    return `本段已成交 ${snapshot.stats.volume} 單位。${course.includeAnchor ? "包含起始的 100 成交。" : "不含起始的 100 成交。"}`;
  }

  async function advanceGuided() {
    const content = steps[lesson.step];
    if (content.prediction && !reflectionReady()) return;
    busy = true;
    paused = false;
    const token = ++revision;
    const before = lesson.snapshot();
    const preview = lesson.previewNext();
    const nextContent = steps[preview.snapshot.step];
    let displayedContent = content;
    render();
    if (content.prediction || matchMedia("(max-width: 700px)").matches)
      $("f-scene").scrollIntoView({
        block: "start",
        behavior: motion.matches ? "instant" : "smooth",
      });
    // Relations such as OI use their own shared-canvas transition. A reset
    // introduces a new experiment, so never animate across two different books.
    const showFills =
      !["contracts", "funding", "basis"].includes(content.view) &&
      !content.ops.some((op) => op.type === "reset");
    if (showFills && preview.frames.length) {
      let current = before;
      const bookContent = {
        ...content,
        view: ["absorption", "liquidation"].includes(content.view)
          ? content.view
          : "book",
        reveal: undefined,
      };
      if (!(await transitionView(current, content, bookContent, token))) return;
      displayedContent = bookContent;
      drawScene(current, bookContent);
      for (const frame of preview.frames) {
        $("f-action").textContent = frame.fill.liquidationId
          ? `平台正在替 ${frame.fill.liquidationId} 強制賣出…`
          : `正在${frame.fill.side === "buy" ? "買入" : "賣出"}…`;
        $("f-caption").textContent =
          `這 ${frame.fill.size} 單位正在尋找 ${frame.fill.price} 的對手；抵達才成交。`;
        if (
          !(await animate(
            preview.frames.length > 1 ? 950 : 1450,
            (t) => drawGuidedTraveler(root, frame.fill, current.price, t),
            token,
          ))
        )
          return;
        current = frame.snapshot;
        drawScene(current, { ...bookContent, flowProgress: 0 });
        $("f-price").textContent = current.price;
        $("f-caption").textContent =
          `已在 ${frame.fill.price} 成交 ${frame.fill.size} 單位。`;
        if (
          !(await animate(
            bookContent.view === "absorption" ? 550 : 230,
            bookContent.view === "absorption"
              ? (t) => drawScene(current, { ...bookContent, flowProgress: t })
              : () => {},
            token,
          ))
        )
          return;
      }
    } else {
      $("f-action").textContent = "正在揭露變化…";
      const relationAction =
        (content.view === "contracts" && preview.frames.length) ||
        (content.view === "funding" &&
          content.ops.some((op) => op.type === "settle"));
      if (
        (relationAction ||
          (content.view === nextContent.view &&
            content.reveal === nextContent.reveal)) &&
        !(await animate(
          relationAction ? 1450 : 380,
          (t) => drawGuidedTransition(root, before, content, t),
          token,
        ))
      )
        return;
    }
    if (
      !content.ops.some((op) => op.type === "reset") &&
      !(await transitionView(
        preview.snapshot,
        displayedContent,
        nextContent,
        token,
      ))
    )
      return;
    lesson.advance();
    busy = false;
    render({ focus: true });
  }

  async function transitionView(snapshot, from, to, token) {
    const transition = prepareGuidedViewTransition(root, snapshot, from, to);
    if (!transition) return true;
    $("f-action").textContent = transition.zooming
      ? "正在放大成交紀錄…"
      : "正在切換觀察方式…";
    $("f-camera-label").textContent = transition.zooming
      ? "同一段成交 · 沿著價位放大"
      : "保留價格參照 · 展開下一個觀察";
    $("f-caption").textContent =
      to.view === "book"
        ? "保留這根 K 線，回到同一個市場的掛單。"
        : transition.zooming
          ? "K 線與成交紀錄一起放大，仍對齊同一個價格。"
          : "保留 K 線與成交價，慢慢展開剛才的成交紀錄。";
    transition.frame(0);
    return animate(transition.duration, transition.frame, token);
  }

  function animate(duration, frame, token) {
    return new Promise((resolve) => {
      let elapsed = 0,
        last = null;
      function tick(now) {
        if (token !== revision) return resolve(false);
        // Use elapsed time, not frame count: throttled tabs and slower devices
        // should not turn a short matching sequence into a long wait.
        if (last !== null && !paused) elapsed += now - last;
        last = now;
        const progress = motion.matches ? 1 : Math.min(1, elapsed / duration);
        frame(progress);
        if (progress === 1) resolve(true);
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  function cancel() {
    revision++;
    busy = false;
    paused = false;
    $("f-pause").textContent = "暫停動畫";
  }

  function goTo(step) {
    cancel();
    quizOpen = false;
    lesson = createLesson();
    for (let i = 0; i < step; i++) lesson.advance();
    setCamera([
      ...cameras[
        matching && step === 3
          ? "high"
          : matching && step === 5
            ? "low"
            : "wide"
      ],
    ]);
    $("f-feedback").textContent = "";
    $("f-next").hidden = true;
    if (step === 0) {
      predictionIndex = null;
      root
        .querySelectorAll("[data-prediction]")
        .forEach((button) => button.setAttribute("aria-pressed", "false"));
      if ($("f-prediction-status"))
        $("f-prediction-status").textContent =
          "先選一個想法。接下來的成交會幫你檢驗它。";
    }
    root.querySelectorAll("[data-answer]").forEach((button) => {
      button.classList.remove("f-correct", "f-incorrect");
      button.removeAttribute("aria-pressed");
    });
    render({ focus: true });
  }

  $("f-action").addEventListener("click", async () => {
    if (busy) return;
    if (lesson.step === steps.length - 1) {
      if (quizOpen) goTo(0);
      else {
        quizOpen = true;
        render();
        $("f-recap-title").focus({ preventScroll: true });
        $("f-recap").scrollIntoView({
          block: "start",
          behavior: motion.matches ? "instant" : "smooth",
        });
      }
      return;
    }
    if (!matching) {
      await advanceGuided();
      return;
    }
    busy = true;
    paused = false;
    const token = ++revision;
    const step = lesson.step;
    const before = lesson.snapshot();
    const startCamera = [...camera];
    const isTrade = step === 1 || step === 2 || step === 4;
    const targetCamera =
      cameras[step === 2 ? "high" : step === 4 ? "low" : "wide"];
    render();
    if (matchMedia("(max-width: 700px)").matches)
      $("f-scene").scrollIntoView({
        block: "start",
        behavior: motion.matches ? "instant" : "smooth",
      });
    $("f-action").textContent = isTrade
      ? "正在尋找對手掛單…"
      : step === 0
        ? "正在掛單…"
        : "正在拉遠鏡頭…";
    if (isTrade) {
      const side = step === 4 ? "sell" : "buy";
      const targetPrice = (side === "buy" ? before.asks : before.bids)[0].price;
      $("f-camera-label").textContent =
        `跟著 Taker ${side === "buy" ? "往上找賣方" : "往下找買方"}`;
      $("f-caption").textContent = "正在找掛單，還沒成交；最新成交價暫時不變。";
      const success = await animate(
        step === 1 ? 1500 : 2400,
        (t) => {
          const vertical = ease(Math.min(1, t / 0.7));
          const horizontal = ease(Math.max(0, (t - 0.7) / 0.3));
          drawTraveler(
            side,
            mix(160, 366, horizontal),
            mix(y(before.price), y(targetPrice), vertical),
          );
          const cameraTime = ease(Math.max(0, Math.min(1, (t - 0.2) / 0.8)));
          setCamera(
            startCamera.map((value, i) =>
              mix(value, targetCamera[i], cameraTime),
            ),
          );
        },
        token,
      );
      if (!success) return;
    } else {
      const success = await animate(
        step === 0 ? 450 : 1100,
        (t) =>
          setCamera(
            startCamera.map((value, i) => mix(value, targetCamera[i], ease(t))),
          ),
        token,
      );
      if (!success) return;
    }
    lesson.advance();
    busy = false;
    setCamera([...targetCamera]);
    render({ focus: true });
  });
  $("f-back").addEventListener("click", () =>
    goTo(Math.max(0, lesson.step - 1)),
  );
  $("f-reset").addEventListener("click", () => goTo(0));
  $("f-pause").addEventListener("click", () => {
    paused = !paused;
    $("f-pause").textContent = paused ? "繼續動畫" : "暫停動畫";
  });
  root.querySelectorAll("[data-answer]").forEach((button) =>
    button.addEventListener("click", () => {
      const correct = Number(button.dataset.answer) === quiz.answer;
      root.querySelectorAll("[data-answer]").forEach((option) => {
        option.classList.remove("f-correct", "f-incorrect");
        option.setAttribute("aria-pressed", String(option === button));
      });
      button.classList.add(correct ? "f-correct" : "f-incorrect");
      $("f-feedback").textContent = correct
        ? "答對了。" + quiz.why
        : "再想一下：" + quiz.why;
      $("f-next").hidden = !correct;
      if (correct) updateProgress(recordCompletion(course.id));
    }),
  );
  root.querySelectorAll("[data-prediction]").forEach((button) =>
    button.addEventListener("click", () => {
      if (busy) return;
      predictionIndex = Number(button.dataset.prediction);
      root
        .querySelectorAll("[data-prediction]")
        .forEach((option) =>
          option.setAttribute("aria-pressed", String(option === button)),
        );
      $("f-action").disabled = false;
      $("f-prediction-status").textContent =
        "已記下你的判讀。接著觀察下一筆成交，再回來檢驗。";
    }),
  );
  function updateProgress(completed = completedCourses()) {
    $("f-completed-count").textContent =
      `${completed.size} / ${curriculum.length}`;
    root.querySelectorAll("[data-course]").forEach((link) => {
      const done = completed.has(link.dataset.course);
      const status = link.querySelector(".f-course-status");
      status.textContent = done
        ? ""
        : link.dataset.course === course.id
          ? "現在"
          : "";
      status.setAttribute(
        "aria-label",
        done
          ? "已完成"
          : link.dataset.course === course.id
            ? "目前課程"
            : "尚未完成",
      );
      link.parentElement.querySelector("[data-uncomplete]").hidden = !done;
    });
  }
  root.querySelectorAll("[data-uncomplete]").forEach((button) =>
    button.addEventListener("click", () => {
      updateProgress(recordCompletion(button.dataset.uncomplete, false));
      button.parentElement.querySelector("a").focus();
    }),
  );
  let pausedBeforeMap = false;
  const openMap = () => {
    pausedBeforeMap = paused;
    if (busy) paused = true;
    updateProgress();
    $("f-map").showModal();
  };
  $("f-open-map").addEventListener("click", openMap);
  $("f-footer-map").addEventListener("click", openMap);
  $("f-close-map").addEventListener("click", () => $("f-map").close());
  $("f-map").addEventListener("close", () => {
    paused = pausedBeforeMap;
  });
  window.addEventListener("pagehide", cancel);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) goTo(lesson.step);
  });
  compact.addEventListener("change", () => {
    if (!busy) drawScene(lesson.snapshot());
  });
  setCamera([...cameras.wide]);
  updateProgress();
  render();
}
