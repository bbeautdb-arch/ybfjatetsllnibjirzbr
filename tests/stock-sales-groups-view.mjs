import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),groups=require('../stock_sales_groups.js'),view=require('../stock_sales_groups_view.js');
const fixture=()=>({metadata:{month:'2030-11',sourceSalesCapturedAt:'2030-11-03T04:20:22Z'},readModel:{kind:'current-month-order-review',status:'verified-sales-only',selectedMonth:'2030-11',source:{month:'2030-11',capturedAt:'2030-11-03T04:20:22Z'}},rows:[
  {id:'synthetic-pi',orderId:'synthetic-one',customer:'Synthetic PI',ref:'SYNTH-PI',w:100,l:200,t:2,grade:'A',unit:'sheet',qty:12,sourceStatus:'เปิด PI',productStatus:'waiting',etd:'12/11/30'},
  {id:'synthetic-loaded',orderId:'synthetic-two',customer:'Synthetic loaded',ref:'SYNTH-INV',w:100,l:200,t:3,grade:'B',unit:'sheet',qty:5,sourceStatus:'ออก INV',productStatus:'ready',etd:'03/11/30'},
  {id:'synthetic-strip',orderId:'synthetic-three',customer:'Synthetic strip',ref:'SYNTH-STRIP',w:20,l:200,t:3,grade:'B',unit:'strip',qty:100,sourceStatus:'มีเรือ',productStatus:'ready',etd:'—'},
  {id:'synthetic-negotiation',orderId:'synthetic-four',customer:'Synthetic negotiation',ref:'SYNTH-NEG',w:100,l:200,t:2,grade:'B',unit:'sheet',qty:7,sourceStatus:'เจรจา',productStatus:'waiting',etd:'31/02/30'},
  {id:'synthetic-forecast',orderId:'synthetic-five',customer:'Synthetic forecast',ref:'SYNTH-FC',w:100,l:200,t:2,grade:'B',unit:'sheet',qty:9,sourceStatus:'Forecast',productStatus:'waiting',etd:'—'},
  {id:'synthetic-cancelled',orderId:'synthetic-six',customer:'Synthetic cancelled',ref:'SYNTH-CANCEL',w:100,l:200,t:2,grade:'B',unit:'sheet',qty:0,sourceQty:4,cancelled:true,sourceStatus:'ยกเลิก',productStatus:'waiting',etd:'—'}
]});
const card=(html,id)=>html.split(`data-sales-group="${id}">`)[1].split('<div class="sg-card-details">')[0];

