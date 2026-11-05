import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Synthetic display evidence only: no company source, network or storage writes.
const require=createRequire(import.meta.url);
const current=require('../stock_current_sales_groups.js');
const thickness=require('../stock_sales_thickness.js');
const now=Date.parse('2030-11-05T05:00:00Z'),month='2030-11',capturedAt='2030-11-04T01:00:00Z';
const copy=value=>JSON.parse(JSON.stringify(value));
const row=(id,status,qty,extra={})=>({id,orderId:'SYNTH-'+id,ref:'SYNTH-'+id,customer:'Synthetic',w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',qty,sourceStatus:status,productStatus:'พร้อมโหลด',term:'TT',payment:'รอรับ',...extra});
function fixture(rows=[row('loaded','ออก INV',10,{t:5}),row('waiting','เปิด PI',6,{t:1.25}),row('strip','เปิด PI',100,{w:61,l:1220,unit:'strip'}),row('negotiation','เจรจา',8),row('forecast','Forecast',9)]){
  const source={page:9,month,capturedAt,checksum:'sha256:'+'a'.repeat(64),sourceIsLive:false,orderCount:new Set(rows.map(r=>r.orderId)).size,lineCount:rows.length};
  const readModel={kind:'current-month-order-review',status:'verified-sales-only',selectedMonth:month,source};
  const sold={version:1,status:'verified-quantities',month,source:copy(source),quantity:{sheet:0,strip:0},loaded:{sheet:0,strip:0},paidOrDeposit:{sheet:0,strip:0},lcETD:{sheet:0,strip:0},orderCount:0,lineCount:0};
  return {review:{metadata:{month,sourceSalesCapturedAt:capturedAt},rows,readModel},sold};
}
const build=f=>current.build(f.review,f.review.readModel,f.sold,now);
function browser({engine=true}={}){
  const RealDate=Date,window={};
  const context={window,Intl,Set,Date:class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}};
  const files=['stock_sales_groups.js','stock_sales_receipts.js',...(engine?['stock_sales_thickness.js']:[]),'stock_current_sales_groups.js','stock_order_header.js'];
  for(const file of files)vm.runInNewContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),context);
  return window;
}
const card=html=>html.split('data-stock-card="sold"')[1]?.split('data-stock-card="')[0]||'';
const render=(f,m=build(f),runtime=browser(),selected=null)=>card(runtime.AAFOrderHeader.render(selected,new Set(),undefined,'รอ',f.sold,undefined,m));

test('upper conversion comes from the same lower shared engine with separate units and conserving subsets',()=>{
  const f=fixture(),before=copy(f),m=build(f),actual=m.equivalentByGroup.confirmed,lower=thickness.build(f.review).byGroup.confirmed;
  assert.equal(m.status,'verified');assert.deepEqual(actual.total,lower.totals.eq25);assert.deepEqual(actual.loaded,lower.loaded.eq25);assert.deepEqual(actual.waiting,lower.waiting.eq25);
  assert.equal(actual.total.sheet,23);assert.equal(actual.total.strip,2.5);assert.equal(actual.total.total,25.5);
  assert.equal(actual.loaded.total,20);assert.equal(actual.waiting.total,5.5);assert.equal(actual.loaded.total+actual.waiting.total,actual.total.total);
  assert.deepEqual(f,before);assert.equal(current.view(m,f.sold,now).status,'verified');
});

test('uses exact source size and thickness, allowing reversed edges but not the allocation-only size equivalence',()=>{
  const f=fixture([row('a','เปิด PI',10,{w:1200,l:2400}),row('b','เปิด PI',10,{w:2440,l:1220}),row('c','เจรจา',99)]),m=build(f);
  const expected=10*1200*2400/(1220*2440)+10;
  assert.ok(Math.abs(m.equivalentByGroup.confirmed.total.total-expected)<1e-10);assert.notEqual(m.equivalentByGroup.confirmed.total.total,20);
  assert.equal(m.groups.find(g=>g.id==='confirmed').totals.sheet,20);assert.equal(m.equivalentByGroup.negotiation.total.total,99);
});

