import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../stock_sales_controller.js',import.meta.url),'utf8');
const canonicalState=(price=1.95)=>({modelContent:{scope:'AAF preview price catalog'},privateContent:{version:3,context:'aaf-sales-stock-preview|free-price-catalog',fx:33.3901,prices:{'2.5|AAA|1220|2440|sheet':price},currencies:{'2.5|AAA|1220|2440|sheet':'USD'},notesByThickness:{},savedAt:'2026-10-02T00:00:00.000Z'}});
const preview=label=>({salesRows:[{id:`sale-${label}`,customer:`SYNTHETIC-${label}`}],stockRows:[{sku:`stock-${label}`}],modelOptions:{strict:true,paidOverrideRefs:[]},options:{metadata:{monthLabel:label}}});
const response=(label,{catalogRevision=1,revision=10,widgetState=canonicalState()}={})=>({ok:true,preview:preview(label),widgetState,catalogRevision,revision,source:{label}});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const clone=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

class FakeElement{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.listeners={};this.style={};this.textContent='';this.hidden=false;this.disabled=false;this.parentNode=null;}
  append(...nodes){for(const node of nodes){node.parentNode=this;this.children.push(node);}}
  replaceChildren(...nodes){for(const node of this.children)node.parentNode=null;this.children=[];this.append(...nodes);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name]??null;}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  removeEventListener(name,fn){this.listeners[name]=(this.listeners[name]||[]).filter(candidate=>candidate!==fn);}
  async dispatch(name,event={target:this}){for(const fn of this.listeners[name]||[])await fn(event);}
  attachShadow({mode}){this.shadowMode=mode;this.shadowRoot=new FakeElement('#shadow-root');this.shadowRoot.host=this;return this.shadowRoot;}
}

function descendants(root){return[root,...root.children.flatMap(descendants),...(root.shadowRoot?descendants(root.shadowRoot):[])];}
function find(root,predicate){return descendants(root).find(predicate);}

function runtime(){
  const fetchQueue=[],fetchCalls=[],mounts=[],builds=[],windowListeners={},summaries=[];
  let user=null;
  const sessionStorage={getItem:key=>key==='aaf_user'&&user?JSON.stringify(user):null};
  const document={currentScript:{src:'https://public.example/assets/stock_sales_controller.js'},createElement:tag=>new FakeElement(tag)};
  const window={
    AAFStockSummary:{setSalesSummary(value){summaries.push(value);}},
    AafAllModel:{buildModel(salesRows,stockRows,modelOptions){const model={salesRows,stockRows,modelOptions};builds.push(model);return model;}},
    mountAllThickness(root,model,options){
      const state={dirty:false,saving:false};
      const controller={ready:Promise.resolve(),destroyed:false,destroy(){this.destroyed=true;},getPriceState(){return state;},getReportSummary(){return {label:options.metadata.monthLabel,saved:true};}};
      mounts.push({root,model,options,state,controller});return controller;
    },
    addEventListener(name,fn){windowListeners[name]=fn;},
  };
  async function fetch(url,init={}){
    fetchCalls.push({url:String(url),init:clone(init)});
    if(!fetchQueue.length)throw new Error(`Unexpected fetch ${url}`);
    const queued=await fetchQueue.shift();
    if(queued instanceof Error)throw queued;
    return{ok:queued.httpOk!==false,json:async()=>queued};
  }
  const context=vm.createContext({window,document,sessionStorage,fetch,URL,JSON,Promise,Error,console});
  vm.runInContext(source,context,{filename:'stock_sales_controller.js'});
  return{
    api:window.AAFSalesPreview,fetchCalls,mounts,builds,windowListeners,summaries,
    slot:()=>new FakeElement('main'),
    setToken(token){user=token?{stockSessionToken:token}:null;},
    enqueue(value){fetchQueue.push(value);},
    pending(value){fetchQueue.push(value.promise);},
  };
}

