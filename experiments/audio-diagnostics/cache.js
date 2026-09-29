const controlled = new URLSearchParams(location.search).get('source') === 'controlled';
const source = controlled ? 'controlled' : 'production';
const key = 'metabear-cache-probe-v4-' + source;
let saved;
try { saved = JSON.parse(sessionStorage.getItem(key)); } catch {}
const newState = () => ({ id: crypto.randomUUID(), token: crypto.randomUUID(), stage: 0, runs: [] });
let state = saved?.id && saved?.token && Number.isInteger(saved.stage) && saved.stage >= 0 && saved.stage <= 2 && Array.isArray(saved.runs) ? saved : newState();
const persist = () => { try { sessionStorage.setItem(key, JSON.stringify(state)); return true; } catch { return false; } };
const labels = ['第 1 輪：新網址首次載入', '第 2 輪：同一音檔網址重整', '第 3 輪：換新音檔網址重整'];
const audio = document.querySelector('#audio');
const start = document.querySelector('#start');
const next = document.querySelector('#next');
const status = document.querySelector('#status');
const base = controlled ? new URL('./media/original/btc-wall.m4a', location.href) : new URL('https://metabear.io/orderflow/motion/audio/btc-wall.m4a');
base.searchParams.set('audio_test', state.token);
if (controlled) base.searchParams.set('cache_probe', '1');
const boot = performance.now();
const run = { round: state.stage + 1, label: labels[state.stage], audioUrl: base.href, navigation: performance.getEntriesByType('navigation')[0]?.type ?? null, events: [], commands: [], samples: [], resources: [], outcome: 'loading' };
let started = false, finished = false, timers = [];
const ranges = r => Array.from({length:r.length}, (_,i) => [r.start(i),r.end(i)]);
const snapshot = event => ({event, ms:Math.round(performance.now()-boot), audio:audio.currentTime, readyState:audio.readyState, seeking:audio.seeking, buffered:ranges(audio.buffered), seekable:ranges(audio.seekable), error:audio.error?.code ?? null});
function resources() {
  return performance.getEntriesByName(base.href, 'resource').map(r => ({name:r.name, initiatorType:r.initiatorType, duration:r.duration, responseStatus:r.responseStatus ?? null, transferSize:r.transferSize, encodedBodySize:r.encodedBodySize, decodedBodySize:r.decodedBodySize, deliveryType:r.deliveryType ?? null,
    cacheEvidence:r.transferSize === 0 && r.decodedBodySize > 0 ? 'local-cache' : r.transferSize > 0 ? 'network-or-revalidation' : 'unavailable-not-proof-of-cache'}));
}
function render() {
  run.resources = resources();
  const all = {test:'audio-cache-v4', source, session:state.id, userAgent:navigator.userAgent, timingVisibility:controlled ? 'same-origin' : 'cross-origin-may-be-restricted', runs:state.runs, current:run};
  document.querySelector('#report').value = JSON.stringify(all,null,2);
  const lines = state.runs.map(r => `${r.label}：${r.outcome}\n` + r.samples.filter(s=>s.event.startsWith('one-second')).map(s=>`${s.event.includes('10') ? '從 10 秒開始' : '跳至 20 秒'}，1 秒後音訊 ${s.audio.toFixed(2)} 秒；可跳轉 ${JSON.stringify(s.seekable)}`).join('\n'));
  document.querySelector('#metrics').textContent = lines.join('\n\n') || `音訊 ${audio.currentTime.toFixed(2)} 秒；可跳轉 ${JSON.stringify(ranges(audio.seekable))}`;
}
function finish(outcome) {
  if (finished) return;
  finished = true; timers.forEach(clearTimeout); audio.pause();
  run.outcome = outcome; run.samples.push(snapshot('complete')); run.resources = resources();
  state.runs = state.runs.filter(r=>r.round !== run.round); state.runs.push(run);
  if (!persist()) { status.textContent = '無法保存數據，請先複製此輪；無法繼續重整對照。'; render(); return; }
  status.textContent = outcome === 'complete' ? (state.stage === 2 ? '三輪完成，請複製全部數據。' : '本輪完成，請按下方按鈕重整進入下一輪。') : '本輪未完成：' + outcome + '。請重新開始三輪。';
  next.hidden = state.stage === 2 || outcome !== 'complete';
  next.textContent = state.stage === 0 ? '同網址重整，進入第 2 輪' : '換新網址重整，進入第 3 輪';
  render();
}
for (const event of ['loadedmetadata','canplay','seeking','seeked','waiting','playing','progress','error','ended']) audio.addEventListener(event, () => {
  if (run.events.length < 60) run.events.push(snapshot(event));
  if (event === 'loadedmetadata' && !started && !finished) { start.disabled = false; status.textContent = '音檔資訊已載入，可以開始本輪。'; }
  if (event === 'error') finish('media-error');
  render();
});
start.addEventListener('click', () => {
  if (started || finished) return;
  started = true; start.disabled = true; run.outcome = 'running';
  status.textContent = '測試中，請保持分頁在前景，8 秒後自動停止。';
  run.samples.push(snapshot('before-start'));
  const command = target => { run.commands.push({target,ms:Math.round(performance.now()-boot)}); audio.currentTime = target; };
  try { command(10); audio.play().catch(error => finish('play-rejected:' + error.name)); } catch(error) { finish('seek-error:' + error.name); return; }
  timers.push(setTimeout(()=>{run.samples.push(snapshot('one-second-after-10'));render();},1000));
  timers.push(setTimeout(()=>{try { command(20); } catch(error) {finish('seek-error:' + error.name);}},5000));
  timers.push(setTimeout(()=>{run.samples.push(snapshot('one-second-after-20'));render();},6000));
  timers.push(setTimeout(()=>finish('complete'),8000));
});
document.addEventListener('visibilitychange',()=>{if (document.hidden && started && !finished) finish('interrupted-background');});
next.addEventListener('click',()=>{
  if (!finished || run.outcome !== 'complete' || state.stage >= 2) return;
  state.stage++;
  if (state.stage === 2) state.token = crypto.randomUUID();
  if (persist()) location.reload();
});
document.querySelector('#reset').addEventListener('click',()=>{state = newState(); if(persist()) location.reload();});
document.querySelector('#copy').addEventListener('click',async()=>{
  render(); const report = document.querySelector('#report');
  try {await navigator.clipboard.writeText(report.value);document.querySelector('#copy-status').textContent='已複製';}
  catch {document.querySelector('details').open=true;report.select();document.querySelector('#copy-status').textContent='請手動複製';}
});
document.querySelector('#round').textContent = labels[state.stage];
document.querySelector('#source-note').textContent = controlled ? '使用相同音檔的診斷副本：伺服器仍只回傳整檔 200，但允許瀏覽器快取，以觀察快取是否使跳轉恢復。這不是正式站下載效能測試。' : '直接使用正式站原始音檔。跨網域可能無法讀取下載大小或狀態碼；看不到的數據不會當成快取命中。';
if (persist()) audio.src = base.href;
else status.textContent = '此環境無法使用 sessionStorage；請改用 Chrome 一般或無痕分頁。';
render();
