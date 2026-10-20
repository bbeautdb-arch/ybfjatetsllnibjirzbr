import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../stock_report.js',import.meta.url),'utf8');
const existing=fs.readFileSync(new URL('./stock-report.mjs',import.meta.url),'utf8');
const fixture=existing.slice(existing.indexOf('async function setup'),existing.indexOf('const data='))
  .replace('const updates=[],errors=[],requests=[],polls=[],events={};','const updates=[],errors=[],requests=[],polls=[],events={},access=[],invalidations=[],order=[];')
  .replace('const window={AAFStockSummary:{update:(data,calc)=>updates.push({data,calculated:calc(data.rows[0])}),','const window={AAFSalesPreview:{setAccess(value){access.push(value);order.push("access");},invalidate(value){invalidations.push(value);}},AAFStockSummary:{update:(data,calc)=>{order.push("update");updates.push({data,calculated:calc(data.rows[0])});},')
  .replace('return{nodes,updates,errors,requests,polls,events,document,tick,','return{nodes,updates,errors,requests,polls,events,document,tick,access,invalidations,order,');
const {setup}=vm.runInNewContext(`const source=${JSON.stringify(source)};${fixture};({setup})`,{vm,JSON,Promise,Error,console,setImmediate,AbortController});
const data={ok:true,revision:58,actor:{owner:true},report:{reportDate:'2026-10-18'},rows:[{key:'synthetic',w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',qty:100,committedQty:10,freeQty:90,priceObj:{price:2,currency:'USD'}}],exchangeRate:33};
test('standalone report supplies current authoritative snapshot before summary mount, for owner and sales',async()=>{
  for(const owner of [true,false]){const value={...data,actor:{owner}},r=await setup({stockSessionToken:'synthetic'},[{data:value}]);assert.deepEqual([...r.order],['access','update']);assert.equal(r.access[0].refreshReport,true);assert.equal(r.access[0].salesMode,!owner);assert.equal(r.access[0].reportDate,'2026-10-18');assert.equal(r.access[0].revision,58);assert.equal(r.access[0].rows[0].qty,100);}
});
test('standalone auth failure invalidates pending controller reads as well as clearing report',async()=>{
  const r=await setup({stockSessionToken:'synthetic'},[{data},{status:401}]);r.polls[0]();await r.tick();assert.equal(r.invalidations.length,1);assert.match(r.invalidations[0],/เข้าสู่ระบบ/);assert.equal(r.errors.length,1);
});
test('both report entry points cache-bust the complete-ledger model/controller/summary assets',()=>{
  for(const page of ['stock_report','stock_manager']){const html=fs.readFileSync(new URL('../'+page+'.html',import.meta.url),'utf8');assert.ok(html.includes('stock_sales_preview.js?v=20261019-notes-only'));assert.ok(html.includes('stock_sales_controller.js?v=20261019-notes-only'));for(const file of ['stock_order_header','stock_summary'])assert.ok(html.includes(file+'.js?v=20261020-monthly-overview'));for(const file of ['stock_order_controller','stock_review_notes_bridge'])assert.ok(html.includes(file+'.js?v=20261020-annotation-save'));assert.ok(html.includes('stock_order_review.js?v=20261020-money-details'));}
  assert.match(fs.readFileSync(new URL('../stock_report.html',import.meta.url),'utf8'),/stock_report.js\?v=20261020-monthly-overview/);
  assert.match(fs.readFileSync(new URL('../stock_manager.html',import.meta.url),'utf8'),/stock_shared.js\?v=20261020-monthly-overview/);
});
