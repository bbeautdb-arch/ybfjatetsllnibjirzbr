import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),api=require('../stock_order_header.js');
const clone=v=>JSON.parse(JSON.stringify(v));
// Synthetic quantities and provenance only; never real company data.
function dto(month=api.currentBangkokMonth(),capturedAt=new Date().toISOString()){
  return {version:1,status:'verified-quantities',month,monthLabel:'Synthetic month',
    source:{page:9,capturedAt,sourceIsLive:false,checksum:'sha256:'+'a'.repeat(64),orderCount:8,lineCount:10},
    quantity:{sheet:30,strip:5},loaded:{sheet:10,strip:1},paidOrDeposit:{sheet:12,strip:2},lcETD:{sheet:8,strip:2},orderCount:3,lineCount:4};
}
function archive(){
  const row={id:'synthetic',orderId:'synthetic',ref:'TEST',customer:'Invented only',w:1220,l:2440,t:2.5,grade:'B',unit:'sheet',qty:99,queue:{group:1},commercial:{termKind:'TT',etdValid:false,soldByOwnerRule:true}};
  return {metadata:{month:'2000-10',monthLabel:'Archived synthetic month',sourceSalesCapturedAt:'2000-10-20T03:00:00Z',stockReportDate:'2000-10-20'},queueReview:{rows:[row]},
    stockPools:[{...row,physical:10,free:5}],financial:{metadata:{month:'2000-10',fx:{rate:30,date:'2000-10-20'}},byRowId:{synthetic:{...row,sale:{status:'verified',amount:999,currency:'USD'}}},orders:[{id:'synthetic',ref:'TEST',customer:'Invented only',rowIds:['synthetic'],settlement:null}]}};
}
const soldCard=html=>html.slice(html.indexOf('<div class="ss-kpi ss-kpi-sold"'),html.indexOf('<div class="ss-kpi ss-kpi-reserved"'));
const reservedCard=html=>html.slice(html.indexOf('<div class="ss-kpi ss-kpi-reserved"'),html.indexOf('<div class="ss-kpi ss-kpi-free"'));

