import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = name => fs.readFileSync(new URL('../'+name, import.meta.url), 'utf8');
const context = {window:{}};
vm.runInNewContext(read('stock_filters.js'),context);
const {matches} = context.window.AAFStockFilters;
const rows = [
  {key:'absent',w:'1220',l:'2440',t:'1.6',grade:'B',qty:0,committedQty:20,freeQty:0,note:'เก็บข้อความ'},
  {key:'reserved',w:'1220',l:'2440',t:'1.8',grade:'AAA',qty:50,committedQty:50,freeQty:0},
  {key:'free',w:'1260',l:'2440',t:'3',grade:'B',qty:100,committedQty:0,freeQty:100}
];
const before=JSON.stringify(rows);
assert.equal(rows.filter(r=>matches(r)).length,3,'default includes all catalog rows');
assert.deepEqual(rows.filter(r=>matches(r,{hideZero:true})).map(r=>r.key),['reserved','free'],'filter Physical, never Free');
assert.deepEqual(rows.filter(r=>matches(r,{hideZero:true,grade:'AAA'})).map(r=>r.key),['reserved']);
assert.equal(rows.filter(r=>matches(r,{hideZero:false,grade:'B'})).length,2);
assert.equal(JSON.stringify(rows),before,'view filter cannot mutate rows or annotations');
const shared=read('stock_shared.js'),page=read('stock_manager.html');
const nodes=Object.fromEntries(['t','w','l','grade'].map(k=>['view-'+k,{value:''}]));
nodes['view-hide-zero']={checked:false};
const testContext={window:context.window,shared:{rows},$:id=>nodes[id]};
vm.runInNewContext(shared.slice(shared.indexOf('  function filtered('),shared.indexOf('  function values(')),testContext);
assert.equal(testContext.filtered().length,3);
nodes['view-hide-zero'].checked=true;assert.equal(testContext.filtered().length,2);
nodes['view-hide-zero'].checked=false;assert.equal(testContext.filtered().length,3);
assert.equal(JSON.stringify(rows),before);
assert(shared.includes('document.querySelectorAll(\'[data-draft],[data-price],[data-currency]\').forEach'), 'rerender restores keyed drafts');
assert(shared.includes('function reportRows(data){return data.rows.map'), 'Excel remains full catalog, not display-filtered');
assert(shared.includes('data.rows.filter(r=>r.rawSource!==false)'), 'raw table excludes retained rows');
assert(shared.includes('sku:r.rawSku??r.sku'), 'raw table uses current mail SKU, not historical alias union');
assert(shared.includes('currentStockData=data.rows'), 'compatibility cache receives full data');
assert(shared.includes('restoreStockHideZero();'));
assert(page.includes('ซ่อนสต๊อก 0 (Physical)'));
assert(page.indexOf('src="stock_filters.js')<page.indexOf('src="stock_shared.js'));
assert(!/fetch\(|localStorage|\.splice\(|\.sort\(/.test(read('stock_filters.js')),'pure filter has no writes');

const reportContext={window:{},document:{getElementById:()=>null,createElement:()=>({}),head:{append(){}}}};
vm.runInNewContext(read('stock_summary.js'),reportContext);
const sample={...rows[0],sku:'B0012202440016',desc:'รายการเดิม',size:'Normal',baseQty:0,rawSource:false,retained:true,d90:0,d180:0,d270:0,d360:0,dOver:0,priceObj:{price:55,currency:'THB'},followup:'ติดตามแล้ว'};
const data={report:{reportDate:'2026-09-10',sourceRowCount:1},rows:[sample],exchangeRate:33};
const {buildModel,renderHTML}=reportContext.window.AAFStockSummary;
const model=buildModel(data,()=>({price:55,curr:'THB',eq:0,value:0,freeValue:0}));
const html=renderHTML(model);
assert(html.includes('B0012202440016'));assert(html.includes('เก็บรายการสินค้าเดิม · ไม่พบในเมลวันนี้'));
assert(html.includes('ติดตามแล้ว'));assert(html.includes('เก็บข้อความ'));
assert.equal(model.total.committedQty,20);assert.equal(model.total.qty,0);
assert(!html.includes('สเปกหลังโยก/ต้องผลิต — ไม่มี SKU'));
console.log('Catalog UI passed: show/hide Physical zero, filter-only behavior, full exports/cache, exact raw SKU, retained-row report.');
