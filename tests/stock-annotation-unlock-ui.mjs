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
const ownerAccess=()=>({unlocked:true,eligible:true,owner:true,mode:'owner',expiresAt:null,message:''});
function upperHost(h){
  const target=new (h.nodes.get('stock-table').constructor)(),special=new Map(),originalQuery=target.querySelector.bind(target);
  target.querySelector=selector=>{
    if(['[data-upper-free-stage]','[data-upper-free-status]'].includes(selector)){
      if(!target.innerHTML.includes(selector.slice(1,-1)))return null;
      if(!special.has(selector))special.set(selector,new target.constructor(selector.includes('stage')?'button':'span'));
      return special.get(selector);
    }
    return originalQuery(selector);
  };
  target.contains=input=>['[data-stock-note]','[data-followup-edit]'].some(selector=>target.querySelectorAll(selector).includes(input));
  target.replaceChildren=()=>{target.innerHTML='';special.clear();};
  return target;
}
const upperNotes=target=>target.querySelectorAll('[data-stock-note]');
const upperFollowups=target=>target.querySelectorAll('[data-followup-edit]');
const stockIdentity=snapshot=>({revision:snapshot.revision,reportDate:snapshot.reportDate});
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

test('verified owner edits both linked surfaces and saves once without shared-code unlock',async()=>{
  const remote=registrySnapshot(),beforeRegistry=clone(remote.savedStockRegistry),writes=[];let unlockCalls=0,lockCalls=0;
  const h=harness({getAnnotationAccess:ownerAccess,readNotes:async()=>clone(remote),unlockAnnotations:async()=>{unlockCalls++;throw Error('owner must not request shared code');},lockAnnotations:()=>{lockCalls++;},prepareAnnotationsFile:async()=>({}),saveChanges:async payload=>{
    writes.push(clone(payload));for(const c of payload.notesChanges)remote.notesBySpec[c.key]=c.after;
    for(const c of payload.followupChanges)for(const row of remote.rows)for(const record of row.records)if(record.rawKey===c.rawKey)record.followup=c.after;
    return {snapshot:clone(remote)};
  }}),target=upperHost(h);await tick();h.api.attachFreeSurface(target,stockIdentity(remote));
  assert.equal(h.nodes.get('annotations-unlock').hidden,true);assert.equal(h.nodes.get('annotations-unlock-form').hidden,true);
  assert.equal(h.nodes.get('annotations-access-status').hidden,false);assert.match(h.nodes.get('annotations-access-status').textContent,/ผู้ดูแล.*ไม่ต้องใช้รหัส/);
  assert.equal(h.nodes.get('annotations-upload').disabled,false);assert.equal(h.input().disabled,false);assert.equal(h.followups()[0].disabled,false);
  assert.equal(upperNotes(target)[0].disabled,false);assert.equal(upperFollowups(target)[0].disabled,false);
  assert.equal(h.nodes.get('stock-table').querySelectorAll('[data-stock-note]').length,5,'lower registry still includes zero-Free rows');assert.equal(upperNotes(target).length,2,'upper list stays the positive-Free subset');
  await h.nodes.get('annotations-unlock').click();h.nodes.get('annotations-code').value='SYNTHETIC-IGNORED';await h.nodes.get('annotations-unlock-form').dispatch('submit');
  assert.equal(unlockCalls,0);assert.equal(lockCalls,0);assert.equal(h.nodes.get('annotations-code').value,'');
  const note=upperNotes(target)[0],followup=upperFollowups(target)[0],noteKey=note.dataset.stockNote,followupKey=followup.dataset.followupEdit,beforeNote=note.value,beforeFollowup=followup.value;
  note.value='owner upper note';await note.dispatch('input');assert.equal(h.input().value,'owner upper note');
  const lowerFollowup=h.followups().find(input=>input.dataset.followupEdit===followupKey);lowerFollowup.value='owner registry followup';await lowerFollowup.dispatch('input');assert.equal(followup.value,'owner registry followup');
  await target.querySelector('[data-upper-free-stage]').click();assert.equal(writes.length,0);assert.equal(h.nodes.get('notes-confirmation').hidden,false);
  await h.nodes.get('notes-confirm').click();assert.deepEqual(writes,[{notesChanges:[{key:noteKey,before:beforeNote,after:'owner upper note'}],followupChanges:[{rawKey:followupKey,before:beforeFollowup,after:'owner registry followup'}]}]);
  assert.equal(h.api.hasDirty(),false);assert.equal(h.input().value,'owner upper note');assert.equal(upperNotes(target)[0].value,'owner upper note');assert.equal(upperFollowups(target)[0].value,'owner registry followup');
  assert.deepEqual(clone(remote.savedStockRegistry),beforeRegistry);assert.equal(unlockCalls,0);h.api.destroy();
});

