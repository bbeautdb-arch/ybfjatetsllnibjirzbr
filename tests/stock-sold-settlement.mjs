import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8');
const window={};
vm.runInNewContext(source,{window,document:{getElementById:()=>null,createElement:()=>({}),head:{append(){}}}});
const api=window.AAFStockSummary;
// Public fixtures are invented examples only; never copy live quantities,
// financial totals, customer identifiers or evidence into this test.
const bucket=(sheet,strip=0)=>({byUnit:{sheet,strip},eq4x8:sheet,eq2_5:sheet,valueTHB:100,coverage:{complete:true}});
function summary(){
  return {
    version:2,physical:bucket(15000,500),free:bucket(8000,400),
    sold:{...bucket(12000,120),valueTHB:1033000,knownValueTHB:1033000,byCurrency:{THB:1000000,USD:1000},coverage:{complete:true,knownRowCount:5,unknownRowCount:0,missingFxRowCount:0},
      loaded:bucket(2000,20),paidUnloaded:{...bucket(10000,100),valueTHB:800000,byCurrency:{THB:800000}},
      settlement:{byCurrency:{THB:{sales:1000000,received:200000,outstanding:800000,unallocated:0},USD:{sales:1000,received:400,outstanding:600,unallocated:0}},knownReceivedTHB:213200,knownOutstandingTHB:819800,unallocatedTHB:0,complete:true,coverage:{receivedOrderCount:3,outstandingOrderCount:4}}
    },
    partition:{status:'verified',reservationPolicy:'aaf-firm-only-20261003-v1',sold:{inStock:bucket(7000,100),toProduce:bucket(3000,0)},reserved:{inStock:bucket(0),toProduce:bucket(0),demand:bucket(0),byStatus:{}}}
  };
}
const soldCard=report=>api.renderKpis(report).split(/<div class="ss-kpi ss-kpi-sold"[^>]*>/)[1].split(/<div class="ss-kpi ss-kpi-reserved"[^>]*>/)[0];
const settlement=html=>html.split('<div class="ss-sales-settlement"')[1].split('<details class="ss-sales-pending-value"')[0];
const clone=v=>JSON.parse(JSON.stringify(v));

test('actual sale value leads, receipt subsets reconcile per native currency, quantity classification is unchanged',()=>{
  const report=summary(),before=JSON.stringify(report),quantities=JSON.stringify(api.soldLoadingBreakdown(report));
  for(const unit of ['sheet','strip']){
    assert.equal(report.sold.byUnit[unit],report.sold.loaded.byUnit[unit]+report.sold.paidUnloaded.byUnit[unit]);
    assert.equal(report.sold.paidUnloaded.byUnit[unit],report.partition.sold.inStock.byUnit[unit]+report.partition.sold.toProduce.byUnit[unit]);
    assert.equal(report.physical.byUnit[unit],report.free.byUnit[unit]+report.partition.sold.inStock.byUnit[unit]);
  }
  const html=soldCard(report),state=api.soldSettlementState(report.sold);
  assert.equal(state.reconciled,true);assert.equal(state.complete,true);
  assert.match(html,/<strong>12,000<\/strong>/);
  assert.match(html,/ขายแล้วตามชุดใบขาย · ไม่ขึ้นกับการรับเงิน/);
  assert.match(html,/<span>มูลค่าการขาย<\/span><b>฿ 1,033,000<\/b>/);
  assert.match(html,/<span>THB 1,000,000<\/span>/);assert.match(html,/<span>USD 1,000<\/span>/);
  assert.match(html,/<span>รับเงินแล้ว<\/span><b>฿ 213,200<\/b>/);assert.match(html,/<span>เหลือรอรับเงิน<\/span><b>฿ 819,800<\/b>/);
  assert.match(html,/ต้นทาง THB 200,000 · USD 400/);assert.match(html,/ต้นทาง THB 800,000 · USD 600/);
  assert.match(html,/มูลค่าการขาย = รับเงินแล้ว \+ เหลือรอรับเงิน/);
  assert.match(html,/ไม่ใช่ยอดเงินบาทที่ธนาคารรับจริง/);
  assert.ok(!html.includes('ss-settlement-unallocated'));
  assert.ok(html.indexOf('ss-sales-total-value')<html.indexOf('ss-sales-settlement'));
  assert.ok(html.indexOf('ss-sales-settlement')<html.indexOf('ss-sales-pending-value'));
  assert.match(html,/<details class="ss-sales-pending-value"[^>]*><summary>มูลค่ารอโหลด · 10,000 แผ่น · ไม้แถบ 100 ชิ้น/);
  assert.match(html,/โหลดออกแล้ว<\/span><b>2,000 แผ่น · ไม้แถบ 20 ชิ้น/);
  assert.match(html,/มีของในสต๊อก<\/span><b>7,000 แผ่น · ไม้แถบ 100 ชิ้น/);
  assert.match(html,/ต้องผลิตเพิ่ม<\/span><b>3,000 แผ่น/);
  assert.match(html,/มีของ \+ ต้องผลิต = เหลือรอโหลด/);
  assert.equal(JSON.stringify(report),before);assert.equal(JSON.stringify(api.soldLoadingBreakdown(report)),quantities);
  assert.ok(!html.includes('12,120'),'sheet and strip counts never merge');
});

