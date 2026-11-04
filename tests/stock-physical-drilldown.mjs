import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),api=require('../stock_order_header.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const row=(key,w,l,t,grade,unit,qty,freeQty=qty)=>({key,w,l,t,grade,unit,qty,freeQty,committedQty:0});
const grade=(c,kind,name)=>c.groups[kind].grades.find(g=>g.grade===name);
const warehouse=rows=>api.warehouseProjection({reportDate:'2030-06-01',revision:7,rows});
const card=(html,id)=>html.slice(html.indexOf('<div class="ss-kpi ss-kpi-'+id+'"'),id==='free'?undefined:html.indexOf('<div class="ss-kpi ss-kpi-'+({physical:'sold',sold:'reserved',reserved:'free'})[id]+'"'));
const details=html=>[...html.matchAll(/<details\b[^>]*class="[^"]*\bss-physical-grade-detail\b[^"]*"[^>]*>[\s\S]*?<\/details>/g)].map(m=>m[0]);
function fixture(){return [
  row('synthetic-normal-a',1220,2440,2.5,'AAA','sheet',10.5,4.25),
  row('synthetic-normal-reverse',2440,1220,'2.50','AAA','sheet',2.25,1.5),
  row('synthetic-normal-thin',1220,2440,'1.60','AAA','sheet',3,0),
  row('synthetic-normal-thick',1220,2440,10,'AAA','sheet',1,2),
  row('synthetic-quarter',610,1220,2.5,'A','sheet',8,5),
  row('synthetic-quarter-reverse',1220,610,2.5,'A','sheet',0.125,0.004),
  row('synthetic-near',1200,2400,2.5,'AAA','sheet',2,1),
  row('synthetic-strip',25,2000,3.2,'B','strip',100,65),
  row('synthetic-strip-reverse',2000,25,3.2,'B','strip',20,10),
  row('synthetic-retained-zero',1220,2440,6,'F','sheet',0,4),
  row('synthetic-zero-alias',2440,1220,2.5,'AAA','sheet',0,9)
];}

test('grade items merge exact reversed edges only, sort thickness numerically, and conserve Physical and saved Free',()=>{
  const rows=fixture(),before=JSON.stringify(rows),c=api.physicalComposition(rows);
  assert.equal(c.status,'verified-quantities');
  assert.deepEqual(grade(c,'normal','AAA').items,[
    {w:1220,l:2440,t:1.6,unit:'sheet',quantity:3,freeQty:0,rowCount:1},
    {w:1220,l:2440,t:2.5,unit:'sheet',quantity:12.75,freeQty:14.75,rowCount:3},
    {w:1220,l:2440,t:10,unit:'sheet',quantity:1,freeQty:2,rowCount:1}
  ]);
  assert.deepEqual(grade(c,'nonstandard','A').items,[{w:610,l:1220,t:2.5,unit:'sheet',quantity:8.125,freeQty:5.004,rowCount:2}]);
  for(const group of Object.values(c.groups))for(const g of group.grades){
    near(g.quantity,g.items.reduce((sum,item)=>sum+item.quantity,0));
    assert(g.items.every(item=>item.quantity>=0&&Number.isInteger(item.rowCount)&&item.rowCount>0));
  }
  for(const unit of ['sheet','strip'])near(c.savedFreeQuantity[unit],rows.filter(r=>r.unit===unit).reduce((sum,r)=>sum+r.freeQty,0));
  assert.equal(JSON.stringify(rows),before);
});

test('1200×2400, equal-area nonstandard sizes, thicknesses, grades and sheet/strip units never merge',()=>{
  const rows=[row('synthetic-literal',1220,2440,2.5,'A','sheet',10,8),row('synthetic-near',1200,2400,2.5,'A','sheet',4,3),row('synthetic-area',610,4880,2.5,'A','sheet',2,1),row('synthetic-thickness',1200,2400,3.2,'A','sheet',5,2),row('synthetic-grade',1200,2400,2.5,'B','sheet',6,4),row('synthetic-strip',1220,2440,2.5,'A','strip',7,6)],c=api.physicalComposition(rows);
  assert.equal(grade(c,'normal','A').items.length,1);assert.equal(grade(c,'nonstandard','A').items.length,3);assert.equal(grade(c,'nonstandard','B').items.length,1);
  assert.deepEqual(grade(c,'strip','A').items,[{w:1220,l:2440,t:2.5,unit:'strip',quantity:7,freeQty:6,rowCount:1}]);
  assert.equal(c.quantity.sheet,27);assert.equal(c.quantity.strip,7);
});

test('Free is the saved value, including manual values above Physical, never recalculated or clamped',()=>{
  const rows=[{...row('synthetic-manual',610,1220,2.5,'A','sheet',2.125,6.25),committedQty:900},row('synthetic-reverse',1220,610,2.5,'A','sheet',0.125,1.125)];
  const before=JSON.stringify(rows),c=api.physicalComposition(rows),item=grade(c,'nonstandard','A').items[0];
  assert.equal(item.quantity,2.25);assert.equal(item.freeQty,7.375);assert.equal(item.rowCount,2);assert.equal(c.savedFreeQuantity.sheet,7.375);assert.equal(JSON.stringify(rows),before);
});

test('one absent or invalid Free makes that exact item and unit total unknown, not zero or a partial sum',()=>{
  for(const bad of [undefined,null,-1,NaN,Infinity,'4',true,{},Number.MAX_SAFE_INTEGER+1]){
    const rows=[row('synthetic-known',610,1220,2.5,'A','sheet',2,1),{...row('synthetic-missing',1220,610,2.5,'A','sheet',3,2),freeQty:bad},row('synthetic-other',610,1220,3.2,'A','sheet',4,3),row('synthetic-strip',25,2000,3.2,'B','strip',5,2)];
    if(bad===undefined)delete rows[1].freeQty;
    const c=api.physicalComposition(rows);assert.equal(c.status,'verified-quantities');
    const items=grade(c,'nonstandard','A').items;assert.equal(items[0].quantity,5);assert.equal(items[0].freeQty,null);assert.equal(items[0].rowCount,2);assert.equal(items[1].freeQty,3);
    assert.equal(c.savedFreeQuantity.sheet,null);assert.equal(c.savedFreeQuantity.strip,2);
  }
});

test('zero Physical items and manual positive Free remain visible; only all-zero grades are omitted',()=>{
  const rows=[row('synthetic-positive',1220,2440,2.5,'A','sheet',1,0),row('synthetic-zero-spec',1220,2440,3.2,'A','sheet',0,0),row('synthetic-zero-alias',2440,1220,2.5,'A','sheet',0,3),row('synthetic-free-only',1220,2440,2.5,'F','sheet',0,4),row('synthetic-all-zero',1220,2440,2.5,'CTS','sheet',0,0)],c=api.physicalComposition(rows);
  assert.deepEqual(c.groups.normal.grades.map(g=>g.grade),['A','F']);
  assert.deepEqual(grade(c,'normal','A').items,[{w:1220,l:2440,t:2.5,unit:'sheet',quantity:1,freeQty:3,rowCount:2},{w:1220,l:2440,t:3.2,unit:'sheet',quantity:0,freeQty:0,rowCount:1}]);
  assert.deepEqual(grade(c,'normal','F').items,[{w:1220,l:2440,t:2.5,unit:'sheet',quantity:0,freeQty:4,rowCount:1}]);
  assert.equal(c.savedFreeQuantity.sheet,7);
  const html=card(api.render(null,new Set(),warehouse(rows)),'physical');assert(details(html).some(panel=>/data-physical-grade="F"/.test(panel)));assert(!details(html).some(panel=>/data-physical-grade="CTS"/.test(panel)));
});

test('malformed Physical evidence or duplicate raw keys stays pending instead of rendering partial totals',()=>{
  for(const change of [r=>r.qty=-1,r=>r.qty=NaN,r=>r.qty='2',r=>r.unit='boards',r=>r.w='',r=>r.t=0,r=>r.grade={},r=>r.l=Infinity]){const rows=fixture();change(rows[0]);const c=api.physicalComposition(rows);assert.equal(c.status,'pending');assert.equal(c.groups,undefined);}
  const rows=fixture();rows.push(copy(rows[0]));assert.equal(api.physicalComposition(rows).status,'pending');
});

test('raw grades use native closed details with exact item quantities and saved Free; equivalent grades stay plain',()=>{
  const w=warehouse(fixture()),html=card(api.render(null,new Set(),w),'physical'),panels=details(html);
  const count=Object.values(w.physical.composition.groups).reduce((sum,g)=>sum+g.grades.length,0);
  // Compact and expanded outer-card copies contain identical native details,
  // with no duplicated IDs; summary owns synchronizing their open state.
  assert.equal(panels.length,count*2);assert.deepEqual(panels.slice(0,count),panels.slice(count));assert(panels.every(panel=>!/^<details\b[^>]*\sopen(?:\s|=|>)/.test(panel)));assert(panels.every(panel=>/<summary\b[^>]*>[\s\S]*?<\/summary>/.test(panel)));assert(panels.every(panel=>!/<[^>]+\sid=/.test(panel)));
  const raw=html.slice(html.indexOf('ss-physical-composition'),html.indexOf('ss-overview-value')),equivalent=[...html.matchAll(/<small\b[^>]*data-grade-quantity-basis="equivalent"[^>]*>[\s\S]*?<\/small>/g)].map(m=>m[0]);
  assert.match(raw,/data-physical-item/);assert.match(raw,/Physical|สต๊อก/);assert.match(raw,/Free\s*ที่บันทึก/);assert.match(raw,/12\.75/);assert.match(raw,/14\.75/);assert.match(raw,/8\.125/);assert.match(raw,/5\.004/);assert.match(raw,/ชิ้น/);
  assert(equivalent.length>0);assert(equivalent.every(block=>!/<details|data-physical-item/.test(block)));assert.doesNotMatch(raw,/<(?:input|textarea|select|form)\b/);
});

test('unknown Free shows รอยืนยัน while known zero and tiny positive fractions are retained',()=>{
  const rows=[row('synthetic-small',610,1220,2.5,'A','sheet',0.004,0.002),row('synthetic-zero-free',610,1220,3.2,'A','sheet',1,0),row('synthetic-missing-free',610,1220,4.5,'A','sheet',2,1)],w=warehouse(rows);
  const known=details(card(api.render(null,new Set(),w),'physical'))[0];assert.match(known,/0\.004/);assert.match(known,/0\.002/);
  const source=copy(rows);delete source[2].freeQty;w.physical.composition={...api.physicalComposition(source),stockReportDate:w.stockReportDate,stockRevision:w.stockRevision};
  const panel=details(card(api.render(null,new Set(),w),'physical'))[0];assert.match(panel,/รอยืนยัน/);assert.match(panel,/0\.004/);
  assert.equal(grade(w.physical.composition,'nonstandard','A').items[1].freeQty,0);assert.equal(grade(w.physical.composition,'nonstandard','A').items[2].freeQty,null);
});

test('same Physical with stale saved Free cannot display old item Free as current verified quantities',()=>{
  const rows=[row('synthetic-a',610,1220,2.5,'A','sheet',10,4.75),row('synthetic-b',1220,2440,3.2,'B','sheet',6,3.25),row('synthetic-strip',25,2000,3.2,'B','strip',8,2.75)],w=warehouse(rows);
  const changed=copy(w);changed.free.quantity.sheet+=1;
  const html=card(api.render(null,new Set(),changed),'physical'),panels=details(html);assert.equal(panels.length,6);
  assert(panels.every(panel=>/รอยืนยัน/.test(panel)));assert(panels.every(panel=>[...panel.matchAll(/<b\b[^>]*data-item-free[^>]*>([\s\S]*?)<\/b>/g)].every(m=>m[1]==='รอยืนยัน')));
  assert.match(html,/data-physical-group="normal"/);assert.match(html,/data-physical-group="nonstandard"/);assert.equal(changed.physical.quantity.sheet,w.physical.quantity.sheet);
});

test('same totals with a mismatched or missing report/revision identity leave every item Free pending',()=>{
  const original=warehouse(fixture());
  for(const mutate of [c=>c.stockReportDate='2030-05-31',c=>c.stockRevision=6,c=>delete c.stockReportDate,c=>delete c.stockRevision]){
    const w=copy(original);mutate(w.physical.composition);
    const html=card(api.render(null,new Set(),w),'physical'),panels=details(html),freeCells=[...html.matchAll(/<b\b[^>]*data-item-free[^>]*>([\s\S]*?)<\/b>/g)];
    assert(panels.length>0);assert(freeCells.length>0);assert(freeCells.every(m=>m[1]==='รอยืนยัน'));
    assert.match(html,/data-item-physical>12\.75<\/b>/);assert.deepEqual(w.physical.quantity,original.physical.quantity);assert.deepEqual(w.free.quantity,original.free.quantity);
  }
});

test('tampered leaf Free cannot pass unchanged composition and warehouse Free totals',()=>{
  const original=warehouse(fixture());
  for(const mutate of [item=>item.freeQty+=0.25,item=>item.freeQty=null,item=>item.freeQty='4.25']){
    const w=copy(original);mutate(grade(w.physical.composition,'normal','AAA').items[0]);
    const html=card(api.render(null,new Set(),w),'physical'),freeCells=[...html.matchAll(/<b\b[^>]*data-item-free[^>]*>([\s\S]*?)<\/b>/g)];
    assert(freeCells.length>0);assert(freeCells.every(m=>m[1]==='รอยืนยัน'));assert.match(html,/data-item-physical>12\.75<\/b>/);
    assert.deepEqual(w.physical.composition.savedFreeQuantity,original.physical.composition.savedFreeQuantity);assert.deepEqual(w.free.quantity,original.free.quantity);
  }
});

test('untrusted grade text is escaped in detail attributes and summary with no executable markup',()=>{
  const name='<img src=x onerror="SYNTHETIC">',w=warehouse([row('synthetic-escape',610,1220,2.5,name,'sheet',0.125,0.025)]),html=card(api.render(null,new Set(),w),'physical');
  assert.match(html,/data-physical-grade="&lt;img src=x onerror=&quot;SYNTHETIC&quot;&gt;"/);assert.match(html,/&lt;img src=x onerror=&quot;SYNTHETIC&quot;&gt; 0\.125 แผ่น/);assert.doesNotMatch(html,/<img\b|<script\b|\sonerror="/);
});

test('only Physical detail changes: other cards, valuation, source text and saved rows stay unchanged',()=>{
  const rows=fixture().map(r=>({...r,catalogPrice:2,catalogCurrency:'THB',catalogValue:r.qty*2,catalogFreeValue:r.freeQty*2})),w=api.warehouseProjection({reportDate:'2030-06-01',revision:7,savedCatalog:{catalogRevision:2},rows}),before=JSON.stringify({rows,w}),plain=copy(w);delete plain.physical.composition;
  const enriched=api.render(null,new Set(),w),baseline=api.render(null,new Set(),plain);for(const id of ['sold','reserved','free'])assert.equal(card(enriched,id),card(baseline,id));
  assert.equal(api.sourceText(null,w),api.sourceText(null,plain));assert.equal(w.physical.value.equivalentTHB,rows.reduce((sum,r)=>sum+r.qty*2,0));assert.equal(w.free.value.equivalentTHB,rows.reduce((sum,r)=>sum+r.freeQty*2,0));assert.equal(JSON.stringify({rows,w}),before);
});

test('synthetic multi-spec combinations preserve exact grade/item quantities, units and saved Free conservation',()=>{
  for(let round=0;round<40;round++){
    const rows=[];for(let i=0;i<12;i++){const edges=i%3===0?[1220,2440]:i%3===1?[610,1220]:[1200,2400];rows.push(row('synthetic-'+round+'-'+i,...((round+i)%2===0?edges.toReversed():edges),[1.6,2.5,3.2,10][i%4],['AAA','B'][i%2],i%5===0?'strip':'sheet',(round+i+1)/8,(round+i+3)/16));}
    const c=api.physicalComposition(rows);assert.equal(c.status,'verified-quantities');
    for(const [kind,g]of Object.entries(c.groups))for(const entry of g.grades){const matching=rows.filter(r=>r.grade===entry.grade&&(r.unit==='strip'?'strip':Math.min(r.w,r.l)===1220&&Math.max(r.w,r.l)===2440?'normal':'nonstandard')===kind);near(entry.items.reduce((sum,item)=>sum+item.quantity,0),matching.reduce((sum,r)=>sum+r.qty,0));near(entry.items.reduce((sum,item)=>sum+item.freeQty,0),matching.reduce((sum,r)=>sum+r.freeQty,0));assert.equal(entry.items.reduce((sum,item)=>sum+item.rowCount,0),matching.length);}
  }
});
