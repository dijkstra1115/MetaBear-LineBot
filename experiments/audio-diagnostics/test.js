const params = new URLSearchParams(location.search);
const transportTest = params.get('experiment') === 'transport';
const transport = params.get('transport') === 'range' ? 'range' : 'original';
const mode = transportTest || params.get('mode') === 'B' ? 'B' : 'A';
const lesson = params.get('lesson') === 'footprint' ? 'footprint' : 'btc-wall';
const fresh = transportTest || params.get('cache') === 'fresh';
const cacheQuery = fresh ? '&cache=fresh' : '';
const transportQuery = transportTest ? `&experiment=transport&transport=${transport}` : '';
const cacheLink = document.querySelector('#cache-toggle');
cacheLink.href = `?mode=${mode}&lesson=${lesson}${fresh ? '' : '&cache=fresh'}`;
cacheLink.textContent = fresh ? '切回一般載入測試' : '首次載入測試：每次使用新音檔網址';
document.querySelector('#cache-description').textContent = fresh ? '目前每次載入都使用不同的音檔網址，減少沿用瀏覽器既有音檔快取。音檔內容不變；這不會重設瀏覽器的所有解碼狀態或 CDN 快取。' : '一般載入可能沿用先前播放過的音檔快取。';
const frame = document.querySelector('#lesson-frame');
document.querySelector('#lesson').value = lesson;
for (const m of ['A', 'B']) {
  const link = document.querySelector('#mode-' + m.toLowerCase());
  link.href = `?mode=${m}&lesson=${lesson}${cacheQuery}`;
  if (m === mode) link.setAttribute('aria-current', 'page');
}
document.querySelector('#mode-description').textContent = mode === 'A' ? '目前是 A：保留正式播放器的自動音軌跳轉。' : '目前是 B：只停用播放中的自動音軌跳轉，其他播放邏輯相同。';
document.querySelector('#lesson').addEventListener('change', e => { location.search = `?mode=${mode}&lesson=${e.target.value}${cacheQuery}${transportQuery}`; });
if (transportTest) {
  document.querySelector('#title').textContent = '首次播放：音檔傳輸對照';
  document.title = '音檔傳輸對照 · MetaBear';
  document.querySelector('#intro').textContent = '選一組測試，等下方動畫停在 10 秒，再按課程上的「開始聲音測試」。播放 5 秒後會自動跳到第 20 秒，約 12 秒後完成。不需要自己計時或拖曳。';
  document.querySelector('#mode-description').textContent = transport === 'range' ? '目前是第 2 組：支援分段下載。' : '目前是第 1 組：不支援分段下載，模擬目前正式站回應。';
  for (const [id, value, label] of [['a', 'original', '1 · 原始傳輸行為'], ['b', 'range', '2 · 支援分段下載']]) {
    const link = document.querySelector('#mode-' + id);
    link.href = `?experiment=transport&transport=${value}&lesson=${lesson}&cache=fresh`;
    link.textContent = label;
    link.removeAttribute('aria-current');
    if (value === transport) link.setAttribute('aria-current', 'page');
  }
  cacheLink.hidden = true;
  document.querySelector('#test-note').textContent = '兩組使用相同音檔、相同測試時序，且都停用自動重複跳轉。這是 preview 診斷，正式課程尚未修正。數據只留在本頁。';
  document.querySelector('details p').textContent = '每組完成後按「複製測試數據」，並回報是否有雜音／斷續、跳轉是否正確。再做另一組；如方便，可交換順序再測一次。';
}
frame.src = `./orderflow/${lesson}.html?mode=${mode}${cacheQuery}${transportQuery}`;
window.addEventListener('message', e => {
  if (e.origin !== location.origin || e.source !== frame.contentWindow || e.data?.type !== 'metabear-audio-test') return;
  const d = e.data;
  document.querySelector('#metrics').textContent = `模式 ${d.mode} · ${d.muted ? '靜音，請開啟聲音' : '聲音已開啟'}\n自動跳轉 ${d.automaticSeeks} 次 ｜ 緩衝事件 ${d.waiting} 次\n跳轉事件 ${d.seeking} 次 ｜ 超過 100ms 的畫面 ${d.slowFrames} 次\n動畫 ${d.visual.toFixed(2)}s ｜ 聲音 ${d.audio.toFixed(2)}s\n最長畫面間隔 ${d.maxFrameMs.toFixed(0)}ms ｜ 音訊狀態 ${d.readyState}`;
  if (d.probe) {
    const labels = { 'lead-in': '準備中：等待下方動畫停在 10 秒。', ready: '已停在 10 秒。請在下方課程按「開始聲音測試（10 秒）」。', testing: '測試進行中，請聽聲音；第 20 秒跳轉會自動執行。', complete: '測試完成。請複製數據，再切換另一組。' };
    document.querySelector('#probe-instructions').textContent = labels[d.probe.phase] ?? d.probe.phase;
    for (const [event, label] of [['one-second-after-start-at-10', '要求從 10 秒開始，1 秒後音訊位置'], ['one-second-after-seek-to-20', '要求跳到 20 秒，1 秒後音訊位置']]) {
      const sample = d.probe.samples.find(s => s.event === event);
      if (sample) document.querySelector('#metrics').textContent += `\n${label}：${sample.audio.toFixed(2)} 秒`;
    }
  }
  document.querySelector('#report').value = JSON.stringify({ test: d.probe ? 'audio-transport-v3' : 'audio-ab-v2', ...d }, null, 2);
});
document.querySelector('#copy').addEventListener('click', async () => {
  const report = document.querySelector('#report');
  if (!report.value) { document.querySelector('#copy-status').textContent = '請先播放課程'; return; }
  try { await navigator.clipboard.writeText(report.value); document.querySelector('#copy-status').textContent = '已複製'; }
  catch { document.querySelector('details').open = true; report.select(); document.querySelector('#copy-status').textContent = '請手動複製下方文字'; }
});
