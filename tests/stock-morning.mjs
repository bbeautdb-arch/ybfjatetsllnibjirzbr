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
assert(ui.includes("action:'enableSellableRules'"));assert(ui.includes('stockChecksum:data.report.checksum'));assert(ui.includes("data.stockWorkflowVersion!==1"));assert(ui.includes('คงยอดจอง'));assert(page.indexOf('stock_sales_export.js')<page.indexOf('stock_shared.js'));
console.log('Morning UI/export checks passed: current saved Physical, no reservation double-deduction, separate units, codes/prices/generation gates, preserved data and owner-only controls.');
