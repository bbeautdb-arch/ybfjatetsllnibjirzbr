/* Annotation-only Excel planning. This module never persists or changes a stock row. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.AAFStockNotesImport=api;
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const LIMITS=Object.freeze({maxFileBytes:10*1024*1024,maxRows:5000,maxColumns:128,maxSheets:25,maxCells:300000,maxNoteChars:4000,maxPayloadBytes:512*1024});
  const GRADES=new Set(['AV','AAA','A','B','F','REJ','C','UN','CTS']);
  const owns=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
  const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
  const text=v=>typeof v==='string'?v:typeof v==='number'&&Number.isFinite(v)?String(v):'';
  const norm=v=>text(v).replace(/\u00a0/g,' ').trim().replace(/\s+/g,' ').toLowerCase();
  const headers={
    w:['กว้าง (mm)','กว้าง (มม.)','กว้าง','width','w'],
    l:['ยาว (mm)','ยาว (มม.)','ยาว','length','l'],
    t:['หนา (mm)','หนา (มม.)','ความหนา','หนา','thickness','t'],
    grade:['เกรด','grade'],unit:['หน่วย','unit'],
    sku:['SKU เดิม/aliases','SKU','รหัสสินค้า'],exportSku:['SKU ส่งออกที่บันทึก','exportSku','SKU ส่งออก'],rawSku:['SKU ในรายงานเมล','rawSku'],
    AD:['หมายเหตุสเปกในชุดราคา','หมายเหตุรายสินค้า','หมายเหตุเฉพาะสินค้า','หมายเหตุสินค้า','หมายเหตุ','note','notes'],
    AE:['หมายเหตุความหนาเดิม'],
    followup:['ติดตามการขาย','ติดตามงานขาย','ติดตามขาย','followup','follow-up','sales followup','sales follow-up'],
    rawKey:['rawKey','raw key','รหัสแถว','รหัสแถวสต๊อก']
  };
  Object.keys(headers).forEach(k=>{headers[k]=headers[k].map(norm);});
  function problem(code,message,extra){return {code,message,...extra};}
  function number(v){
    if(typeof v==='number')return Number.isFinite(v)&&v>0?v:null;
    if(typeof v!=='string')return null;
    const s=v.trim();
    if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s))return null;
    const n=Number(s.replace(/,/g,''));return Number.isFinite(n)&&n>0?n:null;
  }
  function unit(v){
    const s=norm(v);
    if(['sheet','sheets','แผ่น'].includes(s))return 'sheet';
    if(['strip','strips','ชิ้น','ชิ้น strip','ไม้แถบ','ไม้แถบ ชิ้น'].includes(s))return 'strip';
    return null;
  }
  function normalizeRow(row){
    if(!plain(row))return null;
    const w=number(row.w),l=number(row.l),t=number(row.t),grade=text(row.grade).trim().toUpperCase(),u=unit(row.unit);
    if(w===null||l===null||t===null||!GRADES.has(grade)||u===null)return null;
    return {w,l,t,grade,unit:u};
  }
  function canonicalKey(row){
    const r=normalizeRow(row);
    return r?[r.t,r.grade,Math.min(r.w,r.l),Math.max(r.w,r.l),r.unit].join('|'):null;
  }
  function utf8Bytes(s){
    let size=0;
    for(const c of s){const n=c.codePointAt(0);size+=n<=127?1:n<=2047?2:n<=65535?3:4;}
    return size;
  }
  function aliases(row){
    return [...new Set(['sku','exportSku','rawSku','aliases'].flatMap(k=>(Array.isArray(row[k])?row[k]:[row[k]]).flatMap(v=>text(v).split(',')).map(v=>v.trim().toUpperCase()).filter(Boolean)))];
  }
  function parseWorkbook(workbook,XLSX,options={}){
    const records=[],issues=[],counts={sourceRows:0,noteRows:0,blankRows:0},column=options.column||'AD';
    const result={records,issues,counts,sheet:'',headerRow:null,column};
    const fail=(code,message,extra)=>issues.push(problem(code,message,extra));
    if(!['AD','AE'].includes(column)){fail('column','เลือกเฉพาะหมายเหตุรายสินค้า AD หรือหมายเหตุเดิม AE');return result;}
    if(!plain(workbook)||!Array.isArray(workbook.SheetNames)||!plain(workbook.Sheets)||!XLSX?.utils?.decode_range||!XLSX?.utils?.encode_cell){fail('workbook','อ่านไฟล์ Excel ไม่ได้');return result;}
    if(workbook.SheetNames.length>LIMITS.maxSheets){fail('sheets-limit','จำนวนชีตในไฟล์เกินขอบเขตที่รองรับ');return result;}
    const allowed=['สต๊อกทุกสเปก','หมายเหตุสินค้า','หมายเหตุรายสินค้า'];
    const requested=options.sheetName;
    if(requested!==undefined&&!allowed.includes(requested)){fail('sheet-name','ใช้ชีต สต๊อกทุกสเปก หรือ หมายเหตุสินค้า');return result;}
    let names=requested?[requested]:workbook.SheetNames.filter(n=>allowed.includes(n));
    if(!requested&&names.includes('สต๊อกทุกสเปก'))names=['สต๊อกทุกสเปก'];
    if(names.length!==1||!owns(workbook.Sheets,names[0])){fail('sheet-name',names.length>1?'พบชีตหมายเหตุมากกว่าหนึ่งชีต กรุณาระบุชีต':'ไม่พบชีต สต๊อกทุกสเปก หรือ หมายเหตุสินค้า');return result;}
    const sheet=names[0],ws=workbook.Sheets[sheet];result.sheet=sheet;
    let range;
    try{range=XLSX.utils.decode_range(ws['!ref']||'');}catch(_){fail('range','ช่วงข้อมูลในชีตไม่ถูกต้อง',{sheet});return result;}
    if(!range||![range.s?.r,range.s?.c,range.e?.r,range.e?.c].every(n=>Number.isSafeInteger(n)&&n>=0)||range.s.r>range.e.r||range.s.c>range.e.c||range.e.r>=LIMITS.maxRows+20||range.e.c>=LIMITS.maxColumns||(range.e.r-range.s.r+1)*(range.e.c-range.s.c+1)>LIMITS.maxCells){fail('range-limit','ช่วงข้อมูลในชีตเกินขอบเขตที่รองรับ',{sheet});return result;}
    const read=(r,c)=>ws[XLSX.utils.encode_cell({r,c})];
    const matches=[];
    for(let r=range.s.r;r<=Math.min(range.e.r,range.s.r+19);r++){
      const found={};
      for(const field of ['w','l','t','grade','unit','sku','exportSku','rawSku',column]){
        const indexes=[];
        for(let c=range.s.c;c<=range.e.c;c++){const cell=read(r,c);if(cell&&!cell.f&&headers[field].includes(norm(cell.v)))indexes.push(c);}
        if(indexes.length)found[field]=indexes;
      }
      if(['w','l','t','grade','unit',column].every(f=>found[f]))matches.push({r,found});
    }
    if(matches.length!==1){fail('headers',matches.length>1?'พบหัวตารางซ้ำ กรุณาเหลือชุดเดียว':'หัวตารางไม่ครบ: กว้าง ยาว หนา เกรด หน่วย และ '+headers[column][0],{sheet});return result;}
    const {r:headerRow,found}=matches[0];result.headerRow=headerRow+1;
    if(Object.values(found).some(a=>a.length!==1)){fail('headers-duplicate','พบคอลัมน์ที่มีความหมายซ้ำ กรุณาเหลือคอลัมน์เดียวต่อหัวข้อ',{sheet,sourceRow:headerRow+1});return result;}
    const columns=Object.fromEntries(Object.entries(found).map(([k,v])=>[k,v[0]]));
    if(range.e.r-headerRow>LIMITS.maxRows){fail('rows-limit','จำนวนแถวเกิน '+LIMITS.maxRows,{sheet});return result;}
    let totalBytes=0;
    for(let r=headerRow+1;r<=range.e.r;r++){
      const sourceRow=r+1,extra={sheet,sourceRow},noteCell=read(r,columns[column]);counts.sourceRows++;
      if(noteCell?.f||noteCell?.F){fail('formula','หมายเหตุต้องเป็นข้อความ ไม่ใช่สูตร Excel',extra);continue;}
      if(noteCell?.t==='e'){fail('cell-error','ช่องหมายเหตุมีข้อผิดพลาด Excel',extra);continue;}
      const value=noteCell?.v;
      if(value===null||value===undefined||typeof value==='string'&&!value.trim()){counts.blankRows++;continue;}
      counts.noteRows++;
      if(typeof value!=='string'&&typeof value!=='number'||typeof value==='number'&&!Number.isFinite(value)){fail('note-type','หมายเหตุไม่ใช่ข้อความที่รองรับ',extra);continue;}
      const note=String(value);
      if(note.length>LIMITS.maxNoteChars){fail('note-limit','หมายเหตุยาวเกิน '+LIMITS.maxNoteChars+' ตัวอักษร',extra);continue;}
      totalBytes+=utf8Bytes(note);
      if(totalBytes>LIMITS.maxPayloadBytes){fail('payload-limit','ข้อความหมายเหตุรวมเกินขอบเขตที่รองรับ',extra);break;}
      const raw={};let bad=false;
      for(const f of ['w','l','t','grade','unit','sku','exportSku','rawSku']){
        if(columns[f]===undefined)continue;
        const cell=read(r,columns[f]);
        if(cell?.f||cell?.F||cell?.t==='e'){fail('identity-formula','ขนาด เกรด หน่วย และรหัสสินค้าต้องเป็นค่าจริง ไม่ใช่สูตรหรือข้อผิดพลาด',extra);bad=true;break;}
        raw[f]=cell?.v;
      }
      if(bad)continue;
      const normalized=normalizeRow(raw);
      if(!normalized){fail('spec','ขนาด เกรด หรือหน่วยไม่ครบหรือไม่ถูกต้อง',extra);continue;}
      if(['sku','exportSku','rawSku'].some(f=>text(raw[f]).length>1000)){fail('sku-limit','รหัสสินค้าเกินขอบเขตที่รองรับ',extra);continue;}
      records.push({...normalized,sku:text(raw.sku),exportSku:text(raw.exportSku),rawSku:text(raw.rawSku),note,sourceRow,sheet});
    }
    return result;
  }
  function buildPlan(input,currentRows,existingNotes,options={}){
    const parsed=Array.isArray(input)?{records:input,issues:[]}:input;
    const issues=Array.isArray(parsed?.issues)?parsed.issues.map(x=>({...x})):[];
    const records=parsed?.records,mode=options.mode||'append';
    const changes=[],counts={sourceRows:Array.isArray(records)?records.length:0,matchedRows:0,uniqueSpecs:0,duplicates:0,unchanged:0,blankRows:0,changes:0};
    const result={changes,issues,counts,canApply:false,mode};
    const fail=(code,message,extra)=>issues.push(problem(code,message,extra));
    if(!['append','replace'].includes(mode)){fail('mode','วิธีนำเข้าต้องเป็น เพิ่มต่อท้าย หรือ แทนที่เฉพาะหมายเหตุ');return result;}
    if(!Array.isArray(records)||!Array.isArray(currentRows)||!currentRows.length||!plain(existingNotes)){fail('inputs','ยังไม่มีข้อมูลสินค้าหรือหมายเหตุส่วนกลางที่ตรวจสอบแล้ว');return result;}
    if(records.length>LIMITS.maxRows||currentRows.length>LIMITS.maxRows){fail('rows-limit','จำนวนสินค้าเกินขอบเขตที่รองรับ');return result;}
    const current=new Map(),skuKeys=new Map();
    currentRows.forEach((r,index)=>{
      const key=canonicalKey(r);
      if(!key){fail('current-spec','ข้อมูลสเปกส่วนกลางไม่ถูกต้อง',{sourceRow:index+1});return;}
      if(!current.has(key))current.set(key,{row:normalizeRow(r),aliases:new Set()});
      aliases(r).forEach(s=>{current.get(key).aliases.add(s);if(!skuKeys.has(s))skuKeys.set(s,new Set());skuKeys.get(s).add(key);});
    });
    const incoming=new Map();
    records.forEach((record,index)=>{
      const sourceRow=record?.sourceRow||index+1,sheet=text(record?.sheet),extra={sourceRow,sheet};
      if(!plain(record)||typeof record.note!=='string'){fail('note-type','หมายเหตุไม่ใช่ข้อความ',extra);return;}
      if(!record.note.trim()){counts.blankRows++;return;}
      if(record.note.length>LIMITS.maxNoteChars){fail('note-limit','หมายเหตุยาวเกิน '+LIMITS.maxNoteChars+' ตัวอักษร',extra);return;}
      const key=canonicalKey(record),target=current.get(key);extra.key=key;
      if(!key||!target){fail('unmatched','ไม่พบสินค้าสเปกตรงกันในทะเบียนส่วนกลาง',extra);return;}
      const ids=aliases(record);
      if(ids.some(s=>skuKeys.has(s)&&([...skuKeys.get(s)].some(k=>k!==key)))){fail('sku-conflict','รหัสสินค้าอ้างถึงสเปกอื่นหรือหลายสเปก ต้องตรวจสอบก่อนนำเข้า',extra);return;}
      if(ids.length&&target.aliases.size&&!ids.some(s=>target.aliases.has(s))){fail('sku-mismatch','รหัสสินค้าไม่ตรงกับสเปกส่วนกลาง ต้องตรวจสอบก่อนนำเข้า',extra);return;}
      counts.matchedRows++;
      if(incoming.has(key)){
        const prior=incoming.get(key);
        if(prior.note!==record.note){fail('duplicate-conflict','สเปกเดียวกันมีหมายเหตุต่างกันหลายแถว',extra);return;}
        counts.duplicates++;prior.sourceRows.push(sourceRow);return;
      }
      incoming.set(key,{note:record.note,sourceRows:[sourceRow],sheet,target});
    });
    for(const [key,item] of incoming){
      counts.uniqueSpecs++;
      const before=owns(existingNotes,key)?existingNotes[key]:'';
      if(typeof before!=='string'){fail('existing-note','หมายเหตุเดิมส่วนกลางไม่ถูกต้อง',{key});continue;}
      const note=item.note;
      // Re-importing an appended whole note block is idempotent; substring matches are not enough.
      const already=before===note||('\n'+before+'\n').includes('\n'+note+'\n');
      const after=mode==='replace'||!before?note:already?before:before+'\n'+note;
      if(after.length>LIMITS.maxNoteChars){fail('merged-note-limit','หมายเหตุรวมของสเปกนี้เกิน '+LIMITS.maxNoteChars+' ตัวอักษร',{key,sourceRow:item.sourceRows[0]});continue;}
      if(after===before){counts.unchanged++;continue;}
      const r=item.target.row,label=r.w+' × '+r.l+' × '+r.t+' มม. '+r.grade+' '+(r.unit==='sheet'?'แผ่น':'ชิ้น strip');
      changes.push({key,before,after,sourceRows:[...item.sourceRows],sheet:item.sheet,label});
    }
    counts.changes=changes.length;
    const patch=Object.fromEntries(changes.map(c=>[c.key,c.after]));
    if(utf8Bytes(JSON.stringify(patch))>LIMITS.maxPayloadBytes)fail('payload-limit','หมายเหตุที่จะบันทึกรวมเกินขอบเขตที่รองรับ');
    result.canApply=issues.length===0&&changes.length>0;
    return result;
  }
  // The exported AD note and follow-up are independent editable fields. AE and
  // author/time columns are deliberately not imported by this combined path.
  function parseAnnotationsWorkbook(workbook,XLSX,options={}){
    const records=[],issues=[],counts={sourceRows:0,noteRows:0,followupRows:0,annotationRows:0,blankRows:0};
    const result={records,issues,counts,sheet:'',headerRow:null,columns:{}};
    const fail=(code,message,extra)=>issues.push(problem(code,message,extra));
    if(!plain(workbook)||!Array.isArray(workbook.SheetNames)||!plain(workbook.Sheets)||!XLSX?.utils?.decode_range||!XLSX?.utils?.encode_cell){fail('workbook','อ่านไฟล์ Excel ไม่ได้');return result;}
    if(workbook.SheetNames.length>LIMITS.maxSheets){fail('sheets-limit','จำนวนชีตในไฟล์เกินขอบเขตที่รองรับ');return result;}
    const allowed=['สต๊อกทุกสเปก','หมายเหตุสินค้า','หมายเหตุรายสินค้า','ติดตามการขาย','ติดตามงานขาย','ติดตามและหมายเหตุ'];
    const requested=options.sheetName;
    if(requested!==undefined&&!allowed.includes(requested)){fail('sheet-name','ใช้ชีต สต๊อกทุกสเปก หมายเหตุสินค้า หรือ ติดตามการขาย');return result;}
    let names=requested?[requested]:workbook.SheetNames.filter(n=>allowed.includes(n));
    if(!requested&&names.includes('สต๊อกทุกสเปก'))names=['สต๊อกทุกสเปก'];
    if(names.length!==1||!owns(workbook.Sheets,names[0])){fail('sheet-name',names.length>1?'พบชีตสำหรับนำเข้ามากกว่าหนึ่งชีต กรุณาระบุชีต':'ไม่พบชีตสำหรับติดตามการขายและหมายเหตุ');return result;}
    const sheet=names[0],ws=workbook.Sheets[sheet];result.sheet=sheet;
    if(!plain(ws)){fail('workbook','อ่านชีต Excel ไม่ได้',{sheet});return result;}
    let range;
    try{range=XLSX.utils.decode_range(ws['!ref']||'');}catch(_){fail('range','ช่วงข้อมูลในชีตไม่ถูกต้อง',{sheet});return result;}
    if(!range||![range.s?.r,range.s?.c,range.e?.r,range.e?.c].every(n=>Number.isSafeInteger(n)&&n>=0)||range.s.r>range.e.r||range.s.c>range.e.c||range.e.r>=LIMITS.maxRows+20||range.e.c>=LIMITS.maxColumns||(range.e.r-range.s.r+1)*(range.e.c-range.s.c+1)>LIMITS.maxCells){fail('range-limit','ช่วงข้อมูลในชีตเกินขอบเขตที่รองรับ',{sheet});return result;}
    const identity=['w','l','t','grade','unit','sku','exportSku','rawSku','rawKey'];
    const editable=['AD','followup'],read=(r,c)=>ws[XLSX.utils.encode_cell({r,c})],matches=[];
    for(let r=range.s.r;r<=Math.min(range.e.r,range.s.r+19);r++){
      const found={};
      for(const field of [...identity,...editable]){
        const indexes=[];
        for(let c=range.s.c;c<=range.e.c;c++){const cell=read(r,c);if(cell&&headers[field].includes(norm(cell.v)))indexes.push(c);}
        if(indexes.length)found[field]=indexes;
      }
      if(['w','l','t','grade','unit'].every(f=>found[f])&&editable.some(f=>found[f]))matches.push({r,found});
    }
    if(matches.length!==1){fail('headers',matches.length>1?'พบหัวตารางซ้ำ กรุณาเหลือชุดเดียว':'ต้องมี กว้าง ยาว หนา เกรด หน่วย และคอลัมน์ ติดตามการขาย หรือ หมายเหตุ',{sheet});return result;}
    const {r:headerRow,found}=matches[0];result.headerRow=headerRow+1;
    if(Object.values(found).some(a=>a.length!==1)){fail('headers-duplicate','พบคอลัมน์ที่มีความหมายซ้ำ กรุณาเหลือคอลัมน์เดียวต่อหัวข้อ',{sheet,sourceRow:headerRow+1});return result;}
    const columns=Object.fromEntries(Object.entries(found).map(([k,v])=>[k,v[0]]));result.columns={...columns};
    if(Object.values(columns).some(c=>{const cell=read(headerRow,c);return cell?.f||cell?.F||cell?.t==='e';})){fail('headers-formula','หัวตารางต้องเป็นข้อความจริง ไม่ใช่สูตรหรือข้อผิดพลาด',{sheet,sourceRow:headerRow+1});return result;}
    if(range.e.r-headerRow>LIMITS.maxRows){fail('rows-limit','จำนวนแถวเกิน '+LIMITS.maxRows,{sheet});return result;}
    let totalBytes=0;
    for(let r=headerRow+1;r<=range.e.r;r++){
      const extra={sheet,sourceRow:r+1},values={};let bad=false;counts.sourceRows++;
      for(const field of editable){
        if(columns[field]===undefined)continue;
        const cell=read(r,columns[field]),value=cell?.v,label=field==='AD'?'หมายเหตุ':'ติดตามการขาย';
        if(cell?.f||cell?.F){fail('formula',label+' ต้องเป็นข้อความ ไม่ใช่สูตร Excel',extra);bad=true;continue;}
        if(cell?.t==='e'){fail('cell-error','ช่อง '+label+' มีข้อผิดพลาด Excel',extra);bad=true;continue;}
        if(value===null||value===undefined||typeof value==='string'&&!value.trim())continue;
        if(typeof value!=='string'&&typeof value!=='number'||typeof value==='number'&&!Number.isFinite(value)){fail('annotation-type',label+' ไม่ใช่ข้อความที่รองรับ',extra);bad=true;continue;}
        const valueText=String(value);
        if(valueText.length>LIMITS.maxNoteChars){fail('annotation-limit',label+' ยาวเกิน '+LIMITS.maxNoteChars+' ตัวอักษร',extra);bad=true;continue;}
        values[field==='AD'?'note':'followup']=valueText;
      }
      if(bad)continue;
      if(!Object.keys(values).length){counts.blankRows++;continue;}
      totalBytes+=Object.values(values).reduce((sum,v)=>sum+utf8Bytes(v),0);
      if(totalBytes>LIMITS.maxPayloadBytes){fail('payload-limit','ข้อความรวมเกินขอบเขตที่รองรับ',extra);break;}
      const raw={};
      for(const field of identity){
        if(columns[field]===undefined)continue;
        const cell=read(r,columns[field]);
        if(cell?.f||cell?.F||cell?.t==='e'){fail('identity-formula','ขนาด เกรด หน่วย และรหัสต้องเป็นค่าจริง ไม่ใช่สูตรหรือข้อผิดพลาด',extra);bad=true;break;}
        raw[field]=cell?.v;
      }
      if(bad)continue;
      const normalized=normalizeRow(raw);
      if(!normalized){fail('spec','ขนาด เกรด หรือหน่วยไม่ครบหรือไม่ถูกต้อง',extra);continue;}
      if(['sku','exportSku','rawSku','rawKey'].some(f=>text(raw[f]).length>1000)){fail('sku-limit','รหัสสินค้าเกินขอบเขตที่รองรับ',extra);continue;}
      records.push({...normalized,sku:text(raw.sku),exportSku:text(raw.exportSku),rawSku:text(raw.rawSku),rawKey:text(raw.rawKey).trim(),...values,...extra});
      counts.annotationRows++;if(values.note!==undefined)counts.noteRows++;if(values.followup!==undefined)counts.followupRows++;
    }
    return result;
  }
  function buildAnnotationsPlan(input,currentRows,existingNotes,options={}){
    const parsed=Array.isArray(input)?{records:input,issues:[]}:input,records=parsed?.records,mode=options.mode||'replace';
    const issues=Array.isArray(parsed?.issues)?parsed.issues.map(x=>({...x})):[],notesChanges=[],followupChanges=[];
    const counts={sourceRows:Array.isArray(records)?records.length:0,matchedRows:0,blankRows:0,duplicates:0,unchanged:0,notesChanges:0,followupChanges:0,changes:0};
    const result={notesChanges,followupChanges,issues,counts,mode,canApply:false};
    const fail=(code,message,extra)=>issues.push(problem(code,message,extra));
    if(!['append','replace'].includes(mode)){fail('mode','วิธีนำเข้าต้องเป็น เพิ่มต่อท้าย หรือ แทนที่เฉพาะข้อความ');return result;}
    if(!Array.isArray(records)||!Array.isArray(currentRows)||!currentRows.length||!plain(existingNotes)){fail('inputs','ยังไม่มีข้อมูลสินค้าหรือหมายเหตุส่วนกลางที่ตรวจสอบแล้ว');return result;}
    if(records.length>LIMITS.maxRows||currentRows.length>LIMITS.maxRows){fail('rows-limit','จำนวนสินค้าเกินขอบเขตที่รองรับ');return result;}
    const noteRecords=[],followupRecords=[];
    records.forEach((record,index)=>{
      const extra={sourceRow:record?.sourceRow||index+1,sheet:text(record?.sheet)};
      if(!plain(record)){fail('annotation-type','แถวข้อความไม่ถูกต้อง',extra);return;}
      let present=false;
      for(const [field,list] of [['note',noteRecords],['followup',followupRecords]]){
        if(record[field]===undefined||record[field]===null)continue;
        if(typeof record[field]!=='string'){fail('annotation-type','ติดตามการขายและหมายเหตุต้องเป็นข้อความ',extra);continue;}
        if(!record[field].trim())continue;
        present=true;list.push(record);
      }
      if(!present)counts.blankRows++;
    });
    const notePlan=buildPlan(noteRecords,currentRows,existingNotes,{mode});
    issues.push(...notePlan.issues);notesChanges.push(...notePlan.changes);
    counts.duplicates+=notePlan.counts.duplicates;counts.unchanged+=notePlan.counts.unchanged;
    const byRaw=new Map(),byCanonical=new Map(),skuKeys=new Map();
    if(followupRecords.length)currentRows.forEach((row,index)=>{
      const normalized=normalizeRow(row),key=canonicalKey(row),rawKey=text(row?.rawKey||row?.key).trim();
      if(!normalized||!rawKey){fail('current-raw-key','ทะเบียนส่วนกลางไม่มีรหัสแถวที่ตรวจสอบได้',{sourceRow:index+1});return;}
      if(byRaw.has(rawKey)){fail('current-raw-duplicate','ทะเบียนมีรหัสแถวซ้ำ ต้องตรวจสอบก่อนนำเข้า',{rawKey});return;}
      const item={row,normalized,key,rawKey,aliases:new Set(aliases(row))};byRaw.set(rawKey,item);
      if(!byCanonical.has(key))byCanonical.set(key,[]);byCanonical.get(key).push(item);
      for(const sku of item.aliases){if(!skuKeys.has(sku))skuKeys.set(sku,new Set());skuKeys.get(sku).add(key);}
    });
    const incoming=new Map(),matched=new Set();
    followupRecords.forEach((record,index)=>{
      const extra={sourceRow:record.sourceRow||index+1,sheet:text(record.sheet)},normalized=normalizeRow(record),key=canonicalKey(record);
      if(record.followup.length>LIMITS.maxNoteChars){fail('annotation-limit','ติดตามการขายยาวเกิน '+LIMITS.maxNoteChars+' ตัวอักษร',extra);return;}
      const candidates=byCanonical.get(key)||[];let target;
      if(record.rawKey!==undefined&&typeof record.rawKey!=='string'){fail('raw-key','รหัสแถวต้องเป็นข้อความ',extra);return;}
      const explicit=text(record.rawKey).trim();
      if(explicit){
        target=byRaw.get(explicit);
        if(!target||target.key!==key){fail('raw-key-mismatch','รหัสแถวไม่ตรงกับสเปกในไฟล์',{...extra,rawKey:explicit});return;}
      }else if(normalized){
        const exact=candidates.filter(item=>item.normalized.w===normalized.w&&item.normalized.l===normalized.l);
        if(exact.length===1)target=exact[0];
        else if(exact.length>1||candidates.length>1){fail('followup-ambiguous','พบหลายแถวในสเปกเดียวกัน กรุณาระบุ rawKey เพื่อเลือกแถวติดตามการขาย',extra);return;}
        else if(candidates.length===1)target=candidates[0];
      }
      if(!target){fail('followup-unmatched','ไม่พบแถวติดตามการขายที่ตรงกับสเปกในทะเบียน',extra);return;}
      const ids=aliases(record);
      if(ids.some(s=>skuKeys.has(s)&&[...skuKeys.get(s)].some(k=>k!==key))){fail('sku-conflict','รหัสสินค้าอ้างถึงสเปกอื่นหรือหลายสเปก ต้องตรวจสอบก่อนนำเข้า',extra);return;}
      if(ids.length&&target.aliases.size&&!ids.some(s=>target.aliases.has(s))){fail('sku-mismatch','รหัสสินค้าไม่ตรงกับแถวส่วนกลาง ต้องตรวจสอบก่อนนำเข้า',extra);return;}
      matched.add(record);
      if(incoming.has(target.rawKey)){
        const prior=incoming.get(target.rawKey);
        if(prior.followup!==record.followup){fail('followup-duplicate-conflict','แถวเดียวกันมีข้อความติดตามการขายต่างกันหลายแถว',{...extra,rawKey:target.rawKey});return;}
        counts.duplicates++;prior.sourceRows.push(extra.sourceRow);return;
      }
      incoming.set(target.rawKey,{target,followup:record.followup,sourceRows:[extra.sourceRow],sheet:extra.sheet});
    });
    for(const [rawKey,item] of incoming){
      const before=item.target.row.followup===undefined||item.target.row.followup===null?'':item.target.row.followup;
      if(typeof before!=='string'){fail('existing-followup','ข้อความติดตามการขายเดิมไม่ถูกต้อง',{rawKey});continue;}
      const already=before===item.followup||('\n'+before+'\n').includes('\n'+item.followup+'\n');
      const after=mode==='replace'||!before?item.followup:already?before:before+'\n'+item.followup;
      if(after.length>LIMITS.maxNoteChars){fail('merged-followup-limit','ข้อความติดตามการขายรวมเกิน '+LIMITS.maxNoteChars+' ตัวอักษร',{rawKey,sourceRow:item.sourceRows[0]});continue;}
      if(after===before){counts.unchanged++;continue;}
      const r=item.target.normalized,label=r.w+' × '+r.l+' × '+r.t+' มม. '+r.grade+' '+(r.unit==='sheet'?'แผ่น':'ชิ้น strip');
      followupChanges.push({rawKey,key:item.target.key,before,after,sourceRows:[...item.sourceRows],sheet:item.sheet,label});
    }
    counts.matchedRows=notePlan.counts.matchedRows+[...matched].filter(r=>!noteRecords.includes(r)).length;
    counts.notesChanges=notesChanges.length;counts.followupChanges=followupChanges.length;counts.changes=notesChanges.length+followupChanges.length;
    if(utf8Bytes(JSON.stringify({notes:Object.fromEntries(notesChanges.map(c=>[c.key,c.after])),followup:Object.fromEntries(followupChanges.map(c=>[c.rawKey,c.after]))}))>LIMITS.maxPayloadBytes)fail('payload-limit','ข้อความที่จะบันทึกรวมเกินขอบเขตที่รองรับ');
    // These are preview proposals only. Any issue blocks the combined transaction.
    result.canApply=issues.length===0&&counts.changes>0;
    return result;
  }
  return Object.freeze({LIMITS,canonicalKey,parseWorkbook,buildPlan,parseAnnotationsWorkbook,buildAnnotationsPlan});
});
