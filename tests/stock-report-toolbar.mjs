import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../stock_report_toolbar.js',import.meta.url),'utf8');
function setup(){
  const events={},nodes=new Map(),reads=[],writes=[],blobs=[],revoked=[],created=[],clicks=[];
  const node=()=>({dataset:{},hidden:false,parentNode:null,events:{},addEventListener(k,fn){this.events[k]=fn;},removeAttribute(k){delete this[k];},insertAdjacentElement(position,child){assert.equal(position,'afterend');child.parentNode=this;nodes.set(child.id,child);},click(){clicks.push(this.id);}});
  const button=node(),status=node();nodes.set('stock-export-excel',button);nodes.set('stock-excel-status',status);
  let resolveRead,rejectRead;
  const report={fileName:'AAF_Stock_Report_2026-10-13_r56.xlsx',reportDate:'2026-10-13',rows:[{}],warnings:[]};
  const window={addEventListener:(name,fn)=>events[name]=fn,AAFSalesPreview:{readExportSnapshot:()=>{reads.push({});return new Promise((resolve,reject)=>{resolveRead=resolve;rejectRead=reject;});}},AAFStockReportExport:{build:(stock,options)=>{assert.equal(stock.revision,56);assert.equal(options.catalog.revision,56);return report;},createWorkbook:r=>{assert.equal(r,report);return {stub:true};}},XLSX:{write:(wb,options)=>{writes.push({wb,options});return new Uint8Array([80,75,3,4]);},writeFile:()=>{throw Error('Must not automatically download');}}};
  const document={getElementById:id=>nodes.get(id),createElement:tag=>{assert.equal(tag,'a');return node();}};
  class Blob{constructor(parts,options){this.parts=parts;this.type=options.type;blobs.push(this);}}
  const URL={createObjectURL:blob=>{created.push(blob);return 'blob:report-'+created.length;},revokeObjectURL:url=>revoked.push(url)};
  vm.runInNewContext(source,{window,document,Blob,URL});
  return {button,status,ready:nodes.get('stock-download-ready'),events,reads,writes,blobs,revoked,created,clicks,report,window,
    resolve:()=>resolveRead({stock:{revision:56},catalog:{revision:56},verifiedAt:'2026-10-15T06:00:00Z'}),reject:error=>rejectRead(error)};
}
test('prepares bytes with explicit persistent native download; never auto-clicks',async()=>{
  const h=setup();assert.equal(h.ready.hidden,true);const promise=h.button.events.click();assert.equal(h.button.disabled,true);assert.equal(h.ready.hidden,true);h.resolve();await promise;
  assert.equal(h.button.disabled,false);assert.equal(h.ready.hidden,false);assert.equal(h.ready.href,'blob:report-1');assert.equal(h.ready.download,h.report.fileName);
  assert.equal(h.writes.length,1);assert.equal(h.writes[0].options.type,'array');assert.equal(h.writes[0].options.bookType,'xlsx');assert.equal(h.blobs[0].type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(h.clicks.length,0);assert.match(h.status.textContent,/เตรียมไฟล์แล้ว/);assert.match(h.status.textContent,/กดดาวน์โหลดไฟล์ Excel/);assert.doesNotMatch(h.status.textContent,/ส่งออก Excel แล้ว/);
});
test('new preparation clears and revokes prior link before reading; failed retry cannot download stale file',async()=>{
  const h=setup();let promise=h.button.events.click();h.resolve();await promise;promise=h.button.events.click();assert.equal(h.ready.hidden,true);assert.equal(h.ready.href,undefined);assert.deepEqual(h.revoked,['blob:report-1']);h.reject(new Error('auth expired'));await promise;
  assert.equal(h.ready.hidden,true);assert.equal(h.created.length,1);assert.equal(h.status.dataset.error,'true');assert.match(h.status.textContent,/auth expired/);
});
test('double click runs one read and pagehide revokes the prepared URL',async()=>{
  const h=setup(),promise=h.button.events.click();await h.button.events.click();assert.equal(h.reads.length,1);h.resolve();await promise;h.events.pagehide();assert.equal(h.ready.hidden,true);assert.equal(h.ready.href,undefined);assert.deepEqual(h.revoked,['blob:report-1']);
});
test('pagehide during an in-flight read cannot recreate a blob URL',async()=>{
  const h=setup(),promise=h.button.events.click();h.events.pagehide();h.events.pageshow();h.resolve();await promise;assert.equal(h.created.length,0);assert.equal(h.writes.length,0);assert.equal(h.ready.hidden,true);
  const next=h.button.events.click();h.resolve();await next;assert.equal(h.created.length,1,'restored page permits a new explicit preparation');
});
test('missing tools fail without a link, and toolbar has no mutations or automatic click',async()=>{
  const h=setup();delete h.window.XLSX.write;await h.button.events.click();assert.equal(h.reads.length,0);assert.equal(h.ready.hidden,true);assert.equal(h.status.dataset.error,'true');
  assert.doesNotMatch(source,/\bfetch\s*\(|localStorage|sessionStorage|\.click\s*\(|\.writeFile\s*\(|method\s*:\s*['"]POST/);
});
