// Homepage live section: the 10/30 盤面解剖 film (motion/platform/liq-cascade). It plays muted and
// looping while it is on screen, unless motion is off; the button restarts it with sound and controls.
// The web encode and poster live in the R2 bucket metabear-media behind media.metabear.io; the
// local preview serves copies from public/media/.
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const MEDIA_BASE = LOCAL ? "/media/films/" : "https://media.metabear.io/films/";
const FILM = "liq-cascade-1030";

export function initLiveFilm({ motionOff }) {
  const video = document.querySelector("[data-live-film]");
  const sound = document.querySelector("[data-live-film-sound]");
  if (!video || !sound) return;
  video.poster = `${MEDIA_BASE}${FILM}.webp`;
  const load = () => {
    if (!video.src) video.src = `${MEDIA_BASE}${FILM}.mp4`;
  };
  let listening = false;
  if (motionOff()) sound.textContent = "▶ 播放（有聲音）";

  new IntersectionObserver(
    ([entry]) => {
      if (listening) {
        if (!entry.isIntersecting) video.pause();
        return;
      }
      if (entry.isIntersecting && !motionOff()) {
        load();
        video.play().catch(() => {});
      } else video.pause();
    },
    { threshold: 0.5 },
  ).observe(video);

  sound.addEventListener("click", () => {
    load();
    listening = true;
    video.loop = false;
    video.muted = false;
    video.controls = true;
    video.currentTime = 0;
    video.play().catch(() => {});
    sound.hidden = true;
  });
}
