import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const window={};
const document={getElementById:()=>null,createElement:()=>({}),head:{append(){}}};
vm.runInNewContext(fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8'),{window,document});
test('authorized basic stock remains visible without a sales report, separates units and keeps money unknown',()=>{
  const m={reportDate:'2026-10-13',rows:[{unit:'sheet',w:1220,l:2440,t:2.5,qty:100,committedQty:120,freeQty:0},{unit:'strip',w:25,l:2052,t:3.2,qty:850000,committedQty:220000,freeQty:630000}]};
  const html=window.AAFStockSummary.renderKpis(null,m);
  assert.match(html,/data-basic-stock="physical"/);
  assert.match(html,/<strong>100<\/strong>/);
  assert.match(html,/ไม้แถบ <b>850,000<\/b> ชิ้น/);
  assert.match(html,/<dd>100 <small>แผ่น/);
  assert.doesNotMatch(html,/850,100|฿ 0/);
  assert.match(html,/ยอดจองที่บันทึกไว้/);
  assert.match(html,/ไม่ใช่การตัดสต๊อกรอบใหม่/);
  assert.match(html,/ขายแล้วทั้งหมด<\/h3><strong>—/);
});
test('missing or invalid unit does not produce a plausible stock fallback',()=>{
  const html=window.AAFStockSummary.renderKpis(null,{rows:[{qty:100,committedQty:0,freeQty:100}]});
  assert.doesNotMatch(html,/data-basic-stock=/);
  assert.doesNotMatch(html,/<strong>100/);
});
test('download toolbar is top-right and outside the hidden workbench; no modifying APIs',()=>{
  const html=fs.readFileSync(new URL('../stock_manager.html',import.meta.url),'utf8');
  assert.ok(html.indexOf('id="stock-report-downloads"')<html.indexOf('id="stock-management-workbench"'));
  assert.match(html,/#stock-report-downloads \{[^}]*justify-content:flex-end/);
  const source=fs.readFileSync(new URL('../stock_report_toolbar.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/localStorage|sessionStorage|POST|\.accept\(|savePrices|location\.reload/);
  assert.match(source,/readExportSnapshot\(\)/);
});