function assertAuthenticated(calls,token){
  assert(calls.length>0);
  for(const call of calls){
    assert.equal(call.init.headers.Authorization,`Bearer ${token}`);
    assert.equal(call.init.cache,'no-store');
    assert(!call.url.includes('salesRows')&&!call.url.includes('stockRows'),'private rows are never published in a URL');
  }
}

// Public controller and assets contain no sales snapshot; all runtime reads require a bearer session.
assert(!source.includes('SYNTHETIC-')&&!source.includes('"salesRows":['));
{
  const r=runtime(),slot=r.slot();
  await r.api.attach(slot);
  assert.equal(r.fetchCalls.length,0,'missing session never starts a private request');
  assert.match(find(slot,node=>node.className==='preview-state').textContent,/เข้าสู่ระบบ/);
}

// Initial attach mounts exactly once, never writes, uses the open shadow CSS, and reattach preserves the live draft.
{
  const r=runtime(),first=r.slot(),second=r.slot();r.setToken('token-A');r.enqueue(response('A',{catalogRevision:5,revision:100}));
  await r.api.attach(first);
  assert.equal(r.mounts.length,1);assert.equal(r.fetchCalls.length,1);assertAuthenticated(r.fetchCalls,'token-A');
  const host=first.children[0];assert.equal(host.shadowMode,'open');
  const stylesheet=find(host,node=>node.tagName==='LINK');
  assert.equal(stylesheet.rel,'stylesheet');assert.equal(stylesheet.href,'https://public.example/assets/stock_sales_preview.css?v=20261002-sales-block');
  assert.equal(r.mounts[0].root.id,'sales-stock-preview-16');
  assert.equal(r.fetchCalls.filter(call=>call.init.method==='POST').length,0,'initial mount never writes a catalog');
  r.mounts[0].state.dirty=true;
  await r.api.attach(second);
  assert.equal(r.mounts.length,1,'same-session reattach reuses the existing view');
  assert.equal(second.children[0],host);assert.equal(r.api.isDirty(),true,'unsaved draft survives reattach');
  assert.equal(r.mounts[0].controller.destroyed,false);
  assert.deepEqual(r.api.getReportSummary(),{label:'A',saved:true});
  r.mounts[0].options.onReportSummary({label:'SAVED',saved:true});
  assert.deepEqual(r.api.getReportSummary(),{label:'SAVED',saved:true});
  assert.equal(r.summaries.at(-1).label,'SAVED');
  r.setToken('token-B');assert.equal(r.api.getReportSummary(),null,'changed token never returns prior catalog summary');
  r.mounts[0].options.onReportSummary({label:'STALE',saved:true});
  assert.equal(r.summaries.at(-1).label,'SAVED','late old-token callback cannot repaint top KPIs');
}

// Save reads the latest global revision, performs CAS on the mounted catalog revision, and rejects stale catalogs before POST.
{
  const r=runtime(),slot=r.slot();r.setToken('token-save');r.enqueue(response('SAVE',{catalogRevision:5,revision:100}));await r.api.attach(slot);
  const store=r.mounts[0].options.store,next=canonicalState(2.5);
  r.enqueue({ok:true,catalogRevision:5,revision:101,widgetState:canonicalState()});
  r.enqueue({ok:true,catalogRevision:6,revision:102,widgetState:next});
  const returned=await store.setWidgetState(next);
  assert.deepEqual(returned,next);assert.deepEqual(store.widgetState,next);
  const saveCall=r.fetchCalls.at(-1),body=JSON.parse(saveCall.init.body);
  assert.equal(body.action,'saveSalesPreview');assert.equal(body.expectedRevision,101);assert.equal(body.expectedCatalogRevision,5);assert.deepEqual(body.widgetState,next);
  assert.equal(saveCall.init.headers['Content-Type'],'text/plain;charset=UTF-8');
  assertAuthenticated(r.fetchCalls,'token-save');
  const before=r.fetchCalls.length;r.enqueue({ok:true,catalogRevision:7,revision:103,widgetState:canonicalState(3)});
  await assert.rejects(()=>store.setWidgetState(canonicalState(4)),/มีราคาใหม่จากอีกหน้า/);
  assert.equal(r.fetchCalls.length,before+1,'stale catalog is rejected after refresh without a write');
}

