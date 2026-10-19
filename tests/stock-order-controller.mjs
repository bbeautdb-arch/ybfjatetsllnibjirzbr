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
  const request=async(suffix,payload)=>{calls.push({suffix,payload:payload&&copy(payload)});if(hook)await hook(suffix,payload);if(payload){assert.equal(payload.action,'saveSalesNotes');assert.equal(payload.expectedRevision,data.stock.revision);assert.equal(payload.expectedCatalogRevision,data.catalog.catalogRevision);data.stock.revision++;data.catalog.revision++;data.catalog.catalogRevision++;Object.assign(data.catalog.widgetState.privateContent.notesBySpec,payload.notesBySpec);data.catalog.widgetState.privateContent.savedAt='2026-01-01T01:00:00Z';}return copy(suffix.includes('catalog')||payload?data.catalog:data.stock);};
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
