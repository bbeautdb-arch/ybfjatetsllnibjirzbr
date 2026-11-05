import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),engine=require('../stock_sales_thickness.js'),view=require('../stock_sales_thickness_view.js');
// Synthetic only. No customer data, stock snapshots, credentials or network.
const capture='2030-11-05T11:00:00Z';
const sale=(price,qty,currency='THB')=>({verified:true,amountBasis:'line',unitPrice:price,amount:price*qty,currency});
const row=(id,extra={})=>({id,orderId:'order-'+id,ref:'SYNTH-'+id,customer:'Invented buyer',w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',qty:10,sourceStatus:'เปิด PI',productStatus:'พร้อมโหลด',actualSale:sale(20,10),...extra});
const review=rows=>({metadata:{month:'2030-11',sourceSalesCapturedAt:capture},readModel:{kind:'current-month-order-review',status:'verified',selectedMonth:'2030-11',source:{month:'2030-11',capturedAt:capture}},rows});
const fx={verified:true,rate:32,date:'2030-11-05',source:'Synthetic checked FX'};
const model=(rows,options)=>engine.build(review(rows),undefined,options);
const group=(html,id='confirmed')=>html.split(`data-stv-group="${id}"`)[1]?.split('<details class="stv-group ')[0]||'';
const text=html=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');

test('confirmed thickness table opens by default while other two groups remain native collapsed controls',()=>{
  const m=model([row('a',{t:3}),row('b',{t:1.6,sourceStatus:'ออก INV'}),row('n',{sourceStatus:'เจรจา'}),row('f',{sourceStatus:'Forecast'})]),html=view.render(m);
  assert.match(html,/data-stv-group="confirmed" open/);assert.doesNotMatch(html,/data-stv-group="(?:negotiation|forecast)" open/);
  assert.match(html,/<thead>/);assert.match(html,/<tfoot>/);assert.match(html,/เฉลี่ย \/ หน่วยจริง/);assert.match(html,/data-stv-thickness="1.6"/);
  assert.ok(group(html).indexOf('data-stv-thickness="1.6"')<group(html).indexOf('data-stv-thickness="3"'));
  assert.match(html,/tabindex="0"/);assert.match(html,/<details class="stv-drill"><summary>/);assert.doesNotMatch(html,/<button|onclick=/);
});

test('thickness rows show actual quantities, normalized equivalent, money and weighted actual-sheet mean',()=>{
  const m=model([row('a',{t:5,qty:10,actualSale:sale(20,10)}),row('b',{t:5,qty:30,actualSale:sale(40,30)})]),html=group(view.render(m));
  assert.equal(m.byGroup.confirmed.totals.eq25.total,80);assert.equal(m.byGroup.confirmed.totals.money.sheet.averageTHBPerUnit,35);
  assert.match(html,/40 <small>แผ่น/);assert.match(html,/80 <small>แผ่นเทียบ/);assert.match(html,/฿ 1,400\.00/);assert.match(html,/35\.00 <small>บาท\/แผ่น/);assert.match(html,/ฐานที่มีราคาเป็นบาท 40 \/ 40 แผ่น/);
  assert.doesNotMatch(html,/17\.50 <small>บาท\/แผ่น/);assert.match(html,/รวมกลุ่มนี้/);
});

test('sheet and strip quantities and average denominators stay separate even at same thickness',()=>{
  const html=group(view.render(model([row('sheet'),row('strip',{unit:'strip',w:25,l:2052,qty:1000,actualSale:sale(2,1000)})])));
  assert.match(html,/data-stv-unit="sheet">10/);assert.match(html,/data-stv-unit="strip">1,000 ชิ้นไม้แถบ/);
  assert.match(html,/data-stv-average-unit="sheet">20\.00/);assert.match(html,/data-stv-average-unit="strip">2\.00/);assert.match(html,/฿ 2,200\.00/);
  assert.doesNotMatch(html,/1,010 <small>แผ่น/);assert.match(html,/จาก|แผ่น .* · แถบ/);
});

test('partial price coverage displays known subtotal and actual priced denominator with missing-price count',()=>{
  const html=group(view.render(model([row('known'),row('unknown',{qty:90,actualSale:undefined})])));
  assert.match(html,/฿ 200\.00/);assert.match(html,/รวมเฉพาะส่วนที่ทราบ/);assert.match(html,/ขาดราคา 1 บรรทัด/);assert.match(html,/ฐานที่มีราคาเป็นบาท 10 \/ 100 แผ่น/);
  assert.match(html,/20\.00 <small>บาท\/แผ่น/);assert.doesNotMatch(html,/2\.00 <small>บาท\/แผ่น/);
});

test('all missing prices never display invented zero sale value or average',()=>{
  const html=group(view.render(model([row('none',{actualSale:undefined})])));
  assert.match(html,/ยังไม่มีมูลค่าที่รวมเป็นบาทได้/);assert.match(html,/ยังไม่ยืนยัน <small>บาท\/แผ่น/);assert.match(html,/ขาดราคา 1 บรรทัด/);
  assert.doesNotMatch(html,/฿ 0\.00|>0\.00 <small>บาท/);
});

test('USD without checked FX stays native and is excluded from THB mean with explicit missing-FX count',()=>{
  const rows=[row('thb',{qty:5,actualSale:sale(20,5)}),row('usd',{actualSale:sale(3,10,'USD')})];
  const without=group(view.render(model(rows))),withFx=group(view.render(model(rows,{fx})));
  assert.match(without,/US\$ 30\.00 · ยังไม่รวมเป็นบาท/);assert.match(without,/ขาดเรท 1 บรรทัด/);assert.match(without,/ฐานที่มีราคาเป็นบาท 5 \/ 15 แผ่น/);assert.match(without,/20\.00 <small>บาท\/แผ่น/);
  assert.match(withFx,/≈ ฿ 1,060\.00/);assert.match(withFx,/70\.67 <small>บาท\/แผ่น/);assert.match(withFx,/ฐานที่มีราคาเป็นบาท 15 \/ 15 แผ่น/);assert.doesNotMatch(withFx,/ขาดเรท/);
});

test('missing currency is reported separately and is not inferred from another line',()=>{
  const html=group(view.render(model([row('a'),row('bad',{actualSale:sale(20,10,null)})])));
  assert.match(html,/ขาดสกุลเงิน 1 บรรทัด/);assert.match(html,/รอสกุลเงินจริง/);assert.match(html,/฿ 200\.00/);assert.doesNotMatch(html,/฿ 400\.00/);
});

test('zero quantity can have zero value without inventing a unit price or weighted mean',()=>{
  const html=group(view.render(model([row('zero',{qty:0,actualSale:undefined})])));
  assert.match(html,/฿ 0\.00/);assert.match(html,/0\.00 บาท · จำนวนขายเป็น 0/);assert.doesNotMatch(html,/0\.00 <small>บาท\/แผ่น/);
});

test('missing dimensions show incomplete equivalent plus known portion while retaining actual quantities',()=>{
  const html=group(view.render(model([row('ok'),row('bad',{w:null})])));
  assert.match(html,/20 <small>แผ่น/);assert.match(html,/รอขนาดต้นทาง/);assert.match(html,/ส่วนที่แปลงได้ 10/);assert.match(html,/ขาดขนาด 1 บรรทัด/);
  assert.doesNotMatch(html,/NaN|Infinity/);
});

test('drilldowns preserve customer, document, size, grade, status and native actual prices',()=>{
  const html=group(view.render(model([row('loaded',{customer:'SYNTH BUYER',ref:'SYNTH PI 07',w:1200,l:2400,t:3.2,grade:'B',sourceStatus:'ออก INV',actualSale:sale(3,10,'USD')})],{fx})));
  assert.match(html,/SYNTH BUYER/);assert.match(html,/SYNTH PI 07/);assert.match(html,/1,200 × 2,400 มม/);assert.match(html,/หนา 3\.2 มม\. · B/);
  assert.match(html,/stv-state-loaded/);assert.match(html,/US\$ 3\.00/);assert.match(html,/US\$ 30\.00/);assert.match(html,/≈ ฿ 960\.00/);
});

test('malformed models fail closed and source strings are escaped in text and attributes',()=>{
  for(const m of [undefined,{}, {version:1,status:'verified',groups:[]}])assert.match(view.render(m),/รอชุดสรุปหน้า 09/);
  const m=model([row('hostile',{customer:'<script>bad()</script>',ref:'<img onerror=bad()>',grade:'" onclick="bad()'})]);
  const html=view.render(m);assert.doesNotMatch(html,/<script|<img| onclick="bad/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&quot;/);
});

test('view is immutable and exports in browser without any stock, financial or annotation writes',()=>{
  const m=model([row('a')]),before=structuredClone(m);view.render(m);assert.deepEqual(m,before);
  const source=readFileSync(new URL('../stock_sales_thickness_view.js',import.meta.url),'utf8'),window={};vm.runInNewContext(source,{window});
  assert.equal(typeof window.AAFSalesThicknessView.render,'function');assert.equal(text(window.AAFSalesThicknessView.render(m)),text(view.render(m)));
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage)\s*[.(]|addEventListener|onchange=|onclick=/);
  const css=readFileSync(new URL('../stock_sales_thickness_view.css',import.meta.url),'utf8');assert.match(css,/:focus-visible/);assert.match(css,/@media\(max-width:720px\)/);
});
