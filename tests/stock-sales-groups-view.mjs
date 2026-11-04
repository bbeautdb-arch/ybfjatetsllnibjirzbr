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
const sampleMoney=()=>({
  status:'partial',checkedAt:'2030-11-03T04:20:22Z',
  currencies:[{currency:'THB',received:1000,pending:2000,receivedKnownOrders:1,pendingKnownOrders:1},{currency:'USD',received:50,pending:75,receivedKnownOrders:1,pendingKnownOrders:1}],
  counts:{orders:3,received:2,partial:1,waiting:1,lcAwaiting:0,unconfirmed:1,missingAmount:1},
  receiptMonths:[{month:'2030-10',orderCount:1,knownAmountByCurrency:{THB:1000,USD:null},missingAmountCount:0},{month:'2030-11',orderCount:1,knownAmountByCurrency:{THB:null,USD:50},missingAmountCount:0},{month:null,orderCount:1,knownAmountByCurrency:{THB:null,USD:null},missingAmountCount:1}],
  orders:[{orderId:'money-thb',customer:'Synthetic cash',ref:'SYNTH-MONEY-1',statusLabel:'รับบางส่วน · รอส่วนที่เหลือ',term:'TT',received:1000,pending:2000,currency:'THB',receiptEvents:[{date:'2030-10-29',month:'2030-10',amount:1000,currency:'THB',label:'มัดจำ'}],issues:[]},{orderId:'money-usd',customer:'Synthetic USD',ref:'SYNTH-MONEY-2',statusLabel:'รับบางส่วน',term:'TT',received:50,pending:75,currency:'USD',receiptEvents:[{date:'2030-11-02',month:'2030-11',amount:50,currency:'USD',label:'งวดรับ'}],issues:[]},{orderId:'money-unknown',customer:'Synthetic unknown amount',ref:'SYNTH-MONEY-3',statusLabel:'รับแล้วตามสถานะ · ยังไม่ทราบจำนวนเงิน',term:'TT',received:null,pending:null,currency:null,receiptEvents:[{date:null,month:null,amount:null,currency:null,label:'รับแล้วตามสถานะ'}],issues:['ยังไม่มีหลักฐานจำนวนเงิน']}],
  issues:[]
});
function moneyModel(){const model=groups.build(fixture());model.groups[0].money=sampleMoney();return model;}

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

