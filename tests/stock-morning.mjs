import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const context={window:{}};vm.runInNewContext(read('stock_sales_export.js'),context);
const build=context.window.AAFStockSalesExport.build;
const r=(sku,w,l,t,grade,qty,unit='sheet')=>({sku,exportSku:sku,w,l,t,grade,qty,unit,committedQty:999,freeQty:1,priceObj:{price:2,currency:'USD'},priceConfirmed:true,skuNeedsReview:false,note:'=keep me',followup:'do not erase'});
const data=()=>({permissions:{adjust:true},stockWorkflowVersion:1,sellableRules:'aaf-sellable-20260910-v2',report:{reportDate:'2026-01-01',checksum:'sha256:test'},revision:5,updatedAt:'2026-01-01T04:00:00Z',exchangeRate:33,rows:[r('B0012202440016',1220,2440,1.6,'B',20528),r('AAA12602440025',1260,2440,2.5,'AAA',17),r('CTSB0000252052032',25,2052,3.2,'B',100,'strip'),{...r('A0012202440016',1220,2440,1.6,'A',0),priceObj:{price:0,currency:'THB'},priceConfirmed:false}]});
const source=data(),before=JSON.stringify(source),model=build(source,'2026-01-01');
assert.equal(JSON.stringify(source),before);
assert.equal(model.stock.length,4);assert.equal(model.stock[1][0],'B0012202440016');assert.equal(model.stock[1][5],20528);assert.equal(model.stock[1][6],0);assert.equal(model.stock[1][7],20528);assert.equal(model.stock[1][10],20528*2*33);
assert(model.stock.slice(1).every(row=>row[6]===0&&row[7]===row[5]));assert.equal(model.totals.sheet,20545);assert.equal(model.totals.strip,100);
assert.equal(model.summary.find(r=>r[0]==='Physical รวม')[1],20645);assert.equal(model.summary.find(r=>r[0]==='วันที่รายงาน')[1],'2026-01-01');
assert.equal(model.fileName,'AAF_Stock_For_Sales_2026-01-01.xlsx');
for(const change of [d=>d.permissions.adjust=false,d=>d.sellableRules=null,d=>d.stockWorkflowVersion=undefined,d=>d.rows[0].exportSku=d.rows[0].sku='',d=>d.rows[0].skuNeedsReview=true,d=>d.rows[0].priceConfirmed=false,d=>d.rows[0].priceObj.price=0,d=>d.rows[0].priceObj.price=NaN,d=>d.rows[0].priceObj.currency='EUR',d=>d.rows[0].qty=-1,d=>d.rows[0].qty=1.5,d=>d.rows[0].unit='unknown',d=>d.exchangeRate=0,d=>d.rows.push({...d.rows[0],w:2440,l:1220,sku:'ROTATED'}),d=>d.rows[1].sku=d.rows[1].exportSku=d.rows[0].sku]){
  const d=data();change(d);assert.throws(()=>build(d,'2026-01-01'));
}
assert.throws(()=>build(data(),'2026-01-02'),/รายงานเมลของวันนี้/);
const shared=read('stock_shared.js'),ui=read('stock_plan_ui.js'),page=read('stock_manager.html');
assert(shared.includes("body.action==='enableSellableRules'"),'unsaved drafts block activation');
const exportFunction=shared.slice(shared.indexOf('  window.downloadSales04Stock='),shared.indexOf('  window.downloadStockReport='));
assert(exportFunction.includes('const fresh=await request()'),'export re-reads central state');assert(exportFunction.includes('if(dirty)'));assert(exportFunction.includes('AAFStockSalesExport.build(fresh,today)'));assert(!exportFunction.includes('action:'),'export cannot save a stock mutation');
assert(exportFunction.includes("if(ws[k].t==='s')delete ws[k].f"));
assert(ui.includes("action:'enableSellableRules'"));assert(ui.includes('stockChecksum:morningReview.stockChecksum'));assert(ui.includes("data.stockWorkflowVersion!==1"));assert(ui.includes('คงยอดจอง'));assert(page.indexOf('stock_sales_export.js')<page.indexOf('stock_shared.js'));
assert(!/\bconfirm\s*\(/.test(ui),'morning confirmation must be an HTML dialog, not a native browser dialog');

// Exercise the real handlers without a browser, network, or stock writes.
const nodes=new Map();
function element(tag='div'){
  const node={tagName:tag,open:false,disabled:false,hidden:false,value:'',textContent:'',attributes:{},events:{},children:[],
    setAttribute(k,v){this.attributes[k]=v;},append(child){this.children.push(child);},insertBefore(child){this.children.push(child);},
    addEventListener(name,fn){this.events[name]=fn;},showModal(){this.open=true;},close(){this.open=false;this.events.close?.();},scrollIntoView(){}};
  Object.defineProperty(node,'id',{get(){return this._id;},set(value){this._id=value;nodes.set(value,this);}});
  Object.defineProperty(node,'innerHTML',{set(value){this._html=value;for(const match of value.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)){const child=element(match[1]);child.id=match[2];if(child.id==='plan-filter')child.value='all';}},get(){return this._html||'';}});
  return node;
}
const doc={createElement:element,getElementById:id=>nodes.get(id),head:element('head'),body:element('body'),querySelector:()=>null};
const dialogContext={window:{},document:doc,confirm(){throw Error('Native dialog must not be used');}};
vm.runInNewContext(ui,dialogContext);
const controller=dialogContext.window.AAFStockPlanUI;
controller.setup(element());
const owner={...data(),sellableRules:null},immutableOwner=JSON.stringify(owner),saves=[];
let finishSave;
const saveStub=body=>{saves.push(JSON.parse(JSON.stringify(body)));return new Promise(resolve=>{finishSave=resolve;});};
controller.update(owner,saveStub);
const open=nodes.get('plan-enable'),modal=nodes.get('morning-confirm-dialog'),submit=nodes.get('morning-confirm-submit'),cancel=nodes.get('morning-confirm-cancel'),review=nodes.get('morning-confirm-review'),state=nodes.get('morning-confirm-state');
assert.equal(modal.attributes['aria-labelledby'],'morning-confirm-title');assert.equal(modal.attributes['aria-describedby'],'morning-confirm-review');
open.onclick();assert(modal.open);assert.equal(saves.length,0,'opening the review must not save');
assert(review.textContent.includes(owner.report.reportDate));assert(review.textContent.includes('1270 → 1260'));assert(review.textContent.includes('คงยอดจอง ราคา หมายเหตุ และการติดตามเดิม'));
cancel.onclick();assert(!modal.open);assert.equal(saves.length,0,'cancel must not save');
await submit.onclick();assert.equal(saves.length,0,'closed dialog cannot submit');
open.onclick();
controller.update({...owner,revision:owner.revision+1},saveStub);
await submit.onclick();assert.equal(saves.length,0,'changed revision requires a new review');assert(state.textContent.includes('ข้อมูลเปลี่ยน'));
cancel.onclick();controller.update(owner,saveStub);open.onclick();
controller.update({...owner,report:{...owner.report,checksum:'sha256:changed'}},saveStub);
await submit.onclick();assert.equal(saves.length,0,'changed checksum cannot submit the old review');
cancel.onclick();controller.update(owner,saveStub);open.onclick();
controller.update({...owner,permissions:{adjust:false}},saveStub);
await submit.onclick();assert.equal(saves.length,0,'permission is rechecked at submit');
cancel.onclick();open.onclick();assert(!modal.open,'non-owner cannot open the review');
controller.update(owner,saveStub);open.onclick();
const pending=submit.onclick();await submit.onclick();
assert.equal(saves.length,1,'double click submits once');assert(submit.disabled&&cancel.disabled&&open.disabled);
let prevented=false;modal.events.cancel({preventDefault(){prevented=true;}});assert(prevented,'Escape cannot hide an in-flight save');
cancel.onclick();assert(modal.open,'cancel cannot hide an in-flight save');
assert.deepEqual(saves[0],{action:'enableSellableRules',rules:'aaf-sellable-20260910-v2',stockChecksum:owner.report.checksum});
finishSave(false);await pending;assert(modal.open,'a rejected save retains the confirmation and error');assert(!submit.disabled&&!cancel.disabled);assert(state.textContent.includes('ยังไม่บันทึก'));
const accepted=submit.onclick();assert.equal(saves.length,2);controller.update({...owner,sellableRules:'aaf-sellable-20260910-v2'},saveStub);finishSave(true);await accepted;
assert(!modal.open,'success closes the review');assert(open.disabled,'enabled rules cannot be submitted again');assert(nodes.get('morning-plan-state').textContent.includes('ยังไม่ได้ส่งไฟล์'));
assert.equal(JSON.stringify(owner),immutableOwner,'confirmation cannot alter source data');
console.log('Morning UI/export checks passed: current saved Physical, no reservation double-deduction, separate units, codes/prices/generation gates, preserved data and owner-only controls.');
console.log('HTML confirmation checks passed: explicit review/cancel, owner and stale-source guards, one in-flight submit, rejected save retained, no native dialog or stock writes.');
