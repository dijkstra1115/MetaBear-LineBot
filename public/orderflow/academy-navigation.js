// The same course list serves the desktop sidebar and the mobile drawer.
export function initAcademyNavigation(doc = document, win = window) {
  const sidebar = doc.querySelector(".lesson-sidebar");
  const header = doc.querySelector(".site-header");
  if (!sidebar || !header || sidebar.dataset.academyNavigation) return null;
  sidebar.dataset.academyNavigation = "ready";

  const viewport = win.matchMedia(
    "(max-width: 650px), (max-width: 950px) and (max-height: 500px)",
  );
  const originalAttributes = new Map(
    ["role", "aria-hidden", "aria-modal", "aria-labelledby", "tabindex"].map(
      (name) => [name, sidebar.getAttribute(name)],
    ),
  );
  const originalInert = sidebar.inert;
  if (!sidebar.id) sidebar.id = "academy-course-navigation";

  const toggle = doc.createElement("button");
  toggle.type = "button";
  toggle.className = "academy-nav-toggle";
  toggle.hidden = true;
  toggle.setAttribute("aria-controls", sidebar.id);
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "開啟課程目錄");
  toggle.innerHTML =
    '<span class="academy-nav-icon" aria-hidden="true"></span><span>課程</span>';
  header.append(toggle);

  const bar = doc.createElement("div");
  bar.className = "academy-nav-bar";
  bar.hidden = true;
  const title = doc.createElement("span");
  title.id = `${sidebar.id}-title`;
  title.className = "academy-nav-title";
  title.textContent = "課程目錄";
  const dismiss = doc.createElement("button");
  dismiss.type = "button";
  dismiss.className = "academy-nav-close";
  dismiss.setAttribute("aria-label", "關閉課程目錄");
  dismiss.innerHTML = '<span aria-hidden="true">×</span>';
  bar.append(title, dismiss);
  sidebar.prepend(bar);

  const backdrop = doc.createElement("div");
  backdrop.className = "academy-nav-backdrop";
  backdrop.hidden = true;
  backdrop.setAttribute("aria-hidden", "true");
  doc.body.append(backdrop);

  let opened = false;
  let previousFocus = null;
  let scrollState = null;
  let inertSiblings = [];

  function scrollCurrentIntoView() {
    const current = sidebar.querySelector(".course-current");
    if (!current || sidebar.scrollHeight <= sidebar.clientHeight) return;
    const top =
      current.getBoundingClientRect().top -
      sidebar.getBoundingClientRect().top +
      sidebar.scrollTop;
    sidebar.scrollTop = Math.max(
      0,
      top - Math.max(76, sidebar.clientHeight * 0.2),
    );
  }

  function lockScroll() {
    const properties = [
      "position",
      "top",
      "left",
      "right",
      "width",
      "overflow",
    ];
    scrollState = {
      x: win.scrollX,
      y: win.scrollY,
      styles: properties.map((name) => [
        name,
        doc.body.style.getPropertyValue(name),
        doc.body.style.getPropertyPriority(name),
      ]),
    };
    // Fixed positioning also prevents the page behind the drawer moving on iOS.
    for (const [name, value] of Object.entries({
      position: "fixed",
      top: `${-scrollState.y}px`,
      left: `${-scrollState.x}px`,
      right: "0",
      width: "100%",
      overflow: "hidden",
    }))
      doc.body.style.setProperty(name, value);
  }

  function unlockScroll() {
    if (!scrollState) return;
    for (const [name, value, priority] of scrollState.styles) {
      if (value) doc.body.style.setProperty(name, value, priority);
      else doc.body.style.removeProperty(name);
    }
    const rootStyle = doc.documentElement.style;
    const behavior = rootStyle.getPropertyValue("scroll-behavior");
    const priority = rootStyle.getPropertyPriority("scroll-behavior");
    rootStyle.setProperty("scroll-behavior", "auto", "important");
    win.scrollTo(scrollState.x, scrollState.y);
    if (behavior) rootStyle.setProperty("scroll-behavior", behavior, priority);
    else rootStyle.removeProperty("scroll-behavior");
    scrollState = null;
  }

  function isolateDrawer() {
    // Walk up to body so the drawer also works if a page wraps its sidebar.
    let branch = sidebar;
    while (branch.parentElement) {
      const parent = branch.parentElement;
      for (const sibling of parent.children) {
        if (sibling === branch || sibling === backdrop) continue;
        inertSiblings.push([sibling, sibling.inert]);
        sibling.inert = true;
      }
      if (parent === doc.body) break;
      branch = parent;
    }
  }

  function openDrawer() {
    if (!viewport.matches || opened) return;
    doc.dispatchEvent(new win.Event("academy:pause"));
    opened = true;
    previousFocus = doc.activeElement;
    sidebar.inert = false;
    sidebar.setAttribute("aria-hidden", "false");
    sidebar.setAttribute("aria-modal", "true");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "關閉課程目錄");
    backdrop.hidden = false;
    doc.body.classList.add("academy-nav-open");
    lockScroll();
    isolateDrawer();
    scrollCurrentIntoView();
    dismiss.focus({ preventScroll: true });
    // A newly visible, transitioning drawer may reject focus until it is painted.
    win.requestAnimationFrame(() =>
      win.requestAnimationFrame(() => {
        if (opened && viewport.matches) dismiss.focus({ preventScroll: true });
      }),
    );
  }

  function closeDrawer(restoreFocus = true) {
    if (!opened) return;
    opened = false;
    doc.body.classList.remove("academy-nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "開啟課程目錄");
    backdrop.hidden = true;
    sidebar.removeAttribute("aria-modal");
    for (const [element, wasInert] of inertSiblings) element.inert = wasInert;
    inertSiblings = [];
    unlockScroll();
    if (restoreFocus) {
      const target =
        previousFocus?.isConnected &&
        previousFocus !== doc.body &&
        previousFocus !== doc.documentElement &&
        !previousFocus.closest("[hidden], [inert]")
          ? previousFocus
          : toggle;
      target.focus({ preventScroll: true });
    } else if (sidebar.contains(doc.activeElement)) doc.activeElement.blur();
    sidebar.inert = true;
    sidebar.setAttribute("aria-hidden", "true");
  }

  function syncViewport() {
    const wasOpen = opened;
    const focusWasToggle = doc.activeElement === toggle;
    closeDrawer(false);
    toggle.hidden = !viewport.matches;
    bar.hidden = !viewport.matches;
    if (viewport.matches) {
      if (sidebar.contains(doc.activeElement))
        toggle.focus({ preventScroll: true });
      sidebar.setAttribute("role", "dialog");
      sidebar.setAttribute("aria-labelledby", title.id);
      sidebar.setAttribute("aria-hidden", "true");
      sidebar.setAttribute("tabindex", "-1");
      sidebar.inert = true;
    } else {
      for (const [name, value] of originalAttributes) {
        if (value === null) sidebar.removeAttribute(name);
        else sidebar.setAttribute(name, value);
      }
      sidebar.inert = originalInert;
      if (wasOpen || focusWasToggle)
        sidebar
          .querySelector(".course-current")
          ?.focus({ preventScroll: true });
      scrollCurrentIntoView();
    }
  }

  toggle.addEventListener("click", () =>
    opened ? closeDrawer() : openDrawer(),
  );
  dismiss.addEventListener("click", () => closeDrawer());
  backdrop.addEventListener("click", () => closeDrawer());
  sidebar.addEventListener("click", (event) => {
    // Let the player's own chapter handler run before the bubbling close handler.
    if (
      event.target.closest("a[href], .chapter-menu button, [data-story-scene]")
    ) {
      closeDrawer();
    }
  });
  doc.addEventListener("keydown", (event) => {
    if (!opened) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...sidebar.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter(
      (element) =>
        element.getClientRects().length &&
        !element.closest("[hidden], [inert]"),
    );
    const first = focusable[0] || sidebar;
    const last = focusable.at(-1) || sidebar;
    if (
      event.shiftKey &&
      (doc.activeElement === first || !sidebar.contains(doc.activeElement))
    ) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (
      !event.shiftKey &&
      (doc.activeElement === last || !sidebar.contains(doc.activeElement))
    ) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  });
  doc.addEventListener("focusin", (event) => {
    if (opened && !sidebar.contains(event.target))
      dismiss.focus({ preventScroll: true });
  });
  if (viewport.addEventListener)
    viewport.addEventListener("change", syncViewport);
  else viewport.addListener(syncViewport);
  syncViewport();

  return { open: openDrawer, close: closeDrawer };
}

if (typeof document !== "undefined") initAcademyNavigation();
