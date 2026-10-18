import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../stock_shared.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('  function denySharedAccess('),source.indexOf('  async function request('));
const request=source.slice(source.indexOf('  async function request('),source.indexOf('  function header('));
const poll=source.slice(source.indexOf('      setInterval(async()=>'),source.indexOf('\n    }catch(e){banner(e.message,true);if(e.status===401'));
const acceptPrefix=source.slice(source.indexOf('  function accept(data){'),source.indexOf("\n    $('stock-summary').hidden=false;window.AAFStockLinks"))+'\n}';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const ok=revision=>({ok:true,status:200,json:async()=>({ok:true,revision,rows:[],actor:{owner:false},exchangeRate:33})});
function runtime(overrides={}){
  const nodes=new Map(),invalidated=[],events=[],c={accessDenied:false,accessEpoch:0,requestAuth:'TEST-ONLY',highestCurrentRevision:58,responseScopes:new WeakMap(),reportData:{private:true},reportDataDay:'2026-10-18',busy:false,dirty:false,lastReportRetryAt:0,salesLink:true,capability:true,
    shared:{revision:58},previewPending:()=>false,dateText:value=>value,token:()=>'TEST-ONLY',API:'https://example.invalid/stock',
    user:null,currentStockData:[],globalExchangeRate:33,priceDB:{},
    document:{hidden:false,activeElement:null},window:{AAFSalesPreview:{getReportLoadStatus:()=>({state:'pending'}),invalidate:message=>invalidated.push(message)}},
    $:id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'PRIVATE',disabled:false});return nodes.get(id);},
    Date,Number,Error,JSON,encodeURIComponent,
    setInterval(fn,delay){c.poll=fn;c.pollDelay=delay;},banner:(...args)=>events.push(args),
    refresh:async()=>{},accept:()=>{},fetch:async()=>({ok:true,status:200,json:async()=>({ok:true,revision:58})}),...overrides};
  vm.createContext(c);vm.runInContext(helpers+'\n'+request,c);return {c,nodes,invalidated,events};
}
test('sales toolbar is outside hidden workbench and both account and capability sales modes use guarded refresh',()=>{
  assert.match(source,/const salesLink=capability\|\|new URLSearchParams\(location.search\).get\('view'\)==='sales'/);
  assert.match(source,/salesTools.hidden=!salesLink/);
  assert.match(source,/\$\('stock-report-access'\).before\(salesTools\)/);
  assert.match(source,/\$\('stock-sales-reload'\).onclick=refresh/);
  assert.match(source,/id="stock-sales-state" role="status"/);
  assert.match(source,/โหลดจากส่วนกลางล่าสุด/);
  assert.match(source,/setAccess\?\.\(controllerEvidence\(data\)\)/);
});
test('controller evidence is a detached whitelist of current rows, exact dimensions, quantities and annotations',()=>{
  const {c}=runtime();const data={revision:58,report:{reportDate:'2026-10-18',private:'hidden'},actor:{owner:true},rows:[{
    key:'2|F|1220|2440|sheet',sku:'TEST',w:'1220',l:2440,t:2,grade:'F',unit:'sheet',qty:0,committedQty:7,freeQty:0,note:'preserved note',followup:'preserved followup',private:'DO-NOT-EXPOSE',priceObj:{price:999}
  }]};
  const before=JSON.stringify(data),result=c.controllerEvidence(data);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{salesMode:true,revision:58,reportDate:'2026-10-18',rows:[{key:'2|F|1220|2440|sheet',sku:'TEST',grade:'F',unit:'sheet',note:'preserved note',followup:'preserved followup',w:1220,l:2440,t:2,qty:0,committedQty:7,freeQty:0}]});
  result.rows[0].note='detached';assert.equal(JSON.stringify(data),before);assert(!JSON.stringify(result).includes('DO-NOT-EXPOSE'));
  const invalid=c.controllerEvidence({rows:[{w:'',l:Infinity,qty:{bad:true},note:{bad:true}}]});
  assert.equal(invalid.rows[0].w,null);assert.equal(invalid.rows[0].l,null);assert.equal(invalid.rows[0].qty,null);assert.equal(invalid.rows[0].note,null);
});
test('401 and403 immediately hide protected surfaces for both account and capability without parsing an error body',async()=>{
  for(const capability of [false,true])for(const status of [401,403]){
    let parsed=0;const {c,nodes,invalidated}=runtime({capability,fetch:async()=>({status,ok:false,json:async()=>{parsed++;throw Error('untrusted response');}})});
    await assert.rejects(c.request(),error=>error.status===status);
    assert.equal(parsed,0);assert.equal(c.accessDenied,true);assert.equal(c.reportData,null);assert.equal(c.reportDataDay,null);
    for(const id of ['stock-summary','stock-owner-tools','shared-report'])assert.equal(nodes.get(id).hidden,true);
    for(const id of ['stock-table-body','stock-table-foot','raw-table-container','report-summary','stock-owner-state','stock-user'])assert.equal(nodes.get(id).textContent,'');
    assert.equal(nodes.get('download-stock-report').disabled,true);assert.equal(invalidated.length,1);
    assert.match(nodes.get('stock-sales-state').textContent,/ยังยืนยันสิทธิ์/);
  }
});
test('same-revision pending reports retry through refresh no more than once per minute',async()=>{
  let now=59999,refreshes=0,reads=0;const {c}=runtime({Date:{now:()=>now},request:undefined,refresh:async()=>{refreshes++;}});
  c.request=async()=>{reads++;return {revision:58};};vm.runInContext(poll,c);
  assert.equal(c.pollDelay,15000);await c.poll();assert.equal(refreshes,0);
  now=60000;await c.poll();assert.equal(refreshes,1);now=75000;await c.poll();assert.equal(refreshes,1);
  now=120000;await c.poll();assert.equal(refreshes,2);assert.equal(reads,4);
  c.window.AAFSalesPreview.getReportLoadStatus=()=>({state:'unavailable'});now=180000;await c.poll();assert.equal(refreshes,2);
  c.window.AAFSalesPreview.getReportLoadStatus=()=>({state:'ready'});now=240000;await c.poll();assert.equal(refreshes,2);
});
test('automatic retry does not run while hidden, unauthorized, dirty, saving or focused in either editor surface',async()=>{
  for(const type of ['hidden','denied','busy','dirty','preview','focus','shadowFocus']){
    let reads=0;const {c,nodes}=runtime({Date:{now:()=>60000}});c.request=async()=>{reads++;return {revision:58};};vm.runInContext(poll,c);
    if(type==='hidden')c.document.hidden=true;if(type==='denied')c.accessDenied=true;if(type==='busy')c.busy=true;if(type==='dirty')c.dirty=true;
    if(type==='preview')c.previewPending=()=>true;if(type==='focus')c.document.activeElement={matches:()=>true};
    if(type==='shadowFocus')c.$('stock-sales-preview-host').shadowRoot={activeElement:{matches:()=>true}};
    await c.poll();assert.equal(reads,0,type);assert.equal(c.pendingReportRetryDue(),false,type);
  }
});
test('focus or draft changes during polling prevent a same-revision report retry',async()=>{
  let finish,refreshes=0;const {c}=runtime({Date:{now:()=>60000},refresh:async()=>{refreshes++;}});c.request=()=>new Promise(resolve=>{finish=resolve;});vm.runInContext(poll,c);
  const inflight=c.poll();c.document.activeElement={matches:()=>true};finish({revision:58});await inflight;assert.equal(refreshes,0);
});
test('late successful read cannot repaint protected stock after a concurrent401 or403',async()=>{
  for(const status of [401,403]){
    const late=deferred();let calls=0;const {c,nodes}=runtime({fetch:async()=>++calls===1?late.promise:{ok:false,status}});
    vm.runInContext(acceptPrefix,c);
    const oldRead=c.request();await assert.rejects(c.request(),error=>error.status===status);
    late.resolve(ok(59));await assert.rejects(oldRead,error=>error.code==='access-changed');
    assert.equal(c.accessDenied,true);assert.equal(c.shared.revision,58);assert.equal(nodes.get('stock-summary').hidden,true);
  }
});
test('already-returned response cannot be accepted after access denial or a session change',async()=>{
  for(const changed of ['denial','session']){
    let auth='TEST-ONLY';const {c}=runtime({token:()=>auth,fetch:async()=>ok(59)});vm.runInContext(acceptPrefix,c);
    const data=await c.request();if(changed==='denial')c.denySharedAccess('expired');else auth='NEW-TEST-ONLY';
    assert.throws(()=>c.accept(data),error=>error.code==='access-changed');assert.equal(c.accessDenied,true);assert.equal(c.shared.revision,58);
  }
});
test('session change while fetching or parsing rejects stale data and does not expose credentials',async()=>{
  for(const phase of ['fetch','json']){
    let auth='TEST-ONLY';const gate=deferred();const {c,events,invalidated}=runtime({token:()=>auth,fetch:async()=>phase==='fetch'?gate.promise:{ok:true,status:200,json:()=>gate.promise}});
    const inflight=c.request();await Promise.resolve();auth='NEW-TEST-ONLY';gate.resolve(phase==='fetch'?ok(59):{ok:true,revision:59});
    await assert.rejects(inflight,error=>error.code==='access-changed');assert.equal(c.accessDenied,true);
    assert(!JSON.stringify({events,invalidated}).includes('TEST-ONLY'));
  }
});
test('reversed responses cannot replace a newer current revision, including a delayed accept',async()=>{
  const old=deferred();let calls=0;const {c}=runtime({fetch:async()=>++calls===1?old.promise:ok(60)});vm.runInContext(acceptPrefix,c);
  const first=c.request(),newer=await c.request();c.accept(newer);old.resolve(ok(59));
  await assert.rejects(first,error=>error.code==='stale-response');assert.equal(c.shared.revision,60);
  const r=runtime({fetch:async()=>ok(59)});vm.runInContext(acceptPrefix,r.c);const delayed=await r.c.request();r.c.fetch=async()=>ok(60);const current=await r.c.request();r.c.accept(current);
  assert.throws(()=>r.c.accept(delayed),error=>error.code==='stale-response');assert.equal(r.c.shared.revision,60);
});
test('fresh authorized request can recover after denial without accepting an old response or rejecting historical reads',async()=>{
  const {c}=runtime({fetch:async()=>ok(59)});vm.runInContext(acceptPrefix,c);const old=await c.request();c.denySharedAccess('expired');
  const fresh=await c.request();c.accept(fresh);assert.equal(c.accessDenied,false);assert.equal(c.shared.revision,59);
  assert.throws(()=>c.accept(old),error=>error.code==='access-changed');
  c.fetch=async()=>ok(20);const historical=await c.request(null,'2026-09-01');assert.equal(historical.revision,20);
  assert.throws(()=>c.accept(historical),error=>error.code==='historical-response');assert.equal(c.shared.revision,59);
});
