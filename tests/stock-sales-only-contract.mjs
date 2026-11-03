import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {salesOnlyFixture} from './stock-sales-only-fixture.mjs';
const {salesOnlyReviewValid,sourceText}=createRequire(import.meta.url)('../stock_order_header.js');
const copy=v=>structuredClone(v);
test('source-only complete source keeps sold subset distinct from plan, units and cancelled raw source',()=>{
  const f=salesOnlyFixture();assert(salesOnlyReviewValid(f.review,f.readModel,f.currentMonthSold));assert.deepEqual(f.currentMonthSold.quantity,{sheet:30,strip:5});assert.deepEqual(f.review.summary.quantityByUnit,{sheet:50,strip:20});assert.deepEqual(f.review.summary.sourceQuantityByUnit,{sheet:54,strip:20});
});
test('source-only rejects manufactured stock, allocation, per-thickness or per-unit zero and mismatched counts',()=>{
  const mutations=[f=>f.readModel.stock={},f=>f.review.metadata.stockPhysicalRowsReconciled=true,f=>f.review.queueReview.stockBasis.physicalCutoffVerified=true,f=>f.review.freeStock={},f=>f.review.stockPools.push({free:0}),f=>f.review.rows[1].allocated=0,f=>f.review.rows[1].queue.shortage=0,f=>f.review.rows[1].queue.remaining=0,f=>f.review.rows[1].priorParts.push({allocated:5}),f=>f.review.byThickness['2.5'].shortage=0,f=>f.review.summary.byUnit.sheet.allocated=0,f=>f.review.queueReview.byThickness['3.2'].allocationComplete=true,f=>f.review.queueReview.poolQueues.push({rows:[]}),f=>f.currentMonthSold.lineCount++,f=>f.currentMonthSold.orderCount++,f=>f.currentMonthSold.source.orderCount++,f=>f.currentMonthSold.quantity.sheet++,f=>f.review.rows[0].soldGroup='unknown',f=>f.review.rows[6].cancelled=false,f=>f.readModel.source.checksum='sha256:'+'b'.repeat(64)];
  for(const mutate of mutations){const f=copy(salesOnlyFixture());mutate(f);assert.equal(salesOnlyReviewValid(f.review,f.readModel,f.currentMonthSold),false);}
});
test('source-only null guards never throw for malformed missing objects',()=>{
  for(const value of [null,{},[],{metadata:{}},{rows:[]}])assert.equal(salesOnlyReviewValid(value,null,null),false);
});
