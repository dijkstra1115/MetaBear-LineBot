// Spotlight walkthrough: the page dims, one block stays lit, and a card beside it explains what the
// block is for. Steps run in order with back, next and skip.
export const TOUR_STEPS = [
  {
    target: ".hud-turn",
    title: "回合制：有時間思考",
    text: "每個回合是 5 分鐘遊戲時間（5 根 1 分 K）。回合之間市場暫停，可以慢慢讀圖、規劃；回合中有大事會自動暫停。",
  },
  {
    target: "#run-button",
    title: "執行與暫停",
    text: "按這顆金色按鈕（或 Space）讓市場跑起來。暫停時下的單不會馬上成交，會先排隊，按執行後在第一秒內和其他人的單一起送出。",
  },
  {
    target: ".chart-wrap",
    title: "K 線與清算熱圖",
    text: "背景的亮帶是第三方估算的強平位置，越亮代表越多槓桿可能在那裡被強平。它是估的，常常不準。拖曳可以平移，滾輪縮放，放大到夠寬時每根 K 旁會出現 Footprint，雙擊回到最新。",
  },
  {
    target: ".indicator-menu",
    title: "指標開關",
    text: "EMA、VWAP、成交量、CVD、OI、Footprint、吸收標記、燃料預兆都可以在這裡個別開關。",
  },
  {
    target: ".fuel-card",
    title: "燃料雷達與 OI",
    text: "上下 3% 內估算的強平量。熱圖會騙人，要對照 OI（真實的未平倉量）和 CVD：放量時 OI 跟著漲，才是真的有人開新倉。",
  },
  {
    target: ".crowd-card",
    title: "市場裡的人群",
    text: "八種策略散戶、造市商和偶爾出現的神秘大戶。知道他們會在哪裡進場、停損設在哪，就能推測燃料藏在哪裡。",
  },
  {
    target: ".order-block",
    title: "下單",
    text: "市價或限價（點圖表就能填入價格）、數量、槓桿、只減倉。你的資金大到可以推動市場，但推得越遠，滑價越大，也可能撞上看不見的掛單。",
  },
  {
    target: ".position-block",
    title: "持倉、平倉與止損止盈",
    text: "這裡看均價、未實現損益和你的強平價。平倉用滑桿選比例；止損和止盈各自可以設定要平掉多少。",
  },
  {
    target: ".account-block",
    title: "帳戶與委託",
    text: "總損益、手續費、最大回撤，以及還在等待的委託（包含暫停時排隊的單），都可以在這裡撤銷。",
  },
  {
    target: ".alert-card",
    title: "戰術暫停",
    text: "每回合結束、大單湧入、連環強平、你的委託有動靜、價格急動、突發事件發生時，市場會自動暫停讓你決定。每一種都可以關掉。",
  },
  {
    target: "#reveal-button",
    title: "揭曉：對答案",
    text: "練習用。按下會暫停，並把真實的強平、止損、止盈位置、盤勢、隱藏情緒和突發事件攤開給你看。先自己推測，再揭曉對答案。",
  },
  {
    target: ".hud",
    title: "開始獵場",
    text: "找出燃料、推過去、引爆它，然後在連環停下前離場。小心你自己的強平價：它也是別人眼中的燃料。",
  },
];

