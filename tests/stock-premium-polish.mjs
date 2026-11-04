import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Presentation contracts only: no company data, API, session or browser writes.
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const css=read('stock_premium.css').replace(/\/\*[\s\S]*?\*\//g,'');

function parseRules(source){
  let cursor=0;
  const out=[];
  function walk(parents=[]){
    while(cursor<source.length){
      while(/\s/.test(source[cursor]||'')&&cursor<source.length)cursor++;
      if(source[cursor]==='}'){cursor++;return;}
      if(cursor===source.length)return;
      const start=cursor,brace=source.indexOf('{',cursor);
      assert.ok(brace>=cursor,'every CSS rule opens a block');
      const selector=source.slice(start,brace).trim();
      cursor=brace+1;
      if(selector.startsWith('@')){assert.match(selector,/^@(media|supports)\b/);walk([...parents,selector]);continue;}
      const end=source.indexOf('}',cursor);
      assert.ok(end>=cursor,'every CSS rule closes a block');
      const body=source.slice(cursor,end);
      assert.doesNotMatch(body,/[{}]/,'style rules remain flat');
      const declarations=Object.fromEntries(body.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
        const colon=v.indexOf(':');assert.ok(colon>0);return[v.slice(0,colon).trim(),v.slice(colon+1).trim()];
      }));
      out.push({selector,parents,declarations});cursor=end+1;
    }
  }
  walk();return out;
}
const rules=parseRules(css);
const ruleFor=selector=>rules.find(r=>r.selector===selector&&r.parents.length===1)?.declarations;
const prefix='body[data-aaf-premium] #stock-summary ';
const under=(r,re)=>r.parents.some(p=>re.test(p));
const rgb=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255);
const luminance=values=>values.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const contrast=(foreground,background)=>{
  const values=[luminance(rgb(foreground)),luminance(Array.isArray(background)?background:rgb(background))].sort((a,b)=>b-a);
  return(values[0]+.05)/(values[1]+.05);
};

