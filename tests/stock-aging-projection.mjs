import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Synthetic data only. Actual company captures stay outside the public repo.
const context={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../stock_aging_projection.js',import.meta.url),'utf8'),context);
const {build}=context.window.AAFStockAgingProjection;
const keys=['d90','d180','d270','d360','dOver'];
const area=1220*2440,day='2026-02-15';
const plain=value=>JSON.parse(JSON.stringify(value));
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(b)),message||`${a} ≈ ${b}`);
const keyOf=r=>`w${Number(r.w)}_l${Number(r.l)}_t${Number(r.t)}_g${r.grade}`;
const row=(options={})=>{
  const r={w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',rawSource:true,retained:false,
    baseQty:10,qty:10,sellableBaseQty:10,movedTo:null,d90:4,d180:3,d270:2,d360:1,dOver:0,
    committedQty:7,freeQty:3,note:'keep synthetic note',followup:'keep synthetic tracking',
    priceObj:{price:123,currency:'THB'},physicalOverride:null,...options};
  return {key:keyOf(r),...r};
};
const source=rows=>({report:{reportDate:day},revision:7,rows});
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
const run=data=>{
  const before=JSON.stringify(data);frozen(data);const result=build(data);
  assert.equal(JSON.stringify(data),before,'projection must not mutate raw, Physical, Free, prices, notes, or reservations');
  return result;
};
const pending=data=>{
  const p=run(data);assert.equal(p.status,'pending');assert.ok(p.reason,'specific pending reason');
  for(const field of ['source','projected','physical','unagedAdjustment'])assert.equal(p[field],null,'invalid evidence must not publish partial totals');
  assert.deepEqual(plain(p.buckets),[]);assert.deepEqual(plain(p.rows),[]);return p;
};

test('unmoved raw source keeps all five buckets and totals on the Physical basis',()=>{
  const p=run(source([row()]));assert.equal(p.status,'verified');
  assert.deepEqual(plain(p.buckets.map(b=>b.sheet.qty)),[4,3,2,1,0]);
  assert.deepEqual(plain(p.buckets.map(b=>b.sheet.eq4x8)),[4,3,2,1,0]);
  assert.deepEqual(plain(p.buckets.map(b=>b.strip.qty)),[0,0,0,0,0]);
  assert.equal(p.projected.sheet.qty,10);assert.equal(p.physical.sheet.qty,10);assert.equal(p.unagedAdjustment.eq4x8,0);
  assert.equal(p.source.eq4x8,10);assert.equal(p.projected.eq4x8,10);assert.equal(p.physical.eq4x8,10);
});

test('1270 to 1260 uses the explicit destination, merges its raw stock once, and preserves original Aging',()=>{
  const dest=row({w:1260,baseQty:8,qty:20,sellableBaseQty:20,d90:1,d180:2,d270:3,d360:2});
  const from=row({w:1270,baseQty:12,qty:0,sellableBaseQty:0,d90:2,d180:3,d270:4,d360:3,movedTo:dest.key});
  const p=run(source([from,dest]));assert.equal(p.status,'verified');
  near(p.source.sheet.eq4x8,(12*1270+8*1260)/1220);
  near(p.projected.sheet.eq4x8,20*1260/1220);
  near(p.physical.eq4x8,p.projected.eq4x8);
  near(p.source.eq4x8-p.projected.eq4x8,12/122);
  const target=p.rows.find(r=>r.key===dest.key);
  assert.deepEqual(plain(target.aging),[3,5,7,5,0]);assert.equal(target.projectedQty,20);
  assert.equal(p.rows.find(r=>r.key===from.key).projectedQty,0);
});

test('reversed destination dimensions are followed exactly rather than creating a second stock pool',()=>{
  const dest=row({w:2440,l:1260,baseQty:0,qty:10,sellableBaseQty:10,rawSource:false,...Object.fromEntries(keys.map(k=>[k,0]))});
  const from=row({w:1270,qty:0,sellableBaseQty:0,movedTo:dest.key});
  const p=run(source([from,dest]));assert.equal(p.status,'verified');near(p.projected.eq4x8,10*1260/1220);
  assert.equal(p.rows.filter(r=>r.projectedQty>0).length,1);
  assert.equal(p.rows.find(r=>r.projectedQty>0).key,dest.key);
});

test('no dimension or grade transfer is guessed without a movedTo link',()=>{
  const original=row({w:1270});
  const other=row({w:1260,rawSource:false,baseQty:0,qty:0,sellableBaseQty:0,...Object.fromEntries(keys.map(k=>[k,0]))});
  const p=run(source([original,other]));assert.equal(p.status,'verified');
  near(p.projected.eq4x8,10*1270/1220);assert.equal(p.rows.find(r=>r.key===other.key).projectedQty,0);
});

