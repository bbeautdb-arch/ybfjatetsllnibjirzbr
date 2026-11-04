import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Synthetic fixtures only. The controller/server own authorization; these
// checks prove every view action honors the capability and shared CAS flow.
const source=fs.readFileSync(new URL('../stock_order_review.js',import.meta.url),'utf8');
const base=fs.readFileSync(new URL('./stock-order-review-ui.mjs',import.meta.url),'utf8');
const definitions=base.slice(base.indexOf('const copy ='),base.indexOf("\ntest('source-only"));
const context={source,css:'',salesGroupsSource:fs.readFileSync(new URL('../stock_sales_groups.js',import.meta.url),'utf8'),salesGroupsViewSource:fs.readFileSync(new URL('../stock_sales_groups_view.js',import.meta.url),'utf8'),vm,URL,Intl,console};
const {harness,trackingSnapshot,registrySnapshot,key,rawKey}=vm.runInNewContext(definitions+'\n({harness,trackingSnapshot,registrySnapshot,key,rawKey})',context);
const clone=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const granted=()=>({unlocked:true,eligible:true,expiresAt:'2099-01-01T00:00:00Z',message:''});
const locked=()=>({unlocked:false,eligible:true,expiresAt:null,message:''});
async function unlock(h,code='SYNTHETIC-NOT-A-PRODUCTION-CODE'){
  await h.nodes.get('annotations-unlock').click();h.nodes.get('annotations-code').value=code;
  await h.nodes.get('annotations-unlock-form').dispatch('submit');
}

test('minimal toolbar and named-account unlock gate both editors without changing the full registry',async()=>{
  let access=locked(),received='',remote=registrySnapshot();
  const h=harness({getAnnotationAccess:()=>access,readNotes:async()=>clone(remote),unlockAnnotations:async code=>{received=code;access=granted();return {access,snapshot:clone(remote)};},lockAnnotations:()=>{access=locked();},prepareAnnotationsFile:async()=>({})});await tick();
  const markup=h.shadow.children[1].innerHTML;
  assert.match(markup,/<input id="annotations-code" type="password" autocomplete="off"/);
  assert.doesNotMatch(markup,/จับคู่ความหนา เกรด ขนาดจริง และหน่วย|AE อาจเป็นคอลัมน์|ร่างอยู่ในแท็บนี้|<summary>นำเข้าหมายเหตุจาก Excel/);
  assert.doesNotMatch(h.nodes.get('stock-table').innerHTML,/stock-catalog-count|tracking-import-note|สต๊อกที่บันทึก · รายงาน/);
  assert.equal(h.input().disabled,true);assert.equal(h.followups()[0].disabled,true);
  assert.equal(h.nodes.get('notes-stage').hidden,true);assert.equal(h.nodes.get('annotations-upload').disabled,true);assert.equal(h.nodes.get('notes-status').hidden,true);
  assert.equal(h.nodes.get('stock-table').querySelectorAll('[data-stock-note]').length,5);
  h.input().value='not permitted';await h.input().dispatch('input');assert.equal(h.api.hasDirty(),false);
  await unlock(h);assert.equal(received,'SYNTHETIC-NOT-A-PRODUCTION-CODE');assert.equal(h.nodes.get('annotations-code').value,'');assert.equal(h.nodes.get('annotations-unlock-form').hidden,true);
  assert.equal(h.input().disabled,false);assert.equal(h.followups()[0].disabled,false);assert.equal(h.nodes.get('annotations-upload').disabled,false);
  h.input().value='draft retained after lock';await h.input().dispatch('input');assert.equal(h.nodes.get('notes-stage').hidden,false);
  await h.nodes.get('annotations-unlock').click();assert.equal(h.input().disabled,true);assert.equal(h.api.hasDirty(),true);assert.equal(h.nodes.get('notes-stage').disabled,true);
  assert.doesNotMatch(h.shadow.children[1].innerHTML,/SYNTHETIC-NOT-A-PRODUCTION-CODE/);h.api.destroy();
});