test('owner Excel upload still previews and confirms the shared annotation-only save',async()=>{
  const remote=trackingSnapshot(),writes=[];let uploadCalls=0,unlockCalls=0;
  const h=harness({getAnnotationAccess:ownerAccess,readNotes:async()=>clone(remote),unlockAnnotations:async()=>{unlockCalls++;},prepareAnnotationsFile:async()=>{
    uploadCalls++;return {snapshot:clone(remote),canApply:true,notesChanges:[{key,before:'before synthetic',after:'owner Excel note'}],followupChanges:[{rawKey,before:'before followup',after:'owner Excel followup'}],issues:[],counts:{notes:1,followup:1}};
  },saveChanges:async payload=>{writes.push(clone(payload));remote.notesBySpec[key]=payload.notesChanges[0].after;remote.rows[0].records[0].followup=payload.followupChanges[0].after;return {snapshot:clone(remote)};}});await tick();
  assert.equal(h.nodes.get('annotations-upload').disabled,false);h.nodes.get('notes-file').files=[{name:'synthetic-owner.xlsx'}];await h.nodes.get('notes-file').dispatch('change');
  assert.equal(uploadCalls,1);assert.equal(writes.length,0);assert.match(h.nodes.get('notes-import-preview').innerHTML,/owner Excel note/);assert.equal(h.api.hasDirty(),false);
  await h.nodes.get('notes-file-stage').click();assert.equal(writes.length,0);assert.equal(h.api.hasDirty(),true);await h.nodes.get('notes-confirm').click();
  assert.equal(writes.length,1);assert.equal(h.api.hasDirty(),false);assert.equal(unlockCalls,0);assert.equal(h.nodes.get('annotations-unlock').hidden,true);h.api.destroy();
});

test('owner labels never override denied capability or denied snapshot permissions, and losing proof preserves drafts',async()=>{
  for(const denied of ['capability','snapshot']){
    const remote=registrySnapshot();if(denied==='snapshot'){remote.canSave=false;remote.canEditFollowup=false;}
    const access=denied==='capability'?{...ownerAccess(),eligible:false,message:'Synthetic read-only Sales04'}:ownerAccess();let uploads=0,writes=0;
    const h=harness({getAnnotationAccess:()=>access,readNotes:async()=>clone(remote),prepareAnnotationsFile:async()=>{uploads++;return {};},saveChanges:async()=>{writes++;}}),target=upperHost(h);await tick();h.api.attachFreeSurface(target,stockIdentity(remote));
    assert.equal(h.input().disabled,true);assert.equal(h.followups()[0].disabled,true);assert.equal(upperNotes(target)[0].disabled,true);assert.equal(upperFollowups(target)[0].disabled,true);assert.equal(h.nodes.get('annotations-upload').disabled,true);
    upperNotes(target)[0].value='not authorized';await upperNotes(target)[0].dispatch('input');upperFollowups(target)[0].value='not authorized';await upperFollowups(target)[0].dispatch('input');assert.equal(h.api.hasDirty(),false);
    await h.nodes.get('annotations-upload').click();assert.equal(uploads,0);
    h.nodes.get('notes-file').files=[{name:'synthetic-denied.xlsx'}];await h.nodes.get('notes-file').dispatch('change');assert.equal(uploads,0,'denied permissions also block synthetic file-change dispatch before parsing');
    assert.equal(h.api.hasDirty(),false);assert.equal(writes,0);h.api.destroy();
  }
  let access=ownerAccess(),writes=0;const remote=registrySnapshot(),h=harness({getAnnotationAccess:()=>access,readNotes:async()=>clone(remote),unlockAnnotations:async()=>{throw Error('Synthetic invalid code');},lockAnnotations:()=>{access=locked();},saveChanges:async()=>{writes++;return clone(remote);}}),target=upperHost(h);await tick();h.api.attachFreeSurface(target,stockIdentity(remote));
  access=locked();h.api.applyNotesSnapshot(clone(remote));assert.equal(h.nodes.get('annotations-unlock').hidden,false);assert.equal(h.nodes.get('annotations-access-status').hidden,true);assert.equal(h.nodes.get('annotations-access-status').textContent,'');assert.equal(h.input().disabled,true);assert.equal(upperNotes(target)[0].disabled,true);
  await unlock(h);const status=h.nodes.get('annotations-access-status'),error=status.textContent;assert.match(error,/ปลดล็อกไม่สำเร็จ/);h.api.applyNotesSnapshot(clone(remote));assert.equal(status.hidden,false);assert.equal(status.textContent,error,'refresh preserves a locked-account error, not just the owner transition');
  status.textContent='หมดเวลาปลดล็อก · กรอกรหัสอีกครั้งเพื่อแก้ไขต่อ';h.api.applyNotesSnapshot(clone(remote));assert.equal(status.hidden,false);assert.match(status.textContent,/หมดเวลาปลดล็อก/);
  access=ownerAccess();h.api.applyNotesSnapshot(clone(remote));assert.match(status.textContent,/ผู้ดูแล/);assert.equal(h.input().disabled,false);assert.equal(upperNotes(target)[0].disabled,false);
  upperNotes(target)[0].value='owner draft survives session loss';await upperNotes(target)[0].dispatch('input');await target.querySelector('[data-upper-free-stage]').click();
  access={unlocked:false,eligible:false,owner:false,expiresAt:null,message:'Synthetic session expired'};await h.nodes.get('notes-confirm').click();
  assert.equal(writes,0);assert.equal(h.api.hasDirty(),true);assert.equal(h.input().disabled,true);assert.equal(upperNotes(target)[0].disabled,true);assert.equal(h.input().value,'owner draft survives session loss');assert.equal(h.nodes.get('annotations-unlock').hidden,false);assert.match(h.nodes.get('annotations-access-status').textContent,/session expired/);h.api.destroy();
});
