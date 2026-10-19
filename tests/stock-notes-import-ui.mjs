import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),api=require('../stock_sales_preview.js');
const existing=fs.readFileSync(new URL('./stock-sales-preview.mjs',import.meta.url),'utf8');
const makeHarness=vm.runInNewContext(existing.slice(existing.indexOf('function harness()'),existing.indexOf('function sale('))+';harness');
const copy=value=>JSON.parse(JSON.stringify(value));
const key='2|F|1220|2440|sheet';
const stock=[{sku:'SYNTHETIC-NOTE',w:1220,l:2440,t:2,grade:'F',unit:'sheet',physical:10}];
const initial={privateContent:{version:3,context:'aaf-sales-stock-preview|free-price-catalog',fx:33,prices:{[key]:12},currencies:{[key]:'THB'},notesByThickness:{'2':'legacy'},notesBySpec:{[key]:'old'},savedAt:'2026-10-01T00:00:00Z'}};
async function fixture({readOnly=false,failCode=null,delayed=null}={}){
  const h=makeHarness(),writes=[],wholeWrites=[],parserCalls=[];
  h.host.XLSX={};
  h.host.AAFStockNotesImport={
    parseWorkbook(workbook,xlsx,options){parserCalls.push(copy(options));return {records:workbook.records,issues:workbook.issues||[]};},
    buildPlan(parsed,rows,notes,{mode}){return {canApply:!parsed.issues.length,issues:parsed.issues,counts:{changes:parsed.records.length},changes:parsed.records.map(record=>({key,before:notes[key]||'',after:mode==='replace'?record.note:(notes[key]+'\n'+record.note),sourceRows:[2],label:'2 F 1220 × 2440 แผ่น'}))};},
  };
  const store={widgetState:copy(initial),load(){return this.widgetState;},async setWidgetState(value){wholeWrites.push(copy(value));this.widgetState=copy(value);return copy(value);},async updateNotes(changes){writes.push(copy(changes));if(delayed)await delayed;if(failCode)throw Object.assign(new Error('private backend text'),{code:failCode});for(const c of changes)this.widgetState.privateContent.notesBySpec[c.key]=c.after;this.widgetState.privateContent.savedAt='2026-10-02T00:00:00Z';return copy(this.widgetState);}};
  const model=api.buildModel([],copy(stock),{strict:true,paidOverrideRefs:[]}),before=copy(model);
  const view=api.mount(h.root,model,{readOnly,notesImportRows:copy(stock)},store);await view.ready;
  return{h,view,store,model,before,writes,wholeWrites,parserCalls};
}
test('upload preview defaults to AD and append; explicit notes save preserves every other catalog and model field',async()=>{
  const f=await fixture(),beforeSummary=copy(f.view.getReportSummary());
  assert.equal(f.h.root.querySelectorAll('[data-import-notes]').length,1,'only global Free editor gets importer');
  const plan=f.view.prepareNotesImportWorkbook({records:[{note:'<new> & note'}]});
  assert.equal(f.parserCalls[0].column,'AD');assert.equal(plan.changes[0].after,'old\n<new> & note');
  assert.equal(f.writes.length,0,'preview cannot write');assert.equal(f.wholeWrites.length,0);
  assert.match(f.h.find('[data-notes-import-preview]').innerHTML,/&lt;new&gt; &amp; note/,'untrusted cell text is escaped');
  assert.equal(await f.view.saveImportedNotes(),true);assert.equal(f.writes.length,1);assert.equal(f.wholeWrites.length,0,'notes import never invokes full catalog writer');
  assert.deepEqual(Object.keys(f.writes[0][0]).sort(),['after','before','key']);
  for(const field of ['prices','currencies','fx','notesByThickness'])assert.deepEqual(f.store.widgetState.privateContent[field],initial.privateContent[field]);
  assert.deepEqual(f.model,f.before);assert.deepEqual(f.view.getReportSummary().physical,beforeSummary.physical);assert.deepEqual(f.view.getReportSummary().free,beforeSummary.free);
  assert.equal(f.view.getPriceState().dirty,false);assert.equal(f.view.getPriceState().notesBySpec[key],'old\n<new> & note');
  assert.equal(await f.view.saveImportedNotes(),false,'acknowledged import cannot repeat');f.view.destroy();
});
test('AE and replace require explicit selection and show warnings with full before/after',async()=>{
  const f=await fixture();f.view.prepareNotesImportWorkbook({records:[{note:'legacy selected'}]},{column:'AE',mode:'replace'});
  assert.equal(f.parserCalls[0].column,'AE');const markup=f.h.find('[data-notes-import-preview]').innerHTML;
  assert.match(markup,/AE เป็นหมายเหตุเดิม/);assert.match(markup,/โหมดแทนที่/);assert.match(markup,/old/);assert.match(markup,/legacy selected/);
  assert.equal(await f.view.saveImportedNotes(),true);assert.equal(f.store.widgetState.privateContent.notesBySpec[key],'legacy selected');f.view.destroy();
});
test('dirty draft, parse issues, and read-only mode fail closed with no note writes',async()=>{
  const f=await fixture();f.view.setDraftPrice(key,15);assert.equal(f.view.prepareNotesImportWorkbook({records:[{note:'blocked'}]}),null);assert.equal(await f.view.saveImportedNotes(),false);assert.equal(f.writes.length,0);f.view.destroy();
  const invalid=await fixture();invalid.view.prepareNotesImportWorkbook({records:[{note:'blocked'}],issues:[{code:'invalid',message:'bad row'}]});assert.equal(await invalid.view.saveImportedNotes(),false);assert.equal(invalid.writes.length,0);invalid.view.destroy();
  const ro=await fixture({readOnly:true});assert.equal(ro.h.find('[data-import-notes]'),undefined);assert.equal(ro.view.prepareNotesImportWorkbook({records:[{note:'blocked'}]}),null);assert.equal(await ro.view.saveImportedNotes(),false);ro.view.destroy();
});
test('uncertain outcomes retain plan but block duplicate submit; server text is not exposed',async()=>{
  const f=await fixture({failCode:'save-outcome-unknown'});f.view.prepareNotesImportWorkbook({records:[{note:'new'}]});
  assert.equal(await f.view.saveImportedNotes(),false);assert.equal(f.writes.length,1);assert.match(f.h.find('[data-notes-import-status]').textContent,/ห้ามกดเซฟซ้ำ/);assert(!f.h.find('[data-notes-import-status]').textContent.includes('private backend'));
  assert.equal(await f.view.saveImportedNotes(),false);assert.equal(f.writes.length,1);f.view.destroy();
});
test('while note save is pending, manual edits and duplicate writes are locked',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;}),f=await fixture({delayed:pending});f.view.prepareNotesImportWorkbook({records:[{note:'new'}]});
  const saving=f.view.saveImportedNotes();assert.equal(f.view.setDraftPrice(key,99),false);assert.equal(await f.view.saveImportedNotes(),false);release();assert.equal(await saving,true);assert.equal(f.writes.length,1);assert.equal(f.store.widgetState.privateContent.prices[key],12);f.view.destroy();
});
test('regular manual notes can exceed old 16 KiB cap without losing other fields',async()=>{
  const f=await fixture();for(let i=0;i<10;i++)f.store.widgetState.privateContent.notesBySpec[`${i+10}|F|1220|2440|sheet`]='ท'.repeat(2000);
  f.view.destroy();const second=api.mount(f.h.root,f.model,{},f.store);await second.ready;
  assert.equal(second.setDraftPrice(key,12),true);assert.equal(await second.savePrices(),true);assert.equal(f.wholeWrites.length,1);assert(new TextEncoder().encode(JSON.stringify(f.wholeWrites[0])).length>16*1024);assert.equal(Object.keys(f.wholeWrites[0].privateContent.notesBySpec).length,11);second.destroy();
});
