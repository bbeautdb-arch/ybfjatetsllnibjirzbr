import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Reuse the synthetic registry and small DOM double from the existing review
// tests. No business captures, transport credentials or production writes.
const source=fs.readFileSync(new URL('../stock_order_review.js',import.meta.url),'utf8');
const base=fs.readFileSync(new URL('./stock-order-review-ui.mjs',import.meta.url),'utf8');
const definitions=base.slice(base.indexOf('const copy ='),base.indexOf("\ntest('source-only"))
  .replace('return { api, data, before, nodes, shadow,globalEvents,input:', 'return { api, data, before, nodes, shadow,globalEvents,ownerDocument:document,input:');
const context={source,css:'',salesGroupsSource:fs.readFileSync(new URL('../stock_sales_groups.js',import.meta.url),'utf8'),salesGroupsViewSource:fs.readFileSync(new URL('../stock_sales_groups_view.js',import.meta.url),'utf8'),vm,URL,Intl,console};
const {harness,registrySnapshot}=vm.runInNewContext(definitions+'\n({harness,registrySnapshot})',context);
const clone=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const identity=s=>({revision:s.revision,reportDate:s.reportDate});
function upperHost(h){
  const target=new (h.nodes.get('stock-table').constructor)(),special=new Map(),originalQuery=target.querySelector.bind(target),originalAll=target.querySelectorAll.bind(target);
  target.querySelector=selector=>{
    if(['[data-upper-free-stage]','[data-upper-free-status]'].includes(selector)){
      if(!target.innerHTML.includes(selector.slice(1,-1)))return null;
      if(!special.has(selector))special.set(selector,new target.constructor(selector.includes('stage')?'button':'span'));
      return special.get(selector);
    }
    return originalQuery(selector);
  };
  target.querySelectorAll=selector=>originalAll(selector).map(input=>{
    if(!input.testFocus){const focus=input.focus.bind(input);input.focus=()=>{focus();h.ownerDocument.activeElement=input;};input.testFocus=true;}return input;
  });
  target.contains=input=>['[data-stock-note]','[data-followup-edit]'].some(selector=>target.querySelectorAll(selector).includes(input));
  target.replaceChildren=()=>{target.innerHTML='';special.clear();};
  return target;
}
const notes=root=>root.querySelectorAll('[data-stock-note]');
const follows=root=>root.querySelectorAll('[data-followup-edit]');

test('upper Free uses only matching saved registry, real saved Free, separate unit totals and full-month-independent list',async()=>{
  const remote=registrySnapshot(),before=JSON.stringify(remote),h=harness({readNotes:async()=>clone(remote)}),target=upperHost(h);
  h.api.attachFreeSurface(target,identity(remote));assert.match(target.innerHTML,/รออ่านทะเบียนส่วนกลาง/);assert.equal(notes(target).length,0);
  await tick();assert.equal(notes(target).length,2);assert.equal(follows(target).length,2);
  assert.match(target.innerHTML,/<th>Physical<\/th><th>Free<\/th>/);
  assert.match(target.innerHTML,/รวม แผ่น<\/th><td>12<\/td><td>9<\/td>/);
  assert.match(target.innerHTML,/รวม ชิ้นไม้แถบ<\/th><td>20<\/td><td>16<\/td>/);
  assert.doesNotMatch(target.innerHTML,/data-upper-free-raw-key="w200_l100_t2_gA"/);
  const list=target.innerHTML;h.api.setView('6');assert.equal(target.innerHTML,list);
  assert.equal(h.nodes.get('stock-table').querySelectorAll('[data-stock-note]').length,5);
  assert.equal(JSON.stringify(remote),before);h.api.destroy();assert.equal(target.innerHTML,'');
});

test('upper and registry share note and raw tracking drafts both ways without rebuilding on typing or repeated attachment',async()=>{
  const remote=registrySnapshot(),h=harness({readNotes:async()=>clone(remote)}),target=upperHost(h);await tick();h.api.attachFreeSurface(target,identity(remote));
  const upper=notes(target)[0],tracking=follows(target)[0],stock=h.input(),stockTracking=h.followups().find(i=>i.dataset.followupEdit===tracking.dataset.followupEdit);
  upper.focus();upper.setSelectionRange(3,3,'none');upper.value='from upper';await upper.dispatch('input');
  assert.equal(stock.value,'from upper');assert.equal(notes(target)[0],upper);assert.equal(h.ownerDocument.activeElement,upper);assert.equal(upper.selectionStart,3);
  h.api.attachFreeSurface(target,identity(remote));assert.equal(notes(target)[0],upper);
  stock.value='from lower';await stock.dispatch('input');assert.equal(upper.value,'from lower');
  tracking.value='upper followup';await tracking.dispatch('input');assert.equal(stockTracking.value,'upper followup');
  stockTracking.value='';await stockTracking.dispatch('input');assert.equal(tracking.value,'');
  upper.value='';await upper.dispatch('input');assert.equal(stock.value,'');assert.equal(h.api.hasDirty(),true);
  h.api.destroy();
});

