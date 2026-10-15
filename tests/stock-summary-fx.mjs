import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8');
function setup(){
  const value={textContent:''},status={textContent:''};
  const root={querySelector:s=>s==='.ss-exchange b'?value:s==='.ss-exchange small'?status:null,querySelectorAll:()=>[],addEventListener(){}};
  const window={};const document={getElementById:()=>root,createElement:()=>({}),head:{append(){}}};
  vm.runInNewContext(source,{window,document});return {api:window.AAFStockSummary,value,status};
}
const rate={rate:33.3984,date:'2026-10-14',status:'current',basis:'BOT_USD_THB_BUYING_TRANSFER'};
test('standalone dated USD survives a pending sales summary without changing KPI money',()=>{
  const {api,value,status}=setup();api.setExchangeRate(rate);api.setSalesSummary(null);
  assert.equal(value.textContent,'33.3984');assert.match(status.textContent,/14 ตุลาคม 2569/);
  const kpis=api.renderKpis(null,{rows:[{unit:'sheet',w:1220,l:2440,t:2.5,qty:100,committedQty:20,freeQty:80}]});
  assert.match(kpis,/สต๊อกจริง · Physical<\/h3><strong>100/);assert.match(kpis,/รอยืนยันชุดราคาสต๊อก/);assert.doesNotMatch(kpis,/฿ 0|3,339/);
});
test('stale and failed refresh retain date and honest labels; clearing auth removes rate',()=>{
  const {api,value,status}=setup();api.setExchangeRate({...rate,status:'stale'});assert.match(status.textContent,/เกิน 7 วัน/);
  api.setExchangeRate({...rate,status:'unavailable'});assert.equal(value.textContent,'33.3984');assert.match(status.textContent,/ดึงเรทล่าสุดไม่สำเร็จ/);
  api.setExchangeRate(null);assert.equal(value.textContent,'—');assert.match(status.textContent,/ไม่ใช้ 0 แทน/);
});
test('reject undated, impossible, future, foreign basis or invalid rates',()=>{
  const {api}=setup();for(const invalid of [{...rate,date:null},{...rate,date:'2026-02-30'},{...rate,date:'2999-01-01'},{...rate,basis:'SELLING'},{...rate,rate:0},{...rate,rate:'33.4'},{...rate,rate:Infinity},{...rate,rate:1001}])assert.equal(api.exchangeRateDisplay(null,invalid).rate,null);
});
test('ready summary keeps its applied saved FX rather than relabelling already calculated money',()=>{
  const {api}=setup();const d=api.exchangeRateDisplay({catalog:{fxThbPerUsd:32,fxStatus:'เรทที่ใช้ในยอดรวม'}},rate);assert.equal(d.rate,32);assert.equal(d.status,'เรทที่ใช้ในยอดรวม');
});
