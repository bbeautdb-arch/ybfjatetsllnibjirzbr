import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Synthetic fixtures only. Never load captured company orders, credentials or APIs.
const require=createRequire(import.meta.url);
const groups=require('../stock_sales_groups.js'),receipts=require('../stock_sales_receipts.js');
const api=require('../stock_current_sales_groups.js');
const now=Date.parse('2030-11-05T05:00:00Z'),month='2030-11',capture='2030-11-04T01:00:00Z';
const sha=letter=>'sha256:'+letter.repeat(64),copy=value=>JSON.parse(JSON.stringify(value));
const row=(id,status,qty,extra={})=>({id,orderId:'SYNTH-'+id,ref:'SYNTH-'+id,customer:'ลูกค้าสังเคราะห์ '+id,w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',qty,sourceStatus:status,productStatus:'พร้อมโหลด',term:'TT',payment:'รอรับ',receiptDateText:'—',...extra});
const event=(orderId,extra={})=>({eventId:'event-'+orderId,orderKey:orderId,sourceOrderMonth:month,sourceFingerprint:sha('d'),installment:'single',state:'expected',amount:100,currency:'THB',date:'2030-11-08',month,datePrecision:'day',dateBasis:'planned-source',proof:'synthetic exact payment evidence',hasError:false,issues:[],...extra});
function fixture(input){
  const rows=input||[row('loaded','ออก INV',12),row('pi','เปิด PI',18),row('strip','เปิด PI',500,{unit:'strip',w:25,l:2000}),row('neg','เจรจา',7),row('forecast','Forecast',9)];
  const orderIds=[...new Set(rows.map(item=>item.orderId))];
  const source={page:9,month,capturedAt:capture,checksum:sha('a'),sourceIsLive:false,orderCount:orderIds.length,lineCount:rows.length};
  const readModel={kind:'current-month-order-review',status:'verified-sales-only',selectedMonth:month,sourceIsLive:false,queueApplied:false,source};
  // Intentionally narrower OLD sold quantity. It binds provenance only and must
  // not become the new card's quantity or change the saved allocation policy.
  const currentMonthSold={version:1,status:'verified-quantities',month,source:copy(source),quantity:{sheet:12,strip:0},loaded:{sheet:12,strip:0},paidOrDeposit:{sheet:0,strip:0},lcETD:{sheet:0,strip:0},orderCount:1,lineCount:1};
  if(!rows.length){currentMonthSold.quantity.sheet=0;currentMonthSold.loaded.sheet=0;currentMonthSold.orderCount=0;currentMonthSold.lineCount=0;}
  const review={metadata:{month,sourceSalesCapturedAt:capture},readModel,rows,receiptSummary:{version:1,status:'verified-payment-source',month,reviewSource:{page:9,capturedAt:capture,checksum:sha('a'),rowsChecksum:sha('b')},financialSource:{page:9,checkedAt:'2030-11-05T01:00:00Z',asOf:'2030-11-05',checksum:sha('c'),rawRowsChecksum:sha('e'),orderCount:orderIds.length,lineCount:rows.length},orders:orderIds.map(orderId=>{const lines=rows.filter(item=>item.orderId===orderId);return {...lines[0],orderId,rowIds:lines.map(item=>item.id),sourceFullRowChecksum:sha('f'),sourceFingerprint:sha('d'),cancelled:lines[0].cancelled===true,exactAmount:null,currency:null,events:[event(orderId)]};})}};
  return {review,readModel,currentMonthSold};
}
const build=fixture=>api.build(fixture.review,fixture.readModel,fixture.currentMonthSold,now);
const bucket=(model,id)=>model.groups.find(item=>item.id===id);
function expected(review){const model=groups.build(review),money=receipts.build(review,model);return {...model,groups:model.groups.map(group=>({...group,money:money[group.id]}))};}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function browserHeader(){
  const RealDate=Date,window={};
  const context={window,Intl,Set,Date:class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}};
  for(const file of ['stock_sales_groups.js','stock_sales_receipts.js','stock_current_sales_groups.js','stock_order_header.js'])vm.runInNewContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),context);
  return window;
}
const card=(html,id)=>html.split(`data-stock-card="${id}"`)[1]?.split('data-stock-card="')[0]||'';
const warehouse=()=>({stockRevision:8,stockReportDate:'2030-11-03',rows:[],physical:{quantity:{sheet:90,strip:900},eq4x8:90,eq25:90,value:null,knownValueTHB:null,complete:false},free:{quantity:{sheet:40,strip:800},eq4x8:40,eq25:40,value:null,knownValueTHB:null,complete:false}});

