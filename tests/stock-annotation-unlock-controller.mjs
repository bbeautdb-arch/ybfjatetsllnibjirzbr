import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {createAnnotationUnlockService,createNotesService}=require('../stock_order_controller.js');
const core=require('../stock_review_notes_bridge.js');
const copy=v=>JSON.parse(JSON.stringify(v));
const epoch=Date.parse('2026-11-05T00:00:00Z'),key='2|A|100|200|sheet',rawKey='w100_l200_t2_gA';
const good=()=>({unlockToken:'SYNTHETIC-GRANT-NOT-A-REAL-SECRET',annotationAccess:{eligible:true,unlocked:true,expiresAt:new Date(epoch+30*60*1000).toISOString(),message:'unlocked'}});
function unlockHarness(){
  let token='SYNTHETIC-SESSION',clock=epoch,handler=async()=>good();const calls=[];
  const service=createAnnotationUnlockService({token:()=>token,now:()=>clock,unlock:async code=>{calls.push(code);return handler(code);},
    get localStorage(){throw Error('persistent storage prohibited');},get sessionStorage(){throw Error('persistent storage prohibited');}});
  return {service,calls,setToken:v=>token=v,setNow:v=>clock=v,setHandler:f=>handler=f};
}
function data(){return {
  stock:{ok:true,revision:1,report:{reportDate:'2026-11-04'},permissions:{followup:true},rows:[{key:rawKey,w:100,l:200,t:2,grade:'A',unit:'sheet',qty:10,freeQty:3,committedQty:7,followup:'before followup'}]},
  catalog:{ok:true,revision:1,catalogRevision:2,stockReportDate:'2026-11-04',permissions:{annotations:true,pricesAndNotes:false},widgetState:{privateContent:{prices:{[key]:9},currencies:{[key]:'THB'},notesByThickness:{},notesBySpec:{[key]:'before note'},savedAt:'2026-11-04T00:00:00Z'}}}
};}
function notesHarness(){
  const records=data(),calls=[],parseCalls=[];let unlocked=true,scope='same-session',hook=null,parseHook=null,gateCalls=0;
  const env={core,now:()=>epoch,scope:()=>scope,requireUnlocked:()=>{gateCalls++;if(!unlocked)throw Object.assign(Error('locked'),{code:'permission-denied'});},
    request:async(suffix,payload)=>{calls.push({suffix,payload});if(hook)await hook(suffix,payload);return copy(suffix.includes('catalog')?records.catalog:records.stock);},
    parseAnnotationsFile:async(file,rows,notes)=>{parseCalls.push({file,rows:copy(rows),notes:copy(notes)});if(parseHook)await parseHook();return {notesChanges:[{key,before:'before note',after:'after note'}],followupChanges:[],issues:[],canApply:true};}
  };
  const service=createNotesService(env);
  return {service,records,calls,parseCalls,getGateCalls:()=>gateCalls,setUnlocked:v=>unlocked=v,setScope:v=>scope=v,setHook:f=>hook=f,setParseHook:f=>parseHook=f};
}
test('unlock is tab-memory only, exposes no grant through UI access and expires exactly on time',async()=>{
  const h=unlockHarness();assert.equal(h.service.header(),'');assert.equal(h.service.getAccess().unlocked,false);
  const access=await h.service.unlock('synthetic-code');assert.equal(access.unlocked,true);assert.equal(access.eligible,true);assert.equal(h.service.header(),good().unlockToken);assert.doesNotMatch(JSON.stringify(access),/SYNTHETIC-GRANT|synthetic-code/);
  h.setNow(epoch+30*60*1000);assert.equal(h.service.header(),'');assert.equal(h.service.getAccess().unlocked,false);assert.equal(h.service.getAccess().expiresAt,null);
  const source=fs.readFileSync(new URL('../stock_order_controller.js',import.meta.url),'utf8').split('function createAnnotationUnlockService(env)')[1].split('function createNotesService(env)')[0];
  assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|cookie|writeFile|console\./);
});
test('session mismatch revokes a grant, including a session change while unlock is pending',async()=>{
  const h=unlockHarness();await h.service.unlock('synthetic-code');h.setToken('different-session');assert.equal(h.service.header(),'');
  const pending=unlockHarness();let resolve;pending.setHandler(()=>new Promise(r=>resolve=r));const unlocking=pending.service.unlock('synthetic-code');pending.setToken('different-session');resolve(good());
  await assert.rejects(unlocking,e=>e.code==='session-changed');assert.equal(pending.service.header(),'');
});
test('invalid local codes never contact the backend and missing session cannot unlock',async()=>{
  for(const code of ['', '   ', null, false, 123, 'x'.repeat(257)]){const h=unlockHarness();await assert.rejects(h.service.unlock(code),e=>e.code==='invalid-code');assert.equal(h.calls.length,0);assert.equal(h.service.header(),'');}
  const h=unlockHarness();h.setToken('');await assert.rejects(h.service.unlock('synthetic-code'),e=>e.code==='auth-required');assert.equal(h.calls.length,0);
});
test('bad code, ineligible account, expired or overlong-duration server grant remain locked',async()=>{
  const bad=unlockHarness();bad.setHandler(async()=>{throw Object.assign(Error('bad code'),{code:'unlock-rejected'});});await assert.rejects(bad.service.unlock('wrong'));assert.equal(bad.service.header(),'');
  for(const change of [{eligible:false},{unlocked:false},{expiresAt:'invalid'},{expiresAt:new Date(epoch).toISOString()},{expiresAt:new Date(epoch+32*60*1000).toISOString()}]){
    const h=unlockHarness();h.setHandler(async()=>({...good(),annotationAccess:{...good().annotationAccess,...change}}));await assert.rejects(h.service.unlock('synthetic-code'),e=>e.code==='unlock-rejected');assert.equal(h.service.header(),'');
  }
  const noToken=unlockHarness();noToken.setHandler(async()=>({...good(),unlockToken:''}));await assert.rejects(noToken.service.unlock('synthetic-code'));assert.equal(noToken.service.header(),'');
});
test('malformed non-boolean eligibility cannot mint an unlocked grant',async()=>{
  for(const change of [{eligible:'true'},{eligible:1},{unlocked:'true'},{unlocked:1}]){
    const h=unlockHarness();h.setHandler(async()=>({...good(),annotationAccess:{...good().annotationAccess,...change}}));await assert.rejects(h.service.unlock('synthetic-code'),e=>e.code==='unlock-rejected');assert.equal(h.service.header(),'');
  }
  const h=unlockHarness();h.setHandler(async()=>null);await assert.rejects(h.service.unlock('synthetic-code'),e=>e.code==='unlock-rejected');
});
test('explicit lock cancels a pending unlock response instead of reopening editing later',async()=>{
  const h=unlockHarness();let resolve;h.setHandler(()=>new Promise(r=>resolve=r));const unlocking=h.service.unlock('synthetic-code');h.service.lock();resolve(good());
  await assert.rejects(unlocking);assert.equal(h.service.header(),'');assert.equal(h.service.getAccess().unlocked,false);
});
test('explicit annotations permission overrides legacy price-and-note permission',()=>{
  for(const [value,expected] of [[true,true],[false,false],[null,false],['true',false],[1,false]]){
    const f=data();f.catalog.permissions={annotations:value,pricesAndNotes:true};assert.equal(core.parseSnapshot(f.stock,f.catalog,epoch).snapshot.canSave,expected,'annotations='+value);
  }
  const f=data();f.catalog.permissions={pricesAndNotes:true};assert.equal(core.parseSnapshot(f.stock,f.catalog,epoch).snapshot.canSave,true);
});
test('combined file preparation requires unlock and both permissions; uses fresh exact raw rows',async()=>{
  const locked=notesHarness();locked.setUnlocked(false);await assert.rejects(locked.service.prepareAnnotationsFile({name:'synthetic.xlsx'}),e=>e.code==='permission-denied');assert.equal(locked.calls.length,0);assert.equal(locked.parseCalls.length,0);
  for(const field of ['annotations','followup']){
    const h=notesHarness();if(field==='annotations')h.records.catalog.permissions.annotations=false;else h.records.stock.permissions.followup=false;
    await assert.rejects(h.service.prepareAnnotationsFile({name:'synthetic.xlsx'}),e=>e.code==='read-only');assert.equal(h.parseCalls.length,0);assert.equal(h.calls.length,2);
  }
  const h=notesHarness(),file={name:'synthetic.xlsx'},p=await h.service.prepareAnnotationsFile(file);assert.equal(p.canApply,true);assert.equal(h.parseCalls.length,1);assert.deepEqual(h.parseCalls[0].rows,h.records.stock.rows);assert.equal(h.parseCalls[0].notes[key],'before note');assert.equal(h.getGateCalls(),2);assert(h.calls.every(c=>!c.payload));
});
test('file preparation rejects unlock expiry or session switch while parsing without writing',async()=>{
  for(const kind of ['lock','session']){
    const h=notesHarness();h.setParseHook(async()=>kind==='lock'?h.setUnlocked(false):h.setScope('other-session'));await assert.rejects(h.service.prepareAnnotationsFile({name:'synthetic.xlsx'}),e=>e.code===(kind==='lock'?'permission-denied':'session-changed'));assert(h.calls.every(c=>!c.payload));
  }
});
test('saving needs a current grant both before reading and immediately before POST',async()=>{
  const payload={notesChanges:[{key,before:'before note',after:'after note'}],followupChanges:[]};
  const locked=notesHarness();locked.setUnlocked(false);await assert.rejects(locked.service.saveChanges(payload),e=>e.code==='permission-denied');assert.equal(locked.calls.length,0);assert.equal(locked.service.isUncertain(),false);
  const expired=notesHarness();expired.setHook(async suffix=>{if(suffix.includes('catalog'))expired.setUnlocked(false);});await assert.rejects(expired.service.saveChanges(payload),e=>e.code==='permission-denied');assert.equal(expired.calls.filter(c=>c.payload).length,0);assert.equal(expired.service.isUncertain(),false);assert.equal(expired.service.isBusy(),false);
});
