import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const api=require('../stock_price_panel.js');
const source=fs.readFileSync(new URL('../stock_price_panel.js',import.meta.url),'utf8');
const summary=fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8');
const row=(key,overrides={})=>({key,t:2.5,grade:'A',w:1220,l:2440,unit:'sheet',qty:10,freeQty:3,price:20,currency:'THB',priceStatus:'saved-price',...overrides});

test('coverage excludes zero-quantity unknown prices from positive stock missing counts',()=>{
  const rows=[row('a'),row('b',{t:3,price:null}),row('z',{t:4,price:null,qty:0,freeQty:0}),row('reserved',{t:5,price:null,qty:4,freeQty:0})];
  assert.deepEqual(api.coverage(rows),{active:2,free:1,zero:1,all:3});
  assert.equal(api.visibleRows(rows,'missing').length,2);assert.equal(api.visibleRows(rows,'unpriced').length,3);assert.equal(api.visibleRows(rows,'all').length,4);
});
test('coverage counts exact reversed dimensions once but retains near-size and units separately',()=>{
  const rows=[row('a',{price:null}),row('b',{price:null,w:2440,l:1220}),row('c',{price:null,w:1200,l:2400}),row('d',{price:null,unit:'strip'})];
  assert.equal(api.coverage(rows).active,3);
});
test('price changes require a positive value and explicit supported currency; no clears or quantity fields',()=>{
  const rows=[row('a'),row('b',{t:3,price:null}),row('c',{t:4})];
  const good=api.changesFor(rows,new Map([['a',{value:'21.5',currency:'USD'}],['b',{value:'12',currency:'THB'}]]));
  assert.deepEqual(good,{changes:[{key:'a',price:21.5,currency:'USD'},{key:'b',price:12,currency:'THB'}],invalid:[]});
  for(const value of ['', '0','-2','Infinity','invalid'])assert.deepEqual(api.changesFor(rows,new Map([['a',{value,currency:'THB'}]])).invalid,['a']);
  assert.deepEqual(api.changesFor(rows,new Map([['a',{value:'23',currency:'EUR'}]])).invalid,['a']);
  assert.equal(api.changesFor(rows,new Map([['a',{value:'20.0',currency:'THB'}]])).changes.length,0);
});
test('untouched blank rows are not price clears and unknown draft keys cannot save',()=>{
  const rows=[row('a',{price:null,currency:null})];
  assert.deepEqual(api.changesFor(rows,new Map([['a',{value:'',currency:'THB'}],['unknown',{value:'88',currency:'THB'}]])),{changes:[],invalid:[]});
});
test('row markup exposes authorized price and currency only, escaping input and exact label',()=>{
  const markup=api.rowMarkup(row('x',{grade:'<AAA>',price:null}),{value:'" onfocus="evil',currency:'THB'},true);
  assert.match(markup,/&lt;AAA&gt;/);assert.match(markup,/&quot; onfocus=&quot;evil/);
  assert.equal((markup.match(/ disabled/g)||[]).length,2);
  assert.doesNotMatch(markup,/data-spp-(quantity|free|note|followup)/);
});
test('conflicting reversed saved prices are explicit, not falsely called no prior price',()=>{
  const rows=[row('x',{price:null,currency:null,priceStatus:'price-conflict'})];
  assert.match(api.rowMarkup(rows[0],null,false),/ราคาขนาดกลับด้านขัดกัน/);
  const markup=api.reviewMarkup(rows,[{key:'x',price:30,currency:'THB'}]);
  assert.match(markup,/ราคาเดิมขนาดกลับด้านขัดกัน/);assert.match(markup,/ทั้งสองทิศทาง ไม่รวมขนาดอื่น/);
  assert.doesNotMatch(markup,/ยังไม่มีราคา/);
});
test('review shows before and after with explicit confirmation and protected-field scope',()=>{
  const markup=api.reviewMarkup([row('x')],[{key:'x',price:30,currency:'USD'}]);
  assert.match(markup,/20 THB →/);assert.match(markup,/30 USD/);assert.match(markup,/data-spp-confirm/);
  assert.match(markup,/ไม่เปลี่ยนยอดสต๊อก ราคาขายจริง ติดตาม หรือหมายเหตุ/);
});
test('saving is reachable only by reviewed confirm; toggling and inputs do not write',()=>{
  assert.equal((source.match(/await service\.save\(/g)||[]).length,1);
  const branch=source.slice(source.indexOf("if(button.matches('[data-spp-confirm]'))"));
  assert.match(branch,/if\(!preview\|\|!enabled\(\)\)return/);assert.match(branch,/const changes=preview\.map/);assert.match(branch,/await service\.save\(changes\)/);
  assert.match(source,/state\.canEdit===true/);assert.match(source,/!state\.uncertain/);assert.match(source,/sameContext\(\)/);
});
test('summary retains panel DOM and blocks automatic refresh while annotation drafts exist',()=>{
  const input={isConnected:true,focus(options){this.focusOptions=options;}},panel={contains:node=>node===input,remove(){this.removed=true;}};
  let current=panel,mountOptions,clicks=0;
  const fresh={replaceWith(value){assert.equal(value,panel);current=panel;}};
  const context={root:{querySelector:()=>current},document:{activeElement:input,getElementById:()=>({click(){clicks++;}})},latest:{revision:7},window:{AAFStockPriceEditor:{},AAFStockPricePanel:{mount(host,options){assert.equal(host,panel);mountOptions=options;}},AAFOrderReview:{isDirty:()=>true}}};
  const start=summary.indexOf('  function retainPriceSurface(){'),end=summary.indexOf('  const expandedThickness=',start);
  const funcs=vm.runInNewContext(summary.slice(start,end)+'\n({retainPriceSurface,restorePriceSurface})',context);
  const retained=funcs.retainPriceSurface();assert.equal(panel.removed,true);current=fresh;funcs.restorePriceSurface(retained);
  assert.equal(current,panel);assert.equal(input.focusOptions.preventScroll,true);assert.equal(mountOptions.onSaved(),false);assert.equal(clicks,0);
  context.window.AAFOrderReview.isDirty=()=>false;assert.equal(mountOptions.onSaved(),true);assert.equal(clicks,1);
});
test('panel is in summary but excluded from exported reports and retained on full repaint',()=>{
  assert.match(summary,/\$\{dailyOverviewHTML\(m\)\}\s*<div data-stock-price-panel-host data-html2canvas-ignore>/);
  const body=summary.slice(summary.indexOf('  function update(data,calculate){'),summary.indexOf('  async function loadCanvas('));
  assert.match(body,/const priceSurface=retainPriceSurface\(\)/);assert.match(body,/restorePriceSurface\(priceSurface\)/);
});
