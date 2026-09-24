// Keep the current lesson and its chapters visible as the catalogue grows.
const sidebar = document.querySelector(".lesson-sidebar");
const current = sidebar?.querySelector(".course-current");
if (current && sidebar.scrollHeight > sidebar.clientHeight) {
  sidebar.scrollTop = Math.max(
    0,
    current.offsetTop - sidebar.clientHeight * 0.2,
  );
}
