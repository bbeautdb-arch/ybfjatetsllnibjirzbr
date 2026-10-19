import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const bridge = require('../stock_review_notes_bridge.js');
const nonce = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const otherId = '00000000-0000-4000-8000-000000000003';
const key = '2|A|100|200|sheet';
const zeroKey = '2|B|100|200|sheet';
const copy = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const rows = [{ w: 100, l: 200, t: 2, grade: 'A', unit: 'sheet', sku: 'SYNTH-A', qty: 10, freeQty: 0, committedQty: 10, priceObj: { price: 2, currency: 'THB' } }, { w: 100, l: 200, t: 2, grade: 'B', unit: 'sheet', sku: 'SYNTH-B', qty: 0, freeQty: 0, committedQty: 0 }];
  return { stock: { ok: true, revision: 5, report: { reportDate: '2026-01-01' }, rows, actor: { username: 'synthetic-only' } }, catalog: { ok: true, revision: 5, catalogRevision: 3, stockReportDate: '2026-01-01', permissions: { pricesAndNotes: true }, widgetState: { privateContent: { version: 3, context: 'aaf-sales-stock-preview|free-price-catalog', fx: 3, prices: { [key]: 2 }, currencies: { [key]: 'THB' }, notesByThickness: { '2': 'legacy synthetic' }, notesBySpec: { [key]: 'before synthetic' }, savedAt: '2026-01-01T00:00:00.000Z' } } } };
}
function harness() {
  const records = fixture(), calls = [], messages = [], states = [], opener = {}, now = 1000;
  let token = 'synthetic-token-never-forward', clock = now, hook = null;
  const env = {
    nonce, opener, expiresAt: now + 1800000, now: () => clock, getToken: () => token,
    send: (message, origin) => messages.push({ message: copy(message), origin }), onState: s => states.push(s),
    fetch: async (url, opts) => {
      calls.push({ url, opts: copy(opts) });
      if (hook) { const result = await hook(url, opts); if (result) return result; }
      if (opts.method === 'POST') {
        const body = JSON.parse(opts.body);
        if (body.expectedRevision !== records.stock.revision || body.expectedCatalogRevision !== records.catalog.catalogRevision) return response({ ok: false }, 409);
        records.stock.revision++; records.catalog.revision++; records.catalog.catalogRevision++;
        records.catalog.widgetState.privateContent.notesBySpec = { ...records.catalog.widgetState.privateContent.notesBySpec, ...body.notesBySpec };
        records.catalog.widgetState.privateContent.savedAt = '2026-01-01T01:00:00.000Z';
        return response(records.catalog);
      }
      return response(url.includes('catalogOnly') ? records.catalog : records.stock);
    }
  };
  const controller = bridge.createController(env);
  return { controller, records, calls, messages, states, opener, setToken: t => { token = t; }, setNow: n => { clock = n; }, setHook: h => { hook = h; }, event: (type, fields = {}) => ({ origin: bridge.LOCAL_ORIGIN, source: opener, data: { protocol: bridge.PROTOCOL, nonce, type, ...fields } }) };
}
function response(data, status = 200) { return { status, ok: status >= 200 && status < 300, json: async () => copy(data) }; }
const changes = [{ key, before: 'before synthetic', after: 'after synthetic' }];
const posts = h => h.calls.filter(c => c.opts.method === 'POST');
const last = h => h.messages.at(-1)?.message;

