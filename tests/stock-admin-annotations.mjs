// Synthetic identity/data only. Restore existing named owner authority without
// making a shared link, cached role, or staff code into an administrator.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),core=require('../stock_review_notes_bridge.js');
const {createAnnotationUnlockService,createNotesService}=require('../stock_order_controller.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const epoch=Date.parse('2026-11-05T00:00:00Z'),key='2|A|100|200|sheet',rawKey='w100_l200_t2_gA';
function fixture(){return {
  stock:{ok:true,revision:1,updatedAt:'2026-11-04T00:00:00Z',report:{reportDate:'2026-11-04'},
    actor:{username:'admin',role:'admin',owner:true},permissions:{note:true,followup:true,adjust:true,import:true},
    annotationAccess:{eligible:true,unlocked:false,expiresAt:null,message:'Staff code required'},
    rows:[{key:rawKey,w:100,l:200,t:2,grade:'A',unit:'sheet',qty:10,freeQty:3,committedQty:7,followup:'before followup',priceObj:{price:9,currency:'THB'}}]},
  catalog:{ok:true,revision:1,catalogRevision:2,stockReportDate:'2026-11-04',permissions:{annotations:false,pricesAndNotes:true},
    widgetState:{privateContent:{prices:{[key]:9},currencies:{[key]:'THB'},notesByThickness:{},notesBySpec:{[key]:'before note'},savedAt:'2026-11-04T00:00:00Z'}}}
};}
function harness(){
  let token='SYNTHETIC-OWNER-SESSION',clock=epoch;const unlockCalls=[];
  const service=createAnnotationUnlockService({token:()=>token,now:()=>clock,unlock:async code=>{
    unlockCalls.push(code);return {unlockToken:'SYNTHETIC-STAFF-GRANT',annotationAccess:{eligible:true,unlocked:true,expiresAt:new Date(clock+1800000).toISOString(),message:'Staff unlocked'}};
  }});
  return {service,unlockCalls,setToken:v=>token=v,setNow:v=>clock=v};
}

test('owner helper requires the exact authenticated owner actor and explicit current administrative permissions',()=>{
  const f=fixture();assert.equal(core.isAuthenticatedAnnotationOwner(f.stock),true);
  for(const mutation of [
    s=>delete s.actor,s=>s.actor.owner=false,s=>s.actor.owner='true',s=>s.actor.role='stock_sales',
    s=>s.actor.username='other-admin',s=>s.actor.scope='sales-link',s=>s.actor.role='stock_link',
    s=>s.permissions.note=false,s=>s.permissions.followup=false,s=>s.permissions.adjust=false,
    s=>s.permissions.note='true',s=>delete s.permissions
  ]){
    const stock=copy(f.stock);mutation(stock);assert.equal(core.isAuthenticatedAnnotationOwner(stock),false);
  }
  for(const value of [null,undefined,{},'admin',{owner:true},{role:'admin'}])assert.equal(core.isAuthenticatedAnnotationOwner(value),false);
});

test('fresh owner can edit notes and followup without staff annotation grant while the catalog permission remains required',()=>{
  const f=fixture(),before=JSON.stringify(f),snapshot=core.parseSnapshot(f.stock,f.catalog,epoch).snapshot;
  assert.equal(snapshot.canSave,true);assert.equal(snapshot.canEditFollowup,true);
  assert.equal(f.catalog.permissions.annotations,false);assert.equal(f.stock.annotationAccess.unlocked,false);
  assert.equal(JSON.stringify(f),before,'reading does not rewrite a grant or permissions');
  for(const value of [false,null,'true',undefined]){
    const catalog=copy(f.catalog);catalog.permissions.pricesAndNotes=value;
    assert.equal(core.parseSnapshot(f.stock,catalog,epoch).snapshot.canSave,false);
  }
});

test('staff and sales-link snapshots cannot use owner exception despite catalog pricesAndNotes permission',()=>{
  const f=fixture();
  for(const actor of [
    {username:'admin',role:'admin',owner:false},
    {username:'synthetic-sales',role:'stock_sales',owner:false},
    {username:'sales-link:'+'a'.repeat(32),role:'stock_link',scope:'sales-link',owner:false}
  ]){
    const stock={...copy(f.stock),actor};assert.equal(core.parseSnapshot(stock,f.catalog,epoch).snapshot.canSave,false);
  }
  const staff={...copy(f.stock),actor:{username:'synthetic-sales',role:'stock_sales',owner:false}},catalog=copy(f.catalog);
  catalog.permissions.annotations=true;assert.equal(core.parseSnapshot(staff,catalog,epoch).snapshot.canSave,true,'staff grant path remains valid');
});

test('owner mode is scoped in tab memory and never mints or exposes a staff unlock header',()=>{
  const h=harness();assert.equal(h.service.getAccess().unlocked,false);
  h.service.observeStock(fixture().stock);const access=h.service.getAccess();
  assert.equal(access.owner,true);assert.equal(access.mode,'owner');assert.equal(access.eligible,true);
  assert.equal(access.unlocked,true);assert.equal(access.expiresAt,null);assert.equal(h.service.header(),'');
  assert.equal(h.unlockCalls.length,0);assert.doesNotMatch(JSON.stringify(access),/SYNTHETIC-OWNER-SESSION/);
});

test('a staff unlock response arriving after fresh owner proof never adds an unlock header to owner requests',async()=>{
  let release;const pending=new Promise(resolve=>release=resolve);
  const service=createAnnotationUnlockService({token:()=> 'SYNTHETIC-OWNER-SESSION',now:()=>epoch,unlock:()=>pending});
  const unlocking=service.unlock('synthetic-code');
  service.observeStock(fixture().stock);assert.equal(service.getAccess().owner,true);assert.equal(service.header(),'');
  release({unlockToken:'SYNTHETIC-LATE-STAFF-GRANT',annotationAccess:{eligible:true,unlocked:true,expiresAt:new Date(epoch+1800000).toISOString()}});
  await unlocking;
  assert.equal(service.getAccess().owner,true);assert.equal(service.getAccess().unlocked,true);assert.equal(service.header(),'');
  assert.doesNotMatch(JSON.stringify(service.getAccess()),/SYNTHETIC-LATE-STAFF-GRANT|SYNTHETIC-OWNER-SESSION/);
});

test('catalog annotation access cannot revoke owner proof, but a fresh non-owner stock response does',()=>{
  const h=harness();h.service.observeStock(fixture().stock);
  h.service.observe({eligible:true,unlocked:false,expiresAt:null,message:'Staff code required'});
  assert.equal(h.service.getAccess().owner,true);assert.equal(h.service.getAccess().unlocked,true);
  const staff=fixture().stock;staff.actor={username:'synthetic-sales',role:'stock_sales',owner:false};
  h.service.observeStock(staff);assert.notEqual(h.service.getAccess().owner,true);assert.equal(h.service.getAccess().unlocked,false);assert.equal(h.service.header(),'');
});

test('missing current owner proof, session switch, logout and explicit invalidation all fail closed',()=>{
  for(const revoke of [h=>h.service.observeStock({}),h=>h.service.observeStock(null),h=>h.setToken('SYNTHETIC-OTHER-SESSION'),h=>h.setToken(''),h=>h.service.lock()]){
    const h=harness();h.service.observeStock(fixture().stock);assert.equal(h.service.getAccess().unlocked,true);
    revoke(h);assert.equal(h.service.getAccess().unlocked,false);assert.notEqual(h.service.getAccess().owner,true);assert.equal(h.service.header(),'');
  }
  const h=harness();h.setToken('');h.service.observeStock(fixture().stock);assert.equal(h.service.getAccess().unlocked,false);
});

test('eligible staff still require an actual code grant and retain its normal expiry rules',async()=>{
  const h=harness(),staff=fixture().stock;staff.actor={username:'synthetic-sales',role:'stock_sales',owner:false};
  h.service.observeStock(staff);h.service.observe(staff.annotationAccess);
  assert.equal(h.service.getAccess().unlocked,false);assert.equal(h.service.header(),'');
  await h.service.unlock('synthetic-code');assert.equal(h.unlockCalls.length,1);
  assert.equal(h.service.getAccess().unlocked,true);assert.notEqual(h.service.getAccess().owner,true);assert.equal(h.service.header(),'SYNTHETIC-STAFF-GRANT');
  h.setNow(epoch+1800000);assert.equal(h.service.getAccess().unlocked,false);assert.equal(h.service.header(),'');
});

test('owner Excel preparation uses fresh dual reads and existing annotation-only parser without requesting a code',async()=>{
  const f=fixture(),h=harness(),calls=[],parsed=[];h.service.observeStock(f.stock);
  const service=createNotesService({core,now:()=>epoch,scope:()=> 'synthetic-same-scope',
    requireUnlocked:()=>{assert.equal(h.service.getAccess().unlocked,true);},
    request:async(suffix,payload)=>{calls.push({suffix,payload});if(!suffix)h.service.observeStock(f.stock);return copy(suffix?f.catalog:f.stock);},
    parseAnnotationsFile:async(file,rows,notes)=>{parsed.push({file,rows,notes});return {canApply:true,notesChanges:[{key,before:'before note',after:'after note'}],followupChanges:[],issues:[]};}
  });
  const plan=await service.prepareAnnotationsFile({name:'synthetic.xlsx'});
  assert.equal(plan.canApply,true);assert.equal(parsed.length,1);assert.equal(parsed[0].rows[0].key,rawKey);
  assert.equal(calls.length,2);assert(calls.every(c=>!c.payload));assert.equal(h.unlockCalls.length,0);
});

test('owner proof revoked during fresh stock read blocks preparation and never invokes the parser',async()=>{
  const f=fixture(),h=harness();h.service.observeStock(f.stock);let parseCalls=0;
  const staffStock=copy(f.stock);staffStock.actor={username:'synthetic-sales',role:'stock_sales',owner:false};
  const service=createNotesService({core,now:()=>epoch,scope:()=> 'synthetic-same-scope',
    requireUnlocked:()=>{if(!h.service.getAccess().unlocked)throw Object.assign(Error('denied'),{code:'permission-denied'});},
    request:async suffix=>{if(!suffix){h.service.observeStock(staffStock);return copy(staffStock);}return copy(f.catalog);},
    parseAnnotationsFile:async()=>{parseCalls++;return {canApply:true};}
  });
  await assert.rejects(service.prepareAnnotationsFile({name:'synthetic.xlsx'}),e=>['permission-denied','read-only'].includes(e.code));
  assert.equal(parseCalls,0);assert.equal(h.unlockCalls.length,0);
});
