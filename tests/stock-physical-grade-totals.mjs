// Synthetic fixtures only. This display-only footer must never recalculate
// reservations, infer missing prices, or mix sheets with strip pieces.
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
const card=(html,id)=>html.slice(html.indexOf('<div class="ss-kpi ss-kpi-'+id+'"'),id==='free'?undefined:html.indexOf('<div class="ss-kpi ss-kpi-'+({physical:'sold',sold:'reserved',reserved:'free'})[id]+'"'));
const render=w=>header.render(null,new Set(),w);
const text=html=>html.replace(/<[^>]*>/g,'').trim();
function gradePanels(w,kind,grade){
  const html=card(render(w),'physical'),chunks=html.split('data-physical-group="'+kind+'"').slice(1);
  const panels=chunks.flatMap(chunk=>[...chunk.split('data-physical-group=')[0].matchAll(/<details\b[^>]*data-physical-grade="([^"]*)"[^>]*>[\s\S]*?<\/details>/g)]).filter(match=>match[1]===grade).map(match=>match[0]);
  assert.equal(panels.length,2,'compact and expanded Physical card contain one grade panel each');
  return panels;
}
function totals(w,kind='normal',grade='AAA'){
  const panels=gradePanels(w,kind,grade);
  const parsed=panels.map(panel=>{
    const footers=[...panel.matchAll(/<div\b[^>]*data-physical-grade-total(?=[\s=>])[^>]*>[\s\S]*?<\/div>/g)];
    assert.equal(footers.length,1,'one footer per grade, not per size or per item');
    const footer=footers[0][0];assert.match(footer,/class="[^"]*\bss-physical-item-total\b/);assert.match(footer,/รวม/);
    assert(panel.lastIndexOf('data-physical-item=')<panel.indexOf(footer),'footer follows every item row');
    assert(panel.indexOf(footer)<panel.indexOf('ss-physical-value-note'),'footer precedes valuation basis note');
    return Object.fromEntries(['physical','free','value'].map(field=>{
      const cells=[...footer.matchAll(new RegExp('<b\\b[^>]*data-grade-total-field="'+field+'"[^>]*>([\\s\\S]*?)<\\/b>','g'))];
      assert.equal(cells.length,1,'one '+field+' total cell');return [field,text(cells[0][1])];
    }));
  });
  assert.deepEqual(parsed[0],parsed[1],'compact and expanded footer values agree');
  return parsed[0];
}
const quantity=value=>value.toLocaleString('th-TH',{maximumFractionDigits:20});
const money=value=>'≈ ฿ '+value.toLocaleString('th-TH',{maximumFractionDigits:2});
const expectTotals=(w,kind,grade,physical,free,value)=>assert.deepEqual(totals(w,kind,grade),{physical:quantity(physical),free:typeof free==='number'?quantity(free):free,value:typeof value==='number'?money(value):value});

test('grade footer sums all thicknesses and saved Free, without clamping manual Free or reserving again',()=>{
  const rows=[row('synthetic-thin',1220,2440,1.6,'AAA',12.5,8.25),row('synthetic-thick',1220,2440,3.2,'AAA',1,3.75)],f=setup(rows,[{price:2,currency:'THB'},{price:3,currency:'USD'}]);
  expectTotals(f.warehouse,'normal','AAA',13.5,12,354);
  assert.equal(f.warehouse.reservationTotals.demand.sheet,0);
});

test('normal, nonstandard, grade and strip totals remain separate even with matching grade and thickness',()=>{
  const rows=[row('synthetic-normal',1220,2440,2.5,'A',10,2),row('synthetic-near',1200,2400,2.5,'A',11,3),row('synthetic-other-size',610,1220,3.2,'A',12,4),row('synthetic-other-grade',610,1220,2.5,'B',13,5),row('synthetic-strip',25,2000,2.5,'A',100,80,'strip')],f=setup(rows,rows.map((r,i)=>({price:i+1,currency:'THB'})));
  expectTotals(f.warehouse,'normal','A',10,2,2);
  expectTotals(f.warehouse,'nonstandard','A',23,7,18);
  expectTotals(f.warehouse,'nonstandard','B',13,5,20);
  expectTotals(f.warehouse,'strip','A',100,80,400);
  assert.match(gradePanels(f.warehouse,'strip','A')[0],/สต๊อก · ชิ้น/);
  assert.match(gradePanels(f.warehouse,'normal','A')[0],/สต๊อก · แผ่น/);
});

test('reversed exact-size rows add their distinct valued amounts once, not an average price',()=>{
  const rows=[row('synthetic-forward',610,1220,2.5,'A',8,3),row('synthetic-reverse',1220,610,2.5,'A',10,5),row('synthetic-next-size',1000,2000,2.5,'A',2,1)],f=setup(rows,[{price:10,currency:'THB'},{price:20,currency:'THB'},{price:5,currency:'THB'}]);
  expectTotals(f.warehouse,'nonstandard','A',20,9,135);
  assert.equal(f.warehouse.physical.composition.groups.nonstandard.grades[0].items.length,2);
});

test('value total sums full-precision decorated values before rounding once',()=>{
  const rows=[1.6,2.5,3.2].map((t,i)=>row('synthetic-fraction-'+i,1220,2440,t,'AAA',0.01,0.004)),f=setup(rows,rows.map(()=>({price:1,currency:'THB'})));
  expectTotals(f.warehouse,'normal','AAA',0.03,0.012,0.012);
  const panel=gradePanels(f.warehouse,'normal','AAA')[0];
  const leafMoney=[...panel.matchAll(/data-item-free-value[^>]*>([^<]*)<\/b>/g)].map(match=>match[1]);
  assert.equal(leafMoney.length,3);assert(leafMoney.every(value=>value==='≈ ฿ 0'));
  assert.equal(totals(f.warehouse).value,'≈ ฿ 0.01','not the sum of rounded display cells');
});

