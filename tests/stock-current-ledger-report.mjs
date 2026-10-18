import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),api=require('../stock_sales_preview.js');
const viewTests=fs.readFileSync(new URL('./stock-sales-preview.mjs',import.meta.url),'utf8');
const harness=vm.runInNewContext(viewTests.slice(viewTests.indexOf('function harness()'),viewTests.indexOf('function sale('))+';harness');
const window={};
vm.runInNewContext(fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8'),{window,document:{getElementById:()=>null,createElement:()=>({}),head:{append(){}}}});
const summaryApi=window.AAFStockSummary;
const sale=(id,extra={})=>({id,orderId:id,ref:id,customer:'SYNTHETIC',w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',qty:60,amount:600,currency:'THB',term:'TT',sourceStatus:'Forecast',productStatus:'พร้อมโหลด',payment:'เก็บเงิน / ได้ LC แล้ว',...extra});
const stock=[
  {sku:'SYNTHETIC-AAA',w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',physical:80},
  {sku:'SYNTHETIC-STRIP',w:25,l:2052,t:3.2,grade:'B',unit:'strip',physical:100},
  {sku:'SYNTHETIC-NEW',w:1220,l:2440,t:2.3,grade:'A',unit:'sheet',physical:407},
  ...Array.from({length:138},(_,i)=>({sku:'SYNTHETIC-ZERO-'+i,w:4000+i,l:2440,t:2.5,grade:'F',unit:'sheet',physical:0})),
];
const sales=[sale('paid'),sale('pi',{qty:40,amount:400,sourceStatus:'เปิด PI',payment:'รอเก็บ TT / LC'}),sale('loaded',{qty:10,amount:200,sourceStatus:'ออก INV'}),sale('strip-paid',{w:25,l:2052,t:3.2,grade:'B',unit:'strip',qty:120,amount:1200}),sale('strip-loaded',{w:25,l:2052,t:3.2,grade:'B',unit:'strip',qty:5,amount:50,sourceStatus:'ออก INV'}),sale('forecast',{qty:999,amount:9990,payment:'รอเก็บ TT / LC'})];
const evidence={version:1,kind:'current-stock-saved-sales-ledger',stockReportDate:'2026-10-18',salesReportDate:'2026-10-12',salesCapturedAt:'2026-10-12T08:47:19.198Z',needsSalesRefresh:true,sourceIsLive:false};
const state={privateContent:{version:3,context:'aaf-sales-stock-preview|free-price-catalog',fx:33,prices:{'2.5|AAA|1220|2440|sheet':2,'3.2|B|25|2052|strip':3},currencies:{'2.5|AAA|1220|2440|sheet':'THB','3.2|B|25|2052|strip':'THB'},notesByThickness:{'2.5':'saved note'},notesBySpec:{},savedAt:'2026-10-16T03:00:00Z'}};

function expectedReadiness(model){
  const byAllocationId={};
  // Independent expected allocation: paid first, then PI. Loaded and final
  // Forecast never consume capacity. No second allocation takes place here.
  for(const [id,before,allocated,shortage,remaining] of [['paid',80,60,0,20],['strip-paid',100,100,20,0],['pi',20,20,20,0]]){
    const row=model.allocationRows.find(r=>r.id===id),key=api.model.exactSpecKey(row);
    const part={allocationId:id,key,poolKey:api.model.allocationPoolKey(row),w:row.w,l:row.l,t:row.t,grade:row.grade,unit:row.unit,requested:row.qty,availableBefore:before,allocated,shortage,remaining,stockAllocations:[{key,w:row.w,l:row.l,t:row.t,grade:row.grade,unit:row.unit,allocated,availableBefore:before,remaining}]};
    byAllocationId[id]={parts:[part],state:shortage?(allocated?'partial':'production'):'ready',requestedByUnit:{[row.unit]:row.qty},allocatedByUnit:{[row.unit]:allocated},shortageByUnit:{[row.unit]:shortage}};
  }
  return {byAllocationId};
}

test('current Physical plus checked older sales preserves all141 specs, one allocation, independent inventory prices, actual sale money and forms',async()=>{
  const before=JSON.stringify({stock,sales,state}),model=api.buildModel(sales,stock,{strict:true,reservationPolicy:'aaf-firm-only-20261003-v1',paidOverrideRefs:[]});
  assert.equal(model.stockRows.length,141);
  const h=harness(),store={widgetState:state,load(){return this.widgetState;},setWidgetState(){throw new Error('read-only test must not write');}};
  const view=api.mount(h.root,model,{readiness:expectedReadiness(model),metadata:{sourceReadLabel:'ข้อมูลฝ่ายขาย ณ 2026-10-12',stockLabel:'Physical ส่วนกลาง · รายงาน 2026-10-18'}},store);await view.ready;
  const report={...view.getReportSummary(),evidence},p=report.partition;
  assert.equal(p.status,'verified');assert.deepEqual(report.physical.byUnit,{sheet:487,strip:100});assert.deepEqual(report.free.byUnit,{sheet:407,strip:0});
  assert.equal(report.physical.eq4x8,487);assert.ok(Math.abs(report.physical.eq2_5-(80+407*2.3/2.5))<1e-9,'sheet equivalents exclude strip pieces');
  assert.equal(model.all.totals.equivalent4x8At2_5.total,model.all.totals.equivalent4x8At2_5.byUnit.sheet,'sales sheet equivalent total also excludes strip');
  assert.deepEqual(report.sold.byUnit,{sheet:70,strip:125});assert.deepEqual(report.sold.loaded.byUnit,{sheet:10,strip:5});assert.deepEqual(report.sold.paidUnloaded.byUnit,{sheet:60,strip:120});
  for(const unit of ['sheet','strip']){
    assert.equal(report.physical.byUnit[unit],p.sold.inStock.byUnit[unit]+p.reserved.inStock.byUnit[unit]+report.free.byUnit[unit]);
    assert.equal(report.sold.byUnit[unit],report.sold.loaded.byUnit[unit]+report.sold.paidUnloaded.byUnit[unit]);
    assert.equal(report.sold.paidUnloaded.byUnit[unit],p.sold.inStock.byUnit[unit]+p.sold.toProduce.byUnit[unit]);
  }
  assert.equal(report.sold.valueTHB,2050,'actual sale money is not Physical multiplied by catalog prices');
  assert.equal(report.physical.valueTHB,null,'new407-sheet spec without a price prevents a fabricated complete inventory value');assert.equal(report.physical.knownValueTHB,460);
  assert.equal(report.physical.unpricedSpecs.find(r=>r.t===2.3).qty,407);
  assert.equal(view.setDraftPrice('2.3|A|1220|2440|sheet',7,'THB'),true,'new spec remains available in normal price editor');assert.equal(view.getPriceState().dirty,true);
  assert.equal(view.getReportSummary().physical.valueTHB,null,'unsaved draft is not reported as saved inventory value');
  const centralRows=model.stockRows.map((r,i)=>({key:'key-'+i,sku:r.sku,w:r.w,l:r.l,t:r.t,grade:r.grade,unit:r.unit,qty:r.physical,baseQty:r.physical,committedQty:model.all.stock.byKey[api.model.exactSpecKey(r)].reserved,freeQty:model.all.stock.byKey[api.model.exactSpecKey(r)].free,d90:r.physical,d180:0,d270:0,d360:0,dOver:0}));
  const m=summaryApi.buildModel({report:{reportDate:'2026-10-18'},revision:58,rows:centralRows,exchangeRate:33},r=>({price:0,curr:'THB',value:0,freeValue:0,eq:r.qty*r.w*r.l/2976800*r.t/2.5}));m.salesSummary=report;
  const html=summaryApi.renderHTML(m),breakdown=summaryApi.soldLoadingBreakdown(report);
  assert.equal(m.total.eq4x8,487);assert.ok(Math.abs(m.total.eq-(80+407*2.3/2.5))<1e-9);assert.equal(m.total.byUnit.sheet.qty,487);assert.equal(m.total.byUnit.strip.qty,100);assert.equal(m.aging[0],587,'raw original Aging sum stays untouched');assert.equal(m.agingEquivalent[0],487,'Aging chart only converts sheets');
  assert.equal(breakdown.reconciled,true);assert.equal((html.match(/class="ss-stock-row"/g)||[]).length,141);
  assert.match(html,/สต๊อก 2026-10-18/);assert.match(html,/ยอดขาย\/รับเงินตามหลักฐาน 2026-10-12/);assert.match(html,/ยังไม่ได้อ่านยอดขายใหม่จากหน้า 09/);assert.match(html,/มูลค่าการขายใช้ราคาขายจริง/);
  assert.match(html,/เหลือรอโหลด/);assert.match(html,/มีของ \+ ต้องผลิต = เหลือรอโหลด/);assert.match(html,/ไม้แถบ <b>100<\/b> ชิ้น/);assert.ok(!html.includes('<strong>587</strong>'),'sheet and strip are never combined in Physical KPI');
  assert.match(html,/ฐาน Aging เมลต้นฉบับแยกหน่วย 487 แผ่น · ไม้แถบ 100 ชิ้น/);assert.match(html,/Physical <strong>487 แผ่น · ไม้แถบ 100 ชิ้น/);assert.ok(!html.includes('>587</td>'),'grade/thickness tables never merge physical or raw Aging units');
  assert.equal(JSON.stringify({stock,sales,state}),before);view.destroy();
});

test('plan-only projection keeps current quantities and saved stock prices while unknown sales money is neither old money nor zero',async()=>{
  const model=api.buildModel(sales.map(r=>({...r,amount:null,currency:null})),stock,{strict:true,reservationPolicy:'aaf-firm-only-20261003-v1',paidOverrideRefs:[]});
  const h=harness(),view=api.mount(h.root,model,{readiness:expectedReadiness(model),financialEvidenceUnavailable:true,receiptBreakdown:{month:'2026-10',previousMonth:'2026-09',buckets:{currentMonth:{events:[],totals:{byCurrency:{},complete:false,totalRows:0}},previousMonth:{events:[],totals:{byCurrency:{},complete:false,totalRows:0}}}}}, {widgetState:state,load(){return this.widgetState;}});await view.ready;
  const report={...view.getReportSummary(),evidence:{...evidence,financialEvidence:'unavailable-plan-only',financialMissingLineCount:sales.length}};
  assert.equal(report.partition.status,'verified');assert.deepEqual(report.sold.byUnit,{sheet:70,strip:125});assert.equal(report.sold.valueTHB,null);assert.equal(report.sold.coverage.knownRowCount,0);assert.equal(report.sold.paidUnloaded.valueTHB,null);assert.equal(report.physical.knownValueTHB,460);
  const html=summaryApi.renderKpis(report);assert.match(html,/ยังระบุมูลค่าไม่ได้/);assert.match(html,/รอราคาขายหรือสกุลเงิน/);assert.ok(!html.includes('฿ 2,050'),'old financial totals cannot survive a quantity-only source');
  const markup=h.root.children.map(r=>r.markup||'').join('');assert.match(markup,/ยังไม่มีหลักฐานรับเงินที่ตรงกับชุดยอดขายนี้/);assert.ok(!markup.includes('ไม่มีรายการรับเงินในเดือนนี้'));assert.ok(!markup.includes('data-receipt-bucket='));
  for(const node of h.root.querySelectorAll('[data-finance-amount]'))assert.equal(node.textContent,'รอหลักฐานมูลค่าที่ตรงกับชุดยอดขายนี้','even an empty financial status bucket is not a confirmed cash zero');
  assert.equal(report.sold.coverage.complete,false);assert.equal(view.setDraftPrice('2.3|A|1220|2440|sheet',7,'THB'),true);
  view.destroy();
});
