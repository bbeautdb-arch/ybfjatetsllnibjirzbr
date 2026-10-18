import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const window={};
vm.runInNewContext(fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8'),{window,document:{getElementById:()=>null,createElement:()=>({}),head:{append(){}}}});
const {buildModel,renderHTML,renderKpis}=window.AAFStockSummary;
const AREA=1220*2440,near=(actual,expected,label='')=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-7,`${label}: ${actual} != ${expected}`);
const clone=value=>JSON.parse(JSON.stringify(value));
const shown=value=>Number(value).toLocaleString('th-TH',{maximumFractionDigits:2});
const text=html=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
function row(key,extra={}){
  const r={key,sku:key,desc:'unchanged source',size:'Normal',w:1220,l:2440,t:3.2,grade:'B',unit:'sheet',qty:100,baseQty:100,committedQty:0,freeQty:100,d90:100,d180:0,d270:0,d360:0,dOver:0,priceObj:{price:2,currency:'THB'},note:'keep note',followup:'keep followup',...extra};
  return r;
}
const fixtureRows=[
  row('stock-without-demand'),
  row('other-spec-shortage',{w:1260,qty:0,baseQty:0,d90:0,committedQty:90,freeQty:0}),
  row('partial',{t:2.5,grade:'AAA',qty:20,baseQty:20,d90:20,committedQty:30,freeQty:0}),
  row('manual-free',{w:610,l:1220,t:2,grade:'AAA',qty:30,baseQty:30,d90:30,committedQty:10,freeQty:25,freeOverride:{value:25,at:'2026-10-18T16:00:00Z'}}),
  row('strip',{w:25,l:2052,t:3.2,unit:'strip',qty:1000,baseQty:1000,d90:1000,committedQty:250,freeQty:750}),
  row('retained-reverse-zero',{w:2052,l:25,t:3.2,unit:'strip',qty:0,baseQty:0,d90:0,committedQty:0,freeQty:0,retained:true}),
];
const calculate=r=>({price:r.priceObj.price,curr:r.priceObj.currency,eq:r.qty*r.w*r.l/AREA*r.t/2.5,value:r.qty*r.priceObj.price,freeValue:r.freeQty*r.priceObj.price});
const data=(rows=fixtureRows)=>({report:{reportDate:'2026-10-18',sourceRowCount:rows.length},revision:63,updatedAt:'2026-10-18T17:27:00Z',exchangeRate:33.4246,rows:clone(rows)});
const groupTables=html=>Array.from(html.matchAll(/<section class="ss-group">[\s\S]*?<\/section>/g),match=>match[0]);
const physicalCard=html=>{const start=html.indexOf('class="ss-kpi ss-kpi-physical"'),end=html.indexOf('class="ss-kpi ss-kpi-sold"',start);assert.ok(start>=0&&end>start);return html.slice(start,end);};
const widths=tr=>Array.from(tr.matchAll(/<(?:th|td)\b([^>]*)>/g),m=>Number(m[1].match(/\bcolspan="(\d+)"/)?.[1]||1)).reduce((n,v)=>n+v,0);

test('reservation subsets sum per exact row, never min(group Physical, group demand), while saved manual Free stays authoritative',()=>{
  const source=data(),before=JSON.stringify(source),m=buildModel(source,calculate);
  for(const r of m.rows){near(r.reservedInStockQty,Math.min(r.qty,r.committedQty),r.key);near(r.reservedProductionQty,Math.max(0,r.committedQty-r.qty),r.key);near(r.reservedInStockQty+r.reservedProductionQty,r.committedQty);}
  const b=m.grades.find(([g])=>g==='B')[1];
  near(b.byUnit.sheet.qty,100);near(b.byUnit.sheet.committedQty,90);
  near(b.byUnit.sheet.reservedInStockQty,0,'other sizes cannot satisfy demand by grade-only minimum');near(b.byUnit.sheet.reservedProductionQty,90);
  near(m.total.byUnit.sheet.reservedInStockQty,30);near(m.total.byUnit.sheet.reservedProductionQty,100);
  near(m.total.byUnit.strip.reservedInStockQty,250);near(m.total.byUnit.strip.reservedProductionQty,0);
  const manual=m.rows.find(r=>r.key==='manual-free');near(manual.freeQty,25);near(manual.reservedInStockQty,10,'do not infer allocated = Physical - manually overridden Free');
  near(m.total.byUnit.sheet.freeQty,125);assert.equal(JSON.stringify(source),before,'read-only projection preserves quantities, prices, notes and provenance');
});

