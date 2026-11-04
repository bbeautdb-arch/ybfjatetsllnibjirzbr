import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),header=require('../stock_order_header.js'),window={};
vm.runInNewContext(fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8'),{window,document:{getElementById:()=>null,createElement:()=>({}),head:{append(){}}}});
const summary=window.AAFStockSummary,copy=value=>JSON.parse(JSON.stringify(value));
const row=(key,w,l,t,grade,qty,freeQty,unit='sheet')=>({key,w,l,t,grade,qty,freeQty,unit,committedQty:0});
const fx={rate:30,date:'2000-06-01',status:'stale',basis:'BOT_USD_THB_BUYING_TRANSFER'};
function setup(rows,prices,rate=fx){
  const stock={revision:7,reportDate:'2000-06-02',headerExchangeRate:rate,rows};
  const catalog={revision:7,reportDate:stock.reportDate,catalogRevision:3,savedAt:'2000-06-02T01:00:00Z',rows:rows.map((r,i)=>({...r,...prices[i]}))};
  const decorated=summary.withSavedCatalog(stock,catalog,rate),warehouse=header.warehouseProjection(decorated);
  return {stock,catalog,decorated,warehouse};
}
const physical=w=>header.render(null,new Set(),w).split('data-stock-card="physical"')[1]?.split('data-stock-card="sold"')[0]||'';
const card=(html,id)=>html.slice(html.indexOf('<div class="ss-kpi ss-kpi-'+id+'"'),id==='free'?undefined:html.indexOf('<div class="ss-kpi ss-kpi-'+({physical:'sold',sold:'reserved',reserved:'free'})[id]+'"'));
const panels=html=>[...html.matchAll(/<details\b[^>]*data-physical-grade="([^"]*)"[^>]*>([\s\S]*?)<\/details>/g)];
function itemCell(w,r,field='free-value'){
  const matching=panels(physical(w)).filter(m=>m[1]===r.grade);assert(matching.length,'grade panel missing');
  const identity=[Math.min(r.w,r.l),Math.max(r.w,r.l),Number(r.t),r.unit].join('|');
  const item=matching.flatMap(panel=>[...panel[2].matchAll(/<div\b[^>]*data-physical-item="([^"]*)"[^>]*>([\s\S]*?)<\/div>/g)]).find(m=>m[1]===identity);assert(item,'item row missing');
  const cell=item[2].match(new RegExp('<b\\b[^>]*data-item-'+field+'(?=[\\s=>])[^>]*>([\\s\\S]*?)<\\/b>'));
  assert(cell,'item '+field+' cell missing');return cell[1];
}
const entry=(w,r)=>w.physical.composition.freeValuation.items[JSON.stringify([Math.min(r.w,r.l),Math.max(r.w,r.l),Number(r.t),r.grade,r.unit])];
const expectMoney=(w,r,value)=>assert.equal(itemCell(w,r),'≈ ฿ '+value.toLocaleString('th-TH',{maximumFractionDigits:2}));

test('THB and USD item Free values use saved catalog decoration exactly once, including saved manual Free',()=>{
  const rows=[row('synthetic-thb',610,1220,2.5,'A',10,2),row('synthetic-usd',1220,2440,3.2,'AAA',2,3)];
  const {warehouse:w,decorated}=setup(rows,[{price:12,currency:'THB'},{price:2,currency:'USD'}]);
  assert.equal(decorated.rows[0].catalogFreeValue,24);assert.equal(decorated.rows[1].catalogFreeValue,180);
  expectMoney(w,rows[0],24);expectMoney(w,rows[1],180);assert.equal(entry(w,rows[1]).freeQty,3);assert.equal(w.free.knownValueTHB,204);
});

test('reversed aliases sum each exact saved row value, never average distinct row prices',()=>{
  const rows=[row('synthetic-forward',610,1220,2.5,'A',8,3),row('synthetic-reversed',1220,610,2.5,'A',10,5)],{warehouse:w}=setup(rows,[{price:10,currency:'THB'},{price:20,currency:'THB'}]);
  const value=entry(w,rows[0]);assert.equal(value.freeQty,8);assert.equal(value.valueTHB,130);assert.equal(value.knownValueTHB,130);assert.equal(value.unknownPriceRows,0);expectMoney(w,rows[0],130);
  assert.notEqual(value.valueTHB,8*(10+20)/2);
});

test('allocation-only near sizes, grades and strips retain separate value entries and separate quantities',()=>{
  const rows=[row('synthetic-normal',1220,2440,2.5,'A',10,2),row('synthetic-near',1200,2400,2.5,'A',10,3),row('synthetic-other-grade',1200,2400,2.5,'B',10,4),row('synthetic-strip',25,2000,3.2,'B',20,5,'strip')];
  const {warehouse:w}=setup(rows,rows.map((r,i)=>({price:10+i,currency:'THB'})));
  [20,33,48,65].forEach((value,i)=>{assert.equal(entry(w,rows[i]).valueTHB,value);expectMoney(w,rows[i],value);});
  assert.deepEqual(w.free.quantity,{sheet:9,strip:5});assert.equal(w.free.knownValueTHB,166);
});

test('missing prices stay unknown for positive Free; verified zero Free needs no fabricated unit price',()=>{
  for(const freeQty of [0,2])for(const change of [{price:0},{price:null},{price:-1},{price:'12'},{price:NaN},{price:Infinity},{currency:'EUR'},{currency:null}]){
    const r=row('synthetic-price',610,1220,2.5,'A',10,freeQty),{warehouse:w}=setup([r],[{price:12,currency:'THB',...change}]);
    if(freeQty===0){assert.equal(entry(w,r).valueTHB,0);assert.equal(entry(w,r).unknownPriceRows,0);expectMoney(w,r,0);assert.equal(w.free.unpricedSpecCount,0);}
    else{assert.equal(entry(w,r).valueTHB,null);assert.equal(entry(w,r).unknownPriceRows,1);assert.match(itemCell(w,r),/ขาดราคาสต๊อก|ขาดสกุลเงิน/);assert.doesNotMatch(itemCell(w,r),/฿ 0/);}
  }
});

test('missing verified USD FX leaves USD value unknown without suppressing known THB values',()=>{
  const rows=[row('synthetic-thb',610,1220,2.5,'A',10,2),row('synthetic-usd',1220,2440,3.2,'AAA',10,3)],prices=[{price:12,currency:'THB'},{price:2,currency:'USD'}];
  for(const rate of [null,{...fx,rate:0},{...fx,basis:'unverified'},{...fx,date:'2000-02-30'}]){
    const {warehouse:w}=setup(rows,prices,rate);expectMoney(w,rows[0],24);assert.match(itemCell(w,rows[1]),/ขาดเรท USD\/THB/);assert.equal(entry(w,rows[1]).valueTHB,null);
  }
});

test('one unpriced reversed component never renders a known subtotal as the complete item value',()=>{
  const rows=[row('synthetic-priced',610,1220,2.5,'A',8,3),row('synthetic-unknown',1220,610,2.5,'A',10,5)],{warehouse:w}=setup(rows,[{price:10,currency:'THB'},{price:null,currency:'THB'}]);
  assert.equal(entry(w,rows[0]).valueTHB,null);assert.equal(entry(w,rows[0]).knownValueTHB,30);assert.equal(entry(w,rows[0]).unknownPriceRows,1);assert.equal(w.free.knownValueTHB,30);
  assert.match(itemCell(w,rows[0]),/≈ ฿ 30<small>เฉพาะส่วนที่มีราคา · ขาดราคาสต๊อก 1 รายการ/);assert.notEqual(itemCell(w,rows[0]),'≈ ฿ 30');assert.equal(w.free.unpricedSpecCount,1);
});

test('missing or invalid decorated THB Free amount never falls back to a raw price or legacy freeValue',()=>{
  const r=row('synthetic-amount',610,1220,2.5,'A',10,3),f=setup([r],[{price:12,currency:'THB'}]);
  for(const amount of [undefined,null,-1,NaN,Infinity,'36']){
    const decorated=copy(f.decorated);decorated.rows[0].catalogFreeValue=amount;decorated.rows[0].freeValue=999;
    if(amount===undefined)delete decorated.rows[0].catalogFreeValue;
    const w=header.warehouseProjection(decorated);assert.equal(entry(w,r).valueTHB,null);assert.match(itemCell(w,r),/รอยืนยันมูลค่า/);assert.doesNotMatch(itemCell(w,r),/≈ ฿/);
  }
});

test('known zero Free with a verified price is genuinely zero, while zero-Physical positive Free has its saved value',()=>{
  const rows=[row('synthetic-zero-free',610,1220,2.5,'A',10,0),row('synthetic-free-only',1220,2440,3.2,'F',0,4)],{warehouse:w}=setup(rows,[{price:12,currency:'THB'},{price:2,currency:'USD'}]);
  expectMoney(w,rows[0],0);expectMoney(w,rows[1],240);assert.equal(entry(w,rows[0]).unknownPriceRows,0);assert.equal(entry(w,rows[1]).freeQty,4);
});

test('legacy, Page09, draft or undeclared prices cannot supply the item stock valuation',()=>{
  const r={...row('synthetic-unverified',610,1220,2.5,'A',10,3),price:500,curr:'THB',priceObj:{price:500,currency:'THB'},value:5000,freeValue:1500,orderPrice:700,pricingDraft:{price:800},catalogPrice:900,catalogCurrency:'THB',catalogValue:9000,catalogFreeValue:2700};
  const w=header.warehouseProjection({revision:7,reportDate:'2000-06-02',rows:[r]});
  assert.match(itemCell(w,r),/รอราคา\/FX|รอยืนยัน/);assert.doesNotMatch(itemCell(w,r),/≈ ฿/);assert.equal(w.free.knownValueTHB,null);
});

test('catalog revision, date, exact-spec or saved Free mismatch and catalog clearing wipe item values',()=>{
  const r=row('synthetic-price',610,1220,2.5,'A',10,3),f=setup([r],[{price:12,currency:'THB'}]);expectMoney(f.warehouse,r,36);
  for(const mutate of [c=>c.revision--,c=>c.reportDate='2000-06-01',c=>c.rows[0].t=3.2,c=>c.rows[0].freeQty=4,c=>c.rows[0].grade='B']){
    const catalog=copy(f.catalog);mutate(catalog);const decorated=summary.withSavedCatalog(f.stock,catalog,fx),w=header.warehouseProjection(decorated);
    assert.equal(decorated.savedCatalog,null);assert.doesNotMatch(itemCell(w,r),/≈ ฿/);assert.match(itemCell(w,r),/รอราคา\/FX|รอยืนยัน/);
  }
  const cleared=summary.withSavedCatalog(f.decorated,null,fx),w=header.warehouseProjection(cleared);assert.equal(cleared.savedCatalog,null);assert.doesNotMatch(itemCell(w,r),/≈ ฿/);
});

test('stale Free identity, catalog revision or FX cannot retain old item valuation with unchanged Physical',()=>{
  const r=row('synthetic-priced',610,1220,2.5,'A',10,3),f=setup([r],[{price:2,currency:'USD'}]);
  for(const mutate of [w=>w.catalogRevision++,w=>w.fx.rate++,w=>w.fx.date='2000-06-02',w=>w.free.quantity.sheet++,w=>w.physical.composition.stockRevision--]){
    const w=copy(f.warehouse);mutate(w);assert.doesNotMatch(itemCell(w,r),/≈ ฿/);assert.match(itemCell(w,r),/รอยืนยัน|รอราคา\/FX/);assert.deepEqual(w.physical.quantity,f.warehouse.physical.quantity);
  }
});

test('tampered known subtotal or item value does not pass unchanged warehouse Free valuation',()=>{
  const r=row('synthetic-priced',610,1220,2.5,'A',10,3),{warehouse:original}=setup([r],[{price:12,currency:'THB'}]);
  for(const mutate of [w=>w.free.knownValueTHB++,w=>entry(w,r).knownValueTHB++,w=>entry(w,r).valueTHB++]){
    const w=copy(original);mutate(w);assert.doesNotMatch(itemCell(w,r),/≈ ฿/);assert.match(itemCell(w,r),/รอยืนยัน|รอราคา\/FX/);
  }
});

test('FX-only and saved-catalog refresh update item amounts without changing stock quantities',()=>{
  const r=row('synthetic-priced',610,1220,2.5,'A',10,3),prices=[{price:2,currency:'USD'}],a=setup([r],prices,fx),b=setup([r],prices,{...fx,rate:31}),c=setup([r],[{price:3,currency:'USD'}],{...fx,rate:31});
  expectMoney(a.warehouse,r,180);expectMoney(b.warehouse,r,186);expectMoney(c.warehouse,r,279);
  assert.deepEqual(a.warehouse.physical.quantity,b.warehouse.physical.quantity);assert.deepEqual(a.warehouse.free.quantity,c.warehouse.free.quantity);assert.equal(itemCell(a.warehouse,r,'free'),itemCell(c.warehouse,r,'free'));
});

test('item estimates remain read-only and do not alter other cards, money totals, equivalents or source inputs',()=>{
  const rows=[row('synthetic-a',610,1220,2.5,'A',10,2.125),row('synthetic-b',25,2000,3.2,'B',100,80,'strip')],f=setup(rows,[{price:12.25,currency:'THB'},{price:0.125,currency:'USD'}]),before=JSON.stringify(f),plain=copy(f.warehouse);delete plain.physical.composition.freeValuation;
  const after=header.render(null,new Set(),f.warehouse),baseline=header.render(null,new Set(),plain);for(const id of ['sold','reserved','free'])assert.equal(card(after,id),card(baseline,id));
  assert.equal(header.sourceText(null,f.warehouse),header.sourceText(null,plain));assert.equal(JSON.stringify(f),before);expectMoney(f.warehouse,rows[0],26.03125);expectMoney(f.warehouse,rows[1],300);
});

test('coverage counts exact positive-Free specifications once and distinguishes missing stock price, currency and FX',()=>{
  const rows=[row('synthetic-no-price',610,1220,1.6,'A',10,2),row('synthetic-reversed-no-price',1220,610,1.6,'A',4,1),
    row('synthetic-no-currency',610,1220,2.5,'A',10,3),row('synthetic-no-fx',610,1220,3.2,'A',10,4),
    row('synthetic-zero-unpriced',610,1220,4,'A',10,0),row('synthetic-known',610,1220,5,'A',10,5)];
  const {warehouse:w}=setup(rows,[{price:null,currency:'THB'},{price:null,currency:'THB'},{price:12,currency:null},
    {price:2,currency:'USD'},{price:null,currency:'THB'},{price:8,currency:'THB'}],null);
  assert.equal(w.free.unpricedSpecCount,3);assert.equal(w.free.missingPriceSpecCount,1);assert.equal(w.free.missingCurrencySpecCount,1);assert.equal(w.free.missingFxSpecCount,1);
  assert.deepEqual(w.free.unknownQuantity,{sheet:10,strip:0});assert.equal(w.free.knownValueTHB,40);
  assert.match(itemCell(w,rows[0]),/ขาดราคาสต๊อก 1 รายการ/);assert.match(itemCell(w,rows[2]),/ขาดสกุลเงิน 1 รายการ/);assert.match(itemCell(w,rows[3]),/ขาดเรท USD\/THB 1 รายการ/);
  expectMoney(w,rows[4],0);assert.match(physical(w),/ขาดราคาสต๊อก 2 รายการ/,'Physical coverage still includes a positive-Physical zero-Free item');
});

test('all-positive-Free prices missing exposes missing coverage without presenting zero as a full total',()=>{
  const r=row('synthetic-all-missing',1220,2440,2.5,'AAA',10,3),{warehouse:w}=setup([r],[{price:null,currency:'THB'}]);
  assert.equal(w.free.knownValueTHB,null);assert.equal(header.freeCompositionView(w).valueBound,true);
  const html=physical(w);assert.match(html,/ยังไม่มีมูลค่าที่คำนวณได้/);assert.match(html,/ยังขาด 1 รายการ/);assert.doesNotMatch(html,/data-grade-total-field="value">≈ ฿ 0/);
});