test('explicit thickness and grade transfer changes chart grouping but not the original source buckets',()=>{
  const dest=row({t:1.6,grade:'B',baseQty:5,qty:15,sellableBaseQty:15,d90:1,d180:1,d270:1,d360:1,dOver:1});
  const from=row({t:1.8,grade:'A',qty:0,sellableBaseQty:0,movedTo:dest.key});
  const p=run(source([dest,from]));assert.equal(p.status,'verified');
  assert.deepEqual(plain(p.rows.find(r=>r.key===dest.key).aging),[5,4,3,2,1]);
  assert.equal(p.byThickness.find(g=>Number(g.t)===1.6).values.reduce((a,b)=>a+b,0),15);
  assert.equal(p.byThickness.filter(g=>g.values.some(v=>v>0)).length,1);
  assert.equal(p.projected.sheet.qty,15);assert.equal(p.source.sheet.qty,15);
});

test('chained moves carry each raw contribution once, including raw stock already at an intermediate destination',()=>{
  const last=row({w:1260,t:2,baseQty:3,qty:20,sellableBaseQty:20,d90:3,d180:0,d270:0,d360:0});
  const middle=row({w:1260,t:2.1,baseQty:5,qty:0,sellableBaseQty:0,d90:0,d180:5,d270:0,d360:0,movedTo:last.key});
  const first=row({w:1270,t:2.1,baseQty:12,qty:0,sellableBaseQty:0,d90:0,d180:0,d270:12,d360:0,movedTo:middle.key});
  const p=run(source([first,last,middle]));assert.equal(p.status,'verified');
  const target=p.rows.find(r=>r.key===last.key);assert.deepEqual(plain(target.aging),[3,5,12,0,0]);
  assert.equal(target.projectedQty,20);near(p.projected.eq4x8,20*1260/1220);
  assert.equal(new Set(target.sourceKeys).size,3);
  assert.equal(p.byThickness.filter(g=>g.values.some(v=>v>0)).length,1);
});

test('strip pieces stay separate from sheets, while like-for-like area equivalents combine',()=>{
  const strip=row({w:25,l:2000,t:3.2,grade:'B',unit:'strip',baseQty:100,qty:100,sellableBaseQty:100,d90:40,d180:60,d270:0,d360:0});
  const p=run(source([row(),strip]));assert.equal(p.status,'verified');
  assert.equal(p.projected.sheet.qty,10);assert.equal(p.projected.strip.qty,100);
  near(p.projected.strip.eq4x8,100*25*2000/area);near(p.projected.eq4x8,10+100*25*2000/area);
  assert.equal(p.buckets[0].sheet.qty,4);assert.equal(p.buckets[0].strip.qty,40);
  near(p.buckets[0].eq4x8,4+40*25*2000/area);
  assert.equal(p.byThickness.find(g=>Number(g.t)===3.2).stripQty[1],60);
});

test('derived and retained-zero rows cannot inject phantom Aging through stale bucket fields',()=>{
  const dest=row({t:5.5,grade:'F',rawSource:false,baseQty:0,qty:10,sellableBaseQty:10,d90:999,d180:999,d270:999,d360:999,dOver:999});
  const from=row({t:5,grade:'F',qty:0,sellableBaseQty:0,movedTo:dest.key});
  const retained=row({t:6,retained:true,rawSource:false,baseQty:0,qty:0,sellableBaseQty:0,...Object.fromEntries(keys.map(k=>[k,0]))});
  const p=run(source([from,dest,retained]));assert.equal(p.status,'verified');
  assert.equal(p.source.sheet.qty,10);assert.equal(p.projected.sheet.qty,10);
  assert.equal(p.rows.find(r=>r.key===retained.key).projectedQty,0);
  assert.deepEqual(plain(p.rows.find(r=>r.key===dest.key).aging),[4,3,2,1,0]);
});

test('saved positive manual adjustment remains outside the five age buckets',()=>{
  const adjusted=row({qty:13,physicalOverride:{value:13,reportDate:day,at:'2026-02-15T04:00:00Z'}});
  const p=run(source([adjusted]));assert.equal(p.status,'adjusted');
  assert.deepEqual(plain(p.buckets.map(b=>b.sheet.qty)),[4,3,2,1,0]);
  assert.equal(p.projected.sheet.qty,10);assert.equal(p.physical.sheet.qty,13);
  assert.equal(p.unagedAdjustment.sheet.qty,3);near(p.projected.eq4x8+p.unagedAdjustment.eq4x8,p.physical.eq4x8);
});

test('saved negative manual adjustment is signed and not guessed into an age band',()=>{
  const adjusted=row({qty:7,physicalOverride:{value:7,reportDate:day}});
  const p=run(source([adjusted]));assert.equal(p.status,'adjusted');
  assert.equal(p.unagedAdjustment.sheet.qty,-3);assert.equal(p.unagedAdjustment.sheet.eq4x8,-3);
  assert.deepEqual(plain(p.buckets.map(b=>b.sheet.qty)),[4,3,2,1,0]);
  near(p.projected.eq4x8+p.unagedAdjustment.eq4x8,p.physical.eq4x8);
});

