import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),api=require('../stock_sales_preview.js');
const existing=fs.readFileSync(new URL('./stock-sales-preview.mjs',import.meta.url),'utf8');
const makeHarness=vm.runInNewContext(existing.slice(existing.indexOf('function harness()'),existing.indexOf('function sale('))+';harness');
const copy=value=>JSON.parse(JSON.stringify(value));
const key=(grade,w=1220,l=2440)=>`2|${grade}|${w}|${l}|sheet`;
const stock=[
  {sku:'free',w:1220,l:2440,t:2,grade:'F',unit:'sheet',physical:10},
  {sku:'fully-reserved',w:1220,l:2440,t:2,grade:'AAA',unit:'sheet',physical:20},
  {sku:'retained-zero',w:1200,l:2400,t:2,grade:'B',unit:'sheet',physical:0},
];
const sales=[{id:'paid',orderId:'paid',ref:'paid',customer:'SYNTHETIC',w:1220,l:2440,t:2,grade:'AAA',unit:'sheet',qty:20,amount:1000,currency:'THB',term:'TT',sourceStatus:'Forecast',productStatus:'พร้อมโหลด',payment:'เก็บเงิน / ได้ LC แล้ว'}];
const initial={privateContent:{version:3,context:'aaf-sales-stock-preview|free-price-catalog',fx:33,prices:{[key('F')]:73,[key('AAA')]:2},currencies:{[key('F')]:'THB',[key('AAA')]:'USD'},notesByThickness:{'2':'legacy note'},notesBySpec:{[key('AAA')]:'retain note'},savedAt:'2026-10-18T16:00:00Z'}};

async function fixture(options={},stockRows=stock,salesRows=sales){
  const model=api.buildModel(copy(salesRows),copy(stockRows),{strict:true,reservationPolicy:'aaf-firm-only-20261003-v1',paidOverrideRefs:[]});
  const h=makeHarness(),writes=[],store={widgetState:copy(initial),load(){return this.widgetState;},async setWidgetState(value){writes.push(copy(value));this.widgetState=copy(value);}};
  const view=api.mount(h.root,model,{fxReference:{rate:33},...options},store);await view.ready;
  // Extend the established dependency-free DOM harness with the replaceable
  // price-panel surface. Production uses a real nested div and delegated events.
  const overview=h.root.children.find(node=>node.id==='sp-money-all'),panel=h.root.ownerDocument.createElement('div');
  panel.dataset.priceEditorScope='sp-money-all-g-all';panel.querySelector=selector=>panel.fields.find(node=>node.matches(selector))||null;
  let mounted=false;
  function toggle(checked){
    const input=(mounted?panel.fields:overview.fields).find(node=>node.matches('[data-price-editor-all]'));
    assert(input,'price visibility toggle must be available');
    input.checked=checked;input.closest=selector=>selector==='[data-price-editor-scope]'?panel:null;
    if(!mounted){overview.fields=[];h.root.append(panel);mounted=true;}
    h.listeners.change({target:input});
  }
  const editorKeys=()=>Array.from(h.root.querySelectorAll('[data-free-price]'),node=>node.dataset.freePrice);
  return {h,view,model,writes,store,panel,toggle,editorKeys};
}

test('default remains Free-only; explicit toggle includes fully reserved and retained-zero exact specs without changing values or writing',async()=>{
  const f=await fixture(),modelBefore=JSON.stringify(f.model),reportBefore=copy(f.view.getReportSummary()),catalogBefore=f.view.exportSaved();
  assert.deepEqual(f.editorKeys(),[key('F')]);
  assert.match(f.h.root.children.find(node=>node.id==='sp-money-all').innerHTML,/แสดงทุกสเปกเพื่อแก้ราคา/);
  f.toggle(true);
  assert.deepEqual([...f.editorKeys()].sort(),[key('F'),key('AAA'),key('B',1200,2400)].sort());
  assert.match(f.panel.innerHTML,/รวม Free \/ Physical เป็น 0/);
  assert.match(f.panel.innerHTML,/แก้ราคาเท่านั้น ไม่เพิ่มยอดสต๊อก/);
  assert.deepEqual(f.view.getReportSummary(),reportBefore,'visibility is not a valuation or allocation input');
  assert.deepEqual(f.view.exportSaved(),catalogBefore);assert.equal(f.view.getPriceState().dirty,false);assert.equal(f.writes.length,0);
  assert.equal(JSON.stringify(f.model),modelBefore);f.view.destroy();
});

