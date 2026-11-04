// Synthetic fixtures only: category Free is a subtotal of the saved warehouse,
// never a new reservation, selling-price calculation or stock write.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),header=require('../stock_order_header.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const row=(key,w,l,t,grade,qty,freeQty,price=10,unit='sheet',currency='THB')=>({key,w,l,t,grade,qty,freeQty,unit,committedQty:0,
  catalogPrice:price,catalogCurrency:currency,catalogValue:price===null?null:qty*price,catalogFreeValue:price===null?null:freeQty*price});
const fixture=rows=>header.warehouseProjection({revision:8,reportDate:'2000-06-02',savedCatalog:{catalogRevision:4},rows});
const total=(w,kind)=>header.categoryFreeSummary(w.physical.composition.groups[kind],kind,header.freeCompositionView({...w,free:{...w.free,composition:w.physical.composition}}));
const category=(w,kind,free=false)=>{
  const html=header.render(null,new Set(),w),card=html.split('data-stock-card="'+(free?'free':'physical')+'"')[1];
  return card.split('data-category-free-summary="'+kind+'"')[1]?.split('</div></div>')[0]||'';
};

test('normal/nonstandard/strip category Free counts and known values reconcile exactly to the saved warehouse',()=>{
  const w=fixture([row('normal',1220,2440,2.5,'AAA',100,60,20),row('nonstandard',610,1220,1.6,'F',50,10,8),row('strip',25,2000,3.2,'B',1000,750,0.5,'strip')]);
  assert.deepEqual(['normal','nonstandard','strip'].map(kind=>[total(w,kind).freeQty,total(w,kind).knownValueTHB,total(w,kind).status]),[[60,1200,'complete'],[10,80,'complete'],[750,375,'complete']]);
  assert.equal(total(w,'normal').freeQty+total(w,'nonstandard').freeQty,w.free.quantity.sheet);
  assert.equal(total(w,'strip').freeQty,w.free.quantity.strip);
  assert.equal(['normal','nonstandard','strip'].reduce((sum,kind)=>sum+total(w,kind).knownValueTHB,0),w.free.knownValueTHB);
  for(const free of [false,true]){
    assert.match(category(w,'normal',free),/data-category-free-quantity>60 แผ่น/);
    assert.match(category(w,'normal',free),/data-category-free-value>≈ ฿ 1,200/);
    assert.match(category(w,'strip',free),/data-category-free-quantity>750 ชิ้น/);
    assert.match(category(w,'strip',free),/data-category-free-value>≈ ฿ 375/);
  }
});

test('allocation-equivalent 1200x2400 stays nonstandard and reversed axes are counted once per source row',()=>{
  const w=fixture([row('normal',2440,1220,2.5,'AAA',10,2,10),row('near',1200,2400,2.5,'AAA',10,3,20),row('alias',2400,1200,2.5,'AAA',10,4,30)]);
  assert.equal(total(w,'normal').freeQty,2);assert.equal(total(w,'normal').knownValueTHB,20);
  assert.equal(total(w,'nonstandard').freeQty,7);assert.equal(total(w,'nonstandard').knownValueTHB,180);
  assert.equal(w.physical.composition.groups.nonstandard.grades[0].items.length,1);
});

test('known partial value remains visible with distinct missing price, currency and FX exact-spec counts',()=>{
  const rows=[row('known',1220,2440,1.6,'AAA',10,2,10),row('unpriced',1220,2440,2.5,'AAA',10,3,null),row('unpriced-reversed',2440,1220,2.5,'AAA',10,4,null),
    {...row('currency',1220,2440,3.2,'AAA',10,5,10),catalogCurrency:null,catalogFreeValue:null},
    {...row('fx',1220,2440,4,'AAA',10,6,2,'sheet','USD'),catalogFreeValue:null}];
  const w=fixture(rows),t=total(w,'normal');
  assert.equal(t.status,'partial');assert.equal(t.freeQty,20);assert.equal(t.knownValueTHB,20);assert.equal(t.unpricedSpecCount,3);
  assert.deepEqual([t.missingPriceSpecCount,t.missingCurrencySpecCount,t.missingFxSpecCount],[1,1,1]);
  assert.match(category(w,'normal'),/≈ ฿ 20/);assert.match(category(w,'normal'),/ยังขาด 3 รายการ/);
  assert.match(category(w,'normal'),/ขาดราคาสต๊อก 1 รายการ/);assert.match(category(w,'normal'),/ขาดสกุลเงิน 1 รายการ/);assert.match(category(w,'normal'),/ขาดเรท USD\/THB 1 รายการ/);
});

