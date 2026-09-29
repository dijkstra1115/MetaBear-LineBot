// Audio owns the playback clock. Only explicit user actions move its position.
export function createAudioTransport(audio, onFailure) {
  let target = null;
  let attempted = false;
  let active = false;
  let generation = 0;
  let timeout = null;
  let tail = false;
  let attemptedAt = 0;
  const clear = () => {
    clearTimeout(timeout);
    timeout = null;
  };
  function fail() {
    if (target === null && !active) return;
    generation++;
    active = false;
    target = null;
    clear();
    audio.pause();
    audio.muted = true;
    onFailure();
  }
  function align() {
    if (target === null || attempted || audio.readyState < 1) return;
    const ranges = audio.seekable;
    const allowed =
      target === 0 ||
      Array.from(
        { length: ranges.length },
        (_, i) => target >= ranges.start(i) && target <= ranges.end(i),
      ).some(Boolean);
    if (!allowed) return;
    if (Math.abs(audio.currentTime - target) <= 0.05 && !audio.seeking) {
      target = null;
      clear();
      audio.muted = !active;
      return;
    }
    attempted = true;
    attemptedAt = performance.now();
    try {
      audio.currentTime = target;
    } catch {
      fail();
    }
  }
  function position(time) {
    clear();
    target = Number.isFinite(audio.duration)
      ? Math.min(time, audio.duration)
      : time;
    tail = Number.isFinite(audio.duration) && time >= audio.duration;
    attempted = false;
    audio.muted = true;
    timeout = setTimeout(fail, 10000);
    align();
  }
  for (const event of [
    "loadedmetadata",
    "durationchange",
    "progress",
    "canplay",
  ])
    audio.addEventListener(event, align);
  audio.addEventListener("seeked", () => {
    if (target === null || !attempted) return;
    const elapsed = (performance.now() - attemptedAt) / 1000;
    if (audio.currentTime < target - 0.2 || audio.currentTime > target + elapsed + 0.2) {
      fail();
      return;
    }
    target = null;
    clear();
    audio.muted = !active;
  });
  audio.addEventListener("error", fail);
  return {
    start(time) {
      active = true;
      const current = ++generation;
      position(time);
      if (!active) return;
      if (tail) {
        audio.pause();
        return;
      }
      // Invoke during the click, including before metadata arrives (iOS).
      // Keep output muted until the requested position is confirmed.
      try {
        Promise.resolve(audio.play()).catch(() => {
          if (current === generation && active) fail();
        });
      } catch {
        if (current === generation) fail();
      }
    },
    pause() {
      generation++;
      active = false;
      target = null;
      clear();
      audio.pause();
      audio.muted = true;
    },
    seek(time) {
      position(time);
    },
    time(previous, dt, duration) {
      if (target !== null || audio.seeking) return previous;
      // Narration can end slightly before the visual timeline.
      if (tail || audio.ended)
        return Math.min(duration, Math.max(previous, audio.currentTime) + dt);
      return Math.min(duration, audio.currentTime);
    },
  };
}
