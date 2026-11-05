import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Invented evidence only. No customer or quantity copied from a live capture.
const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const summary=read('../stock_summary.js'),planner=read('../stock_production_planner.js');
const clone=value=>JSON.parse(JSON.stringify(value));
class Clock extends Date {constructor(...args){super(...(args.length?args:['2030-11-05T08:00:00Z']));}static now(){return Date.parse('2030-11-05T08:00:00Z');}}
function fixture(unit='sheet'){
  const window={AAFOrderHeader:{currentMonthSoldView:()=>null,currentAllocationView:v=>v,warehouseProjection:()=>({})}};
  vm.runInNewContext(planner,{window});
  vm.runInNewContext(summary,{window,Date:Clock,document:{getElementById:()=>null,head:{append(){}},createElement:()=>({})},location:{hash:''},setTimeout(){}});
  const api=window.AAFStockSummary;
  const definitions=[{grade:'AAA',qty:20,date:'30/09/30',day:'2030-09-30',month:'2030-09',state:'dated'},{grade:'A',qty:10,date:'—',day:null,month:'2030-12',state:'missing'},{grade:'AV',qty:5,date:'27/10/230',day:null,month:'2030-10',state:'invalid'},{grade:'AAA',w:610,qty:7,date:'10/11/30',day:'2030-11-10',month:'2030-11',state:'dated'}];
  const rows=definitions.map((d,i)=>({key:'SYN-'+i,w:d.w||1220,l:2440,t:2.5,grade:d.grade,unit,qty:0,baseQty:0,freeQty:0,committedQty:d.qty,d90:0,d180:0,d270:0,d360:0,dOver:0}));
  const m=api.buildModel({report:{reportDate:'2030-11-05'},revision:12,exchangeRate:30,rows},()=>({price:2,curr:'THB',eq:0,value:0,freeValue:0}));
  const source={page:9,sourceIsLive:false,checksum:'sha256:'+'a'.repeat(64),capturedAt:'2030-11-05T07:00:00Z'},stock={revision:12,reportDate:'2030-11-05',planChecksum:'sha256:'+'b'.repeat(64),planCapturedAt:'2030-11-05T07:01:00Z'};
  const specs=rows.map((r,i)=>({key:[r.t,r.grade,r.w,r.l,r.unit].join('|'),w:r.w,l:r.l,t:r.t,grade:r.grade,unit:r.unit,shortage:definitions[i].qty,datedQuantity:definitions[i].state==='dated'?definitions[i].qty:0,missingQuantity:definitions[i].state==='missing'?definitions[i].qty:0,invalidQuantity:definitions[i].state==='invalid'?definitions[i].qty:0}));
  const orders=definitions.map((d,i)=>({sourceRow:i,itemIndex:0,specKey:specs[i].key,customer:'Synthetic Customer '+i,document:'SYN-PI-'+i,sourceMonth:d.month,sourceStatus:'เปิด PI',goodsStatus:'ready',etdRaw:d.date,dateStatus:d.state,date:d.day,shortage:d.qty}));
  m.currentAllocation={status:'verified-allocation',source,stock};
  const quantities={sheet:unit==='sheet'?42:0,strip:unit==='strip'?42:0};
  m.productionLoading={version:1,status:'verified',dateBasis:'ETD LOAD',source,stock,excludedGrades:['B','F'],allShortage:quantities,excluded:{sheet:0,strip:0},totals:quantities,byThickness:[{thickness:2.5,unit,shortage:42,earliestDate:'2030-09-30',finishBeforeDate:'2030-09-30',datedQuantity:27,missingQuantity:10,invalidQuantity:5,overdueQuantity:20,dates:[{date:'2030-09-30',quantity:20},{date:'2030-11-10',quantity:7}],invalidDateValues:['27/10/230'],specs,orders}]};
  m.productionLoading=clone(m.productionLoading);
  return {api,m};
}