test('all style rules stay screen-only and live-root scoped; report print and PNG retain their existing layout',()=>{
  assert.ok(rules.length>100);
  for(const r of rules){
    assert.equal(r.parents[0],'@media screen',r.selector);
    assert.match(r.selector,/^body\[data-aaf-premium/);
    if(/\.ss-/.test(r.selector))assert.match(r.selector,/#stock-summary/);
  }
  assert.doesNotMatch(css,/\.ss-export|@media\s+print|@font-face|@import/);
  const summary=read('stock_summary.js');
  const clone=summary.slice(summary.indexOf("box=document.createElement('div')"),summary.indexOf('document.body.append(box)'));
  assert.match(clone,/box\.className='ss-export'/);
  assert.doesNotMatch(clone,/box\.id\s*=/);
});

test('short sales cards size to their content without reordering the business workflow',()=>{
  assert.equal(ruleFor(prefix+'.ss-kpis')['align-items'],'start');
  const card=ruleFor(prefix+'.ss-kpi[data-stock-card]');
  assert.equal(card['align-self'],'start');assert.equal(card['min-height'],'0');
  assert.equal(card['min-width'],'0');
  for(const r of rules)for(const name of Object.keys(r.declarations)){
    assert.ok(!['order','grid-area','grid-row','grid-column','height','max-height','columns','column-count'].includes(name),name+' cannot alter content order or clip expanded content');
  }
  const summary=read('stock_summary.js');
  assert.match(summary,/ss-kpi-free:has\(\[data-free-followup-panel\]\[open\]\)\{grid-column:1\/-1\}/,'the existing expanded Free editor still owns its full-width layout');
});

test('factory glass remains one local decorative asset with dimensional card boundaries and no extra downloads',()=>{
  assert.deepEqual([...css.matchAll(/url\(['"]([^'"]+)['"]\)/g)].map(m=>m[1]),['./assets/aaf-factory-background.webp']);
  assert.doesNotMatch(css,/https?:|data:|javascript:|content\s*:/i);
  assert.match(ruleFor(prefix+'.ss-kpi[data-stock-card]')['box-shadow'],/inset/);
  for(const card of ['sold','reserved','free'])assert.match(ruleFor(prefix+'.ss-kpi-'+card)['border-top-color'],/^#[a-f0-9]{6}$/i);
  assert.ok(rules.some(r=>under(r,/^@supports.*not.*backdrop-filter/)&&r.declarations.background==='#fdfcf7'));
});

test('critical captions and compact grade labels remain readable over even a dark factory image',()=>{
  const caption=ruleFor(prefix+'.ss-content>.ss-reservation-help:not([hidden])');
  assert.ok(contrast(caption.color,caption.background)>=7);
  assert.equal(caption['font-size'],'13px');assert.equal(caption['line-height'],'1.8');
  // Most transparent card end is an 82% pale surface composited over black.
  const darkestGlass=rgb('#f2f9f3').map(v=>v*.82);
  for(const color of ['#20392d','#3d5546','#254f42'])assert.ok(contrast(color,darkestGlass)>=4.5,color+' must remain readable at the darkest allowed glass backdrop');
  assert.equal(ruleFor(prefix+'.ss-kpi small').color,'#3d5546');
  assert.equal(ruleFor(prefix+'.ss-physical-item')['font-size'],'11px');
  assert.equal(ruleFor(prefix+'.ss-physical-item-head')['font-size'],'10px');
});

test('touch controls remain comfortably sized and grade hint text can wrap on narrow screens',()=>{
  for(const selector of ['.ss-physical-grade-detail>summary','button.ss-card-toggle','.ss-overview-actions button']){
    assert.ok(rules.some(r=>r.selector===prefix+selector&&under(r,/max-width:\s*650px/)&&r.declarations['min-height']==='44px'),selector);
  }
  assert.ok(rules.some(r=>r.selector===prefix+'.ss-physical-grade-detail>summary>small'&&under(r,/max-width:\s*650px/)&&r.declarations['white-space']==='normal'));
  assert.ok(rules.some(r=>under(r,/max-width:/)&&r.declarations['background-attachment']==='scroll'));
  assert.ok(rules.some(r=>under(r,/max-width:\s*650px/)&&r.declarations['backdrop-filter']==='none'),'small screens avoid blur cost');
});

test('focus, reduced motion, reduced transparency and system high contrast remain available',()=>{
  assert.ok(rules.some(r=>r.selector.includes(':focus-visible')&&r.declarations.outline==='3px solid #277959'));
  assert.ok(rules.some(r=>under(r,/prefers-reduced-motion:\s*reduce/)&&r.declarations.transition==='none'));
  assert.ok(rules.some(r=>under(r,/prefers-reduced-transparency:\s*reduce/)&&r.declarations['background-image']==='none'));
  assert.ok(rules.some(r=>under(r,/prefers-reduced-transparency:\s*reduce/)&&r.declarations['backdrop-filter']==='none'&&r.declarations.background==='#fdfcf7'));
  assert.ok(rules.some(r=>under(r,/forced-colors:\s*active/)&&r.declarations['outline-color']==='Highlight'));
  assert.ok(rules.some(r=>under(r,/forced-colors:\s*active/)&&r.declarations.background==='Canvas'&&r.declarations.color==='CanvasText'));
});

test('editing surfaces remain opaque and disabled controls are never made editable by the theme',()=>{
  const textarea=ruleFor(prefix+'.ss-free-linked-scroll textarea');
  assert.equal(textarea.background,'#fffefa');assert.equal(textarea.color,'#234333');
  const disabled=ruleFor(prefix+'.ss-free-linked-scroll textarea:disabled');
  assert.equal(disabled.cursor,'not-allowed');assert.ok(contrast(disabled.color,disabled.background)>=4.5);
  for(const r of rules)for(const[p,v]of Object.entries(r.declarations)){
    assert.ok(!['pointer-events','visibility','touch-action','transform','animation','overflow','overflow-x','overflow-y'].includes(p),p+' would alter existing interaction semantics');
    if(p==='opacity')assert.equal(r.selector,prefix+'button:disabled');
    if(p==='display'){assert.equal(r.selector,'body[data-aaf-premium] [hidden]');assert.equal(v,'none !important');}
  }
});

test('owner and Sales04 remain on the same premium theme version',()=>{
  const versions=['stock_manager.html','stock_report.html'].map(name=>{
    const html=read(name);assert.match(html,/data-aaf-premium="ivory"/);
    return html.match(/stock_premium\.css\?v=([^"']+)/)?.[1];
  });
  assert.ok(versions[0]);assert.equal(versions[0],versions[1]);
});