test('Bangkok month rolls at17UTC and rejects old-month values at the boundary',()=>{
  const before=Date.parse('2026-10-31T16:59:59.999Z'),after=Date.parse('2026-10-31T17:00:00.000Z');
  assert.equal(api.currentBangkokMonth(before),'2026-10');assert.equal(api.currentBangkokMonth(after),'2026-11');
  const old=dto('2026-10','2026-10-30T00:00:00Z');
  assert.equal(api.currentMonthSoldView(old,before).status,'verified-quantities');
  assert.equal(api.currentMonthSoldView(old,after).status,'pending');
  assert.equal(api.currentMonthSoldView(dto('2026-11','2026-10-31T17:00:00Z'),after).status,'verified-quantities');
  assert.equal(api.currentMonthSoldView(dto('2026-11','2026-10-31T16:59:59.999Z'),after).status,'pending','A current-month label cannot relabel an older capture');
  assert.equal(api.currentBangkokMonth(Date.parse('2026-12-31T17:00:00Z')),'2027-01');
});
test('quantity DTO is guarded and copied without prices, receipts, unknown units or private properties',()=>{
  const input=dto();input.money={USD:999};input.received=999;input.quantity.extra=999;input.source.internal='must-not-propagate';
  const before=JSON.stringify(input),view=api.currentMonthSoldView(input);
  assert.equal(view.status,'verified-quantities');assert.deepEqual(view.quantity,{sheet:30,strip:5});
  assert.equal(view.quantity.sheet,view.loaded.sheet+view.paidOrDeposit.sheet+view.lcETD.sheet);
  assert.equal(view.money,undefined);assert.equal(view.received,undefined);assert.equal(view.source.internal,undefined);
  assert.equal(JSON.stringify(input),before);assert.notEqual(view.quantity,input.quantity);
  for(const change of [v=>v.month='2000-10',v=>v.quantity.sheet=31,v=>v.loaded.strip=-1,v=>v.paidOrDeposit.sheet='12',v=>{v.loaded.sheet=10.5;v.quantity.sheet=30.5;},v=>{v.loaded.sheet=Number.MAX_SAFE_INTEGER+1;v.quantity.sheet=Number.MAX_SAFE_INTEGER+21;},v=>v.source.page=1,v=>v.source.sourceIsLive=true,v=>v.source.checksum='',v=>v.source.checksum='synthetic-invalid-hash',v=>v.source.capturedAt='bad',v=>v.source.capturedAt=new Date(Date.now()+3600000).toISOString(),v=>v.source.capturedAt='2000-10-31T00:00:00Z',v=>v.source.orderCount=1,v=>v.source.orderCount=11,v=>v.lineCount=2]){
    const invalid=dto();change(invalid);assert.equal(api.currentMonthSoldView(invalid).status,'pending');
  }
});
test('current-month cards never use archive selection as quantity or money',()=>{
  const review=archive(),model=api.build(review,{stale:true}),input=dto(),before=JSON.stringify({review,input});
  const html=api.render(model,new Set(),undefined,'selected-month pending',input),card=soldCard(html);
  assert.match(card,/<h3>ขายแล้วเดือนนี้<\/h3>/);assert.match(card,/<strong>30<\/strong>/);assert.match(card,/ไม้แถบ 5 ชิ้น/);
  assert.match(card,new RegExp('data-order-header-month="'+api.currentBangkokMonth()+'"'));
  assert.match(card,/โหลดแล้ว/);assert.match(card,/รับเงิน\/มัดจำ · ยังไม่โหลด/);assert.match(card,/LCมีETD/);
  assert.match(card,/ยังไม่มีหลักฐานราคาขาย\/รับเงินตรงชุดนี้/);assert.doesNotMatch(card,/USD 999|฿ 0|<strong>35<\/strong>|<strong>99<\/strong>|2000-10|ชุดตรวจย้อนหลัง/);
  assert.doesNotMatch(reservedCard(html),/data-order-header-month="2000-10"|<strong>/);
  const source=api.sourceText(model,undefined,undefined,undefined,input);
  assert.match(source,/ขายแล้วเดือนนี้:/);assert.match(source,/รายละเอียดหัวข้อ02: Archived synthetic month/);
  assert.doesNotMatch(source,/ชุดเดียวกับหัวข้อ02|เดือนขายเดียวกัน/);
  assert.equal(JSON.stringify({review,input}),before);
});
test('pending, missing, or wrong-month source does not fall back to a complete archived sale',()=>{
  const model=api.build(archive());
  for(const value of [undefined,null,{...dto(),month:'2000-10'},{...dto(),status:'pending',reason:'Synthetic pending',quantity:{sheet:999,strip:999}}]){
    const card=soldCard(api.render(model,new Set(),undefined,'archive pending',value));
    assert.match(card,/ขายแล้วเดือนนี้/);assert.match(card,/role="status"/);assert.doesNotMatch(card,/<strong>|USD 999|฿ 0|2000-10/);
  }
  const empty=dto();for(const k of ['quantity','loaded','paidOrDeposit','lcETD'])empty[k]={sheet:0,strip:0};empty.orderCount=0;empty.lineCount=0;
  assert.equal(api.currentMonthSoldView(empty).status,'verified-quantities','A verified empty month is distinct from missing evidence');
});

