import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Synthetic data only: no company orders, customers, prices or inventory.
const source=fs.readFileSync(new URL('../stock_production_planner.js',import.meta.url),'utf8');
const runtime=()=>{const window={};vm.runInNewContext(source,{window});return window.AAFProductionPlanner;};
const copy=v=>JSON.parse(JSON.stringify(v));
const near=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(1,Math.abs(a),Math.abs(b))*1e-10,`${a} != ${b}`);
const row=(key,more={})=>({key,w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',demand:120,allocated:20,shortage:100,...more});
const view=(rows=[row('SYN-sheet')])=>({status:'saved-plan',rows,byUnit:rows.reduce((sum,r)=>(sum[r.unit]+=r.shortage,sum),{sheet:0,strip:0})});

test('defaults and fixed conversion follow the owner estimate without rounding production days',()=>{
  const api=runtime(),v=api.build(view()),m=v.rows[0].metrics;
  assert.equal(v.status,'estimated');assert.deepEqual(copy(api.defaults),{woodPricePerTonne:1550,dailyCapacitySheets:17500,fuelPricePerTonne:1050,fuelTonnesPerDay:80});
  near(m.eq2_5,100);near(m.productTonnes,.729);near(m.woodTonnes,1.78605);near(m.woodCost,2768.3775);
  near(m.productionDays,100/17500);near(m.fuelTonnes,100/17500*80);near(m.fuelCost,480);near(m.totalCost,3248.3775);
  assert.ok(m.productionDays<1);assert.deepEqual(copy(v.totals),copy(m));
});

test('B and F are excluded only from this derived plan, retaining excluded quantity and original input',()=>{
  const input=view([row('SYN-AAA'),row('SYN-B',{grade:'B'}),row('SYN-F',{grade:' F ',unit:'strip',w:25,l:1000}),row('SYN-A',{grade:'A'})]);
  const before=JSON.stringify(input),v=runtime().build(input);
  assert.equal(v.status,'estimated');assert.deepEqual(copy(v.rows.map(r=>r.key)),['SYN-AAA','SYN-A']);
  assert.equal(v.excluded.count,2);assert.deepEqual(copy(v.excluded.byUnit),{sheet:100,strip:100});
  assert.deepEqual(copy(v.byUnit),{sheet:200,strip:0});assert.deepEqual(copy(v.sourceByUnit),{sheet:300,strip:100});
  assert.equal(JSON.stringify(input),before);assert.equal(input.rows.length,4);
});

test('exact source size and thickness determine 2.5 equivalents; reversed axes are symmetrical',()=>{
  const api=runtime();
  for(const r of [row('SYN-quarter',{w:610,l:1220,t:5}),row('SYN-reversed',{w:1220,l:610,t:5})])near(api.build(view([r])).totals.eq2_5,50);
  near(api.build(view([row('SYN-allocation-exception',{w:1200,l:2400})])).totals.eq2_5,100*1200*2400/(1220*2440));
});

test('editable prices and capacity affect costs/days only, not shortages or equivalence',()=>{
  const api=runtime(),input=view(),before=JSON.stringify(input),a=api.build(input),b=api.build(input,{woodPricePerTonne:'2000',dailyCapacitySheets:'10000',fuelPricePerTonne:'100',fuelTonnesPerDay:'10'});
  near(b.totals.eq2_5,a.totals.eq2_5);near(b.totals.woodTonnes,a.totals.woodTonnes);near(b.totals.woodCost,3572.1);
  near(b.totals.productionDays,.01);near(b.totals.fuelTonnes,.1);near(b.totals.fuelCost,10);near(b.totals.totalCost,3582.1);
  assert.equal(JSON.stringify(input),before);assert.equal(b.rows[0].shortage,100);
});

test('blank, null, nonfinite and negative settings do not silently become zero or defaults',()=>{
  const api=runtime();
  for(const field of Object.keys(api.defaults))for(const value of ['', '   ',null,NaN,Infinity,-1,{},true,'oops']){
    const v=api.build(view(),{[field]:value});assert.equal(v.status,'pending',`${field}/${value}`);assert.equal(v.totals,null);assert.equal(v.invalidField,field);
  }
  assert.equal(api.build(view(),{dailyCapacitySheets:0}).status,'pending');
  const zero=api.build(view(),{woodPricePerTonne:0,fuelPricePerTonne:0,fuelTonnesPerDay:0});assert.equal(zero.status,'estimated');near(zero.totals.totalCost,0);
});

test('included strips remain separate and prevent a partial estimate from being labelled a grand total',()=>{
  const v=runtime().build(view([row('SYN-sheet'),row('SYN-strip',{unit:'strip',grade:'A',w:25,l:1000})]));
  assert.equal(v.status,'partial');assert.equal(v.totals,null);assert.equal(v.pendingStripCount,1);
  assert.deepEqual(copy(v.byUnit),{sheet:100,strip:100});near(v.sheetTotals.eq2_5,100);
  assert.equal(v.rows[1].metrics,null);assert.equal(v.rows[1].estimateStatus,'pending-strip-basis');assert.equal(v.thickness[0].totals,null);
});

test('all filtered or genuinely empty plans are true zero estimates, distinct from missing source',()=>{
  const api=runtime();
  for(const input of [view([]),view([row('SYN-B',{grade:'B'}),row('SYN-F',{grade:'F'})])]){
    const v=api.build(input);assert.equal(v.status,'estimated');assert.equal(v.rows.length,0);near(v.totals.eq2_5,0);near(v.totals.totalCost,0);
  }
  for(const input of [null,{}, {status:'pending',reason:'Missing verified source'}]){const v=api.build(input);assert.equal(v.status,'pending');assert.equal(v.totals,null);}
});

test('invalid source input or reconciliation fails closed, even in a grade that would be excluded',()=>{
  const api=runtime();
  const changes=[v=>{v.byUnit.sheet+=1;},v=>{v.rows.push(copy(v.rows[0]));v.byUnit.sheet*=2;},v=>{v.rows[0].shortage=-1;},v=>{v.rows[0].shortage=0;},v=>{v.rows[0].allocated=99;},v=>{v.rows[0].w=0;},v=>{v.rows[0].t=NaN;},v=>{v.rows[0].unit='pallet';},v=>{v.rows[0].grade='';},v=>{v.rows[0].grade='B';v.rows[0].demand=NaN;}];
  for(const change of changes){const input=view();change(input);const v=api.build(input);assert.equal(v.status,'pending',String(change));assert.equal(v.totals,null);assert.equal(v.rows.length,0);}
});

test('overflow fails closed instead of rendering Infinity',()=>{
  const input=view([row('SYN-huge',{w:1e308,l:1e308})]);assert.equal(runtime().build(input).status,'pending');
});

test('thickness groups and full totals reconcile unrounded metrics across all included rows',()=>{
  const api=runtime(),input=view([row('SYN-1',{t:1.6}),row('SYN-2',{t:3.2,w:610,l:1220}),row('SYN-3',{t:1.6,grade:'A',demand:20.25,allocated:20,shortage:.25})]),v=api.build(input);
  assert.equal(v.thickness.length,2);assert.equal(v.fractional,true);
  for(const field of api.metricFields){near(v.rows.reduce((n,r)=>n+r.metrics[field],0),v.totals[field]);near(v.thickness.reduce((n,r)=>n+r.totals[field],0),v.totals[field]);}
  near(v.byUnit.sheet,200.25);
});

test('deadline data is supplied separately by thickness and is not inferred or shared by reference',()=>{
  const api=runtime(),input=view([row('SYN-1',{t:1.6}),row('SYN-2',{t:2.5})]),deadlines={byThickness:{'1.6':{status:'verified',loadingDate:'2000-06-15',finishBefore:'2000-06-15',sourceCapturedAt:'2000-06-02T10:00:00Z'}}},before=JSON.stringify(deadlines);
  const v=api.build(input,{},deadlines);assert.equal(v.rows[0].deadline.loadingDate,'2000-06-15');assert.equal(v.rows[1].deadline,null);assert.equal(JSON.stringify(deadlines),before);
  v.rows[0].deadline.loadingDate='2000-06-30';assert.equal(deadlines.byThickness['1.6'].loadingDate,'2000-06-15');
  assert.equal(v.thickness[0].deadline.loadingDate,'2000-06-15');
});