test('partial receipts distinguish unallocated classification from confirmed outstanding without inventing zero cash',()=>{
  const report=summary();
  report.sold.settlement={byCurrency:{THB:{sales:1000000,received:0,outstanding:600000,unallocated:400000},USD:{sales:1000,received:100,outstanding:100,unallocated:800}},knownReceivedTHB:3300,knownOutstandingTHB:603300,unallocatedTHB:426400,complete:false,coverage:{receivedOrderCount:1,outstandingOrderCount:2}};
  const html=soldCard(report),part=settlement(html),state=api.soldSettlementState(report.sold);
  assert.equal(state.reconciled,true);assert.equal(state.complete,false);
  assert.match(part,/฿ 3,300 · ยอดที่ยืนยันได้บางส่วน/);assert.match(part,/฿ 603,300 · ยอดที่ยืนยันได้บางส่วน/);
  assert.match(part,/ยอดขายที่ยังแยกรับแล้ว \/ รอรับไม่ได้/);assert.match(part,/฿ 426,400/);
  assert.match(part,/ยังไม่ใช่ยอดค้างรับที่ยืนยันแล้ว/);assert.match(part,/หลักฐานรับเงินยังไม่ครบทุกออเดอร์/);
  assert.match(part,/เฉพาะมูลค่าที่มีหลักฐาน: รับแล้ว \+ รอรับ \+ ยังไม่ยืนยันการรับเงิน = มูลค่าการขาย/);
  assert.ok(!part.includes('ต้นทาง THB 0'),'a zero subtotal without currency-specific receipt coverage is not claimed');
  assert.match(html,/<b>฿ 1,033,000<\/b>/,'sale total is not replaced with received or outstanding money');
});

test('absent, invalid and partial-zero settlement money remains unknown, not cash zero',()=>{
  for(const s of [undefined,{},
    {complete:false,byCurrency:{THB:{sales:1000000,received:0,outstanding:0,unallocated:0}},knownReceivedTHB:0,knownOutstandingTHB:0,unallocatedTHB:0,coverage:{}},
    {complete:true,byCurrency:{THB:{sales:1000000,received:NaN,outstanding:Infinity,unallocated:-1}},knownReceivedTHB:NaN,knownOutstandingTHB:Infinity,unallocatedTHB:-1},
    {complete:true,byCurrency:{THB:{sales:1000000,received:'0',outstanding:null,unallocated:1000000}},knownReceivedTHB:'0',knownOutstandingTHB:null,unallocatedTHB:null}
  ]){
    const report=summary();report.sold.settlement=s;
    const html=soldCard(report),part=settlement(html);
    assert.equal(api.soldSettlementState(report.sold).complete,false);
    assert.match(part,/<span>รับเงินแล้ว<\/span><b>ยังยืนยันไม่ได้<\/b>/);
    assert.match(part,/<span>เหลือรอรับเงิน<\/span><b>ยังยืนยันไม่ได้<\/b>/);
    assert.ok(!part.includes('฿ 0'));assert.ok(!part.includes('NaN'));assert.ok(!part.includes('Infinity'));
    assert.ok(!part.includes('มูลค่าการขาย = รับเงินแล้ว + เหลือรอรับเงิน'));
    assert.match(html,/<strong>12,000<\/strong>/,'money uncertainty never hides or changes verified quantity');
  }
});

