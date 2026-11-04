import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Only invented rows and amounts. Never copy company stock or sales into tests.
const source=fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8');
const copy=v=>JSON.parse(JSON.stringify(v));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const calculate=r=>({price:2,curr:'THB',eq:r.qty*r.w*r.l/(1220*2440)*r.t/2.5,value:r.qty*2,freeValue:r.freeQty*2});
const row=(key,more={})=>({key,sku:key,desc:'Synthetic only',size:'Normal',w:1220,l:2440,t:1.6,grade:'AAA',unit:'sheet',qty:0,baseQty:0,committedQty:0,freeQty:0,d90:0,d180:0,d270:0,d360:0,dOver:0,...more});
const data=()=>({report:{reportDate:'2000-06-02',sourceRowCount:8},revision:7,exchangeRate:30,rows:[
  row('SYN-short',{qty:10,baseQty:10,d90:10,committedQty:15}),
  row('SYN-other-size-spare',{w:610,l:1220,qty:100,baseQty:100,d90:100,freeQty:100}),
  row('SYN-zero-physical',{t:1.8,grade:'F',committedQty:12.25}),
  row('SYN-strip',{t:3.2,grade:'B',w:25,l:1000,unit:'strip',qty:100,baseQty:100,d90:100,committedQty:125}),
  row('SYN-equivalent-original',{t:2.5,grade:'B',w:1200,l:2400,qty:1,baseQty:1,d90:1,committedQty:4}),
  row('SYN-reversed-original',{t:2.5,grade:'B',w:2440,l:1220,committedQty:2}),
  row('SYN-zero-retained',{t:6,grade:'AAA',retained:true}),
  row('SYN-forecast-source',{t:4.5,grade:'F',sourceStatus:'Forecast',sourceDemand:9999})
]});
function runtime(){
  const window={};
  const document={getElementById:()=>null,head:{append(){}},createElement:()=>({})};
  vm.runInNewContext(source,{window,document,location:{hash:''},setTimeout(){}});
  return window.AAFStockSummary;
}
const build=()=>{const api=runtime();return {api,m:api.buildModel(data(),calculate)};};

test('all production totals reconcile each shortage spec once and retain separate sheet/strip quantities',()=>{
  const {api,m}=build(),before=JSON.stringify(m),v=api.buildAllProduction(m);
  assert.equal(v.status,'saved-plan');near(v.byUnit.sheet,22.25);near(v.byUnit.strip,25);
  assert.equal(v.rows.length,5);assert.equal(new Set(v.rows.map(r=>r.key)).size,5);
  for(const unit of ['sheet','strip'])near(v.rows.filter(r=>r.unit===unit).reduce((sum,r)=>sum+r.shortage,0),v.byUnit[unit]);
  for(const r of v.rows)near(r.demand,r.allocated+r.shortage);
  assert.equal(v.fractional,true);assert.equal(JSON.stringify(m),before);
});

test('spare stock in other specs and manual Free cannot offset or increase production demand',()=>{
  const input=data();input.rows[1].freeQty=777;input.rows[1].freeOverride={value:777};
  const api=runtime(),m=api.buildModel(input,calculate),v=api.buildAllProduction(m);
  assert.equal(v.status,'saved-plan');near(v.byUnit.sheet,22.25);
  assert.equal(v.rows.find(r=>r.key==='SYN-short').shortage,5);
  assert.equal(v.rows.some(r=>r.key==='SYN-other-size-spare'),false);
  assert.equal(m.rows.find(r=>r.key==='SYN-other-size-spare').freeQty,777);
});

test('zero Physical demand remains visible and original equivalent/reversed dimensions are preserved',()=>{
  const {api,m}=build(),v=api.buildAllProduction(m);
  const zero=v.rows.find(r=>r.key==='SYN-zero-physical');near(zero.allocated,0);near(zero.shortage,12.25);
  const equivalent=v.rows.find(r=>r.key==='SYN-equivalent-original');assert.deepEqual([equivalent.w,equivalent.l],[1200,2400]);
  const reversed=v.rows.find(r=>r.key==='SYN-reversed-original');assert.deepEqual([reversed.w,reversed.l],[2440,1220]);
  assert.equal(v.rows.some(r=>r.key==='SYN-zero-retained'),false);
});

test('summary is independent of lower historical month, selected thickness, source forecasts and current-sales availability',()=>{
  const {api,m}=build(),baseline=copy(api.buildAllProduction(m));
  m.selectedMonth='1999-01';m.selectedThickness='6';m.currentMonthSold={status:'pending'};m.currentAllocation={status:'pending'};
  m.salesSummary={month:'1999-01',forecast:{qty:1000000},sold:{qty:9000000}};
  const v=api.buildAllProduction(m);assert.deepEqual(copy(v),baseline);
  assert.equal(v.rows.some(r=>r.key==='SYN-forecast-source'),false);
});

test('thickness subtotals reconcile back to both unit totals without double-counting rows',()=>{
  const {api,m}=build(),v=api.buildAllProduction(m);
  assert.equal(new Set(v.thickness.map(r=>String(r.t))).size,v.thickness.length);
  for(const unit of ['sheet','strip'])near(v.thickness.reduce((sum,t)=>sum+t.byUnit[unit],0),v.byUnit[unit]);
  for(const t of v.thickness)for(const unit of ['sheet','strip'])near(t.byUnit[unit],v.rows.filter(r=>Number(r.t)===Number(t.t)&&r.unit===unit).reduce((sum,r)=>sum+r.shortage,0));
});

