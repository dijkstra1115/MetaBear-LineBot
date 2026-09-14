export const supportLessonTitle = "支撐與壓力";
export const supportLessonSummary =
  "支撐是價格曾止跌的區域；壓力是價格曾遇到賣壓的區域。點選問題，在同一張 K 線圖上看差別。";
const questions = [
  {
    id: "support",
    title: "支撐在哪裡？",
    text: "價格幾次跌到 98～102 附近後回升，這一帶可視為支撐區。畫一個範圍，比畫一條精準的線更容易理解。",
    next: "resistance",
  },
  {
    id: "resistance",
    title: "壓力在哪裡？",
    text: "價格幾次漲到 118～122 附近後回落，這一帶可視為壓力區。支撐看低點附近，壓力看高點附近。",
    next: "bounce",
  },
  {
    id: "bounce",
    title: "碰到支撐就會漲嗎？",
    text: "這個例子中，價格碰到支撐後反彈。但支撐不是保證，換一種走勢也可能直接跌破。",
    next: "break",
  },
  {
    id: "break",
    title: "如果支撐跌破了呢？",
    text: "同樣的前半段，後面也可能收在支撐區下方。原本的支撐已失守，不能只因「跌到支撐」就認定會反彈。",
    next: "retest",
  },
  {
    id: "retest",
    title: "跌破後，支撐會變壓力嗎？",
    text: "價格回升到原支撐區後又下跌，這是支撐轉為壓力的一種情況。角色可能轉換，但每次回測的結果不一定相同。",
    next: "support",
  },
];
// Illustrative OHLC bars, deliberately unrelated to any actual market or forecast.
const base = [
  [110, 115, 108, 114],
  [114, 116, 103, 105],
  [105, 106, 99, 101],
  [101, 113, 100, 111],
  [111, 121, 110, 119],
  [119, 120, 108, 109],
  [109, 110, 98, 100],
  [100, 114, 99, 112],
  [112, 122, 111, 119],
  [119, 120, 106, 108],
  [108, 110, 101, 103],
  [103, 104, 99, 101],
];
const bounce = [
  [101, 110, 100, 108],
  [108, 116, 107, 114],
  [114, 120, 112, 118],
];
const breakdown = [
  [101, 102, 95, 96],
  [96, 97, 90, 92],
  [92, 96, 91, 95],
];
const retest = [
  [95, 101, 94, 99],
  [99, 102, 95, 96],
  [96, 97, 88, 90],
];
const ns = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, text) {
  const el = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text) el.textContent = text;
  return el;
}
export function renderSupportLesson(params) {
  const q =
    questions.find((q) => q.id === params.get("question")) ?? questions[0];
  const root = document.querySelector("#support-lesson");
  root.replaceChildren();
  const nav = document.createElement("nav");
  nav.className = "sr-questions";
  nav.setAttribute("aria-label", "支撐壓力問題");
  questions.forEach((item) => {
    const a = document.createElement("a");
    a.href =
      "/learn?lesson=" +
      encodeURIComponent(supportLessonTitle) +
      "&question=" +
      item.id;
    a.textContent = item.title;
    a.setAttribute("aria-current", item === q ? "page" : "false");
    nav.append(a);
  });
  const heading = document.createElement("h3");
  heading.textContent = q.title;
  const copy = document.createElement("p");
  copy.className = "sr-explanation";
  copy.textContent = q.text;
  const figure = document.createElement("figure");
  figure.className = "sr-figure";
  const meta = document.createElement("figcaption");
  meta.textContent = "教學示意 · 模擬價格（USD） · 綠漲紅跌";
  const chart = svgEl("svg", {
    viewBox: "0 0 660 310",
    role: "img",
    "aria-label": q.title + " " + q.text,
  });
  const y = (v) => 260 - (v - 85) * 5,
    x = (i) => 28 + i * 29;
  [90, 100, 110, 120, 130].forEach((v) => {
    chart.append(
      svgEl("line", { x1: 15, x2: 580, y1: y(v), y2: y(v), stroke: "#294151" }),
      svgEl(
        "text",
        { x: 600, y: y(v) + 4, fill: "#a8bac8", "font-size": 12 },
        String(v),
      ),
    );
  });
  const showResistance = q.id === "resistance";
  const zone = showResistance ? [118, 122] : [98, 102];
  const color = showResistance || q.id === "retest" ? "#dbb66d" : "#78e1d5";
  const band = svgEl("g", {
    "data-zone": showResistance ? "resistance" : "support",
  });
  band.append(
    svgEl("rect", {
      x: 15,
      y: y(zone[1]),
      width: 565,
      height: y(zone[0]) - y(zone[1]),
      fill: color,
      "fill-opacity": 0.16,
    }),
    svgEl("line", {
      x1: 15,
      x2: 580,
      y1: y(zone[0]),
      y2: y(zone[0]),
      stroke: color,
      "stroke-dasharray": "4 5",
    }),
    svgEl(
      "text",
      { x: 20, y: y(zone[1]) - 8, fill: color, "font-size": 13 },
      q.id === "retest"
        ? "原支撐 → 回測遇壓"
        : showResistance
          ? "壓力區 118–122"
          : "支撐區 98–102",
    ),
  );
  chart.append(band);
  const bars = [
    ...base,
    ...(q.id === "bounce"
      ? bounce
      : ["break", "retest"].includes(q.id)
        ? breakdown
        : []),
    ...(q.id === "retest" ? retest : []),
  ];
  bars.forEach(([o, h, l, c], i) => {
    const color = c >= o ? "#38c99a" : "#ef6b78";
    const g = svgEl("g", { "data-candle": i });
    g.append(
      svgEl("title", {}, `第 ${i + 1} 根：開 ${o}，高 ${h}，低 ${l}，收 ${c}`),
      svgEl("line", {
        x1: x(i),
        x2: x(i),
        y1: y(h),
        y2: y(l),
        stroke: color,
        "stroke-width": 2,
      }),
      svgEl("rect", {
        x: x(i) - 7,
        y: Math.min(y(o), y(c)),
        width: 14,
        height: Math.max(2, Math.abs(y(o) - y(c))),
        fill: color,
      }),
    );
    chart.append(g);
  });
  chart.append(
    svgEl(
      "text",
      { x: 20, y: 294, fill: "#a8bac8", "font-size": 12 },
      "相同的前半段走勢",
    ),
  );
  if (bars.length > base.length)
    chart.append(
      svgEl("line", {
        x1: x(11) + 15,
        x2: x(11) + 15,
        y1: 20,
        y2: 270,
        stroke: "#a8bac8",
        "stroke-dasharray": "3 5",
      }),
      svgEl(
        "text",
        { x: x(12), y: 294, fill: "#a8bac8", "font-size": 12 },
        "其中一種後續",
      ),
    );
  else
    chart.append(
      svgEl(
        "text",
        { x: 410, y: 140, fill: "#a8bac8", "font-size": 13 },
        "後面會怎麼走？",
      ),
    );
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "sr-toggle";
  toggle.setAttribute("aria-pressed", "true");
  const zoneName = showResistance ? "壓力區" : "支撐區";
  toggle.textContent = "隱藏" + zoneName;
  toggle.onclick = () => {
    const visible = toggle.getAttribute("aria-pressed") !== "true";
    toggle.setAttribute("aria-pressed", String(visible));
    band.setAttribute("visibility", visible ? "visible" : "hidden");
    toggle.textContent = (visible ? "隱藏" : "顯示") + zoneName;
  };
  figure.append(meta, chart, toggle);
  const next = document.createElement("a");
  next.className = "sr-followup";
  next.href =
    "/learn?lesson=" +
    encodeURIComponent(supportLessonTitle) +
    "&question=" +
    q.next;
  next.textContent =
    q.id === "retest"
      ? "再看一次：支撐在哪裡？ ↩"
      : questions.find((item) => item.id === q.next).title + " →";
  const note = document.createElement("p");
  note.className = "learn-note";
  note.textContent = "支撐、壓力是觀察區域，不是必然反轉的買賣點。";
  const source = document.createElement("a");
  source.className = "sr-source";
  source.href =
    "https://www.fidelity.com/learning-center/trading-investing/technical-analysis/support-and-resistance";
  source.target = "_blank";
  source.rel = "noreferrer";
  source.textContent = "概念參考：Fidelity 支撐與壓力 ↗";
  root.append(nav, heading, copy, figure, next, note, source);
}
