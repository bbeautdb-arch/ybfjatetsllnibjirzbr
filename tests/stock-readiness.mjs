import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),api=require('../stock_readiness.js'),header=require('../stock_order_header.js'),copy=v=>JSON.parse(JSON.stringify(v)),u=(sheet,strip=0)=>({sheet,strip});
// Invented evidence only. Donor and requested sizes deliberately differ.
function fixture(){
  const month=header.currentBangkokMonth(),capturedAt=new Date().toISOString(),checksum='sha256:'+'a'.repeat(64),planChecksum='sha256:'+'b'.repeat(64),reportDate=month+'-01';
  const sold={version:1,status:'verified-quantities',month,source:{page:9,capturedAt,sourceIsLive:false,checksum,orderCount:8,lineCount:10},quantity:u(22,7),loaded:u(10,2),paidOrDeposit:u(12,5),lcETD:u(0),orderCount:2,lineCount:2};
  const allocation={version:1,status:'verified-allocation',month,source:{page:9,capturedAt,sourceIsLive:false,checksum},stock:{revision:8,reportDate,planChecksum,planCapturedAt:capturedAt},current:{soldUnloaded:{demand:u(12,5),allocated:u(10,4),shortage:u(2,1)},other:{demand:u(8,4),allocated:u(7,3),shortage:u(1,1)}},carry:{demand:u(5.25,4),allocated:u(3,3),shortage:u(2.25,1)},totals:{physical:u(100,10),demand:u(25.25,13),allocated:u(20,10),shortage:u(5.25,3),formulaFree:u(80),savedFree:u(78),manualFreeDelta:u(-2)},manualFreeOverrideCount:1};
  const row=(sku,qty,committedQty,freeQty,extra={})=>{const r={sku,desc:'Synthetic only',w:1220,l:2440,t:2.5,grade:'B',unit:'sheet',qty,committedQty,freeQty,baseQty:qty,d90:qty,d180:0,d270:0,d360:0,dOver:0,...extra};return {...r,key:`w${r.w}_l${r.l}_t${r.t}_g${r.grade}`};};
  return {revision:8,reportDate,report:{reportDate,sourceRowCount:4},exchangeRate:30,rows:[row('SYNTH-DONOR',30,20,10),row('SYNTH-REQUESTED',0,5.25,0,{w:1200,l:2400}),row('SYNTH-SPARE',70,0,68,{w:1000,l:2000,manualFreeOverride:true,freeOverride:{value:68,at:capturedAt,reportDate}}),row('SYNTH-STRIP',10,13,0,{w:25,l:1000,unit:'strip'})],sellablePlan:{checksum:planChecksum,source:{capturedAt}},currentMonthSold:sold,currentAllocation:allocation};
}
test('readiness reproduces saved per-row allocations and exact shortages without substituting equivalent donor stock again',()=>{
  const stock=fixture(),before=JSON.stringify(stock),view=api.build(stock);
  assert.equal(view.status,'verified');assert.equal(JSON.stringify(stock),before);assert.deepEqual(view.totals.physical,u(100,10));assert.deepEqual(view.totals.allocated,u(20,10));assert.deepEqual(view.totals.shortage,u(5.25,3));
  assert.equal(view.shortages.length,2);const sheet=view.shortages.find(r=>r.unit==='sheet');assert.equal(sheet.w,1200);assert.equal(sheet.l,2400);assert.equal(sheet.shortage,5.25);assert.equal(sheet.allocated,0,'spare equivalent donor must not be consumed again');
  assert.equal(view.current.soldUnloaded.demand.sheet,12);assert.equal(view.carry.demand.sheet,5.25);assert.equal(view.totals.demand.sheet,25.25,'loaded10 not deducted again and current sales22 is not warehouse demand');
});
test('manual Free is preserved and separately explained; unproven discrepancies fail closed',()=>{
  const stock=fixture(),view=api.build(stock),html=api.render(view);
  assert.deepEqual(view.totals.formulaFree,u(80));assert.deepEqual(view.totals.savedFree,u(78));assert.deepEqual(view.totals.manualFreeDelta,u(-2));assert.equal(view.manualFreeOverrideCount,1);
  assert.match(html,/Free ที่บันทึกจริง: 78 แผ่น/);assert.match(html,/ส่วนต่างจากสูตร -2 แผ่น/);assert.match(html,/คงค่าที่บันทึก ไม่ล้าง/);assert.match(html,/ภาระที่ผูกกับสเปกในแผน/);assert.doesNotMatch(html,/ยอดสั่งขายตามสเปก/);
  delete stock.rows[2].manualFreeOverride;delete stock.rows[2].freeOverride;assert.equal(api.build(stock).status,'pending');
});
test('invalid or stale current source, rows, plan and per-spec conservation do not produce fabricated totals',()=>{
  for(const mutate of [s=>delete s.currentAllocation,s=>s.currentAllocation.stock.revision++,s=>s.currentAllocation.month='2000-10',s=>s.currentAllocation.source.checksum='sha256:'+'c'.repeat(64),s=>s.rows[1].unit='unknown',s=>s.rows[1].key=s.rows[0].key,s=>s.rows[1].w=1300,s=>s.rows[1].t=3.2,s=>s.rows[1].grade='A',s=>s.rows[1].reservedProductionQty=0,s=>s.rows[1].productionQty=0,s=>s.rows[0].reservedInStockQty=0,s=>s.rows[1].committedQty=5.251,s=>s.rows[1].committedQty=NaN,s=>s.rows[0].freeQty=11]){
    const stock=fixture();mutate(stock);const view=api.build(stock);assert.equal(view.status,'pending');assert.equal(view.totals,undefined);assert.equal(view.shortages,undefined);assert.doesNotMatch(api.render(view),/data-readiness-shortage-key|ยังไม่มีของ · ต้องผลิตเพิ่ม/);
  }
});
test('exact-size reversed duplicate rows sum already-split shortages, never take min after grouping and never mix units',()=>{
  const stock=fixture(),r=stock.rows[1];stock.rows[1]={...r,committedQty:2.25};stock.rows.push({...r,key:'w2400_l1200_t2.5_gB',w:2400,l:1200,committedQty:3});
  const view=api.build(stock);assert.equal(view.status,'verified');const row=view.shortages.find(r=>r.unit==='sheet');assert.equal(row.sourceRowCount,2);assert.equal(row.shortage,5.25);assert.equal(view.shortages.find(r=>r.unit==='strip').shortage,3);
  const html=api.render(view);assert.match(html,/รวมต้องผลิตเพิ่ม · แผ่น/);assert.match(html,/รวมต้องผลิตเพิ่ม · ชิ้นไม้แถบ/);assert.doesNotMatch(html,/8\.25 แผ่น/);
  assert.match(html,/ยอดขาดมีทศนิยม/);assert.match(html,/ไม่ปัดเป็นจำนวนสั่งผลิต/);assert.match(html,/ภาระทั้งหมดในแผนที่บันทึก/);assert.doesNotMatch(html,/ภาระรอส่งทุกเดือน|ภาระรอส่งทั้งคลัง/);
});
test('Bangkok month rollover hides old allocation; unknown never means zero and labels keep actual mail date',()=>{
  const stock=fixture(),view=api.build(stock),[year,month]=view.month.split('-').map(Number),next=Date.UTC(year,month,1)-7*3600000;
  assert.equal(api.build(stock,next).status,'pending');assert.match(api.render(view),new RegExp('รายงานเมล '+stock.reportDate));assert.match(api.render(view),/การจองไม่หัก Physical ซ้ำ/);assert.match(api.render(view),/เจรจา\/Forecast ไม่จอง/);
  assert.match(api.render(api.build(stock,next)),/ยังไม่ทราบยอดที่ใช้สรุปได้/);assert.doesNotMatch(api.render(api.build(stock,next)),/data-readiness-revision/);
});
test('verified zero shortage is explicit, while the module remains read-only and data-free',()=>{
  const stock=fixture();stock.rows[1].qty=5.25;stock.rows[2].qty=64.75;stock.rows[2].freeQty=62.75;stock.rows[3].qty=13;
  const a=stock.currentAllocation;for(const group of [a.current.soldUnloaded,a.current.other,a.carry]){group.allocated={...group.demand};group.shortage=u(0);}
  Object.assign(a.totals,{physical:u(100,13),allocated:u(25.25,13),shortage:u(0),formulaFree:u(74.75),savedFree:u(72.75)});
  const view=api.build(stock);assert.equal(view.status,'verified');assert.equal(view.shortages.length,0);assert.match(api.render(view),/ไม่มีรายการขาดผลิต/);assert.doesNotMatch(api.render(view),/ยอดขาดมีทศนิยม/);
  const source=fs.readFileSync(new URL('../stock_readiness.js',import.meta.url),'utf8');assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|setInterval|setTimeout)\b/);
});
test('unavailable Page09 review preserves verified warehouse readiness but cannot substitute legacy sold totals',()=>{
  const nodes={cards:{innerHTML:'',querySelectorAll:()=>[]},source:{},status:{classList:{add(){}}}},root={classList:{remove(){}},addEventListener(){},querySelectorAll:()=>[],innerHTML:'',querySelector:s=>s==='.ss-kpis'?nodes.cards:s==='.ss-status'?nodes.status:s==='.ss-sales-summary-source'||s==='.ss-overview-source'?nodes.source:s==='.ss-download'?{addEventListener(){}}:null};
  const window={AAFOrderHeader:header,AAFStockReadiness:api};vm.runInNewContext(fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8'),{window,document:{getElementById:()=>root,createElement:()=>({}),head:{append(){}}},location:{hash:''}});
  const summary=window.AAFStockSummary,stock=fixture(),before=JSON.stringify(stock);summary.update(stock,r=>({eq:r.qty,price:1,curr:'THB',value:r.qty,freeValue:r.freeQty}));
  assert.match(root.innerHTML,/data-readiness-status="verified"/);summary.setOrderReview(null,{status:'pending'});assert.match(root.innerHTML,/data-readiness-status="verified"/);
  const card=id=>nodes.cards.innerHTML.split(`data-stock-card="${id}"`)[1]?.split('data-stock-card="')[0]||'';
  assert.match(card('physical'),/<strong>100<\/strong>/);assert.match(card('free'),/<strong>78<\/strong>/);
  assert.match(card('sold'),/ขายแล้วเดือนนี้/);assert.match(card('reserved'),/เจรจา 80%\+/);
  for(const id of ['sold','reserved']){
    assert.match(card(id),/รอชุดหน้า 09|รอสรุปกลุ่มขาย/);assert.match(card(id),/role="status"/);
    assert.doesNotMatch(card(id),/<strong>\d|22 แผ่น|8 แผ่น/,'no old sold/allocation quantity fallback without the shared Page09 groups');
  }
  assert.equal(JSON.stringify(stock),before);
});
