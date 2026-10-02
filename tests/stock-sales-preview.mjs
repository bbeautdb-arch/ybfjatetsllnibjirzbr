import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const api=require('../stock_sales_preview.js');
const js=fs.readFileSync(new URL('../stock_sales_preview.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../stock_sales_preview.css',import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}

function harness(){
  const listeners={},globalListeners={},openaiWrites=[];
  const host={
    openai:{widgetState:{privateContent:{version:3,context:'must-not-load'}},setWidgetState:async value=>{openaiWrites.push(value);throw new Error('explicit store touched window.openai');}},
    addEventListener:(name,fn)=>{globalListeners[name]=fn;},removeEventListener:()=>{},navigator:{},
  };
  function field(tag,attributeText){
    const attributes=Object.fromEntries([...attributeText.matchAll(/([\w-]+)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
    for(const match of attributeText.matchAll(/\b(data-[\w-]+)(?=\s|=|$)/g)) if(!Object.hasOwn(attributes,match[1])) attributes[match[1]]='';
    const dataset=Object.fromEntries(Object.entries(attributes).filter(([name])=>name.startsWith('data-')).map(([name,value])=>[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value]));
    return {tagName:tag.toUpperCase(),value:'',textContent:'',dataset,disabled:false,hidden:false,validity:{badInput:false},attributes,
      matches(selector){return selector.split(',').some(part=>{const match=/^\[([^\]]+)\]$/.exec(part.trim());return Boolean(match&&Object.hasOwn(attributes,match[1]));});},
      setAttribute(name,value){attributes[name]=String(value);},getAttribute:name=>attributes[name]??null,
      closest(selector){return this.matches(selector)?this:null;},focus(){},select(){},
    };
  }
  const freeEvents={},freeSummary={focus(){}},globalFree={id:'sp-money-all-g-all',hidden:true,open:false,
    addEventListener:(name,fn)=>{freeEvents[name]=fn;},removeEventListener:name=>{delete freeEvents[name];},
    querySelector:selector=>selector==='summary'?freeSummary:null,scrollIntoView(){},
  };
  function element(tag){return {tagName:tag.toUpperCase(),id:'',className:'',markup:'',fields:[],children:[],hidden:false,open:false,dataset:{},
    get innerHTML(){return this.markup;},
    set innerHTML(value){this.markup=value;this.fields=[...value.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].filter(match=>/\bdata-[\w-]+(?:=|\b)/.test(match[2])).map(match=>field(match[1],match[2]));},
    setAttribute(){},addEventListener(){},removeEventListener(){},append(node){this.children.push(node);},
    querySelector(selector){return this.id==='sp-money-all'&&selector==='.sp-global-free'?globalFree:null;},
    querySelectorAll(){return[];},scrollIntoView(){},style:{setProperty(){}},
  };}
  const doc={defaultView:host,activeElement:null,createElement:element,execCommand:()=>false};
  const root={id:'',ownerDocument:doc,children:[],attributes:{},
    setAttribute(name,value){this.attributes[name]=String(value);},removeAttribute(name){delete this.attributes[name];},
    replaceChildren(){this.children=[];},append(node){this.children.push(node);},
    querySelectorAll(selector){return this.children.flatMap(node=>node.fields).filter(node=>node.matches(selector));},
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
    addEventListener(name,fn){listeners[name]=fn;},removeEventListener(name){delete listeners[name];},
  };
  const find=(selector,predicate=()=>true)=>root.querySelectorAll(selector).find(predicate);
  return{root,host,listeners,globalListeners,openaiWrites,find};
}

function sale(overrides={}){return{id:'sale-1',orderId:'order-1',ref:'REF-1',customer:'PRIVATE-CANARY',w:2440,l:1220,t:2.5,grade:'AAA',unit:'sheet',qty:20,amount:2000,currency:'THB',term:'TT',sourceStatus:'Forecast',productStatus:'พร้อมโหลด',payment:'รอเก็บ TT / LC',notes:null,...overrides};}

// Build immutable readiness evidence from an explicit expected ledger order.
// The order is supplied by each fixture so this reference does not silently
// inherit the implementation's sort and can catch a priority regression.
function readinessForOrder(model,allocationIds){
  const exactKey=api.model.exactSpecKey,byId=new Map(model.allocationRows.map(row=>[row.id,row]));
  const expected=model.allocationRows.filter(row=>row.status!=='loaded').map(row=>row.id).sort();
  assert.deepEqual([...new Set(allocationIds)].sort(),expected,'fixture ledger must name every unloaded allocation exactly once');
  const remaining=new Map(model.all.stock.rows.map(row=>[exactKey(row),row.physical]));
  const byAllocationId={},sourceParts=new Map(model.salesRows.map(row=>[row.id,[]]));
  const add=(target,unit,value)=>{target[unit]=(target[unit]||0)+value;};
  const summarize=(parts,loaded=false)=>{
    const requestedByUnit={},allocatedByUnit={},shortageByUnit={};
    parts.forEach(part=>{add(requestedByUnit,part.unit,part.requested);add(allocatedByUnit,part.unit,part.allocated);add(shortageByUnit,part.unit,part.shortage);});
    const hasShortage=Object.values(shortageByUnit).some(value=>value>1e-7),hasAllocation=Object.values(allocatedByUnit).some(value=>value>1e-7);
    return {parts,requestedByUnit,allocatedByUnit,shortageByUnit,state:loaded?'loaded':!hasShortage?'ready':hasAllocation?'partial':'production'};
  };
  allocationIds.forEach(id=>{
    const row=byId.get(id);assert(row&&row.status!=='loaded',`invalid unloaded allocation ${id}`);
    const source=model.salesRows.find(candidate=>candidate.sourceIndex===row.sourceIndex);assert(source);
    const key=exactKey(row),available=remaining.get(key)??0,allocated=Math.min(row.qty,available),shortage=row.qty-allocated,next=available-allocated;
    const part={sourceRowId:source.id,allocationId:row.id,key,grade:row.grade,w:row.w,l:row.l,t:row.t,unit:row.unit,requested:row.qty,availableBefore:available,allocated,shortage,remaining:next};
    remaining.set(key,next);sourceParts.get(source.id).push(part);byAllocationId[row.id]={sourceRowId:source.id,...summarize([part])};
  });
  model.allocationRows.filter(row=>row.status==='loaded').forEach(row=>{
    const source=model.salesRows.find(candidate=>candidate.sourceIndex===row.sourceIndex),key=exactKey(row);
    const part={sourceRowId:source.id,allocationId:row.id,key,grade:row.grade,w:row.w,l:row.l,t:row.t,unit:row.unit,requested:row.qty,availableBefore:null,allocated:0,shortage:0,remaining:null};
    sourceParts.get(source.id).push(part);byAllocationId[row.id]={sourceRowId:source.id,...summarize([part],true)};
  });
  const byRowId=Object.fromEntries(model.salesRows.map(row=>[row.id,summarize(sourceParts.get(row.id),row.status==='loaded')]));
  return {byRowId,byAllocationId};
}

// Public files contain reusable formulas/view styles only, never a private snapshot.
for(const token of ['QT26090016','QT26090017','QT26090018','AC2N','DCB INTERNATIONAL','const salesRows=[','const stockRows=[']) assert(!js.includes(token),`public JS leaked ${token}`);
assert(!css.includes('PRIVATE-CANARY'));
assert(css.includes('#sales-stock-preview-16 .sp-window'),'CSS remains scoped to the native preview root');
assert.deepEqual(api.model.constants.DEFAULT_PAID_OVERRIDE_REFS,[],'public model has no customer-specific default overrides');
assert.equal(typeof globalThis.AafAllModel?.buildModel,'function');
assert.equal(typeof globalThis.mountAllThickness,'function');

// Formula parity: reversible dimensions are exact, mix is 85/15, and source inputs are immutable.
const sales=[sale(),sale({id:'sale-2',orderId:'order-2',ref:'REF-2',customer:'MIX-CANARY',w:1220,l:2440,grade:'mix',qty:100,amount:10000})];
const stock=[{sku:'AAA',w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',physical:200},{sku:'B',w:1220,l:2440,t:2.5,grade:'B',unit:'sheet',physical:100}];
const sourceBefore=JSON.stringify({sales,stock});
const model=api.buildModel(sales,stock,{strict:true,paidOverrideRefs:[]});
assert.equal(JSON.stringify({sales,stock}),sourceBefore,'model never mutates authenticated source rows');
assert.deepEqual(model.thicknesses,[2.5]);
assert.equal(model.byThickness['2.5'].all.totals.equivalent4x8At2_5.sheet,120);
assert.equal(model.all.stock.byKey['2.5|AAA|1220|2440|sheet'].reserved,105,'rotated exact size and AAA mix share allocate once');
assert.equal(model.all.stock.byKey['2.5|B|1220|2440|sheet'].reserved,15,'mix B allocation stays 15%');
assert.equal(model.all.stock.unitTotals.sheet.free,180);

const visibleKey='2.5|AAA|1220|2440|sheet';
const saved={modelContent:{scope:'AAF preview price catalog',fxThbPerUsd:33.3901,freePriceUnit:'THB or USD per actual sheet or strip piece',freeValueCurrency:'THB'},privateContent:{version:3,context:'aaf-sales-stock-preview|free-price-catalog',fx:33.3901,prices:{[visibleKey]:1.95},currencies:{[visibleKey]:'USD'},notesByThickness:{'2.5':'saved note'},savedAt:'2026-10-01T14:44:41.000Z'}};
for(let index=0;index<95;index++){const key=`${10+index}|F|1220|2440|sheet`;saved.privateContent.prices[key]=index+0.125;saved.privateContent.currencies[key]=index%2?'USD':'THB';}
assert.equal(Object.keys(saved.privateContent.prices).length,96);

// Explicit store owns persistence. Export uses only the last acknowledged catalog, never drafts or private model rows.
{
  const h=harness(),writes=[],exports=[],reports=[];
  let loads=0;
  const store={widgetState:saved,load(){loads++;return this.widgetState;},async setWidgetState(value){writes.push(clone(value));this.widgetState=clone(value);}};
  const before=JSON.stringify(model);
  const app=api.mount(h.root,model,{fxReference:{rate:33.3901},metadata:{monthLabel:'synthetic'},onExport:value=>exports.push(value),onReportSummary:(summary,meta)=>reports.push({summary,meta})},store);
  await app.ready;
  assert.equal(loads,1);assert.equal(writes.length,0,'mount never persists');assert.equal(h.openaiWrites.length,0,'explicit store never touches window.openai');
  assert.equal(reports.length,1);assert.equal(reports[0].meta.reason,'ready','initial committed summary emits once after ready');
  assert.equal(reports[0].summary.catalog.savedAt,saved.privateContent.savedAt);assert.equal(reports[0].summary.catalog.fxThbPerUsd,33.3901);
  assert.equal(h.root.id,'sales-stock-preview-16');
  const initial=app.exportSaved();
  assert.equal(Object.keys(initial.privateContent.prices).length,96);
  assert.equal(initial.privateContent.prices[visibleKey],1.95);
  const price=h.find('[data-free-price]',node=>node.dataset.freePrice===visibleKey);
  const note=h.find('[data-thickness-note]',node=>node.dataset.thicknessNote==='2.5');
  assert(price&&note,'synthetic Free inputs are mounted');
  const committedSummary=clone(app.getReportSummary());
  price.value='2.5';h.listeners.input({target:price});note.value='draft note';h.listeners.input({target:note});
  assert.deepEqual(app.getReportSummary(),committedSummary,'report summary never reads unsaved price/note drafts');assert.equal(reports.length,1,'draft edits emit no report update');
  const draftExport=app.exportSaved();
  assert.equal(draftExport.privateContent.prices[visibleKey],1.95,'export excludes an unsaved price draft');
  assert.equal(draftExport.privateContent.notesByThickness['2.5'],'saved note','export excludes an unsaved note draft');
  await app.savePrices();
  assert.equal(writes.length,1);assert.equal(Object.keys(writes[0].privateContent.prices).length,96,'save preserves absent catalog specs');
  assert.equal(reports.length,2);assert.equal(reports[1].meta.reason,'saved','acknowledged save emits the new committed summary');
  assert.equal(reports[1].summary.physical.knownValueTHB,200*2.5*33.3901,'saved summary uses the committed price, not the prior or draft catalog');
  assert.equal(writes[0].privateContent.prices[visibleKey],2.5);assert.equal(writes[0].privateContent.notesByThickness['2.5'],'draft note');
  assert(!JSON.stringify(writes[0]).includes('PRIVATE-CANARY'),'persistence payload never contains model/customer rows');
  const committed=app.exportSaved();
  assert.equal(committed.privateContent.version,3);assert.equal(committed.privateContent.context,'aaf-sales-stock-preview|free-price-catalog');
  assert.equal(committed.privateContent.prices[visibleKey],2.5);assert.equal(exports.length,3);
  committed.privateContent.prices[visibleKey]=999;
  assert.equal(app.exportSaved().privateContent.prices[visibleKey],2.5,'export result is detached from committed state');
  assert.equal(JSON.stringify(model),before,'mount/edit/save/export do not mutate the precomputed model');
  app.destroy();
}

// Public draft-price API and the lower editor share one exact/reversed catalog
// owner. Invalid raw input remains visible and blocks the one explicit save.
{
  const h=harness(),writes=[],changes=[],state=clone(saved),reverseKey='2.5|AAA|2440|1220|sheet';
  const store={widgetState:state,load(){return this.widgetState;},async setWidgetState(value){writes.push(clone(value));this.widgetState=clone(value);}};
  const app=api.mount(h.root,model,{onPriceDraftChange:change=>changes.push(clone(change))},store);await app.ready;
  assert.equal(changes.at(-1).reason,'load');assert.deepEqual(app.getDraftPrice(visibleKey),{value:1.95,currency:'USD'});assert.deepEqual(app.getDraftPrice(reverseKey),{value:1.95,currency:'USD'});
  const beforeUnknown=changes.length,beforeCatalog=clone(app.getPriceState());
  assert.equal(app.setDraftPrice('2.5|AAA|1221|2440|sheet',4,'THB'),false,'near size is not an editable stock pool');
  assert.equal(app.setDraftPrice('2.5|F|1220|2440|sheet',4,'THB'),false,'cross-grade key is not accepted');
  assert.equal(app.setDraftPrice('2.6|AAA|1220|2440|sheet',4,'THB'),false,'cross-thickness key is not accepted');
  assert.equal(app.setDraftPrice('2.5|AAA|1220|2440|strip',4,'THB'),false,'sheet and strip identities stay separate');
  assert.equal(app.getDraftPrice('2.5|AAA|1221|2440|sheet'),null);assert.equal(changes.length,beforeUnknown);assert.deepEqual(app.getPriceState().prices,beforeCatalog.prices);
  assert.equal(app.setDraftPrice(reverseKey,'2.75','THB'),true);assert.deepEqual(app.getDraftPrice(visibleKey),{value:2.75,currency:'THB'});
  assert.equal(app.getPriceState().prices[visibleKey],2.75);assert.equal(Object.hasOwn(app.getPriceState().prices,reverseKey),false,'reverse API call does not create a duplicate catalog key');assert.equal(writes.length,0,'draft API never writes');
  const lower=h.find('[data-free-price]',node=>node.dataset.freePrice===visibleKey),lowerCurrency=h.find('[data-free-currency]',node=>node.dataset.freeCurrency===visibleKey);
  assert.equal(lower.value,2.75,'upper/API edit immediately synchronizes the existing lower editor');
  lower.value='3.1';h.listeners.input({target:lower});assert.deepEqual(app.getDraftPrice(reverseKey),{value:3.1,currency:'THB'},'lower editor immediately synchronizes the public getter');
  lowerCurrency.value='USD';h.listeners.change({target:lowerCurrency});assert.equal(app.getDraftPrice(visibleKey).currency,'USD');assert.equal(changes.at(-1).reason,'draft');
  assert.equal(app.setDraftPrice(visibleKey,0,'USD'),false);assert.deepEqual(app.getDraftPrice(reverseKey),{value:0,currency:'USD'},'invalid raw upper value is retained instead of restoring the prior price');
  assert.deepEqual(app.getPriceState().invalidKeys,[visibleKey]);assert.equal(app.getPriceState().dirty,true);assert.match(app.getPriceState().error,/ตรวจราคา/);
  lowerCurrency.value='THB';h.listeners.change({target:lowerCurrency});assert.equal(lower.value,0);assert.equal(lower.getAttribute('aria-invalid'),'true','invalid raw value survives duplicate/rerender synchronization');assert.match(app.getPriceState().error,/ตรวจราคา/);
  assert.equal(await app.savePrices(),false,'invalid upper draft blocks the unified lower save');assert.equal(writes.length,0);
  assert.equal(app.setDraftPrice(visibleKey,true,'THB'),false,'non string/number price is rejected');assert.equal(await app.savePrices(),false);
  assert.equal(app.setDraftPrice(reverseKey,'3.25','USD'),true);assert.deepEqual(app.getPriceState().invalidKeys,[]);assert.equal(lower.getAttribute('aria-invalid'),'false');
  assert.equal(app.setDraftPrice(visibleKey,'','THB'),true);assert.deepEqual(app.getDraftPrice(reverseKey),{value:'',currency:'THB'},'blank clears price while retaining explicit currency ownership');
  assert.equal(app.setDraftPrice(reverseKey,3.5,'USD'),true);assert.equal(await app.savePrices(),true);assert.equal(writes.length,1);
  assert.equal(writes[0].privateContent.prices[visibleKey],3.5);assert.equal(writes[0].privateContent.currencies[visibleKey],'USD');assert.equal(writes[0].privateContent.notesByThickness['2.5'],'saved note','price-only save preserves all note drafts/catalog scope');
  assert(changes.some(change=>change.reason==='save-start'));assert.equal(changes.at(-1).reason,'saved');
  app.destroy();
}

// A legacy catalog owned by the reversed orientation remains the sole owner.
// Free-0 stock/demand pools stay out of the lower Free table, while the upper
// report API can still edit and save the same exact shared catalog owner.
{
  const reverseKey='2.5|AAA|2440|1220|sheet',reverseState=clone(saved);
  reverseState.privateContent.prices[reverseKey]=reverseState.privateContent.prices[visibleKey];delete reverseState.privateContent.prices[visibleKey];
  reverseState.privateContent.currencies[reverseKey]=reverseState.privateContent.currencies[visibleKey];delete reverseState.privateContent.currencies[visibleKey];
  const h=harness(),writes=[],store={widgetState:reverseState,load(){return this.widgetState;},async setWidgetState(value){writes.push(clone(value));}};
  const app=api.mount(h.root,model,{},store);await app.ready;
  assert.deepEqual(app.getDraftPrice(visibleKey),{value:1.95,currency:'USD'});assert.equal(app.setDraftPrice(visibleKey,2.2,'THB'),true);
  assert.equal(app.getPriceState().prices[reverseKey],2.2);assert.equal(Object.hasOwn(app.getPriceState().prices,visibleKey),false);assert.equal(await app.savePrices(),true);assert.equal(Object.hasOwn(writes[0].privateContent.prices,visibleKey),false);
  app.destroy();

  const fullSales=[sale({id:'full',orderId:'full',qty:100})],fullStock=[{sku:'FULL',w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',physical:100}],fullModel=api.buildModel(fullSales,fullStock,{strict:true,paidOverrideRefs:[]});
  const fullHarness=harness(),fullWrites=[],fullStore={widgetState:clone(saved),load(){return this.widgetState;},async setWidgetState(value){fullWrites.push(clone(value));this.widgetState=clone(value);}};
  const fullApp=api.mount(fullHarness.root,fullModel,{},fullStore);await fullApp.ready;
  const fullInput=fullHarness.find('[data-free-price]',node=>node.dataset.freePrice===visibleKey);
  assert.equal(fullModel.all.stock.rows[0].free,0);assert.equal(fullInput,undefined,'fully allocated Free-0 pool does not appear in the lower Free table');
  assert.equal(fullApp.setDraftPrice(visibleKey,7,'THB'),true);assert.deepEqual(fullApp.getDraftPrice(visibleKey),{value:7,currency:'THB'});assert.equal(await fullApp.savePrices(),true);assert.equal(fullWrites[0].privateContent.prices[visibleKey],7,'upper editor saves into the shared exact catalog without a lower row');
  assert.equal(fullApp.getReportSummary().free.valueTHB,0);fullApp.destroy();

  const shortageKey='1.6|F|915|1830|sheet',shortageModel=api.buildModel([sale({id:'shortage',orderId:'shortage',w:915,l:1830,t:1.6,grade:'F',qty:12})],[],{strict:true,paidOverrideRefs:[]});
  const shortageHarness=harness(),shortageWrites=[],shortageStore={widgetState:clone(saved),load(){return this.widgetState;},async setWidgetState(value){shortageWrites.push(clone(value));this.widgetState=clone(value);}};
  const shortageApp=api.mount(shortageHarness.root,shortageModel,{},shortageStore);await shortageApp.ready;
  const shortageRow=shortageModel.all.stock.rows.find(row=>row.grade==='F'),shortageInput=shortageHarness.find('[data-free-price]',node=>node.dataset.freePrice===shortageKey);
  assert.equal(shortageRow.physical,0);assert.equal(shortageRow.free,0);assert.equal(shortageRow.shortage,12);assert.equal(shortageInput,undefined,'shortage-only Free-0 pool stays out of the lower Free table');
  assert.equal(shortageApp.setDraftPrice(shortageKey,9,'THB'),true);assert.equal(await shortageApp.savePrices(),true);assert.equal(shortageWrites[0].privateContent.prices[shortageKey],9);
  assert.equal(shortageApp.getReportSummary().free.byUnit.sheet,0);assert.equal(shortageApp.getReportSummary().free.valueTHB,0,'pricing a shortage-only Free-0 pool never inflates Free money');shortageApp.destroy();
}

// Failed persistence returns false without discarding the shared draft; a retry
// acknowledges the same draft, while a destroyed view cannot write.
{
  const h=harness(),writes=[],changes=[];let fail=true;
  const store={widgetState:clone(saved),load(){return this.widgetState;},async setWidgetState(value){writes.push(clone(value));if(fail)throw new Error('offline');this.widgetState=clone(value);}};
  const app=api.mount(h.root,model,{onPriceDraftChange:change=>changes.push(clone(change))},store);await app.ready;
  assert.equal(app.setDraftPrice(visibleKey,4.25,'THB'),true);assert.equal(await app.savePrices(),false);assert.equal(app.getDraftPrice(visibleKey).value,4.25);assert.equal(app.getPriceState().dirty,true);assert.match(app.getPriceState().error,/เซฟไม่สำเร็จ/);assert.equal(changes.at(-1).reason,'save-failed');
  fail=false;assert.equal(await app.savePrices(),true);assert.equal(writes.length,2);assert.equal(app.getPriceState().dirty,false);assert.equal(changes.at(-1).reason,'saved');
  app.destroy();const before=writes.length,beforeChanges=changes.length;assert.equal(app.setDraftPrice(visibleKey,5,'THB'),false);assert.equal(await app.savePrices(),false);assert.equal(writes.length,before);assert.equal(changes.length,beforeChanges);
}

// Report KPI summary uses the same normalized model once, keeps units separate, and values inventory only from the committed exact catalog.
{
  const summarySales=[
    sale({id:'loaded-sheet',orderId:'loaded-order',ref:'LOADED',customer:'SYNTHETIC-LOADED',qty:10,amount:100,currency:'USD',sourceStatus:'ออก INV',productStatus:'โหลดแล้ว',payment:'เก็บเงินแล้ว'}),
    sale({id:'paid-sheet',orderId:'paid-sheet-order',ref:'PAID-SHEET',customer:'SYNTHETIC-PAID-SHEET',qty:20,amount:200,currency:'USD',sourceStatus:'มีเรือ',productStatus:'พร้อมโหลด',payment:'เก็บเงินแล้ว'}),
    sale({id:'paid-strip',orderId:'paid-strip-order',ref:'PAID-STRIP',customer:'SYNTHETIC-PAID-STRIP',w:100,l:2000,t:3,grade:'B',unit:'strip',qty:5,amount:null,currency:'THB',sourceStatus:'มีเรือ',productStatus:'พร้อมโหลด',payment:'เก็บเงินแล้ว'}),
    sale({id:'forecast-sheet',orderId:'forecast-order',ref:'FORECAST',customer:'SYNTHETIC-FORECAST',qty:7,amount:70,currency:'THB',sourceStatus:'Forecast',productStatus:'พร้อมโหลด',payment:'รอเก็บ TT / LC'}),
  ];
  const summaryStock=[
    {sku:'SUMMARY-AAA',w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',physical:100},
    {sku:'SUMMARY-STRIP',w:100,l:2000,t:3,grade:'B',unit:'strip',physical:50},
    {sku:'SUMMARY-UNPRICED',w:915,l:1830,t:1.6,grade:'F',unit:'sheet',physical:10},
  ];
  const summaryModel=api.buildModel(summarySales,summaryStock,{strict:true,paidOverrideRefs:[]});
  const summaryState=clone(saved);summaryState.privateContent.fx=34;summaryState.privateContent.savedAt='2026-10-02T01:02:03.000Z';
  summaryState.privateContent.prices={'2.5|AAA|2440|1220|sheet':2,'3|B|2000|100|strip':10};
  summaryState.privateContent.currencies={'2.5|AAA|2440|1220|sheet':'USD','3|B|2000|100|strip':'THB'};
  const h=harness(),writes=[],reports=[],savedReports=[];
  const store={widgetState:summaryState,load(){return this.widgetState;},async setWidgetState(value){writes.push(clone(value));this.widgetState=clone(value);}};
  const app=api.mount(h.root,summaryModel,{onReportSummary:(summary,meta)=>reports.push({summary,meta}),onSavedReportSummary:(summary,meta)=>savedReports.push({summary,meta})},store);
  await app.ready;
  const report=app.getReportSummary(),near=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-9,message);
  assert.deepEqual(report.catalog,{hasSavedCatalog:true,fxThbPerUsd:34,savedAt:'2026-10-02T01:02:03.000Z'});
  assert.deepEqual(report.physical.byUnit,{sheet:110,strip:50});assert.deepEqual(report.reserved.byUnit,{sheet:27,strip:5});assert.deepEqual(report.free.byUnit,{sheet:83,strip:45});
  const stripArea=100*2000/(1220*2440);
  near(report.physical.eq4x8,100+10*.5625+50*stripArea,'Physical area equivalent');
  near(report.physical.eq2_5,100+10*.5625*1.6/2.5+50*stripArea*3/2.5,'Physical volume equivalent');
  near(report.reserved.eq4x8,27+5*stripArea,'Reserved area equivalent');near(report.free.eq2_5,73+10*.5625*1.6/2.5+45*stripArea*3/2.5,'Free volume equivalent');
  assert.equal(report.physical.valueTHB,null);assert.equal(report.physical.knownValueTHB,7300);assert.deepEqual(report.physical.coverage.unpricedByUnit,{sheet:10,strip:0});
  assert.deepEqual(report.physical.coverage,{complete:false,pricedSpecCount:2,valuedSpecCount:2,totalSpecCount:3,missingFxSpecCount:0,unpricedByUnit:{sheet:10,strip:0},missingFxByUnit:{sheet:0,strip:0}});
  assert.equal(report.reserved.valueTHB,1886);assert.equal(report.reserved.knownValueTHB,1886);assert.equal(report.reserved.coverage.complete,true);
  assert.equal(report.free.valueTHB,null);assert.equal(report.free.knownValueTHB,5414);assert.deepEqual(report.free.coverage.unpricedByUnit,{sheet:10,strip:0});
  assert.deepEqual(report.sold.byUnit,{sheet:30,strip:5});assert.deepEqual(report.sold.loaded.byUnit,{sheet:10,strip:0});assert.deepEqual(report.sold.paidUnloaded.byUnit,{sheet:20,strip:5});
  assert.equal(report.sold.knownValueTHB,10200);assert.equal(report.sold.valueTHB,null);assert.deepEqual(report.sold.byCurrency,{USD:300});
  assert.deepEqual(report.sold.coverage,{complete:false,knownRowCount:2,unknownRowCount:1,missingFxRowCount:0,totalRowCount:3,orderCount:3});
  assert.equal(report.sold.loaded.valueTHB,3400);assert.equal(report.sold.loaded.coverage.complete,true);assert.equal(report.sold.paidUnloaded.knownValueTHB,6800);assert.equal(report.sold.paidUnloaded.coverage.unknownRowCount,1);
  assert.equal(reports.length,1);assert.equal(reports[0].meta.reason,'ready');assert.equal(savedReports.length,0);assert(!JSON.stringify(report).includes('SYNTHETIC-'),'summary exposes aggregates, never private rows');
  const fx=h.find('[data-fx]');fx.value='35';h.listeners.input({target:fx});await tick();await tick();
  assert.equal(writes.length,1);assert.equal(reports.length,2);assert.equal(reports[1].meta.reason,'saved');assert.equal(savedReports.length,1);assert.equal(savedReports[0].meta.reason,'saved');
  assert.equal(reports[1].summary.catalog.fxThbPerUsd,35);assert.equal(reports[1].summary.sold.loaded.valueTHB,3500,'FX callback follows only the acknowledged committed rate');
  app.destroy();

  const mixModel=api.buildModel([sale({id:'paid-mix',orderId:'paid-mix-order',ref:'PAID-MIX',customer:'SYNTHETIC-MIX',grade:'mix',qty:100,amount:1000,currency:'THB',sourceStatus:'มีเรือ',productStatus:'พร้อมโหลด',payment:'เก็บเงินแล้ว'})],[],{strict:true,paidOverrideRefs:[]});
  const mixHarness=harness(),mixStore={widgetState:summaryState,load(){return this.widgetState;},async setWidgetState(){}};
  const mixApp=api.mount(mixHarness.root,mixModel,{},mixStore);await mixApp.ready;
  assert.deepEqual(mixApp.getReportSummary().sold.byUnit,{sheet:100,strip:0},'mixed-grade Sold source row is counted once, not as both 85/15 allocations');
  assert.equal(mixApp.getReportSummary().sold.coverage.orderCount,1);mixApp.destroy();
}

// Physical allocation is partitioned from the original per-allocation readiness
// ledger. Paid-unloaded wins the shared pool, Mix parts are counted once, loaded
// rows are excluded, and stock value never comes from invoice money.
{
  const row=(id,overrides={})=>sale({id,orderId:id,ref:id,amountBasis:'line',amountSourceProof:'synthetic direct line',...overrides});
  const partitionSales=[
    row('forecast-wait',{qty:30,amount:30,sourceStatus:'Forecast',productStatus:'รอผลิต'}),
    row('pi-lc',{qty:30,amount:30,term:'LC',sourceStatus:'เปิด PI',productStatus:'รอผลิต'}),
    row('paid-mix',{grade:'mix',qty:100,amount:1000000,payment:'เก็บเงินแล้ว'}),
    row('forecast-ready',{qty:30,amount:30,sourceStatus:'Forecast',productStatus:'พร้อมโหลด'}),
    row('loaded',{qty:100,amount:9000000,sourceStatus:'ออก INV',productStatus:'โหลดแล้ว',payment:'เก็บเงินแล้ว'}),
    row('paid-next',{qty:20,amount:2000000,sourceStatus:'มีเรือ',productStatus:'พร้อมโหลด',payment:'เก็บเงินแล้ว'}),
    row('vessel',{qty:10,amount:10,sourceStatus:'มีเรือ',productStatus:'รอผลิต'}),
    row('negotiate',{qty:10,amount:10,sourceStatus:'เจรจา',productStatus:'รอผลิต'}),
    row('forecast-unpriced',{w:1830,l:915,t:1.6,grade:'F',qty:4,amount:4,term:'',sourceStatus:'Forecast',productStatus:'พร้อมโหลด'}),
  ];
  const partitionStock=[
    {sku:'AAA-A',w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',physical:100},
    {sku:'AAA-B',w:2440,l:1220,t:2.5,grade:'AAA',unit:'sheet',physical:40},
    {sku:'B',w:1220,l:2440,t:2.5,grade:'B',unit:'sheet',physical:15},
    {sku:'F-UNPRICED',w:915,l:1830,t:1.6,grade:'F',unit:'sheet',physical:10},
  ];
  const partitionModel=api.buildModel(partitionSales,partitionStock,{strict:true,paidOverrideRefs:[]});
  const ledgerOrder=['paid-mix::AAA','paid-mix::B','paid-next','pi-lc','vessel','negotiate','forecast-ready','forecast-unpriced','forecast-wait'];
  const readiness=readinessForOrder(partitionModel,ledgerOrder);
  assert.deepEqual(partitionModel.allocationRows.filter(row=>row.id.startsWith('paid-mix')).map(row=>row.id),['paid-mix::AAA','paid-mix::B']);
  assert.equal(readiness.byAllocationId['paid-mix::AAA'].parts[0].availableBefore,140);
  assert.equal(readiness.byAllocationId['paid-next'].parts[0].availableBefore,55);
  assert.equal(readiness.byAllocationId['pi-lc'].parts[0].availableBefore,35);
  assert.equal(readiness.byAllocationId.vessel.parts[0].availableBefore,5);
  assert.equal(readiness.byAllocationId['forecast-ready'].parts[0].availableBefore,0,'Forecast ready runs before an earlier waiting Forecast');
  const state=clone(saved);
  state.privateContent.fx=34;state.privateContent.savedAt='2026-10-02T02:03:04.000Z';
  state.privateContent.prices={'2.5|AAA|2440|1220|sheet':10,'2.5|B|1220|2440|sheet':20};
  state.privateContent.currencies={'2.5|AAA|2440|1220|sheet':'THB','2.5|B|1220|2440|sheet':'THB'};
  state.privateContent.notesByThickness={};
  const mountWith=async evidence=>{
    const h=harness(),store={widgetState:state,load(){return this.widgetState;},async setWidgetState(value){this.widgetState=clone(value);}};
    const app=api.mount(h.root,partitionModel,{readiness:evidence},store);await app.ready;return {app,h,report:app.getReportSummary()};
  };
  const mounted=await mountWith(readiness),report=mounted.report,partition=report.partition;
  assert.equal(report.version,2);assert.equal(partition.status,'verified');
  assert.deepEqual(partition.sold.inStock.byUnit,{sheet:120,strip:0},'85/15 Mix allocations and the next paid row are counted once');
  assert.deepEqual(partition.sold.demand.byUnit,{sheet:120,strip:0});assert.deepEqual(partition.sold.toProduce.byUnit,{sheet:0,strip:0});
  assert.deepEqual(partition.reserved.inStock.byUnit,{sheet:39,strip:0});assert.deepEqual(partition.reserved.toProduce.byUnit,{sheet:75,strip:0});
  assert.deepEqual(partition.reserved.demand.byUnit,{sheet:114,strip:0});
  assert.equal(partition.sold.toProduce.productionSpecs.length,0);
  assert.equal(partition.reserved.toProduce.productionSpecs.reduce((sum,row)=>sum+row.qty,0),partition.reserved.toProduce.byUnit.sheet,'all production shortages are exposed by non-private exact spec');
  assert(partition.reserved.toProduce.productionSpecs.every(row=>row.key&&Number.isFinite(row.t)&&row.grade&&Number.isFinite(row.w)&&Number.isFinite(row.l)&&row.unit==='sheet'&&row.qty>0));
  assert.deepEqual(Object.keys(partition.reserved.byStatus),['pi','vessel','negotiate','forecast']);
  assert.deepEqual(partition.reserved.byStatus.pi.inStock.byUnit,{sheet:30,strip:0});assert.deepEqual(partition.reserved.byStatus.pi.toProduce.byUnit,{sheet:0,strip:0});
  assert.deepEqual(partition.reserved.byStatus.vessel.inStock.byUnit,{sheet:5,strip:0});assert.deepEqual(partition.reserved.byStatus.vessel.toProduce.byUnit,{sheet:5,strip:0});
  assert.deepEqual(partition.reserved.byStatus.negotiate.inStock.byUnit,{sheet:0,strip:0});assert.deepEqual(partition.reserved.byStatus.negotiate.toProduce.byUnit,{sheet:10,strip:0});
  assert.deepEqual(partition.reserved.byStatus.forecast.inStock.byUnit,{sheet:4,strip:0});assert.deepEqual(partition.reserved.byStatus.forecast.toProduce.byUnit,{sheet:60,strip:0});
  assert.equal(Object.values(partition.reserved.byStatus).reduce((sum,status)=>sum+status.inStock.byUnit.sheet,0),partition.reserved.inStock.byUnit.sheet,'status-backed stock reconciles without a second allocation');
  assert.equal(Object.values(partition.reserved.byStatus).reduce((sum,status)=>sum+status.toProduce.byUnit.sheet,0),partition.reserved.toProduce.byUnit.sheet);
  assert.deepEqual(report.physical.byUnit,{sheet:165,strip:0});assert.deepEqual(report.free.byUnit,{sheet:6,strip:0});
  assert.equal(partition.sold.inStock.byUnit.sheet+partition.reserved.inStock.byUnit.sheet+report.free.byUnit.sheet,report.physical.byUnit.sheet);
  assert.equal(partition.sold.demand.byUnit.sheet+partition.reserved.demand.byUnit.sheet,report.reserved.byUnit.sheet);
  assert.equal(partition.sold.toProduce.byUnit.sheet+partition.reserved.toProduce.byUnit.sheet,report.reserved.byUnit.sheet-report.physical.byUnit.sheet+report.free.byUnit.sheet);
  assert.equal(report.sold.loaded.byUnit.sheet,100,'loaded sale remains in commercial Sold');
  assert.equal(report.sold.paidUnloaded.byUnit.sheet,120);assert.equal(report.reserved.byUnit.sheet,234,'loaded quantity is never reserved or removed from Physical again');
  assert.equal(partition.sold.inStock.knownValueTHB,1350);assert.equal(partition.reserved.inStock.knownValueTHB,350);assert.equal(report.free.knownValueTHB,0);assert.equal(report.physical.knownValueTHB,1700);
  assert.equal(partition.sold.inStock.knownValueTHB+partition.reserved.inStock.knownValueTHB+report.free.knownValueTHB,report.physical.knownValueTHB,'stock-basis partition values reconcile');
  assert.equal(report.sold.paidUnloaded.knownValueTHB,3000000);assert.equal(report.sold.knownValueTHB,12000000);
  assert.notEqual(partition.sold.inStock.knownValueTHB,report.sold.paidUnloaded.knownValueTHB,'allocated stock uses catalog prices, never invoice money');
  assert.equal(report.physical.valueTHB,null);assert.equal(report.physical.coverage.complete,false);assert.equal(report.physical.unpricedSpecs[0].qty,10);assert.equal(report.physical.unpricedSpecs[0].key,'1.6|F|915|1830|sheet');
  assert.equal(partition.reserved.inStock.valueTHB,null);assert.equal(partition.reserved.inStock.coverage.complete,false);assert.equal(partition.reserved.inStock.unpricedSpecs[0].qty,4);
  assert.equal(report.free.valueTHB,null);assert.equal(report.free.coverage.complete,false);assert.equal(report.free.unpricedSpecs[0].qty,6,'unknown price remains partial instead of zero-valued');
  assert.equal(partitionModel.all.stock.byKey['2.5|AAA|1220|2440|sheet'].physical,140,'exact reversed dimensions share one stock pool');
  mounted.app.destroy();

  const missing=clone(readiness);delete missing.byAllocationId['pi-lc'];
  const missingMount=await mountWith(missing);assert.equal(missingMount.report.partition.status,'unavailable','byRowId cannot mask missing per-allocation readiness');missingMount.app.destroy();
  const stale=clone(readiness);stale.byAllocationId['paid-next'].parts[0].availableBefore+=1;
  const staleMount=await mountWith(stale);assert.equal(staleMount.report.partition.status,'unavailable','stale sequence evidence fails closed');staleMount.app.destroy();
}

// Async stores fail closed: edits and saves are blocked until a successful load, and a load error cannot write an empty catalog.
{
  const h=harness(),gate=deferred(),writes=[];
  const store={load:()=>gate.promise,setWidgetState:async value=>writes.push(value)};
  const app=api.mount(h.root,model,{fxReference:{rate:33.3901}},store);
  assert.equal(h.root.attributes['aria-busy'],'true');
  assert(h.root.querySelectorAll('[data-free-price]').every(node=>node.disabled),'price inputs stay disabled during catalog load');
  const price=h.find('[data-free-price]');price.value='8';h.listeners.input({target:price});
  assert.deepEqual(app.getPriceState().prices,{},'early input cannot become a draft');
  gate.resolve(saved);await app.ready;await tick();
  assert.equal(h.root.attributes['aria-busy'],'false');
  assert(h.root.querySelectorAll('[data-free-price]').every(node=>!node.disabled),'inputs unlock after a valid catalog load');
  assert.equal(app.getPriceState().prices[visibleKey],1.95);assert.equal(writes.length,0);
  app.destroy();
}

{
  const h=harness(),writes=[];
  const store={load:async()=>{throw new Error('offline');},setWidgetState:async value=>writes.push(value)};
  const app=api.mount(h.root,model,{fxReference:{rate:33.3901}},store);
  assert.equal(await app.ready,false);
  assert(h.root.querySelectorAll('[data-free-price]').every(node=>node.disabled),'failed load leaves editor read-only');
  await app.savePrices();
  assert.equal(writes.length,0,'failed load can never overwrite the catalog');
  assert.equal(app.exportSaved(),null);
  assert.equal(h.openaiWrites.length,0);
  app.destroy();
}

console.log('Stock sales preview public asset, formula parity, 96-key catalog preservation, committed-only export and fail-closed persistence tests passed.');

export {harness,sale};
