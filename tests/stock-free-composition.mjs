// Synthetic fixtures only. Upper Free composition is a read-only subset of
// the same saved catalog as Physical; editors mount through the shared registry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),header=require('../stock_order_header.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const row=(key,w,l,t,grade,qty,freeQty,price=2,unit='sheet')=>({key,w,l,t,grade,qty,freeQty,unit,committedQty:Math.max(qty-freeQty,0),catalogPrice:price,catalogCurrency:'THB',catalogValue:price===null?null:qty*price,catalogFreeValue:price===null?null:freeQty*price});
const fixture=rows=>header.warehouseProjection({revision:8,reportDate:'2000-06-02',savedCatalog:{catalogRevision:4},rows});
const render=w=>header.render(null,new Set(),w);
const freeCard=w=>render(w).split('<div class="ss-kpi ss-kpi-free"')[1];
const panel=(w,kind='normal',grade='AAA')=>freeCard(w).split('data-free-group="'+kind+'"')[1].split('data-free-group=')[0].split('data-physical-grade="'+grade+'"')[1]?.split('</details>')[0];

test('Free subset matches saved Free totals by actual size and unit, not all Physical or allocation-equivalent size',()=>{
  const w=fixture([row('a',1220,2440,2.5,'AAA',20,7),row('b',1200,2400,2.5,'AAA',15,4),row('c',25,2000,3.2,'B',100,60,0.5,'strip')]),v=header.freeCompositionView(w);
  assert.equal(v.status,'verified-quantities');
  assert.equal(v.groups.normal.quantity,7);assert.equal(v.groups.nonstandard.quantity,4);assert.equal(v.groups.strip.quantity,60);
  assert.equal(v.groups.normal.quantity+v.groups.nonstandard.quantity,w.free.quantity.sheet);
  assert.equal(v.groups.strip.quantity,w.free.quantity.strip);
  assert.equal(v.groups.normal.grades[0].items[0].quantity,20);
});

test('positive Free only, including manual Free above zero Physical, with all-zero items retained outside this subset',()=>{
  const rows=[row('zero',1220,2440,1.6,'AAA',8,0),row('manual',1220,2440,2.5,'AAA',0,2.125),row('retained',1220,2440,3.2,'A',0,0)],before=JSON.stringify(rows),w=fixture(rows),v=header.freeCompositionView(w);
  assert.deepEqual(v.groups.normal.grades.map(g=>g.grade),['AAA']);assert.equal(v.groups.normal.grades[0].items.length,1);
  assert.equal(v.groups.normal.quantity,2.125);assert.equal(w.physical.quantity.sheet,8);assert.equal(rows.length,3);assert.equal(JSON.stringify(rows),before);
});

test('grade, exact size and thickness ordering is deterministic, reversed axes merge display only',()=>{
  const w=fixture([row('b',1220,2440,3.2,'B',2,1),row('aa2',1000,2000,3.2,'AAA',4,2),row('aa1',1000,2000,1.6,'AAA',8,3),row('aa1-r',2000,1000,1.6,'AAA',2,1),row('a',610,1220,2.5,'A',5,2)]),v=header.freeCompositionView(w),g=v.groups.nonstandard.grades;
  assert.deepEqual(g.map(x=>x.grade),['AAA','A']);assert.deepEqual(g[0].items.map(i=>[i.w,i.l,i.t,i.quantity,i.freeQty]),[[1000,2000,1.6,10,4],[1000,2000,3.2,4,2]]);
  assert.equal(g[0].freeQty,6);assert.equal(g[0].quantity,14);
});

