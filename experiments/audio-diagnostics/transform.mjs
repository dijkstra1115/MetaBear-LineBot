// Diagnostic-only instrumentation. Production player stays untouched.
export function diagnosticAudioUrl(audioPath, pageUrl, token) {
  const page = new URL(pageUrl);
  let url = new URL(audioPath, 'https://metabear.io/orderflow/');
  if (page.searchParams.get('experiment') === 'transport') {
    const transport = page.searchParams.get('transport') === 'range' ? 'range' : 'original';
    url = new URL('/audio-test/media/' + transport + '/' + url.pathname.split('/').pop(), page.origin);
  }
  if (page.searchParams.get('cache') === 'fresh') url.searchParams.set('audio_test', token);
  return url.href;
}
export function instrumentPlayer(source) {
  const seek = 'if (audio && !muted && !audio.paused && Math.abs(audio.currentTime - t) > 0.12) audio.currentTime = t;';
  if (!source.includes(seek)) throw new Error('Player changed: review diagnostic transform');
  return source
    .replace('new Audio(lesson.audio)', `new Audio((${diagnosticAudioUrl.toString()})(lesson.audio, location.href, crypto.randomUUID()))`)
    .replace('let muted = store.get("metabear-motion-sound") !== "on";', 'let muted = true;')
    .replaceAll('metabear-motion-', 'metabear-audio-test-')
    .replace('  // ---------- transport ----------', `
  const diagnosticParams = new URLSearchParams(location.search);
  const transportTest = diagnosticParams.get('experiment') === 'transport';
  const diagnosticMode = transportTest || diagnosticParams.get('mode') === 'B' ? 'B' : 'A';
  const diagnostic = { mode: diagnosticMode, cache: new URLSearchParams(location.search).get('cache') === 'fresh' ? 'fresh-url' : 'normal', automaticSeeks: 0, waiting: 0, seeking: 0, slowFrames: 0, maxFrameMs: 0, startup: [] };
  const diagnosticBoot = performance.now();
  const ranges = (r) => Array.from({length: r?.length ?? 0}, (_, i) => [r.start(i), r.end(i)]);
  const recordStartup = (event) => {
    if (diagnostic.startup.length >= 30) return;
    diagnostic.startup.push({ event, ms: Math.round(performance.now() - diagnosticBoot), visual: t,
      audio: audio?.currentTime ?? 0, readyState: audio?.readyState, paused: audio?.paused,
      seeking: audio?.seeking, buffered: ranges(audio?.buffered), seekable: ranges(audio?.seekable) });
  };
  for (const event of ['loadedmetadata', 'canplay', 'play', 'playing', 'waiting', 'seeking', 'seeked', 'stalled', 'error']) audio?.addEventListener(event, () => recordStartup(event));
  for (const event of ['waiting', 'seeking']) audio?.addEventListener(event, () => diagnostic[event]++);
  const probe = transportTest ? { transport: diagnosticParams.get('transport') === 'range' ? 'range' : 'original', phase: 'lead-in', commands: [], samples: [] } : null;
  let probeStartedAt = null;
  let probeFirstSample = false;
  let probeJumped = false;
  let probeSecondSample = false;
  const probeSample = (event) => {
    if (!probe) return;
    probe.samples.push({event, ms: Math.round(performance.now() - diagnosticBoot), visual: t, audio: audio?.currentTime ?? 0, seeking: audio?.seeking, readyState: audio?.readyState, buffered: ranges(audio?.buffered), seekable: ranges(audio?.seekable)});
  };
  if (probe) {
    diagnostic.probe = probe;
    play.disabled = true;
    range.disabled = true;
    sound.disabled = true;
    soundHint.disabled = true;
    canvas.style.pointerEvents = 'none';
    soundHint.textContent = '準備中，動畫到 10 秒時可開始';
  }
  function beginProbe() {
    if (!probe || probeStartedAt !== null) return;
    probeStartedAt = performance.now();
    probe.phase = 'testing';
    probe.commands.push({target: 10, kind: 'sound-on', ms: Math.round(probeStartedAt - diagnosticBoot)});
    probeSample('before-start-at-10');
  }
  function runProbe(now) {
    if (!probe) return;
    if (probe.phase === 'lead-in' && t >= 10) {
      t = 10;
      playing = false;
      probe.phase = 'ready';
      soundHint.disabled = false;
      soundHint.textContent = '開始聲音測試（10 秒）';
      bigPlay.setAttribute('aria-label', '開始聲音測試（10 秒）');
      diagnosticLastReport = 0;
    }
    if (probeStartedAt === null || probe.phase === 'complete') return;
    const elapsed = now - probeStartedAt;
    if (elapsed >= 1000 && !probeFirstSample) { probeFirstSample = true; probeSample('one-second-after-start-at-10'); }
    if (elapsed >= 5000 && !probeJumped) {
      probeJumped = true;
      probe.commands.push({target: 20, kind: 'single-seek', ms: Math.round(now - diagnosticBoot)});
      probeSample('before-seek-to-20');
      seek(20, true);
    }
    if (elapsed >= 6000 && !probeSecondSample) { probeSecondSample = true; probeSample('one-second-after-seek-to-20'); }
    if (elapsed >= 12000) {
      probeSample('complete');
      probe.phase = 'complete';
      playing = false;
      audioPause();
      diagnosticLastReport = 0;
    }
  }
  let diagnosticLastReport = 0;
  function reportDiagnostic(now) {
    if (now - diagnosticLastReport < 500) return;
    diagnosticLastReport = now;
    parent.postMessage({ type: 'metabear-audio-test', ...diagnostic, lesson: lesson.id,
      visual: t, audio: audio?.currentTime ?? 0, readyState: audio?.readyState,
      muted, playing, error: audio?.error?.code ?? null }, location.origin);
  }
  // ---------- transport ----------`)
    .replace('    muted = next;', '    if (!next) { recordStartup("sound-on"); beginProbe(); }\n    muted = next;')
    .replace('if (store.get("metabear-audio-test-sound") === null && audio) setMuted(false);', 'if ((probe?.phase === "ready" || store.get("metabear-audio-test-sound") === null) && audio) setMuted(false);')
    .replace('    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));', `
    const frameMs = Math.max(0, now - last);
    diagnostic.maxFrameMs = Math.max(diagnostic.maxFrameMs, frameMs);
    if (frameMs > 100) diagnostic.slowFrames++;
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));`)
    .replace(seek, `if (diagnosticMode === 'A' && audio && !muted && !audio.paused && Math.abs(audio.currentTime - t) > 0.12) {
      diagnostic.automaticSeeks++;
      audio.currentTime = t;
    }
    runProbe(now);
    reportDiagnostic(now);`);
}