test('three source-status cards keep confirmed PI, nested loaded/waiting, sheets and strips distinct',()=>{
  const source=fixture(),before=JSON.stringify(source),model=groups.build(source),html=view.render(model,{monthLabel:'Synthetic November (2030-11)'});
  assert.deepEqual([...html.matchAll(/data-sales-group="([^"]+)"/g)].map(m=>m[1]),['confirmed','negotiation','forecast']);
  assert.match(card(html,'confirmed'),/17 <small>แผ่น/);assert.match(card(html,'confirmed'),/100 <small>ชิ้นไม้แถบ/);
  assert.match(card(html,'confirmed'),/โหลดแล้ว/);assert.match(card(html,'confirmed'),/รอโหลด/);assert.match(card(html,'confirmed'),/5 <small>แผ่น/);assert.match(card(html,'confirmed'),/12 <small>แผ่น/);
  assert.match(card(html,'negotiation'),/7 <small>แผ่น/);assert.match(card(html,'forecast'),/9 <small>แผ่น/);
  assert.match(html,/data-sales-subset="loaded"/);assert.match(html,/data-sales-subset="waiting"/);
  assert.match(html,/PI ที่ยืนยันแล้ว/);assert.match(html,/สามกลุ่มนี้ใช้สถานะการขาย ไม่ใช่ลำดับจองคลัง/);
  assert.doesNotMatch(html,/117 <small>แผ่น|US\$|฿/);assert.equal(JSON.stringify(source),before);
});

test('capture date is visible human Thai with exact evidence attribute; historical warning never claims fresh monthly close',()=>{
  const html=view.render(groups.build(fixture()),{monthLabel:'2030-11',historical:true,stale:true});
  assert.match(html,/ข้อมูลหน้า 09 ที่อ่านเมื่อ <strong>/);assert.match(html,/11:20:22/);assert.match(html,/data-sales-captured-at="2030-11-03T04:20:22Z"/);
  assert.match(html,/ไม่ใช่ข้อมูลสด/);assert.match(html,/ชุดตรวจย้อนหลัง · ไม่ใช่ยอดปิดเดือน/);assert.match(html,/ฐานสต๊อก\/ราคาปัจจุบันอาจต่าง/);
  assert.doesNotMatch(html,/>2030-11-03T04:20:22Z<|อัปเดตวันนี้|เรียลไทม์|ข้อมูลล่าสุด/);
});

test('ETD sorting uses valid calendar dates only, preserves stable equal dates and invalid literal source',()=>{
  const rows=[{id:'missing',etd:'—'},{id:'bad',etd:'31/02/30'},{id:'late',etd:'12/11/30'},{id:'early',etd:'03/11/2573'},{id:'same',etd:'2030-11-03'},{id:'badtime',etd:'2030-11-01T99:99Z'}],before=JSON.stringify(rows);
  assert.deepEqual(view.sortedRows(rows).map(r=>r.id),['early','same','late','missing','bad','badtime']);assert.equal(JSON.stringify(rows),before);
  assert.equal(view.parseETD('29/02/2028').valid,true);for(const raw of ['29/02/2029','31/04/30','2030-11-01T25:00Z','2030-11-01T12:00+14:01','2030-13-01'])assert.equal(view.parseETD(raw).valid,false,raw);
  const html=view.render(groups.build(fixture()));assert.match(html,/31\/02\/30/);assert.match(html,/วันที่ต้นทางต้องตรวจ/);
});

test('cancelled source quantity and unclassified rows remain accessible outside group totals',()=>{
  const source=fixture();source.rows.push({...source.rows[0],id:'synthetic-unknown',orderId:'synthetic-seven',sourceStatus:'สถานะต้องตรวจ',qty:2});
  const model=groups.build(source),html=view.render(model);
  assert.match(html,/data-sales-exception="cancelled"/);assert.match(html,/ยอดยกเลิก 4 แผ่น/);assert.doesNotMatch(html,/sg-line-quantity">ยอดยกเลิก 0/);
  assert.match(html,/data-sales-exception="unclassified"/);assert.match(html,/ยังจัดกลุ่มไม่ได้ · ไม่รวมในยอด 3 กลุ่ม/);
  assert.match(card(html,'confirmed'),/17 <small>แผ่น/);assert.match(html,/เก็บรายการต้นทาง 7 บรรทัด/);assert.equal(model.status,'pending');
});

test('unknown provenance, invalid quantities and malformed rows remain explicit pending rather than zero or dropped',()=>{
  const source=fixture();source.readModel.selectedMonth='2030-10';let html=view.render(groups.build(source));
  assert.match(card(html,'confirmed'),/ยังไม่ยืนยัน/);assert.doesNotMatch(card(html,'confirmed'),/>17 <small>/);assert.match(html,/เดือนที่เลือกกับเดือนของหลักฐานขายไม่ตรงกัน/);
  const partial=fixture();partial.rows[0].qty=null;partial.rows.push(null);html=view.render(groups.build(partial));
  assert.match(card(html,'confirmed'),/ยังไม่ยืนยัน/);assert.match(html,/data-sales-exception="unclassified"/);assert.match(html,/เก็บรายการต้นทาง 7 บรรทัด/);assert.match(html,/ยังไม่ระบุวัน/);
  assert.match(view.render(null),/ยังโหลดตัวสรุป 3 กลุ่มไม่ครบ/);
});

test('paid Forecast warning does not move source groups or imply receipts and all displayed source strings are escaped',()=>{
  const source=fixture();Object.assign(source.rows[4],{payment:'มัดจำแล้ว',customer:'<script>synthetic</script>',sourceRefText:'<img src=x>\nSYNTH-FC',commercial:{receiptLabel:'<b>receipt source</b>'}});
  const before=JSON.stringify(source),html=view.render(groups.build(source));assert.match(card(html,'forecast'),/9 <small>แผ่น/);assert.match(html,/มีหลักฐานรับเงิน\/จองตามกติกาเดิม/);
  assert.match(html,/&lt;script&gt;synthetic&lt;\/script&gt;/);assert.match(html,/&lt;img src=x&gt;/);assert.match(html,/&lt;b&gt;receipt source&lt;\/b&gt;/);assert.doesNotMatch(html,/<script>|<img src|<b>receipt/);assert.equal(JSON.stringify(source),before);
});

test('positive fractional quantities never render as zero, and presentation contains no write or acquisition paths',()=>{
  const source=fixture();source.rows[4].qty=0.001;let html=view.render(groups.build(source));assert.match(card(html,'forecast'),/0\.001 <small>แผ่น/);
  source.rows[4].qty=1e-30;html=view.render(groups.build(source));assert.match(card(html,'forecast'),/1e-30 <small>แผ่น/);
  const code=fs.readFileSync(new URL('../stock_sales_groups_view.js',import.meta.url),'utf8');new vm.Script(code);
  assert.doesNotMatch(code,/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|postMessage|setInterval)\b|\.save\(|\.write\(/);
  const css=fs.readFileSync(new URL('../stock_order_review.css',import.meta.url),'utf8');assert.match(css,/\.sg-forecast\{[^}]*#f4ece2/);assert.match(css,/@media\(max-width:600px\)\{\.sg-grid\{grid-template-columns:1fr/);
});
