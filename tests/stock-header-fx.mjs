import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../stock_sales_controller.js',import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const rate={rate:33.3984,date:'2026-10-14',status:'current',basis:'BOT_USD_THB_BUYING_TRANSFER'};
const goodFx=value=>({ok:true,exchangeRate:{...rate,...value}});
const pendingReport=()=>({ok:false,status:409});
const goodReport=()=>({ok:true,revision:10,catalogRevision:1,permissions:{pricesAndNotes:true},stockReportDate:'2026-10-15',salesReportDate:'2026-10-15',preview:{salesRows:[],stockRows:[],options:{}},widgetState:{privateContent:{prices:{known:2},currencies:{known:'USD'},notesBySpec:{known:'keep'},fx:32}}});

class Element{
  constructor(tag){this.tagName=tag;this.style={};this.children=[];this.attributes={};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(){}
  attachShadow(){this.shadowRoot=new Element('shadow');return this.shadowRoot;}
}
function setup(){
  let auth='authorized-A',now=Date.parse('2026-10-15T03:00:00Z'),nextTimer=0;
  const calls=[],headers=[],summaries=[],views=[],timers=new Map(),listeners={},queues={report:[],fx:[]};
  const document={currentScript:{src:'https://example.test/stock_sales_controller.js'},createElement:tag=>new Element(tag),visibilityState:'visible',activeElement:null,addEventListener(name,fn){listeners[name]=fn;}};
  const window={
    AAFStockAccess:{token:()=>auth,isShared:()=>true},
    AAFStockSummary:{setExchangeRate(value){headers.push(clone(value));},setSalesSummary(value){summaries.push(clone(value));}},
    AafAllModel:{buildModel:()=>({})},
    mountAllThickness(root,model,options){
      const state={dirty:false,saving:false,loading:false,loadFailed:false},drafts=new Map(),automatic=[];
      const active={ready:Promise.resolve(true),getPriceState:()=>state,getReportSummary:()=>({catalog:{fxThbPerUsd:32}}),setAutomaticFx:value=>automatic.push(clone(value)),destroy(){this.destroyed=true;},setDraftPrice(key,value,currency){drafts.set(key,{value,currency});state.dirty=true;return true;},getDraftPrice:key=>drafts.get(key),setPersistenceError(){}};
      views.push({active,state,drafts,automatic,options,root});return active;
    },
    setInterval(fn,delay){const id=++nextTimer;timers.set(id,{fn,delay});return id;},
    clearInterval:id=>timers.delete(id),addEventListener(){}
  };
  class TestDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const fetch=async(url,init)=>{
    calls.push({url,init:clone(init)});const key=url.endsWith('?view=exchangeRate')?'fx':'report';
    if(!queues[key].length)throw new Error('Unexpected read: '+key);
    const result=await queues[key].shift();if(result instanceof Error)throw result;
    return {ok:result.ok===true,status:result.status??(result.ok?200:500),json:async()=>result};
  };
  vm.runInNewContext(source,{window,document,fetch,URL,Date:TestDate,console});
  const api=window.AAFSalesPreview,slot=new Element('slot');api.setAccess({salesMode:true,revision:10});
  return {api,slot,calls,headers,summaries,views,timers,document,queue:(key,value)=>queues[key].push(value),setToken:value=>{auth=value;},setNow:value=>{now=Date.parse(value);},visibility:async value=>{document.visibilityState=value;listeners.visibilitychange?.();await tick();},attach:async()=>{await api.attach(slot);await tick();},refresh:async()=>{for(const timer of [...timers.values()])await timer.fn();await tick();}};
}
const fxCalls=r=>r.calls.filter(call=>call.url.endsWith('?view=exchangeRate'));
function assertReadOnly(r){for(const call of r.calls){assert.equal(call.init.method,'GET');assert.equal(call.init.cache,'no-store');assert.match(call.init.headers.Authorization,/^Bearer authorized-/);assert.equal(call.init.body,undefined);}}

test('header FX is independently authenticated when the sales report is pending 409',async()=>{
  const r=setup();r.queue('report',pendingReport());r.queue('fx',goodFx());await r.attach();
  assert.equal(r.api.getReportLoadStatus().code,'report-pending');assert.equal(r.api.getReportSummary(),null);assert.equal(r.views.length,0);
  assert.equal(r.api.getExchangeRateStatus().rate,rate.rate);assert.equal(r.headers.at(-1).date,rate.date);
  assert.equal(fxCalls(r).length,1);assert.equal(r.timers.size,1);assertReadOnly(r);
});
test('missing credentials never fetch FX',async()=>{
  const r=setup();r.setToken('');await r.attach();assert.equal(r.calls.length,0);assert.equal(r.api.getExchangeRateStatus(),null);assert.equal(r.timers.size,0);
});
test('last dated rate survives same-session transient failures without claiming freshness or rolling date backward',async()=>{
  const r=setup();r.queue('report',pendingReport());r.queue('fx',goodFx());await r.attach();
  r.queue('fx',new Error('offline'));await r.refresh();assert.equal(r.api.getExchangeRateStatus().rate,rate.rate);assert.equal(r.api.getExchangeRateStatus().date,rate.date);assert.equal(r.api.getExchangeRateStatus().status,'unavailable');
  r.queue('fx',goodFx({date:'2026-10-13',rate:30}));await r.refresh();assert.equal(r.api.getExchangeRateStatus().date,rate.date);assert.equal(r.api.getExchangeRateStatus().rate,rate.rate);
  r.queue('report',pendingReport());r.queue('fx',new Error('offline'));await r.attach();assert.equal(r.api.getExchangeRateStatus().date,rate.date);assert.equal(r.timers.size,1);
  r.queue('fx',goodFx({date:'2026-10-15',rate:34}));await r.refresh();assert.equal(r.api.getExchangeRateStatus().rate,34);assert.equal(r.api.getExchangeRateStatus().status,'current');assertReadOnly(r);
});
test('invalid, undated, future, foreign-basis and nonnumeric rates are rejected',async()=>{
  for(const invalid of [{date:null},{date:'2026-02-30'},{date:'2026-10-16'},{date:'2026-2-01'},{basis:'BOT_USD_THB_SELLING'},{rate:0},{rate:-1},{rate:1001},{rate:'33.4'},{rate:Infinity},{rate:NaN},{status:'verified'}]){
    const r=setup();r.queue('report',pendingReport());r.queue('fx',goodFx(invalid));await r.attach();assert.equal(r.api.getExchangeRateStatus(),null,JSON.stringify(invalid));
  }
});
test('date boundary is Bangkok today and leap-date validation is real',async()=>{
  const r=setup();r.setNow('2026-10-15T18:00:00Z');r.queue('report',pendingReport());r.queue('fx',goodFx({date:'2026-10-16'}));await r.attach();assert.equal(r.api.getExchangeRateStatus().date,'2026-10-16');
});
test('FX authorization failures clear last-good data and cancel polling',async()=>{
  for(const status of [401,403]){
    const r=setup();r.queue('report',pendingReport());r.queue('fx',goodFx());await r.attach();r.queue('fx',{ok:false,status});await r.refresh();
    assert.equal(r.api.getExchangeRateStatus(),null);assert.equal(r.headers.at(-1),null);assert.equal(r.timers.size,0);assertReadOnly(r);
  }
});
test('report authorization failure cannot be repainted by a late successful FX response',async()=>{
  for(const status of [401,403]){
    const r=setup(),late=deferred();r.queue('report',{ok:false,status});r.queue('fx',late.promise);await r.attach();late.resolve(goodFx());await tick();
    assert.equal(r.api.getExchangeRateStatus(),null);assert.equal(r.headers.at(-1),null);assert.equal(r.timers.size,0);
  }
});
test('a mounted summary cannot retain or republish its saved FX after authorization denial',async()=>{
  for(const status of [401,403]){
    const r=setup();r.queue('report',goodReport());r.queue('fx',goodFx());await r.attach();assert.equal(r.api.getReportSummary().catalog.fxThbPerUsd,32);
    r.api.setDraftPrice('known',7,'USD');r.queue('fx',{ok:false,status});await r.refresh();
    assert.equal(r.api.getExchangeRateStatus(),null);assert.equal(r.api.getReportSummary(),null);assert.equal(r.summaries.at(-1),null);assert.equal(r.api.getDraftPrice('known').value,7);
    r.views[0].options.onReportSummary({catalog:{fxThbPerUsd:32}});assert.equal(r.api.getReportSummary(),null);assert.equal(r.summaries.at(-1),null);
    await r.attach();assert.equal(r.api.getDraftPrice('known').value,7);assert.equal(r.views.length,1,'auth denial does not discard a retained local draft on reattach');
  }
});
test('report permission denial also clears FX without permitting a view',async()=>{
  const r=setup();r.queue('report',{...goodReport(),permissions:{pricesAndNotes:false}});r.queue('fx',goodFx());await r.attach();assert.equal(r.views.length,0);assert.equal(r.api.getExchangeRateStatus(),null);assert.equal(r.api.getReportLoadStatus().code,'permission-denied');
});
test('late old-session FX is ignored; session reentry requires a new authorized read',async()=>{
  const r=setup(),late=deferred();r.queue('report',pendingReport());r.queue('fx',late.promise);await r.attach();
  r.setToken('authorized-B');assert.equal(r.api.getExchangeRateStatus(),null);r.queue('report',pendingReport());r.queue('fx',goodFx({rate:34}));await r.attach();
  late.resolve(goodFx({rate:31}));await tick();assert.equal(r.api.getExchangeRateStatus().rate,34);assert.equal(r.headers.at(-1).rate,34);assert.equal(r.timers.size,1);
  r.setToken('authorized-A');assert.equal(r.api.getExchangeRateStatus(),null);r.queue('report',pendingReport());r.queue('fx',goodFx({rate:35}));await r.attach();assert.equal(r.api.getExchangeRateStatus().rate,35);assert.equal(r.timers.size,1);assertReadOnly(r);
});
test('invalidation clears and blocks in-flight FX, then same-session reentry fetches anew',async()=>{
  const r=setup(),late=deferred();r.queue('report',pendingReport());r.queue('fx',goodFx());await r.attach();
  r.queue('fx',late.promise);const refreshing=r.refresh();r.api.invalidate('กรุณาเข้าสู่ระบบ');late.resolve(goodFx({rate:34}));await refreshing;
  assert.equal(r.api.getExchangeRateStatus(),null);assert.equal(r.headers.at(-1),null);assert.equal(r.timers.size,0);
  r.queue('report',pendingReport());r.queue('fx',goodFx({rate:35}));await r.attach();assert.equal(r.api.getExchangeRateStatus().rate,35);assert.equal(r.timers.size,1);
});
test('header refresh preserves drafts, catalog, focused input and the view FX guard',async()=>{
  const r=setup();r.queue('report',goodReport());r.queue('fx',goodFx());await r.attach();const mounted=r.views[0],saved=clone(mounted.options.store.widgetState);
  assert.equal(fxCalls(r).length,1,'mount shares the header request');assert.equal(r.timers.size,1);
  r.api.setDraftPrice('known',7,'USD');const before=mounted.automatic.length;r.queue('fx',goodFx({rate:34}));await r.refresh();assert.equal(r.api.getExchangeRateStatus().rate,34);assert.equal(mounted.automatic.length,before);assert.equal(r.api.getDraftPrice('known').value,7);assert.deepEqual(mounted.options.store.widgetState,saved);
  await r.attach();assert.equal(r.views.length,1);assert.equal(fxCalls(r).length,2);assert.equal(r.timers.size,1);assert.equal(r.api.isDirty(),true);
  mounted.state.dirty=false;mounted.state.saving=true;r.queue('fx',goodFx({rate:35}));await r.refresh();assert.equal(mounted.automatic.length,before);mounted.state.saving=false;
  r.document.activeElement={matches:()=>true};r.queue('fx',goodFx({rate:36}));await r.refresh();assert.equal(mounted.automatic.length,before);r.document.activeElement=null;
  r.slot.children[0].shadowRoot.activeElement={matches:()=>true};r.queue('fx',goodFx({rate:37}));await r.refresh();assert.equal(mounted.automatic.length,before);r.slot.children[0].shadowRoot.activeElement=null;
  r.queue('fx',goodFx({rate:38}));await r.refresh();assert.equal(mounted.automatic.at(-1).rate,38);assertReadOnly(r);
});
test('access epoch and same-host replacement block obsolete responses without dropping a draft',async()=>{
  const r=setup(),late=deferred();r.queue('report',goodReport());r.queue('fx',late.promise);await r.attach();r.api.setDraftPrice('known',7,'USD');r.api.setAccess({salesMode:true,revision:11});
  late.resolve(goodFx({rate:31}));await tick();assert.equal(r.api.getExchangeRateStatus(),null);
  r.queue('fx',goodFx({rate:35}));await r.attach();assert.equal(r.api.getExchangeRateStatus().rate,35);assert.equal(r.api.getDraftPrice('known').value,7);assert.equal(r.views.length,1);assert.equal(r.timers.size,1);assertReadOnly(r);
});
test('hidden initial page refreshes immediately on becoming visible, without a second timer',async()=>{
  const r=setup();r.document.visibilityState='hidden';r.queue('report',pendingReport());await r.attach();assert.equal(fxCalls(r).length,0);
  r.queue('fx',goodFx());await r.visibility('visible');assert.equal(r.api.getExchangeRateStatus().rate,rate.rate);assert.equal(fxCalls(r).length,1);assert.equal(r.timers.size,1);assertReadOnly(r);
});
