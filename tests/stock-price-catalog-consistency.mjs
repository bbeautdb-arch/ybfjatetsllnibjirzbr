import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const panel=require('../stock_price_panel.js'),editor=require('../stock_price_editor.js'),header=require('../stock_order_header.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const code=fs.readFileSync(new URL('../stock_sales_controller.js',import.meta.url),'utf8');
// Exercise the exact production catalog adapter without granting test-only API access.
const savedCatalogRows=vm.runInNewContext(code.slice(code.indexOf('  function savedCatalogRows('),code.indexOf('  function publishSavedCatalog('))+'\nsavedCatalogRows',{
  readError:code=>Object.assign(new Error(code),{code}),
  plain:value=>value!==null&&typeof value==='object'&&!Array.isArray(value),
  positive:value=>typeof value==='number'&&Number.isFinite(value)&&value>0,
  sameSavedValue:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
  exactKey:row=>[Number(row.t),row.grade,...[Number(row.w),Number(row.l)].sort((a,b)=>a-b),row.unit].join('|')
});
const summaryWindow={};
vm.runInNewContext(fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8'),{window:summaryWindow,document:{getElementById:()=>null,createElement:()=>({}),head:{append(){}}}});
const summary=summaryWindow.AAFStockSummary;
const keyA='1.6|A|1220|2440|sheet',keyAAA='2.5|AAA|1220|2440|sheet',keyB='3|B|1220|2440|sheet';
function fixture(){
  const row=(key,t,grade,qty,freeQty)=>({key,w:1220,l:2440,t,grade,unit:'sheet',qty,committedQty:qty-freeQty,freeQty,note:'synthetic protected',followup:'synthetic protected'});
  const stock={ok:true,revision:7,report:{reportDate:'2030-11-04'},rows:[row('zero',1.6,'A',0,0),row('priced',2.5,'AAA',10,4),row('missing',3,'B',6,3)]};
  const catalog={ok:true,revision:7,catalogRevision:3,stockReportDate:stock.report.reportDate,permissions:{pricesAndNotes:true},widgetState:{privateContent:{version:3,context:'aaf-sales-stock-preview|free-price-catalog',prices:{[keyAAA]:7},currencies:{[keyAAA]:'THB'},notesByThickness:{},notesBySpec:{[keyA]:'synthetic keep'},fx:30,savedAt:'2030-11-04T00:00:00Z'}}};
  return {stock,catalog};
}
function serviceHarness(data=fixture()){
  const requests=[];
  const service=editor.createService({identity:()=> 'synthetic-session',request:async(suffix,body)=>{
    requests.push({suffix,body:body?clone(body):null});
    if(!body)return clone(suffix?data.catalog:data.stock);
    assert.equal(body.action,'saveSalesReport');assert.equal(body.expectedRevision,data.stock.revision);assert.equal(body.expectedCatalogRevision,data.catalog.catalogRevision);
    data.stock.revision++;data.catalog.revision++;data.catalog.catalogRevision++;
    Object.assign(data.catalog.widgetState.privateContent,{prices:clone(body.prices),currencies:clone(body.currencies),notesByThickness:clone(body.notesByThickness),notesBySpec:clone(body.notesBySpec),savedAt:'2030-11-04T01:00:00Z'});
    return clone(data.catalog);
  }});
  return {data,requests,service};
}
function panelHost(){
  const nodes=new Map(),listeners={};
  const node=()=>({innerHTML:'',textContent:'',disabled:false,hidden:false,classList:{toggle(){}},addEventListener(){}});
  for(const key of ['data-stock-price-panel','data-spp-content','data-spp-status','data-spp-review','data-spp-coverage','data-spp-stage','data-spp-load','data-spp-discard'])nodes.set(key,node());
  const host={innerHTML:'',ownerDocument:{defaultView:{addEventListener(){},removeEventListener(){}}},
    querySelector:selector=>nodes.get(selector.slice(1,-1))||null,querySelectorAll:()=>[],contains:()=>true,
    addEventListener:(type,fn)=>{listeners[type]=fn;}};
  return {host,nodes,async click(attribute){const button={disabled:false,closest(){return this;},matches:selector=>selector==='['+attribute+']'};await listeners.click({target:button});},
    changeFilter(value){listeners.change({target:{value,matches:selector=>selector==='[data-spp-mode]'}});},
    changePrice(key,value,currency){const tr={dataset:{pricePanelKey:key},querySelector:()=>({value:currency})};listeners.input({target:{value,validity:{badInput:false},matches:selector=>selector==='[data-spp-price]',closest:()=>tr,setAttribute(){}}});},
    html:()=>nodes.get('data-spp-content').innerHTML};
}

test('normal price editor opens all exact specs including zero stock and saved prices',async()=>{
  const h=serviceHarness(),ui=panelHost(),api=panel.mount(ui.host,{service:h.service});await api.load();
  assert.match(ui.html(),/<option value="all" selected>/);
  for(const key of [keyA,keyAAA,keyB])assert.ok(ui.html().includes('data-price-panel-key="'+key+'"'),key);
  assert.equal(h.requests.filter(r=>r.body).length,0);
});

test('explicit missing-only filter remains opt-in and survives a fresh read',async()=>{
  const h=serviceHarness(),ui=panelHost(),api=panel.mount(ui.host,{service:h.service});await api.load();ui.changeFilter('missing');await api.load();
  assert.match(ui.html(),/<option value="missing" selected>/);assert.ok(ui.html().includes(keyB));
  assert.ok(!ui.html().includes('data-price-panel-key="'+keyA+'"'));assert.ok(!ui.html().includes('data-price-panel-key="'+keyAAA+'"'));
});

test('saving zero-stock price stays visible, fresh reload persists, newer stock report retains the catalog',async()=>{
  const h=serviceHarness(),before=clone(h.data),ui=panelHost(),api=panel.mount(ui.host,{service:h.service});await api.load();
  ui.changePrice(keyA,'72','USD');await ui.click('data-spp-stage');await ui.click('data-spp-confirm');
  assert.equal(h.requests.filter(r=>r.body).length,1);assert.equal(api.hasDraft(),false);
  assert.match(ui.html(),/<option value="all" selected>/);assert.ok(ui.html().includes('data-price-panel-key="'+keyA+'"'));assert.match(ui.html(),/value="72"/);
  const saved=clone(h.data.catalog.widgetState);assert.deepEqual(h.data.stock.rows,before.stock.rows);
  assert.deepEqual(saved.privateContent.notesBySpec,before.catalog.widgetState.privateContent.notesBySpec);assert.equal(saved.privateContent.prices[keyAAA],7);
  const reopened=serviceHarness(h.data);await reopened.service.load();assert.equal(reopened.service.getState().rows.find(r=>r.key===keyA).price,72);
  // Simulate only a server-verified newer stock snapshot: no catalog import or price replay.
  h.data.stock.report.reportDate='2030-11-05';h.data.stock.revision++;h.data.catalog.revision++;h.data.catalog.stockReportDate='2030-11-05';h.data.stock.rows[0].qty=2;h.data.stock.rows[0].freeQty=2;
  await reopened.service.load();assert.equal(reopened.service.getState().rows.find(r=>r.key===keyA).price,72);
  assert.deepEqual(h.data.catalog.widgetState,saved);assert.equal(reopened.requests.filter(r=>r.body).length,0);
});

test('unknown saved currency stays unknown in valuation adapter and preserves the repairable number',()=>{
  const f=fixture();f.catalog.widgetState.privateContent.prices[keyB]=8;
  const before=clone(f),stock={revision:f.stock.revision,reportDate:f.stock.report.reportDate,rows:f.stock.rows};
  const result=savedCatalogRows(stock,f.catalog),missing=result.rows.find(r=>r.key==='missing');
  assert.equal(missing.price,8);assert.equal(missing.currency,null);assert.match(missing.priceStatus,/สกุลเงิน/);assert.deepEqual(f,before);
  const edit=editor.parseSnapshot(f.stock,f.catalog).view.rows.find(r=>r.key===keyB);
  assert.equal(missing.price,edit.price);assert.equal(missing.currency,edit.currency);
});

test('Physical and Free share known saved values and explicit missing-currency counts',()=>{
  const f=fixture();f.catalog.widgetState.privateContent.prices[keyB]=8;
  const fx={rate:30,date:'2030-11-04',status:'current',basis:'BOT_USD_THB_BUYING_TRANSFER'};
  const stock={revision:f.stock.revision,reportDate:f.stock.report.reportDate,rows:f.stock.rows,headerExchangeRate:fx};
  const saved=savedCatalogRows(stock,f.catalog),decorated=summary.withSavedCatalog(stock,saved,fx),warehouse=header.warehouseProjection(decorated);
  assert.equal(warehouse.physical.knownValueTHB,70);assert.equal(warehouse.free.knownValueTHB,28);
  assert.equal(warehouse.physical.missingCurrencySpecCount,1);assert.equal(warehouse.free.missingCurrencySpecCount,1);
  assert.equal(warehouse.physical.missingPriceSpecCount,0);assert.equal(warehouse.free.missingPriceSpecCount,0);
  assert.equal(decorated.rows.find(r=>r.key==='missing').catalogValue,null);assert.equal(decorated.rows.find(r=>r.key==='missing').catalogFreeValue,null);
});

test('reversed aliases with incomplete currency are conflicts and near-size prices remain separate',()=>{
  const f=fixture(),p=f.catalog.widgetState.privateContent;
  p.prices['2.5|AAA|2440|1220|sheet']=7;delete p.currencies[keyAAA];p.currencies['2.5|AAA|2440|1220|sheet']='THB';
  p.prices['1.6|A|1200|2400|sheet']=9;p.currencies['1.6|A|1200|2400|sheet']='THB';
  const saved=savedCatalogRows({revision:7,reportDate:f.stock.report.reportDate,rows:f.stock.rows},f.catalog);
  assert.equal(saved.rows[0].price,null);assert.equal(saved.rows[1].price,null);assert.equal(saved.rows[1].currency,null);assert.match(saved.rows[1].priceStatus,/ขัดกัน/);
});

test('reading older-format numeric catalogs cannot silently assign a currency',()=>{
  for(const version of [1,2]){
    const f=fixture(),p=f.catalog.widgetState.privateContent;p.version=version;p.context='2030-11-04|30|per-sheet';delete p.currencies;
    const saved=savedCatalogRows({revision:7,reportDate:f.stock.report.reportDate,rows:f.stock.rows},f.catalog);
    assert.equal(saved.rows[1].price,7);assert.equal(saved.rows[1].currency,null);
  }
});
