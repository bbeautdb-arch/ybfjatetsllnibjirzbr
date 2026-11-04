// Synthetic data only. Collapsed grade money is the same saved-stock Free
// subtotal as the expanded footer, not a price average or another allocation.
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
function fixture(rows,prices,rate=fx){
  const stock={revision:7,reportDate:'2000-06-02',headerExchangeRate:rate,rows};
  const catalog={revision:7,reportDate:stock.reportDate,catalogRevision:3,savedAt:'2000-06-02T01:00:00Z',rows:rows.map((r,i)=>({...r,...prices[i]}))};
  const decorated=summary.withSavedCatalog(stock,catalog,rate);
  return {stock,catalog,decorated,warehouse:header.warehouseProjection(decorated)};
}
const render=w=>header.render(null,new Set(),w);
const text=html=>html.replace(/<[^>]*>/g,'').trim();
const money=value=>'≈ ฿ '+value.toLocaleString('th-TH',{maximumFractionDigits:2});
const freeCard=html=>html.split('<div class="ss-kpi ss-kpi-free"')[1];
function panels(w,kind='normal',grade='AAA'){
  const html=freeCard(render(w));
  return html.split('data-free-group="'+kind+'"').slice(1).flatMap(chunk=>[...chunk.split('data-free-group=')[0].matchAll(/<details\b[^>]*data-physical-grade="([^"]*)"[^>]*>[\s\S]*?<\/details>/g)]).filter(match=>match[1]===grade).map(match=>match[0]);
}
function gradeValue(w,kind='normal',grade='AAA'){
  const matches=panels(w,kind,grade);
  assert.equal(matches.length,2,'one grade in each compact and expanded Free card');
  const values=matches.map(panel=>{
    const collapsed=panel.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1];
    assert(collapsed,'grade has an accessible summary toggle');
    const summaryValues=[...collapsed.matchAll(/<span\b[^>]*data-grade-summary-free-value(?=[\s=>])[^>]*>([\s\S]*?)<\/span>/g)];
    assert.equal(summaryValues.length,1,'one monetary value directly in the collapsed summary');
    const footerValues=[...panel.matchAll(/<b\b[^>]*data-grade-total-field="value"[^>]*>([\s\S]*?)<\/b>/g)];
    assert.equal(footerValues.length,1,'one existing expanded value footer');
    assert.equal(text(summaryValues[0][1]),text(footerValues[0][1]),'collapsed and expanded amounts/coverage are identical');
    assert(collapsed.indexOf('· Free ')<collapsed.indexOf('data-grade-summary-free-value'),'money follows the grade quantity');
    assert.doesNotMatch(panel,/^<details\b[^>]*\sopen(?:\s|=|>)/,'details remain closed by default');
    return text(summaryValues[0][1]);
  });
  assert.equal(values[0],values[1],'compact and expanded cards agree');
  return values[0];
}

test('each collapsed Free grade sums exact saved-stock values and matches its existing expanded footer',()=>{
  const rows=[row('thin',1220,2440,1.6,'AAA',12,3),row('thick',1220,2440,3.2,'AAA',8,4),row('other',1220,2440,2.5,'B',5,2)];
  const f=fixture(rows,[{price:10,currency:'THB'},{price:2,currency:'USD'},{price:5,currency:'THB'}]);
  assert.equal(gradeValue(f.warehouse),money(270));
  assert.equal(gradeValue(f.warehouse,'normal','B'),money(10));
});

test('normal, nonstandard and strips preserve exact-size price pools and quantity units',()=>{
  const rows=[row('normal',2440,1220,2.5,'AAA',10,2),row('near',1200,2400,2.5,'AAA',10,3),row('reverse',2400,1200,2.5,'AAA',10,4),row('strip',25,2000,2.5,'AAA',100,80,'strip')];
  const f=fixture(rows,[{price:10,currency:'THB'},{price:20,currency:'THB'},{price:30,currency:'THB'},{price:0.5,currency:'THB'}]);
  assert.equal(gradeValue(f.warehouse,'normal'),money(20));
  assert.equal(gradeValue(f.warehouse,'nonstandard'),money(180));
  assert.equal(gradeValue(f.warehouse,'strip'),money(40));
  assert.match(panels(f.warehouse,'normal')[0],/· Free 2 แผ่น/);
  assert.match(panels(f.warehouse,'nonstandard')[0],/· Free 7 แผ่น/);
  assert.match(panels(f.warehouse,'strip')[0],/· Free 80 ชิ้น/);
});

