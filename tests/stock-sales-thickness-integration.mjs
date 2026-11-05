import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),engine=require('../stock_sales_thickness.js'),groups=require('../stock_sales_groups.js');
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const scripts=html=>[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match=>match[1].split('?')[0]);
const capture='2030-11-05T11:00:00Z';
function fixture(){
  const rows=[{id:'SYNTH-A',orderId:'SYNTH-ORDER-A',ref:'SYNTH-PI-A',customer:'Synthetic company A',w:1220,l:2440,t:2.5,grade:'AAA',qty:100,unit:'sheet',sourceStatus:'เปิด PI',productStatus:'พร้อมโหลด'},
    {id:'SYNTH-B',orderId:'SYNTH-ORDER-B',ref:'SYNTH-PI-B',customer:'Synthetic company B',w:25,l:2052,t:3.2,grade:'B',qty:1000,unit:'strip',sourceStatus:'ออก INV',productStatus:'โหลดแล้ว'}];
  const sale=(id,amount,unitPrice,currency)=>({status:'verified',amount,unitPrice,currency,commercialTerm:'FOB',source:'Synthetic Page02 exact productline',sourceDocument:'SYNTH-PI-'+id,sourceLineIndex:0,sourceId:'SYNTH-PAGE02-'+id,valueBasis:'actual-line-sale-value'});
  return {metadata:{month:'2030-11',sourceSalesCapturedAt:capture},readModel:{kind:'current-month-order-review',status:'verified',selectedMonth:'2030-11',source:{month:'2030-11',capturedAt:capture}},rows,
    financial:{metadata:{month:'2030-11',salesAsOf:capture,salesFx:{verified:true,rate:35,date:'2030-11-05',source:'BOT_USD_THB_BUYING_TRANSFER'}},byRowId:{'SYNTH-A':{...rows[0],sale:sale('A',255,2.55,'USD')},'SYNTH-B':{...rows[1],sale:sale('B',2500,2.5,'THB')}},
      // Contradicting whole-order receipts and inventory context are deliberate
      // traps. None is eligible as a productline sale value.
      orders:[{orderId:'SYNTH-ORDER-A',received:{USD:999999},sale:{USD:888888},adjustment:77777}],views:{all:{groups:{1:{sale:{USD:666666}}}}}},
    receiptSummary:{orders:[{orderId:'SYNTH-ORDER-A',exactAmount:555555}]}};
}
test('both entrypoints load shared engine before current cards and thickness renderer before three-card renderer',()=>{
  for(const name of ['stock_manager.html','stock_report.html']){
    const list=scripts(read(name));
    for(const file of ['stock_sales_groups.js','stock_sales_thickness.js','stock_current_sales_groups.js','stock_sales_thickness_view.js','stock_sales_groups_view.js'])assert.equal(list.filter(v=>v===file).length,1,name+' should load '+file+' once');
    assert.ok(list.indexOf('stock_sales_groups.js')<list.indexOf('stock_sales_thickness.js'));
    assert.ok(list.indexOf('stock_sales_thickness.js')<list.indexOf('stock_current_sales_groups.js'));
    assert.ok(list.indexOf('stock_sales_thickness_view.js')<list.indexOf('stock_sales_groups_view.js'));
  }
});
test('controller passes only explicit actual-sale FX, loads table CSS into shadow and preserves disclosure DOM',()=>{
  const source=read('stock_order_review.js'),dashboard=source.slice(source.indexOf('const renderMonthDashboard ='),source.indexOf('const renderQueueMetrics ='));
  assert.match(dashboard,/AAFSalesThickness\.build\(data,model,\{fx:data\.financial\?\.metadata\?\.salesFx\}\)/);
  assert.doesNotMatch(dashboard,/fx:.*(?:freeStock|stockFx|\.metadata\?\.fx)/);
  assert.match(source,/stock_sales_thickness_view\.css/);assert.match(source,/shadow\.append\(thicknessLink\)/);
  assert.match(dashboard,/if\(root\.__salesDashboardHTML!==html\)/);
  assert.doesNotMatch(dashboard,/innerHTML\s*=\s*['"]['"]/);
  assert.doesNotMatch(dashboard,/select\.value|filteredRows|values\.filter/);
});
test('backend-shaped exact line contract with salesFx produces native +THB values without receipts or mixed-unit averages',()=>{
  const review=fixture(),before=structuredClone(review),model=engine.build(review,groups.build(review),{fx:review.financial.metadata.salesFx}),g=model.byGroup.confirmed;
  assert.equal(g.totals.money.sheet.knownNative.USD,255);assert.equal(g.totals.money.sheet.totalTHB,8925);
  assert.equal(g.totals.money.sheet.averageTHBPerUnit,89.25);assert.equal(g.totals.money.strip.totalTHB,2500);
  assert.equal(g.totals.money.strip.averageTHBPerUnit,2.5);assert.equal(g.totals.money.combined.totalTHB,11425);
  assert.equal(g.totals.money.combined.averageTHBPerUnit,undefined);assert.deepEqual(review,before);
});
test('backend-shaped unit/capture/price binding conflicts reject only unsupported money and no stock FX fallback',()=>{
  for(const mutate of [r=>r.financial.byRowId['SYNTH-A'].unit='strip',r=>r.financial.byRowId['SYNTH-A'].sale.sourceId='',r=>r.financial.byRowId['SYNTH-A'].sale.amount=256,r=>r.financial.metadata.salesAsOf='2030-11-04T11:00:00Z']){
    const r=fixture();mutate(r);const m=engine.build(r,null,{fx:r.financial.metadata.salesFx});
    assert.equal(m.byGroup.confirmed.totals.quantity.sheet,100);assert.equal(m.byGroup.confirmed.totals.money.sheet.totalTHB,null);
  }
  const r=fixture();r.financial.metadata.salesFx=null;r.financial.metadata.fx={rate:99};r.freeStock={metadata:{fx:{rate:99}}};
  const m=engine.build(r,null,{fx:r.financial.metadata.salesFx}).byGroup.confirmed.totals.money;
  assert.equal(m.sheet.knownNative.USD,255);assert.equal(m.sheet.totalTHB,null);assert.equal(m.sheet.missingFxCount,1);assert.equal(m.strip.totalTHB,2500);
});
test('optional financial source checksum must match this exact review when supplied',()=>{
  const r=fixture(),checksum='sha256:'+'a'.repeat(64);r.readModel.source.checksum=checksum;r.financial.metadata.salesSourceChecksum=checksum;
  assert.equal(engine.build(r,null,{fx:r.financial.metadata.salesFx}).byGroup.confirmed.totals.money.sheet.totalTHB,8925);
  for(const change of ['sha256:'+'b'.repeat(64),'invalid',null]){
    const copy=structuredClone(r);copy.financial.metadata.salesSourceChecksum=change;
    const g=engine.build(copy,null,{fx:copy.financial.metadata.salesFx}).byGroup.confirmed;
    assert.equal(g.totals.quantity.sheet,100);assert.equal(g.totals.money.sheet.totalTHB,null);assert.equal(g.totals.money.sheet.missingPriceCount,1);
  }
  const missing=structuredClone(r);delete missing.readModel.source.checksum;
  assert.equal(engine.build(missing).byGroup.confirmed.totals.money.sheet.totalTHB,null);
});
test('browser integrated renderer places equivalent on all three cards and drill-down thickness summary beneath them',()=>{
  const window={},context=vm.createContext({window});
  for(const file of ['stock_sales_groups.js','stock_sales_thickness.js','stock_sales_thickness_view.js','stock_sales_groups_view.js'])vm.runInContext(read(file),context);
  const r=fixture(),g=window.AAFSalesGroups.build(r),t=window.AAFSalesThickness.build(r,g,{fx:r.financial.metadata.salesFx});
  const html=window.AAFSalesGroupsView.render(g,{monthLabel:'Synthetic November',thicknessModel:t});
  assert.equal((html.match(/data-sales-equivalent=/g)||[]).length,3);assert.match(html,/4×8 หนา 2\.5/);
  assert.match(html,/สรุป.*ความหนา|ความหนา.*สรุป/);assert.match(html,/<details/);
  assert.match(html,/SYNTH-PI-A/);assert.match(html,/Synthetic company A/);
  assert.doesNotMatch(html,/888,888|999,999|555,555|NaN|Infinity/);
});
test('synthetic preview uses real modules but has no network, credentials, stock or reservation writes',()=>{
  const html=read('tests/stock-sales-thickness-preview.html'),list=scripts(html);
  assert.deepEqual(list,['../stock_sales_groups.js','../stock_sales_thickness.js','../stock_sales_thickness_view.js','../stock_sales_groups_view.js']);
  assert.match(html,/SYNTHETIC/);assert.match(html,/stock_order_review\.css/);assert.match(html,/stock_sales_thickness_view\.css/);
  assert.match(html,/missing-fx/);assert.match(html,/missing-dimensions/);assert.match(html,/thicknessModel/);
  assert.doesNotMatch(html,/fetch\(|XMLHttpRequest|localStorage|sessionStorage|Bearer|Authorization|https?:\/\//);
});