test('verified all-zero Free is zero, but a zero-Physical Free-only grade remains included',()=>{
  const rows=[row('synthetic-known-zero',1220,2440,2.5,'AAA',10,0),row('synthetic-retained-zero',1220,2440,3.2,'AAA',0,0),row('synthetic-free-only',1220,2440,2.5,'F',0,4)],f=setup(rows,rows.map(()=>({price:2,currency:'THB'})));
  expectTotals(f.warehouse,'normal','AAA',10,0,0);
  expectTotals(f.warehouse,'normal','F',0,4,8);
});

test('a missing grade item price keeps complete quantity totals but not a partial monetary total',()=>{
  const rows=[row('synthetic-known',1220,2440,1.6,'AAA',10,2),row('synthetic-unpriced',1220,2440,2.5,'AAA',5,3),row('synthetic-other',1220,2440,3.2,'B',1,1)],f=setup(rows,[{price:12,currency:'THB'},{price:null,currency:'THB'},{price:7,currency:'THB'}]);
  expectTotals(f.warehouse,'normal','AAA',15,5,'รอราคา/FX');
  expectTotals(f.warehouse,'normal','B',1,1,7);
  assert.notEqual(totals(f.warehouse).value,money(24));
});

test('zero Free without a verified price remains unknown rather than a fabricated zero-value total',()=>{
  const rows=[row('synthetic-unpriced-zero',1220,2440,2.5,'AAA',10,0)],f=setup(rows,[{price:null,currency:'THB'}]);
  expectTotals(f.warehouse,'normal','AAA',10,0,'รอราคา/FX');
});

test('missing USD FX makes only the affected grade value pending while exact quantities remain',()=>{
  const rows=[row('synthetic-thb',1220,2440,1.6,'AAA',10,2),row('synthetic-usd',1220,2440,2.5,'AAA',5,3),row('synthetic-thb-grade',610,1220,2.5,'B',4,1)],prices=[{price:12,currency:'THB'},{price:2,currency:'USD'},{price:7,currency:'THB'}];
  for(const rate of [null,{...fx,rate:0},{...fx,basis:'unverified'}]){
    const f=setup(rows,prices,rate);expectTotals(f.warehouse,'normal','AAA',15,5,'รอราคา/FX');expectTotals(f.warehouse,'nonstandard','B',4,1,7);
  }
});

test('unknown Free evidence does not become a zero or partial total',()=>{
  const rows=[row('synthetic-known-free',1220,2440,1.6,'AAA',10,2),row('synthetic-missing-free',1220,2440,2.5,'AAA',5,3)],f=setup(rows,rows.map(()=>({price:2,currency:'THB'}))),source=copy(rows);
  delete source[1].freeQty;
  f.warehouse.physical.composition={...header.physicalComposition(source),stockReportDate:f.warehouse.stockReportDate,stockRevision:f.warehouse.stockRevision};
  expectTotals(f.warehouse,'normal','AAA',15,'รอยืนยัน','รอยืนยัน');
});

test('stale Free or report identity leaves footer Free and value pending without hiding Physical',()=>{
  const rows=[row('synthetic-stale',1220,2440,2.5,'AAA',10,3)],f=setup(rows,[{price:2,currency:'THB'}]);
  for(const mutate of [w=>w.free.quantity.sheet++,w=>w.physical.composition.stockRevision--,w=>w.physical.composition.stockReportDate='2000-06-01',w=>w.physical.composition.groups.normal.grades[0].items[0].freeQty++]){
    const w=copy(f.warehouse);mutate(w);expectTotals(w,'normal','AAA',10,'รอยืนยัน','รอยืนยัน');
  }
});

test('stale catalog or FX identity preserves quantity totals but cannot reuse a previous money total',()=>{
  const rows=[row('synthetic-stale-value',1220,2440,2.5,'AAA',10,3)],f=setup(rows,[{price:2,currency:'USD'}]);
  for(const mutate of [w=>w.catalogRevision++,w=>w.fx.rate++,w=>w.fx.date='2000-06-02',w=>w.free.knownValueTHB++]){
    const w=copy(f.warehouse);mutate(w);expectTotals(w,'normal','AAA',10,3,'รอราคา/FX');
  }
});

test('footers are read-only and do not alter inputs, other cards, equivalents, valuation or closed detail state',()=>{
  const rows=[row('synthetic-safe-a',1220,2440,2.5,'AAA',10,2.125),row('synthetic-safe-b',25,2000,3.2,'B',100,80,'strip')],f=setup(rows,[{price:12.25,currency:'THB'},{price:0.125,currency:'USD'}]),before=JSON.stringify(f),plain=copy(f.warehouse);delete plain.physical.composition;
  const html=render(f.warehouse),baseline=render(plain);
  for(const id of ['sold','reserved','free'])assert.equal(card(html,id),card(baseline,id));
  assert.equal(header.sourceText(null,f.warehouse),header.sourceText(null,plain));assert.equal(JSON.stringify(f),before);
  for(const panel of gradePanels(f.warehouse,'normal','AAA')){assert.doesNotMatch(panel,/^<details\b[^>]*\sopen(?:\s|=|>)/);assert.doesNotMatch(panel,/<(?:input|textarea|select|form)\b/);assert.doesNotMatch(panel,/<[^>]+\sid=/);}
  expectTotals(f.warehouse,'normal','AAA',10,2.125,26.03125);
  expectTotals(f.warehouse,'strip','B',100,80,300);
});
