import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const code=readFileSync(new URL('../stock_cash.js',import.meta.url),'utf8');
const context={window:{}};vm.runInNewContext(code,context);const api=context.window.AAFStockCash;
const row=(extra={})=>({key:'w1220_l2440_t1.6_gB',w:1220,l:2440,t:1.6,grade:'B',unit:'sheet',qty:100,committedQty:20,freeQty:80,priceConfirmed:true,priceObj:{price:2,currency:'THB'},...extra});
const build=rows=>api.build({report:{reportDate:'2026-09-10'},revision:28,updatedAt:'2026-09-11T04:00:00+07:00',exchangeRate:35,rows});
test('aggregate reservations do not invent confirmed, forecast, receipt or unpaid data',()=>{
 const m=build([row()]);for(const k of ['confirmedQty','forecastQty','paidQty','partialQty','unpaidQty','received','outstanding','forecastValue'])assert.equal(m.rows[0][k],null);
 const html=api.render(m);assert(html.includes('ยังไม่มีหลักฐาน'));assert(html.includes('ยังไม่มียอดจองหน้า 09'));assert(!html.includes('รับแล้ว ฿ 0'));
});
test('stock balance preserves per-spec shortages instead of netting against other free stock',()=>{
 const m=build([row({qty:100,committedQty:130,freeQty:0}),row({key:'w1260_l2440_t1.6_gB',w:1260,qty:50,committedQty:0,freeQty:50})]);
 assert.equal(m.totals[0].physical,150);assert.equal(m.totals[0].free,50);assert.equal(m.totals[0].shortage,30);
});
test('manual free remains separate and valuation uses calculated remainder',()=>{
 const r=build([row({qty:60,committedQty:20,freeQty:45,freeOverride:{at:'today'}})]).rows[0];
 assert.equal(r.free,40);assert.equal(r.savedFree,45);assert.equal(r.freeDifference,5);assert.equal(r.freeValue,80);
});
test('missing and unconfirmed prices leave unknown value, with explicit partial coverage',()=>{
 const m=build([row(),row({key:'w1260_l2440_t1.6_gB',w:1260,qty:50,priceConfirmed:false,priceMissing:false})]);
 assert.equal(m.knownStockValue,200);assert.equal(m.unpricedQty,50);assert.equal(m.rows[1].stockValue,null);
 const zero=build([row({priceObj:{price:0,currency:'THB'}})]);assert.equal(zero.rows[0].stockValue,null);
});
test('zero stock is real zero value but unknown payment evidence',()=>{
 const m=build([row({qty:0,committedQty:20,freeQty:0,priceConfirmed:false,note:'ผลิตเพิ่ม'})]);
 assert.equal(m.rows[0].stockValue,0);assert.equal(m.rows[0].received,null);assert.equal(m.rows[0].shortage,20);assert.equal(m.rows[0].note,'ผลิตเพิ่ม');
});
test('unit totals are separate and currencies require valid FX',()=>{
 const m=build([row({qty:20,priceObj:{price:3,currency:'USD'}}),row({unit:'strip',qty:1000,priceObj:{price:0.5,currency:'THB'}})]);
 assert.equal(m.totals.length,2);assert.equal(m.totals[0].knownStockValue,2100);assert.equal(m.totals[1].knownStockValue,500);
 assert.equal(build([row({priceObj:{price:3,currency:'EUR'}})]).rows[0].stockValue,null);
 const noFX=api.build({report:{reportDate:'2026-09-10'},rows:[row({priceObj:{price:3,currency:'USD'}})]});assert.equal(noFX.rows[0].stockValue,null);assert(!api.render(noFX).includes('NaN'));
 assert.throws(()=>build([row({unit:undefined})]));
});
test('input validation, precision and no source mutation',()=>{
 const source=row({qty:10,committedQty:2.55,freeQty:7.45,note:'<script>alert(1)</script>',followup:'\" & text',followupBy:'ฝ่ายขาย',followupAt:'2026-09-10T12:00:00+07:00'});
 Object.freeze(source.priceObj);Object.freeze(source);const before=JSON.stringify(source),m=build([source]);assert.equal(m.rows[0].free,7.45);assert.equal(JSON.stringify(source),before);
 assert(!api.render(m).includes('<script>'));assert(api.render(m).includes('&lt;script&gt;'));assert.equal(m.rows[0].followupBy,'ฝ่ายขาย');
 for(const qty of [-1,NaN,Infinity,undefined,1.234])assert.throws(()=>build([row({qty})]));
 assert.throws(()=>build([row(),row()]));assert.throws(()=>build([row({key:'wrong-spec'})]));assert.throws(()=>build([]));
 assert(!/localStorage|sessionStorage|fetch\(|XMLHttpRequest|\.post\(/.test(code));
});
test('fictional example balances and never fills live money gaps',()=>{
 const {rows,totals:t}=api.example();assert.equal(t.stockValue,199875);assert.equal(t.received,32000);assert.equal(t.outstanding,70500);assert.equal(t.forecastValue,31000);assert.equal(t.freeValue,66375);assert.equal(t.future,167875);
 assert.equal(t.stockValue,t.received+t.future);assert.equal(t.physical,t.allocated+t.forecast+t.free);assert.equal(t.confirmed,t.allocated+t.shortage);assert.equal(t.shortage,200);
 for(const r of rows){assert.equal(r.physical,r.allocated+r.forecast+r.free);assert.equal(r.confirmed,r.paid+r.partial+r.unpaid);assert.equal(r.stockValue,r.received+r.outstanding+r.forecastValue+r.freeValue);}
 assert(api.renderExample().includes('ข้อมูลสมมติทั้งหมด'));assert.equal(build([row()]).received,null);
});
test('cash assets are loaded on both pages and staged for deployment',()=>{
 for(const name of ['stock_manager.html','stock_report.html']){const src=readFileSync(new URL('../'+name,import.meta.url),'utf8');assert(src.includes('stock_cash.css?v=20260911-cash'));assert(src.indexOf('stock_cash.js')<src.indexOf('stock_summary.js'));}
 const workflow=readFileSync(new URL('../.github/workflows/static.yml',import.meta.url),'utf8');assert(workflow.includes('./*.css _site/'));assert(workflow.includes('tests/stock-cash.mjs'));
});
