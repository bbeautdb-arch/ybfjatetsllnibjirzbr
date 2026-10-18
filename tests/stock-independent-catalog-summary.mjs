import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const window={};
vm.runInNewContext(fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8'),{window,document:{getElementById:()=>null,createElement:()=>({}),head:{append(){}}}});
const api=window.AAFStockSummary;
const a={key:'a',w:1220,l:2440,t:2,grade:'F',unit:'sheet',qty:10,committedQty:5,freeQty:7};
const b={...a,key:'b',w:25,grade:'B',unit:'strip',qty:100,committedQty:20,freeQty:80};
const m={revision:'58',reportDate:'2026-10-18',rows:[a,b]};
const catalog={revision:58,reportDate:m.reportDate,catalogRevision:7,savedAt:'2026-10-16T02:00:00Z',rows:[{...a,price:2,currency:'USD'},{...b,price:3,currency:'THB'}]};
const fx={rate:33,date:'2026-10-15',status:'current',basis:'BOT_USD_THB_BUYING_TRANSFER'};
test('independent Physical valuation uses saved prices, keeps units and ignores paid/reservation allocation',()=>{
  const before=JSON.stringify({m,catalog});const v=api.withSavedCatalog(m,catalog,fx);
  assert.equal(v.rows[0].catalogValue,660);assert.equal(v.rows[0].catalogFreeValue,462);
  assert.equal(v.savedCatalog.totals.sheet.known,660);assert.equal(v.savedCatalog.totals.strip.known,300);
  assert.equal(JSON.stringify({m,catalog}),before);
  const html=api.renderKpis(null,v);assert.match(html,/Physical × ราคาประเมินที่บันทึก/);assert.match(html,/฿ 660/);assert.match(html,/฿ 300/);
  assert.match(html,/ไม่ใช่ราคาขายจริง/);assert.match(html,/ไม่.*อัปเดตเฉลี่ย 6 เดือนอัตโนมัติ/);assert.match(html,/รอชุดยอดขาย/);
});
test('revision, date, spec, count and per-spec quantity mismatches fail closed',()=>{
  for(const bad of [{...catalog,revision:57},{...catalog,reportDate:'2026-10-12'},{...catalog,rows:[catalog.rows[0]]},{...catalog,rows:catalog.rows.map(r=>({...r,qty:r.qty+1}))},{...catalog,rows:[catalog.rows[0],catalog.rows[0]]},{...catalog,rows:catalog.rows.map(r=>({...r,t:3}))}]){
    const v=api.withSavedCatalog(m,bad,fx);assert.equal(v.savedCatalog,null);assert(v.rows.every(r=>r.catalogPrice===null&&r.catalogValue===null));
  }
});
test('unknown/zero prices, currency and missing FX stay unknown, not stock worth zero',()=>{
  for(const change of [{price:0},{price:null},{price:-1},{price:'2'},{price:Infinity},{currency:'EUR'}]){
    const v=api.withSavedCatalog(m,{...catalog,rows:[{...catalog.rows[0],...change},catalog.rows[1]]},fx);
    assert.equal(v.rows[0].catalogValue,null);assert.equal(v.savedCatalog.totals.sheet.unknown,10);
  }
  const noFx=api.withSavedCatalog(m,catalog,null);assert.equal(noFx.rows[0].catalogValue,null);assert.equal(noFx.rows[1].catalogValue,300);
  assert.match(api.renderKpis(null,noFx),/รอราคา\/FX 10 แผ่น/);
});
test('zero rows retained and clearing catalog cannot retain last saved price',()=>{
  const zero={...a,qty:0,freeQty:0,committedQty:0};
  const v=api.withSavedCatalog({...m,rows:[zero]}, {...catalog,rows:[{...zero,price:null,currency:null}]},fx);
  assert.equal(v.rows.length,1);assert.equal(v.rows[0].catalogPrice,null);assert.equal(v.savedCatalog.totals.sheet.unknown,0);
  const cleared=api.withSavedCatalog(api.withSavedCatalog(m,catalog,fx),null,fx);
  assert.equal(cleared.savedCatalog,null);assert(cleared.rows.every(r=>r.catalogPrice===null));
});
