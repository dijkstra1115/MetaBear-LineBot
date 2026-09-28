import {
  courses,
  paths,
  selectCourses,
  isAvailable,
} from "./academy-catalog.js";
import { renderSections } from "./academy-map-render.js";

const params = new URLSearchParams(location.search);
let view = params.get("view") === "new" ? "new" : "ready";
let path = "";
const input = document.querySelector("#course-search");
const list = document.querySelector("#course-sections");
const result = document.querySelector("#filter-result");

function update() {
  const selected = selectCourses({ view, path, query: input.value });
  const route = paths.find((p) => p.id === path);
  list.innerHTML = renderSections(selected);
  result.textContent = `${route ? `路線：${route.label} · ` : ""}${selected.length} 堂${view === "all" ? "課程與規劃" : "可觀看課程"}`;
  document
    .querySelectorAll("[data-course-view]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.courseView === view && !path),
      ),
    );
  document
    .querySelectorAll("[data-learning-path]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.learningPath === path),
      ),
    );
}
document.querySelectorAll("[data-course-view]").forEach((button) =>
  button.addEventListener("click", () => {
    view = button.dataset.courseView;
    path = "";
    update();
  }),
);
document.querySelectorAll("[data-learning-path]").forEach((button) =>
  button.addEventListener("click", () => {
    path = button.dataset.learningPath;
    view = "all";
    input.value = "";
    update();
    document
      .querySelector("#browse")
      .scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }),
);
document.querySelector("#show-new").addEventListener("click", () => {
  view = "new";
  path = "";
  input.value = "";
  update();
  document.querySelector("#browse").scrollIntoView({ block: "start" });
});
input.addEventListener("input", update);
list.addEventListener("click", (event) => {
  if (event.target.closest("[data-reset-filter]")) {
    view = "all";
    path = "";
    input.value = "";
    update();
  }
});
document.querySelector("#available-count").textContent =
  courses.filter(isAvailable).length;
document.querySelector("#new-count").textContent = courses.filter(
  (c) => c.status === "new",
).length;
document.querySelector("#planned-count").textContent = courses.filter(
  (c) => !isAvailable(c),
).length;
update();