function runtime(){
  let html='',cardHTML='',rootWrites=0,soldReplacements=0;const status={textContent:'',classList:{add(){}}},source={textContent:''};
  const cards={set innerHTML(value){cardHTML=value;},get innerHTML(){return cardHTML;},querySelectorAll:()=>[]};
  const root={classList:{remove(){}},addEventListener(){},querySelectorAll:()=>[],
    set innerHTML(value){html=value;rootWrites++;},get innerHTML(){return html;},querySelector(selector){
      if(selector==='.ss-kpis')return cards;if(selector==='.ss-status')return status;
      if(selector==='.ss-kpis [data-stock-card="sold"]')return{replaceWith(value){const current=cardHTML||html;cardHTML=current.replace(soldCard(current),value.outerHTML);soldReplacements++;}};
      if(selector==='.ss-overview-source'||selector==='.ss-sales-summary-source')return source;
      if(selector==='.ss-download')return{addEventListener(){}};
      if(selector==='.ss-sheet')return{remove(){html='';cardHTML='';}};return null;
    }};
  const window={AAFOrderHeader:api};
  vm.runInNewContext(fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8'),{window,document:{getElementById:()=>root,createElement:()=>({innerHTML:'',querySelector(){return{outerHTML:soldCard(this.innerHTML)};}}),head:{append(){}}},location:{hash:''}});
  return {summary:window.AAFStockSummary,get html(){return html;},get cards(){return cardHTML;},get rootWrites(){return rootWrites;},get soldReplacements(){return soldReplacements;},source};
}
const stock=()=>({report:{reportDate:'2000-10-20',sourceRowCount:1},revision:1,exchangeRate:30,currentMonthSold:dto(),
  rows:[{key:'synthetic',w:1220,l:2440,t:2.5,grade:'B',unit:'sheet',qty:10,baseQty:10,committedQty:5,freeQty:5,d90:10,d180:0,d270:0,d360:0,dOver:0}]});
const calc=r=>({eq:r.qty,price:1,curr:'THB',value:r.qty,freeValue:r.freeQty});
test('summary normalization preserves the separate DTO; archive callbacks cannot overwrite or restore it after auth clear',()=>{
  const h=runtime(),data=stock(),before=JSON.stringify(data),m=h.summary.buildModel(data,calc);
  assert.equal(m.currentMonthSold.status,'verified-quantities');assert.equal(m.currentMonthSold.quantity.sheet,30);assert.equal(JSON.stringify(data),before);
  h.summary.update(data,calc);assert.match(soldCard(h.html),/<strong>30<\/strong>/);
  h.summary.setOrderReview(archive(),{stale:true});assert.match(soldCard(h.cards),/<strong>30<\/strong>/);
  h.summary.setSalesSummary({sold:{byUnit:{sheet:999}}});assert.match(soldCard(h.cards),/<strong>30<\/strong>/);
  h.summary.invalidateCurrentMonthSold();assert.doesNotMatch(soldCard(h.cards),/<strong>|999/);
  h.summary.setOrderReview(archive(),{stale:true});assert.doesNotMatch(soldCard(h.cards),/<strong>|999/);
  h.summary.update(data,calc);h.summary.setOrderReview(archive(),{stale:true});assert.match(soldCard(h.cards),/<strong>30<\/strong>/);
  h.summary.showError('Synthetic logout');assert.equal(h.html,'');
  h.summary.setOrderReview(archive(),{stale:true});assert.doesNotMatch(soldCard(h.cards),/<strong>|999/);
});
test('a later stock response without the DTO clears it instead of retaining a previous account or response',()=>{
  const h=runtime(),data=stock();h.summary.update(data,calc);h.summary.setOrderReview(archive(),{stale:true});assert.match(soldCard(h.cards),/<strong>30<\/strong>/);
  const missing=clone(data);delete missing.currentMonthSold;h.summary.update(missing,calc);h.summary.setOrderReview(archive(),{stale:true});
  assert.doesNotMatch(soldCard(h.cards),/<strong>|999/);assert.match(soldCard(h.cards),/รอข้อมูลขายเดือน/);
});
test('same-revision sold refresh does not rebuild the whole report while allocation remains pending',()=>{
  const h=runtime(),data=stock();h.summary.update(data,calc);h.summary.setOrderReview(archive(),{stale:true});
  const writes=h.rootWrites,other=reservedCard(h.cards),fresh=dto();fresh.loaded.sheet=11;fresh.quantity.sheet=31;
  h.summary.setCurrentMonthSold(fresh);assert.match(soldCard(h.cards),/<strong>31<\/strong>/);assert.equal(h.rootWrites,writes);assert.equal(h.soldReplacements,1);assert.equal(reservedCard(h.cards),other);
  h.summary.setCurrentMonthSold(fresh);assert.equal(h.soldReplacements,1,'identical poll does not repaint');
  h.summary.setCurrentMonthSold({...fresh,month:'2000-10'});assert.doesNotMatch(soldCard(h.cards),/<strong>/);assert.equal(h.rootWrites,writes);assert.equal(reservedCard(h.cards),other);
  h.summary.showError('logout');h.summary.setCurrentMonthSold(fresh);assert.equal(h.html,'');assert.doesNotMatch(soldCard(h.cards),/<strong>/);
});