test('zero cash is displayable with complete reconciliation or explicit partial receipt coverage',()=>{
  const report=summary(),s=report.sold.settlement;
  for(const b of Object.values(s.byCurrency)){b.received=0;b.outstanding=b.sales;}
  s.knownReceivedTHB=0;s.knownOutstandingTHB=1033000;
  assert.equal(api.soldSettlementState(report.sold).complete,true);
  assert.match(settlement(soldCard(report)),/<span>รับเงินแล้ว<\/span><b>฿ 0<\/b>/);
  s.complete=false;s.coverage.receivedOrderCount=1;s.byCurrency.THB.coverage={receivedRowCount:1};
  const html=settlement(soldCard(report));
  assert.match(html,/<span>รับเงินแล้ว<\/span><b>฿ 0 · ยอดที่ยืนยันได้บางส่วน<\/b>/);
  assert.match(html,/ต้นทาง THB 0 · เฉพาะยอดที่ยืนยันได้/);
});

test('a contradictory complete flag cannot claim settlement reconciliation, alter inputs or use stock valuation',()=>{
  for(const change of [
    r=>r.sold.settlement.byCurrency.THB.received++,
    r=>r.sold.settlement.byCurrency.THB.sales++,
    r=>r.sold.settlement.knownReceivedTHB++,
    r=>r.sold.settlement.byCurrency.EUR={sales:1,received:1,outstanding:0,unallocated:0},
    r=>r.sold.coverage.complete=false
  ]){
    const report=summary();change(report);const before=JSON.stringify(report),state=api.soldSettlementState(report.sold);
    assert.equal(state.complete,false);const part=settlement(soldCard(report));
    assert.ok(!part.includes('มูลค่าการขาย = รับเงินแล้ว + เหลือรอรับเงิน'));
    assert.equal(JSON.stringify(report),before);
  }
  const a=summary(),b=clone(a);b.physical.valueTHB=999999999;b.free.valueTHB=888888888;b.catalog={prices:{'2|F|1220|2440|sheet':17},fxThbPerUsd:1};
  assert.equal(soldCard(a),soldCard(b),'stock valuation and prices cannot enter commercial amounts');
});

test('source strings cannot inject markup through currencies, coverage, money or settlement labels',()=>{
  const report=summary(),attack='<img src=x onerror=alert(1)>';
  report.sold.byCurrency[attack]=55;report.sold.settlement.byCurrency[attack]={sales:55,received:1,outstanding:54,unallocated:0};
  report.sold.settlement.coverage.receivedOrderCount=attack;report.sold.settlement.fxLabel=attack;report.sold.settlement.unallocatedTHB=attack;
  report.sold.coverage.unknownRowCount=attack;report.sold.settlement.byCurrency.THB.received=attack;
  const html=soldCard(report);
  assert.ok(!html.includes('<img'));assert.ok(!html.includes('onerror'));assert.ok(!html.includes('alert(1)'));
  assert.equal(api.soldSettlementState(report.sold).complete,false);
});

