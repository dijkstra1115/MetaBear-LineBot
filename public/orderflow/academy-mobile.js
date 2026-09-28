// Presentation only: the existing SVG and player stay mounted at the same time.
const player = document.querySelector(".lesson-player");
const canvas = player?.querySelector(".canvas");
if (player && canvas) {
  const toolbar = document.createElement("div");
  toolbar.className = "chart-tools";
  const expand = document.createElement("button");
  expand.type = "button";
  expand.className = "chart-expand";
  expand.textContent = "放大觀看 ↗";
  expand.setAttribute("aria-expanded", "false");
  expand.setAttribute("aria-label", "展開橫向劇院模式");
  const zoom = document.createElement("button");
  zoom.type = "button";
  zoom.className = "chart-zoom";
  zoom.textContent = "＋ 圖表細節";
  zoom.setAttribute("aria-pressed", "false");
  const hint = document.createElement("span");
  hint.className = "chart-hint";
  hint.textContent = "展開，看清每一筆成交";
  toolbar.append(hint, zoom, expand);
  player.prepend(toolbar);
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "課程圖表，放大後可左右上下滑動");
  let open = false;
  let enlarged = false;
  let background = [];
  const setZoom = (next) => {
    enlarged = next;
    player.classList.toggle("chart-enlarged", next);
    zoom.setAttribute("aria-pressed", String(next));
    zoom.textContent = next ? "－ 完整圖表" : "＋ 圖表細節";
    hint.textContent = next ? "滑動圖表查看細節" : "展開，看清每一筆成交";
    // Pause to let readers inspect figures. Continuing preserves the magnifier.
    if (next) document.dispatchEvent(new Event("academy:pause"));
    requestAnimationFrame(() => {
      canvas.scrollLeft = Math.max(
        0,
        (canvas.scrollWidth - canvas.clientWidth) / 2,
      );
      canvas.scrollTop = 0;
    });
  };
  function setTheater(next) {
    open = next;
    document.body.dataset.theater = String(next);
    document.documentElement.classList.toggle("academy-theater-open", next);
    expand.setAttribute("aria-expanded", String(next));
    expand.setAttribute(
      "aria-label",
      next ? "收起劇院模式" : "展開橫向劇院模式",
    );
    expand.textContent = next ? "收起 ×" : "放大觀看 ↗";
    if (next) {
      // Hide the rest of the page from keyboard and screen-reader navigation.
      background = [];
      let branch = player;
      while (branch !== document.body) {
        for (const sibling of branch.parentElement.children) {
          if (sibling !== branch) {
            background.push([sibling, sibling.inert]);
            sibling.inert = true;
          }
        }
        branch = branch.parentElement;
      }
      player.setAttribute("role", "dialog");
      player.setAttribute("aria-modal", "true");
      player.setAttribute("aria-label", "課程劇院");
    } else {
      for (const [element, inert] of background) element.inert = inert;
      background = [];
      player.removeAttribute("role");
      player.removeAttribute("aria-modal");
      player.removeAttribute("aria-label");
    }
    setZoom(false);
    document.dispatchEvent(new Event("academy:theater"));
    expand.focus({ preventScroll: true });
  }
  expand.addEventListener("click", () => setTheater(!open));
  zoom.addEventListener("click", () => setZoom(!enlarged));
  document.addEventListener("keydown", (event) => {
    if (!open) return;
    if (event.key === "Escape") setTheater(false);
    if (event.key === "Tab") {
      const items = [
        ...player.querySelectorAll(
          "button:not(:disabled), input, [tabindex='0']",
        ),
      ].filter((el) => el.getClientRects().length);
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
}
