import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../stock_sales_controller.js',import.meta.url),'utf8');
const existing=fs.readFileSync(new URL('./stock-sales-controller.mjs',import.meta.url),'utf8');
const fixture=existing.slice(existing.indexOf('const canonicalState='),existing.indexOf('function assertAuthenticated'))
  .replace('const fetchQueue=[],fetchCalls=[],mounts=[],builds=[],windowListeners={},summaries=[],draftSyncs=[];','const fetchQueue=[],fetchCalls=[],mounts=[],builds=[],windowListeners={},summaries=[],draftSyncs=[],catalogs=[];')
  .replace('AAFStockSummary:{setSalesSummary(value)','AAFStockSummary:{setSavedStockCatalog(value){catalogs.push(value);},setSalesSummary(value)')
  .replace('api:window.AAFSalesPreview,fetchCalls,','api:window.AAFSalesPreview,catalogs,fetchCalls,')
  .replace('return{ok:queued.httpOk!==false,json:async()=>queued};','return{status:queued.status??200,ok:queued.httpOk!==false,json:async()=>queued};');
const {runtime,response,canonicalState,deferred,tick,descendants,find}=vm.runInNewContext(`const source=${JSON.stringify(source)};${fixture};({runtime,response,canonicalState,deferred,tick,descendants,find})`,{vm,URL,JSON,Promise,Error,console,setImmediate});
const day='2026-10-18',revision=58;
const central=()=>({salesMode:false,revision,reportDate:day,rows:[
  {key:'saved-aaa',sku:'SYNTHETIC-AAA',w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',qty:100,committedQty:120,freeQty:0,note:'saved note',followup:'saved followup'},
  {key:'saved-zero',sku:'SYNTHETIC-ZERO',w:1220,l:2440,t:2,grade:'F',unit:'sheet',qty:0,committedQty:0,freeQty:0,note:'zero note'},
  {key:'saved-strip',sku:'SYNTHETIC-STRIP',w:25,l:2052,t:3.2,grade:'B',unit:'strip',qty:850000,committedQty:220000,freeQty:630000},
]});
const catalog=(stock=central())=>({ok:true,revision:stock.revision,stockReportDate:stock.reportDate,catalogRevision:4,widgetState:{privateContent:{...canonicalState(1.95).privateContent,notesBySpec:{'2.5|AAA|1220|2440|sheet':'saved spec note'},notesByThickness:{'2.5':'saved thickness note'}}}});
const full=(stock=central())=>({...response('full-current',{revision:stock.revision}),...catalog(stock),permissions:{pricesAndNotes:true},salesReportDate:day,preview:{...response('full-current').preview,source:{stockReportDate:stock.reportDate},stockRows:stock.rows.map(({qty,...row})=>({...row,physical:qty}))}});
const stale=(stock=central())=>{const result=full(stock);result.preview.source.stockReportDate='2026-10-12';return result;};
const status=code=>({ok:false,httpOk:false,status:code,error:'PRIVATE SERVER DETAIL'});
const readText=slot=>descendants(slot).map(node=>node.textContent).filter(Boolean).join('\n');
const fallbackRows=slot=>descendants(slot).filter(node=>node.getAttribute('data-saved-stock-key'));
function setup(stock=central()){
  const r=runtime(),slot=r.slot();r.setToken('synthetic-session');r.api.setAccess(stock);return {...r,slot,stock};
}
function assertReadOnly(r){assert.equal(r.fetchCalls.filter(call=>call.init.method==='POST').length,0);for(const call of r.fetchCalls){assert.equal(call.init.cache,'no-store');assert.equal(call.init.headers.Authorization,'Bearer synthetic-session');}}

test('owner packaged old-day preview cannot replace current central stock; complete saved-stock/catalog fallback is read-only',async()=>{
  const r=setup();r.enqueue(stale());r.enqueue(catalog());await r.api.attach(r.slot);
  assert.equal(r.api.getReportLoadStatus().state,'pending');assert.equal(r.api.getReportSummary(),null);assert.equal(r.mounts.length,0);assert.equal(r.api.isReadOnly(),true);
  assert.equal(fallbackRows(r.slot).length,3);const text=readText(r.slot);
  for(const item of ['2026-10-18','SYNTHETIC-ZERO','850,000','ชิ้น strip','saved note','saved followup','saved spec note','saved thickness note','1.95','USD','ไม่หักซ้ำ','ยังไม่ใช่ราคาเฉลี่ย 6 เดือนอัตโนมัติ'])assert.ok(text.includes(item),item);
  assert.equal(r.catalogs.at(-1).rows[1].price,null);assert.equal(r.catalogs.at(-1).rows[0].price,1.95);
  assert.equal(r.api.setDraftPrice('any',10),false);assert.equal(await r.api.savePrices(),false);
  assert.ok(r.fetchCalls[1].url.endsWith('?view=salesPreview&catalogOnly=1'));assertReadOnly(r);
});

test('same-date owner preview with wrong per-spec Physical remains pending even if grand total matches',async()=>{
  const stock=central(),data=full(stock);data.preview.stockRows[0].physical=99;data.preview.stockRows[1].physical=1;
  const r=setup(stock);r.enqueue(data);r.enqueue(catalog(stock));await r.api.attach(r.slot);
  assert.equal(r.mounts.length,0);assert.equal(r.api.getReportSummary(),null);assert.equal(fallbackRows(r.slot).length,3);assertReadOnly(r);
});

test('exact reversed axes match; allocation-only 1200x2400 alias cannot make mismatched owner prices or Physical pass',async()=>{
  for(const equivalent of [true,false]){
    const stock=central(),data=full(stock);data.preview.stockRows[0].w=equivalent?2440:1200;data.preview.stockRows[0].l=equivalent?1220:2400;
    const r=setup(stock);r.enqueue(data);if(!equivalent)r.enqueue(catalog(stock));await r.api.attach(r.slot);
    assert.equal(r.mounts.length,equivalent?1:0);assert.equal(r.api.getReportLoadStatus().state,equivalent?'ready':'pending');assertReadOnly(r);
  }
});

test('matching full report still mounts existing view and publishes only identity-matched saved catalog',async()=>{
  const r=setup();r.enqueue(full());await r.api.attach(r.slot);
  assert.equal(r.mounts.length,1);assert.equal(r.api.getReportLoadStatus().state,'ready');assert.equal(r.api.getReportSummary().label,'full-current');
  const value=r.catalogs.at(-1);assert.equal(value.revision,revision);assert.equal(value.reportDate,day);assert.equal(value.rows.length,3);assert.equal(value.rows[0].price,1.95);assert.equal(value.rows[1].price,null);assertReadOnly(r);
});

test('shared report 409 reads catalog independently and never substitutes owner preview or hidden sales data',async()=>{
  const stock={...central(),salesMode:true},r=setup(stock);r.enqueue(status(409));r.enqueue(catalog(stock));await r.api.attach(r.slot);
  assert.equal(r.api.getReportLoadStatus().state,'pending');assert.equal(fallbackRows(r.slot).length,3);assert.equal(r.mounts.length,0);
  assert.ok(r.fetchCalls.every(call=>call.url.includes('view=salesReport')));assert.ok(!readText(r.slot).includes('PRIVATE'));assertReadOnly(r);
});

test('owner same-day unchanged Physical but stale sales ledger uses guarded report and remains pending on server409',async()=>{
  const r=setup();r.enqueue(status(409));r.enqueue(catalog());await r.api.attach(r.slot);
  assert.ok(r.fetchCalls[0].url.endsWith('?view=salesReport'),'owner full report must pass server ledger guard');
  assert.ok(r.fetchCalls[1].url.endsWith('?view=salesPreview&catalogOnly=1'),'owner saved-catalog read remains independent');
  assert.equal(r.mounts.length,0);assert.equal(r.api.getReportSummary(),null);assert.equal(r.api.getReportLoadStatus().state,'pending');assert.equal(fallbackRows(r.slot).length,3);assertReadOnly(r);
});

test('owner guarded sanitized report with matching Physical mounts without private source metadata and retains owner save action',async()=>{
  const r=setup(),data=full();delete data.preview.source;r.enqueue(data);await r.api.attach(r.slot);
  assert.equal(r.mounts.length,1);assert.ok(r.fetchCalls[0].url.endsWith('?view=salesReport'));assert.equal(r.api.getReportLoadStatus().state,'ready');
  assert.equal(r.catalogs.at(-1).rows[0].price,1.95);r.api.setDraftPrice('2.5|AAA|1220|2440|sheet',2.75,'USD');assert.equal(r.catalogs.at(-1).rows[0].price,1.95,'unsaved draft must not clear or replace saved prices');
  const next=canonicalState(2.75);r.enqueue(catalog());r.enqueue({...catalog(),catalogRevision:5,widgetState:next});
  await r.mounts[0].options.store.setWidgetState(next);
  const post=r.fetchCalls.at(-1);assert.equal(post.init.method,'POST');assert.equal(JSON.parse(post.init.body).action,'saveSalesPreview');
  assert.equal(r.catalogs.at(-1),null,'verified save must clear independent old saved prices until a fresh central revision is read');
});

test('catalog temporary failure or revision/date mismatch keeps all stock but no old/zero prices',async()=>{
  for(const failed of [status(503),new Error('offline'),{...catalog(),revision:59},{...catalog(),stockReportDate:'2026-10-19'},{...catalog(),widgetState:null}]){
    const stock={...central(),salesMode:true},r=setup(stock);r.enqueue(status(409));r.enqueue(failed);await r.api.attach(r.slot);
    assert.equal(fallbackRows(r.slot).length,3);assert.equal(r.catalogs.at(-1),null);assert.equal(r.api.getReportSummary(),null);
    const rows=fallbackRows(r.slot);assert.ok(rows.every(row=>row.children[5].textContent==='—'));assertReadOnly(r);
  }
});

test('catalog auth denial removes protected fallback immediately and is not left retryable pending',async()=>{
  for(const code of [401,403]){const r=setup({...central(),salesMode:true});r.enqueue(status(409));r.enqueue(status(code));await r.api.attach(r.slot);assert.equal(fallbackRows(r.slot).length,0);assert.equal(r.catalogs.at(-1),null);assert.equal(r.api.getReportLoadStatus().state,'unavailable');assert.equal(r.mounts.length,0);assertReadOnly(r);}
});

test('reversed catalog aliases resolve exact saved price but conflicting aliases stay unknown',async()=>{
  for(const conflict of [false,true]){
    const r=setup(),saved=catalog(),p=saved.widgetState.privateContent;
    p.prices={'2.5|AAA|2440|1220|sheet':2.25};p.currencies={'2.5|AAA|2440|1220|sheet':'USD'};
    if(conflict){p.prices['2.5|AAA|1220|2440|sheet']=2.5;p.currencies['2.5|AAA|1220|2440|sheet']='USD';}
    r.enqueue(stale());r.enqueue(saved);await r.api.attach(r.slot);const row=r.catalogs.at(-1).rows[0];assert.equal(row.price,conflict?null:2.25);assert.equal(row.currency,conflict?null:'USD');assertReadOnly(r);
  }
});

test('invalid or zero price and unsupported currencies never become plausible prices or zero stock value',async()=>{
  for(const [price,currency] of [[0,'THB'],[-1,'USD'],['12','THB'],[12,'EUR'],[null,'USD']]){
    const r=setup(),saved=catalog();saved.widgetState.privateContent.prices['2.5|AAA|1220|2440|sheet']=price;saved.widgetState.privateContent.currencies['2.5|AAA|1220|2440|sheet']=currency;
    r.enqueue(stale());r.enqueue(saved);await r.api.attach(r.slot);assert.equal(r.catalogs.at(-1).rows[0].price,null);assert.equal(fallbackRows(r.slot)[0].children[5].textContent,'—');assertReadOnly(r);
  }
});

test('late catalog after session replacement or invalidation cannot republish protected rows',async()=>{
  for(const change of ['token','invalidate','revision']){
    const r=setup(),gate=deferred();r.enqueue(stale());r.pending(gate);const loading=r.api.attach(r.slot);await tick();assert.equal(fallbackRows(r.slot).length,3);
    if(change==='token'){r.setToken('replacement');r.enqueue(status(401));await r.api.attach(r.slot);}
    if(change==='invalidate')r.api.invalidate('เข้าสู่ระบบอีกครั้ง');
    if(change==='revision'){r.api.setAccess({...central(),revision:59});r.enqueue(status(401));await r.api.attach(r.slot);}
    gate.resolve(catalog());await loading;assert.equal(fallbackRows(r.slot).length,0);assert.equal(r.catalogs.at(-1),null);assert.equal(r.api.getReportSummary(),null);
  }
});

test('pending shared report retries at same revision; no independent catalog contaminates later valid full report',async()=>{
  const stock={...central(),salesMode:true},r=setup(stock);r.enqueue(status(409));r.enqueue(catalog(stock));await r.api.attach(r.slot);assert.equal(fallbackRows(r.slot).length,3);
  r.enqueue(full(stock));await r.api.attach(r.slot);assert.equal(fallbackRows(r.slot).length,0);assert.equal(r.mounts.length,1);assert.equal(r.api.getReportLoadStatus().state,'ready');assertReadOnly(r);
});

test('central revision change preserves dirty full-view drafts but cannot publish stale report/catalog',async()=>{
  const r=setup();r.enqueue(full());await r.api.attach(r.slot);r.api.setDraftPrice('draft',2.75,'USD');
  r.api.setAccess({...central(),revision:59});await r.api.attach(r.slot);
  assert.equal(r.mounts.length,1);assert.equal(r.api.isDirty(),true);assert.equal(r.api.getReportSummary(),null);assert.equal(r.catalogs.at(-1),null);
  r.mounts[0].options.onReportSummary({label:'late-stale'});assert.equal(r.api.getReportSummary(),null);assertReadOnly(r);
});

test('malformed central snapshot fails closed before mounting owner preview or publishing catalog',async()=>{
  const stock=central();stock.rows[0].qty=-1;const r=setup(stock);r.enqueue(full());await r.api.attach(r.slot);
  assert.equal(r.mounts.length,0);assert.equal(fallbackRows(r.slot).length,0);assert.equal(r.api.getReportSummary(),null);assert.equal(r.catalogs.at(-1),null);assertReadOnly(r);
});

test('fallback text is inserted through textContent, not executable HTML',async()=>{
  const stock=central();stock.rows[0].note='<img src=x onerror=alert(1)>';const r=setup(stock);r.enqueue(stale(stock));r.enqueue(catalog(stock));await r.api.attach(r.slot);
  assert.ok(readText(r.slot).includes('<img src=x onerror=alert(1)>'));assert.equal(descendants(r.slot).filter(node=>node.tagName==='IMG').length,0);assertReadOnly(r);
});