test('full goods-sale amount remains dominant while three receipt allocations are unknown; fees, VAT and Sales basis are explicit',()=>{
  const report=summary(),sold=report.sold,fx=33;
  sold.byCurrency={THB:2100000,USD:1200000};sold.valueTHB=sold.knownValueTHB=2100000+1200000*fx;
  sold.settlement={valueBasis:'product-line-sale-value',basis:'sales-recorded-receipts-not-bank-statement',byCurrency:{THB:{sales:2100000,received:1000000,outstanding:1100000,unallocated:0},USD:{sales:1200000,received:800000,outstanding:310000,unallocated:90000}},knownReceivedTHB:1000000+800000*fx,knownOutstandingTHB:1100000+310000*fx,unallocatedTHB:90000*fx,complete:false,coverage:{receivedOrderCount:3,outstandingOrderCount:4},orders:[
    ...['SYNTHETIC-A','SYNTHETIC-B','SYNTHETIC-C'].map(ref=>({ref,customer:'SYNTHETIC CUSTOMER',currency:'USD',receivedAmount:null,pendingAmount:null,unconfirmedAmount:30000,reasons:['master-contract-cash-allocation-unconfirmed','goods-only-excludes-document-adjustments']})),
    {ref:'CLASSIFIED-PENDING',receivedAmount:null,pendingAmount:100,unconfirmedAmount:0},
    {ref:'RECEIVED',receivedAmount:100,pendingAmount:0,unconfirmedAmount:0}
  ]};
  const html=soldCard(report),money=sold.valueTHB.toLocaleString('th-TH',{maximumFractionDigits:2});
  assert.match(html,new RegExp('<span>มูลค่าการขาย</span><b>฿ '+money+'</b>'));
  assert.match(html,/มูลค่าตามราคาขายจริงครบกลุ่มนี้/);assert.match(html,/THB 2,100,000/);assert.match(html,/USD 1,200,000/);
  assert.match(html,/ดูรายการรับเงินที่ยังไม่ยืนยัน · 3 ออเดอร์/);
  for(const ref of ['SYNTHETIC-A','SYNTHETIC-B','SYNTHETIC-C'])assert.match(html,new RegExp(ref));
  assert.ok(!html.includes('CLASSIFIED-PENDING'));assert.ok(!html.includes('RECEIVED'));
  assert.match(html,/ยังยืนยันการแบ่งยอดรับเงินจากสัญญา \/ Invoice หลักมาออเดอร์นี้ไม่ได้/);
  assert.match(html,/ก่อนค่าธรรมเนียม \/ ค่าใช้จ่ายที่ไม่ใช่สินค้าและใบลดหนี้/);
  assert.match(html,/ยอดในประเทศยังไม่ยืนยันฐาน VAT/);
  assert.match(html,/รับแล้ว \/ รอรับตามบันทึก Sales เฉพาะส่วนมูลค่าสินค้า/);
  assert.match(html,/ไม่ใช่การยืนยันยอดเงินเข้าบัญชีธนาคาร/);
  assert.match(html,/<strong>12,000<\/strong>/);
});

test('classified pending with no cash-zero evidence is not an unknown allocation and unknown detail strings are escaped',()=>{
  const report=summary(),s=report.sold.settlement;
  s.complete=false;s.orders=[{ref:'KNOWN-PENDING',receivedAmount:null,pendingAmount:100,unconfirmedAmount:0}];
  let html=soldCard(report);
  assert.ok(!html.includes('ss-settlement-unallocated'));assert.ok(!html.includes('ดูรายการรับเงินที่ยังไม่ยืนยัน'));
  s.byCurrency.USD.outstanding-=1;s.byCurrency.USD.unallocated=1;s.knownOutstandingTHB-=33;s.unallocatedTHB=33;
  s.orders=[{ref:'<img src=x onerror=alert(1)>',customer:'<script>bad()</script>',receivedAmount:null,pendingAmount:null,unconfirmedAmount:1,currency:'USD',reasons:['<svg onload=alert(1)>']}];
  html=soldCard(report);
  assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<svg onload'));
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.match(html,/&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.match(html,/รอตรวจหลักฐานการรับเงินของออเดอร์นี้/);
});