test('overdue warning identifies the contributing customer, document, original ETD and source month without moving the earliest date',()=>{
  const {api,m}=fixture(),before=JSON.stringify(m),deadline=api.buildProductionDeadlines(m),html=api.renderAllProduction(m);
  assert.equal(deadline.status,'verified');assert.equal(deadline.byThickness['2.5'].date,'2030-09-30');
  assert.equal(deadline.byThickness['2.5'].customerDetails.status,'verified');
  const warning=html.match(/<section class="ss-production-date-check"[\s\S]*?<\/section>/)?.[0];assert.ok(warning);
  for(const value of ['Synthetic Customer 0','SYN-PI-0','30/09/30','2030-09','เปิด PI','พร้อมโหลด'])assert.ok(warning.includes(value),value);
  assert.match(warning,/ไม่ได้ยืนยันว่าลงวันผิด/);assert.match(warning,/ไม่เปลี่ยนสถานะโหลด/);
  assert.equal((warning.match(/data-production-order=/g)||[]).length,3,'overdue + missing + invalid, not a future date');
  assert.equal(JSON.stringify(m),before,'read-only projection');
});

test('missing and malformed dates retain their exact source text and are not silently corrected to current month/year',()=>{
  const {api,m}=fixture(),html=api.renderAllProduction(m);
  assert.match(html,/Synthetic Customer 1/);assert.match(html,/2030-12/);assert.match(html,/ยังไม่ระบุวันโหลด/);
  assert.match(html,/27\/10\/230/);assert.match(html,/รูปแบบวันต้นทางต้องตรวจ/);assert.match(html,/ไม่แก้ปีให้เอง/);
  assert.equal(api.buildProductionDeadlines(m).byThickness['2.5'].invalidQuantity,5);
});