test('shared current projection exactly equals lower three groups and receipt model, not legacy sold allocation',()=>{
  const f=fixture(),model=build(f),lower=expected(f.review);
  assert.equal(model.status,'verified');assert.equal(model.month,month);
  assert.deepEqual(model.groups,lower.groups);assert.deepEqual(model.summary,lower.summary);assert.deepEqual(model.cancelled,lower.cancelled);assert.deepEqual(model.unclassified,lower.unclassified);
  assert.deepEqual(bucket(model,'confirmed').totals,{sheet:30,strip:500});assert.deepEqual(bucket(model,'negotiation').totals,{sheet:7,strip:0});
  assert.equal(bucket(model,'confirmed').loaded.totals.sheet,12);assert.equal(bucket(model,'confirmed').waiting.totals.sheet,18);assert.equal(bucket(model,'confirmed').waiting.totals.strip,500);
  assert.notEqual(bucket(model,'confirmed').totals.sheet,f.currentMonthSold.quantity.sheet);assert.equal(model.source.checksum,f.currentMonthSold.source.checksum);
  assert.equal(api.view(model,f.currentMonthSold,now).status,'verified');
});

test('confirmed PI requires neither vessel nor receipt; ready/date alone never implies loaded',()=>{
  const f=fixture([row('p','เปิด PI',13,{etd:'01/11/30'}),row('v','มีเรือ',3),row('n','เจรจา',5,{etd:'01/11/30'}),row('f','Forecast',7)]),m=build(f);
  assert.equal(m.status,'verified');assert.deepEqual(bucket(m,'confirmed').loaded.totals,{sheet:0,strip:0});assert.deepEqual(bucket(m,'confirmed').waiting.totals,{sheet:16,strip:0});assert.equal(bucket(m,'negotiation').totals.sheet,5);
});

test('same order split among lines/loaded/waiting does not duplicate receipt or source order counts',()=>{
  const f=fixture([row('a','ออก INV',2,{orderId:'SYNTH-one',ref:'SYNTH-one',customer:'คนเดียว'}),row('b','เปิด PI',3,{orderId:'SYNTH-one',ref:'SYNTH-one',customer:'คนเดียว',unit:'strip'})]);
  f.review.receiptSummary.orders[0].events=[event('SYNTH-one',{state:'received',amount:700,date:'2030-11-02',dateBasis:'actual-source'})];
  const m=build(f),confirmed=bucket(m,'confirmed');assert.equal(m.status,'verified');assert.equal(confirmed.orderCount,1);assert.equal(confirmed.loaded.orderCount,1);assert.equal(confirmed.waiting.orderCount,1);
  assert.equal(confirmed.money.counts.orders,1);assert.equal(confirmed.money.currencies[0].received,700);assert.equal(confirmed.money.receiptMonths[0].orderCount,1);
});

test('installment currencies and actual receipt months remain identical between upper/lower without FX or ETD inference',()=>{
  const f=fixture(),one=f.review.receiptSummary.orders[0],two=f.review.receiptSummary.orders[1];
  one.events=[event(one.orderId,{eventId:'deposit',installment:'deposit',state:'received',amount:40,date:'2030-10-29',month:'2030-10',dateBasis:'actual-source'}),event(one.orderId,{eventId:'balance',installment:'balance',amount:60})];
  two.events=[event(two.orderId,{state:'received',amount:25,currency:'USD',date:'2030-11-03',dateBasis:'actual-source'})];
  const m=build(f),cash=bucket(m,'confirmed').money,lower=expected(f.review);assert.deepEqual(cash,bucket(lower,'confirmed').money);
  assert.equal(cash.counts.partial,1);assert.equal(cash.currencies.find(item=>item.currency==='THB').received,40);assert.equal(cash.currencies.find(item=>item.currency==='USD').received,25);assert.deepEqual(cash.receiptMonths.map(item=>item.month),['2030-10','2030-11']);
});

test('missing financial proof does not hide verified quantities or invent receipt zero',()=>{
  const f=fixture();delete f.review.receiptSummary;const m=build(f);assert.equal(m.status,'verified');assert.deepEqual(bucket(m,'confirmed').totals,{sheet:30,strip:500});
  assert.equal(bucket(m,'confirmed').money.status,'pending');assert.deepEqual(bucket(m,'confirmed').money.currencies,[]);assert.equal(bucket(m,'confirmed').money.orders[0].received,null);
});

