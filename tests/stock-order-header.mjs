import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const api=require('../stock_order_header.js');
const clone=value=>JSON.parse(JSON.stringify(value));

// Synthetic only: no real customers, source IDs, prices or inventory totals.
function fixture(){
  const row=(id,group,qty,extra={})=>({id,orderId:id,ref:'TEST-'+id,customer:'Invented customer',w:1220,l:2440,t:2.5,grade:'B',unit:'sheet',qty,queue:{group},commercial:{termKind:'TT',etdValid:false,soldByOwnerRule:group===2},...extra});
  const rows=[row('a',1,12),row('b',2,18),row('c',3,7,{commercial:{termKind:'LC',etdValid:true,soldByOwnerRule:true}}),row('d',3,9),row('e',4,11),row('f',4,0)];
  const byRowId=Object.fromEntries(rows.map(r=>[r.id,{...r,sale:r.qty?{status:'verified',amount:r.qty*4,currency:'USD',unitPrice:4}:{status:'cancelled-no-demand',amount:0,currency:null}}]));
  const orders=rows.map(r=>({id:r.id,orderId:r.id,ref:r.ref,customer:r.customer,rowIds:[r.id],settlement:r.id==='a'?{currency:'USD',saleAmount:48,receivedAmount:30,pendingAmount:18,unconfirmedAmount:0,receiptEvents:[{id:'a-deposit',currency:'USD',amount:30,date:'2026-04-03',month:'2026-04'}]}:null}));
  return {metadata:{month:'2026-04',monthLabel:'Synthetic month',sourceSalesCapturedAt:'2026-04-04T03:00:00Z',stockReportDate:'2026-04-03'},queueReview:{rows},
    stockPools:[{w:1220,l:2440,t:2.5,grade:'B',unit:'sheet',physical:100,free:40},{w:20,l:1000,t:3.2,grade:'B',unit:'strip',physical:900,free:300}],
    financial:{metadata:{month:'2026-04',fx:{rate:30,date:'2026-04-03'}},byRowId,orders},
    freeStock:{views:{all:{valuation:{valueTHB:1200}}}},reconciliation:{headerStockValuations:{physical:{equivalentTHB:4000},free:{equivalentTHB:1200},otherReservationDemand:{equivalentTHB:700}}}};
}
test('same selected month and disjoint sold/other/waiting quantities, LC with ETD sold once',()=>{
  const r=fixture(),before=JSON.stringify(r),m=api.build(r,{selectedMonth:'2026-04'});
  assert.equal(m.sold.quantity.sheet,37);assert.equal(m.reserved.quantity.sheet,9);assert.equal(m.waiting.quantity.sheet,11);
  assert.equal(m.sold.loaded.sheet,12);assert.equal(m.sold.paidOrDeposit.sheet,18);assert.equal(m.sold.lcETD.sheet,7);
  assert.equal(m.allOrders.quantity.sheet,57);assert.equal(m.sold.rowIds.some(id=>m.reserved.rowIds.includes(id)),false);
  assert.equal(m.allocationComplete,false);assert.equal(m.queueApplied,false);assert.equal(JSON.stringify(r),before);
});
test('Physical and Free remain whole warehouse and sheet/strip units never add together',()=>{
  const m=api.build(fixture());assert.deepEqual(m.physical.quantity,{sheet:100,strip:900});assert.deepEqual(m.free.quantity,{sheet:40,strip:300});
  assert.ok(m.free.eq25>40);assert.match(api.render(m),/รวมไม้แถบ/);assert.match(api.sourceText(m),/ทั้งคลัง|Physical\/Free/);
});
test('actual prices and order-level receipt partition remain independent of stock valuation',()=>{
  const r=fixture(),m=api.build(r);assert.deepEqual(m.sold.money.sale,{THB:0,USD:148});
  assert.deepEqual(m.sold.money.received,{THB:0,USD:30});assert.deepEqual(m.sold.money.pending,{THB:0,USD:18});assert.deepEqual(m.sold.money.unconfirmed,{THB:0,USD:100});
  r.reconciliation.headerStockValuations.physical.equivalentTHB=999;
  assert.deepEqual(api.build(r).sold.money,m.sold.money);
});
test('LC without ETD is not promoted from group3 to sold',()=>{
  const r=fixture();r.queueReview.rows[2].commercial.etdValid=false;const m=api.build(r);assert.equal(m.sold.quantity.sheet,30);assert.equal(m.reserved.quantity.sheet,16);
});
test('partial selected order never prorates a receipt',()=>{
  const r=fixture(),a=r.financial.orders[0];a.rowIds.push('e');r.financial.orders=r.financial.orders.filter(o=>o.id!=='e');
  a.settlement.saleAmount=92;a.settlement.receivedAmount=30;a.settlement.pendingAmount=62;
  const m=api.build(r);assert.equal(m.sold.money.received.USD,0);assert.equal(m.sold.money.pending.USD,0);assert.equal(m.sold.money.unconfirmed.USD,148);assert.deepEqual(m.sold.money.partialOrders,['a']);
});
test('invalid month, duplicate lines, or missing financial line coverage fail closed',()=>{
  assert.throws(()=>api.build(fixture(),{selectedMonth:'2026-05'}),/เดือนไม่ตรง|เดือนหัวข้อ/);
  const duplicate=fixture();duplicate.queueReview.rows.push(duplicate.queueReview.rows[0]);assert.throws(()=>api.build(duplicate),/ซ้ำ/);
  const missing=fixture();missing.financial.orders.shift();assert.throws(()=>api.build(missing),/ไม่ครบชุด/);
});
test('missing prices are unknown, not zero sale values; missing stock valuation remains unknown',()=>{
  const r=fixture();r.financial.byRowId.b.sale={status:'pending',amount:null,currency:null};delete r.reconciliation;delete r.freeStock;
  const m=api.build(r);assert.equal(m.sold.money.complete,false);assert.equal(m.sold.money.missingPriceLineCount,1);
  const html=api.render(m);assert.match(html,/ยังยืนยันไม่ได้/);assert.equal(m.physical.value,null);assert.equal(m.free.knownValueTHB,null);
});
test('render escapes customer text, keeps all four cards collapsed and labels dated stock',()=>{
  const r=fixture();r.financial.orders[0].customer='<script>bad()</script>';const html=api.render(api.build(r,{stale:true}));
  assert.equal((html.match(/data-stock-card="/g)||[]).length,4);assert.equal((html.match(/aria-expanded="false"/g)||[]).length,4);
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>bad/);assert.match(html,/ชุดตรวจย้อนหลัง/);assert.match(html,/แผนเดิม/);
});
test('legacy summary callbacks cannot replace new monthly header; clear never falls back to old sales',()=>{
  const window={AAFOrderHeader:api};
  vm.runInNewContext(fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8'),{window,document:{getElementById:()=>null,createElement:()=>({}),head:{append(){}}}});
  const summary=window.AAFStockSummary;
  summary.setOrderReview(fixture(),{selectedMonth:'2026-04'});const html=summary.renderKpis({sold:{byUnit:{sheet:987654}}},null);
  assert.match(html,/data-order-header-month="2026-04"/);assert.doesNotMatch(html,/987,654/);
  summary.setSalesSummary({sold:{byUnit:{sheet:987654}}});assert.equal(summary.renderKpis({},null),html);
  summary.setOrderReview(null,null);assert.doesNotMatch(summary.renderKpis({sold:{byUnit:{sheet:987654}}},null),/987,654|data-order-header-month/);
});
test('summary keeps hidden legacy services and the new review host alive across stock refresh',()=>{
  const source=fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8');
  assert.match(source,/ss-legacy-sales-services" hidden/);assert.match(source,/ss-legacy-detail" hidden/);
  assert.match(source,/id="stock-order-review-slot"/);assert.match(source,/orderPreview\?\.remove\(\)/);assert.match(source,/AAFOrderReview\?\.attach/);
});