test('confirmed upper card visibly shows combined normalized quantity before money and separate actual sheet/strip counts',()=>{
  const f=fixture(),html=render(f);
  assert.match(html,/<strong>16<\/strong>/);assert.match(html,/ไม้แถบ 100 ชิ้น/);
  assert.match(html,/data-current-sales-equivalent="confirmed"/);assert.match(html,/เทียบ 4×8 หนา 2\.5 มม\./);assert.match(html,/25\.5 แผ่นเทียบ/);
  assert.match(html,/23 แผ่นเทียบ \/ 2\.5 แผ่นเทียบ/);assert.match(html,/20 แผ่นเทียบ/);assert.match(html,/5\.5 แผ่นเทียบ/);
  assert.ok(html.indexOf('data-current-sales-equivalent')<html.indexOf('data-sales-money'));
});

test('unknown source dimensions leave only conversion pending, with known subtotal and no zero substitution',()=>{
  const f=fixture();f.review.rows[1].w=null;const m=build(f),eq=m.equivalentByGroup.confirmed.total,html=render(f,m);
  assert.equal(m.status,'verified');assert.equal(eq.sheet,null);assert.equal(eq.total,null);assert.equal(eq.strip,2.5);assert.equal(eq.knownTotal,22.5);assert.equal(eq.missingLineCount,1);
  assert.match(html,/<strong>16<\/strong>/);assert.match(html,/ยังยืนยันไม่ได้ · รอขนาด 1 บรรทัด/);assert.match(html,/ส่วนที่แปลงได้/);assert.match(html,/22\.5 แผ่นเทียบ/);
});

test('genuine empty group is a known zero equivalent rather than missing source',()=>{
  const f=fixture([]),m=build(f),eq=m.equivalentByGroup.confirmed.total;
  assert.equal(m.status,'verified');assert.equal(eq.complete,true);assert.equal(eq.total,0);assert.equal(eq.sheet,0);assert.equal(eq.strip,0);
  assert.match(render(f,m),/0 แผ่นเทียบ/);
});

test('modified equivalent values fail source-bound readback, including changed loaded and strip totals',()=>{
  const f=fixture(),m=build(f);
  for(const edit of [v=>v.equivalentByGroup.confirmed.total.total=999,v=>v.equivalentByGroup.confirmed.loaded.total=999,v=>v.equivalentByGroup.confirmed.waiting.strip=999]){
    const changed=copy(m);edit(changed);assert.equal(current.view(changed,f.sold,now).status,'pending');assert.doesNotMatch(render(f,changed),/data-current-sales-equivalent/);
  }
});

test('mismatched source and Bangkok month rollover cannot expose stale converted quantities',()=>{
  const f=fixture(),m=build(f),changed=copy(f.sold);changed.source.checksum='sha256:'+'b'.repeat(64);
  assert.equal(current.view(m,changed,now).status,'pending');assert.equal(current.view(m,f.sold,Date.parse('2030-11-30T17:00:00Z')).status,'pending');
  const historical=copy(f);historical.review.readModel.selectedMonth='2030-10';assert.equal(build(historical).status,'pending');
});

test('lower historical selection cannot change the upper current-month equivalents',()=>{
  const f=fixture(),m=build(f),runtime=browser();
  const history={month:'2030-10',sold:{quantity:{sheet:99999,strip:0},eq25:88888},fx:{rate:99}};
  assert.equal(render(f,m,runtime,history),render(f,m,runtime));
});

test('missing engine leaves equivalent explicitly pending without erasing verified actual quantities',()=>{
  const f=fixture(),m=build(f),html=render(f,m,browser({engine:false}));
  assert.match(html,/<strong>16<\/strong>/);assert.match(html,/รอตรวจขนาดต้นทางสำหรับยอดแผ่นเทียบ/);assert.doesNotMatch(html,/25\.5 แผ่นเทียบ/);
});

test('input evidence stays immutable and hostile dimension strings are not rendered or executed',()=>{
  const f=fixture();f.review.rows[1].w='<img src=x onerror=alert(1)>';const before=copy(f),m=build(f),html=render(f,m);
  assert.equal(m.equivalentByGroup.confirmed.total.total,null);assert.deepEqual(f,before);assert.doesNotMatch(html,/<img|onerror|NaN|Infinity/);
  for(const file of ['stock_current_sales_groups.js'])assert.doesNotMatch(readFileSync(new URL('../'+file,import.meta.url),'utf8'),/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage)\s*[.(]/);
});
