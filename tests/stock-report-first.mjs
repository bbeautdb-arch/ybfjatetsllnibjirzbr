import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('report first keeps calculation DOM and narrowly hides owner-selected region',()=>{
  const html=read('stock_manager.html'),summary=read('stock_summary.js');
  assert.match(html,/id="stock-management-workbench" hidden aria-hidden="true"/);
  for(const id of ['stock-table-body','stock-table-foot','raw-table-container','auto-stock-panel','global-exchange-rate']){
    assert.ok(html.indexOf('id="'+id+'"')>html.indexOf('id="stock-management-workbench"'));
    assert.ok(html.indexOf('id="'+id+'"')<html.indexOf('id="stock-report-access"'));
  }
  assert.match(html,/#stock-summary > \.ss-report-intro/);
  assert.match(html,/#stock-summary > \.ss-status:not\(\.ss-error\)/);
  assert.match(summary,/root.innerHTML=`<div class="ss-tools ss-report-intro"/);
  assert.match(summary,/รายงานสต๊อกและติดตามการขาย/);
  assert.match(summary,/querySelector\('\.ss-download'\)\.addEventListener/);
  assert.ok(html.indexOf('id="stock-summary"')<html.indexOf('id="auto-mail-import-modal"'));
});
test('connection errors stay visible and retry uses existing guarded read',()=>{
  const html=read('stock_manager.html'),source=read('stock_shared.js');
  assert.match(html,/id="stock-report-access" hidden/);
  assert.match(html,/id="stock-report-access-message" role="alert"/);
  assert.match(html,/href="login\.html\?reauth=1"/);
  assert.match(source,/access\.hidden=!error/);
  assert.match(source,/\$\('stock-report-retry'\)\.onclick=refresh/);
  assert.match(source,/if\(dirty&&!confirm/);
  assert.match(source,/cache:'no-store'/);
});