test('known subtotal remains visible with separate missing-price, currency and FX counts',()=>{
  const rows=[1.6,2.5,3.2,4].map((t,i)=>row('coverage-'+i,1220,2440,t,'AAA',10,i+2));
  const f=fixture(rows,[{price:10,currency:'THB'},{price:null,currency:'THB'},{price:4,currency:null},{price:2,currency:'USD'}],null);
  const value=gradeValue(f.warehouse);
  assert.match(value,/≈ ฿ 20/);assert.match(value,/ยังขาด 3 รายการ/);
  for(const label of ['ขาดราคาสต๊อก','ขาดสกุลเงิน','ขาดเรท USD/THB'])assert(value.includes(label+' 1 รายการ'));
});

test('all-positive-Free unpriced grade displays missing evidence, never a fabricated zero value',()=>{
  const f=fixture([row('unpriced',1220,2440,2.5,'AAA',10,3)],[{price:null,currency:'THB'}]);
  const value=gradeValue(f.warehouse);
  assert.match(value,/ยังไม่มีมูลค่าที่คำนวณได้/);assert.match(value,/ยังขาด 1 รายการ/);assert.doesNotMatch(value,/≈ ฿ 0/);
});

test('zero-Free unpriced rows stay out of Free summary and do not contaminate manual positive Free',()=>{
  const rows=[row('zero',1220,2440,1.6,'AAA',10,0),row('manual',1220,2440,2.5,'AAA',0,2.125),row('all-zero',1220,2440,3.2,'A',3,0)];
  const f=fixture(rows,[{price:null,currency:'THB'},{price:12.25,currency:'THB'},{price:null,currency:'THB'}]);
  assert.equal(gradeValue(f.warehouse),money(26.03125));
  assert.match(panels(f.warehouse)[0],/· Free 2\.125 แผ่น/);
  assert.equal(panels(f.warehouse,'normal','A').length,0);
  assert.equal(f.decorated.rows[0].catalogPrice,null);
});

test('grade money sums full precision and rounds once rather than adding rounded leaf displays',()=>{
  const rows=[1.6,2.5,3.2].map((t,i)=>row('fraction-'+i,1220,2440,t,'AAA',0.01,0.004));
  const f=fixture(rows,rows.map(()=>({price:1,currency:'THB'})));
  assert.equal(gradeValue(f.warehouse),money(0.012));
  assert.equal(gradeValue(f.warehouse),'≈ ฿ 0.01');
});

test('stale catalog or FX identity cannot surface an old monetary subtotal on collapsed grade',()=>{
  const base=fixture([row('bound',1220,2440,2.5,'AAA',10,3)],[{price:2,currency:'USD'}]).warehouse;
  for(const mutate of [w=>w.catalogRevision++,w=>w.fx.rate++,w=>w.fx.date='2000-06-02',w=>w.free.knownValueTHB++]){
    const w=copy(base);mutate(w);
    assert.equal(gradeValue(w),'รอยืนยันชุดราคา/เรท');
  }
});

test('stale stock or Free binding leaves the composition pending instead of displaying a plausible grade amount',()=>{
  const base=fixture([row('bound',1220,2440,2.5,'AAA',10,3)],[{price:2,currency:'THB'}]).warehouse;
  for(const mutate of [w=>w.stockRevision++,w=>w.stockReportDate='2000-06-03',w=>w.free.quantity.sheet++,w=>w.free.composition.groups.normal.grades[0].items[0].freeQty++]){
    const w=copy(base);mutate(w);const html=freeCard(render(w));
    assert.match(html,/รายละเอียด Free ยังรอยืนยัน/);assert.doesNotMatch(html,/data-grade-summary-free-value/);
  }
});

test('only Free summaries change; Physical summaries, input data, totals and closed toggle state remain intact',()=>{
  const f=fixture([row('safe',1220,2440,2.5,'AAA',10,3),row('strip',25,2000,3.2,'B',100,80,'strip')],[{price:2,currency:'THB'},{price:0.5,currency:'THB'}]);
  const before=JSON.stringify(f),html=render(f.warehouse),physical=html.split('<div class="ss-kpi ss-kpi-sold"')[0];
  assert.doesNotMatch(physical,/data-grade-summary-free-value/);
  assert.equal(gradeValue(f.warehouse),money(6));assert.equal(gradeValue(f.warehouse,'strip','B'),money(40));
  assert.equal(JSON.stringify(f),before);
  assert.equal(f.warehouse.free.quantity.sheet,3);assert.equal(f.warehouse.free.quantity.strip,80);
  assert.equal(f.warehouse.free.knownValueTHB,46);
  assert.doesNotMatch(panels(f.warehouse)[0],/<(?:input|textarea|select|form)\b/);
});