test('opposite per-spec adjustments do not disappear because the grand total cancels',()=>{
  const a=row({qty:13,physicalOverride:{value:13,reportDate:day}});
  const b=row({grade:'B',qty:7,physicalOverride:{value:7,reportDate:day}});
  const p=run(source([a,b]));assert.equal(p.status,'adjusted');
  assert.equal(p.unagedAdjustment.sheet.qty,0);assert.equal(p.rows.filter(r=>r.unagedQty!==0).length,2);
});

test('raw source buckets must sum exactly to the raw base quantity',()=>pending(source([row({d90:5})])));
test('a missing raw bucket is unknown and cannot be treated as zero',()=>{
  const r=row();delete r.dOver;pending(source([r]));
});
test('negative, nonfinite and string raw buckets cannot be silently coerced',()=>{
  for(const v of [-1,Infinity,NaN,'4'])pending(source([row({d90:v})]));
});
test('a duplicate source identity blocks projection instead of double-counting',()=>pending(source([row(),row()])));
test('an explicit move with no destination blocks projection',()=>pending(source([row({qty:0,sellableBaseQty:0,movedTo:'missing-spec'})])));
test('self-loop and multi-row move cycles block projection',()=>{
  const a=row();pending(source([{...a,movedTo:a.key}]));
  const b=row({grade:'B'});pending(source([{...a,movedTo:b.key},{...b,movedTo:a.key}]));
});
test('sheet/strip crossing is invalid even if quantities and areas happen to agree',()=>{
  const strip=row({w:25,l:2000,unit:'strip',rawSource:false,baseQty:0,...Object.fromEntries(keys.map(k=>[k,0]))});
  pending(source([row({qty:0,sellableBaseQty:0,movedTo:strip.key}),strip]));
});
test('wrong projected per-spec baseline blocks even when the grand total could balance',()=>{
  pending(source([row({sellableBaseQty:9}),row({grade:'B',sellableBaseQty:11})]));
});
test('missing central post-transfer baseline cannot be inferred from current Physical',()=>{
  const r=row();delete r.sellableBaseQty;pending(source([r]));
});
test('unexplained Physical differences are pending, not fabricated Aging',()=>pending(source([row({qty:11})])));
test('manual adjustment evidence must match Physical and the report date',()=>{
  pending(source([row({qty:11,physicalOverride:{value:12,reportDate:day}})]));
  pending(source([row({qty:11,physicalOverride:{value:11,reportDate:'2026-02-14'}})]));
});
test('unsupported units and invalid dimensions block projection',()=>{
  for(const edit of [{unit:'pallet'},{w:0},{l:-1},{t:NaN},{w:Infinity},{grade:''}])pending(source([row(edit)]));
});
test('nonraw rows cannot invent a raw base quantity',()=>pending(source([row({rawSource:false})])));
test('missing row provenance or invalid movedTo evidence is not guessed',()=>{
  const r=row();delete r.rawSource;pending(source([r]));
  const missingMove=row();delete missingMove.movedTo;pending(source([missingMove]));
  pending(source([row({movedTo:42})]));
});
test('row keys must identify the same dimensions and grade as the row',()=>{
  pending(source([row({key:'w1220_l2440_t2.5_gB'})]));
});
test('invalid raw, projected or Physical quantities stay pending',()=>{
  for(const edit of [{baseQty:NaN},{qty:-1},{qty:'10'},{sellableBaseQty:Infinity}])pending(source([row(edit)]));
});
test('report date and central revision must be verified identities',()=>{
  for(const reportDate of ['2026-02-30','bad-date','2026-2-15'])pending({...source([row()]),report:{reportDate}});
  for(const revision of [-1,1.5,'7',NaN])pending({...source([row()]),revision});
});
test('overflowing area equivalents do not become Infinity on the dashboard',()=>{
  pending(source([row({w:1e300,l:1e300})]));
});
test('an entirely derived catalog has no original mail evidence and cannot prove Aging',()=>{
  pending(source([row({rawSource:false,baseQty:0,qty:0,sellableBaseQty:0,...Object.fromEntries(keys.map(k=>[k,0]))})]));
});
test('empty or missing stock reports remain pending instead of a zero-stock success',()=>{
  pending(source([]));pending({rows:[row()]});pending(null);
});
test('repeated calls are deterministic and do not reapply a move',()=>{
  const target=row({w:1260,rawSource:false,baseQty:0,qty:10,sellableBaseQty:10,...Object.fromEntries(keys.map(k=>[k,0]))});
  const data=source([row({w:1270,qty:0,sellableBaseQty:0,movedTo:target.key}),target]);
  const a=run(data),b=run(data);assert.deepEqual(plain(a),plain(b));assert.equal(a.projected.sheet.qty,10);
});

