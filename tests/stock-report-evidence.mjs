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
test('both report entry points cache-bust the current sold renderer and auth controller, preserving unrelated assets',()=>{
  for(const page of ['stock_report','stock_manager']){
    const html=fs.readFileSync(new URL('../'+page+'.html',import.meta.url),'utf8');
    assert.ok(html.includes('stock_sales_preview.js?v=20261019-notes-only'));assert.ok(html.includes('stock_sales_controller.js?v=20261019-notes-only'));
    for(const file of ['stock_order_header','stock_summary','stock_order_controller']){
      const version=file==='stock_order_controller'?'20261104-selected-month-dashboard-r1':file==='stock_summary'?'20261105-production-cost-r1':'20261104-grade-totals-r1';
      const expected=new RegExp('<script\\s+src="'+file+'\\.js\\?v='+version+'"><\\/script>','g');
      assert.equal([...html.matchAll(expected)].length,1,page+' must load exactly one current '+file+' asset');
      assert.doesNotMatch(html,new RegExp(file+'\\.js\\?v=20261020-monthly-overview'),page+' must not retain a cached dated-stock renderer');
    }
    assert.ok(html.indexOf('stock_order_header.js?')<html.indexOf('stock_summary.js?'),'current warehouse adapter must load before summary');
    assert.equal((html.match(/stock_production_planner\.js\?v=20261105-production-cost-r1/g)||[]).length,1);
    assert.ok(html.indexOf('stock_production_planner.js?')<html.indexOf('stock_summary.js?'),'production estimator loads before summary');
    assert.ok(html.includes('stock_readiness.js?v=20261103-stock-readiness-r1'));assert.ok(html.indexOf('stock_readiness.js?')<html.indexOf('stock_summary.js?'));
    assert.ok(html.includes('stock_review_notes_bridge.js?v=20261103-saved-registry-r1'));
    assert.ok(html.includes('stock_order_review.js?v=20261104-three-sales-groups-r1'));
    for(const asset of ['stock_sales_groups','stock_sales_groups_view']){
      assert.equal((html.match(new RegExp(asset+'\\.js\\?v=20261104-three-sales-groups-r1','g'))||[]).length,1);
      assert.ok(html.indexOf(asset+'.js?')<html.indexOf('stock_order_review.js?'),'grouping dependencies load before review');
    }
    assert.ok(html.includes('rel="manifest" href="manifest.webmanifest"'),'preserve the newer shortcut icon release');
  }
  assert.match(fs.readFileSync(new URL('../stock_report.html',import.meta.url),'utf8'),/stock_report.js\?v=20261103-current-month-review-r1/);
  assert.match(fs.readFileSync(new URL('../stock_manager.html',import.meta.url),'utf8'),/stock_shared.js\?v=20261103-current-month-review-r1/);
});
test('existing refresh lifecycle synchronizes both views and checks month before dirty or busy guards without adding timers',()=>{
  const shared=fs.readFileSync(new URL('../stock_shared.js',import.meta.url),'utf8');
  for(const script of [shared,source])assert.equal((script.match(/\bsetInterval\(/g)||[]).length,1,'keep one existing interval per entry');
  assert.match(shared,/setInterval\(async\(\)=>\{window\.AAFOrderReview\?\.checkCurrentMonth\?\.\(\);if\(accessDenied\|\|busy\|\|dirty\|\|editing\(\)\|\|document\.hidden\)return/);
  assert.match(source,/async function load\(force=false\)\{\s*window\.AAFOrderReview\?\.checkCurrentMonth\?\.\(\);\s*if\(busy\)return/);
  assert.match(shared,/setRefreshHandler\?\.\(refresh\)/);assert.match(source,/setRefreshHandler\?\.\(\(\)=>load\(true\)\)/);
  for(const script of [shared,source])assert.match(script,/syncCurrentSource\?\.\(\{revision:[^}]*currentMonthSold:[^}]*currentAllocation:/);
});
