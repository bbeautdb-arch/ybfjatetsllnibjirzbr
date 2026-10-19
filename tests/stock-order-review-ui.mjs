import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../stock_order_review.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../stock_order_review.css', import.meta.url), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const key = '2|A|100|200|sheet';
const money = (THB = 0, USD = 0) => ({ THB, USD });
function fixture() {
  const rows = [1, 2, 3, 4].map(group => ({ id: 'synthetic-line-' + group, orderId: 'synthetic-order-' + group, ref: 'EXAMPLE-' + group, customer: '<synthetic customer>', t: 2, w: 100, l: 200, grade: 'A', unit: 'sheet', qty: 10, loaded: group === 1 ? 10 : 0, allocated: null, shortage: null, unreserved: 0, pendingQty: 10, term: 'TT', commercial: { termKind: 'TT', summaryLabel: 'synthetic payment', notes: [] }, queue: { group, eligible: group === 2 || group === 3, etdISO: '2000-01-01', parts: [], allocated: null, shortage: null } }));
  const groups = {};
  for (let id = 0; id <= 4; id++) groups[id] = { sale: money(10, 20), received: money(0, 5), pending: money(0, 5), unconfirmed: money(10, 10), lineCount: id ? 1 : 4, missingPriceLineCount: 0, unconfirmedLineCount: 1, saleComplete: true, orders: [], receiptEvents: [], issues: [] };
  const stock = { key, noteKey: key, t: 2, w: 100, l: 200, grade: 'A', unit: 'sheet', physical: 12, allocatedOctober: 2, allocatedOther: 0, free: 10, price: 0.106, currency: 'USD', valueNative: 1.06, valueTHB: 2.12, status: 'valued' };
  const view = { rows: [stock], specCount: 1, totals: { sheet: { qty: 10, eq25: 1 }, strip: { qty: 0, eq25: 0 } }, valuation: { knownValueTHB: 2.12, valuedSpecCount: 1, totalSpecCount: 1, complete: true } };
  return { metadata: { month: '2000-01', title: 'Synthetic review only' }, rows, stockPools: [stock], queueReview: { rows, groups: [1, 2, 3, 4].map(id => ({ id, label: 'Synthetic group ' + id })), poolQueues: [], stockBasis: {} }, financial: { metadata: { asOf: '2000-01-01', cashAsOf: '2000-01-01', priceAsOf: '2000-01-01', fx: { rate: 2, date: '2000-01-01' } }, views: { all: { groups }, '2': { groups } }, byRowId: Object.fromEntries(rows.map(r => [r.id, { orderId: r.orderId, group: r.queue.group, sale: { status: 'verified', amount: 1.06, currency: 'USD', unitPrice: 0.106, source: '<synthetic source>' } }])) }, freeStock: { metadata: { reportDate: '2000-01-01', isCurrentQueueFree: false }, rows: [stock], views: { all: view, '2': view } }, trackingImport: { items: [{ key, records: [{ followup: 'synthetic followup', followupBy: 'synthetic user', followupAt: '', excelRow: 1 }], legacyNotes: ['file note'] }] }, reconciliation: { rows: [{ label: 'Synthetic count', unit: 'sheet', previous: 40, current: 40, difference: 0, status: 'equal', note: '<check>' }] } };
}
function snapshot(note = 'before synthetic', canSave = true) {
  return { rows: [{ key, w: 100, l: 200, t: 2, grade: 'A', unit: 'sheet', records: [] }], notesBySpec: { [key]: note }, legacyNotesByThickness: {}, revision: 1, catalogRevision: 1, reportDate: '2000-01-01', readAt: '2000-01-01T00:00:00Z', canSave };
}
const decode = value => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
// A deliberately small DOM double exercises mount/event/state logic without an external browser.
function harness(services = {}) {
  const nodes = new Map();
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.children = []; this.listeners = {}; this.dataset = {}; this.value = ''; this.hidden = false; this.disabled = false; this.classList = { toggle() {} }; this._html = ''; }
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
    dispatch(type) { return Promise.all((this.listeners[type] || []).map(callback => callback({ target: this }))); }
    click() { return this.dispatch('click'); }
    setAttribute(name, value) { this[name] = value; }
    focus() {} scrollIntoView() {} setSelectionRange() {}
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = [...items]; }
    insertBefore(item) { this.children.push(item); }
    get options() { return this.children; }
    set innerHTML(value) { this._html = value; for (const match of value.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) { const element = new Element(match[1]); element.id = match[3]; if (/\bhidden\b/.test(match[2])) element.hidden = true; nodes.set(element.id, element); } }
    get innerHTML() { return this._html; }
    querySelector(selector) { if (selector.startsWith('#')) return nodes.get(selector.slice(1)); if (selector === 'table' || selector === 'tfoot' || selector === 'button') return this._generic ||= new Element(selector); return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
      if (selector === '[data-stock-note]') {
        if (this._inputsFor !== this._html) { this._inputsFor = this._html; this._inputs = [...this._html.matchAll(/<textarea[^>]*data-stock-note="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)].map(match => { const input = new Element('textarea'); input.dataset.stockNote = decode(match[1]); input.value = decode(match[2]); return input; }); }
        return this._inputs || [];
      }
      return [];
    }
  }
  const shadow = new Element('shadow');
  shadow.getElementById = id => nodes.get(id);
  shadow.querySelector = selector => selector.startsWith('#') ? nodes.get(selector.slice(1)) : null;
  shadow.replaceChildren = (...items) => { shadow.children = [...items]; nodes.clear(); };
  const document = { currentScript: { src: 'https://example.test/stock_order_review.js' }, createElement: tag => new Element(tag) };
  const host = { ownerDocument: document, shadowRoot: null, attachShadow() { this.shadowRoot = shadow; return shadow; } };
  const context = { window: { document }, URL, Intl, Map, Set, console };
  vm.runInNewContext(source, context, { filename: 'stock_order_review.js' });
  const data = fixture(), before = JSON.stringify(data);
  const api = context.window.AAFOrderReviewUI.mount(host, data, services);
  return { api, data, before, nodes, shadow, input: () => nodes.get('stock-table').querySelectorAll('[data-stock-note]')[0] };
}

test('public renderer is runtime-only and isolated; no data acquisition or auth/persistence', () => {
  new vm.Script(source);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|postMessage|setInterval)\b|window\.open|__AAF_REVIEW_DATA__|application\/json|localhost|127\.0\.0\.1/);
  assert.match(source, /attachShadow\(\{mode:'open'\}\)/);
  assert.match(css, /:host/); assert.doesNotMatch(css, /:root|\bbody\{/);
});
test('mount renders six cards, all stock rows, generic reconciliation and does not mutate payload', () => {
  const h = harness();
  assert.equal((h.nodes.get('metrics').innerHTML.match(/data-queue-group=/g) || []).length, 6);
  assert.match(h.nodes.get('metrics').innerHTML, /ส่วน USD → ≈ ฿ 40.00/);
  assert.match(h.nodes.get('metrics').innerHTML, /ไม่ใช่ Free หลังคิวใหม่/);
  assert.match(h.nodes.get('stock-table').innerHTML, /synthetic followup/);
  assert.match(h.nodes.get('reconciliation').innerHTML, /&lt;check&gt;/);
  assert.equal(JSON.stringify(h.data), h.before);
  h.api.destroy(); assert.equal(h.shadow.children.length, 0); assert.equal(h.api.hasDirty(), false);
});
test('selected view notifies shared controller with month and preserves drafts through update', () => {
  const seen = [], h = harness({ onViewChange: value => seen.push(copy(value)) });
  h.api.setView({ thickness: 2 });
  assert.deepEqual(seen.at(-1), { month: '2000-01', thickness: '2' });
  const input = h.input(); input.value = 'draft synthetic'; input.dispatch('input');
  assert.equal(h.api.hasDirty(), true);
  h.api.update(copy(h.data));
  assert.equal(h.api.getView().thickness, '2'); assert.equal(h.input().value, 'draft synthetic');
  h.api.destroy();
});
test('stale runtime model displays evidence comparisons without replacing dated values', () => {
  const h = harness(), data = copy(h.data);
  data.readModel = { stale: true, sourceIsLive: false, queueApplied: false, warning: 'synthetic stale evidence', reportDateMatches: false, physicalMatches: false, freeMatches: true, pricesMatch: false, fxMatches: null, reviewStockReportDate: '2000-01-01', currentStockReportDate: '2000-01-02', mismatches: [{ key, reviewPhysical: 12, currentPhysical: null, reviewFree: 10, currentFree: 10 }], priceMismatches: [{ key, reviewPrice: 0.106, reviewCurrency: 'USD', currentPrice: null, currentCurrency: null }] };
  const before = JSON.stringify(data); h.api.update(data);
  assert.match(h.nodes.get('source-warning').textContent, /synthetic stale evidence/);
  assert.match(h.nodes.get('reconciliation').innerHTML, /ยังไม่ยืนยัน/);
  assert.match(h.nodes.get('reconciliation').innerHTML, /US\$ 0.106/);
  assert.match(h.nodes.get('metrics').innerHTML, /2.12/);
  assert.equal(JSON.stringify(data), before); h.api.destroy();
});
test('notes save requires explicit before/after confirmation and verified readback; writes only notes', async () => {
  let remote = snapshot(), writes = [];
  const h = harness({ readNotes: async () => copy(remote), saveNotes: async changes => { writes.push(copy(changes)); remote = snapshot(changes[0].after); return copy(remote); } });
  await new Promise(resolve => setImmediate(resolve));
  h.input().value = '<new synthetic>'; await h.input().dispatch('input');
  await h.nodes.get('notes-stage').click();
  assert.equal(writes.length, 0); assert.match(h.nodes.get('notes-confirmation').innerHTML, /before synthetic/); assert.match(h.nodes.get('notes-confirmation').innerHTML, /&lt;new synthetic&gt;/);
  await h.nodes.get('notes-confirm').click();
  assert.deepEqual(writes, [[{ key, before: 'before synthetic', after: '<new synthetic>' }]]);
  assert.equal(h.api.hasDirty(), false); assert.match(h.nodes.get('notes-status').textContent, /อ่านกลับส่วนกลางตรงครบ/);
  assert.equal(JSON.stringify(h.data), h.before); h.api.destroy();
});
test('changed remote note creates a conflict and blocks saving; blank input never deletes', async () => {
  let remote = snapshot(); const writes = [];
  const h = harness({ readNotes: async () => copy(remote), saveNotes: async changes => { writes.push(changes); return remote; } });
  await new Promise(resolve => setImmediate(resolve));
  h.input().value = 'draft'; await h.input().dispatch('input'); remote = snapshot('changed remotely'); await h.api.refreshNotes();
  assert.equal(h.nodes.get('notes-stage').disabled, true); assert.match(h.nodes.get('stock-table').innerHTML, /changed remotely/); assert.equal(writes.length, 0);
  h.api.destroy();
  const blank = harness({ readNotes: async () => snapshot() }); await new Promise(resolve => setImmediate(resolve));
  blank.input().value = ''; await blank.input().dispatch('input'); assert.equal(blank.nodes.get('notes-stage').disabled, true); blank.api.destroy();
});
test('uncertain write keeps draft and blocks retry until a fresh read; destruction ignores late data', async () => {
  let writes = 0, release;
  const h = harness({ readNotes: async () => snapshot(), saveNotes: async () => { writes++; throw Error('synthetic uncertain write'); } });
  await new Promise(resolve => setImmediate(resolve)); h.input().value = 'draft'; await h.input().dispatch('input'); await h.nodes.get('notes-stage').click(); await h.nodes.get('notes-confirm').click();
  assert.equal(writes, 1); assert.equal(h.api.hasDirty(), true); assert.equal(h.nodes.get('notes-stage').disabled, true); assert.match(h.nodes.get('notes-status').textContent, /โหลดล่าสุด/);
  await h.api.refreshNotes(); assert.equal(writes, 1); h.api.destroy();
  const late = harness({ readNotes: () => new Promise(resolve => { release = resolve; }) }); late.api.destroy(); release(snapshot()); await new Promise(resolve => setImmediate(resolve)); assert.equal(late.shadow.children.length, 0);
});
test('Excel preparation stages notes only, requires preview and confirmation, and rejects stale before text', async () => {
  const writes = [], prepared = []; let stale = false;
  const h = harness({ readNotes: async () => snapshot(), prepareNotesFile: async (file, options) => { prepared.push({ file: file.name, ...copy(options) }); return { canApply: true, changes: [{ key, before: stale ? 'stale' : 'before synthetic', after: 'Excel synthetic' }], issues: [{ message: '<synthetic issue>' }] }; }, saveNotes: async changes => { writes.push(copy(changes)); return snapshot(changes[0].after); } });
  await new Promise(resolve => setImmediate(resolve));
  h.nodes.get('notes-file-column').value = 'AD'; h.nodes.get('notes-file-mode').value = 'append';
  h.nodes.get('notes-file').files = [{ name: 'synthetic.xlsx' }]; await h.nodes.get('notes-file').dispatch('change');
  assert.deepEqual(prepared, [{ file: 'synthetic.xlsx', column: 'AD', mode: 'append' }]);
  assert.equal(writes.length, 0); assert.equal(h.api.hasDirty(), false); assert.match(h.nodes.get('notes-import-preview').innerHTML, /&lt;synthetic issue&gt;/);
  await h.nodes.get('notes-file-stage').click(); assert.equal(h.api.hasDirty(), true); assert.equal(writes.length, 0);
  await h.nodes.get('notes-confirm').click(); assert.deepEqual(writes, [[{ key, before: 'before synthetic', after: 'Excel synthetic' }]]);
  stale = true; await h.nodes.get('notes-file').dispatch('change'); assert.match(h.nodes.get('notes-import-preview').innerHTML, /ยังนำร่างเข้าบันทึกไม่ได้/); assert.equal(writes.length, 1); h.api.destroy();
});
test('unit prices preserve precision, unconfirmed money is not fake unpaid zero, receipt events deduplicate', () => {
  const data = fixture(), nodes = {}, select = { value: 'all' }, notesState = { loaded: true, notes: new Map([[key, '<note>']]), readAt: 'synthetic', drafts: new Map() };
  const document = { getElementById: id => nodes[id] ||= { innerHTML: '', addEventListener() {}, setAttribute() {}, focus() {} } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const context = { data, rows: data.rows, select, document, notesState, uiState: {}, esc, num: Number, fmt: String, fmtEquivalent: String, thick: String, unitLabel: String, dimensions: r => r.w + '×' + r.l };
  const start = source.indexOf('  const finance ='), end = source.indexOf('  const commercialTag =', start);
  const ui = vm.runInNewContext(source.slice(start, end) + '\n({nativeUnitPrice,moneyPartitions,receiptEventMarkup,orderMoneyMarkup,freeCardMarkup,freeNoteMarkup})', context);
  assert.equal(ui.nativeUnitPrice(0.106, 'USD'), 'US$ 0.106');
  assert.match(ui.moneyPartitions({ received: money(), pending: money(), unconfirmed: money(0, 2), unconfirmedLineCount: 1 }), /รอยืนยัน/);
  const event = { id: 'example-event', amount: 1, currency: 'USD', date: '2000-01-01', ref: '<ref>' };
  assert.equal((ui.receiptEventMarkup([event, event]).match(/<li>/g) || []).length, 1);
  for (const row of data.rows) assert.match(ui.orderMoneyMarkup(row), /US\$ 0.106/);
  assert.match(ui.freeNoteMarkup(data.freeStock.rows[0]), /&lt;note&gt;/);
});