test('sheet-only equivalents remain intact; strips have separate original-thickness and2.5mm equivalents with zero/reversed axes counted once',()=>{
  const m=buildModel(data(),calculate),expectedSheetArea=100+20+30/4,expectedSheetVolume=128+20+6,stripArea=1000*25*2052/AREA;
  near(m.total.eq4x8,expectedSheetArea);near(m.total.eq,expectedSheetVolume);
  near(m.total.stripEq4x8,stripArea);near(m.total.stripEq,stripArea*3.2/2.5);
  const thickness=m.thickness.find(([t])=>t==='3.2')[1];near(thickness.stripEq4x8,stripArea);near(thickness.stripEq,stripArea*1.28);
  for(const r of m.rows.filter(r=>r.unit==='sheet')){near(r.stripEq4x8,0);near(r.stripEq,0);}
  const reversed=buildModel(data([row('reverse',{w:2052,l:25,t:3.2,unit:'strip',qty:1000,baseQty:1000,d90:1000,committedQty:250,freeQty:750})]),calculate);
  near(reversed.total.eq4x8,0);near(reversed.total.eq,0);near(reversed.total.stripEq4x8,stripArea);near(reversed.total.stripEq,stripArea*1.28);
  near(m.rows.find(r=>r.key==='retained-reverse-zero').stripEq,0);assert.equal(m.rows.length,6,'retained zero catalog identity is not deleted or fabricated');
});

test('both section01 group tables expose12 columns, reservation subsets before Free, separate strip conversions and a combined-equivalent footer',()=>{
  const m=buildModel(data(),calculate),tables=groupTables(renderHTML(m));assert.equal(tables.length,2);
  for(const html of tables){
    const header=text(html.match(/<thead>[\s\S]*?<\/thead>/)?.[0]||'');
    for(const label of ['จองรวม','จองมีของ','จองต้องผลิตเพิ่ม','Free'])assert.ok(header.includes(label),`missing ${label}`);
    assert.ok(header.indexOf('จองรวม')<header.indexOf('จองมีของ'));assert.ok(header.indexOf('จองมีของ')<header.indexOf('จองต้องผลิตเพิ่ม'));assert.ok(header.indexOf('จองต้องผลิตเพิ่ม')<header.indexOf('Free'));
    assert.match(html,/12 คอลัมน์/);
    const bodyRows=Array.from(html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)).flatMap(m=>Array.from(m[1].matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g),r=>r[0]));
    assert.ok(bodyRows.length>0);bodyRows.forEach(tr=>assert.equal(widths(tr),12,'each summary data row has12 logical columns'));
    const footer=html.match(/<tfoot>([\s\S]*?)<\/tfoot>/)?.[1]||'',footerRows=Array.from(footer.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g),r=>r[0]);
    assert.ok(footerRows.length>=2,'combined equivalents need an explicitly separate footer row');footerRows.forEach(tr=>assert.equal(widths(tr),12));
    assert.ok(text(footer).includes(shown(m.total.eq4x8+m.total.stripEq4x8)));assert.ok(text(footer).includes(shown(m.total.eq+m.total.stripEq)));
    assert.match(footer,/ไม้แถบ/);assert.match(footer,/แผ่น/);
    assert.doesNotMatch(html,/>1,150(?: แผ่น)?</,'raw pieces and sheets must not be summed into a displayed stock count');
  }
  const thickness32=tables[1].match(/<tr><th scope="row">3\.2<\/th>[\s\S]*?<\/tr>/)?.[0];assert.ok(thickness32,'3.2mm group is visible');
  assert.match(thickness32,/ไม้แถบ/);assert.ok(text(thickness32).includes(shown(m.total.stripEq4x8)));assert.ok(text(thickness32).includes(shown(m.total.stripEq)));
});

