import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync(new URL('./cache.js', import.meta.url), 'utf8');
test('three-round flow persists reports, reuses the audio URL once, then changes it', async () => {
  let stored = null, id = 0;
  function load() {
    const elements = {}, timers = [];
    const document = {querySelector(selector) {return elements[selector] ??= {textContent:'',value:'',disabled:false,hidden:false,events:{},addEventListener(name,fn){this.events[name]=fn;}};}, addEventListener(){}};
    const audio = document.querySelector('#audio');
    Object.assign(audio,{currentTime:0,readyState:4,seeking:false,buffered:{length:0},seekable:{length:0},pause(){},play(){return Promise.resolve();}});
    const context = vm.createContext({document,URL,URLSearchParams,crypto:{randomUUID:()=>String(++id)},location:{href:'https://preview.metabear.io/audio-test/cache.html?source=controlled',search:'?source=controlled',reload(){}},sessionStorage:{getItem:()=>stored,setItem:(_,v)=>stored=v},performance:{now:()=>0,getEntriesByType:()=>[],getEntriesByName:()=>[]},navigator:{userAgent:'test'},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}});
    vm.runInContext(code,context);
    return {elements,audio,complete(){audio.events.loadedmetadata();elements['#start'].events.click();timers.forEach(fn=>fn());},next(){elements['#next'].events.click();}};
  }
  const cold=load(), firstUrl=cold.audio.src; cold.complete(); cold.next();
  const warm=load(); assert.equal(warm.audio.src,firstUrl); warm.complete(); warm.next();
  const fresh=load(); assert.notEqual(fresh.audio.src,firstUrl); fresh.complete();
  const report=JSON.parse(fresh.elements['#report'].value);
  assert.equal(report.runs.length,3);
  assert.deepEqual(report.runs.map(r=>r.commands.map(c=>c.target)),[[10,20],[10,20],[10,20]]);
  assert.ok(report.runs.every(r=>r.outcome==='complete'));
  assert.equal(fresh.elements['#next'].hidden,true);
});