test('money stays within three cards, keeps native currency subtotals and retains all quantity subsets',()=>{
  const model=moneyModel(),before=JSON.stringify(model),html=view.render(model),summary=card(html,'confirmed');
  assert.deepEqual([...html.matchAll(/data-sales-group="([^"]+)"/g)].map(m=>m[1]),['confirmed','negotiation','forecast']);
  assert.match(summary,/17 <small>แผ่น/);assert.match(summary,/100 <small>ชิ้นไม้แถบ/);assert.match(summary,/โหลดแล้ว/);assert.match(summary,/รอโหลด/);
  for(const text of ['฿ 1,000.00','US$ 50.00','฿ 2,000.00','US$ 75.00','รับแล้ว','เหลือรับ / รอรับ','ขาดจำนวนเงิน 1 ใบ','รวมเฉพาะส่วนที่ทราบ'])assert(summary.includes(text),text);
  assert.doesNotMatch(summary,/฿ 1,050|฿ 2,075|≈|<details class="sg-money-details"/);
  assert.match(html,/<div class="sg-card-details"><details class="sg-money-details" data-sales-money-details="confirmed"><summary>รายละเอียดเงิน · รับเดือนไหน/);
  assert.match(html,/ใบขายหนึ่งอาจรับหลายเดือน ไม่บวกข้ามส่วน/);assert.equal(JSON.stringify(model),before);
});

test('receipt-month and per-order tables show actual installments, unknown amounts and native currency without ETD inference',()=>{
  const html=view.render(moneyModel());
  for(const text of ['ต.ค. 2573','พ.ย. 2573','ยังไม่ยืนยันเดือนรับ','2030-10-29','2030-11-02','ยังไม่ยืนยันจำนวน / สกุลเงิน','รับแล้วตามสถานะ · ยังไม่ทราบจำนวนเงิน'])assert(html.includes(text),text);
  assert.match(html,/<caption>รับเดือนไหน · แยกตามงวดรับจริง ไม่ใช้เดือนขายหรือ ETD<\/caption>/);
  assert.match(html,/<th scope="col">บาท \(THB\)<\/th><th scope="col">ดอลลาร์ \(USD\)<\/th>/);
  assert.match(html,/<th scope="row">Synthetic cash/);assert.match(html,/data-sales-money-order="money-unknown"/);
  assert.equal([...html.matchAll(/data-sales-money-order=/g)].length,3);
  assert.doesNotMatch(html,/฿ 0\.00|US\$ 0\.00/);
});

test('absent or unknown amounts never render fabricated zero; verified zero is shown only with covered orders',()=>{
  const model=moneyModel(),money=model.groups[0].money;money.currencies=[];money.receiptMonths=[];money.orders=[];money.status='pending';money.counts={orders:2,received:1,partial:0,waiting:1,lcAwaiting:0,unconfirmed:1,missingAmount:2};
  let html=view.render(model),summary=card(html,'confirmed');assert.match(summary,/รับแล้ว 1 ใบ/);assert.match(summary,/รอรับ 1 ใบ/);assert.match(summary,/ขาดจำนวนเงิน 2 ใบ/);assert.doesNotMatch(summary.split('data-sales-money="confirmed"')[1],/฿|US\$|>0/);
  money.currencies=[{currency:'THB',received:0,pending:0,receivedKnownOrders:0,pendingKnownOrders:0}];summary=card(view.render(model),'confirmed');assert.doesNotMatch(summary,/฿ 0/);
  money.currencies[0].receivedKnownOrders=1;summary=card(view.render(model),'confirmed');assert.match(summary,/฿ 0\.00/);assert.match(summary,/เหลือรับ \/ รอรับ<\/span><strong><span class="sg-money-unconfirmed">ยังไม่ยืนยันจำนวน/);
  delete model.groups[0].money;summary=card(view.render(model),'confirmed');assert.match(summary,/ยังไม่มีข้อมูลจำนวนเงินที่ยืนยัน/);assert.doesNotMatch(summary,/฿|US\$/);
});

test('LC and uncertain opportunity statuses remain distinct from received cash, and errors are visible before money disclosure',()=>{
  const model=moneyModel();for(const bucket of model.groups.slice(1)){bucket.money={...sampleMoney(),currencies:[],counts:{orders:1,received:0,partial:0,waiting:1,lcAwaiting:1,unconfirmed:1,missingAmount:1},orders:[],receiptMonths:[],issues:[{severity:'error',message:'วันที่รับอยู่ในอนาคต · ข้อมูลต้องตรวจ ไม่ใช่เงินคาดว่าจะเข้า'}]};}
  const html=view.render(model);for(const id of ['negotiation','forecast']){
    const summary=card(html,id);assert.match(summary,/ไม่ถือโอกาสขายเป็นลูกหนี้/);assert.match(summary,/ได้ LC ไม่ใช่รับเงินสด/);assert.match(summary,/LC · รอเงิน 1 ใบ/);assert.doesNotMatch(summary,/รอ LC/);assert.match(summary,/role="status">วันที่รับอยู่ในอนาคต/);assert.doesNotMatch(summary,/รับแล้ว 1 ใบ|฿|US\$/);
    assert(summary.indexOf('วันที่รับอยู่ในอนาคต')<summary.indexOf('กดดูรายการ / รายละเอียดเงิน'));
  }
  assert.match(html,/เจรจา \/ Forecast ไม่ใช่ลูกหนี้หรือเงินที่จะได้รับแน่นอน/);
});

test('main cards show concise actual receipt months including prior year while detailed amounts remain nested',()=>{
  const model=moneyModel(),money=model.groups[0].money;
  money.receiptMonths=[{month:'2025-09',orderCount:1,knownAmountByCurrency:{THB:null,USD:20},missingAmountCount:0},{month:'2026-09',orderCount:2,knownAmountByCurrency:{THB:null,USD:40},missingAmountCount:1},{month:'2026-10',orderCount:1,knownAmountByCurrency:{THB:null,USD:60},missingAmountCount:0},{month:'2026-10',orderCount:1,knownAmountByCurrency:{THB:null,USD:60},missingAmountCount:0}];
  const html=view.render(model),summary=card(html,'confirmed');assert.match(summary,/data-receipt-months>รับใน: ก.ย. 2568 · ก.ย. 2569 · ต.ค. 2569<\/span>/);assert.equal((summary.match(/data-receipt-months/g)||[]).length,1);assert.equal((html.match(/data-sales-group=/g)||[]).length,3);assert.match(html,/รายละเอียดเงิน · รับเดือนไหน/);assert.doesNotMatch(html,/1 งวด<\/td>/);
  money.receiptMonths=[];assert.doesNotMatch(card(view.render(model),'confirmed'),/data-receipt-months/);
});

test('receipt evidence capture displays a human Thai Bangkok date while retaining exact timestamp as metadata',()=>{
  const model=moneyModel();model.groups[0].money.checkedAt='2026-11-04T20:31:58.685Z';
  const html=view.render(model);assert.match(html,/data-receipts-checked-at="2026-11-04T20:31:58.685Z"/);assert.match(html,/ตรวจหลักฐานเงิน ณ 5 พ.ย. 2569 03:31:58 น\./);assert.doesNotMatch(html,/ตรวจหลักฐานเงิน ณ 2026-11-04T/);
});
test('calculated deposit balance is disclosed only in order detail and never blended into confirmed pending summary',()=>{
  const model=moneyModel();model.groups[0].money.orders[0].arithmeticBalance={amount:1234.56,currency:'USD',label:'ยอดตามใบหลังหักมัดจำ · รอยืนยันยอดค้าง'};
  const html=view.render(model);assert.match(html,/data-arithmetic-balance>ยอดตามใบหลังหักมัดจำ · รอยืนยันยอดค้าง/);assert.match(html,/US\$ 1,234\.56<\/strong> · ไม่รวมยอดรอรับที่ยืนยัน/);assert.doesNotMatch(card(html,'confirmed'),/1,234\.56|data-arithmetic-balance/);
});

test('all money-source strings are escaped and receipt UI remains read-only, responsive and keyboard accessible',()=>{
  const model=moneyModel(),money=model.groups[0].money;money.orders[0].customer='<img src=x>';money.orders[0].ref='<script>ref</script>';money.orders[0].statusLabel='<b>paid</b>';money.orders[0].receiptEvents[0].label='<svg>label</svg>';money.orders[0].issues=['<em>issue</em>'];money.issues=[{severity:'error',message:'<strong>future</strong>'}];
  const before=JSON.stringify(model),html=view.render(model);for(const escaped of ['&lt;img src=x&gt;','&lt;script&gt;ref&lt;/script&gt;','&lt;b&gt;paid&lt;/b&gt;','&lt;svg&gt;label&lt;/svg&gt;','&lt;em&gt;issue&lt;/em&gt;','&lt;strong&gt;future&lt;/strong&gt;'])assert(html.includes(escaped));
  assert.doesNotMatch(html,/<img src|<script>|<svg>|<em>issue/);assert.equal(JSON.stringify(model),before);
  assert.match(html,/role="region" aria-label="รายละเอียดเงินแยกตามใบขาย"/);assert.match(html,/<th scope="col">เหลือรับ \/ รอรับ/);
  const css=fs.readFileSync(new URL('../stock_order_review.css',import.meta.url),'utf8');assert.match(css,/\.sg-money-details>summary:focus-visible/);assert.match(css,/@media\(forced-colors:active\)/);assert.match(css,/@media\(max-width:600px\)\{\.sg-money-row/);
});
