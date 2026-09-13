import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const code=readFileSync(new URL('../stock_reservations.js',import.meta.url),'utf8');
const cashCode=readFileSync(new URL('../stock_cash.js',import.meta.url),'utf8');
const context={window:{}};vm.runInNewContext(code,context);vm.runInNewContext(cashCode,context);
const api=context.window.AAFStockReservations,cash=context.window.AAFStockCash;
const bucket=(extra={})=>({pi:0,negotiation:0,forecast:0,shipping:0,other:0,total:0,paid:null,...extra});
const row=(extra={})=>({key:'w1220_l2440_t4.5_gAAA',w:1220,l:2440,t:4.5,grade:'AAA',unit:'sheet',qty:1000,committedQty:646,freeQty:354,priceConfirmed:false,...extra});
function fixture(){
 const a=bucket({pi:646,total:646}),b=bucket({pi:114,forecast:20.5,negotiation:4.5,total:139});
 return {report:{reportDate:'2026-09-13'},revision:32,updatedAt:'2026-09-14T03:29:00+07:00',rows:[row(),row({key:'w1220_l2440_t4.5_gB',grade:'B',qty:200,committedQty:139,freeQty:61})],sellablePlan:{month:'2026-09',checksum:'sha256:test',source:{capturedAt:'2026-09-12T03:48:00+07:00'},appliedAt:'2026-09-12T03:52:09+07:00',needsSalesRefresh:true},reservationBreakdown:{version:1,status:'verified',sourceCapturedAt:'2026-09-12T03:48:00+07:00',month:'2026-09',appliedAt:'2026-09-12T03:52:09+07:00',planChecksum:'sha256:test',needsSalesRefresh:true,paymentEvidence:'not-captured',byKey:{'w1220_l2440_t4.5_gAAA':a,'w1220_l2440_t4.5_gB':b},totals:{sheet:bucket({pi:760,negotiation:4.5,forecast:20.5,total:785}),strip:bucket()}}};
}
test('verified payload reconciles per key and unit, retaining Mix hundredths without payment inference',()=>{
 const d=fixture(),before=JSON.stringify(d),m=api.build(d);
 assert.equal(m.status,'verified');assert.equal(m.byKey[d.rows[0].key].pi,646);assert.equal(m.byKey[d.rows[1].key].pi,114);
 assert.equal(m.byKey[d.rows[1].key].forecast,20.5);assert.equal(m.totals.sheet.total,785);assert.equal(m.totals.strip.total,0);
 assert.equal(m.totals.sheet.paid,null);assert.equal(m.needsSalesRefresh,true);assert.equal(JSON.stringify(d),before);
 assert(api.describe(m).includes('รอทบทวน'));assert(api.renderBuckets(m.totals.sheet).includes('จ่ายเงินแล้ว — ยังไม่มีหลักฐาน'));
 assert(!api.renderBuckets(m.totals.sheet).includes('จ่ายเงินแล้ว 0'));
});
test('any mismatch fails closed for entire category dataset without changing aggregate reservations',()=>{
 for(const change of [d=>d.reservationBreakdown.byKey[d.rows[0].key].pi++,d=>d.rows[0].committedQty++,d=>d.reservationBreakdown.totals.sheet.forecast++,d=>d.reservationBreakdown.byKey[d.rows[0].key].paid=0,d=>d.reservationBreakdown.planChecksum='other',d=>d.reservationBreakdown.byKey.unknown=bucket(),d=>delete d.reservationBreakdown.byKey[d.rows[0].key],d=>d.reservationBreakdown.byKey[d.rows[0].key].pi=NaN]){
  const d=fixture();change(d);const before=JSON.stringify(d),m=api.build(d);assert.equal(m.status,'mismatch');assert.equal(Object.keys(m.byKey).length,0);assert.equal(m.totals.sheet,null);assert.equal(JSON.stringify(d),before);
 }
});
test('legacy/unavailable retains unknown categories, zero reservations can be safely omitted from verified map',()=>{
 const d=fixture();delete d.reservationBreakdown;assert.equal(api.build(d).status,'unavailable');assert(api.renderBuckets(null).includes('ยังยืนยันยอดแยกไม่ได้'));
 const z=fixture();z.rows.push(row({key:'w1260_l2440_t4.5_gAAA',w:1260,committedQty:0}));assert.equal(api.build(z).byKey[z.rows[2].key].total,0);
 const u=fixture();u.reservationBreakdown.status='unavailable';assert.equal(api.build(u).totals.sheet,null);
});
test('shipping and unknown statuses are disclosed only when present; unit totals stay separate',()=>{
 const d=fixture(),b=bucket({shipping:220000,other:2,total:220002});d.rows.push(row({key:'w25_l2052_t3.2_gB',w:25,l:2052,t:3.2,grade:'B',unit:'strip',qty:1090200,committedQty:220002,freeQty:870198}));d.reservationBreakdown.byKey[d.rows[2].key]=b;d.reservationBreakdown.totals.strip=b;
 const m=api.build(d);assert.equal(m.status,'verified');assert.equal(m.totals.strip.total,220002);assert.equal(m.totals.sheet.total,785);
 const html=api.renderTotals(m);assert(html.includes('ชิ้น strip'));assert(html.includes('มีเรือ 220,000'));assert(html.includes('สถานะอื่น / รอตรวจ 2'));assert(!api.renderBuckets(m.totals.sheet).includes('มีเรือ'));
});
test('HTML escaping protects source text and existing annotations; no source order/document guessing',()=>{
 const bad=api.renderTotals({status:'unavailable',reason:'<img onerror="x">',totals:{}});assert(!bad.includes('<img'));assert(bad.includes('&lt;img'));
 const d=fixture();d.rows[0].followup='<script>bad</script>';d.rows[0].document='—';const m=cash.build(d),html=cash.render(m);
 assert.equal(m.rows[0].piQty,646);assert.equal(m.rows[1].forecastQty,20.5);assert.equal(m.rows[0].paidQty,null);assert.equal(m.received,null);assert.equal(m.outstanding,null);assert.equal(m.forecastValue,null);
 assert(html.includes('เปิด PI 646'));assert(html.includes('Forecast 20.5'));assert(html.includes('รอทบทวน'));assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));
});
test('cash mismatch/legacy fallback preserves old totals and never fills monetary evidence',()=>{
 const d=fixture();d.reservationBreakdown.totals.sheet.total++;const m=cash.build(d);assert.equal(m.totals[0].reserved,785);assert.equal(m.rows[0].reservationCategories,null);assert.equal(m.rows[0].forecastQty,null);assert.equal(m.rows[0].received,null);assert(cash.render(m).includes('ยังยืนยันยอดแยกไม่ได้'));
 delete d.reservationBreakdown;const old=cash.build(d);assert.equal(old.totals[0].reserved,785);assert.equal(old.rows[0].paidQty,null);
});
test('both pages load versioned helper before consumers; helper is read-only',()=>{
 for(const file of ['stock_manager.html','stock_report.html']){const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');assert(html.includes('stock_reservations.js?v=20260914-reservations'));assert(html.indexOf('stock_reservations.js')<html.indexOf('stock_cash.js'));if(html.includes('stock_plan_ui.js'))assert(html.indexOf('stock_reservations.js')<html.indexOf('stock_plan_ui.js'));}
 assert(!/localStorage|sessionStorage|fetch\(|XMLHttpRequest|\.post\(/.test(code));
});