// First import is offered only when the catalog is absent, and mounts only after exact server readback.
{
  const r=runtime(),slot=r.slot(),imported=canonicalState(2.75);r.setToken('token-import');r.enqueue(response('IMPORT',{catalogRevision:0,revision:200,widgetState:null}));
  await r.api.attach(slot);assert.equal(r.mounts.length,0);
  const input=find(slot,node=>node.tagName==='INPUT'&&node.type==='file'),button=find(slot,node=>node.tagName==='BUTTON');
  assert(input&&button);input.files=[{text:async()=>JSON.stringify(imported)}];await input.dispatch('change');assert.equal(button.disabled,false);
  r.enqueue({ok:true,catalogRevision:0,revision:201,widgetState:null});
  r.enqueue({ok:true,catalogRevision:1,revision:202,widgetState:imported});
  await button.dispatch('click');
  assert.equal(r.mounts.length,1);const body=JSON.parse(r.fetchCalls.at(-1).init.body);
  assert.equal(body.action,'importSalesPreview');assert.equal(body.expectedRevision,201);assert.equal(body.expectedCatalogRevision,0);assert.deepEqual(body.widgetState,imported);
  assertAuthenticated(r.fetchCalls,'token-import');
}

{
  const r=runtime(),slot=r.slot();r.setToken('token-import-stale');r.enqueue(response('IMPORT',{catalogRevision:0,revision:300,widgetState:null}));await r.api.attach(slot);
  const input=find(slot,node=>node.tagName==='INPUT'&&node.type==='file'),button=find(slot,node=>node.tagName==='BUTTON');
  input.files=[{text:async()=>JSON.stringify(canonicalState(3))}];await input.dispatch('change');
  r.enqueue({ok:true,catalogRevision:1,revision:301,widgetState:canonicalState(2)});const before=r.fetchCalls.length;await button.dispatch('click');
  assert.equal(r.fetchCalls.length,before+1);assert.equal(r.mounts.length,0,'existing catalog blocks one-time import before POST');
  assert.match(find(slot,node=>node.tagName==='P'&&node!==find(slot,item=>item.className==='preview-state')).textContent,/มีราคาในระบบแล้ว/);
}

{
  const r=runtime(),slot=r.slot();r.setToken('token-import-mismatch');r.enqueue(response('IMPORT',{catalogRevision:0,revision:400,widgetState:null}));await r.api.attach(slot);
  const input=find(slot,node=>node.tagName==='INPUT'&&node.type==='file'),button=find(slot,node=>node.tagName==='BUTTON');
  input.files=[{text:async()=>JSON.stringify(canonicalState(3))}];await input.dispatch('change');
  r.enqueue({ok:true,catalogRevision:0,revision:401,widgetState:null});r.enqueue({ok:true,catalogRevision:1,revision:402,widgetState:canonicalState(9)});await button.dispatch('click');
  assert.equal(r.mounts.length,0,'mismatched readback never mounts or accepts the imported catalog');
  assert.match(descendants(slot).filter(node=>node.tagName==='P').at(-1).textContent,/ข้อมูลหลังนำเข้าไม่ตรง/);
}

