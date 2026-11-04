import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),{build}=require('../stock_sales_receipts.js'),groups=require('../stock_sales_groups.js');
const sha=letter=>'sha256:'+letter.repeat(64),copy=value=>JSON.parse(JSON.stringify(value));
const row=(id,orderId=id,status='เปิด PI',extra={})=>({id,orderId,ref:'SYNTH-'+orderId,customer:'ลูกค้าทดสอบ '+orderId,sourceStatus:status,productStatus:'พร้อมโหลด',qty:10,unit:'sheet',term:'TT',payment:'รับเงินแล้ว',receiptDateText:'02/11/30',...extra});
const event=(orderId,extra={})=>({eventId:'event-'+orderId,orderKey:orderId,sourceOrderMonth:'2030-11',sourceFingerprint:sha('d'),installment:'single',state:'received',amount:100,currency:'THB',date:'2030-11-02',month:'2030-11',datePrecision:'day',dateBasis:'actual-source',proof:'synthetic exact receipt',hasError:false,issues:[],...extra});
function fixture(rows=[row('one')]){
  const review={metadata:{month:'2030-11',sourceSalesCapturedAt:'2030-11-04T01:00:00Z'},readModel:{kind:'current-month-order-review',status:'verified-sales-only',selectedMonth:'2030-11',source:{page:9,month:'2030-11',capturedAt:'2030-11-04T01:00:00Z',checksum:sha('a')}},rows};
  const byOrder=new Map();for(const r of rows){if(!byOrder.has(r.orderId))byOrder.set(r.orderId,[]);byOrder.get(r.orderId).push(r);}
  review.receiptSummary={version:1,status:'verified-payment-source',month:'2030-11',reviewSource:{page:9,capturedAt:'2030-11-04T01:00:00Z',checksum:sha('a'),rowsChecksum:sha('b')},financialSource:{page:9,checkedAt:'2030-11-05T01:00:00Z',asOf:'2030-11-05',checksum:sha('c'),rawRowsChecksum:sha('e'),orderCount:byOrder.size,lineCount:rows.length},orders:[...byOrder].map(([orderId,lines])=>({...lines[0],orderId,rowIds:lines.map(r=>r.id),sourceFullRowChecksum:sha('f'),sourceFingerprint:sha('d'),cancelled:false,exactAmount:null,currency:null,events:[event(orderId)]}))};
  return review;
}
const run=review=>build(review,groups.build(review));
const money=(review,id='confirmed')=>run(review)[id];
const sourceOrder=(review,id)=>review.receiptSummary.orders.find(order=>order.orderId===id);

