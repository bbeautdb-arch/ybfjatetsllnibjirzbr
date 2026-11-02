import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),api=require('../stock_order_header.js');
const clone=v=>JSON.parse(JSON.stringify(v)),u=(sheet,strip=0)=>({sheet,strip});
// Invented quantities and hashes only. No company sources or business totals.
function fixture(){
  const month=api.currentBangkokMonth(),capturedAt=new Date().toISOString(),checksum='sha256:'+'a'.repeat(64),planChecksum='sha256:'+'b'.repeat(64),reportDate=month+'-01';
  const sold={version:1,status:'verified-quantities',month,source:{page:9,capturedAt,sourceIsLive:false,checksum,orderCount:8,lineCount:10},quantity:u(30,5),loaded:u(10,1),paidOrDeposit:u(12,2),lcETD:u(8,2),orderCount:3,lineCount:4};
  const allocation={version:1,status:'verified-allocation',month,source:{page:9,capturedAt,sourceIsLive:false,checksum},stock:{revision:8,reportDate,planChecksum,planCapturedAt:capturedAt},
    current:{soldUnloaded:{demand:u(20,4),allocated:u(12,3),shortage:u(8,1)},other:{demand:u(15.25,3),allocated:u(10.25,2),shortage:u(5,1)}},
    carry:{demand:u(14.75,2),allocated:u(7.75,1),shortage:u(7,1)},
    totals:{demand:u(50,9),allocated:u(30,6),shortage:u(20,3),physical:u(100,20),formulaFree:u(70,14),savedFree:u(68,14),manualFreeDelta:u(-2,0)},manualFreeOverrideCount:1};
  const row=(key,qty,committedQty,freeQty,extra={})=>({key,w:1220,l:2440,t:2.5,grade:'B',unit:'sheet',qty,committedQty,freeQty,baseQty:qty,d90:qty,d180:0,d270:0,d360:0,dOver:0,...extra});
  const rows=[row('synthetic-demand',30,50,0),row('synthetic-free',70,0,68,{t:4.5,freeOverride:{value:68,reportDate,at:capturedAt}}),row('synthetic-strip-demand',6,9,0,{w:20,l:1000,unit:'strip'}),row('synthetic-strip-free',14,0,14,{w:25,l:1000,unit:'strip'})];
  const stock={revision:8,report:{reportDate,sourceRowCount:4},reportDate,rows,exchangeRate:30,sellablePlan:{checksum:planChecksum,source:{capturedAt}},currentMonthSold:sold,currentAllocation:allocation};
  return {sold,allocation,stock,warehouse:api.warehouseProjection(stock)};
}
function card(html,id){const start=html.indexOf('<div class="ss-kpi ss-kpi-'+id+'"');if(start<0)return '';const end=html.indexOf('<div class="ss-kpi ss-kpi-',start+1);return html.slice(start,end<0?undefined:end);}
test('allocation is bound to current month, sold source, saved revision/date/plan and per-unit current row totals',()=>{
  const f=fixture(),before=JSON.stringify(f),v=api.currentAllocationView(f.allocation,f.warehouse,f.sold);
  assert.equal(v.status,'verified-allocation');assert.deepEqual(v.current.other.demand,u(15.25,3));assert.deepEqual(v.totals.savedFree,u(68,14));
  assert.equal(v.current.other.demand.sheet,v.current.other.allocated.sheet+v.current.other.shortage.sheet);
  assert.equal(v.totals.physical.sheet,v.current.soldUnloaded.allocated.sheet+v.current.other.allocated.sheet+v.carry.allocated.sheet+v.totals.formulaFree.sheet);
  assert.equal(JSON.stringify(f),before);assert.notEqual(v.current.other,f.allocation.current.other);
  for(const change of [a=>a.month='2000-10',a=>a.stock.revision++,a=>a.stock.reportDate='2000-10-01',a=>a.stock.planChecksum='sha256:'+'c'.repeat(64),a=>a.stock.planCapturedAt='2000-10-01T00:00:00Z',a=>a.source.checksum='sha256:'+'d'.repeat(64),a=>a.source.capturedAt='2000-10-01T00:00:00Z',a=>a.source.sourceIsLive=true,a=>a.current.other.demand.sheet++,a=>a.current.other.allocated.sheet=-1,a=>a.current.other.allocated.sheet=10.251,a=>a.current.other.shortage.strip=2,a=>a.totals.savedFree.sheet=70,a=>a.totals.formulaFree.strip=15,a=>a.manualFreeOverrideCount=0,a=>a.totals.physical.sheet=101,a=>a.carry.allocated.sheet=8]){
    const invalid=clone(f.allocation);change(invalid);assert.equal(api.currentAllocationView(invalid,f.warehouse,f.sold).status,'pending');
  }
  const changedSold=clone(f.sold);changedSold.loaded.sheet=9;changedSold.lcETD.sheet=9;
  assert.equal(api.currentAllocationView(f.allocation,f.warehouse,changedSold).status,'pending','sold unloaded membership must match exactly');
  assert.equal(api.currentAllocationView(f.allocation,{...f.warehouse,manualFreeOverrideCount:0},f.sold).status,'pending');
  const priorCapture='2000-10-01T00:00:00Z';
  assert.equal(api.currentAllocationView({...f.allocation,stock:{...f.allocation.stock,planCapturedAt:priorCapture}},
    {...f.warehouse,planCapturedAt:priorCapture},f.sold).status,'pending','matching plan capture cannot belong to an earlier Bangkok month');
});
test('current other demand is separate from backed stock, shortage and carry; Free is saved not formula or sales subtraction',()=>{
  const f=fixture(),html=api.render(null,new Set(),f.warehouse,'',f.sold,f.allocation),other=card(html,'reserved'),free=card(html,'free');
  assert.match(other,/<h3>จองอื่นๆ · ไม่ซ้ำขายแล้ว<\/h3>/);assert.match(other,/<strong>15.25<\/strong>/);assert.match(other,/ไม้แถบ 3 ชิ้น/);
  assert.match(other,/มีของรองรับ<\/span><b>10.25 แผ่น/);assert.match(other,/ต้องผลิตเพิ่ม<\/span><b>5 แผ่น/);assert.doesNotMatch(other,/<strong>30<\/strong>|฿ 0|USD|700/);
  assert.match(card(html,'sold'),/<strong>30<\/strong>/,'loaded sales remain in sold headline but not allocation');
  assert.match(free,/<strong>68<\/strong>/);assert.match(free,/ไม้แถบ 14 ชิ้น/);assert.match(free,/มีของรองรับขายแล้วเดือนนี้ · ยังไม่โหลด<\/span><b>12 แผ่น/);
  assert.match(free,/มีของรองรับจองอื่นเดือนนี้<\/span><b>10.25 แผ่น/);assert.match(free,/มีของรองรับยอดค้างเดือนอื่น<\/span><b>7.75 แผ่น/);
  assert.match(free,/Free ตามสูตร · Physical ลบของที่จัดสรร<\/span><b>70 แผ่น/);assert.match(free,/ปรับ Free ด้วยมือ 1 สเปก · ส่วนต่างจากสูตร<\/span><b>-2 แผ่น/);
  assert.doesNotMatch(free,/<strong>70<\/strong>|<strong>50<\/strong>/);
});
test('missing, pending and stale allocation never show old reservation quantity; saved Free stays with an explicit warning',()=>{
  const f=fixture(),archive={month:'2000-10',monthLabel:'Archived synthetic',sourceCapturedAt:'2000-10-01',fx:{rate:30,date:'2000-10-01'},reserved:{quantity:u(999),money:{sale:{THB:999,USD:999}}}};
  for(const allocation of [null,undefined,{...f.allocation,stock:{...f.allocation.stock,revision:7}},{version:1,status:'pending',month:f.sold.month,reason:'Synthetic pending'}]){
    const html=api.render(archive,new Set(),f.warehouse,'',f.sold,allocation);
    assert.doesNotMatch(card(html,'reserved'),/<strong>|999|2000-10|USD/);assert.match(card(html,'reserved'),/role="status"/);
    assert.match(card(html,'free'),/<strong>68<\/strong>/);assert.match(card(html,'free'),/Free นี้ยังเป็นยอดที่บันทึกไว้/);
  }
  const source=api.sourceText(archive,f.warehouse,undefined,undefined,f.sold,f.allocation);
  assert.match(source,/จองอื่นๆ: /);assert.match(source,/รายละเอียดหัวข้อ02: Archived synthetic/);assert.doesNotMatch(source,/เดือนขายเดียวกัน|จองอื่น\/รายละเอียด/);
});
test('DTO drops unknown properties and money; pending reason is escaped; rollover cannot preserve prior month allocation',()=>{
  const f=fixture(),input=clone(f.allocation);input.money={THB:999};input.current.other.money=999;input.source.private='hidden';
  const clean=api.currentAllocationView(input,f.warehouse,f.sold);assert.equal(clean.money,undefined);assert.equal(clean.current.other.money,undefined);assert.equal(clean.source.private,undefined);
  const html=api.render(null,new Set(),f.warehouse,'',f.sold,{version:1,status:'pending',month:f.sold.month,reason:'<img src=x onerror=bad()>'});
  assert.match(card(html,'reserved'),/&lt;img/);assert.doesNotMatch(html,/<img src=x/);
  const [year,month]=f.sold.month.split('-').map(Number),next=Date.UTC(year,month,1)-7*3600000;
  assert.equal(api.currentAllocationView(f.allocation,f.warehouse,f.sold,next).status,'pending');
});