test('unlock field clears immediately and errors never echo the submitted code; ineligible accounts cannot unlock',async()=>{
  let release,access=locked();const secret='SYNTHETIC-PRIVATE-TEST-INPUT';
  const h=harness({getAnnotationAccess:()=>access,readNotes:async()=>trackingSnapshot(),unlockAnnotations:code=>new Promise((resolve,reject)=>{release=()=>reject(Error(code));}),lockAnnotations:()=>{access=locked();}});await tick();
  await h.nodes.get('annotations-unlock').click();h.nodes.get('annotations-code').value=secret;
  const pending=h.nodes.get('annotations-unlock-form').dispatch('submit');assert.equal(h.nodes.get('annotations-code').value,'');release();await pending;
  assert.equal(h.nodes.get('annotations-access-status').hidden,false);assert.doesNotMatch(h.nodes.get('annotations-access-status').textContent,new RegExp(secret));assert.equal(h.input().disabled,true);h.api.destroy();
  let calls=0;const denied=harness({getAnnotationAccess:()=>({unlocked:true,eligible:false,message:'เข้าสู่ระบบบัญชี AAF ก่อน'}),readNotes:async()=>trackingSnapshot(),unlockAnnotations:async()=>{calls++;}});await tick();
  await unlock(denied);assert.equal(calls,0);assert.equal(denied.input().disabled,true);assert.equal(denied.nodes.get('annotations-upload').disabled,true);assert.match(denied.nodes.get('annotations-access-status').textContent,/บัญชี AAF/);denied.api.destroy();
});

test('combined Excel preview stages notes and raw followup then one explicit save verifies both',async()=>{
  let access=granted(),remote=trackingSnapshot();const writes=[];
  const h=harness({getAnnotationAccess:()=>access,readNotes:async()=>clone(remote),prepareAnnotationsFile:async()=>({snapshot:clone(remote),canApply:true,notesChanges:[{key,before:'before synthetic',after:'imported note'}],followupChanges:[{rawKey,before:'before followup',after:'imported followup'}],issues:[],counts:{notes:1,followup:1}}),saveChanges:async payload=>{writes.push(clone(payload));for(const c of payload.notesChanges)remote.notesBySpec[c.key]=c.after;for(const c of payload.followupChanges)remote.rows[0].records[0].followup=c.after;return {snapshot:clone(remote)};}});await tick();
  h.nodes.get('notes-file').files=[{name:'synthetic.xlsx'}];await h.nodes.get('notes-file').dispatch('change');
  const preview=h.nodes.get('notes-import-preview').innerHTML;for(const text of ['before synthetic','before followup','imported note','imported followup'])assert(preview.includes(text));
  assert.equal(h.api.hasDirty(),false);assert.equal(writes.length,0);assert.equal(h.nodes.get('notes-file').value,'');
  await h.nodes.get('notes-file-stage').click();assert.equal(h.api.hasDirty(),true);assert.equal(writes.length,0);assert.match(h.nodes.get('notes-confirmation').innerHTML,/imported followup/);
  await h.nodes.get('notes-confirm').click();assert.deepEqual(writes,[{notesChanges:[{key,before:'before synthetic',after:'imported note'}],followupChanges:[{rawKey,before:'before followup',after:'imported followup'}]}]);
  assert.equal(h.api.hasDirty(),false);assert.equal(h.nodes.get('notes-stage').hidden,true);h.api.destroy();
});

test('expiry, changed snapshot and invalid imported raw identity never stage or write stale changes',async()=>{
  let access=granted(),remote=trackingSnapshot(),writes=0;
  const plan=()=>({snapshot:clone(remote),canApply:true,notesChanges:[{key,before:'before synthetic',after:'new note'}],followupChanges:[],issues:[]});
  const h=harness({getAnnotationAccess:()=>access,readNotes:async()=>clone(remote),prepareAnnotationsFile:async()=>plan(),saveChanges:async()=>{writes++;return remote;}});await tick();
  const upload=async()=>{h.nodes.get('notes-file').files=[{name:'synthetic.xlsx'}];await h.nodes.get('notes-file').dispatch('change');};
  await upload();access={...granted(),expiresAt:'2000-01-01T00:00:00Z'};await h.nodes.get('notes-file-stage').click();assert.equal(h.api.hasDirty(),false);assert.equal(writes,0);
  access=granted();await h.api.refreshNotes();await upload();remote.revision=2;h.api.applyNotesSnapshot(clone(remote));await h.nodes.get('notes-file-stage').click();assert.equal(h.api.hasDirty(),false);assert.equal(writes,0);
  h.input().value='manual draft';await h.input().dispatch('input');await h.nodes.get('notes-stage').click();access=locked();await h.nodes.get('notes-confirm').click();assert.equal(writes,0);assert.equal(h.api.hasDirty(),true);h.api.destroy();
  const invalid=harness({getAnnotationAccess:()=>granted(),readNotes:async()=>trackingSnapshot(),prepareAnnotationsFile:async()=>({snapshot:trackingSnapshot(),canApply:true,notesChanges:[],followupChanges:[{rawKey:'missing',before:'',after:'not guessed'}],issues:[]})});await tick();invalid.nodes.get('notes-file').files=[{}];await invalid.nodes.get('notes-file').dispatch('change');assert.doesNotMatch(invalid.nodes.get('notes-import-preview').innerHTML,/id="notes-file-stage"/);assert.equal(invalid.api.hasDirty(),false);invalid.api.destroy();
});
