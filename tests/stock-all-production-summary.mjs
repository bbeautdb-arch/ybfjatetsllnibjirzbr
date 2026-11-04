import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Only invented rows and amounts. Never copy company stock or sales into tests.
const source=fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8');
const planner=fs.readFileSync(new URL('../stock_production_planner.js',import.meta.url),'utf8');
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
function runtime(header=null){
  const window={...(header?{AAFOrderHeader:header}:{})};
  const document={getElementById:()=>null,head:{append(){}},createElement:()=>({})};
  vm.runInNewContext(planner,{window});
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

test('planning summary is below Aging before Section02 and excludes B/F only from this panel',()=>{
  const {api,m}=build(),html=api.renderHTML(m),panel=api.renderAllProduction(m);
  const aging=html.indexOf('class="ss-aging"'),all=html.indexOf('data-all-production-summary'),sales=html.indexOf('class="ss-sales-block"');
  assert.ok(aging>=0&&all>aging&&sales>all,'Aging → all production → Section02');
  assert.equal((panel.match(/data-all-production-row(?:=|\s|>)/g)||[]).length,1);
  const footer=panel.match(/<tfoot>[\s\S]*?<\/tfoot>/)?.[0];assert.ok(footer,'totals footer');
  assert.match(footer,/data-all-production-unit="sheet"/);assert.doesNotMatch(footer,/data-all-production-unit="strip"/);
  assert.match(panel,/data-all-production-row="SYN-short"/);assert.doesNotMatch(panel,/data-all-production-row="SYN-(zero-physical|strip|equivalent-original|reversed-original)"/);
  assert.match(panel,/ไม่นำเกรด B \/ F/);assert.match(panel,/4 สเปก/);assert.match(panel,/17\.25 แผ่น/);
  const upper=html.slice(html.indexOf('class="ss-groups"'),aging);assert.match(upper,/12\.25/);assert.match(upper,/>F</);assert.match(upper,/>B</);
  assert.equal(api.buildAllProduction(m).rows.length,5,'complete builder remains unfiltered');
  assert.match(panel,/ตามแผนที่บันทึก/);assert.match(panel,/2000-06-02|2543/);assert.match(panel,/รอยืนยัน|ยังรอ/);
});

test('scenario inputs and money use the requested formulas without writes or rounding production days up',()=>{
  const {api,m}=build(),before=JSON.stringify(m),html=api.renderAllProduction(m);
  for(const key of ['woodPricePerTonne','dailyCapacitySheets','fuelPricePerTonne','fuelTonnesPerDay'])assert.match(html,new RegExp('data-production-setting="'+key+'"'));
  assert.match(html,/data-production-total="eq2_5">3\.2/);
  assert.match(html,/data-production-total="woodCost">฿ 88\.59/);
  assert.match(html,/data-production-total="fuelCost">฿ 15\.36/);
  assert.match(html,/data-production-total="totalCost">฿ 103\.95/);
  const doubled=api.renderAllProduction(m,{settings:{woodPricePerTonne:'3100',dailyCapacitySheets:'17500',fuelPricePerTonne:'1050',fuelTonnesPerDay:'80'}});
  assert.match(doubled,/data-production-total="woodCost">฿ 177\.18/);
  const invalid=api.renderAllProduction(m,{settings:{woodPricePerTonne:'',dailyCapacitySheets:'17500',fuelPricePerTonne:'1050',fuelTonnesPerDay:'80'}});
  assert.match(invalid,/กรุณาระบุ/);assert.doesNotMatch(invalid,/data-production-total=/);
  assert.equal(JSON.stringify(m),before);
});

function datedModel(){
  const api=runtime({currentMonthSoldView:()=>null,currentAllocationView:v=>v,warehouseProjection:()=>({})}),m=api.buildModel(data(),calculate);
  const source={page:9,sourceIsLive:false,checksum:'sha256:'+'a'.repeat(64),capturedAt:'2000-06-02T00:00:00Z'},stock={revision:7,reportDate:'2000-06-02',planChecksum:'sha256:'+'b'.repeat(64),planCapturedAt:'2000-06-02T00:00:01Z'};
  m.currentAllocation={status:'verified-allocation',source,stock};
  m.productionLoading={version:1,status:'verified',source,stock,dateBasis:'ETD LOAD',excludedGrades:['B','F'],allShortage:{sheet:22.25,strip:25},excluded:{sheet:17.25,strip:25},totals:{sheet:5,strip:0},byThickness:[{thickness:1.6,unit:'sheet',shortage:5,earliestDate:'2000-06-03',finishBeforeDate:'2000-06-03',datedQuantity:4,missingQuantity:1,invalidQuantity:0,overdueQuantity:4,dates:[{date:'2000-06-03',quantity:2},{date:'2000-06-04',quantity:2}],invalidDateValues:[],specs:[{key:'1.6|AAA|1220|2440|sheet',w:1220,l:2440,t:1.6,grade:'AAA',unit:'sheet',shortage:5,datedQuantity:4,missingQuantity:1,invalidQuantity:0}]}]};
  return {api,m};
}
test('verified matching ETD LOAD dates show the earliest finish-before date and collapsed date details',()=>{
  const {api,m}=datedModel(),d=api.buildProductionDeadlines(m),html=api.renderAllProduction(m);
  assert.equal(d.status,'verified');assert.equal(d.byThickness['1.6'].finishBeforeDate,'2000-06-03');
  assert.match(html,/ก่อน /);assert.match(html,/ETD LOAD/);assert.match(html,/เลยกำหนด/);assert.match(html,/ยังขาดวันโหลด 1 แผ่น/);
  assert.match(html,/<details class="ss-production-dates">/);assert.match(html,/วันโหลดที่พบ/);assert.doesNotMatch(html,/<details class="ss-production-dates" open/);
});
test('stale or mismatched date evidence never blocks cost estimates and never invents a deadline',()=>{
  const {api,m}=datedModel();
  for(const mutate of [v=>v.productionLoading.stock.revision++,v=>v.productionLoading.source.checksum='other',v=>v.productionLoading.byThickness[0].specs[0].shortage++,v=>v.productionLoading.excluded.sheet++,v=>v.productionLoading.byThickness[0].earliestDate='2000-06-04',v=>v.productionLoading.byThickness[0].dates[0].date='2000-02-30',v=>v.currentAllocation.status='pending']){
    const bad=copy(m);mutate(bad);assert.equal(api.buildProductionDeadlines(bad).status,'pending');const html=api.renderAllProduction(bad);assert.match(html,/รอวันโหลด/);assert.match(html,/data-production-total="totalCost">฿ 103\.95/);
  }
});
test('scenario edits stay separate and export snapshots values before asynchronous canvas work',()=>{
  assert.match(source,/root\?\.addEventListener\('input',editProductionSetting\)/);
  assert.match(source,/productionSettings\[input.dataset.productionSetting\]=/);
  assert.match(source,/target.innerHTML=productionResultsHTML\(latest\)/);
  assert.match(source,/capturedProductionContext=\{settings:\{\.\.\.productionSettings\}/);
  assert.match(source,/html\(captured,capturedThickness,capturedProduction,capturedProductionContext\)/);
  assert.match(source,/JSON.stringify\(productionLoading\)===JSON.stringify\(latest.productionLoading\)/);
  assert.match(source,/const planningFocus=root.querySelector\('\[data-production-setting\]:focus'\)/);
});

test('interactive settings repaint results only and survive a full saved-stock rerender',()=>{
  const handlers={},controls=new Map(),result={innerHTML:''};let writes=0,focused=null,lastMarkup='';
  const root={classList:{remove(){},add(){}},addEventListener(type,fn){(handlers[type]??=[]).push(fn);},
    querySelector(selector){if(selector==='.ss-download')return {addEventListener(){}};if(selector==='[data-production-results]')return result;if(selector==='[data-production-setting]:focus')return focused;const key=selector.match(/^\[data-production-setting="([^"]+)"\]$/)?.[1];return key?controls.get(key)||null:null;},
    querySelectorAll(selector){return selector==='[data-production-setting]'?[...controls.values()]:[];},
    set innerHTML(value){writes++;lastMarkup=value;controls.clear();for(const m of value.matchAll(/data-production-setting="([^"]+)" value="([^"]*)"/g)){const input={dataset:{productionSetting:m[1]},value:m[2],validity:{badInput:false},attributes:{},setAttribute(k,v){this.attributes[k]=v;},closest(s){return s==='[data-production-setting]'?this:null;},focus(){focused=this;}};controls.set(m[1],input);}},get innerHTML(){return lastMarkup;}
  };
  const window={},document={getElementById:()=>root,head:{append(){}},createElement:()=>({})};
  vm.runInNewContext(planner,{window});vm.runInNewContext(source,{window,document,location:{hash:''},setTimeout(){}});
  const api=window.AAFStockSummary,inputData=data(),before=JSON.stringify(inputData);api.update(inputData,calculate);const initialWrites=writes;
  const input=controls.get('woodPricePerTonne');input.value='3100';focused=input;for(const fn of handlers.input)fn({target:input});
  assert.equal(writes,initialWrites,'editing one assumption must not replace the whole report or other editors');assert.match(result.innerHTML,/data-production-total="woodCost">฿ 177\.18/);
  input.value='';for(const fn of handlers.input)fn({target:input});assert.match(result.innerHTML,/กรุณาระบุ/);assert.equal(input.attributes['aria-invalid'],'true');assert.doesNotMatch(result.innerHTML,/data-production-total=/);
  input.value='3100';for(const fn of handlers.input)fn({target:input});api.update(inputData,calculate);
  assert.equal(controls.get('woodPricePerTonne').value,'3100');assert.equal(focused,controls.get('woodPricePerTonne'));assert.match(lastMarkup,/data-production-total="woodCost">฿ 177\.18/);assert.equal(JSON.stringify(inputData),before);
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
