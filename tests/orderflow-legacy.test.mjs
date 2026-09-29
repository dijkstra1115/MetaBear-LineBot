import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');

test('retired HTML bookmarks lead to the current academy without loading retired code', () => {
  const pages = ['classic','journey','absorption','revisit','delta','mark-price','accumulation'].map(id=>`public/orderflow/${id}.html`);
  for (const name of readdirSync(new URL('public/orderflow/legacy/', root))) {
    assert.ok(name.endsWith('.html'), `Retired implementation is still deployed: ${name}`);
    pages.push('public/orderflow/legacy/'+name);
  }
  for (const page of pages) {
    const html=read(page);
    assert.match(html,/http-equiv="refresh" content="0;url=\/orderflow\/courses.html"/);
    assert.match(html,/href="\/orderflow\/courses.html"/);
    assert.doesNotMatch(html,/<script\b/);
  }
});

test('old workspace and unrecognized lesson queries leave the retired experience', async () => {
  for(const search of ['?classic=1&lesson=cvd','?workspace=live','?workspace=practice','?lesson=iceberg']) {
    let destination;
    await runInNewContext(`(async()=>{${read('public/orderflow/academy-entry.js')}})()`, {
      URLSearchParams, location:{search,hash:'#saved',replace:value=>destination=value},
    });
    assert.equal(destination,'./courses.html');
  }
});

test('archived sources and branch snapshots retain their original bytes outside the deployment directory', () => {
  const manifest=JSON.parse(read('archive/2026-09-29/manifest.json'));
  for(const file of [...manifest.files,...manifest.snapshots]) {
    assert.ok(!file.archive.startsWith('public/'));
    const bytes=readFileSync(new URL(file.archive,root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.archive);
  }
  for(const file of ['public/quant.html','public/quant.js','public/orderflow/engine.js','public/orderflow/story-player.js','public/orderflow/academy-mobile.js'])
    assert.ok(!existsSync(new URL(file,root)),file);
});

test('current public HTML and modules have no missing static local references', () => {
  function visit(dir) {
    for(const entry of readdirSync(new URL(dir,root),{withFileTypes:true})) {
      const file=dir+entry.name;
      if(entry.isDirectory()){visit(file+'/');continue;}
      if(!/\.(html|js|css)$/.test(file))continue;
      const source=read(file);
      const pattern=/(?:\bfrom\s*|\bimport\s*\(?\s*|\b(?:href|src)=)["']((?:[.]{1,2}[/]|[/])[^"'`<>$]+)["']/g;
      for(const [,raw] of source.matchAll(pattern)) {
        const ref=raw.replaceAll('&amp;','&').split(/[?#]/)[0];
        if(!/\.(html|js|css|svg|png|webp|jpg|ico|woff2|m4a)$/.test(ref))continue;
        const target=ref.startsWith('/')?new URL('public'+ref,root):new URL(ref,new URL(file,root));
        assert.ok(existsSync(target),`${file} -> ${raw}`);
      }
    }
  }
  visit('public/');
});
