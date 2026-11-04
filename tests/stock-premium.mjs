import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {salesOnlyFixture} from './stock-sales-only-fixture.mjs';

const require=createRequire(import.meta.url),header=require('../stock_order_header.js'),notes=require('../stock_review_notes_bridge.js');
const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
const outer=read('../stock_premium.css'),reviewCSS=read('../stock_order_review.css'),summary=read('../stock_summary.js'),preview=read('./stock-premium-preview.html');
const stripComments=value=>value.replace(/\/\*[\s\S]*?\*\//g,'').trim();
const themeTail=reviewCSS.slice(reviewCSS.indexOf('/* AAF calm premium screen theme.'));
const themeOpen=themeTail.indexOf('{',themeTail.indexOf('@media screen'));
let themeDepth=1,themeEnd=themeOpen+1;
for(;themeEnd<themeTail.length&&themeDepth;themeEnd++){
  if(themeTail[themeEnd]==='{')themeDepth++;
  else if(themeTail[themeEnd]==='}')themeDepth--;
}
assert.equal(themeDepth,0,'screen theme is bounded independently of later receipt/print styles');
const shadowTheme=themeTail.slice(0,themeEnd);
const declarations=value=>[...stripComments(value).matchAll(/(?:\{|;)\s*([\w-]+)\s*:\s*([^;{}]+)/g)].map(m=>[m[1],m[2].trim()]);
const pure=preview.split('// BEGIN PURE SYNTHETIC DATA')[1].replace(/^[^\n]*\n/,'').split('// END PURE SYNTHETIC DATA')[0];
const fixture=vm.runInNewContext('(function(){'+pure+';return {createSyntheticData,calculateSyntheticRow};})()');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('premium theme is screen-only, live-root scoped, and does not change hidden/interaction semantics',()=>{
  assert.ok(stripComments(outer).startsWith('@media screen {'));
  assert.ok(stripComments(shadowTheme).startsWith('@media screen {'));
  const imageURLs=[...stripComments(outer).matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi)].map(m=>m[1]);
  assert.deepEqual(imageURLs,['./assets/aaf-factory-background.webp'],'only the one same-origin factory asset is permitted');
  assert.doesNotMatch(stripComments(shadowTheme),/url\(/i,'the shadow theme does not fetch assets');
  for(const text of [outer,shadowTheme]){
    assert.doesNotMatch(stripComments(text),/@import|https?:|data:|@media\s+print|@font-face|content\s*:/i,'no remote assets, print overrides or invented business text');
    for(const [property,value] of declarations(text)){
      assert.ok(!['visibility','pointer-events','overflow','overflow-x','overflow-y','contain','transform','animation','order'].includes(property),property+' changes behavior');
      if(property==='display')assert.ok(['none !important','none','block'].includes(value),'only hidden safety and existing annotation-form display are allowed');
    }
  }
  assert.equal((outer.match(/display\s*:/g)||[]).length,1);
  const formDisplay=[...stripComments(shadowTheme).matchAll(/([^{}]+)\{([^{}]*\bdisplay\s*:[^{}]*)\}/g)].map(m=>[m[1].trim(),m[2].match(/\bdisplay\s*:\s*([^;]+)/)[1].trim()]);
  assert.deepEqual(formDisplay,[
    ['.annotation-unlock-form > label','block'],
    ['.annotation-tools #notes-import-preview:empty','none'],
    ['.annotation-tools #notes-import-preview td small','block'],
    ['[data-managed-annotations="true"] .notes-draft-warning','none']
  ],'only the retained annotation form may have display styling; data/card visibility stays untouched');
  assert.match(outer,/body\[data-aaf-premium\] \[hidden\]\s*\{\s*display:\s*none !important;/);
  for(const match of stripComments(outer).matchAll(/([^{}]+)\{/g)){
    if(match[1].trim().startsWith('@'))continue;
    assert.ok(match[1].trim().startsWith('body[data-aaf-premium'),match[1]);
    if(/\.ss-/.test(match[1]))assert.match(match[1],/#stock-summary/,'report decorations require the live root ID');
  }
  assert.match(outer,/:focus-visible\s*\{\s*outline:\s*3px/);
  assert.match(shadowTheme,/prefers-reduced-motion:\s*reduce/);
  assert.match(shadowTheme,/textarea:disabled/);
  assert.match(reviewCSS,/\.changes-toolbar button:disabled\{opacity:\.55;cursor:not-allowed\}/,'existing disabled save button styling is retained');
  assert.match(reviewCSS,/\[hidden\]\{display:none!important\}/,'original hidden guard survives the append-only theme');
});

test('PNG exports cannot inherit premium report selectors and retain the existing export layout',()=>{
  const cloneCreation=summary.slice(summary.indexOf("box=document.createElement('div')"),summary.indexOf('document.body.append(box)'));
  assert.match(cloneCreation,/box\.dataset\.aafStockSummary=''/);
  assert.match(cloneCreation,/box\.className='ss-export'/);
  assert.doesNotMatch(cloneCreation,/box\.id\s*=|setAttribute\(['"]id/);
  assert.match(cloneCreation,/background:white/);
  assert.doesNotMatch(stripComments(outer),/\.ss-export/,'the live theme must not target export classes');
  assert.match(summary,/\.ss-export \.ss-card-toggle\{display:none\}/);
  assert.match(summary,/\.ss-export \.ss-thickness-production-tools\{display:none\}/);
  assert.match(summary,/capturedThickness=new Set\(expandedThickness\)/);
  assert.match(summary,/capturedProduction=new Set\(expandedThicknessProduction\)/);
});

test('both entries opt in to the same theme and refresh only the matching presentation assets',()=>{
  const versions=[];
  for(const name of ['stock_manager.html','stock_report.html']){
    const text=read('../'+name);
    assert.equal((text.match(/data-aaf-premium="ivory"/g)||[]).length,1);
    const theme=[...text.matchAll(/stock_premium\.css\?v=([^"']+)/g)],review=[...text.matchAll(/stock_order_review\.js\?v=([^"']+)/g)];
    assert.equal(theme.length,1);assert.equal(review.length,1);
    assert.match(theme[0][1],/^\d{8}-[a-z0-9-]+$/);assert.match(review[0][1],/^\d{8}-[a-z0-9-]+$/);
    versions.push({theme:theme[0][1],review:review[0][1]});
  }
  assert.deepEqual(versions[0],versions[1],'owner and Sales04 cannot serve different presentation versions');
  const reviewVersions=[...read('../stock_order_review.js').matchAll(/stock_order_review\.css\?v=([^'"\s]+)/g)].map(m=>m[1]);
  assert.ok(reviewVersions.length>0);assert.ok(reviewVersions.every(v=>v===versions[0].review),'renderer cache key is paired with its stylesheet');
});

test('synthetic full summary covers exact sizes, separate units, zero stock and saved manual Free without mutation',()=>{
  const f=salesOnlyFixture('2030-12'),{stock,catalog,savedCatalog}=fixture.createSyntheticData('2030-12',f),before=JSON.stringify({stock,catalog,savedCatalog});
  const context={window:{AAFOrderHeader:header},document:{getElementById:()=>null,createElement:()=>({}),head:{append(){}}}};
  vm.runInNewContext(summary,context);
  const api=context.window.AAFStockSummary,m=api.buildModel(stock,fixture.calculateSyntheticRow),decorated=api.withSavedCatalog(m,savedCatalog,null),html=api.renderHTML(decorated);
  const composition=header.physicalComposition(stock.rows);
  assert.equal(stock.rows.length,10);assert.equal(new Set(stock.rows.map(r=>r.key)).size,10);
  assert.equal(composition.status,'verified-quantities');assert.deepEqual(composition.quantity,{sheet:575,strip:1200});
  assert.equal(composition.groups.normal.quantity,495);assert.equal(composition.groups.nonstandard.quantity,80);
  assert.equal(m.total.byUnit.sheet.qty,575);assert.equal(m.total.byUnit.strip.qty,1200);
  near(m.total.byUnit.sheet.reservedProductionQty,29.75);
  assert.equal(m.rows.find(r=>r.key==='w2440_l1220_t1.6_gB').freeQty,75,'manual Free remains 75, not recalculated to 50');
  assert.equal(m.rows.filter(r=>r.qty===0).length,2,'retained zero rows remain in the registry');
  const snapshot=notes.parseSnapshot(stock,catalog,Date.parse('2030-12-02T01:00:00Z')).snapshot;
  assert.equal(snapshot.savedStockRegistry.rows.length,10);assert.equal(snapshot.rows.length,9,'only notes share the reversed-size identity');
  assert.equal(snapshot.canSave,true);assert.equal(snapshot.canEditFollowup,true);
  assert.match(html,/data-thickness-toggle="1.6"/);assert.match(html,/id="stock-order-review-slot"/);
  assert.match(html,/ไม้แถบ/);assert.match(html,/ยังไม่ทราบราคา|รอราคา/);
  assert.equal(JSON.stringify({stock,catalog,savedCatalog}),before,'theme fixture/model builders never modify source objects');
});

test('preview uses actual modules, intercepts all transport and never contacts real APIs or the export CDN',()=>{
  assert.match(preview,/SYNTHETIC/);
  for(const file of ['stock_order_header.js','stock_readiness.js','stock_review_notes_bridge.js','stock_order_review.js','stock_order_controller.js','stock_summary.js'])assert.ok(preview.includes('../'+file));
  assert.match(preview,/AAFStockSummary\.update\(stock,calculateSyntheticRow\)/);
  assert.match(preview,/await window\.AAFOrderReview\.attach/);
  assert.match(preview,/window\.fetch=async/);assert.match(preview,/options\.method!==['"]GET['"]/);
  assert.doesNotMatch(preview,/https?:\/\/|localStorage|sessionStorage|nativeFetch|originalFetch|navigator\.sendBeacon/);
  assert.match(preview,/window\.html2canvas=async\(\)=>\{throw Error/);
  assert.match(preview,/data-aaf-premium="ivory"/);
  const module=preview.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import \{salesOnlyFixture\} from '\.\/stock-sales-only-fixture\.mjs';/,'');
  assert.doesNotThrow(()=>new vm.Script('(async function(){'+module+'})'),'the browser module parses');
});