test('grade detail shows Physical, saved Free and saved-stock Free value, with one footer and no editable quantity',()=>{
  const w=fixture([row('a',1220,2440,1.6,'AAA',12,3,10),row('b',1220,2440,2.5,'AAA',8,4,20)]),p=panel(w);
  assert.match(p,/AAA · Free 7 แผ่น/);assert.match(p,/data-item-physical>12/);assert.match(p,/data-item-free>3/);assert.match(p,/data-item-free-value>≈ ฿ 30/);
  assert.match(p,/data-grade-total-field="physical">20/);assert.match(p,/data-grade-total-field="free">7/);assert.match(p,/data-grade-total-field="value">≈ ฿ 110/);
  assert.doesNotMatch(p,/<(?:textarea|input|select)\b/);
});

test('unknown price is not zero; only affected values remain unknown while saved Free still reconciles',()=>{
  const w=fixture([row('a',1220,2440,1.6,'AAA',5,2,10),row('b',1220,2440,2.5,'AAA',8,3,null)]),v=header.freeCompositionView(w),p=panel(w);
  assert.equal(v.status,'verified-quantities');assert.equal(v.groups.normal.quantity,5);
  assert.match(p,/data-grade-total-field="free">5/);assert.match(p,/data-grade-total-field="value">รอราคา\/FX/);assert.match(p,/data-item-free-value>≈ ฿ 20/);
});

test('mismatched stock identity, Free totals, or tampered item Free cannot render a plausible subset',()=>{
  const base=fixture([row('a',1220,2440,2.5,'AAA',12,3)]);
  for(const mutate of [w=>w.stockRevision++,w=>w.stockReportDate='2000-06-03',w=>w.free.quantity.sheet++,w=>w.free.composition.groups.normal.grades[0].items[0].freeQty++,w=>w.physical.quantity.sheet++]){
    const w=clone(base);mutate(w);assert.equal(header.freeCompositionView(w).status,'pending');assert.match(freeCard(w),/รายละเอียด Free ยังรอยืนยัน/);
  }
});

test('catalog/FX mismatch cannot reuse an old Free money subtotal',()=>{
  const base=fixture([row('a',1220,2440,2.5,'AAA',12,3)]);
  for(const mutate of [w=>w.catalogRevision++,w=>w.fx={rate:30,date:'2000-06-01'},w=>w.free.knownValueTHB++]){
    const w=clone(base);mutate(w);const v=header.freeCompositionView(w);assert.equal(v.status,'verified-quantities');assert.equal(v.valueBound,false);assert.match(panel(w),/data-grade-total-field="value">รอราคา\/FX/);
  }
});

test('one shared follow-up host outside duplicated card contents, collapsed by default, no source writes',()=>{
  const w=fixture([row('a',1220,2440,2.5,'AAA',12,3)]),before=JSON.stringify(w),html=freeCard(w);
  assert.equal((html.match(/data-free-followup-host/g)||[]).length,1);assert.equal((html.match(/data-free-followup-panel/g)||[]).length,1);
  assert.match(html,/<details class="ss-free-followup-panel" data-free-followup-panel><summary>ติดตาม Free Stock/);
  assert.doesNotMatch(html,/<details[^>]*\sopen(?:\s|=|>)/);assert.match(html,/data-physical-group="free-normal"/);
  assert.equal(JSON.stringify(w),before);
});

test('unknown grade Free is visible as unresolved, not silently lost from group totals',()=>{
  const w=fixture([row('a',1220,2440,2.5,'',12,3)]),v=header.freeCompositionView(w);
  assert.equal(v.groups.normal.quantity,3);assert.equal(v.groups.normal.grades.length,0);assert.match(freeCard(w),/ยังไม่ระบุเกรด 3 แผ่น/);
});

test('untrusted grade markup is escaped and tiny positive Free is not rounded to zero',()=>{
  const w=fixture([row('a',1220,2440,2.5,'<img onerror=alert(1)>',12,0.0001)]),html=freeCard(w);
  assert.match(html,/&lt;img onerror=alert\(1\)&gt;/);assert.doesNotMatch(html,/<img\b/);assert.match(html,/· Free 0\.0001 แผ่น/);
});
