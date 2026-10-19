import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const core=require('../stock_review_notes_bridge.js');
const {createNotesService,boot}=require('../stock_order_controller.js');
const copy=v=>JSON.parse(JSON.stringify(v));
const key='2|A|100|200|sheet';
const changes=[{key,before:'synthetic before',after:'synthetic after'}];
function fixture(){return {stock:{ok:true,revision:1,exchangeRate:30,report:{reportDate:'2026-01-01'},sellablePlan:{month:'2026-01'},rows:[{key:'w100_l200_t2_gA',w:100,l:200,t:2,grade:'A',unit:'sheet',qty:10,freeQty:3,committedQty:7,note:'protected',followup:'protected tracking',priceObj:{price:5,currency:'THB'}}]},catalog:{ok:true,revision:1,catalogRevision:2,stockReportDate:'2026-01-01',permissions:{pricesAndNotes:true},widgetState:{privateContent:{version:3,context:'aaf-sales-stock-preview|free-price-catalog',fx:30,prices:{[key]:5},currencies:{[key]:'THB'},notesByThickness:{},notesBySpec:{[key]:'synthetic before'},savedAt:'2026-01-01T00:00:00Z'}}}};}
function service(){
  const data=fixture(),calls=[];let identity='same',hook=null;
  const request=async(suffix,payload)=>{calls.push({suffix,payload:payload&&copy(payload)});if(hook)await hook(suffix,payload);if(payload){assert.equal(payload.expectedRevision,data.stock.revision);assert.equal(payload.expectedCatalogRevision,data.catalog.catalogRevision);data.stock.revision++;data.catalog.revision++;
    if(payload.action==='saveSalesAnnotations'){
      assert.equal(payload.reportDate,data.stock.report.reportDate);data.stock.updatedAt='2026-01-01T01:00:00Z';
      if(payload.notesChanges.length){data.catalog.catalogRevision++;for(const c of payload.notesChanges)data.catalog.widgetState.privateContent.notesBySpec[c.key]=c.after;data.catalog.widgetState.privateContent.savedAt=data.stock.updatedAt;}
      for(const c of payload.followupChanges)Object.assign(data.stock.rows.find(r=>r.key===c.rawKey),{followup:c.after,followupBy:'synthetic-author',followupAt:data.stock.updatedAt});
      return {ok:true,revision:data.stock.revision,catalogRevision:data.catalog.catalogRevision,updatedAt:data.stock.updatedAt,savedNoteCount:payload.notesChanges.length,savedFollowupCount:payload.followupChanges.length};
    }
    assert.equal(payload.action,'saveSalesNotes');data.catalog.catalogRevision++;Object.assign(data.catalog.widgetState.privateContent.notesBySpec,payload.notesBySpec);data.catalog.widgetState.privateContent.savedAt='2026-01-01T01:00:00Z';}return copy(suffix.includes('catalog')||payload?data.catalog:data.stock);};
  const api=createNotesService({core,scope:()=>identity,request,now:()=>1});
  return{api,data,calls,setScope:s=>identity=s,setHook:h=>hook=h};
}
test('notes only write uses fresh dual CAS and preserves every protected row/catalog field',async()=>{
  const h=service(),before=copy(h.data);const result=await h.api.saveNotes(changes);
  assert.equal(result.notesBySpec[key],'synthetic after');assert.equal(result.revision,2);assert.equal(result.catalogRevision,3);
  assert.deepEqual(h.data.stock.rows,before.stock.rows);assert.deepEqual(h.data.stock.sellablePlan,before.stock.sellablePlan);
  const posts=h.calls.filter(c=>c.payload);assert.equal(posts.length,1);assert.deepEqual(Object.keys(posts[0].payload).sort(),['action','expectedCatalogRevision','expectedRevision','notesBySpec'].sort());
  assert(!h.api.isUncertain());
});
test('changed note, unknown product and read-only permission never POST',async()=>{
  for(const kind of ['conflict','unknown','readOnly']){const h=service();if(kind==='conflict')h.data.catalog.widgetState.privateContent.notesBySpec[key]='another user';if(kind==='readOnly')h.data.catalog.permissions.pricesAndNotes=false;await assert.rejects(h.api.saveNotes(kind==='unknown'?[{...changes[0],key:'2|B|100|200|sheet'}]:changes));assert.equal(h.calls.filter(c=>c.payload).length,0);}
});
test('uncertain write blocks repeat until an explicit fresh read verifies unchanged or saved',async()=>{
  const h=service();h.setHook(async(s,p)=>{if(p)throw Error('network');});await assert.rejects(h.api.saveNotes(changes));assert(h.api.isUncertain());await assert.rejects(h.api.saveNotes(changes),/ยืนยันผล/);assert.equal(h.calls.filter(c=>c.payload).length,1);h.setHook(null);await h.api.readNotes();assert(!h.api.isUncertain());
});
test('unexpected protected quantity mutation blocks successful readback claim',async()=>{
  const h=service();h.setHook(async(s,p)=>{if(p)h.data.stock.rows[0].qty++;});await assert.rejects(h.api.saveNotes(changes),/อ่านกลับ/);assert(h.api.isUncertain());
});
test('session changes between preflight reads prevents write',async()=>{
  const h=service();h.setHook(async()=>h.setScope('changed'));await assert.rejects(h.api.saveNotes(changes),/เซสชัน/);assert.equal(h.calls.filter(c=>c.payload).length,0);
});
const followupChanges=[{rawKey:'w100_l200_t2_gA',before:'protected tracking',after:'new synthetic tracking'}];
test('mixed notes/tracking save is atomic, uses one CAS, and preserves all quantities/prices/source fields',async()=>{
  const h=service();h.data.stock.permissions={followup:true};const before=copy(h.data);
  const result=await h.api.saveChanges({notesChanges:changes,followupChanges});assert.equal(result.revision,2);assert.equal(result.catalogRevision,3);assert.equal(result.notesBySpec[key],changes[0].after);assert.equal(result.rows[0].records[0].followup,followupChanges[0].after);
  const posts=h.calls.filter(c=>c.payload);assert.equal(posts.length,1);assert.deepEqual(posts[0].payload,{action:'saveSalesAnnotations',expectedRevision:1,expectedCatalogRevision:2,reportDate:'2026-01-01',notesChanges:changes,followupChanges});
  assert.deepEqual(h.data.catalog.widgetState.privateContent.prices,before.catalog.widgetState.privateContent.prices);assert.equal(h.data.stock.rows[0].qty,10);assert.equal(h.data.stock.rows[0].committedQty,7);assert.equal(h.data.stock.rows[0].note,'protected');assert.deepEqual(h.data.stock.sellablePlan,before.stock.sellablePlan);
});
test('followup-only save and clear retain catalog revision and require independently granted permission',async()=>{
  const h=service();h.data.stock.permissions={followup:true};h.data.catalog.permissions.pricesAndNotes=false;const catalog=copy(h.data.catalog.widgetState);
  const result=await h.api.saveChanges({notesChanges:[],followupChanges:[{...followupChanges[0],after:''}]});assert.equal(result.catalogRevision,2);assert.equal(result.rows[0].records[0].followup,'');assert.deepEqual(h.data.catalog.widgetState,catalog);
  const denied=service();await assert.rejects(denied.api.saveChanges({notesChanges:changes,followupChanges}),e=>e.code==='permission-denied');assert.equal(denied.calls.filter(c=>c.payload).length,0);
});
test('invalid/mismatched raw identities, extra fields, stale before and blank notes block entire mixed transaction',async()=>{
  for(const bundle of [{notesChanges:changes,followupChanges:[{...followupChanges[0],rawKey:key}]},{notesChanges:changes,followupChanges:[{...followupChanges[0],before:'stale'}]},{notesChanges:changes,followupChanges:[{...followupChanges[0],after:'a'.repeat(4001)}]},{notesChanges:changes,followupChanges:[{...followupChanges[0],qty:5}]},{notesChanges:[{...changes[0],after:''}],followupChanges}]){
    const h=service();h.data.stock.permissions={followup:true};await assert.rejects(h.api.saveChanges(bundle));assert.equal(h.calls.filter(c=>c.payload).length,0);assert.equal(h.data.catalog.widgetState.privateContent.notesBySpec[key],changes[0].before);
  }
});
test('combined uncertain write blocks retries until fresh GET verifies saved or unchanged, including protected fields',async()=>{
  const h=service();h.data.stock.permissions={followup:true};h.setHook(async(s,p)=>{if(p)throw Error('offline');});await assert.rejects(h.api.saveChanges({notesChanges:changes,followupChanges}));assert(h.api.isUncertain());await assert.rejects(h.api.saveChanges({notesChanges:changes,followupChanges}));assert.equal(h.calls.filter(c=>c.payload).length,1);h.setHook(null);await h.api.readNotes();assert(!h.api.isUncertain());
  const lost=service();lost.data.stock.permissions={followup:true};lost.setHook(async(s,p)=>{if(!p)return;lost.data.stock.revision++;lost.data.catalog.revision++;lost.data.catalog.catalogRevision++;lost.data.stock.updatedAt='2026-01-01T01:00:00Z';lost.data.catalog.widgetState.privateContent.savedAt=lost.data.stock.updatedAt;lost.data.catalog.widgetState.privateContent.notesBySpec[key]=changes[0].after;Object.assign(lost.data.stock.rows[0],{followup:followupChanges[0].after,followupBy:'synthetic-author',followupAt:lost.data.stock.updatedAt});throw Error('lost after commit');});
  await assert.rejects(lost.api.saveChanges({notesChanges:changes,followupChanges}));assert(lost.api.isUncertain());lost.setHook(null);const verified=await lost.api.readNotes();assert.equal(verified.notesBySpec[key],changes[0].after);assert(!lost.api.isUncertain());assert.equal(lost.calls.filter(c=>c.payload).length,1);
  const corrupt=service();corrupt.data.stock.permissions={followup:true};corrupt.setHook(async(s,p)=>{if(p)corrupt.data.stock.exchangeRate=99;});await assert.rejects(corrupt.api.saveChanges({notesChanges:changes,followupChanges}));assert(corrupt.api.isUncertain());corrupt.setHook(null);const blocked=await corrupt.api.readNotes();assert.equal(blocked.canSave,false);assert.equal(blocked.canEditFollowup,false);assert.equal(blocked.saveUnresolved,true);
});
test('read/retry cannot clear pending uncertainty while combined POST is in flight',async()=>{
  const h=service();h.data.stock.permissions={followup:true};let release,started;const wait=new Promise(r=>release=r),began=new Promise(r=>started=r);
  h.setHook(async(s,p)=>{if(p){started();await wait;}});const writing=h.api.saveChanges({notesChanges:changes,followupChanges});await began;
  await assert.rejects(h.api.readNotes(),e=>e.code==='save-blocked');await assert.rejects(h.api.saveChanges({notesChanges:changes,followupChanges}),e=>e.code==='save-blocked');assert.equal(h.calls.filter(c=>c.payload).length,1);
  release();await writing;assert(!h.api.isUncertain());assert(!h.api.isBusy());
});
class Node{constructor(){this.children=[];this.style={};this.listeners={};}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}setAttribute(){}addEventListener(k,v){this.listeners[k]=v;}}
function browser(){let token='synthetic-auth';const calls=[],summaries=[],mounted=[],responses=[];const win={document:{createElement:()=>new Node()},AAFStockAccess:{token:()=>token},AAFStockNotesCore:core,AAFStockSummary:{setOrderReview:(...args)=>summaries.push(args)},AAFOrderReviewUI:{mount:(host,review,services)=>{const v={dirty:false,destroyed:false,hasDirty(){return this.dirty;},update(r){this.review=r;},destroy(){this.destroyed=true;}};mounted.push({host,review,services,v});return v;}},addEventListener(){},async fetch(url,options){calls.push({url,options});const value=await responses.shift();return{status:value.status||200,ok:!value.status,json:async()=>value};}};return{api:boot(win),win,calls,summaries,mounted,responses,setToken:v=>token=v};}
const report=()=>({ok:true,revision:1,stockReportDate:'2026-01-01',availableMonths:['2026-01'],selectedMonth:'2026-01',review:{metadata:{month:'2026-01'},rows:[]},readModel:{sourceIsLive:false,queueApplied:false,warning:'dated evidence'}});
test('authorized overview is GET only, same month and no-store; reattach preserves drafts',async()=>{
  const h=browser();h.api.setAccess({revision:1,reportDate:'2026-01-01'});h.responses.push(report());await h.api.attach(new Node());assert.equal(h.mounted.length,1);assert.equal(h.calls[0].options.method,'GET');assert.equal(h.calls[0].options.cache,'no-store');assert.equal(h.calls[0].options.headers.Authorization,'Bearer synthetic-auth');assert(!h.calls[0].url.includes('synthetic-auth'));h.mounted[0].v.dirty=true;await h.api.attach(new Node());assert.equal(h.mounted.length,1);assert(h.api.isDirty());assert.equal(h.api.selectMonth('2026-02'),false);
});
test('invalid month/revision and denied auth cannot paint private review',async()=>{
  for(const value of [{...report(),revision:2},{...report(),selectedMonth:'2026-02'},{status:403,ok:false}]){const h=browser();h.api.setAccess({revision:1,reportDate:'2026-01-01'});h.responses.push(value);await h.api.attach(new Node());assert.equal(h.mounted.length,0);assert(!h.summaries.some(([r])=>r));}
});
test('stale async reply after invalidation cannot restore private report',async()=>{
  const h=browser();let resolve;h.api.setAccess({revision:1,reportDate:'2026-01-01'});h.responses.push(new Promise(r=>resolve=r));const p=h.api.attach(new Node());h.api.invalidate('expired');resolve(report());await p;assert.equal(h.mounted.length,0);assert(!h.summaries.some(([r])=>r));
});
test('403 POST and same-credential 401 retain dirty UI; no automatic repeat or prior-account restoration',async()=>{
  for(const status of [403,401]){
    const h=browser();h.api.setAccess({revision:1,reportDate:'2026-01-01'});h.responses.push(report());await h.api.attach(new Node());h.mounted[0].v.dirty=true;
    const f=fixture();f.stock.permissions={followup:true};h.responses.push(f.stock,f.catalog,{status,ok:false});
    await assert.rejects(h.mounted[0].services.saveChanges({notesChanges:changes,followupChanges}));assert.equal(h.mounted[0].v.destroyed,false);assert(h.api.isDirty());if(status===403)assert(!h.api.isSaving());
    const calls=h.calls.length;if(status===401){await assert.rejects(h.mounted[0].services.readNotes());assert.equal(h.calls.length,calls);}
    h.setToken('different-user');h.api.setAccess({revision:1,reportDate:'2026-01-01'});assert.equal(h.mounted[0].v.destroyed,true);assert.equal(h.api.isDirty(),false);
  }
});
test('401 on preflight or post-write readback retains drafts but actual logout destroys them',async()=>{
  for(const phase of ['preflight','readback']){
    const h=browser();h.api.setAccess({revision:1,reportDate:'2026-01-01'});h.responses.push(report());await h.api.attach(new Node());h.mounted[0].v.dirty=true;
    const f=fixture();f.stock.permissions={followup:true};
    if(phase==='preflight')h.responses.push({status:401,ok:false});else h.responses.push(f.stock,f.catalog,{ok:true,revision:2,catalogRevision:3,updatedAt:'2026-01-01T01:00:00Z',savedNoteCount:1,savedFollowupCount:1},{status:401,ok:false});
    await assert.rejects(h.mounted[0].services.saveChanges({notesChanges:changes,followupChanges}));assert.equal(h.mounted[0].v.destroyed,false);assert(h.api.isDirty());assert.equal(h.calls.filter(c=>c.options.method==='POST').length,phase==='preflight'?0:1);
    h.setToken('');h.api.invalidate('logout');assert.equal(h.mounted[0].v.destroyed,true);assert(!h.api.isDirty());
  }
});
test('read-only standalone snapshot suppresses both notes and followup editing',async()=>{
  const h=browser();h.api.setAccess({revision:1,reportDate:'2026-01-01',notesReadOnly:true});h.responses.push(report());await h.api.attach(new Node());const f=fixture();f.stock.permissions={followup:true};h.responses.push(f.stock,f.catalog);
  const snapshot=await h.mounted[0].services.readNotes();assert.equal(snapshot.canSave,false);assert.equal(snapshot.canEditFollowup,false);
});
