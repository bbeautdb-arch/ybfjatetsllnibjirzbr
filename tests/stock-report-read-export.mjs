import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../stock_sales_controller.js',import.meta.url),'utf8');
const existing=fs.readFileSync(new URL('./stock-sales-controller.mjs',import.meta.url),'utf8');
const fixture=existing.slice(existing.indexOf('const canonicalState='),existing.indexOf('function assertAuthenticated'))
  .replace('return{ok:queued.httpOk!==false,json:async()=>queued};','return{status:queued.status??200,ok:queued.httpOk!==false,json:async()=>{if(queued.badJson)throw Error("invalid json");return queued;}};');
const {runtime,response,canonicalState,deferred,tick,find}=vm.runInNewContext(`const source=${JSON.stringify(source)};${fixture};({runtime,response,canonicalState,deferred,tick,find})`,{vm,URL,JSON,Promise,Error,console,setImmediate});
const day='2026-10-13',revision=56;
const basic=()=>({ok:true,revision,updatedAt:'2026-10-13T04:07:50Z',actor:{name:'PRIVATE-ACTOR'},permissions:{import:true},salesLinks:[{secret:'PRIVATE-LINK'}],exchangeRate:33,report:{reportDate:day,checksum:'synthetic-checksum',sourceRowCount:2,source:{secret:'PRIVATE-SOURCE'}},rows:[{key:'2|F|1220|2440|sheet',sku:'SYNTHETIC',w:1220,l:2440,t:2,grade:'F',unit:'sheet',qty:100,baseQty:100,freeQty:60,committedQty:40,remainingQty:60,productionQty:0,d90:100,d180:0,d270:0,d360:0,dOver:0,note:'saved note',followup:'saved followup',priceObj:{price:999,currency:'THB'},rawSource:false,exportSku:'EXPORT-SYNTHETIC',aliases:['RAW-SYNTHETIC','EXPORT-SYNTHETIC'],noteBy:'note-author',noteAt:'2026-10-12T09:01:00Z',followupBy:'followup-author',followupAt:'2026-10-12T09:02:00Z',physicalOverride:{at:'2026-10-13T04:01:00Z',value:100,by:'PRIVATE-OVERRIDE'},freeOverride:{at:'2026-10-13T04:02:00Z',value:60,by:'PRIVATE-OVERRIDE'},internalSecret:'PRIVATE-ROW'}],sellablePlan:{reportDate:'2026-10-12',month:'2026-10',appliedAt:'2026-10-12T09:00:00Z',needsSalesRefresh:true,orders:[{secret:'PRIVATE-ORDER'}]}});
const catalog=()=>({ok:true,revision,catalogRevision:4,stockReportDate:day,widgetState:{modelContent:{secret:'PRIVATE-MODEL'},privateContent:{...canonicalState(35).privateContent,secret:'PRIVATE-CATALOG'}},actor:'PRIVATE-ACTOR'});
const posts=r=>r.fetchCalls.filter(call=>call.init.method==='POST');
let cases=0;