test('Basic and v2 Physical KPI use current model sheet/strip conversions, not stale preview equivalents or mixed raw quantities',()=>{
  const m=buildModel(data(),calculate),zero={byUnit:{sheet:0,strip:0},eq4x8:0,eq2_5:0,valueTHB:0,knownValueTHB:0,coverage:{complete:true}};
  const summary={version:2,catalog:{hasSavedCatalog:true},physical:{...zero,byUnit:{sheet:150,strip:1000},eq4x8:999998,eq2_5:999999},free:zero,sold:{...zero,loaded:zero,paidUnloaded:zero},partition:{status:'verified',reservationPolicy:'aaf-firm-only-20261003-v1',sold:{inStock:zero,toProduce:zero,demand:zero},reserved:{inStock:zero,toProduce:zero,demand:zero,byStatus:{}}}};
  const before=JSON.stringify({m,summary});
  for(const report of [null,summary]){
    const card=physicalCard(renderKpis(report,m)),visible=text(card);
    for(const expected of [m.total.eq4x8,m.total.eq,m.total.stripEq4x8,m.total.stripEq,m.total.eq4x8+m.total.stripEq4x8,m.total.eq+m.total.stripEq])assert.ok(visible.includes(shown(expected)),`Physical conversion missing ${shown(expected)}`);
    assert.match(card,/<strong>150<\/strong>/);assert.match(card,/ไม้แถบ <b>1,000<\/b> ชิ้น/);
    assert.doesNotMatch(card,/999,998|999,999|1,150/);
  }
  assert.equal(JSON.stringify({m,summary}),before);
});

test('a production-only thickness remains visible while all-zero retained catalog rows do not fabricate summary stock',()=>{
  const source=data([
    ...fixtureRows,
    row('production-only',{t:6,qty:0,baseQty:0,d90:0,committedQty:90,freeQty:0}),
    row('retained-zero',{t:9,qty:0,baseQty:0,d90:0,committedQty:0,freeQty:0,retained:true}),
  ]),before=JSON.stringify(source),m=buildModel(source,calculate),base=buildModel(data(),calculate);
  assert.equal(m.rows.length,8,'full catalog retains zero-Physical identities');
  const production=m.thickness.find(([t])=>t==='6')?.[1];assert.ok(production,'production-only thickness is included');
  near(production.qty,0);near(production.committedQty,90);near(production.reservedInStockQty,0);near(production.reservedProductionQty,90);near(production.freeQty,0);
  assert.equal(m.thickness.some(([t])=>t==='9'),true,'all-zero retained thickness remains available to the detail catalog');
  const thicknessTable=groupTables(renderHTML(m))[1];assert.match(thicknessTable,/<tr><th scope="row">6\.0<\/th>/);assert.doesNotMatch(thicknessTable,/<tr><th scope="row">9\.0<\/th>/);
  near(m.total.byUnit.sheet.qty,150);near(m.total.byUnit.strip.qty,1000);
  near(m.total.byUnit.sheet.committedQty,base.total.byUnit.sheet.committedQty+90);near(m.total.byUnit.sheet.reservedProductionQty,base.total.byUnit.sheet.reservedProductionQty+90);
  near(m.total.byUnit.sheet.freeQty,base.total.byUnit.sheet.freeQty);near(m.total.eq,base.total.eq);near(m.total.eq4x8,base.total.eq4x8);near(m.total.stripEq,base.total.stripEq);near(m.total.stripEq4x8,base.total.stripEq4x8);
  assert.equal(JSON.stringify(source),before);
});
