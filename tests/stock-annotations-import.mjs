import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {LIMITS,canonicalKey,parseAnnotationsWorkbook:parse,buildAnnotationsPlan:plan}=require('../stock_notes_import.js');
const letters=c=>{let s='';do{s=String.fromCharCode(65+c%26)+s;c=Math.floor(c/26)-1;}while(c>=0);return s;};
const parseCell=s=>{const m=/^([A-Z]+)(\d+)$/.exec(s);if(!m)throw Error('cell');return {r:Number(m[2])-1,c:[...m[1]].reduce((a,x)=>a*26+x.charCodeAt(0)-64,0)-1};};
const XLSX={utils:{encode_cell:({r,c})=>letters(c)+(r+1),decode_range:s=>{const a=s.split(':');return {s:parseCell(a[0]),e:parseCell(a[1]||a[0])};}}};
const h=['กว้าง','ยาว','หนา','เกรด','หน่วย','ติดตามการขาย','หมายเหตุ'];
function workbook(rows,headers=h,name='ติดตามการขาย'){
  const ws={'!ref':'A1:'+letters(headers.length-1)+(rows.length+1)};
  [headers,...rows].forEach((row,r)=>row.forEach((v,c)=>{if(v!==null&&v!==undefined)ws[letters(c)+(r+1)]=typeof v==='object'?v:{v,t:typeof v==='number'?'n':'s'};}));
  return {SheetNames:[name],Sheets:{[name]:ws}};
}
const product=(o={})=>({w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',rawKey:'raw-normal',sku:'SYNTH-A',followup:'เดิม',...o});
const record=(o={})=>({w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',followup:'ติดตามใหม่',note:'หมายเหตุใหม่',sourceRow:2,...o});
test('minimal annotation sheet reads both headers and never imports authors/time/business data',()=>{
  const wb=workbook([[1220,2440,2.5,'AAA','แผ่น','สอบถามลูกค้า','เก็บชั้นบน','forged','2099-01-01',999]],h.concat('ผู้ติดตาม','เวลาติดตาม','Physical'));
  const before=JSON.stringify(wb),p=parse(wb,XLSX);
  assert.equal(p.issues.length,0);assert.equal(p.records.length,1);
  assert.equal(p.records[0].followup,'สอบถามลูกค้า');assert.equal(p.records[0].note,'เก็บชั้นบน');
  assert.equal(p.records[0].followupBy,undefined);assert.equal(p.records[0].followupAt,undefined);assert.equal(p.records[0].qty,undefined);
  assert.equal(JSON.stringify(wb),before);assert.equal(p.counts.noteRows,1);assert.equal(p.counts.followupRows,1);
});
test('exported stock sheet recognizes current followup and AD notes; ignores stock note and AE',()=>{
  const headers=['SKU เดิม/aliases',...h.slice(0,5),'หมายเหตุสต๊อก','ติดตามการขาย','ผู้ติดตาม','เวลาติดตาม','หมายเหตุสเปกในชุดราคา','หมายเหตุความหนาเดิม'];
  const p=parse(workbook([['SYNTH-A',1220,2440,2.5,'AAA','แผ่น','not editable','ใหม่','not imported','not imported','note','old thickness']],headers,'สต๊อกทุกสเปก'),XLSX);
  assert.equal(p.issues.length,0);assert.equal(p.records[0].note,'note');assert.equal(p.records[0].followup,'ใหม่');
});
test('either editable column is sufficient, blanks skip only that field and never clear',()=>{
  for(const name of ['ติดตามงานขาย','followup','follow-up']){
    const p=parse(workbook([[1220,2440,2.5,'AAA','แผ่น','ใหม่']],h.slice(0,5).concat(name)),XLSX);
    assert.equal(p.records[0].followup,'ใหม่');assert.equal(p.records[0].note,undefined);
  }
  const p=parse(workbook([[1220,2440,2.5,'AAA','แผ่น','  ','note'],[1220,2440,2.5,'AAA','แผ่น','followup',''],[1220,2440,2.5,'AAA','แผ่น',null,' ']]),XLSX);
  assert.equal(p.records.length,2);assert.equal(p.counts.blankRows,1);assert.equal(p.records[0].followup,undefined);assert.equal(p.records[1].note,undefined);
  assert.equal(parse(workbook([],h.slice(0,5)),XLSX).issues[0].code,'headers');
  const unchanged=plan([record({note:' ',followup:''})],[product()],{[canonicalKey(product())]:'old'});
  assert.equal(unchanged.counts.changes,0);assert.equal(unchanged.canApply,false);
});
test('formulas in editable or identity columns and duplicate/formula headers fail closed',()=>{
  for(const cell of [{v:'cached',f:'A1'},{v:'cached',F:'F2:F4'},{v:'#REF!',t:'e'}]){
    const p=parse(workbook([[1220,2440,2.5,'AAA','แผ่น',cell,'note']]),XLSX);
    assert.equal(p.records.length,0);assert.equal(p.issues.length,1);
  }
  const w=workbook([[1220,2440,2.5,'AAA','แผ่น','new','note']]);w.Sheets['ติดตามการขาย'].A2={v:1220,f:'1220'};
  assert.equal(parse(w,XLSX).issues[0].code,'identity-formula');
  assert.equal(parse(workbook([],h.concat('followup')),XLSX).issues[0].code,'headers-duplicate');
  const f=workbook([],h);f.Sheets['ติดตามการขาย'].F1={v:'ติดตามการขาย',f:'A1'};
  assert.equal(parse(f,XLSX).issues[0].code,'headers-formula');
  assert.equal(parse(workbook([[1220,2440,2.5,'AAA','แผ่น','x'.repeat(4001)]]),XLSX).issues[0].code,'annotation-limit');
});
test('combined plan scopes followup to raw row and notes to canonical exact spec without mutations',()=>{
  const records=[record({qty:999,price:999,followupBy:'forged',followupAt:'forged'})],current=[product({qty:100,freeQty:20,price:88})],notes={[canonicalKey(product())]:'old note'};
  const before=JSON.stringify({records,current,notes}),p=plan(records,current,notes);
  assert.equal(p.canApply,true);assert.equal(p.notesChanges[0].after,'หมายเหตุใหม่');assert.equal(p.followupChanges[0].after,'ติดตามใหม่');assert.equal(p.followupChanges[0].rawKey,'raw-normal');
  assert.equal(p.followupChanges[0].before,'เดิม');assert.equal(p.notesChanges[0].before,'old note');assert.equal(p.counts.matchedRows,1);
  assert.deepEqual(Object.keys(p.followupChanges[0]).sort(),['after','before','key','label','rawKey','sheet','sourceRows'].sort());assert.equal(JSON.stringify({records,current,notes}),before);
});
test('exact orientation picks one raw row while reversed canonical notes stay shared',()=>{
  const current=[product(),product({w:2440,l:1220,rawKey:'raw-reversed',sku:'SYNTH-R',followup:'reverse old'})];
  const p=plan([record(),record({w:2440,l:1220,followup:'reverse new',sourceRow:3})],current,{});
  assert.equal(p.canApply,true);assert.equal(p.notesChanges.length,1);assert.deepEqual(p.followupChanges.map(x=>x.rawKey),['raw-normal','raw-reversed']);
  const reverse=plan([record({w:2440,l:1220,note:undefined})],[product()],{});
  assert.equal(reverse.canApply,true);assert.equal(reverse.followupChanges[0].rawKey,'raw-normal');
});
test('ambiguous same-orientation raw records require explicit rawKey and never fan out',()=>{
  const current=[product(),product({rawKey:'raw-other'})];
  for(const incoming of [record(),record({w:2440,l:1220})]){
    const p=plan([incoming],current,{});assert.equal(p.canApply,false);assert.equal(p.followupChanges.length,0);assert.ok(p.issues.some(x=>x.code==='followup-ambiguous'));
  }
  const p=plan([record({rawKey:'raw-other'})],current,{});assert.equal(p.canApply,true);assert.equal(p.followupChanges.length,1);assert.equal(p.followupChanges[0].rawKey,'raw-other');
  assert.equal(plan([record({rawKey:'unknown'})],current,{}).canApply,false);
  assert.equal(plan([record({rawKey:'raw-normal',w:1200,l:2400})],current,{}).canApply,false);
});
test('notes and followup never use near-size allocation equivalence, grade, unit or thickness substitution',()=>{
  for(const change of [{w:1200,l:2400},{grade:'B'},{t:1.8},{unit:'strip'}]){
    const p=plan([record(change)],[product()],{});assert.equal(p.canApply,false);assert.equal(p.notesChanges.length,0);assert.equal(p.followupChanges.length,0);
  }
});
test('duplicate annotation conflicts block whole combined plan; exact duplicates are idempotent',()=>{
  const p=plan([record(),record({followup:'different',sourceRow:3})],[product()],{});
  assert.equal(p.canApply,false);assert.ok(p.issues.some(x=>x.code==='followup-duplicate-conflict'));
  const q=plan([record(),record({note:'different',sourceRow:3})],[product()],{});assert.equal(q.canApply,false);
  const same=plan([record(),record({sourceRow:3})],[product()],{});assert.equal(same.canApply,true);assert.equal(same.followupChanges.length,1);assert.equal(same.notesChanges.length,1);
  assert.deepEqual(same.followupChanges[0].sourceRows,[2,3]);
  const again=plan([record()],[product({followup:'ติดตามใหม่'})],{[canonicalKey(product())]:'หมายเหตุใหม่'});assert.equal(again.canApply,false);assert.equal(again.counts.changes,0);
});
test('append preserves text and reimported whole blocks; invalid modes/types/SKU stop all changes',()=>{
  const key=canonicalKey(product()),p=plan([record()],[product()],{[key]:'old'},{mode:'append'});
  assert.equal(p.notesChanges[0].after,'old\nหมายเหตุใหม่');assert.equal(p.followupChanges[0].after,'เดิม\nติดตามใหม่');
  const same=plan([record()],[product({followup:'เดิม\nติดตามใหม่'})],{[key]:'old\nหมายเหตุใหม่'},{mode:'append'});assert.equal(same.counts.changes,0);
  assert.equal(plan([record()],[product()],{},{mode:'invalid'}).canApply,false);
  assert.equal(plan([record({followup:123})],[product()],{}).canApply,false);
  assert.equal(plan([record({sku:'WRONG'})],[product()],{}).canApply,false);
  assert.equal(plan([record()],[product({followup:{bad:true}})],{}).canApply,false);
});
test('limits, parser issues and raw-key collisions fail closed for combined save',()=>{
  const p=parse(workbook([[1220,2440,2.5,'AAA','แผ่น','new','note'],[1220,2440,2.5,'AAA','แผ่น',{v:'cached',f:'A1'},'note']]),XLSX);
  assert.equal(plan(p,[product()],{}).canApply,false);
  assert.equal(plan([record()],[product(),product({w:2440,l:1220})],{}).canApply,false);
  assert.equal(plan([record()],[product({rawKey:null,key:null})],{}).canApply,false);
  const large=Array.from({length:50},(_,i)=>product({w:1000+i,rawKey:'raw-'+i,sku:'SKU-'+i,followup:''}));
  const rows=large.map(r=>({...r,followup:'ท'.repeat(LIMITS.maxNoteChars),note:'ท'.repeat(LIMITS.maxNoteChars)}));
  assert.ok(plan(rows,large,{}).issues.some(x=>x.code==='payload-limit'));
});
