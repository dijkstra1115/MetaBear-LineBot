// Runs before first paint: lets CSS hide reveal targets only when scripts will show them.
document.documentElement.classList.add("js");
try {
  if (localStorage.getItem("metabear-motion") === "off") document.documentElement.classList.add("motion-off");
} catch {
  /* storage may be unavailable */
}
