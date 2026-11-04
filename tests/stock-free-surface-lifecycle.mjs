import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

// Synthetic controller/DOM tests only. No company data or browser credentials.
const require=createRequire(import.meta.url);
const {boot}=require('../stock_order_controller.js');
const core=require('../stock_review_notes_bridge.js');
const summarySource=fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
class Node {
  constructor(){this.children=[];this.style={};this.listeners={};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(){}
  addEventListener(type,listener){this.listeners[type]=listener;}
}
function binding(revision=1){
  const source={page:9,capturedAt:'2026-01-01T01:00:00Z',checksum:'sha256:'+'a'.repeat(64),sourceIsLive:false};
  return {revision,reportDate:'2026-01-01',currentMonthSold:{status:'verified-quantities',month:'2026-01',source},currentAllocation:{status:'verified-allocation',month:'2026-01',source,stock:{revision,reportDate:'2026-01-01',planChecksum:'sha256:'+'b'.repeat(64),planCapturedAt:'2026-01-01T01:05:00Z'}}};
}
function report(b=binding()){
  return {ok:true,revision:b.revision,stockReportDate:b.reportDate,availableMonths:['2026-01','2025-12'],selectedMonth:'2026-01',review:{metadata:{month:'2026-01'},rows:[]},readModel:{kind:'current-month-order-review',status:'verified',sourceIsLive:false,queueApplied:false,source:{...b.currentMonthSold.source,month:'2026-01'},stock:{...b.currentAllocation.stock}}};
}
function controller(){
  let token='synthetic-session';const requests=[],responses=[],views=[];
  const win={Date:{now:()=>Date.parse('2026-01-15T00:00:00Z')},document:{createElement:()=>new Node()},AAFStockAccess:{token:()=>token},AAFStockNotesCore:core,
    AAFStockSummary:{setOrderReview(){},invalidateCurrentMonthSold(){}},addEventListener(){},
    AAFOrderReviewUI:{mount(host,review,services){
      const view={host,review,services,dirty:false,destroyed:false,attachments:[],identities:[],reads:0,suspensions:[],
        attachFreeSurface(surface,identity){this.attachments.push({surface,identity});},
        setStockIdentity(identity){this.identities.push(identity);},refreshNotes(){this.reads++;},
        hasDirty(){return this.dirty;},update(next){this.review=next;},suspendSales(message){this.suspensions.push(message);},
        suspendEditing(message){this.editingSuspended=message;},destroy(){this.destroyed=true;}};
      views.push(view);return view;
    }},
    async fetch(url,options){requests.push({url,options});const value=await responses.shift();assert.ok(value,'unexpected network request');return {status:value.status||200,ok:!value.status,json:async()=>value};}
  };
  return {api:boot(win),requests,responses,views,setToken:value=>token=value};
}

test('upper Free host attaches to the existing registry instance and never creates a second reader/writer',async()=>{
  const h=controller(),surface=new Node();h.api.attachFreeSurface(surface);
  assert.equal(h.requests.length,0);assert.equal(h.views.length,0);
  h.api.setAccess(binding());h.responses.push(report());await h.api.attach(new Node());
  assert.equal(h.views.length,1);const view=h.views[0];
  assert.equal(view.attachments.at(-1).surface,surface);assert.deepEqual(view.attachments.at(-1).identity,{revision:1,reportDate:'2026-01-01'});
  view.dirty=true;const before=h.requests.length;
  h.api.attachFreeSurface(surface);await h.api.attach(new Node());
  assert.equal(h.views.length,1);assert.equal(h.api.isDirty(),true);assert.equal(h.requests.length,before);
  assert(h.requests.every(r=>r.options.method==='GET'));
});

test('accepted stock refresh forwards the new identity without changing saved quantities or posting annotations',async()=>{
  const h=controller(),surface=new Node();h.api.setAccess(binding());h.responses.push(report());await h.api.attach(new Node());h.api.attachFreeSurface(surface);
  const newer=binding(2),before=clone(newer);h.responses.push(report(newer));await h.api.syncCurrentSource(newer);
  assert.equal(h.views.length,1);assert.equal(h.views[0].attachments.at(-1).surface,surface);
  assert.deepEqual(h.views[0].attachments.at(-1).identity,{revision:2,reportDate:'2026-01-01'});
  assert.equal(h.views[0].reads,1);assert.deepEqual(newer,before);assert(h.requests.every(r=>r.options.method==='GET'));
});

test('same-account invalidation keeps shared drafts suspended; changed account destroys the old view',async()=>{
  const h=controller();h.api.setAccess(binding());h.responses.push(report());await h.api.attach(new Node());h.api.attachFreeSurface(new Node());
  const view=h.views[0];view.dirty=true;h.api.invalidate('Synthetic access expired');
  assert.equal(view.destroyed,false);assert.match(view.editingSuspended,/Synthetic access expired/);assert(h.api.isDirty());
  h.setToken('synthetic-new-account');h.api.setAccess(binding());assert.equal(view.destroyed,true);assert.equal(h.api.isDirty(),false);
  assert(h.requests.every(r=>r.options.method==='GET'));
});

test('read-only route passes denied annotation permissions to the same registry reader',async()=>{
  const h=controller();h.api.setAccess({...binding(),notesReadOnly:true});h.responses.push(report());await h.api.attach(new Node());h.api.attachFreeSurface(new Node());
  const key='2|A|100|200|sheet';
  h.responses.push({ok:true,revision:1,permissions:{followup:true},exchangeRate:30,report:{reportDate:'2026-01-01'},rows:[{key:'w100_l200_t2_gA',w:100,l:200,t:2,grade:'A',unit:'sheet',qty:10,freeQty:3,committedQty:7,note:'synthetic protected',followup:'synthetic tracking',priceObj:{price:5,currency:'THB'}}]},
    {ok:true,revision:1,catalogRevision:2,stockReportDate:'2026-01-01',permissions:{pricesAndNotes:true},widgetState:{privateContent:{version:3,context:'aaf-sales-stock-preview|free-price-catalog',fx:30,prices:{[key]:5},currencies:{[key]:'THB'},notesByThickness:{},notesBySpec:{[key]:'synthetic note'},savedAt:'2026-01-01T00:00:00Z'}}});
  const snapshot=await h.views[0].services.readNotes();assert.equal(snapshot.canSave,false);assert.equal(snapshot.canEditFollowup,false);assert(h.requests.every(r=>r.options.method==='GET'));
});

function summaryPreservation(){
  let current=null;const attachments=[],focus=[];
  const input={value:'unsaved synthetic text',selectionStart:3,selectionEnd:7,selectionDirection:'backward',isConnected:true,focus(options){focus.push(options);},setSelectionRange(...selection){this.restoredSelection=selection;}};
  const old={open:true,contains:node=>node===input,remove(){current=null;input.isConnected=false;}};
  const host={synthetic:true},fresh={replaceWith(panel){assert.equal(panel,old);current=panel;input.isConnected=true;}};
  current=old;
  const context={root:{querySelector:selector=>selector==='[data-free-followup-panel]'?current:selector==='[data-free-followup-host]'?host:null},document:{activeElement:input},window:{AAFOrderReview:{attachFreeSurface:surface=>attachments.push(surface)}}};
  const start=summarySource.indexOf('  function retainFreeSurface(){'),end=summarySource.indexOf('  const expandedThickness=',start);
  assert(start>=0&&end>start);const api=vm.runInNewContext(summarySource.slice(start,end)+'\n({retainFreeSurface,restoreFreeSurface})',context);
  return {api,input,old,host,attachments,focus,replace:()=>current=fresh,current:()=>current};
}
test('summary repaint moves the same editor node, preserving draft, disclosure, focus and selection',()=>{
  const h=summaryPreservation(),retained=h.api.retainFreeSurface();assert.equal(h.current(),null);
  h.replace();h.api.restoreFreeSurface(retained);assert.equal(h.current(),h.old);assert.equal(h.old.open,true);assert.equal(h.input.value,'unsaved synthetic text');
  assert.equal(h.attachments.at(-1),h.host);assert.equal(h.focus[0].preventScroll,true);assert.deepEqual(h.input.restoredSelection,[3,7,'backward']);
});

test('all card repaint paths retain the shared Free editor rather than reconstructing drafts',()=>{
  for(const [start,end] of [['  function setSalesSummary(summary){','  function setOrderReview('],['  function setCurrentMonthSold(value,allocationValue){','  function invalidateCurrentMonthSold('],['  function update(data,calculate){','  async function loadCanvas(']]){
    const body=summarySource.slice(summarySource.indexOf(start),summarySource.indexOf(end,summarySource.indexOf(start)));
    assert.match(body,/retainFreeSurface\(\)/,start);assert.match(body,/restoreFreeSurface\(freeSurface\)/,start);
    assert(body.indexOf('retainFreeSurface()')<body.indexOf('restoreFreeSurface(freeSurface)'),start);
  }
});
