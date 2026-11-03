import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),api=require('../stock_order_header.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const row=(key,w,l,t,grade,unit,qty)=>({key,w,l,t,grade,unit,qty,freeQty:qty,committedQty:0});
function rows(){return [
  row('synthetic-normal',1220,2440,2.5,'AAA','sheet',10.5),
  row('synthetic-reversed',2440,1220,5,'B','sheet',4.25),
  row('synthetic-quarter',610,1220,2.5,'A','sheet',8),
  row('synthetic-allocation-only',1200,2400,1.6,'AAA','sheet',2),
  row('synthetic-same-area',610,4880,6,'F','sheet',3),
  row('synthetic-strip',25,2000,3.2,'B','strip',1000),
  row('synthetic-zero',1220,2440,2.5,'F','sheet',0),
  row('synthetic-strings','2440','1220','1.6','A','sheet',1)
];}
const warehouse=source=>api.warehouseProjection({reportDate:'2000-01-01',revision:3,rows:source});
const card=(html,id)=>html.slice(html.indexOf('<div class="ss-kpi ss-kpi-'+id+'"'),id==='free'?undefined:html.indexOf('<div class="ss-kpi ss-kpi-'+({physical:'sold',sold:'reserved',reserved:'free'})[id]+'"'));

test('physical composition conserves raw units, original size area and thickness equivalents without mutating saved rows',()=>{
  const source=rows(),before=JSON.stringify(source),c=api.physicalComposition(source);
  assert.equal(c.status,'verified-quantities');assert.deepEqual(c.quantity,{sheet:28.75,strip:1000});
  assert.equal(c.groups.normal.quantity,15.75);assert.equal(c.groups.nonstandard.quantity,13);assert.equal(c.groups.strip.quantity,1000);
  assert.equal(c.groups.normal.quantity+c.groups.nonstandard.quantity,c.quantity.sheet);
  near(c.eq4x8,source.reduce((n,r)=>n+r.qty*Number(r.w)*Number(r.l)/(1220*2440),0));
  near(c.eq25,source.reduce((n,r)=>n+r.qty*Number(r.w)*Number(r.l)/(1220*2440)*Number(r.t)/2.5,0));
  for(const g of Object.values(c.groups))for(const field of ['quantity','eq4x8','eq25'])near(g[field],g.grades.reduce((n,grade)=>n+grade[field],0)+g.unknownGrade[field]);
  assert.equal(JSON.stringify(source),before);
});
test('normal means exact literal edges either order; area-equal and allocation-equivalent sizes stay nonstandard',()=>{
  for(const edges of [[1220,2440],[2440,1220],['1220.00','2440']]){
    const c=api.physicalComposition([row('synthetic',...edges,2.5,'A','sheet',1)]);assert.equal(c.groups.normal.quantity,1);assert.equal(c.groups.nonstandard.quantity,0);
  }
  for(const edges of [[1200,2400],[2400,1200],[610,4880],[1000,2976.8]]){
    const c=api.physicalComposition([row('synthetic',...edges,2.5,'A','sheet',1)]);assert.equal(c.groups.normal.quantity,0);assert.equal(c.groups.nonstandard.quantity,1);
  }
  const strip=api.physicalComposition([row('synthetic',1220,2440,2.5,'A','strip',1)]);assert.equal(strip.groups.normal.quantity,0);assert.equal(strip.groups.strip.quantity,1);
});
test('only positive grades are listed in fixed grade order, with deterministic unknown grades last',()=>{
  const source=['ZZ','B','A','AAA','AV','F','REJ','C','UN','CTS','YY'].map((grade,i)=>row('synthetic-'+i,610,1220,2.5,grade,'sheet',i+0.125));
  source.push(row('synthetic-zero',610,1220,2.5,'ZERO','sheet',0));
  const c=api.physicalComposition(source);assert.deepEqual(c.groups.nonstandard.grades.map(g=>g.grade),['AV','AAA','A','B','F','REJ','C','UN','CTS','YY','ZZ']);
  assert.equal(c.groups.nonstandard.grades.find(g=>g.grade==='ZZ').quantity,0.125);assert(c.groups.nonstandard.grades.every(g=>g.quantity>0));
});
test('missing legacy grades keep known quantities with explicit incomplete grade coverage, never invented grade zero',()=>{
  const source=[row('synthetic-a',1220,2440,2.5,undefined,'sheet',2.5),row('synthetic-b',610,1220,2.5,'A','sheet',1),row('synthetic-zero',610,1220,2.5,undefined,'sheet',0)];
  const c=api.physicalComposition(source);assert.equal(c.status,'verified-quantities');assert.equal(c.gradesComplete,false);assert.equal(c.groups.normal.unknownGrade.quantity,2.5);assert.deepEqual(c.groups.normal.grades,[]);assert.equal(c.groups.nonstandard.gradesComplete,true);
  const w=warehouse(source),html=card(api.render(null,new Set(),w),'physical');assert.match(html,/ยังไม่ระบุเกรด 2\.5 แผ่น · รอตรวจ/);assert.match(html,/<strong>3\.5<\/strong>/);
});
test('invalid dimensions, quantity, unit, grade type or duplicate provided raw key stay pending without partial numbers',()=>{
  const invalid=[r=>r.qty=-1,r=>r.qty=NaN,r=>r.qty='1',r=>r.unit='boards',r=>r.w='',r=>r.l=true,r=>r.t=0,r=>r.grade={},r=>r.w=Infinity,r=>r.qty=Number.MAX_SAFE_INTEGER+1];
  for(const change of invalid){const source=rows();change(source[1]);const c=api.physicalComposition(source);assert.equal(c.status,'pending');assert.equal(c.groups,undefined);assert.equal(c.quantity,undefined);}
  const duplicate=rows();duplicate.push(copy(duplicate[0]));assert.equal(api.physicalComposition(duplicate).status,'pending');assert.equal(api.physicalComposition([]).status,'pending');
});
test('Physical-only rendering places raw groups before original money, then nested equivalents with explicit units and escaped grade chips',()=>{
  const source=rows();source.push(row('synthetic-html',610,1220,2.5,'<img "x">','sheet',0.125));const w=warehouse(source),before=JSON.stringify(w),plain=copy(w);delete plain.physical.composition;
  const output=api.render(null,new Set(),w),baseline=api.render(null,new Set(),plain),html=card(output,'physical');
  assert(html.indexOf('ss-overview-quantity')<html.indexOf('ss-physical-composition'));assert(html.indexOf('ss-physical-composition')<html.indexOf('ss-overview-value'));assert(html.indexOf('ss-overview-value')<html.indexOf('ss-physical-equivalent-breakdown'));
  assert.match(html,/ในยอดแผ่นรวม/);assert.match(html,/ส่วนย่อยของยอดรวม ไม่บวกเพิ่ม/);assert.match(html,/ไม่ใช่ขนาดปกติ/);assert.match(html,/เกรด: /);assert.match(html,/data-physical-group="normal"/);assert.match(html,/data-physical-group="nonstandard"/);assert.match(html,/data-physical-group="strip"/);
  assert.match(html,/data-physical-equivalent="area"/);assert.match(html,/data-physical-equivalent="volume"/);assert.match(html,/data-grade-quantity-basis="equivalent"/);assert.match(html,/แผ่นเทียบ/);
  assert.match(html,/&lt;img &quot;x&quot;&gt; 0\.125 แผ่น/);assert.doesNotMatch(html,/<img/);assert.match(html,/B 1,000 ชิ้น/);
  for(const id of ['sold','reserved','free'])assert.equal(card(output,id),card(baseline,id));assert.equal(api.sourceText(null,w),api.sourceText(null,plain));assert.equal(JSON.stringify(w),before);
});
test('compact and expanded Physical content stay identical and retain combined equivalents and saved valuation',()=>{
  const source=rows().map(r=>({...r,catalogPrice:2,catalogCurrency:'THB',catalogValue:r.qty*2,catalogFreeValue:r.freeQty*2}));
  const w=api.warehouseProjection({reportDate:'2000-01-01',revision:3,savedCatalog:{catalogRevision:2},rows:source}),a=card(api.render(null,new Set(),w),'physical'),b=card(api.render(null,new Set(['physical']),w),'physical');
  const normalize=html=>html.replace(/ hidden/g,'').replace(/aria-expanded="(?:true|false)"/g,'aria-expanded="STATE"').replace(/(?:ดู|ซ่อน)รายละเอียด/g,'รายละเอียด');assert.equal(normalize(a),normalize(b));
  assert.equal(w.physical.value.equivalentTHB,2057.5);assert.match(a,/2,057\.5/);for(const value of [w.physical.eq4x8,w.physical.eq25])assert(a.includes(value.toLocaleString('th-TH',{maximumFractionDigits:2})));
});
test('small positive fractions never become a zero raw grade and stale composition does not masquerade as a complete breakdown',()=>{
  const w=warehouse([row('synthetic-small',1,1,1,'B','strip',0.004)]),html=card(api.render(null,new Set(),w),'physical');assert.match(html,/B 0\.004 ชิ้น/);assert.match(html,/&lt; 0\.01 แผ่นเทียบ/);
  const changed=copy(w);changed.physical.quantity.strip=1;const pending=card(api.render(null,new Set(),changed),'physical');assert.match(pending,/รายละเอียดขนาดและเกรดยังรอยืนยัน/);assert.doesNotMatch(pending,/data-physical-group=/);
});