test('zero Free is genuinely zero value without a unit price; all-positive-Free unpriced is not zero',()=>{
  const w=fixture([row('zero',1220,2440,1.8,'B',10,0,null),row('unpriced',610,1220,1.6,'F',10,2,null)]);
  assert.equal(total(w,'normal').status,'complete');assert.equal(total(w,'normal').knownValueTHB,0);
  assert.match(category(w,'normal'),/data-category-free-value>≈ ฿ 0/);
  assert.equal(total(w,'nonstandard').status,'partial');assert.equal(total(w,'nonstandard').knownValueTHB,null);
  assert.match(category(w,'nonstandard'),/ยังไม่มีมูลค่าที่คำนวณได้/);assert.doesNotMatch(category(w,'nonstandard'),/≈ ฿ 0/);
  assert.equal(total(w,'strip').knownValueTHB,0);
});

test('unknown-grade quantities and exact saved values stay in their category total',()=>{
  const w=fixture([row('known',1220,2440,2.5,'AAA',10,2,10),row('unknown-grade',1220,2440,3.2,'',10,3,5),row('unknown-nonstandard',610,1220,3.2,'',4,1,null)]);
  assert.equal(total(w,'normal').freeQty,5);assert.equal(total(w,'normal').knownValueTHB,35);
  assert.equal(total(w,'nonstandard').freeQty,1);assert.equal(total(w,'nonstandard').unpricedSpecCount,1);
  assert.equal(total(w,'normal').knownValueTHB,w.free.knownValueTHB);
});

test('zero-Physical unknown-grade strips with positive manual Free remain visible in the Physical category summary',()=>{
  const w=fixture([row('unknown-strip-manual',25,2000,3.2,'',0,7,2,'strip')]);
  assert.equal(total(w,'strip').freeQty,7);assert.equal(total(w,'strip').knownValueTHB,14);
  for(const free of [false,true]){
    assert.match(category(w,'strip',free),/data-category-free-quantity>7 ชิ้น/);
    assert.match(category(w,'strip',free),/data-category-free-value>≈ ฿ 14/);
  }
});

test('stale stock, Free quantity, catalog or FX identity fails closed rather than reuse category money',()=>{
  const base=fixture([row('a',1220,2440,2.5,'AAA',10,2,10)]);
  for(const mutate of [w=>w.stockRevision++,w=>w.free.quantity.sheet++,w=>w.catalogRevision++,w=>w.fx={rate:30,date:'2000-06-01'},w=>w.free.knownValueTHB++]){
    const w=copy(base);mutate(w);assert.equal(total(w,'normal').knownValueTHB,null);assert.match(category(w,'normal'),/รอยืนยัน/);assert.doesNotMatch(category(w,'normal'),/≈ ฿ 20/);
  }
});

test('category detail cannot mask missing or mismatched positive-Free valuation items',()=>{
  const base=fixture([row('a',1220,2440,2.5,'AAA',10,2,10)]),key=Object.keys(base.physical.composition.freeValuation.items)[0];
  for(const mutate of [w=>delete w.physical.composition.freeValuation.items[key],w=>w.physical.composition.freeValuation.items[key].freeQty++,w=>w.physical.composition.freeValuation.items[key].valueTHB++]){
    const w=copy(base);mutate(w);assert.equal(total(w,'normal').knownValueTHB,null);assert.match(category(w,'normal'),/รอยืนยัน/);
  }
});

test('saved manual Free and decimal values retain full precision until display; render does not mutate inputs',()=>{
  const w=fixture([row('manual',1220,2440,2.5,'AAA',0,2.125,12.25),row('tiny',1220,2440,3.2,'AAA',1,0.0001,5)]),before=JSON.stringify(w),t=total(w,'normal');
  assert.equal(t.freeQty,2.1251);assert.equal(t.knownValueTHB,26.03175);
  assert.match(category(w,'normal'),/2\.1251 แผ่น/);assert.match(category(w,'normal'),/≈ ฿ 26\.03/);
  assert.equal(JSON.stringify(w),before);
});
