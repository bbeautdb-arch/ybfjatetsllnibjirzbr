import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../stock_sales_controller.js',import.meta.url),'utf8');
const helpers=fs.readFileSync(new URL('./stock-sales-controller.mjs',import.meta.url),'utf8');
const {runtime,response,canonicalState}=vm.runInNewContext(helpers.slice(helpers.indexOf('const canonicalState='),helpers.indexOf('// Public controller and assets'))+';({runtime,response,canonicalState})',{source,vm,URL,JSON,Promise,Error,console,setImmediate,assert});
const clone=value=>JSON.parse(JSON.stringify(value)),key='2.5|AAA|1220|2440|sheet';
async function fixture(salesMode=false){
  const r=runtime(),initial=canonicalState();initial.privateContent.notesBySpec={[key]:'before'};
  r.setToken('SYNTHETIC-SESSION');if(salesMode)r.api.setAccess({salesMode:true,revision:10});
  const initialResponse={...response('A',{widgetState:initial,catalogRevision:5}),permissions:{pricesAndNotes:true}};
  r.enqueue(initialResponse);await r.api.attach(r.slot());
  return{r,store:r.mounts[0].options.store,initial,initialResponse};
}
test('owner and sales note imports send only a patch and require fresh preflight plus readback',async()=>{
  for(const salesMode of [false,true]){
    const f=await fixture(salesMode),saved=clone(f.initial);saved.privateContent.notesBySpec[key]='after';saved.privateContent.savedAt='2026-10-02T00:00:01Z';
    f.r.enqueue(f.initialResponse);f.r.enqueue(response('A',{widgetState:saved,catalogRevision:6,revision:11}));f.r.enqueue(response('A',{widgetState:saved,catalogRevision:6,revision:11}));
    const result=await f.store.updateNotes([{key,before:'before',after:'after'}]);assert.deepEqual(clone(result),saved);
    const posts=f.r.fetchCalls.filter(call=>call.init.method==='POST');assert.equal(posts.length,1);
    assert.deepEqual(JSON.parse(posts[0].init.body),{action:'saveSalesNotes',expectedRevision:10,expectedCatalogRevision:5,notesBySpec:{[key]:'after'}});
    assert.equal(f.r.fetchCalls.length,4);assert.match(f.r.fetchCalls[1].url,/catalogOnly=1/);assert.match(f.r.fetchCalls[3].url,/catalogOnly=1/);
    assert.deepEqual(clone(f.store.load()),saved,'in-memory committed baseline advances only after verified readback');
    const second=clone(saved);second.privateContent.notesBySpec[key]='second';second.privateContent.savedAt='2026-10-02T00:00:02Z';
    f.r.enqueue(response('A',{widgetState:saved,catalogRevision:6,revision:11}));f.r.enqueue(response('A',{widgetState:second,catalogRevision:7,revision:12}));f.r.enqueue(response('A',{widgetState:second,catalogRevision:7,revision:12}));
    assert.deepEqual(clone(await f.store.updateNotes([{key,before:'after',after:'second'}])),second,'second import uses its own acknowledged global revision');
    assert.equal(JSON.parse(f.r.fetchCalls.filter(call=>call.init.method==='POST').at(-1).init.body).expectedRevision,11);
  }
});
test('preflight rejects stale catalog, changed stock, stale note before-value and unsaved drafts without writing',async()=>{
  for(const issue of ['catalog','stock','before','dirty']){
    const f=await fixture();const latest=clone(f.initialResponse);if(issue==='catalog')latest.catalogRevision++;if(issue==='stock')latest.revision++;if(issue==='before')latest.widgetState.privateContent.notesBySpec[key]='changed';
    if(issue==='dirty')f.r.mounts[0].state.dirty=true;else f.r.enqueue(latest);
    await assert.rejects(f.store.updateNotes([{key,before:'before',after:'after'}]));assert.equal(f.r.fetchCalls.filter(call=>call.init.method==='POST').length,0,issue);
  }
});
test('acknowledged response cannot change price/FX and uncertain outcomes block a second write',async()=>{
  const f=await fixture(),tampered=clone(f.initial);tampered.privateContent.notesBySpec[key]='after';tampered.privateContent.prices[key]=999;
  f.r.enqueue(f.initialResponse);f.r.enqueue(response('A',{widgetState:tampered,catalogRevision:6,revision:11}));
  await assert.rejects(f.store.updateNotes([{key,before:'before',after:'after'}]),error=>error.code==='readback-mismatch');
  await assert.rejects(f.store.updateNotes([{key,before:'before',after:'after'}]),error=>error.code==='readback-mismatch');
  assert.equal(f.r.fetchCalls.filter(call=>call.init.method==='POST').length,1);
});
test('fresh readback mismatch does not claim success or advance local catalog',async()=>{
  const f=await fixture(),saved=clone(f.initial);saved.privateContent.notesBySpec[key]='after';saved.privateContent.savedAt='2026-10-02T00:00:01Z';
  f.r.enqueue(f.initialResponse);f.r.enqueue(response('A',{widgetState:saved,catalogRevision:6,revision:11}));f.r.enqueue(response('A',{widgetState:f.initial,catalogRevision:6,revision:11}));
  await assert.rejects(f.store.updateNotes([{key,before:'before',after:'after'}]),error=>error.code==='readback-mismatch');assert.deepEqual(clone(f.store.load()),clone(f.initial));
});
test('a manual catalog save advances the baseline for a following notes-only import',async()=>{
  const f=await fixture(),manual=clone(f.initial);manual.privateContent.notesBySpec[key]='manual';
  f.r.enqueue(f.initialResponse);f.r.enqueue(response('A',{widgetState:manual,catalogRevision:6,revision:11}));
  await f.store.setWidgetState(manual);
  const saved=clone(manual);saved.privateContent.notesBySpec[key]='manual\nexcel';saved.privateContent.savedAt='2026-10-03T00:00:00Z';
  f.r.enqueue(response('A',{widgetState:manual,catalogRevision:6,revision:11}));f.r.enqueue(response('A',{widgetState:saved,catalogRevision:7,revision:12}));f.r.enqueue(response('A',{widgetState:saved,catalogRevision:7,revision:12}));
  assert.deepEqual(clone(await f.store.updateNotes([{key,before:'manual',after:'manual\nexcel'}])),saved);
  const body=JSON.parse(f.r.fetchCalls.filter(call=>call.init.method==='POST').at(-1).init.body);assert.equal(body.expectedRevision,11);assert.equal(body.action,'saveSalesNotes');
});