test('one shared confirmation saves upper note and explicitly empty raw followup only once',async()=>{
  let remote=registrySnapshot();const writes=[],h=harness({readNotes:async()=>clone(remote),saveChanges:async payload=>{writes.push(clone(payload));for(const c of payload.notesChanges)remote.notesBySpec[c.key]=c.after;for(const c of payload.followupChanges)for(const row of remote.rows)for(const record of row.records)if(record.rawKey===c.rawKey)record.followup=c.after;return clone(remote);}}),target=upperHost(h);await tick();h.api.attachFreeSurface(target,identity(remote));
  const upper=notes(target)[0],tracking=follows(target)[0],key=upper.dataset.stockNote,rawKey=tracking.dataset.followupEdit,beforeNote=upper.value,beforeFollowup=tracking.value;
  upper.value='only new note';await upper.dispatch('input');tracking.value='';await tracking.dispatch('input');
  await target.querySelector('[data-upper-free-stage]').click();assert.equal(writes.length,0);assert.match(h.nodes.get('notes-confirmation').innerHTML,/ล้างข้อความเดิม/);
  await h.nodes.get('notes-confirm').click();assert.deepEqual(writes,[{notesChanges:[{key,before:beforeNote,after:'only new note'}],followupChanges:[{rawKey,before:beforeFollowup,after:''}]}]);
  assert.equal(h.api.hasDirty(),false);assert.equal(notes(target)[0].value,'only new note');assert.equal(follows(target)[0].value,'');h.api.destroy();
});

test('identity mismatch and invalidated snapshots hide upper quantities/editors but retain drafts for fresh recovery',async()=>{
  let remote=registrySnapshot();const h=harness({readNotes:async()=>clone(remote)}),target=upperHost(h);await tick();h.api.attachFreeSurface(target,identity(remote));notes(target)[0].value='keep me';await notes(target)[0].dispatch('input');
  h.api.attachFreeSurface(target,{...identity(remote),revision:2});assert.match(target.innerHTML,/รออ่านทะเบียนส่วนกลาง/);assert.equal(notes(target).length,0);assert.equal(h.api.hasDirty(),true);
  h.api.attachFreeSurface(target,identity(remote));assert.equal(notes(target)[0].value,'keep me');
  const bad=clone(remote);bad.savedStockRegistry.rows[0].freeQty=-1;assert.throws(()=>h.api.applyNotesSnapshot(bad));assert.match(target.innerHTML,/รออ่านทะเบียนส่วนกลาง/);assert.equal(follows(target).length,0);
  h.api.applyNotesSnapshot(remote);assert.equal(notes(target)[0].value,'keep me');h.api.destroy();
});

test('upper permissions, remote conflicts and uncertain saves use the existing shared blockers',async()=>{
  let remote=registrySnapshot(),calls=0;remote.canSave=false;remote.canEditFollowup=false;
  const h=harness({readNotes:async()=>clone(remote),saveChanges:async()=>{calls++;throw Error('synthetic uncertain');}}),target=upperHost(h);await tick();h.api.attachFreeSurface(target,identity(remote));
  assert.equal(notes(target)[0].disabled,true);assert.equal(follows(target)[0].disabled,true);
  notes(target)[0].value='injected';await notes(target)[0].dispatch('input');follows(target)[0].value='injected';await follows(target)[0].dispatch('input');assert.equal(h.api.hasDirty(),false);
  remote.canSave=true;remote.canEditFollowup=true;await h.api.refreshNotes();const n=notes(target)[0],key=n.dataset.stockNote;n.value='retain draft';await n.dispatch('input');
  remote.notesBySpec[key]='new remote';await h.api.refreshNotes();assert.equal(notes(target)[0].value,'retain draft');assert.match(target.innerHTML,/new remote/);assert.equal(target.querySelector('[data-upper-free-stage]').disabled,true);assert.equal(calls,0);
  // The minimal inherited DOM double does not parse note-conflict buttons; use
  // the same snapshot state to resolve without introducing a fake production write.
  remote.notesBySpec[key]='retain draft';await h.api.refreshNotes();assert.equal(h.api.hasDirty(),false);
  follows(target)[0].value='pending followup';await follows(target)[0].dispatch('input');await target.querySelector('[data-upper-free-stage]').click();await h.nodes.get('notes-confirm').click();
  assert.equal(calls,1);assert.equal(h.api.hasDirty(),true);assert.equal(target.querySelector('[data-upper-free-stage]').disabled,true);assert.equal(follows(target)[0].value,'pending followup');
  h.api.destroy();
});