test('missing, invalid or inconsistent saved evidence is pending rather than a zero shortage',()=>{
  const {api,m}=build();
  const mutations=[
    v=>{delete v.reportDate;},v=>{v.reportDate='2000-02-30';},v=>{v.revision='';},
    v=>{v.rows[1].key=v.rows[0].key;},v=>{v.rows[0].unit='pallet';},v=>{v.rows[0].grade='';},
    v=>{v.rows[0].w=0;},v=>{v.rows[0].reservedProductionQty=NaN;},
    v=>{v.total.byUnit.sheet.reservedProductionQty+=1;},
    v=>{v.total.byUnit.strip.reservedProductionQty+=1;},
    v=>{v.thickness[0][1].byUnit.sheet.reservedProductionQty+=1;},
    v=>{v.thicknessGrades[0][1][0][1].byUnit.sheet.reservedProductionQty+=1;}
  ];
  for(const mutate of mutations){const bad=copy(m);mutate(bad);const v=api.buildAllProduction(bad);assert.equal(v.status,'pending',String(mutate));assert.equal(v.byUnit,null);assert.equal(v.rows.length,0);assert.ok(v.reason);}
  for(const bad of [null,{}, {...m,rows:[]}]){assert.equal(api.buildAllProduction(bad).status,'pending');}
});

test('omitted and duplicate thickness coverage fail closed even when omitted shortages are zero',()=>{
  const {api,m}=build();
  for(const mutate of [
    v=>{v.thickness=v.thickness.filter(([t])=>t!=='1.8');},
    v=>{v.thickness=v.thickness.filter(([t])=>t!=='6');},
    v=>{v.thickness.push(copy(v.thickness[0]));},
    v=>{v.thicknessGrades=v.thicknessGrades.filter(([t])=>t!=='1.8');},
    v=>{v.thicknessGrades.push(copy(v.thicknessGrades[0]));}
  ]){const bad=copy(m);mutate(bad);assert.equal(api.buildAllProduction(bad).status,'pending',String(mutate));}
});

test('sub-cent demand cannot round into zero or become a fabricated production order',()=>{
  const input=data();input.rows[2].committedQty=.001;const api=runtime(),m=api.buildModel(input,calculate);
  const v=api.buildAllProduction(m);assert.equal(v.status,'pending');assert.equal(v.byUnit,null);
});

test('a valid zero-shortage plan is distinguished from missing or invalid data',()=>{
  const input=data();for(const r of input.rows)r.committedQty=Math.min(r.committedQty,r.qty);
  const api=runtime(),m=api.buildModel(input,calculate),v=api.buildAllProduction(m);
  assert.equal(v.status,'saved-plan');assert.deepEqual(copy(v.byUnit),{sheet:0,strip:0});assert.equal(v.rows.length,0);
  const html=api.renderAllProduction(m);assert.match(html,/ไม่มีรายการ|ไม่มียอด|ไม่มีของขาด|ไม่มีสเปก/);assert.doesNotMatch(html,/data-all-production-row/);
});

test('full summary is placed below Aging and before Section02 with complete item rows and unit footers',()=>{
  const {api,m}=build(),html=api.renderHTML(m),panel=api.renderAllProduction(m);
  const aging=html.indexOf('class="ss-aging"'),all=html.indexOf('data-all-production-summary'),sales=html.indexOf('class="ss-sales-block"');
  assert.ok(aging>=0&&all>aging&&sales>all,'Aging → all production → Section02');
  assert.equal((panel.match(/data-all-production-row(?:=|\s|>)/g)||[]).length,5);
  const footer=panel.match(/<tfoot>[\s\S]*?<\/tfoot>/)?.[0];assert.ok(footer,'totals footer');
  assert.match(footer,/data-all-production-unit="sheet"/);assert.match(footer,/data-all-production-unit="strip"/);
  assert.match(footer,/22\.25/);assert.match(footer,/25/);assert.match(panel,/1,200 × 2,400/);assert.match(panel,/2,440 × 1,220/);
  assert.match(panel,/ตามแผนที่บันทึก/);assert.match(panel,/2000-06-02|2543/);assert.match(panel,/รอยืนยัน|ยังรอ/);
});

test('pending summary does not render a partial list or a misleading numeric total',()=>{
  const {api,m}=build();m.total.byUnit.sheet.reservedProductionQty+=1;
  const html=api.renderAllProduction(m);assert.match(html,/รอ|ยังยืนยัน/);assert.doesNotMatch(html,/data-all-production-row|data-all-production-unit/);
});

test('all rendered source labels are escaped and generation does not mutate the canonical model',()=>{
  const input=data();input.rows[2].grade='<img src=x onerror=alert(1)>';
  const api=runtime(),m=api.buildModel(input,calculate),before=JSON.stringify(m),html=api.renderAllProduction(m);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(html,/<img src=x/);
  assert.equal(JSON.stringify(m),before);
});