test('canonical note keys reverse axes but never merge grade, unit or near-size aliases', () => {
  assert.equal(bridge.canonicalKey(key), true);
  assert.equal(bridge.canonicalKey('2|A|200|100|sheet'), false);
  assert.equal(bridge.canonicalKey('2|A|1200|2400|sheet'), true);
  assert.notEqual('2|A|1200|2400|sheet', '2|A|1220|2440|sheet');
});
test('no API read, private data or write before visible approval', async () => {
  const h = harness();
  await h.controller.receive(h.event('HELLO'));
  assert.deepEqual(last(h), { protocol: bridge.PROTOCOL, nonce, type: 'READY', approved: false });
  await h.controller.receive(h.event('REFRESH'));
  await h.controller.receive(h.event('STAGE', { requestId, changes }));
  await h.controller.confirm();
  assert.equal(h.calls.length, 0); assert.equal(posts(h).length, 0);
  assert.doesNotMatch(JSON.stringify(h.messages), /before synthetic|SYNTH-A|synthetic-token/);
});
test('reject wrong origin, window source, nonce, protocol and unknown envelope fields', async () => {
  const h = harness(), event = h.event('HELLO');
  for (const e of [{ ...event, origin: 'http://localhost:8766' }, { ...event, origin: 'https://example.test' }, { ...event, source: {} }, { ...event, data: { ...event.data, nonce: otherId } }, { ...event, data: { ...event.data, protocol: 'other' } }]) assert.equal(await h.controller.receive(e), false);
  assert.equal(h.messages.length, 0); assert.equal(h.calls.length, 0);
  await h.controller.receive(h.event('HELLO', { action: 'edit' })); assert.equal(last(h).code, 'invalid-request'); assert.equal(h.calls.length, 0);
});
test('snapshot includes all grades and zero-stock rows; drops auth prices and financial state', async () => {
  const h = harness(); await h.controller.approve();
  const out = last(h); assert.equal(out.type, 'SNAPSHOT');
  assert.deepEqual(out.snapshot.rows.map(r => r.key), [key, zeroKey]);
  assert.equal(out.snapshot.rows[1].qty, 0); assert.equal(out.snapshot.rows[0].freeQty, 0);
  assert.equal(out.snapshot.notesBySpec[key], changes[0].before);
  assert.equal(out.snapshot.legacyNotesByThickness['2'], 'legacy synthetic');
  assert.doesNotMatch(JSON.stringify(out), /prices|priceObj|currencies|fx|actor|username|Bearer|synthetic-token|committedQty/);
  assert(h.messages.every(m => m.origin === bridge.LOCAL_ORIGIN)); assert.equal(posts(h).length, 0);
});
test('reversed-axis catalog aliases share one note row while quantities sum exactly', async () => {
  const h = harness();
  h.records.stock.rows.push({ w: 200, l: 100, t: 2, grade: 'A', unit: 'sheet', sku: 'SYNTH-REVERSE', qty: 3, freeQty: 2 });
  h.records.stock.rows.push({ w: 1200, l: 2400, t: 2, grade: 'A', unit: 'sheet', qty: 0, freeQty: 0 });
  h.records.stock.rows.push({ w: 1220, l: 2440, t: 2, grade: 'A', unit: 'sheet', qty: 0, freeQty: 0 });
  await h.controller.approve();
  const snapshot = last(h).snapshot;
  assert.equal(snapshot.rows.length, 4); assert.equal(snapshot.rows[0].qty, 13); assert.equal(snapshot.rows[0].freeQty, 2);
  assert.equal(snapshot.rows[0].sku, 'SYNTH-A, SYNTH-REVERSE'); assert.equal(snapshot.notesBySpec[key], 'before synthetic');
  assert.equal(snapshot.rows.filter(r => [1200, 1220].includes(r.w)).length, 2);
  await h.controller.receive(h.event('STAGE', { requestId, changes })); assert.equal(await h.controller.confirm(), true);
  assert.equal(h.records.stock.rows.length, 5); assert.equal(h.records.stock.rows[2].qty, 3);
});
test('numeric-string dimensions from central catalog normalize without changing raw rows', async () => {
  const h = harness(); h.records.stock.rows[0].w = '0100'; h.records.stock.rows[0].l = '200'; h.records.stock.rows[0].t = '2.00';
  await h.controller.approve();
  const row = last(h).snapshot.rows[0]; assert.equal(row.key, key); assert.equal(row.t, 2); assert.equal(row.w, 100);
  await h.controller.receive(h.event('STAGE', { requestId, changes })); assert.equal(await h.controller.confirm(), true);
  assert.equal(h.records.stock.rows[0].w, '0100'); assert.equal(h.records.stock.rows[0].t, '2.00');
  for (const invalid of ['', ' ', 'Infinity', '-2', null, [], true]) {
    const { stock, catalog } = fixture(); stock.rows[0].t = invalid;
    assert.throws(() => bridge.parseSnapshot(stock, catalog, 1000), /ตรวจสอบไม่ครบ/);
  }
});
test('STAGE previews only; explicit popup confirmation writes one notes-only patch then reads back', async () => {
  const h = harness(), beforeRows = copy(h.records.stock.rows), beforePrices = copy(h.records.catalog.widgetState.privateContent.prices);
  await h.controller.approve(); await h.controller.receive(h.event('STAGE', { requestId, changes }));
  assert.equal(last(h).type, 'STAGED'); assert.equal(posts(h).length, 0);
  assert.equal(await h.controller.confirm(), true); assert.equal(posts(h).length, 1);
  const body = JSON.parse(posts(h)[0].opts.body);
  assert.deepEqual(Object.keys(body).sort(), ['action', 'expectedRevision', 'expectedCatalogRevision', 'notesBySpec'].sort());
  assert.equal(body.action, 'saveSalesNotes'); assert.deepEqual(body.notesBySpec, { [key]: changes[0].after });
  assert.equal(last(h).type, 'SAVED'); assert.equal(last(h).snapshot.notesBySpec[key], changes[0].after);
  assert.deepEqual(h.records.stock.rows, beforeRows); assert.deepEqual(h.records.catalog.widgetState.privateContent.prices, beforePrices);
  assert.equal(h.calls.filter(c => c.opts.method === 'GET').length, 6);
  await h.controller.receive(h.event('STAGE', { requestId, changes })); assert.equal(posts(h).length, 1);
});
test('zero-Physical/zero-Free registered item is editable without creating inventory', async () => {
  const h = harness(); await h.controller.approve();
  await h.controller.receive(h.event('STAGE', { requestId, changes: [{ key: zeroKey, before: '', after: 'zero stock synthetic note' }] }));
  assert.equal(await h.controller.confirm(), true); assert.equal(h.records.stock.rows[1].qty, 0); assert.equal(last(h).snapshot.notesBySpec[zeroKey], 'zero stock synthetic note');
});
test('blank, too long, unknown key, duplicate, changed before and extra-field patches fail closed', async () => {
  for (const input of [[{ ...changes[0], after: '' }], [{ ...changes[0], after: '   ' }], [{ ...changes[0], after: 'x'.repeat(4001) }], [{ ...changes[0], key: '2|A|1200|2400|sheet' }], [changes[0], changes[0]], [{ ...changes[0], before: 'not the current text' }], [{ ...changes[0], qty: 100 }]]) {
    const h = harness(); await h.controller.approve();
    await h.controller.receive(h.event('STAGE', { requestId, changes: input })); assert.equal(last(h).type, 'ERROR'); await h.controller.confirm(); assert.equal(posts(h).length, 0);
  }
});
test('cancel leaves no POST and preserves server data', async () => {
  const h = harness(); await h.controller.approve(); await h.controller.receive(h.event('STAGE', { requestId, changes }));
  assert.equal(h.controller.cancel(), true); assert.equal(last(h).type, 'CANCELLED'); await h.controller.confirm(); assert.equal(posts(h).length, 0);
});
test('fresh before-value conflict blocks stale draft before POST', async () => {
  const h = harness(); await h.controller.approve(); await h.controller.receive(h.event('STAGE', { requestId, changes }));
  h.records.catalog.widgetState.privateContent.notesBySpec[key] = 'another editor'; h.records.catalog.revision++; h.records.stock.revision++; h.records.catalog.catalogRevision++;
  assert.equal(await h.controller.confirm(), false); assert.equal(posts(h).length, 0); assert.equal(last(h).code, 'conflict');
});
test('unrelated note change is preserved using fresh CAS and exact intended before-value', async () => {
  const h = harness(); await h.controller.approve(); await h.controller.receive(h.event('STAGE', { requestId, changes }));
  h.records.catalog.widgetState.privateContent.notesBySpec[zeroKey] = 'another product'; h.records.catalog.revision++; h.records.stock.revision++; h.records.catalog.catalogRevision++;
  assert.equal(await h.controller.confirm(), true); assert.equal(h.records.catalog.widgetState.privateContent.notesBySpec[zeroKey], 'another product');
  assert.equal(JSON.parse(posts(h)[0].opts.body).expectedRevision, 6);
});
test('HTTP CAS rejection sends no retry or fabricated success', async () => {
  const h = harness(); await h.controller.approve(); await h.controller.receive(h.event('STAGE', { requestId, changes }));
  h.setHook(async (url, opts) => opts.method === 'POST' ? response({ ok: false }, 409) : null);
  assert.equal(await h.controller.confirm(), false); assert.equal(posts(h).length, 1); assert.equal(last(h).code, 'conflict'); assert.equal(last(h).retryBlocked, false);
});
test('unknown write blocks duplicate until fresh GET verifies no change; never auto retries', async () => {
  const h = harness(); await h.controller.approve(); await h.controller.receive(h.event('STAGE', { requestId, changes }));
  h.setHook(async (url, opts) => { if (opts.method === 'POST') throw Error('raw sensitive transport detail'); return null; });
  assert.equal(await h.controller.confirm(), false); assert.equal(last(h).code, 'save-uncertain'); assert.equal(last(h).retryBlocked, true);
  await h.controller.confirm(); await h.controller.receive(h.event('STAGE', { requestId: otherId, changes })); assert.equal(posts(h).length, 1);
  await h.controller.refresh(); assert.equal(last(h).code, 'retry-cleared'); assert.equal(last(h).retryBlocked, false); assert.equal(posts(h).length, 1);
  assert.doesNotMatch(JSON.stringify(h.messages), /sensitive transport/);
});
test('lost POST response is reconciled by GET as saved exactly once, never resent', async () => {
  const h = harness(); await h.controller.approve(); await h.controller.receive(h.event('STAGE', { requestId, changes }));
  h.setHook(async (url, opts) => {
    if (opts.method !== 'POST') return null;
    h.records.stock.revision++; h.records.catalog.revision++; h.records.catalog.catalogRevision++;
    h.records.catalog.widgetState.privateContent.notesBySpec[key] = changes[0].after;
    h.records.catalog.widgetState.privateContent.savedAt = '2026-01-01T01:00:00.000Z';
    throw Error('synthetic lost response after commit');
  });
  assert.equal(await h.controller.confirm(), false); assert.equal(last(h).retryBlocked, true);
  await h.controller.refresh(); assert.equal(last(h).type, 'SAVED'); assert.equal(last(h).requestId, requestId);
  assert.equal(last(h).snapshot.notesBySpec[key], changes[0].after); assert.equal(posts(h).length, 1); assert.equal(h.controller.state().retryBlocked, false);
});
test('readback detects price mutation even when desired notes match; remains blocked', async () => {
  const h = harness(); await h.controller.approve(); await h.controller.receive(h.event('STAGE', { requestId, changes }));
  h.setHook(async (url, opts) => { if (opts.method === 'POST') h.records.catalog.widgetState.privateContent.prices[key] = 99; return null; });
  assert.equal(await h.controller.confirm(), false); assert.equal(last(h).code, 'save-uncertain');
  await h.controller.refresh(); assert.equal(last(h).code, 'readback-conflict'); assert.equal(last(h).retryBlocked, true);
});
test('readback detects quantity mutation independent of note correctness', async () => {
  const h = harness(); await h.controller.approve(); await h.controller.receive(h.event('STAGE', { requestId, changes }));
  h.setHook(async (url, opts) => { if (opts.method === 'POST') h.records.stock.rows[0].qty = 11; return null; });
  assert.equal(await h.controller.confirm(), false); assert.equal(last(h).code, 'save-uncertain');
});
test('token changed, logged out or expired cancels connection without leaking snapshot', async () => {
  for (const next of ['', 'different-synthetic-token']) {
    const h = harness(); await h.controller.approve(); h.messages.length = 0; h.setToken(next); h.controller.checkSession();
    assert.equal(last(h).type, 'DISCONNECTED'); assert.equal(h.controller.state().snapshot, null);
    const n = h.calls.length; await h.controller.refresh(); assert.equal(h.calls.length, n); assert.doesNotMatch(JSON.stringify(h.messages), /before synthetic/);
  }
  const h = harness(); h.setHook(async () => response({ ok: false, error: 'raw secret error' }, 401));
  assert.equal(await h.controller.approve(), false); assert.equal(last(h).code, 'auth-expired'); assert.doesNotMatch(JSON.stringify(h.messages), /raw secret/);
});
test('token change while response is in flight cannot forward private response', async () => {
  const h = harness(); h.setHook(async () => { h.setToken('different-synthetic-token'); return response(h.records.stock); });
  assert.equal(await h.controller.approve(), false); assert.equal(last(h).type, 'DISCONNECTED'); assert.doesNotMatch(JSON.stringify(h.messages), /before synthetic|SYNTH-A/);
});
test('unauthenticated approval performs no fetch; expired intent cancels', async () => {
  const h = harness(); h.setToken(''); assert.equal(await h.controller.approve(), false); assert.equal(h.calls.length, 0); assert.equal(last(h).code, 'auth-required');
  h.setNow(2000000); await h.controller.receive(h.event('HELLO')); assert.equal(last(h).code, 'expired');
});
test('intent stores only nonce and expiry, survives login return, rejects arbitrary origins', () => {
  let stored = null, removed = false, replaced = '';
  const win = { opener: {}, location: { origin: bridge.STOCK_ORIGIN, pathname: '/ybfjatetsllnibjirzbr/stock_manager.html', search: '?view=sales&reviewNotes=1', hash: '#review-channel=' + nonce }, sessionStorage: { setItem: (key, value) => { stored = value; }, getItem: () => stored, removeItem: () => { removed = true; stored = null; } }, history: { replaceState: (a, b, value) => { replaced = value; } } };
  const intent = bridge.captureIntent(win); assert.equal(intent.nonce, nonce); assert.deepEqual(Object.keys(JSON.parse(stored)).sort(), ['expiresAt', 'nonce']); assert.doesNotMatch(replaced, /review-channel/);
  win.location.search = '?view=sales'; win.location.hash = ''; assert.equal(bridge.captureIntent(win).nonce, nonce);
  win.location.origin = 'https://example.test'; assert.equal(bridge.captureIntent(win), null);
  win.location.origin = bridge.STOCK_ORIGIN; stored = JSON.stringify({ nonce, expiresAt: Date.now() - 1 }); assert.equal(bridge.captureIntent(win), null); assert.equal(removed, true);
});
test('source has no credential migration, wildcard postMessage or arbitrary API actions', () => {
  const source = fs.readFileSync(new URL('../stock_review_notes_bridge.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage\.(?:getItem|setItem)\(['"]aaf_user|postMessage\([^\n]*['"]\*['"]|action:\s*['"](?:edit|commercial|saveSalesReport|saveSalesPreview)['"]/);
  assert.match(source, /AAFStockAccess\?\.token/); assert.match(source, /action: 'saveSalesNotes'/);
});
