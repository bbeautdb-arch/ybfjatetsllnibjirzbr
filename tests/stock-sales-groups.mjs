import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),{build}=require('../stock_sales_groups.js');
const row=(id,sourceStatus,extra={})=>({id,orderId:'order-'+id,ref:'SYNTH-'+id,customer:'ลูกค้าสังเคราะห์',w:1220,l:2440,t:2.5,grade:'A',unit:'sheet',qty:10,sourceStatus,productStatus:'พร้อมโหลด',payment:'รอเก็บ TT / LC',...extra});
const review=(rows,extra={})=>({metadata:{month:'2030-11',sourceSalesCapturedAt:'2030-11-04T01:00:00Z'},readModel:{kind:'current-month-order-review',status:'verified-sales-only',selectedMonth:'2030-11',source:{month:'2030-11',capturedAt:'2030-11-04T01:00:00Z'}},rows,...extra});
const group=(model,id)=>model.groups.find(value=>value.id===id);
const copy=value=>JSON.parse(JSON.stringify(value));

test('PI without vessel/payment is confirmed waiting; ready alone never proves loaded',()=>{
  const model=build(review([row('pi','เปิด PI'),row('vessel','มีเรือ'),row('ready','เจรจา')]));
  assert.equal(model.status,'verified');assert.deepEqual(group(model,'confirmed').totals,{sheet:20,strip:0});
  assert.equal(group(model,'confirmed').loaded.lineCount,0);assert.equal(group(model,'confirmed').waiting.lineCount,2);
  assert.equal(group(model,'negotiation').lineCount,1);
});
test('issued INV and explicit product loaded are loaded independently of payment or ready selector',()=>{
  const input=[row('inv','ออก INV'),row('explicit','เปิด PI',{productStatus:'โหลดแล้ว'}),row('neg-loaded','เจรจา',{productStatus:'loaded'}),row('not-loaded','เปิด PI',{productStatus:'not loaded'})];
  const model=build(review(input));assert.deepEqual(group(model,'confirmed').loaded.rows,input.slice(0,3));
  assert.deepEqual(group(model,'confirmed').waiting.rows,[input[3]]);assert.equal(input[0].payment,'รอเก็บ TT / LC');
});
test('cancellation wins over PI, INV, loaded and paid; source quantities remain untouched',()=>{
  const input=[row('cancel','ออก INV',{cancelled:true,productStatus:'โหลดแล้ว',payment:'รับเงินแล้ว',qty:0,sourceQty:4}),row('text','ยกเลิก',{qty:8}),row('type','เปิด PI',{sourceType:'cancelled'})];
  const model=build(review(input));assert.equal(model.cancelled.lineCount,3);assert.deepEqual(model.cancelled.totals,{sheet:22,strip:0});
  assert.equal(model.summary.lineCount,0);assert.equal(group(model,'confirmed').lineCount,0);assert.equal(model.cancelled.rows[0].sourceQty,4);
});
test('cancelled source amount is separate from active zero, and unknown cancelled amount is never fabricated as zero',()=>{
  const known=build(review([row('a','เปิด PI',{cancelled:true,qty:0,sourceQty:12.5}),row('b','Forecast',{cancelled:true,qty:0,sourceQty:0,unit:'strip'})]));
  assert.equal(known.status,'verified');assert.deepEqual(known.cancelled.totals,{sheet:12.5,strip:0});assert.deepEqual(known.summary.totals,{sheet:0,strip:0});
  for(const extra of [{qty:0},{qty:0,sourceQty:null},{qty:10,sourceQty:undefined},{qty:10,sourceQty:-1}]){const model=build(review([row('bad','ยกเลิก',extra)]));assert.equal(model.status,'pending');assert.equal(model.cancelled.totals.sheet,null);assert.deepEqual(model.summary.totals,{sheet:0,strip:0});}
  const positive=build(review([row('old','ยกเลิก',{qty:6})]));assert.equal(positive.cancelled.totals.sheet,6);assert.equal(positive.status,'verified');
});
test('three source groups conserve exact quantities and units without 80% weighting, MIX split or dimension merging',()=>{
  const input=[row('a','เปิด PI',{qty:2.75,grade:'MIX',w:1200,l:2400}),row('b','เจรจา',{qty:20}),row('c','Forecast',{qty:40}),row('strip','Forecast',{unit:'strip',w:25,l:2052,t:3.2,qty:100})];
  const model=build(review(input));assert.deepEqual(model.groups.map(g=>g.id),['confirmed','negotiation','forecast']);
  assert.match(group(model,'confirmed').label,/ขายแล้ว \/ ออเดอร์ยืนยัน/);assert.match(group(model,'negotiation').label,/80%\+/);assert.equal(group(model,'negotiation').totals.sheet,20);
  assert.deepEqual(group(model,'forecast').totals,{sheet:40,strip:100});assert.deepEqual(model.summary.totals,{sheet:62.75,strip:100});
  assert.equal(model.summary.lineCount,4);assert.equal(model.groups.reduce((n,g)=>n+g.lineCount,0),4);assert.equal(input[0].grade,'MIX');assert.equal(input[0].w,1200);
});
test('grouping ignores legacy soldGroup, queue and document prefixes as classifiers',()=>{
  const input=[row('sc','เปิด PI',{ref:'SC-SYNTH-BALANCE',soldGroup:'notSold',queue:{group:4},allocated:8}),row('qt','เจรจา',{ref:'PI-SYNTHETIC',queue:{group:1},loaded:10}),row('unknown','ยังไม่เปิด PI',{soldGroup:'loaded',queue:{group:2}})];
  const model=build(review(input));assert.equal(group(model,'confirmed').rows[0],input[0]);assert.equal(group(model,'negotiation').rows[0],input[1]);
  assert.equal(model.unclassified.rows[0],input[2]);assert.equal(model.status,'pending');assert.equal(input[0].allocated,8);
});
test('paid Forecast stays Forecast with prominent exception; no existing reservation/financial field changes',()=>{
  const input=[row('paid','Forecast',{payment:'รับเงินแล้ว',soldGroup:'paidOrDeposit',reservationKind:'sold-unloaded',allocated:7,shortage:3,commercial:{receiptLabel:'รับเงินตามหลักฐานเดิม'}}),row('deposit','เจรจา',{payment:'มัดจำ\nมัดจำแล้ว ✓\nคงเหลือ\nรอเก็บ TT / LC'}),row('unpaid','Forecast',{payment:'ยังไม่รับเงิน'}),row('lc','Forecast',{payment:'เก็บเงิน / ได้ LC แล้ว',term:'LC'})];
  const before=copy(input),model=build(review(input));assert.equal(model.status,'verified');assert.equal(group(model,'forecast').lineCount,3);
  assert.equal(group(model,'forecast').issues.length,1);assert.equal(group(model,'negotiation').issues.length,1);assert.match(model.issues[0].message,/กลุ่มแสดงผลไม่ใช่ยอดจอง/);assert.deepEqual(input,before);
});
test('identical-looking anonymous and separate explicit source orders are never business-deduplicated',()=>{
  const input=[row('a','Forecast',{orderId:'one',ref:'—',qty:12}),row('b','Forecast',{orderId:'two',ref:'—',qty:12}),row('c','เปิด PI',{orderId:'split',sourceLineIndex:0}),row('d','เปิด PI',{orderId:'split',sourceLineIndex:1,unit:'strip',qty:80})];
  const model=build(review(input));assert.equal(model.summary.orderCount,3);assert.equal(model.summary.lineCount,4);assert.equal(group(model,'forecast').orderCount,2);
  assert.deepEqual(model.summary.totals,{sheet:34,strip:80});assert.equal(group(model,'confirmed').orderCount,1);
});
test('same order may span loaded/waiting without double-counting total order count',()=>{
  const model=build(review([row('a','เปิด PI',{orderId:'split',productStatus:'โหลดแล้ว'}),row('b','เปิด PI',{orderId:'split'})]));
  const g=group(model,'confirmed');assert.equal(g.orderCount,1);assert.equal(g.loaded.orderCount,1);assert.equal(g.waiting.orderCount,1);assert.equal(model.summary.orderCount,1);
});
test('duplicate exact source line IDs remain present but invalidate affected group totals and order counts',()=>{
  const input=[row('duplicate','เปิด PI',{qty:3}),row('duplicate','เปิด PI',{qty:3}),row('distinct','Forecast',{qty:7})],before=copy(input),model=build(review(input));
  assert.equal(model.status,'pending');assert.equal(model.sourceLineCount,3);assert.equal(model.summary.lineCount,3);assert.equal(group(model,'confirmed').lineCount,2);
  for(const bucket of [model.summary,group(model,'confirmed'),group(model,'confirmed').waiting]){assert.deepEqual(bucket.totals,{sheet:null,strip:null});assert.equal(bucket.orderCount,null);}
  assert.deepEqual(group(model,'confirmed').loaded.totals,{sheet:0,strip:0});assert.deepEqual(group(model,'forecast').totals,{sheet:7,strip:0});assert.equal(group(model,'forecast').orderCount,1);
  assert.equal(model.issues.filter(issue=>issue.code==='duplicate-source-line-id').length,2);assert.equal(group(model,'confirmed').rows[0],input[0]);assert.equal(group(model,'confirmed').rows[1],input[1]);assert.deepEqual(input,before);
});
test('a repeated line ID across states invalidates each affected subset; cancelled duplicates do not contaminate active totals',()=>{
  const split=build(review([row('same','เปิด PI',{productStatus:'โหลดแล้ว'}),row('same','Forecast')]));
  assert.equal(split.status,'pending');assert.equal(group(split,'confirmed').loaded.totals.sheet,null);assert.equal(group(split,'forecast').totals.sheet,null);assert.equal(split.summary.orderCount,null);
  const cancelled=build(review([row('cancel','ยกเลิก',{sourceQty:4,qty:0}),row('cancel','ยกเลิก',{sourceQty:4,qty:0}),row('active','เปิด PI',{qty:6})]));
  assert.equal(cancelled.status,'pending');assert.deepEqual(cancelled.cancelled.totals,{sheet:null,strip:null});assert.deepEqual(cancelled.summary.totals,{sheet:6,strip:0});assert.equal(cancelled.summary.orderCount,1);
});
test('historical negotiation without original source type remains unresolved instead of guessed Forecast or negotiation',()=>{
  const input=[row('ambiguous','เจรจา'),row('forecast','เจรจา',{sourceType:'forecast'}),row('neg','เจรจา',{sourceType:'negotiation'}),row('explicit','Forecast'),row('pi','เปิด PI',{sourceType:'forecast'})];
  const r=review(input);r.metadata.month='2030-10';r.metadata.sourceSalesCapturedAt='2030-10-22T07:00:00Z';r.readModel={kind:'dated-order-review',selectedMonth:'2030-10',historical:true,sourceCapturedAt:'2030-10-22T07:00:00Z',stale:true};
  const model=build(r);assert.equal(model.status,'pending');assert.equal(model.month,'2030-10');assert.equal(model.capturedAt,'2030-10-22T07:00:00Z');
  assert.deepEqual(model.unclassified.rows,[input[0]]);assert.equal(group(model,'forecast').lineCount,2);assert.equal(group(model,'negotiation').lineCount,1);assert.equal(group(model,'confirmed').lineCount,1);
});
test('explicit sourceType may fill absent sourceStatus but contradictory final states are not guessed',()=>{
  const input=[row('f',undefined,{sourceType:'forecast'}),row('p',undefined,{sourceType:'pi'}),row('x','เจรจา',{sourceType:'pi'}),row('unknown','unknown status',{sourceType:'forecast'}),row('contradictory','Forecast',{sourceType:'pi'})];
  const model=build(review(input));assert.equal(group(model,'forecast').lineCount,1);assert.equal(group(model,'confirmed').lineCount,1);assert.equal(model.unclassified.lineCount,3);
});
test('genuine zero is known; missing, malformed, negative and nonfinite quantities become null, never zero',()=>{
  for(const qty of [undefined,null,'10',-1,NaN,Infinity]){const model=build(review([row('invalid','เปิด PI',{qty}),row('strip','Forecast',{unit:'strip',qty:5})]));assert.equal(model.status,'pending');assert.equal(group(model,'confirmed').totals.sheet,null);assert.equal(model.summary.totals.sheet,null);assert.equal(model.summary.totals.strip,5);assert.equal(model.summary.lineCount,2);}
  const zero=build(review([row('zero','Forecast',{qty:0})]));assert.equal(zero.status,'verified');assert.equal(group(zero,'forecast').totals.sheet,0);assert.equal(group(zero,'forecast').lineCount,1);
});
test('unknown unit poisons both unit totals only in affected buckets; all original rows retained',()=>{
  const input=[row('bad','Forecast',{unit:'pallet'}),row('okay','เปิด PI')],model=build(review(input));
  assert.deepEqual(group(model,'forecast').totals,{sheet:null,strip:null});assert.deepEqual(model.summary.totals,{sheet:null,strip:null});assert.deepEqual(group(model,'confirmed').totals,{sheet:10,strip:0});assert.equal(model.sourceLineCount,2);
});
test('month/capture mismatches and missing proof invalidate numeric totals while preserving every row',()=>{
  const mutations=[r=>delete r.metadata.month,r=>r.metadata.month='2030-13',r=>r.readModel.selectedMonth='2030-10',r=>r.readModel.source.month='2030-10',r=>r.rows[0].sourceMonth='2030-10',r=>r.financial={metadata:{month:'2030-10'}},r=>r.readModel.source.capturedAt='2030-11-03T01:00:00Z',r=>{delete r.readModel.source.capturedAt;delete r.metadata.sourceSalesCapturedAt;},r=>r.readModel.status='pending',r=>delete r.readModel];
  for(const mutate of mutations){const r=review([row('a','เปิด PI')]);mutate(r);const model=build(r);assert.equal(model.status,'pending');assert.deepEqual(group(model,'confirmed').totals,{sheet:null,strip:null});assert.equal(model.summary.orderCount,null);assert.equal(group(model,'confirmed').rows[0],r.rows[0]);}
});
test('capture timezone and Bangkok month boundary are checked; invalid calendar dates fail closed',()=>{
  const r=review([row('a','เปิด PI')]);r.readModel.source.capturedAt='2030-10-31T17:00:00Z';r.metadata.sourceSalesCapturedAt='2030-11-01T00:00:00+07:00';assert.equal(build(r).status,'verified');
  for(const capture of ['2030-10-31T16:59:59Z','2030-02-30T01:00:00Z','2030-11-04','2030-11-04T25:00:00Z','2030-11-04T01:00:00+15:00']){const b=review([row('a','เปิด PI')]);b.readModel.source.capturedAt=capture;b.metadata.sourceSalesCapturedAt=capture;assert.equal(build(b).status,'pending');}
});
test('ETD missing, invalid, historical or future never changes business grouping or loaded classification',()=>{
  for(const etd of [undefined,'—','31/02/30','01/01/2000','01/12/40']){const model=build(review([row('p','เปิด PI',{etd}),row('l','ออก INV',{etd})]));assert.equal(model.status,'verified');assert.equal(group(model,'confirmed').loaded.lineCount,1);assert.equal(group(model,'confirmed').waiting.lineCount,1);}
});
test('order count uses explicit source identity only, otherwise remains unknown without merging customer/ref',()=>{
  const fallback=build(review([row('a','Forecast',{orderId:undefined,sourceIndex:2}),row('b','Forecast',{orderId:undefined,sourceIndex:2,sourceLineIndex:1})]));assert.equal(fallback.summary.orderCount,1);
  const missing=build(review([row('a','Forecast',{orderId:undefined})]));assert.equal(missing.status,'pending');assert.equal(missing.summary.orderCount,null);assert.equal(missing.summary.totals.sheet,10);
});
test('empty verified source remains empty, whereas missing source rows is pending',()=>{
  const empty=build(review([]));assert.equal(empty.status,'verified');assert.equal(empty.summary.orderCount,0);assert.deepEqual(empty.summary.totals,{sheet:0,strip:0});
  const missing=build(review(undefined));assert.equal(missing.status,'pending');assert.deepEqual(missing.summary.totals,{sheet:null,strip:null});
});
test('no mutation, sorting, money calculation or side effects; UMD browser export has the same pure API',()=>{
  const r=review([row('z','Forecast',{ref:'<script>synthetic</script>',qty:2.5,price:999}),row('a','เปิด PI')]);const before=copy(r);
  for(const item of r.rows)Object.freeze(item);Object.freeze(r.rows);Object.freeze(r.metadata);Object.freeze(r.readModel);Object.freeze(r);
  const model=build(r);assert.deepEqual(r,before);assert.equal(model.summary.rows[0],r.rows[0]);assert.equal(group(model,'forecast').rows[0].ref,'<script>synthetic</script>');
  const source=readFileSync(new URL('../stock_sales_groups.js',import.meta.url),'utf8'),context={window:{}};vm.runInNewContext(source,context);assert.deepEqual(Object.keys(context.window.AAFSalesGroups),['build']);assert.equal(context.window.AAFSalesGroups.build(r).summary.totals.sheet,12.5);
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage)\s*[.(]/);
});
