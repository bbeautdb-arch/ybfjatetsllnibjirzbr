import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const css=read('stock_premium.css').replace(/\/\*[\s\S]*?\*\//g,'');
const selector='body[data-aaf-premium] #stock-summary .ss-content>.ss-reservation-help:not([hidden])';
const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m=>m[1].trim()===selector).map(m=>Object.fromEntries(m[2].split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const p=x.indexOf(':');return[x.slice(0,p).trim(),x.slice(p+1).trim()]})));

test('reservation explanation has opaque paint and at least 7:1 text contrast',()=>{
  const rule=rules.find(r=>r.background==='#fffef8');
  assert.ok(rule);assert.equal(rule.color,'#213e30');
  assert.equal(rule['font-size'],'13px');assert.equal(rule['line-height'],'1.8');
  const lum=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  assert.ok((lum(rule.background)+.05)/(lum(rule.color)+.05)>=7);
  assert.ok(!('opacity' in rule));assert.ok(!('filter' in rule));
});

test('caption stays screen scoped, preserves hidden state and supports forced colors',()=>{
  assert.ok(css.trim().startsWith('@media screen {'));
  assert.ok(rules.some(r=>r.background==='Canvas'&&r.color==='CanvasText'));
  assert.match(css,/\[hidden\]\s*\{\s*display:\s*none !important/);
  assert.doesNotMatch(css,/\.ss-export|@media\s+print/);
  assert.match(read('stock_summary.js'),/class="ss-help ss-reservation-help"/);
});

test('owner and Sales04 load the same refreshed caption styles',()=>{
  for(const page of ['stock_manager.html','stock_report.html']){
    assert.match(read(page),/stock_premium\.css\?v=20261105-caption-contrast-r1/);
  }
});