// A save/import already in flight under an old token may finish server-side, but cannot update the new session's view, store, or revision.
{
  const r=runtime(),slot=r.slot();r.setToken('token-save-old');r.enqueue(response('SAVE-OLD',{catalogRevision:5,revision:500}));await r.api.attach(slot);
  const oldStore=r.mounts[0].options.store,oldState=clone(oldStore.widgetState),post=deferred(),next=canonicalState(5);
  r.enqueue({ok:true,catalogRevision:5,revision:501,widgetState:oldState});r.pending(post);
  const saving=oldStore.setWidgetState(next);await tick();
  assert.equal(r.fetchCalls.at(-1).init.method,'POST','old-session save reached its authenticated CAS write');
  r.setToken('token-save-new');r.enqueue(response('SAVE-NEW',{catalogRevision:20,revision:600}));await r.api.attach(slot);
  r.mounts.at(-1).state.dirty=true;
  post.resolve({ok:true,catalogRevision:6,revision:502,widgetState:next});
  await assert.rejects(saving,/เซสชันเปลี่ยนแล้ว/);
  assert.deepEqual(oldStore.widgetState,oldState,'old completion cannot acknowledge itself into the detached store');
  assert.equal(r.api.isDirty(),true,'old save completion cannot replace the new active view');
  assert.equal(r.fetchCalls[1].init.headers.Authorization,'Bearer token-save-old');assert.equal(r.fetchCalls[2].init.headers.Authorization,'Bearer token-save-old');
  assert.equal(r.fetchCalls[3].init.headers.Authorization,'Bearer token-save-new');
}

{
  const r=runtime(),slot=r.slot(),importPost=deferred(),imported=canonicalState(6);r.setToken('token-import-old');
  r.enqueue(response('IMPORT-OLD',{catalogRevision:0,revision:700,widgetState:null}));await r.api.attach(slot);
  const input=find(slot,node=>node.tagName==='INPUT'&&node.type==='file'),button=find(slot,node=>node.tagName==='BUTTON');
  input.files=[{text:async()=>JSON.stringify(imported)}];await input.dispatch('change');
  r.enqueue({ok:true,catalogRevision:0,revision:701,widgetState:null});r.pending(importPost);
  const importing=button.dispatch('click');await tick();assert.equal(r.fetchCalls.at(-1).init.method,'POST');
  r.setToken('token-import-new');r.enqueue(response('IMPORT-NEW',{catalogRevision:30,revision:800}));await r.api.attach(slot);
  importPost.resolve({ok:true,catalogRevision:1,revision:702,widgetState:imported});await importing;
  assert.equal(r.mounts.length,1);assert.equal(r.builds[0].salesRows[0].id,'sale-IMPORT-NEW','old import completion cannot mount private data into the new session');
  assert.equal(r.fetchCalls[1].init.headers.Authorization,'Bearer token-import-old');assert.equal(r.fetchCalls[2].init.headers.Authorization,'Bearer token-import-old');
  assert.equal(r.fetchCalls[3].init.headers.Authorization,'Bearer token-import-new');
}

// Token replacement immediately detaches old data; stale async completions must not become the active view/revision.
{
  const r=runtime(),slot=r.slot(),oldRequest=deferred(),newRequest=deferred();
  r.setToken('token-old');r.pending(oldRequest);const oldPending=r.api.attach(slot),oldHost=slot.children[0];
  r.setToken('token-new');r.pending(newRequest);const newPending=r.api.attach(slot),newHost=slot.children[0];
  assert.notEqual(newHost,oldHost,'token change replaces the entire shadow host before network completion');
  newRequest.resolve(response('NEW',{catalogRevision:9,revision:900}));await newPending;
  assert.equal(r.mounts.length,1);r.mounts[0].state.dirty=true;assert.equal(r.api.isDirty(),true);
  oldRequest.resolve(response('OLD',{catalogRevision:2,revision:200}));await oldPending;
  assert.equal(r.mounts.length,1,'late response from the prior token is ignored');
  assert.equal(r.builds[0].salesRows[0].id,'sale-NEW');assert.equal(slot.children[0],newHost);assert.equal(r.api.isDirty(),true,'late prior-token response cannot replace active lifecycle state');
}

console.log('Stock sales controller auth, shadow CSS, draft reattach, revision CAS, one-time import/readback and token-isolation tests passed.');