test('zero-Free and zero-Physical prices save together; synthetic fallback stays unchanged, notes and sales money persist, zero stock adds no value',async()=>{
  const f=await fixture(),modelBefore=JSON.stringify(f.model),before=copy(f.view.getReportSummary());f.toggle(true);
  for(const [spec,value,currency] of [[key('AAA'),'3','USD'],[key('B',1200,2400),'7','THB']]){
    const input=f.h.find('[data-free-price]',node=>node.dataset.freePrice===spec),select=f.h.find('[data-free-currency]',node=>node.dataset.freeCurrency===spec);
    assert(input&&select);input.value=value;f.h.listeners.input({target:input});select.value=currency;f.h.listeners.change({target:select});
  }
  assert.equal(f.writes.length,0);assert.deepEqual(f.view.getReportSummary(),before,'drafts do not change confirmed report');
  f.toggle(false);assert.deepEqual(f.editorKeys(),[key('F')]);f.toggle(true);
  assert.equal(f.h.find('[data-free-price]',node=>node.dataset.freePrice===key('AAA')).value,3,'toggle preserves price drafts');
  assert.equal(await f.view.savePrices(),true);assert.equal(f.writes.length,1,'one normal catalog save');
  const saved=f.store.widgetState.privateContent,after=f.view.getReportSummary();
  assert.equal(saved.prices[key('F')],73);assert.equal(saved.currencies[key('F')],'THB');
  assert.equal(saved.prices[key('AAA')],3);assert.equal(saved.currencies[key('AAA')],'USD');
  assert.equal(saved.prices[key('B',1200,2400)],7);assert.equal(saved.currencies[key('B',1200,2400)],'THB');
  assert.deepEqual(saved.notesByThickness,initial.privateContent.notesByThickness);assert.deepEqual(saved.notesBySpec,initial.privateContent.notesBySpec);
  assert.deepEqual(after.physical.byUnit,before.physical.byUnit);assert.deepEqual(after.free.byUnit,before.free.byUnit);assert.deepEqual(after.reserved.byUnit,before.reserved.byUnit);
  assert.equal(after.physical.knownValueTHB,10*73+20*3*33,'zero Physical contributes no inventory value');
  assert.equal(after.free.knownValueTHB,730,'Free basis is unchanged by editing fully reserved/zero stock');
  assert.deepEqual(after.sold,before.sold,'actual customer sales money is untouched');
  assert.equal(JSON.stringify(f.model),modelBefore);f.view.destroy();
});

test('toggling cannot discard an invalid hidden draft or bypass save validation',async()=>{
  const f=await fixture();f.toggle(true);const input=f.h.find('[data-free-price]',node=>node.dataset.freePrice===key('AAA'));
  input.value='-2';f.h.listeners.input({target:input});assert.equal(f.view.getPriceState().invalidKeys.length,1);
  f.toggle(false);assert.equal(await f.view.savePrices(),false);assert.equal(f.writes.length,0);
  f.toggle(true);assert.equal(f.h.find('[data-free-price]',node=>node.dataset.freePrice===key('AAA')).value,'-2');
  assert.equal(f.view.getPriceState().invalidKeys.length,1);f.view.destroy();
});

test('read-only view has no editing-visibility toggle and cannot save',async()=>{
  const f=await fixture({readOnly:true});assert.equal(f.h.find('[data-price-editor-all]'),undefined);
  assert.equal(f.view.setDraftPrice(key('AAA'),3,'USD'),false);assert.equal(await f.view.savePrices(),false);assert.equal(f.writes.length,0);f.view.destroy();
});

test('a catalog with no Free at all still exposes its retained-zero prices only on explicit selection',async()=>{
  const f=await fixture({},stock.map(row=>({...row,physical:0})),[]),before=copy(f.view.getReportSummary());
  assert.equal(f.editorKeys().length,0);f.toggle(true);assert.equal(f.editorKeys().length,3);
  assert.equal(f.view.setDraftPrice(key('B',1200,2400),7,'THB'),true);assert.equal(await f.view.savePrices(),true);
  assert.equal(f.view.getReportSummary().physical.knownValueTHB,0);assert.deepEqual(f.view.getReportSummary().physical.byUnit,before.physical.byUnit);
  f.toggle(false);assert.equal(f.editorKeys().length,0);assert.match(f.panel.innerHTML,/ไม่มีสเปกที่มี Free มากกว่า 0/);
  assert.equal(f.writes.length,1);f.view.destroy();
});
