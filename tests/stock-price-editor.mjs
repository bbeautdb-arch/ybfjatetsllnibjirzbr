import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createService,createBrowserService,parseSnapshot}=require('../stock_price_editor.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const key='1.8|AAA|1220|2440|sheet',reverse='1.8|AAA|2440|1220|sheet',near='1.8|AAA|1200|2400|sheet';
function fixture(){
  const row={key:'raw-1',w:1220,l:2440,t:1.8,grade:'AAA',unit:'sheet',qty:10,freeQty:6,committedQty:4,note:'keep raw note',followup:'keep tracking',followupBy:'named-user',followupAt:'2026-01-01T00:00:00Z',priceObj:{price:88,currency:'THB'}};
  const stock={ok:true,revision:7,report:{reportDate:'2026-01-01',checksum:'test'},exchangeRate:33,rows:[row,{...row,key:'raw-2',w:2440,l:1220,qty:5,freeQty:2,committedQty:3},{...row,key:'raw-3',w:1200,l:2400,qty:0,freeQty:0,committedQty:0},{...row,key:'raw-strip',unit:'strip',w:30,qty:100,freeQty:50,committedQty:50}],sellablePlan:{checksum:'keep',month:'2026-01'},dimensionAllocationPolicy:'keep'};
  const catalog={ok:true,revision:7,catalogRevision:3,stockReportDate:'2026-01-01',permissions:{pricesAndNotes:true,annotations:false},widgetState:{privateContent:{version:3,context:'aaf-sales-stock-preview|free-price-catalog',fx:33,prices:{[reverse]:4,[near]:9,'1.8|AAA|30|2440|strip':2},currencies:{[reverse]:'USD',[near]:'THB','1.8|AAA|30|2440|strip':'THB'},notesByThickness:{'1.8':'keep thickness'},notesBySpec:{[key]:'keep exact note'},savedAt:'2026-01-01T00:00:00Z'}}};
  return {stock,catalog};
}
function harness(){
  const data=fixture();let session='session-a',writes=0,afterWrite=null,failWrite=null;
  const bodies=[];
  const request=async(suffix,body)=>{
    if(!body)return clone(suffix?data.catalog:data.stock);
    writes++;bodies.push(clone(body));
    if(failWrite)throw Object.assign(new Error('controlled'),{code:failWrite});
    assert.equal(body.action,'saveSalesReport');assert.equal(body.expectedRevision,data.stock.revision);assert.equal(body.expectedCatalogRevision,data.catalog.catalogRevision);
    data.stock.revision++;data.catalog.revision++;data.catalog.catalogRevision++;
    Object.assign(data.catalog.widgetState.privateContent,{prices:clone(body.prices),currencies:clone(body.currencies),notesByThickness:clone(body.notesByThickness),...(body.notesBySpec?{notesBySpec:clone(body.notesBySpec)}:{}),savedAt:'2026-01-02T00:00:00Z'});
    if(afterWrite)await afterWrite(data);
    return clone(data.catalog);
  };
  const service=createService({identity:()=>session,request});
  return {data,service,bodies,request,get writes(){return writes;},setSession:v=>{session=v;},setAfterWrite:fn=>{afterWrite=fn;},setFailWrite:v=>{failWrite=v;}};
}
test('parse exact reversed dimensions once, keep near-size and strips separate, keep zero rows',()=>{
  const {stock,catalog}=fixture(),before=clone({stock,catalog});
  const result=parseSnapshot(stock,catalog).view;
  assert.equal(result.rows.length,3);assert.equal(result.rows.find(r=>r.key===key).qty,15);assert.equal(result.rows.find(r=>r.key===key).freeQty,8);
  assert.equal(result.rows.find(r=>r.key===key).price,4);assert.equal(result.rows.find(r=>r.key===key).currency,'USD');
  assert.equal(result.rows.find(r=>r.key===near).qty,0);assert.equal(result.canEdit,true);assert.deepEqual({stock,catalog},before);
});
test('price-only save retains all nonprice state and exact other-spec prices; fresh readback',async()=>{
  const h=harness(),before=clone(h.data);await h.service.load();
  const result=await h.service.save([{key,price:5.25,currency:'THB'}]);
  assert.equal(result.changed,true);assert.equal(h.writes,1);assert.equal(result.revision,8);assert.equal(result.catalogRevision,4);
  assert.equal(h.data.catalog.widgetState.privateContent.prices[reverse],5.25);assert(!Object.hasOwn(h.data.catalog.widgetState.privateContent.prices,key));
  assert.equal(h.data.catalog.widgetState.privateContent.prices[near],9);
  assert.deepEqual(h.data.stock.rows,before.stock.rows);assert.deepEqual(h.data.stock.report,before.stock.report);
  for(const field of ['fx','notesByThickness','notesBySpec'])assert.deepEqual(h.data.catalog.widgetState.privateContent[field],before.catalog.widgetState.privateContent[field]);
  assert.deepEqual(Object.keys(h.bodies[0]).sort(),['action','expectedRevision','expectedCatalogRevision','prices','currencies','notesByThickness','notesBySpec'].sort());
});
test('can fill absent price only for current registry exact specification',async()=>{
  const h=harness();delete h.data.catalog.widgetState.privateContent.prices[near];await h.service.load();
  assert.equal(h.service.getState().rows.find(r=>r.key===near).priceStatus,'missing-price');
  await h.service.save([{key:near,price:15,currency:'THB'}]);assert.equal(h.data.catalog.widgetState.privateContent.prices[near],15);
  await assert.rejects(h.service.save([{key:'2|F|1220|2440|sheet',price:10,currency:'THB'}]),{code:'invalid-price'});
});
test('reversed conflicting prices remain flagged and explicit edit resolves only exact aliases',async()=>{
  const h=harness();h.data.catalog.widgetState.privateContent.prices[key]=7;h.data.catalog.widgetState.privateContent.currencies[key]='THB';
  await h.service.load();const row=h.service.getState().rows.find(r=>r.key===key);assert.equal(row.price,null);assert.equal(row.priceStatus,'price-conflict');
  await h.service.save([{key,price:8,currency:'THB'}]);
  assert.equal(h.data.catalog.widgetState.privateContent.prices[key],8);assert.equal(h.data.catalog.widgetState.privateContent.prices[reverse],8);assert.equal(h.data.catalog.widgetState.privateContent.prices[near],9);
});
test('strict price permission, absent/truthy flags do not enable writes',async()=>{
  for(const flag of [false,undefined,'true',1]){
    const h=harness();h.data.catalog.permissions.pricesAndNotes=flag;await h.service.load();assert.equal(h.service.getState().canEdit,false);
    await assert.rejects(h.service.save([{key,price:5,currency:'THB'}]),{code:'permission-denied'});assert.equal(h.writes,0);
  }
});
test('fresh permission revocation prevents save even after allowed initial load',async()=>{
  const h=harness();await h.service.load();h.data.catalog.permissions.pricesAndNotes=false;
  await assert.rejects(h.service.save([{key,price:5,currency:'THB'}]),{code:'permission-denied'});assert.equal(h.writes,0);
});
test('any fresh catalog/stock conflict preserves changes on server and does not write',async()=>{
  for(const mutate of [d=>{d.catalog.catalogRevision++;},d=>{d.stock.rows[0].freeQty++;},d=>{d.catalog.widgetState.privateContent.notesBySpec[key]='changed by colleague';},d=>{d.stock.revision++;d.catalog.revision++;}]){
    const h=harness();await h.service.load();mutate(h.data);
    await assert.rejects(h.service.save([{key,price:5,currency:'THB'}]),{code:'conflict'});assert.equal(h.writes,0);
  }
});
test('blank, zero, negative, nonfinite, coercible prices and extra fields rejected',async()=>{
  const h=harness();await h.service.load();
  for(const price of ['',0,-1,NaN,Infinity,'5',null])await assert.rejects(h.service.save([{key,price,currency:'THB'}]),{code:'invalid-price'});
  await assert.rejects(h.service.save([{key,price:5,currency:'EUR'}]),{code:'invalid-price'});
  await assert.rejects(h.service.save([{key,price:5,currency:'THB',notes:'bad'}]),{code:'invalid-price'});
  await assert.rejects(h.service.save([{key,price:5,currency:'THB'},{key,price:5,currency:'THB'}]),{code:'invalid-price'});
  assert.equal(h.writes,0);
});
test('identity change clears public state and denies stale edit',async()=>{
  const h=harness();await h.service.load();h.setSession('session-b');assert.equal(h.service.getState().loaded,false);assert.deepEqual(h.service.getState().rows,[]);
  await assert.rejects(h.service.save([{key,price:5,currency:'THB'}]),{code:'session-changed'});assert.equal(h.writes,0);
});
test('ambiguous failed write cannot retry until explicit reload confirms no write',async()=>{
  const h=harness();await h.service.load();h.setFailWrite('save-uncertain');
  await assert.rejects(h.service.save([{key,price:5,currency:'THB'}]),{code:'save-uncertain'});assert.equal(h.service.getState().uncertain,true);
  await assert.rejects(h.service.save([{key,price:5,currency:'THB'}]),{code:'save-blocked'});assert.equal(h.writes,1);
  await h.service.load();assert.equal(h.service.getState().uncertain,false);h.setFailWrite(null);
  await h.service.save([{key,price:5,currency:'THB'}]);assert.equal(h.writes,2);
});
test('ambiguous response after actual commit resolves via reload without duplicate save',async()=>{
  const h=harness();await h.service.load();h.setAfterWrite(()=>{throw Object.assign(new Error('lost response'),{code:'save-uncertain'});});
  await assert.rejects(h.service.save([{key,price:5,currency:'THB'}]),{code:'save-uncertain'});assert.equal(h.writes,1);
  await h.service.load();assert.equal(h.service.getState().uncertain,false);assert.equal(h.service.getState().rows.find(r=>r.key===key).price,5);assert.equal(h.writes,1);
});
test('readback altered stock or notes remains blocked rather than report success',async()=>{
  for(const mutate of [d=>{d.stock.rows[0].qty++;},d=>{d.catalog.widgetState.privateContent.notesBySpec[key]='bad';},d=>{d.catalog.widgetState.privateContent.fx=34;}]){
    const h=harness();await h.service.load();h.setAfterWrite(mutate);
    await assert.rejects(h.service.save([{key,price:5,currency:'THB'}]),{code:'save-uncertain'});
    await assert.rejects(h.service.load(),{code:'save-uncertain'});assert.equal(h.service.getState().canEdit,false);assert.equal(h.writes,1);
  }
});
test('safe definitive server rejection permits retry without false uncertainty',async()=>{
  const h=harness();await h.service.load();h.setFailWrite('conflict');
  await assert.rejects(h.service.save([{key,price:5,currency:'THB'}]),{code:'conflict'});assert.equal(h.service.getState().uncertain,false);
});
test('browser adapter only sends authenticated scoped existing API and redacts server messages',async()=>{
  const calls=[],h=harness();const win={AAFStockAccess:{token:()=> 'synthetic-test-token'},fetch:async(url,options)=>{calls.push({url,options});const body=options.body?JSON.parse(options.body):null;const data=await h.request(url.includes('?')?'?view=salesReport&catalogOnly=1':'',body);return {ok:true,status:200,json:async()=>data};}};
  const service=createBrowserService(win);await service.load();await service.save([{key,price:6,currency:'USD'}]);
  assert(calls.every(c=>c.url.startsWith('https://aaf-grade-insight-2569.bbeautybbsoraai.chatgpt.site/api/aaf/stock')));
  assert(calls.every(c=>c.options.cache==='no-store'&&c.options.headers.Authorization==='Bearer synthetic-test-token'));
  assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
  win.fetch=async()=>({ok:false,status:403,json:async()=>({error:'secret backend diagnostic'})});
  await assert.rejects(service.load(),e=>e.code==='permission-denied'&&!e.message.includes('secret'));
});