export class Tour {
  constructor(steps = TOUR_STEPS, { onEnd = () => {} } = {}) {
    this.steps = steps;
    this.onEnd = onEnd;
    this.index = 0;
    this.spot = document.createElement("div");
    this.spot.className = "tour-spot";
    this.card = document.createElement("div");
    this.card.className = "tour-card";
    this.card.setAttribute("role", "dialog");
    this.card.setAttribute("aria-live", "polite");
    this.shield = document.createElement("div");
    this.shield.className = "tour-shield";
    this.place = () => this.position();
    this.keys = (event) => {
      if (event.key === "Escape") this.end();
      else if (event.key === "ArrowRight" || event.key === "Enter") this.go(1);
      else if (event.key === "ArrowLeft") this.go(-1);
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
  }

  start() {
    document.body.append(this.shield, this.spot, this.card);
    window.addEventListener("resize", this.place);
    window.addEventListener("scroll", this.place, true);
    document.addEventListener("keydown", this.keys, true);
    this.show(0);
  }

  go(delta) {
    const next = this.index + delta;
    if (next >= this.steps.length) this.end();
    else if (next >= 0) this.show(next);
  }

  show(index) {
    this.index = index;
    const step = this.steps[index];
    const target = document.querySelector(step.target);
    if (!target) return this.go(1);
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    const last = index === this.steps.length - 1;
    this.card.innerHTML = `
      <div class="tour-progress" aria-hidden="true">${this.steps.map((_, i) => `<i class="${i <= index ? "done" : ""}"></i>`).join("")}</div>
      <span class="tour-count">STEP ${index + 1} / ${this.steps.length}</span>
      <strong>${step.title}</strong>
      <p>${step.text}</p>
      <div class="tour-actions">
        <button type="button" data-tour="skip">跳過教學</button>
        <span></span>
        <button type="button" data-tour="back" ${index ? "" : "disabled"}>上一步</button>
        <button type="button" data-tour="next" class="tour-next">${last ? "開始玩" : "下一步"}</button>
      </div>`;
    this.card.querySelector("[data-tour=skip]").addEventListener("click", () => this.end());
    this.card.querySelector("[data-tour=back]").addEventListener("click", () => this.go(-1));
    this.card.querySelector("[data-tour=next]").addEventListener("click", () => this.go(1));
    this.target = target;
    this.position();
    // Smooth scrolling moves the target after the first placement.
    setTimeout(this.place, 350);
    this.card.querySelector(".tour-next").focus({ preventScroll: true });
  }

  // The spot hugs the target; the card sits below it, or above when there is no room.
  position() {
    if (!this.target) return;
    const rect = this.target.getBoundingClientRect();
    const pad = 6;
    Object.assign(this.spot.style, {
      left: `${rect.left - pad}px`,
      top: `${rect.top - pad}px`,
      width: `${rect.width + pad * 2}px`,
      height: `${rect.height + pad * 2}px`,
    });
    const card = this.card.getBoundingClientRect();
    const gap = 14;
    const below = rect.bottom + gap + card.height < window.innerHeight;
    const above = rect.top - gap - card.height > 0;
    let top = below ? rect.bottom + gap : above ? rect.top - gap - card.height : Math.max(gap, window.innerHeight - card.height - gap);
    let left = rect.left + rect.width / 2 - card.width / 2;
    left = Math.max(gap, Math.min(window.innerWidth - card.width - gap, left));
    top = Math.max(gap, Math.min(window.innerHeight - card.height - gap, top));
    Object.assign(this.card.style, { left: `${left}px`, top: `${top}px` });
  }

  end() {
    window.removeEventListener("resize", this.place);
    window.removeEventListener("scroll", this.place, true);
    document.removeEventListener("keydown", this.keys, true);
    this.spot.remove();
    this.card.remove();
    this.shield.remove();
    this.onEnd();
  }
}

// The first-visit question: take the tour or skip it.
export function askForTour({ onYes, onNo }) {
  const box = document.createElement("div");
  box.className = "tour-ask";
  box.setAttribute("role", "dialog");
  box.innerHTML = `
    <div class="tour-ask-card">
      <span class="tour-count">WELCOME TO THE ARENA</span>
      <strong>第一次來 FLOW ARENA？</strong>
      <p>花兩分鐘看一下玩法教學：每個區塊是做什麼的、怎麼讀燃料、怎麼下單。之後也可以從上方的「教學」按鈕重看。</p>
      <div class="tour-actions"><button type="button" data-ask="no">先不用</button><span></span><button type="button" data-ask="yes" class="tour-next">開始教學</button></div>
    </div>`;
  document.body.append(box);
  const close = (yes) => {
    box.remove();
    (yes ? onYes : onNo)();
  };
  box.querySelector("[data-ask=yes]").addEventListener("click", () => close(true));
  box.querySelector("[data-ask=no]").addEventListener("click", () => close(false));
  box.querySelector("[data-ask=yes]").focus();
}