test('unknown amounts preserve known subtotal and wrong receipt checksum cannot leak stale cash',()=>{
  const f=fixture(),first=f.review.receiptSummary.orders[0],second=f.review.receiptSummary.orders[1];first.events=[event(first.orderId,{state:'received',amount:40,date:'2030-11-02',dateBasis:'actual-source'})];second.events=[event(second.orderId,{state:'received',amount:null,date:'2030-11-03',dateBasis:'actual-source'})];
  let m=build(f),money=bucket(m,'confirmed').money;assert.equal(money.status,'partial');assert.equal(money.currencies[0].received,40);assert.equal(money.counts.missingAmount,1);
  f.review.receiptSummary.reviewSource.checksum=sha('b');m=build(f);assert.equal(m.status,'verified');assert.equal(bucket(m,'confirmed').money.status,'pending');assert.deepEqual(bucket(m,'confirmed').money.currencies,[]);
});

test('paid negotiation/Forecast remain display groups with warnings and never change reservation fields or quantities',()=>{
  const f=fixture([row('paid','เจรจา',8,{payment:'รับเงินแล้ว',reservationKind:'sold-unloaded',allocated:6,shortage:2}),row('forecast','Forecast',11,{payment:'รับเงินแล้ว',reservationKind:'sold-unloaded',allocated:7,shortage:4}),row('pi','เปิด PI',5)]),before=copy(f);
  const m=build(f);assert.equal(m.status,'verified');assert.equal(bucket(m,'confirmed').totals.sheet,5);assert.equal(bucket(m,'negotiation').totals.sheet,8);assert.equal(bucket(m,'forecast').totals.sheet,11);assert.equal(bucket(m,'negotiation').issues.length,1);assert.equal(bucket(m,'forecast').issues.length,1);assert.deepEqual(f,before);
});

test('cancelled stays separate and distinct anonymous-looking source orders are not business deduplicated',()=>{
  const f=fixture([row('a','เจรจา',3,{ref:'—',customer:'ลูกค้าซ้ำ'}),row('b','เจรจา',3,{ref:'—',customer:'ลูกค้าซ้ำ'}),row('cancel','ออก INV',0,{cancelled:true,sourceQty:9,productStatus:'โหลดแล้ว'})]);
  const m=build(f);assert.equal(m.status,'verified');assert.equal(bucket(m,'negotiation').orderCount,2);assert.equal(bucket(m,'negotiation').totals.sheet,6);assert.equal(bucket(m,'confirmed').lineCount,0);assert.equal(m.cancelled.totals.sheet,9);assert.equal(m.sourceLineCount,3);
});

test('missing current proof, wrong month/capture/checksum/counts and stale/future sources cannot confirm upper cards',()=>{
  const edits=[f=>f.review.metadata.month='2030-10',f=>f.readModel.selectedMonth='2030-10',f=>f.readModel.kind='dated-order-review',f=>f.readModel.status='pending',f=>f.readModel.source.page=1,f=>f.readModel.source.sourceIsLive=true,f=>f.readModel.source.checksum=sha('b'),f=>f.readModel.source.capturedAt='2030-11-03T01:00:00Z',f=>f.review.metadata.sourceSalesCapturedAt='2030-11-03T01:00:00Z',f=>f.currentMonthSold.status='pending',f=>f.currentMonthSold.month='2030-10',f=>f.currentMonthSold.source.orderCount++,f=>f.currentMonthSold.source.lineCount++,f=>f.currentMonthSold.source.checksum='unverified',f=>f.currentMonthSold.source.capturedAt='2030-11-06T01:00:00Z',f=>f.currentMonthSold=undefined];
  for(const edit of edits){const f=fixture();edit(f);assert.equal(build(f).status,'pending',String(edit));}
  const f=fixture();assert.equal(api.build(f.review,null,f.currentMonthSold,now).status,'pending');
});

test('unknown quantities, units, classifiers and duplicate line IDs remain pending rather than inferred or silently removed',()=>{
  const edits=[r=>r.qty=null,r=>r.qty='18',r=>r.qty=-1,r=>r.unit='pallet',r=>r.sourceStatus='unknown',r=>r.orderId=undefined];
  for(const edit of edits){const f=fixture();edit(f.review.rows[1]);assert.equal(build(f).status,'pending',String(edit));}
  const f=fixture();f.review.rows[1].id=f.review.rows[0].id;const m=build(f);assert.equal(m.status,'pending');assert.equal(f.review.rows.length,5);
});