test('future dated customers remain in collapsed full detail but do not become overdue warnings',()=>{
  const {api,m}=fixture(),html=api.renderAllProduction(m),warning=html.match(/<section class="ss-production-date-check"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(warning,/Synthetic Customer 3/);assert.match(html,/Synthetic Customer 3/);
  assert.match(html,/<details class="ss-production-dates">/);assert.doesNotMatch(html,/<details class="ss-production-dates" open/);
});

test('two-digit Thai year 69, full Buddhist 2569 and Gregorian 26 bind to the same original date without rewriting raw text',()=>{
  for(const raw of ['30/09/69','30/09/2569','30/09/26']){
    const {api,m}=fixture(),g=m.productionLoading.byThickness[0];
    g.orders[0].etdRaw=raw;g.orders[0].date='2026-09-30';g.dates[0].date='2026-09-30';g.earliestDate='2026-09-30';g.finishBeforeDate='2026-09-30';
    const before=JSON.stringify(m),dates=api.buildProductionDeadlines(m),html=api.renderAllProduction(m);
    assert.equal(dates.status,'verified');assert.equal(dates.byThickness['2.5'].date,'2026-09-30');assert.equal(dates.byThickness['2.5'].customerDetails.status,'verified');
    assert.ok(html.includes(raw));assert.equal(JSON.stringify(m),before);
  }
});

test('older DTOs keep verified date quantities and cost estimates, with pending identities rather than a guessed customer',()=>{
  const {api,m}=fixture();delete m.productionLoading.byThickness[0].orders;
  const dates=api.buildProductionDeadlines(m),html=api.renderAllProduction(m);
  assert.equal(dates.status,'verified');assert.equal(dates.byThickness['2.5'].date,'2030-09-30');assert.equal(dates.byThickness['2.5'].customerDetails.status,'pending');
  assert.match(html,/รายละเอียดลูกค้า \/ เอกสารที่ผูกกับแผนนี้/);assert.doesNotMatch(html,/Synthetic Customer/);assert.match(html,/data-production-total="totalCost"/);
});

test('incomplete, duplicate or inconsistent detail evidence fails identity display closed without changing valid grouped dates',()=>{
  const changes=[g=>g.orders.pop(),g=>g.orders.push(clone(g.orders[0])),g=>g.orders[0].shortage++,g=>g.orders[0].date='2030-10-30',g=>g.orders[0].etdRaw='30/10/30',g=>g.orders[0].specKey='different',g=>g.orders[0].sourceRow=-1,g=>g.orders[0].sourceMonth='2030-13',g=>g.orders[0].customer=null,g=>g.orders[0].dateStatus='missing'];
  for(const change of changes){const {api,m}=fixture();change(m.productionLoading.byThickness[0]);const result=api.buildProductionDeadlines(m);assert.equal(result.status,'verified');assert.equal(result.byThickness['2.5'].customerDetails.status,'pending',String(change));assert.equal(result.byThickness['2.5'].date,'2030-09-30');assert.doesNotMatch(api.renderAllProduction(m),/Synthetic Customer/);}
});

test('stale source/plan identity suppresses the whole customer and date projection',()=>{
  for(const change of [m=>m.productionLoading.stock.revision++,m=>m.productionLoading.source.checksum='different']){
    const {api,m}=fixture();change(m);assert.equal(api.buildProductionDeadlines(m).status,'pending');assert.doesNotMatch(api.renderAllProduction(m),/Synthetic Customer|data-production-order=/);
  }
});

test('all customer/document/status/raw ETD content is escaped; no source HTML can execute',()=>{
  const {api,m}=fixture(),g=m.productionLoading.byThickness[0];
  g.orders[0].customer='<img src=x onerror=alert(1)>';g.orders[0].document='<script>bad</script>';g.orders[0].sourceStatus='<b>raw</b>';
  g.orders[2].etdRaw='<svg onload=alert(1)>';
  const html=api.renderAllProduction(m);assert.match(html,/&lt;img src=x/);assert.match(html,/&lt;script&gt;bad/);assert.match(html,/&lt;svg onload/);assert.doesNotMatch(html,/<img src=x|<script>bad|<svg onload/);
});

test('included strip ETD warnings retain piece units and cannot become a sheet deadline or manufacturing conversion',()=>{
  const {api,m}=fixture('strip'),dates=api.buildProductionDeadlines(m),html=api.renderAllProduction(m);
  assert.equal(dates.status,'verified');assert.equal(Object.keys(dates.byThickness).length,0);
  assert.equal(dates.dateGroups[0].unit,'strip');assert.match(html,/Synthetic Customer 0/);assert.match(html,/ชิ้นไม้แถบ/);
  assert.match(html,/data-production-total="eq2_5">0/);assert.match(html,/รอฐานไม้แถบ/);
});

test('Section02 is a single outer surface while retaining its month control, three groups and pending states',()=>{
  const css=read('../stock_premium.css'),shadow=read('../stock_order_review.css'),controller=read('../stock_order_controller.js'),view=read('../stock_sales_groups_view.js');
  assert.match(summary,/<section class="ss-sales-block"[^>]*><div class="ss-section-title">[\s\S]*?<div id="stock-order-review-slot"><\/div><\/section>/);
  assert.match(css,/\.ss-sales-block \{[^}]*border: 1px solid[^}]*border-radius: 24px/);
  assert.match(css,/\.ss-sales-block>\.ss-section-title \{[^}]*background: transparent[^}]*box-shadow: none/);
  assert.match(css,/\.ss-sales-block \.stock-order-toolbar \{[^}]*background: transparent/);
  assert.match(shadow,/\.compact-chrome #month-dashboard \{[^}]*border: 0[^}]*background: transparent[^}]*box-shadow: none/);
  assert.match(controller,/host\.append\(toolbar,status,body\)/);assert.match(controller,/monthSelect\.addEventListener\('change'/);
  assert.match(view,/<div class="sg-grid">\$\{cards\}<\/div>/);assert.match(view,/data-sales-group="\$\{id\}"/);
  const addedCSS=shadow.slice(shadow.indexOf('/* Embedded Section02 inherits'));
  assert.doesNotMatch(addedCSS,/display\s*:\s*none|visibility\s*:\s*hidden|pointer-events/,'no group, source warning or error hidden');
});
