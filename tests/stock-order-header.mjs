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
test('other reservation native currency breakdown is explicitly actual sale, not the stock estimate above it',()=>{
  const model=api.build(fixture()),before=JSON.stringify(model),html=api.render(model);
  const reserved=html.slice(html.indexOf('class="ss-kpi ss-kpi-reserved"'),html.indexOf('class="ss-kpi ss-kpi-free"'));
  assert.match(reserved,/มูลค่าความต้องการ · ราคาประเมินสต๊อก/);
  assert.match(reserved,/<small>ราคาขายจริงตามใบขาย \(ไม่ใช่ราคาประเมินสต๊อก\): THB 0 · USD 36<\/small>/);
  assert.doesNotMatch(reserved,/<small>THB 0 · USD 36<\/small>/);
  assert.match(reserved,/มูลค่าขายตามใบในกลุ่มนี้/);
  assert.equal(JSON.stringify(model),before,'label-only correction must not alter any value or classification');
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

function currentStockFixture(){
  const row={key:'current-sheet',w:1220,l:2440,t:2.5,grade:'B',unit:'sheet',qty:73,freeQty:29,committedQty:50,
    baseQty:73,d90:73,d180:0,d270:0,d360:0,dOver:0,price:999,curr:'USD'};
  const rows=[row,{...row,key:'current-strip',w:20,l:1000,t:3.2,unit:'strip',qty:400,freeQty:150,committedQty:250,baseQty:400,d90:400}];
  const stock={revision:8,reportDate:'2026-04-04',updatedAt:'2026-04-04T06:00:00Z',rows};
  const catalog={revision:8,reportDate:stock.reportDate,catalogRevision:4,rows:rows.map(r=>({...r,price:r.unit==='sheet'?2:0.1,currency:r.unit==='sheet'?'USD':'THB'}))};
  const fx={rate:30,date:'2026-04-03',status:'current',basis:'BOT_USD_THB_BUYING_TRANSFER'};
  return {stock,catalog,fx};
}
function summaryRuntime(root=null,extra={}){
  const window={AAFOrderHeader:api,...extra};
  vm.runInNewContext(fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8'),
    {window,document:{getElementById:()=>root,createElement:()=>({}),head:{append(){}}},location:{hash:''}});
  return window.AAFStockSummary;
}
const cardSection=(html,id)=>html.split(`data-stock-card="${id}"`)[1]?.split('data-stock-card="')[0]||'';

test('current warehouse cards and table use the same catalog, units and saved Free, independent of stale month',()=>{
  const {stock,catalog,fx}=currentStockFixture(),before=JSON.stringify({stock,catalog}),summary=summaryRuntime();
  const current=api.warehouseProjection(summary.withSavedCatalog({...stock,headerExchangeRate:fx},catalog,fx));
  assert.deepEqual(current.physical.quantity,{sheet:73,strip:400});assert.deepEqual(current.free.quantity,{sheet:29,strip:150});
  assert.equal(current.physical.value.equivalentTHB,4420);assert.equal(current.free.value.equivalentTHB,1755);
  assert.notEqual(current.free.quantity.sheet,stock.rows[0].qty-stock.rows[0].committedQty,'saved/manual Free is authoritative');
  assert.equal(current.physical.eq4x8,73+400*20*1000/(1220*2440));
  assert.equal(current.physical.eq25,73+400*20*1000/(1220*2440)*3.2/2.5);
  const monthly=api.build(fixture(),{stale:true}),html=api.render(monthly,new Set(),current);
  assert.match(cardSection(html,'physical'),/<strong>73<\/strong>/);assert.match(cardSection(html,'physical'),/4,420/);
  assert.doesNotMatch(cardSection(html,'physical'),/<strong>100<\/strong>|4,000|999/);
  assert.match(cardSection(html,'free'),/<strong>29<\/strong>/);assert.match(cardSection(html,'free'),/1,755/);
  assert.match(cardSection(html,'sold'),/USD 148/);assert.match(cardSection(html,'sold'),/ชุดตรวจย้อนหลัง/);
  assert.match(api.sourceText(monthly,current),/2026-04-04 · รุ่น 8/);assert.match(api.sourceText(monthly,current),/ไม่ใช่ฟีดขายสด/);
  assert.equal(JSON.stringify({stock,catalog}),before);
});

test('current stock is visible before the monthly review or price catalog arrives, with money unknown not zero',()=>{
  const {stock}=currentStockFixture(),current=api.warehouseProjection(stock),html=api.render(null,new Set(),current,'รอตรวจเดือนใหม่');
  assert.equal(current.physical.knownValueTHB,null);assert.equal(current.free.knownValueTHB,null);
  assert.match(cardSection(html,'physical'),/<strong>73<\/strong>/);assert.match(cardSection(html,'free'),/<strong>29<\/strong>/);
  assert.match(cardSection(html,'sold'),/รอตรวจเดือนใหม่/);assert.match(cardSection(html,'reserved'),/รอตรวจเดือนใหม่/);
  assert.match(cardSection(html,'physical'),/รอยืนยันชุดราคาหรือเรทส่วนกลาง/);assert.doesNotMatch(cardSection(html,'physical'),/฿ 0(?:[< ·]|$)/);
});

test('wrong catalog revision, date or per-spec quantity cannot value the current warehouse',()=>{
  const {stock,catalog,fx}=currentStockFixture(),summary=summaryRuntime();
  for(const alter of [c=>c.revision=7,c=>c.reportDate='2026-04-03',c=>c.rows[0].freeQty=28]){
    const changed=clone(catalog);alter(changed);
    const decorated=summary.withSavedCatalog(stock,changed,fx),current=api.warehouseProjection(decorated);
    assert.equal(decorated.savedCatalog,null);assert.equal(current.physical.value,null);assert.equal(current.physical.knownValueTHB,null);
    assert.deepEqual(current.physical.quantity,{sheet:73,strip:400});assert.deepEqual(current.free.quantity,{sheet:29,strip:150});
  }
});

test('missing USD FX leaves partial known THB valuation and exact unpriced unit coverage',()=>{
  const {stock,catalog}=currentStockFixture(),summary=summaryRuntime();
  const current=api.warehouseProjection(summary.withSavedCatalog(stock,catalog,null)),html=api.render(api.build(fixture()),new Set(),current);
  assert.equal(current.physical.value,null);assert.equal(current.physical.knownValueTHB,40);assert.equal(current.free.knownValueTHB,15);
  assert.deepEqual(current.physical.unknownQuantity,{sheet:73,strip:0});assert.equal(current.physical.unpricedSpecCount,1);
  assert.match(cardSection(html,'physical'),/เฉพาะส่วนที่ยืนยันราคาได้/);assert.match(cardSection(html,'physical'),/73 แผ่น/);
  assert.doesNotMatch(cardSection(html,'physical'),/4,000|4,420|999/);
});

test('late catalog and FX repaint current cards without rebuilding editors or collapsing expanded cards',()=>{
  let cardHtml='',receiptNodes=[];
  const handlers={},cards={
    get innerHTML(){return cardHtml;},
    set innerHTML(value){cardHtml=value;receiptNodes=['sold','reserved'].map(id=>({dataset:{stockReceiptDetails:id},open:false}));},
    querySelectorAll:selector=>selector==='[data-stock-receipt-details]'?receiptNodes:[]
  },status={textContent:''},source={textContent:''};
  let rootRebuilds=0;
  const root={classList:{remove(){}},addEventListener:(name,fn)=>{handlers[name]=fn;},querySelectorAll:()=>[],
    querySelector:selector=>selector==='.ss-kpis'?cards:selector==='.ss-status'?status:selector==='.ss-overview-source'?source:selector==='.ss-download'?{addEventListener(){}}:null,
    set innerHTML(value){rootRebuilds++;},get innerHTML(){return '';}};
  const summary=summaryRuntime(root),{stock,catalog,fx}=currentStockFixture();
  const data={...stock,report:{reportDate:stock.reportDate,sourceRowCount:2},exchangeRate:30};
  summary.update(data,r=>({eq:r.qty*r.w*r.l/(1220*2440)*r.t/2.5,price:999,curr:'USD',value:999*r.qty,freeValue:999*r.freeQty}));
  summary.setOrderReview(fixture(),{stale:true});
  receiptNodes[0].open=true;
  const card={querySelector:()=>null},toggle={dataset:{stockCardToggle:'free'},closest:selector=>selector==='[data-stock-card-toggle]'?toggle:selector==='[data-stock-card]'?card:null};
  handlers.click({target:toggle});
  const initialRebuilds=rootRebuilds;
  summary.setSavedStockCatalog(catalog);
  assert.match(cardSection(cards.innerHTML,'physical'),/ส่วนที่ยืนยันได้/);assert.match(cardSection(cards.innerHTML,'free'),/aria-expanded="true"/);
  assert.equal(receiptNodes[0].open,true);assert.equal(receiptNodes[1].open,false);
  summary.setExchangeRate(fx);
  assert.match(cardSection(cards.innerHTML,'physical'),/4,420/);assert.match(cardSection(cards.innerHTML,'free'),/1,755/);
  assert.match(cardSection(cards.innerHTML,'free'),/aria-expanded="true"/);assert.match(source.textContent,/2026-04-04 · รุ่น 8/);
  assert.equal(receiptNodes[0].open,true);
  summary.setSavedStockCatalog({...catalog,revision:7});
  assert.match(cardSection(cards.innerHTML,'physical'),/<strong>73<\/strong>/);assert.doesNotMatch(cardSection(cards.innerHTML,'physical'),/4,420/);
  assert.match(cardSection(cards.innerHTML,'free'),/aria-expanded="true"/);assert.equal(rootRebuilds,initialRebuilds,'catalog/FX arrival must not rebuild active note editors');
  assert.equal(receiptNodes[0].open,true);
});

test('initial hero and current warehouse use current FX, while dated sales retain their own rate',()=>{
  const summary=summaryRuntime(),{stock,catalog,fx}=currentStockFixture();
  const monthly=fixture();monthly.financial.metadata.fx={rate:31,date:'2026-04-02'};
  summary.setOrderReview(monthly,{stale:true});
  let m=summary.buildModel({...stock,report:{reportDate:stock.reportDate},exchangeRate:30},
    r=>({eq:r.qty*r.w*r.l/(1220*2440)*r.t/2.5,price:999,curr:'USD',value:r.qty*999,freeValue:r.freeQty*999}));
  m=summary.withSavedCatalog({...m,headerExchangeRate:fx,salesSummary:{catalog:{fxThbPerUsd:31,fxStatus:'OLD SYNTHETIC FX'}}},catalog,fx);
  const html=summary.renderHTML(m),hero=html.split('class="ss-exchange"')[1].split('</header>')[0];
  assert.match(hero,/<b>30<\/b>/);assert.doesNotMatch(hero,/OLD SYNTHETIC FX|<b>31<\/b>/);
  assert.match(cardSection(html,'physical'),/4,420/);assert.match(cardSection(html,'sold'),/4,588/);
  assert.match(html,/เรทประเมินสต๊อก USD\/THB 30 \(2026-04-03\)/);assert.match(html,/เรทชุดขาย USD\/THB 31 \(2026-04-02\)/);
});
