import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {LIMITS,canonicalKey,parseWorkbook,buildPlan}=require('../stock_notes_import.js');
const letters=c=>{let s='';do{s=String.fromCharCode(65+c%26)+s;c=Math.floor(c/26)-1;}while(c>=0);return s;};
const parseCell=s=>{const m=/^([A-Z]+)(\d+)$/.exec(s);if(!m)throw Error('cell');return {r:Number(m[2])-1,c:[...m[1]].reduce((a,x)=>a*26+x.charCodeAt(0)-64,0)-1};};
const XLSX={utils:{encode_cell:({r,c})=>letters(c)+(r+1),decode_range:s=>{const a=s.split(':');return {s:parseCell(a[0]),e:parseCell(a[1]||a[0])};}}};
const h=['SKU','กว้าง (mm)','ยาว (mm)','หนา (mm)','เกรด','หน่วย','หมายเหตุสเปกในชุดราคา','หมายเหตุความหนาเดิม'];
function workbook(rows,headers=h,name='สต๊อกทุกสเปก'){
  const ws={'!ref':'A1:'+letters(headers.length-1)+(rows.length+1)};
  [headers,...rows].forEach((row,r)=>row.forEach((v,c)=>{if(v!==null&&v!==undefined)ws[letters(c)+(r+1)]=typeof v==='object'?v:{v,t:typeof v==='number'?'n':'s'};}));
  return {SheetNames:[name],Sheets:{[name]:ws}};
}
const product=(overrides={})=>({w:100,l:200,t:2,grade:'A',unit:'sheet',sku:'SYNTH-A',...overrides});
const record=(overrides={})=>({...product(),note:'หมายเหตุทดสอบ 🪵',sourceRow:2,sheet:'สต๊อกทุกสเปก',...overrides});
const row=(note='หมายเหตุใหม่')=>['SYNTH-A',100,200,2,'A','แผ่น',note,'หมายเหตุความหนา'];
test('semantic headers read AD by default even moved; AE requires explicit selection',()=>{
  const wb=workbook([row()]),before=JSON.stringify(wb),a=parseWorkbook(wb,XLSX),b=parseWorkbook(wb,XLSX,{column:'AE'});
  assert.equal(a.records[0].note,'หมายเหตุใหม่');assert.equal(b.records[0].note,'หมายเหตุความหนา');assert.equal(a.issues.length,0);assert.equal(JSON.stringify(wb),before);
  assert.equal(a.records[0].sourceRow,2);assert.equal(a.records[0].unit,'sheet');
});
test('dedicated notes sheet, Unicode, multiline, numeric note and export strip unit supported',()=>{
  const wb=workbook([['SYNTH-S',25,200,3.2,'B','ชิ้น strip','คำว่า <script>\n🪵'],['SYNTH-A',100,200,2,'A','แผ่น',123]],h.slice(0,7).map(v=>v==='หมายเหตุสเปกในชุดราคา'?'หมายเหตุสินค้า':v),'หมายเหตุสินค้า');
  const p=parseWorkbook(wb,XLSX);assert.equal(p.records[0].note,'คำว่า <script>\n🪵');assert.equal(p.records[0].unit,'strip');assert.equal(p.records[1].note,'123');assert.equal(p.issues.length,0);
});
test('blank cells mean no change; missing column and missing unit fail closed',()=>{
  const a=parseWorkbook(workbook([row('  '),row(null)]),XLSX);assert.equal(a.records.length,0);assert.equal(a.counts.blankRows,2);
  const wb=workbook([row()]);delete wb.Sheets['สต๊อกทุกสเปก'].F2;const b=parseWorkbook(wb,XLSX);assert.equal(b.issues[0].code,'spec');
  assert.equal(parseWorkbook(workbook([row()],h.map(x=>x==='หมายเหตุสเปกในชุดราคา'?'other':x)),XLSX).issues[0].code,'headers');
});
test('formula and error notes rejected without using cached results; formula identity rejected',()=>{
  for(const cell of [{v:'cached',f:'A1',t:'s'},{v:'cached',F:'G2:G3',t:'s'},{v:'#REF!',t:'e'}]){
    const p=parseWorkbook(workbook([row(cell)]),XLSX);assert.equal(p.records.length,0);assert.equal(p.issues.length,1);
  }
  const wb=workbook([row()]);wb.Sheets['สต๊อกทุกสเปก'].B2={v:100,f:'1*100',t:'n'};assert.equal(parseWorkbook(wb,XLSX).issues[0].code,'identity-formula');
  assert.equal(parseWorkbook(workbook([row('=literal text')]),XLSX).records[0].note,'=literal text');
});
test('duplicate/ambiguous headers, unknown sheet, and excessive bounds fail closed',()=>{
  assert.equal(parseWorkbook(workbook([row()],h.concat('หมายเหตุ')),XLSX).issues[0].code,'headers-duplicate');
  assert.equal(parseWorkbook(workbook([row()],h,'not a stock sheet'),XLSX).issues[0].code,'sheet-name');
  const wb=workbook([row()]);wb.Sheets['สต๊อกทุกสเปก']['!ref']='A1:XFD1048576';assert.equal(parseWorkbook(wb,XLSX).issues[0].code,'range-limit');
  assert.equal(parseWorkbook(workbook([row('x'.repeat(LIMITS.maxNoteChars+1))]),XLSX).issues[0].code,'note-limit');
});
test('exact spec key permits reverse axes, decimal normalization, but no allocation aliases',()=>{
  assert.equal(canonicalKey(product({w:'0200',l:'0100',t:'2.00',grade:'a'})),'2|A|100|200|sheet');
  const a=record({w:1200,l:2400}),p=buildPlan([a],[product({w:1220,l:2440})],{});assert.equal(p.canApply,false);assert.equal(p.issues[0].code,'unmatched');
  for(const r of [record({t:1.8}),record({grade:'B'}),record({unit:'strip'})])assert.equal(buildPlan([r],[product()],{}).canApply,false);
});
test('append preserves existing text, ignores all unrelated values and never mutates inputs',()=>{
  const records=[record({qty:999,price:42,currency:'USD',committedQty:900})],current=[product({qty:100,price:7,freeQty:50})],existing={'2|A|100|200|sheet':'หมายเหตุเดิม'};
  const before=JSON.stringify({records,current,existing}),p=buildPlan(records,current,existing);
  assert.equal(p.canApply,true);assert.equal(p.changes[0].after,'หมายเหตุเดิม\nหมายเหตุทดสอบ 🪵');assert.equal(p.changes[0].before,'หมายเหตุเดิม');
  assert.equal(JSON.stringify({records,current,existing}),before);assert.deepEqual(Object.keys(p.changes[0]).sort(),['after','before','key','label','sheet','sourceRows'].sort());
});
test('exact repeated notes are idempotent and same notes on reversed duplicate rows merge once',()=>{
  const a=record(),b=record({w:200,l:100,sourceRow:3}),p=buildPlan([a,b],[product(),product({w:200,l:100})],{});
  assert.equal(p.canApply,true);assert.equal(p.changes.length,1);assert.equal(p.counts.duplicates,1);assert.deepEqual(p.changes[0].sourceRows,[2,3]);
  const existing={[p.changes[0].key]:'old\n'+a.note};const p2=buildPlan([a], [product()],existing);assert.equal(p2.changes.length,0);assert.equal(p2.counts.unchanged,1);
  assert.equal(buildPlan([a],[product()],{[p.changes[0].key]:a.note+'\nother'}).changes.length,0);
  assert.equal(buildPlan([record({note:'part'})],[product()],{'2|A|100|200|sheet':'partially old'}).changes[0].after,'partially old\npart');
});
test('conflicting duplicate source, mismatched or reused SKU block the whole plan',()=>{
  assert.equal(buildPlan([record(),record({note:'different'})],[product()],{}).issues[0].code,'duplicate-conflict');
  assert.equal(buildPlan([record({sku:'OTHER'})],[product()],{}).issues[0].code,'sku-mismatch');
  assert.equal(buildPlan([record()],[product(),product({w:200,l:300})],{}).issues[0].code,'sku-conflict');
  const p=buildPlan([record(),record({w:400,sku:'unknown'})],[product()],{});assert.equal(p.changes.length,1);assert.equal(p.canApply,false);
});
test('explicit replace is scoped to note and blank cannot clear even in replace mode',()=>{
  const p=buildPlan([record()],[product()],{'2|A|100|200|sheet':'old'},{mode:'replace'});assert.equal(p.changes[0].after,record().note);
  assert.equal(buildPlan([record({note:''})],[product()],{'2|A|100|200|sheet':'old'},{mode:'replace'}).changes.length,0);
  assert.equal(buildPlan([record()],[product()],{}, {mode:'anything'}).canApply,false);
});
test('merged limit and parsed input issues propagate fail closed',()=>{
  const p=buildPlan([record({note:'a'})],[product()],{'2|A|100|200|sheet':'b'.repeat(4000)});assert.equal(p.issues[0].code,'merged-note-limit');
  const parsed=parseWorkbook(workbook([row(),row({f:'A1',v:'cached'})]),XLSX),p2=buildPlan(parsed,[product()],{});assert.equal(p2.canApply,false);assert.equal(p2.issues[0].code,'formula');
});
test('large valid note sets exceed former 16KiB ceiling and stay below explicit payload limit',()=>{
  const products=Array.from({length:60},(_,i)=>product({w:100+i,sku:'SYNTH-'+i}));
  const records=products.map((r,i)=>({...r,note:'ทดสอบ'.repeat(100),sourceRow:i+2}));
  const p=buildPlan(records,products,{});assert.equal(p.canApply,true);assert.equal(p.changes.length,60);assert.ok(JSON.stringify(p.changes).length>16384);
});
test('planner source contains no persistence or business mutation calls',()=>{
  const source=fs.readFileSync(new URL('../stock_notes_import.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|localStorage|sessionStorage|Authorization|saveSales|\.writeFile\s*\(/);
});
