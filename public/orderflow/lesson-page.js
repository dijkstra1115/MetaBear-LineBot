// Lesson pages: shared header behaviour and card spotlights from the design system.
import { initHeader, initSpotlight } from "/mb.js";

initHeader();
initSpotlight();

// Real-trade films live on media.metabear.io; a local preview serves its own copy from /media/films/.
const films = ["localhost", "127.0.0.1"].includes(location.hostname) ? "/media/films/" : "https://media.metabear.io/films/";
for (const video of document.querySelectorAll("[data-trade-film]")) {
  const name = video.dataset.tradeFilm;
  video.poster = `${films}${name}.webp`;
  video.src = `${films}${name}.mp4`;
}