test('whole-order receipt is counted once across product lines and loaded/waiting subsets',()=>{
  const review=fixture([row('a','one','เปิด PI',{productStatus:'โหลดแล้ว'}),row('b','one')]);
  const result=money(review);assert.equal(result.status,'verified');assert.equal(result.counts.orders,1);assert.equal(result.counts.received,1);assert.equal(result.orders[0].received,100);
  assert.deepEqual(result.currencies,[{currency:'THB',received:100,pending:null,receivedKnownOrders:1,pendingKnownOrders:0}]);assert.equal(result.receiptMonths[0].orderCount,1);
});
test('each distinct anonymous-looking order remains distinct, regardless of matching customer/ref',()=>{
  const review=fixture([row('a','a','เปิด PI',{customer:'same',ref:'—'}),row('b','b','เปิด PI',{customer:'same',ref:'—'})]);
  assert.equal(money(review).currencies[0].received,200);assert.equal(money(review).counts.orders,2);
});
test('installments use their own actual receipt months rather than sale month or ETD',()=>{
  const review=fixture();review.rows[0].etd='01/12/30';sourceOrder(review,'one').events=[event('one',{eventId:'deposit',installment:'deposit',amount:40,date:'2030-10-22',month:'2030-10'}),event('one',{eventId:'balance',installment:'balance',amount:60,state:'expected',date:'2030-11-20',month:'2030-11',dateBasis:'planned-source'})];
  const result=money(review);assert.equal(result.counts.partial,1);assert.equal(result.counts.received,0);assert.equal(result.orders[0].received,40);assert.equal(result.orders[0].pending,60);
  assert.deepEqual(result.receiptMonths,[{month:'2030-10',orderCount:1,knownAmountByCurrency:{THB:40,USD:null},missingAmountCount:0}]);
});
test('two received installments in the same month sum money but count one order',()=>{
  const review=fixture();sourceOrder(review,'one').events=[event('one',{eventId:'deposit',installment:'deposit',amount:40}),event('one',{eventId:'balance',installment:'balance',amount:60,date:'2030-11-03'})];
  const result=money(review);assert.equal(result.counts.received,1);assert.equal(result.counts.partial,0);assert.equal(result.currencies[0].received,100);assert.equal(result.currencies[0].receivedKnownOrders,1);assert.equal(result.receiptMonths[0].orderCount,1);assert.equal(result.orders[0].receiptEvents.length,2);
});
test('LC obtained and LC cash pending are not actual cash receipts',()=>{
  for(const state of ['lc_received','lc_pending']){
    const review=fixture();review.rows[0].term='LC';sourceOrder(review,'one').term='LC';sourceOrder(review,'one').events=[event('one',{state,dateBasis:'lc-obtained-source'})];
    const result=money(review);assert.equal(result.counts.lcAwaiting,1);assert.equal(result.counts.received,0);assert.equal(result.orders[0].received,null);assert.equal(result.orders[0].pending,100);assert.deepEqual(result.receiptMonths,[]);
  }
});
test('explicit bound cash proof can acknowledge LC cash without using LC obtained date',()=>{
  const review=fixture();review.rows[0].term='LC';sourceOrder(review,'one').term='LC';sourceOrder(review,'one').lc={obtained:{date:'2030-10-05'},cash:{date:'2030-11-02'}};
  sourceOrder(review,'one').events=[event('one',{dateBasis:'owner-evidence'})];assert.equal(money(review).counts.received,1);assert.equal(money(review).receiptMonths[0].month,'2030-11');
});
test('future alleged cash is excluded from receipt totals and months, never converted into expected cash',()=>{
  const review=fixture();sourceOrder(review,'one').events=[event('one',{date:'2030-11-06'})];
  const result=money(review);assert.equal(result.status,'partial');assert.equal(result.counts.unconfirmed,1);assert.equal(result.orders[0].received,null);assert.equal(result.orders[0].pending,null);assert.deepEqual(result.receiptMonths,[]);assert.equal(result.orders[0].issues.some(i=>i.code==='received-date-in-future'),true);
});
test('missing amount or currency and rounded K/M never produce fabricated monetary values',()=>{
  for(const patch of [{amount:null},{currency:null},{amount:null,currency:null},{proof:null}]){
    const review=fixture();sourceOrder(review,'one').sourceAmountDisplay='$ 25.5K';sourceOrder(review,'one').exactAmount=25500;sourceOrder(review,'one').events=[event('one',patch)];
    const result=money(review);assert.equal(result.status,'partial');assert.equal(result.counts.received,1);assert.equal(result.counts.missingAmount,1);assert.equal(result.orders[0].received,null);assert.equal(result.receiptMonths[0].knownAmountByCurrency.THB,null);assert.equal(result.receiptMonths[0].missingAmountCount,1);
  }
});
test('known subtotals stay visible alongside unknown receipts without inventing missing amounts',()=>{
  const review=fixture([row('a'),row('b')]);sourceOrder(review,'b').events=[event('b',{amount:null})];
  const result=money(review);assert.equal(result.status,'partial');assert.equal(result.currencies[0].received,100);assert.equal(result.currencies[0].receivedKnownOrders,1);assert.equal(result.counts.missingAmount,1);assert.equal(result.receiptMonths[0].orderCount,2);
});
test('genuine proven zero is numeric zero, not missing evidence',()=>{
  const review=fixture();sourceOrder(review,'one').events=[event('one',{amount:0})];const result=money(review);assert.equal(result.status,'verified');assert.equal(result.currencies[0].received,0);assert.equal(result.counts.missingAmount,0);
});
test('fully paid exact order has proven zero remaining; incomplete or unproven totals never do',()=>{
  const review=fixture(),order=sourceOrder(review,'one');Object.assign(order,{exactAmount:100,currency:'THB',amountSourceProof:'synthetic complete invoice'});
  const result=money(review);assert.equal(result.orders[0].pending,0);assert.equal(result.currencies[0].pending,0);assert.equal(result.currencies[0].pendingKnownOrders,1);
  for(const edit of [o=>o.exactAmount=null,o=>o.exactAmount=101,o=>o.currency='USD',o=>o.amountSourceProof=null,o=>o.events[0].amount=null,o=>o.events[0].state='expected',o=>o.events[0].issues=[{code:'conflict',severity:'error'}]]){const other=copy(review);edit(sourceOrder(other,'one'));assert.notEqual(money(other).orders[0].pending,0);}
});
test('exact deposit plus paid balance proves no remaining money without double-counting the order',()=>{
  const review=fixture(),order=sourceOrder(review,'one');Object.assign(order,{exactAmount:100,currency:'THB',amountSourceProof:'synthetic complete invoice',events:[event('one',{eventId:'deposit',installment:'deposit',amount:40}),event('one',{eventId:'balance',installment:'balance',amount:60})]});
  const result=money(review);assert.equal(result.counts.received,1);assert.equal(result.orders[0].pending,0);assert.equal(result.currencies[0].pendingKnownOrders,1);assert.equal(result.currencies[0].received,100);
});
test('proven arithmetic remainder is separate from confirmed pending cash and must reconcile to exact order total',()=>{
  const review=fixture(),order=sourceOrder(review,'one');Object.assign(order,{exactAmount:100,currency:'THB',amountSourceProof:'synthetic full invoice',events:[event('one',{eventId:'deposit',installment:'deposit',amount:30}),event('one',{eventId:'balance',installment:'balance',state:'unconfirmed',amount:70,date:'2030-11-08',dateBasis:'owner-evidence',issues:[{code:'remaining-cash-receivable-unconfirmed',severity:'warning'}]})]});
  const result=money(review);assert.deepEqual(result.orders[0].arithmeticBalance,{amount:70,currency:'THB',label:'ยอดตามใบหลังหักมัดจำ · รอยืนยันยอดค้าง'});assert.equal(result.orders[0].pending,null);assert.equal(result.currencies[0].pending,null);assert.equal(result.counts.partial,1);assert.equal(result.counts.missingAmount,1);
  for(const edit of [o=>o.exactAmount=110,o=>o.currency='USD',o=>o.amountSourceProof=null,o=>o.events[0].amount=null,o=>o.events[1].issues=[],o=>o.events[1].proof=null,o=>o.events[1].hasError=true]){const other=copy(review);edit(sourceOrder(other,'one'));assert.equal(money(other).orders[0].arithmeticBalance,undefined);}
});
test('currencies are never summed or FX converted; mixed currency order has no combined order amount',()=>{
  const review=fixture();sourceOrder(review,'one').events=[event('one',{eventId:'a',installment:'deposit',amount:10,currency:'USD'}),event('one',{eventId:'b',installment:'balance',amount:1000,currency:'THB'})];
  const result=money(review);assert.equal(result.orders[0].received,null);assert.equal(result.orders[0].currency,null);assert.equal(result.currencies[0].received,1000);assert.equal(result.currencies[1].received,10);
});
test('undated actual receipt stays separate and explicit month-only proof stays in that month',()=>{
  const review=fixture([row('a'),row('b')]);sourceOrder(review,'a').events=[event('a',{date:null,month:null,datePrecision:'unknown',dateBasis:'unknown'})];sourceOrder(review,'b').events=[event('b',{date:null,month:'2030-10',datePrecision:'month',dateBasis:'owner-evidence'})];
  const result=money(review);assert.equal(result.status,'partial');assert.equal(result.currencies[0].received,200);assert.deepEqual(result.receiptMonths.map(value=>value.month),['2030-10',null]);assert.equal(result.receiptMonths[1].knownAmountByCurrency.THB,100);
});
test('no legacy financial fallback without bound package, including historical data',()=>{
  const review=fixture();delete review.receiptSummary;review.financial={orders:[{amount:9999,currency:'THB'}]};
  for(const kind of ['current-month-order-review','dated-order-review']){review.readModel.kind=kind;const result=money(review);assert.equal(result.status,'pending');assert.equal(result.orders[0].received,null);assert.equal(result.checkedAt,null);assert.deepEqual(result.currencies,[]);}
});
test('source month, checksum, capture and coverage conflicts fail closed for all group money',()=>{
  const edits=[r=>r.receiptSummary.month='2030-10',r=>r.readModel.source.checksum=sha('b'),r=>r.receiptSummary.reviewSource.capturedAt='2030-11-03T01:00:00Z',r=>r.receiptSummary.financialSource.checkedAt='2030-11-03T01:00:00Z',r=>r.receiptSummary.financialSource.asOf='2030-11-04',r=>r.receiptSummary.financialSource.orderCount=2,r=>r.receiptSummary.financialSource.lineCount=2,r=>r.readModel.status='pending',r=>r.metadata.sourceSalesCapturedAt='2030-11-04T02:00:00Z'];
  for(const edit of edits){const review=fixture();edit(review);const result=money(review);assert.equal(result.status,'pending');assert.equal(result.orders[0].received,null);assert.equal(result.checkedAt,null);}
});
test('cross-group order conflict leaves both groups unresolved without double-counting money',()=>{
  const review=fixture([row('a','same'),row('b','same','Forecast')]);const result=run(review);for(const id of ['confirmed','forecast']){assert.equal(result[id].status,'pending');assert.equal(result[id].counts.unconfirmed,1);assert.equal(result[id].orders[0].received,null);}
});
test('exact line identity and protected payment/customer/ref/term/date are bound before totals',()=>{
  const edits=[r=>sourceOrder(r,'one').rowIds=['other'],r=>sourceOrder(r,'one').rowIds=['one','one'],r=>r.rows[0].customer='new',r=>r.rows[0].ref='other',r=>r.rows[0].payment='รอรับ',r=>r.rows[0].term='LC',r=>r.rows[0].receiptDateText='01/10/30',r=>r.rows[0].sourceFullRowChecksum=sha('a'),r=>sourceOrder(r,'one').sourceFullRowChecksum=null];
  for(const edit of edits){const review=fixture();edit(review);const result=money(review);assert.equal(result.status,'pending');assert.equal(result.orders[0].received,null);}
});
test('duplicate package orders, duplicate row IDs and duplicate events are never silently deducted or doubled',()=>{
  const review=fixture();review.receiptSummary.orders.push(copy(review.receiptSummary.orders[0]));assert.equal(money(review).status,'pending');
  const dup=fixture([row('same','one'),row('same','two')]);assert.equal(money(dup).status,'pending');
  const events=fixture([row('one'),row('two')]);sourceOrder(events,'two').events[0].eventId='event-one';assert.equal(money(events).status,'pending');
});
test('event fingerprint/order/month/duplicate installment/date errors cannot contribute money',()=>{
  const edits=[r=>sourceOrder(r,'one').events[0].orderKey='other',r=>sourceOrder(r,'one').events[0].sourceFingerprint=sha('a'),r=>sourceOrder(r,'one').events[0].sourceOrderMonth='2030-10',r=>sourceOrder(r,'one').events[0].date='2030-02-30',r=>sourceOrder(r,'one').events[0].dateBasis='planned-source',r=>sourceOrder(r,'one').events[0].hasError=true,r=>sourceOrder(r,'one').events.push(event('one',{eventId:'second'}))];
  for(const edit of edits){const review=fixture();edit(review);const result=money(review);assert.equal(result.orders[0].received,null);assert.deepEqual(result.receiptMonths,[]);assert.equal(result.counts.unconfirmed,1);}
});
test('invalid monetary shapes never coerce numeric strings, negative, NaN, unsafe cents or extra decimals',()=>{
  for(const amount of ['100',-1,NaN,Infinity,1.001,Number.MAX_SAFE_INTEGER]){const review=fixture();sourceOrder(review,'one').events[0].amount=amount;const result=money(review);assert.equal(result.orders[0].received,null);assert.deepEqual(result.receiptMonths,[]);}
});
test('overflowing currency and receipt-month totals stay unknown even after subsequent small receipts',()=>{
  const review=fixture([row('a'),row('b'),row('c')]);for(const id of ['a','b'])sourceOrder(review,id).events[0].amount=60000000000000;
  const result=money(review);assert.equal(result.status,'partial');assert.equal(result.currencies[0].received,null);assert.equal(result.currencies[0].receivedKnownOrders,0);assert.equal(result.receiptMonths[0].knownAmountByCurrency.THB,null);
});
test('source business classification does not change because payment exists; cancellation remains outside three groups',()=>{
  const review=fixture([row('confirmed'),row('neg','neg','เจรจา'),row('forecast','forecast','Forecast'),row('cancel','cancel','ยกเลิก',{cancelled:true})]);
  sourceOrder(review,'cancel').cancelled=true;const result=run(review);assert.equal(result.confirmed.counts.orders,1);assert.equal(result.negotiation.counts.received,1);assert.equal(result.forecast.counts.received,1);assert.equal(Object.values(result).reduce((sum,item)=>sum+item.counts.orders,0),3);
});
test('empty verified groups stay empty with no invented currency; group array API works',()=>{
  const review=fixture([]);const result=build(review,groups.build(review).groups);for(const value of Object.values(result)){assert.equal(value.status,'verified');assert.equal(value.counts.orders,0);assert.deepEqual(value.currencies,[]);assert.deepEqual(value.receiptMonths,[]);}
});
test('missing groups and current review captured in a different Bangkok month remain pending',()=>{
  const review=fixture();for(const value of Object.values(build(review,undefined)))assert.equal(value.status,'pending');
  review.readModel.source.capturedAt='2030-10-30T01:00:00Z';review.metadata.sourceSalesCapturedAt=review.readModel.source.capturedAt;review.receiptSummary.reviewSource.capturedAt=review.readModel.source.capturedAt;assert.equal(money(review).status,'pending');
});
test('projection is immutable, pure and available through the browser API',()=>{
  const review=fixture([row('a'),row('b','b','Forecast')]),before=copy(review),groupModel=groups.build(review),groupBefore=copy(groupModel);
  function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}freeze(review);freeze(groupModel);build(review,groupModel);assert.deepEqual(review,before);assert.deepEqual(groupModel,groupBefore);
  const source=readFileSync(new URL('../stock_sales_receipts.js',import.meta.url),'utf8'),context={window:{}};vm.runInNewContext(source,context);assert.equal(context.window.AAFSalesReceipts.build(review,groupModel).confirmed.currencies[0].received,100);assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage)\s*[.(]/);
});
