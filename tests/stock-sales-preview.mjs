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
  const h=harness(),writes=[],exports=[];
  let loads=0;
  const store={widgetState:saved,load(){loads++;return this.widgetState;},async setWidgetState(value){writes.push(clone(value));this.widgetState=clone(value);}};
  const before=JSON.stringify(model);
  const app=api.mount(h.root,model,{fxReference:{rate:33.3901},metadata:{monthLabel:'synthetic'},onExport:value=>exports.push(value)},store);
  await app.ready;
  assert.equal(loads,1);assert.equal(writes.length,0,'mount never persists');assert.equal(h.openaiWrites.length,0,'explicit store never touches window.openai');
  assert.equal(h.root.id,'sales-stock-preview-16');
  const initial=app.exportSaved();
  assert.equal(Object.keys(initial.privateContent.prices).length,96);
  assert.equal(initial.privateContent.prices[visibleKey],1.95);
  const price=h.find('[data-free-price]',node=>node.dataset.freePrice===visibleKey);
  const note=h.find('[data-thickness-note]',node=>node.dataset.thicknessNote==='2.5');
  assert(price&&note,'synthetic Free inputs are mounted');
  price.value='2.5';h.listeners.input({target:price});note.value='draft note';h.listeners.input({target:note});
  const draftExport=app.exportSaved();
  assert.equal(draftExport.privateContent.prices[visibleKey],1.95,'export excludes an unsaved price draft');
  assert.equal(draftExport.privateContent.notesByThickness['2.5'],'saved note','export excludes an unsaved note draft');
  await app.savePrices();
  assert.equal(writes.length,1);assert.equal(Object.keys(writes[0].privateContent.prices).length,96,'save preserves absent catalog specs');
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
