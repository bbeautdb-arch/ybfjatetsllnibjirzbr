import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),header=require('../stock_order_header.js'),window={};
vm.runInNewContext(fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8'),{window,document:{getElementById:()=>null,createElement:()=>({}),head:{append(){}}}});
const row=(key,qty,freeQty)=>({key,w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',qty,freeQty,committedQty:0});
function setup(rows,prices){
  const stock={revision:7,reportDate:'2000-06-02',rows};
  const catalog={revision:7,reportDate:stock.reportDate,catalogRevision:3,rows:rows.map((r,i)=>({...r,...prices[i]}))};
  return header.warehouseProjection(window.AAFStockSummary.withSavedCatalog(stock,catalog,null));
}
const pair=w=>header.render(null,new Set(),w).match(/<div class="ss-overview-value ss-physical-free-estimate"[^>]*>([\s\S]*?)<\/div>/)?.[1]||'';
test('Physical card pairs saved Free value, not Physical value or sale price',()=>{
  const w=setup([row('synthetic',10,3)],[{price:12,currency:'THB'}]);
  assert.equal(w.physical.knownValueTHB,120);assert.equal(w.free.knownValueTHB,36);
  assert.match(pair(w),/data-free-estimate-value>≈ ฿ 36</);assert.doesNotMatch(pair(w),/≈ ฿ 120/);
  assert.match(pair(w),/มูลค่า Free Stock · ราคาสต๊อก/);
});
test('paired value retains known subtotal and Free-specific missing count',()=>{
  const w=setup([row('synthetic-priced',10,3),{...row('synthetic-missing',20,4),grade:'A'}],[{price:12,currency:'THB'},{price:null,currency:'THB'}]);
  assert.match(pair(w),/≈ ฿ 36 · ส่วนที่ยืนยันได้/);assert.match(pair(w),/ขาดราคาสต๊อก 1 รายการ/);
});
test('unpriced Physical with zero Free has a true zero Free estimate',()=>{
  const w=setup([row('synthetic',10,0)],[{price:null,currency:'THB'}]);
  assert.equal(w.physical.complete,false);assert.equal(w.free.complete,true);
  assert.match(pair(w),/data-free-estimate-value>≈ ฿ 0</);assert.doesNotMatch(pair(w),/ขาดราคาสต๊อก|รอราคา\/เรท/);
});
test('all unpriced positive Free stays unknown and does not show zero',()=>{
  const w=setup([row('synthetic',10,3)],[{price:null,currency:'THB'}]);
  assert.doesNotMatch(pair(w),/≈ ฿ 0/);assert.match(pair(w),/ขาดราคาสต๊อก 1 รายการ/);
});
test('rendering the paired summary never changes the warehouse data',()=>{
  const w=setup([row('synthetic',10,13)],[{price:12,currency:'THB'}]),before=JSON.stringify(w);
  pair(w);assert.equal(JSON.stringify(w),before);assert.match(pair(w),/≈ ฿ 156/);
});