test('genuine zero and fractional source quantities are not confused with missing source',()=>{
  const empty=fixture([]),m=build(empty);assert.equal(m.status,'verified');assert.deepEqual(bucket(m,'confirmed').totals,{sheet:0,strip:0});assert.equal(m.summary.orderCount,0);
  const fractional=build(fixture([row('pi','เปิด PI',2.75),row('n','เจรจา',0)]));assert.equal(fractional.status,'verified');assert.equal(bucket(fractional,'confirmed').totals.sheet,2.75);assert.equal(bucket(fractional,'negotiation').totals.sheet,0);
});

test('view rechecks source binding and Bangkok month rollover; never accepts modified top totals or money',()=>{
  const f=fixture(),model=build(f);assert.equal(api.view(model,f.currentMonthSold,now).status,'verified');
  const edited=copy(model);bucket(edited,'confirmed').totals.sheet=99999;assert.equal(api.view(edited,f.currentMonthSold,now).status,'pending');
  const editedMoney=copy(model);bucket(editedMoney,'confirmed').money.currencies[0].pending=88888;assert.equal(api.view(editedMoney,f.currentMonthSold,now).status,'pending');
  const changed=copy(f.currentMonthSold);changed.source.checksum=sha('b');assert.equal(api.view(model,changed,now).status,'pending');
  assert.equal(api.view(model,f.currentMonthSold,Date.parse('2030-11-30T17:00:00Z')).status,'pending');assert.equal(api.view(null,f.currentMonthSold,now).status,'pending');
});

test('upper renderer uses current groups plus matching cash/counts, preserves saved warehouse and ignores selected history',()=>{
  const f=fixture(),model=build(f),browser=browserHeader(),w=warehouse(),before=copy(w),html=browser.AAFOrderHeader.render(null,new Set(),w,'รอชุด',f.currentMonthSold,undefined,model);
  assert.match(card(html,'sold'),/<strong>30<\/strong>/);assert.match(card(html,'sold'),/500/);assert.match(card(html,'sold'),/18 แผ่น/);assert.match(card(html,'sold'),/3 รายการต้นทาง|3 ใบ/);assert.match(card(html,'sold'),/300\.00/);
  assert.match(card(html,'reserved'),/<strong>7<\/strong>/);assert.match(card(html,'reserved'),/80%/);assert.match(card(html,'reserved'),/100\.00/);assert.doesNotMatch(card(html,'reserved'),/มีของรองรับ|ต้องผลิตเพิ่ม/);
  assert.match(card(html,'physical'),/<strong>90<\/strong>/);assert.match(card(html,'free'),/<strong>40<\/strong>/);assert.deepEqual(w,before);
  const history={month:'2030-10',sold:{quantity:{sheet:999999,strip:0}},reserved:{quantity:{sheet:888888,strip:0}},fx:{rate:99}},historicalHtml=browser.AAFOrderHeader.render(history,new Set(),w,'รอชุด',f.currentMonthSold,undefined,model);
  assert.equal(card(historicalHtml,'sold'),card(html,'sold'));assert.equal(card(historicalHtml,'reserved'),card(html,'reserved'));assert.doesNotMatch(html,/999999|888888/);
});

test('legacy sold and old reservation quantities never substitute a missing shared projection',()=>{
  const f=fixture(),browser=browserHeader(),html=browser.AAFOrderHeader.render(null,new Set(),warehouse(),'รอชุด',f.currentMonthSold);
  assert.match(card(html,'sold'),/รอ|ยัง/);assert.doesNotMatch(card(html,'sold'),/<strong>12<\/strong>/);assert.doesNotMatch(card(html,'reserved'),/<strong>/);
});

test('projection is immutable and browser UMD exports pure build/view without storage or acquisition',()=>{
  const f=fixture(),before=copy(f);freeze(f);const m=build(f);freeze(m);api.view(m,f.currentMonthSold,now);assert.deepEqual(f,before);
  const browser=browserHeader();assert.equal(browser.AAFCurrentSalesGroups.build(f.review,f.readModel,f.currentMonthSold,now).status,'verified');
  const source=readFileSync(new URL('../stock_current_sales_groups.js',import.meta.url),'utf8');assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage)\s*[.(]/);
});