function runtime(){
  let html='',cardsHTML='',rootWrites=0;const replacements=[],source={textContent:''},status={textContent:'',classList:{add(){}}};
  const cards={get innerHTML(){return cardsHTML;},set innerHTML(v){cardsHTML=v;},querySelectorAll:()=>[]};
  const root={classList:{remove(){}},addEventListener(){},querySelectorAll:()=>[],get innerHTML(){return html;},set innerHTML(v){html=v;rootWrites++;},querySelector(selector){
    if(selector==='.ss-kpis')return cards;if(selector==='.ss-status')return status;if(['.ss-sales-summary-source','.ss-overview-source'].includes(selector))return source;
    const match=selector.match(/^\.ss-kpis \[data-stock-card="([^"]+)"\]$/);if(match)return{replaceWith(value){cardsHTML=cardsHTML.replace(card(cardsHTML,match[1]),value.outerHTML);replacements.push(match[1]);}};
    if(selector==='.ss-download')return{addEventListener(){}};if(selector==='.ss-sheet')return{remove(){html='';cardsHTML='';}};return null;
  }};
  const window={AAFOrderHeader:api};
  vm.runInNewContext(fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8'),{window,document:{getElementById:()=>root,createElement:()=>({innerHTML:'',querySelector(selector){const id=selector.match(/data-stock-card="([^"]+)"/)[1];return{outerHTML:card(this.innerHTML,id)};}}),head:{append(){}}},location:{hash:''}});
  return {summary:window.AAFStockSummary,replacements,source,get cards(){return cardsHTML;},get rootWrites(){return rootWrites;},get html(){return html;}};
}
const calc=r=>({eq:r.qty,price:1,curr:'THB',value:r.qty,freeValue:r.freeQty});
test('normalization and same-revision refresh update three current cards without rebuilding Physical, stock tables or editors',()=>{
  const f=fixture(),h=runtime(),before=JSON.stringify(f.stock),model=h.summary.buildModel(f.stock,calc);
  assert.equal(model.currentAllocation.status,'verified-allocation');assert.equal(JSON.stringify(f.stock),before);assert.equal(model.rows.filter(r=>r.manualFreeOverride).length,1);
  h.summary.update(f.stock,calc);h.summary.setOrderReview(null);const writes=h.rootWrites,physical=card(h.cards,'physical');
  const next=clone(f.allocation);next.current.other.demand.sheet++;next.current.other.allocated.sheet++;next.carry.demand.sheet--;next.carry.allocated.sheet--;
  h.summary.setCurrentMonthSold(f.sold,next);assert.deepEqual(h.replacements,['sold','reserved','free']);assert.equal(h.rootWrites,writes);assert.equal(card(h.cards,'physical'),physical);
  assert.match(card(h.cards,'reserved'),/<strong>16.25<\/strong>/);assert.match(card(h.cards,'free'),/<strong>68<\/strong>/);
  h.summary.setCurrentMonthSold(f.sold,next);assert.equal(h.replacements.length,3,'unchanged source does not repaint');
  h.summary.setOrderReview(null);assert.match(card(h.cards,'reserved'),/<strong>16.25<\/strong>/,'archive callback does not override current DTO');
  h.summary.invalidateCurrentMonthSold();assert.doesNotMatch(card(h.cards,'sold'),/<strong>/);assert.doesNotMatch(card(h.cards,'reserved'),/<strong>/);assert.match(card(h.cards,'free'),/<strong>68<\/strong>/);assert.match(card(h.cards,'free'),/Free นี้ยังเป็นยอดที่บันทึกไว้/);
  h.summary.showError('logout');h.summary.setCurrentMonthSold(f.sold,next);assert.equal(h.html,'');assert.equal(h.cards,'');
});
test('a new stock response without allocation does not retain previous reservation figures',()=>{
  const f=fixture(),h=runtime();h.summary.update(f.stock,calc);h.summary.setOrderReview(null);assert.match(card(h.cards,'reserved'),/<strong>15.25<\/strong>/);
  const next=clone(f.stock);delete next.currentAllocation;h.summary.update(next,calc);h.summary.setOrderReview(null);assert.doesNotMatch(card(h.cards,'reserved'),/<strong>/);assert.match(card(h.cards,'free'),/<strong>68<\/strong>/);
});
