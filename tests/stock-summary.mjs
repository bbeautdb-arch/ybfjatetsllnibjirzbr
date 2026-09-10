import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8');
const context={window:{},document:{getElementById:()=>null,createElement:()=>({}),head:{append(){}}}};
vm.runInNewContext(source,context);
const {buildModel,renderHTML}=context.window.AAFStockSummary;
const calculate=(r)=>{const p=r.priceObj;const value=p.price*(p.currency==='USD'?34:1);return{price:p.price,curr:p.currency,eq:r.qty*Number(r.w)*Number(r.l)/2976800*Number(r.t)/2.5,value:r.qty*value,freeValue:r.freeQty*value};};
const row={key:'1220|2440|2.5|AAA',sku:'AAA12202440025',desc:'Test <img src=x onerror=alert(1)>',size:'Normal',w:'1220',l:'2440',t:'2.5',grade:'AAA',qty:80,baseQty:100,committedQty:20,freeQty:75,d90:90,d180:10,d270:0,d360:0,dOver:0,priceObj:{price:2.352,currency:'USD'},followup:'line 1\nline 2 <script>alert(1)</script>',note:'='.repeat(4000),followupAt:'2026-09-08T08:00:00Z',followupBy:'test <b>',physicalOverride:{at:'2026-09-08T07:00:00Z'},freeOverride:{at:'2026-09-08T08:00:00Z'}};
const data={report:{reportDate:'2026-09-08',sourceRowCount:2},rows:[row,{...row,key:'915|1830|1.60|B',sku:'B09151830016',w:'0915',l:'1830',t:'1.60',grade:'B',qty:0,baseQty:0,freeQty:0,committedQty:0,d90:0,d180:0,priceObj:{price:55,currency:'THB'}}],exchangeRate:34,revision:123,updatedAt:'2026-09-08T08:00:00Z',actor:{token:'not-for-report'},permissions:{adjust:true}};
const before=JSON.stringify(data),m=buildModel(data,calculate),html=renderHTML(m);
assert.equal(JSON.stringify(data),before,'no source mutations');
assert.equal(m.rows[0].t,'1.60','numeric thickness sorting');
assert.equal(m.total.qty,80);assert.equal(m.total.freeQty,75,'manual Free must not be recalculated as 60');
assert.equal(m.total.baseQty,100);assert.equal(m.aging.reduce((a,b)=>a+b,0),100,'Aging stays on email baseline');
assert(Math.abs(m.total.value-80*2.352*34)<1e-8);assert(Math.abs(m.total.freeValue-75*2.352*34)<1e-8);
assert.equal(m.total.eq,80);assert.equal(m.grades.length,9);
assert.equal(m.total.eq4x8,80,'4x8 uses saved Physical, not baseline or manually saved Free');
assert.equal((html.match(/เทียบ 4×8<br><small>หนาเดิม/g)||[]).length,2,'both grouped tables show area equivalent');
assert.equal((html.match(/เทียบ 4×8<br><small>หนา 2.5 mm/g)||[]).length,2,'both grouped tables show volume equivalent');
assert.equal((html.match(/<tfoot>/g)||[]).length,2,'both summaries include conversion totals');
const conversionCases=[
  [100,'1220','2440','2.5',100,100],
  [100,'1220','2440','3.2',100,128],
  [100,'610','1220','1.6',25,16],
  [100,'0915','1830','1.60',56.25,36],
  [122,'1270','2440','3.2',127,162.56],
  [0,'610','1220','1.6',0,0]
];
for(const [qty,w,l,t,area,volume] of conversionCases){
  const sample=buildModel({...data,rows:[{...row,qty,w,l,t}]},calculate);
  assert(Math.abs(sample.total.eq4x8-area)<1e-8);
  assert(Math.abs(sample.total.eq-volume)<1e-8);
  assert(Math.abs(sample.grades.find(([g])=>g==='AAA')[1].eq4x8-area)<1e-8);
  assert(Math.abs(sample.thickness[0][1].eq-volume)<1e-8);
}
const mixed=buildModel({...data,rows:[{...row,qty:100,w:'610',l:'1220',t:'1.60'},{...row,key:'other',qty:100,t:'3.2'}]},calculate);
assert.equal(mixed.total.qty,200);assert.equal(mixed.total.eq4x8,125);assert.equal(mixed.total.eq,144);
assert.equal(mixed.grades.find(([g])=>g==='AAA')[1].eq4x8,125);
assert.equal(mixed.grades.find(([g])=>g==='AAA')[1].eq,144);
const fractional=buildModel({...data,rows:[{...row,qty:1,w:'10',l:'10'},{...row,key:'small2',qty:1,w:'10',l:'10'}]},calculate);
assert.equal(fractional.total.eq4x8,200/2976800,'sum full precision before formatting');
assert.throws(()=>buildModel({...data,rows:[{...row,w:'1e308',l:'1e308'}]},calculate));
assert(renderHTML(buildModel({...data,rows:[{...row,w:'1219.2',l:'2438.4'}]},calculate)).includes('1,219.2 × 2,438.4'));
const snapshotText=renderHTML(m);data.rows[0].note='unsaved later change';assert.equal(renderHTML(m),snapshotText,'captured report stays immutable');data.rows[0].note=row.note='='.repeat(4000);
assert(!JSON.stringify(m).includes('not-for-report'));assert(!html.includes('<script>'));
assert(html.includes('&lt;script&gt;'));assert(html.includes('='.repeat(4000)));assert(html.includes('2.352'));
assert.equal((html.match(/class="ss-stock-row"/g)||[]).length,2);
assert(!/data-(?:draft|save|reset|price|currency)=/.test(html));
assert(!/(?:localStorage|sessionStorage)\s*\./.test(source));
assert.throws(()=>buildModel({...data,rows:[{...row,qty:NaN}]},calculate));
assert.throws(()=>buildModel({...data,rows:[{...row,freeQty:-1}]},calculate));
assert.throws(()=>buildModel({...data,rows:[{...row,w:'invalid'}]},calculate));
assert.throws(()=>buildModel({...data,report:null},calculate));
const bulk=buildModel({...data,rows:Array.from({length:107},(_,i)=>({...row,key:String(i),note:i===106?'LAST ROW NOTE':''}))},calculate);
const bulkHTML=renderHTML(bulk);
assert.equal((bulkHTML.match(/class="ss-stock-row"/g)||[]).length,107);assert(bulkHTML.includes('LAST ROW NOTE'));assert(bulkHTML.includes('107 / 107'));
console.log('Stock summary checks passed: totals, manual Free, saved-state isolation, XSS, all 107 rows.');
