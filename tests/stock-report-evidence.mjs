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
  const sharedVersions=new Map();
  const assets=['stock_sales_preview','stock_sales_controller','stock_order_header','stock_summary','stock_order_controller','stock_production_planner','stock_readiness','stock_review_notes_bridge','stock_order_review','stock_sales_groups','stock_sales_receipts','stock_current_sales_groups','stock_sales_groups_view'];
  for(const page of ['stock_report','stock_manager']){
    const html=fs.readFileSync(new URL('../'+page+'.html',import.meta.url),'utf8');
    const assertVersioned=file=>{
      const loads=[...html.matchAll(new RegExp('<script\\b[^>]*\\bsrc="('+file+'\\.js[^" ]*)"[^>]*>', 'g'))];
      assert.equal(loads.length,1,page+' must load exactly one '+file+' asset');
      const version=loads[0][1].match(new RegExp('^'+file+'\\.js\\?v=([A-Za-z0-9._-]+)$'))?.[1];
      assert.ok(version,page+' must cache-version '+file);
      return version;
    };
    for(const file of assets){
      const version=assertVersioned(file);
      if(sharedVersions.has(file))assert.equal(version,sharedVersions.get(file),'owner and Sales04 must use the same '+file+' release');
      else sharedVersions.set(file,version);
    }
    for(const [dependency,consumer] of [
      ['stock_sales_preview','stock_sales_controller'],['stock_sales_groups','stock_current_sales_groups'],['stock_sales_receipts','stock_current_sales_groups'],
      ['stock_current_sales_groups','stock_order_header'],['stock_sales_groups','stock_sales_groups_view'],['stock_sales_receipts','stock_sales_groups_view'],
      ['stock_sales_groups_view','stock_order_review'],['stock_review_notes_bridge','stock_order_review'],['stock_order_review','stock_order_controller'],
      ['stock_order_header','stock_summary'],['stock_production_planner','stock_summary'],['stock_readiness','stock_summary']
    ]){
      assert.ok(html.indexOf(dependency+'.js?')<html.indexOf(consumer+'.js?'),dependency+' must load before '+consumer);
    }
    const reader=page==='stock_report'?'stock_report':'stock_shared';assertVersioned(reader);
    assert.ok(html.indexOf('stock_summary.js?')<html.indexOf(reader+'.js?'),'summary and readers retain their initialization order');
    assert.ok(html.includes('rel="manifest" href="manifest.webmanifest"'),'preserve the newer shortcut icon release');
  }
});
test('existing refresh lifecycle synchronizes both views and checks month before dirty or busy guards without adding timers',()=>{
  const shared=fs.readFileSync(new URL('../stock_shared.js',import.meta.url),'utf8');
  for(const script of [shared,source])assert.equal((script.match(/\bsetInterval\(/g)||[]).length,1,'keep one existing interval per entry');
  assert.match(shared,/setInterval\(async\(\)=>\{window\.AAFOrderReview\?\.checkCurrentMonth\?\.\(\);if\(accessDenied\|\|busy\|\|dirty\|\|editing\(\)\|\|document\.hidden\)return/);
  assert.match(source,/async function load\(force=false\)\{\s*window\.AAFOrderReview\?\.checkCurrentMonth\?\.\(\);\s*if\(busy\)return/);
  assert.match(shared,/setRefreshHandler\?\.\(refresh\)/);assert.match(source,/setRefreshHandler\?\.\(\(\)=>load\(true\)\)/);
  for(const script of [shared,source])assert.match(script,/syncCurrentSource\?\.\(\{revision:[^}]*currentMonthSold:[^}]*currentAllocation:/);
});
