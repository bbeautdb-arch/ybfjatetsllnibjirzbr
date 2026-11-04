import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const editor=require('../stock_price_editor.js'),panel=require('../stock_price_panel.js');
const key='2.5|AAA|1220|2440|sheet',reverse='2.5|AAA|2440|1220|sheet';
const clone=value=>structuredClone(value);
function fixture(){
  const stock={ok:true,revision:7,report:{reportDate:'2030-11-04'},rows:[{key:'w1220_l2440_t2.5_gAAA',w:1220,l:2440,t:2.5,grade:'AAA',unit:'sheet',qty:10,committedQty:4,freeQty:6,followup:'synthetic unchanged'}]};
  const catalog={ok:true,revision:7,catalogRevision:3,stockReportDate:'2030-11-04',permissions:{pricesAndNotes:true},widgetState:{privateContent:{version:3,context:'aaf-sales-stock-preview|free-price-catalog',prices:{[key]:80},currencies:{},notesByThickness:{},notesBySpec:{[key]:'synthetic preserved'},fx:33,savedAt:'2030-11-04T00:00:00Z'}}};
  return {stock,catalog};
}
test('saved number with absent currency remains unknown, counted and visible for repair',()=>{
  const data=fixture(),before=clone(data),rows=editor.parseSnapshot(data.stock,data.catalog).view.rows;
  assert.equal(rows[0].price,80);assert.equal(rows[0].currency,null);assert.equal(rows[0].priceStatus,'missing-currency');
  assert.deepEqual(panel.coverage(rows),{active:1,free:1,zero:0,all:1});
  assert.deepEqual(panel.missingDetails(rows),{price:0,currency:1,conflict:0});
  assert.equal(panel.visibleRows(rows,'missing').length,1);assert.deepEqual(data,before);
});
test('unknown currency is not preselected as THB and an explicit same-price choice is a change',()=>{
  const data=fixture(),rows=editor.parseSnapshot(data.stock,data.catalog).view.rows;
  const html=panel.rowMarkup(rows[0],null,false);
  assert.match(html,/<option value="" selected>เลือกสกุลเงิน/);assert.doesNotMatch(html,/<option value="THB" selected/);
  assert.match(html,/ขาดสกุลเงิน/);
  assert.deepEqual(panel.changesFor(rows,new Map([[key,{value:'80',currency:''}]])),{changes:[],invalid:[]});
  for(const currency of ['THB','USD']){
    const plan=panel.changesFor(rows,new Map([[key,{value:'80',currency}]]));
    assert.deepEqual(plan,{changes:[{key,price:80,currency}],invalid:[]});
    assert.match(panel.reviewMarkup(rows,plan.changes),/80 · ยังไม่มีสกุลเงิน/);
  }
});
test('new blank price rows remain untouched while positive prices require currency',()=>{
  const data=fixture();delete data.catalog.widgetState.privateContent.prices[key];
  const rows=editor.parseSnapshot(data.stock,data.catalog).view.rows;
  assert.equal(rows[0].currency,null);assert.deepEqual(panel.missingDetails(rows),{price:1,currency:0,conflict:0});
  assert.deepEqual(panel.changesFor(rows,new Map([[key,{value:'',currency:'THB'}]])),{changes:[],invalid:[]});
  assert.deepEqual(panel.changesFor(rows,new Map([[key,{value:'80',currency:''}]])),{changes:[],invalid:[key]});
});
test('zero-stock missing currency is retained separately without implying a missing active value',()=>{
  const data=fixture();Object.assign(data.stock.rows[0],{qty:0,committedQty:0,freeQty:0});
  const rows=editor.parseSnapshot(data.stock,data.catalog).view.rows;
  assert.deepEqual(panel.coverage(rows),{active:0,free:0,zero:1,all:1});
  assert.deepEqual(panel.missingDetails(rows),{price:0,currency:0,conflict:0});
  assert.equal(panel.visibleRows(rows,'unpriced').length,1);
});
test('one known alias cannot silently supply an unknown alias currency',()=>{
  const data=fixture(),p=data.catalog.widgetState.privateContent;p.prices[reverse]=80;p.currencies[reverse]='THB';
  const rows=editor.parseSnapshot(data.stock,data.catalog).view.rows;
  assert.equal(rows[0].priceStatus,'price-conflict');assert.equal(rows[0].price,null);assert.equal(rows[0].currency,null);
  assert.deepEqual(panel.missingDetails(rows),{price:0,currency:0,conflict:1});
});
test('explicit currency-only repair uses fresh dual CAS and verifies all protected state',async()=>{
  const data=fixture(),before=clone(data),writes=[];
  const service=editor.createService({identity:()=> 'synthetic-session',request:async(suffix,body)=>{
    if(!body)return clone(suffix?data.catalog:data.stock);
    writes.push(clone(body));assert.equal(body.action,'saveSalesReport');assert.equal(body.expectedRevision,7);assert.equal(body.expectedCatalogRevision,3);
    data.stock.revision++;data.catalog.revision++;data.catalog.catalogRevision++;
    Object.assign(data.catalog.widgetState.privateContent,{prices:clone(body.prices),currencies:clone(body.currencies),notesByThickness:clone(body.notesByThickness),notesBySpec:clone(body.notesBySpec),savedAt:'2030-11-04T01:00:00Z'});
    return clone(data.catalog);
  }});
  await service.load();const plan=panel.changesFor(service.getState().rows,new Map([[key,{value:'80',currency:'USD'}]]));
  const after=await service.save(plan.changes);assert.equal(writes.length,1);assert.equal(after.changed,true);
  assert.equal(after.rows[0].price,80);assert.equal(after.rows[0].currency,'USD');assert.equal(after.rows[0].priceStatus,'saved-price');
  assert.deepEqual(data.stock.rows,before.stock.rows);assert.deepEqual(data.stock.report,before.stock.report);
  for(const field of ['prices','notesByThickness','notesBySpec','fx'])assert.deepEqual(data.catalog.widgetState.privateContent[field],before.catalog.widgetState.privateContent[field]);
  assert.deepEqual(panel.coverage(after.rows),{active:0,free:0,zero:0,all:0});
});
test('missing currency does not grant editing rights or authorize unsupported currencies',async()=>{
  const data=fixture();data.catalog.permissions.pricesAndNotes=false;let writes=0;
  const service=editor.createService({identity:()=> 'synthetic-session',request:async(suffix,body)=>{if(body)writes++;return clone(suffix?data.catalog:data.stock);}});
  await service.load();assert.equal(service.getState().canEdit,false);
  await assert.rejects(service.save([{key,price:80,currency:'THB'}]),{code:'permission-denied'});assert.equal(writes,0);
  data.catalog.widgetState.privateContent.currencies[key]='EUR';assert.throws(()=>editor.parseSnapshot(data.stock,data.catalog),{code:'catalog-unavailable'});
});