test('reattachment and selected-review rebuild preserve drafts and bind current-generation confirmation',async()=>{
  const remote=registrySnapshot(),writes=[],h=harness({readNotes:async()=>clone(remote),saveChanges:async payload=>{writes.push(clone(payload));for(const c of payload.notesChanges)remote.notesBySpec[c.key]=c.after;return clone(remote);}}),first=upperHost(h);await tick();h.api.attachFreeSurface(first,identity(remote));
  notes(first)[0].value='draft across repaint';await notes(first)[0].dispatch('input');const second=upperHost(h);h.api.attachFreeSurface(second,identity(remote));assert.equal(first.innerHTML,'');assert.equal(notes(second)[0].value,'draft across repaint');
  h.api.update(clone(h.data));assert.equal(notes(second)[0].value,'draft across repaint');await second.querySelector('[data-upper-free-stage]').click();await h.nodes.get('notes-confirm').click();assert.equal(writes.length,1);assert.equal(h.api.hasDirty(),false);
  h.api.attachFreeSurface(null,null);assert.equal(second.innerHTML,'');h.api.destroy();
});

test('verified-save refresh callback runs once after draft/save locks clear, never for uncertain or failed saves',async()=>{
  for(const result of ['verified','unresolved','failed']){
    let remote=registrySnapshot(),callbacks=0,writes=0;
    const h=harness({readNotes:async()=>clone(remote),saveChanges:async payload=>{
      writes++;if(result==='failed')throw Error('synthetic failure');
      for(const c of payload.notesChanges)remote.notesBySpec[c.key]=c.after;
      remote.revision++;remote.catalogRevision++;remote.savedStockRegistry.revision=remote.revision;
      if(result==='unresolved')remote.saveUnresolved=true;return clone(remote);
    },onSavedVerified:async()=>{
      callbacks++;assert.equal(h.api.hasDirty(),false);
      // readNotes would be rejected by the existing UI lock if invoked early.
      await h.api.refreshNotes();assert.equal(h.api.hasDirty(),false);
      h.api.setStockIdentity(identity(remote));h.api.attachFreeSurface(target,identity(remote));
    }}),target=upperHost(h);await tick();h.api.attachFreeSurface(target,identity(remote));
    notes(target)[0].value='verified callback draft';await notes(target)[0].dispatch('input');
    await target.querySelector('[data-upper-free-stage]').click();await h.nodes.get('notes-confirm').click();
    assert.equal(writes,1);assert.equal(callbacks,result==='verified'?1:0);
    assert.equal(h.api.hasDirty(),result!=='verified');
    if(result==='verified'){assert.equal(notes(target)[0].value,'verified callback draft');assert.equal(target.querySelector('[data-upper-free-stage]').disabled,true);}
    h.api.destroy();
  }
});

test('refresh callback failure retains verified save without retrying the annotation write',async()=>{
  const remote=registrySnapshot();let callbacks=0,writes=0;
  const h=harness({readNotes:async()=>clone(remote),saveChanges:async payload=>{writes++;for(const c of payload.notesChanges)remote.notesBySpec[c.key]=c.after;return clone(remote);},onSavedVerified:async()=>{callbacks++;throw Error('synthetic refresh failure');}}),target=upperHost(h);await tick();h.api.attachFreeSurface(target,identity(remote));
  notes(target)[0].value='saved once';await notes(target)[0].dispatch('input');await target.querySelector('[data-upper-free-stage]').click();await h.nodes.get('notes-confirm').click();
  assert.equal(writes,1);assert.equal(callbacks,1);assert.equal(h.api.hasDirty(),false);assert.match(h.nodes.get('notes-status').textContent,/ไม่ต้องบันทึกข้อความซ้ำ/);
  await h.api.refreshNotes();assert.equal(writes,1);assert.equal(callbacks,1);h.api.destroy();
});