for(const status of [409,412]){
  const r=runtime(),slot=r.slot();r.setToken('synthetic');r.api.setAccess({salesMode:true,revision});
  r.enqueue({ok:false,httpOk:false,status,error:'PRIVATE-BACKEND'});await r.api.attach(slot);
  assert.equal(r.api.getReportLoadStatus().state,'pending');assert.equal(r.api.getReportLoadStatus().code,'report-pending');
  assert.match(find(slot,node=>node.className==='preview-state').textContent,/รายละเอียดยอดขาย/);
  assert(!find(slot,node=>node.className==='preview-state').textContent.includes('มีราคาใหม่'));
  assert.equal(r.summaries.at(-1),null);assert.equal(r.mounts.length,0);assert.equal(posts(r).length,0);
  r.enqueue({...response('ready',{revision}),permissions:{pricesAndNotes:true},stockReportDate:day,salesReportDate:'2026-10-12'});await r.api.attach(slot);
  assert.equal(r.api.getReportLoadStatus().state,'ready');assert.equal(r.mounts.length,1);cases++;
}
for(const status of [401,403]){
  const r=runtime();r.setToken('synthetic');r.enqueue({ok:false,httpOk:false,status,error:'PRIVATE-BACKEND'});await r.api.attach(r.slot());
  assert.equal(r.api.getReportLoadStatus().state,'unavailable');assert(!r.api.getReportLoadStatus().message.includes('PRIVATE'));assert.equal(posts(r).length,0);cases++;
}
for(const phase of ['preflight','post']){
  const r=runtime();r.setToken('synthetic');r.enqueue(response('save',{revision,catalogRevision:4}));await r.api.attach(r.slot());
  if(phase==='post')r.enqueue(catalog());r.enqueue({ok:false,httpOk:false,status:409,error:'PRIVATE-BACKEND'});
  await assert.rejects(r.mounts[0].options.store.setWidgetState(canonicalState(44)),error=>error.code==='catalog-conflict'&&!error.message.includes('PRIVATE'));
  assert.equal(posts(r).length,phase==='post'?1:0);cases++;
}
{
  const r=runtime();r.setToken('owner-not-used');r.setAccessHelper({isShared:()=>true,token:()=> 'synthetic-shared'});
  const stock=basic();stock.rows[0].rawSku='RAW-SYNTHETIC';r.enqueue(stock);r.enqueue(catalog());const result=await r.api.readExportSnapshot();
  assert.equal(result.stock.rows[0].freeQty,60);assert.equal(result.stock.rows[0].committedQty,40);assert.equal(result.stock.sellablePlan.reportDate,'2026-10-12');assert.equal(result.stock.report.reportDate,day);
  assert.equal(result.catalog.widgetState.privateContent.prices['2.5|AAA|1220|2440|sheet'],35);
  const row=result.stock.rows[0];assert.equal(row.rawSource,false);assert.equal(row.rawSku,'RAW-SYNTHETIC');assert.equal(row.exportSku,'EXPORT-SYNTHETIC');assert.deepEqual([...row.aliases],['RAW-SYNTHETIC','EXPORT-SYNTHETIC']);
  assert.equal(row.noteBy,'note-author');assert.equal(row.noteAt,'2026-10-12T09:01:00Z');assert.equal(row.followupBy,'followup-author');assert.equal(row.followupAt,'2026-10-12T09:02:00Z');
  assert.equal(JSON.stringify(row.physicalOverride),JSON.stringify({at:'2026-10-13T04:01:00Z'}));assert.equal(JSON.stringify(row.freeOverride),JSON.stringify({at:'2026-10-13T04:02:00Z'}));
  assert(!JSON.stringify(result).includes('PRIVATE'));assert(!Object.hasOwn(result.stock.rows[0],'priceObj'));assert.equal(result.catalogWarning,'');
  assert.equal(r.fetchCalls.length,2);assert.equal(r.fetchCalls[0].url.endsWith('/api/aaf/stock'),true);assert.equal(r.fetchCalls[1].url.endsWith('?view=salesReport&catalogOnly=1'),true);
  for(const call of r.fetchCalls){assert.equal(call.init.method,'GET');assert.equal(call.init.cache,'no-store');assert.equal(call.init.headers.Authorization,'Bearer synthetic-shared');assert.equal(call.init.body,undefined);}
  assert.equal(r.mounts.length,0);assert.equal(r.summaries.length,0);cases++;
}
{
  const r=runtime(),stock=basic();r.setToken('synthetic');Object.assign(stock.rows[0],{rawSource:'false',rawSku:{secret:'PRIVATE'},exportSku:{secret:'PRIVATE'},aliases:['valid',{secret:'PRIVATE'}],noteBy:{secret:'PRIVATE'},noteAt:123,followupBy:[],followupAt:false,physicalOverride:{at:{secret:'PRIVATE'}},freeOverride:{at:123}});
  r.enqueue(stock);r.enqueue(catalog());const result=await r.api.readExportSnapshot();
  for(const key of ['rawSource','rawSku','exportSku','aliases','noteBy','noteAt','followupBy','followupAt','physicalOverride','freeOverride'])assert.equal(Object.hasOwn(result.stock.rows[0],key),false,key);
  assert(!JSON.stringify(result).includes('PRIVATE'));cases++;
}
for(const unavailable of [{ok:false,httpOk:false,status:409},{ok:false,httpOk:false,status:503},{badJson:true},new Error('PRIVATE-network'),{ok:true,revision,stockReportDate:day,catalogRevision:0,widgetState:null}]){
  const r=runtime();r.setToken('synthetic');r.enqueue(basic());r.enqueue(unavailable);const result=await r.api.readExportSnapshot();
  assert.equal(result.catalog,null);assert.match(result.catalogWarning,/ราคา/);assert.equal(result.stock.rows[0].qty,100);assert.equal(posts(r).length,0);cases++;
}
for(const status of [401,403]){
  const r=runtime();r.setToken('synthetic');r.enqueue(basic());r.enqueue({ok:false,httpOk:false,status,error:'PRIVATE'});
  await assert.rejects(r.api.readExportSnapshot(),error=>error.code===(status===401?'auth-expired':'permission-denied')&&!error.message.includes('PRIVATE'));cases++;
}
for(const mutation of [{revision:57},{stockReportDate:'2026-10-14'}]){
  const r=runtime();r.setToken('synthetic');r.enqueue(basic());r.enqueue({...catalog(),...mutation});
  await assert.rejects(r.api.readExportSnapshot(),error=>error.code==='snapshot-changed');cases++;
}
for(const mutation of ['token','invalidate','revision']){
  const r=runtime(),gate=deferred();r.setToken('synthetic');r.enqueue(basic());r.pending(gate);
  const reading=r.api.readExportSnapshot();await tick();
  if(mutation==='token')r.setToken('replacement');else if(mutation==='invalidate')r.api.invalidate('expired');else r.api.setAccess({salesMode:false,revision:57});
  gate.resolve(catalog());await assert.rejects(reading,error=>error.code==='snapshot-changed');cases++;
}
{
  const r=runtime();r.setToken('synthetic');r.enqueue(response('draft',{revision}));await r.api.attach(r.slot());
  r.api.setDraftPrice('draft-only',77,'THB');const mounted=r.mounts[0],summaries=r.summaries.length,readStatus=r.api.getReportLoadStatus();
  r.enqueue(basic());r.enqueue(catalog());await r.api.readExportSnapshot();
  assert.equal(r.api.isDirty(),true);assert.equal(r.api.getDraftPrice('draft-only').value,77);assert.equal(r.mounts.length,1);assert.equal(mounted.controller.destroyed,false);
  assert.equal(r.summaries.length,summaries);assert.deepEqual(r.api.getReportLoadStatus(),readStatus);assert.equal(posts(r).length,0);cases++;
}
{
  const r=runtime();await assert.rejects(r.api.readExportSnapshot(),error=>error.code==='auth-required');assert.equal(r.fetchCalls.length,0);cases++;
}
{
  const r=runtime();r.setToken('synthetic');r.enqueue({ok:false,httpOk:false,status:401,error:'PRIVATE'});
  await assert.rejects(r.api.readExportSnapshot(),error=>error.code==='auth-expired');assert.equal(r.fetchCalls.length,1);cases++;
}
console.log(`Stock report pending/read-only export: ${cases} cases passed; no source, auth or stock mutations.`);
