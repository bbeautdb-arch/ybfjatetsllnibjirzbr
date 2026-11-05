import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url), {build} = require('../stock_sales_thickness.js');
const capture = '2030-11-05T11:00:00Z';
const row = (id, extra = {}) => ({id, orderId: 'order-' + id, ref: 'SYNTH-' + id, customer: 'Synthetic customer', w: 1220, l: 2440, t: 2.5, grade: 'AAA', unit: 'sheet', qty: 10, sourceStatus: 'เปิด PI', productStatus: 'พร้อมโหลด', ...extra});
const review = (rows, extra = {}) => ({metadata: {month: '2030-11', sourceSalesCapturedAt: capture}, readModel: {kind: 'current-month-order-review', status: 'verified', selectedMonth: '2030-11', source: {month: '2030-11', capturedAt: capture}}, rows, ...extra});
const embedded = (price, qty, currency = 'THB') => ({version: 1, verified: true, amountBasis: 'line', unitPrice: price, amount: price * qty, currency});
const financial = (rows, currency = 'THB', price = 20) => ({metadata: {month: '2030-11', salesAsOf: capture}, byRowId: Object.fromEntries(rows.map(r => [r.id, {...r, sale: {status: 'verified', unitPrice: price, amount: price * r.qty, currency, source: 'Synthetic verified Page02 line', sourceDocument: r.ref, sourceId: 'source-' + r.id, valueBasis: 'actual-product-sale-value-not-inventory-average'}}]))});
const fx = {verified: true, rate: 32, date: '2030-11-05', source: 'Synthetic checked FX'};
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
test('three groups conserve sheets and strips; confirmed total equals loaded plus waiting equivalents', () => {
  const r = review([row('loaded', {sourceStatus: 'ออก INV', qty: 20, t: 1.6}), row('waiting', {qty: 30, t: 3}), row('strip', {unit: 'strip', w: 25, l: 2052, t: 3.2, qty: 1000}), row('negotiation', {sourceStatus: 'เจรจา', qty: 40}), row('forecast', {sourceStatus: 'Forecast', qty: 50})]);
  const m = build(r), g = m.byGroup.confirmed;
  assert.equal(m.status, 'verified'); assert.deepEqual(g.totals.quantity, {sheet: 50, strip: 1000});
  close(g.totals.eq25.sheet, 20 * 1.6 / 2.5 + 30 * 3 / 2.5);
  close(g.totals.eq25.strip, 1000 * 25 * 2052 * 3.2 / (1220 * 2440 * 2.5));
  close(g.totals.eq25.total, g.loaded.eq25.total + g.waiting.eq25.total);
  assert.equal(m.byGroup.negotiation.totals.quantity.sheet, 40); assert.equal(m.byGroup.forecast.totals.quantity.sheet, 50);
  assert.deepEqual(g.thicknesses.map(t => t.t), [1.6, 3, 3.2]);
});
test('actual source area, reversed axes and thickness are used, never allocation equivalence', () => {
  const g = build(review([row('small', {w: 1200, l: 2400}), row('reverse', {w: 2440, l: 1220}), row('thick', {t: 5})])).byGroup.confirmed;
  close(g.totals.eq25.sheet, 10 * 1200 * 2400 / (1220 * 2440) + 10 + 20);
  assert.notEqual(g.rows[0].eq25, 10); assert.equal(g.rows[1].eq25, 10);
});
test('missing dimensions, overflow and unknown units stay unknown; known subtotal and rows remain', () => {
  for (const change of [{w: null}, {l: 0}, {t: -1}, {w: '1220'}, {w: Number.MAX_SAFE_INTEGER, l: Number.MAX_SAFE_INTEGER}]) {
    const g = build(review([row('bad', change), row('okay')])).byGroup.confirmed;
    assert.equal(g.totals.eq25.sheet, null); assert.equal(g.totals.eq25.total, null); assert.equal(g.totals.eq25.knownSheet, 10); assert.equal(g.totals.eq25.missingLineCount, 1);
    assert.equal(g.rows.length, 2);
  }
  const g = build(review([row('bad', {unit: 'pallet'})])).byGroup.confirmed;
  assert.equal(g.totals.eq25.total, null); assert.equal(g.totals.eq25.unknownUnitCount, 1);
});
test('cancelled/unclassified records do not leak into the three groups; zero quantity stays zero without invented price', () => {
  const m = build(review([row('cancel', {cancelled: true, qty: 0, sourceQty: 25}), row('unknown', {sourceStatus: 'unknown'}), row('zero', {qty: 0})]));
  assert.equal(m.byGroup.confirmed.totals.quantity.sheet, 0); assert.equal(m.byGroup.confirmed.totals.eq25.total, 0);
  assert.equal(m.byGroup.confirmed.totals.money.sheet.totalTHB, 0); assert.equal(m.byGroup.confirmed.rows[0].sale.unitPrice, null);
  assert.deepEqual(m.excluded, {cancelledLineCount: 1, unclassifiedLineCount: 1});
});
test('verified exact line prices yield quantity-weighted averages separately by unit and currency', () => {
  const rows = [row('first', {qty: 10, actualSale: embedded(20, 10)}), row('second', {qty: 30, actualSale: embedded(40, 30)}), row('strip', {unit: 'strip', qty: 1000, w: 25, l: 2052, actualSale: embedded(2, 1000)})];
  const g = build(review(rows)).byGroup.confirmed, m = g.totals.money;
  assert.equal(m.sheet.totalTHB, 1400); assert.equal(m.sheet.averageTHBPerUnit, 35); assert.equal(m.strip.averageTHBPerUnit, 2);
  assert.equal(m.combined.totalTHB, 3400); assert.equal(m.combined.averageTHBPerUnit, undefined);
});
test('missing prices yield known subtotal, missing counts and priced quantity denominator; no receipt or inventory fallback', () => {
  const g = build(review([row('priced', {qty: 10, actualSale: embedded(20, 10)}), row('unknown', {qty: 90, price: 999, stockPrice: 999, amount: 12345, received: 12345})], {receiptSummary: {orders: [{exactAmount: 99999}]}})).byGroup.confirmed;
  const m = g.totals.money.sheet;
  assert.equal(m.knownTHB, 200); assert.equal(m.totalTHB, null); assert.equal(m.averageTHBPerUnit, 20);
  assert.equal(m.pricedQty, 10); assert.equal(m.missingQuantity, 90); assert.equal(m.missingPriceCount, 1); assert.equal(m.complete, false);
  const all = build(review([row('none')])).byGroup.confirmed.totals.money.sheet;
  assert.equal(all.totalTHB, null); assert.equal(all.averageTHBPerUnit, null); assert.equal(all.knownTHB, 0); assert.equal(all.pricedLineCount, 0);
});
test('USD native sale stays known without FX; only explicit checked FX permits THB conversion', () => {
  const r = review([row('usd', {qty: 10, actualSale: embedded(3, 10, 'USD')}), row('thb', {qty: 5, actualSale: embedded(20, 5)})]);
  for (const invalid of [undefined, 32, {rate: 32}, {...fx, verified: false}, {...fx, date: '2030-02-30'}, {...fx, source: ''}]) {
    const m = build(r, null, {fx: invalid}).byGroup.confirmed.totals.money.sheet;
    assert.equal(m.knownNative.USD, 30); assert.equal(m.knownTHB, 100); assert.equal(m.totalTHB, null); assert.equal(m.missingFxCount, 1); assert.equal(m.averageTHBPerUnit, 20);
  }
  const m = build(r, null, {fx}).byGroup.confirmed.totals.money.sheet;
  assert.equal(m.totalTHB, 1060); close(m.averageTHBPerUnit, 1060 / 15); assert.equal(m.pricedQty, 15);
});
test('exact-row financial DTO binds identity, dimensions, grade, quantity, month and capture before valuation', () => {
  const rows = [row('a')], r = review(rows, {financial: financial(rows)});
  assert.equal(build(r).byGroup.confirmed.totals.money.sheet.totalTHB, 200);
  for (const change of [{id: 'other'}, {orderId: 'other'}, {ref: 'other'}, {customer: 'other'}, {w: 1200}, {l: 2400}, {t: 3}, {grade: 'B'}, {qty: 11}, {unit: 'strip'}]) {
    const copy = structuredClone(r); Object.assign(copy.financial.byRowId.a, change);
    assert.equal(build(copy).byGroup.confirmed.totals.money.sheet.totalTHB, null);
  }
  for (const change of [{month: '2030-10'}, {salesAsOf: '2030-11-04T11:00:00Z'}]) {
    const copy = structuredClone(r); Object.assign(copy.financial.metadata, change);
    assert.equal(build(copy).byGroup.confirmed.totals.money.sheet.totalTHB, null);
  }
});
test('mixed invoice, inconsistent line amounts and unverified evidence are rejected', () => {
  for (const extra of [{verified: false}, {amountBasis: 'whole-invoice'}, {amount: 999}, {unitPrice: -1}, {currency: null}]) {
    const m = build(review([row('a', {actualSale: {...embedded(20, 10), ...extra}})])).byGroup.confirmed.totals.money.sheet;
    assert.equal(m.totalTHB, null); assert.equal(m.pricedLineCount, 0);
  }
  const rows = [row('a', {actualSale: embedded(20, 10)})], r = review(rows, {financial: financial(rows)});
  r.financial.byRowId.a.sale.status = 'pending';
  assert.equal(build(r).byGroup.confirmed.totals.money.sheet.totalTHB, null);
  r.financial.byRowId.a.sale.status = 'verified'; r.financial.byRowId.a.sale.valueBasis = 'inventory-average';
  assert.equal(build(r).byGroup.confirmed.totals.money.sheet.totalTHB, null);
});
test('stale supplied grouping cannot override source; duplicate identities and bad provenance fail closed', () => {
  const r = review([row('a')]), supplied = {groups: [{id: 'confirmed', totals: {sheet: 999999, strip: 0}}]};
  assert.equal(build(r, supplied).byGroup.confirmed.totals.quantity.sheet, 10);
  const duplicate = build(review([row('same'), row('same')]));
  assert.equal(duplicate.byGroup.confirmed.totals.eq25.total, null); assert.equal(duplicate.byGroup.confirmed.rows.length, 2);
  const bad = structuredClone(r); bad.readModel.status = 'pending';
  assert.equal(build(bad).byGroup.confirmed.totals.eq25.total, null); assert.equal(build(bad).byGroup.confirmed.totals.money.sheet.totalTHB, null);
});
test('one exact line price proof cannot be counted for multiple source rows', () => {
  const rows = [row('a'), row('b')], r = review(rows, {financial: financial(rows)});
  r.financial.byRowId.b.sale.sourceId = r.financial.byRowId.a.sale.sourceId;
  const g = build(r).byGroup.confirmed;
  assert.equal(g.totals.quantity.sheet, 20); assert.equal(g.totals.money.sheet.totalTHB, null);
  assert.equal(g.totals.money.sheet.missingPriceCount, 2); assert.equal(g.rows[0].sale.reason, 'sale-line-proof-reused');
});
test('projection does not mutate source, supplied grouping or options, and browser UMD works', () => {
  const rows = [row('a', {actualSale: embedded(20, 10)})], r = review(rows), before = structuredClone(r), options = {fx}, originalFx = structuredClone(options);
  const grouped = require('../stock_sales_groups.js').build(r), originalGroups = structuredClone(grouped);
  build(r, grouped, options); assert.deepEqual(r, before); assert.deepEqual(grouped, originalGroups); assert.deepEqual(options, originalFx);
  const context = vm.createContext({window: {}});
  for (const name of ['stock_sales_groups.js', 'stock_sales_thickness.js']) vm.runInContext(readFileSync(new URL('../' + name, import.meta.url), 'utf8'), context);
  assert.equal(context.window.AAFSalesThickness.build(r).byGroup.confirmed.totals.eq25.total, 10);
});
