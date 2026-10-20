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
const rawKey='SYNTH-RAW-1';
function trackingSnapshot(value='before followup',canEditFollowup=true,aliases=false){
  const out=snapshot();out.canEditFollowup=canEditFollowup;
  const record=(key,text)=>({rawKey:key,note:'',noteBy:'',noteAt:'',followup:text,followupBy:'server synthetic author',followupAt:'2000-01-01T00:00:00Z'});
  out.rows[0].records=[record(rawKey,value),...(aliases?[record('SYNTH-RAW-REVERSED','second followup')]:[])];return out;
}
const decode = value => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
// A deliberately small DOM double exercises mount/event/state logic without an external browser.
function harness(services = {}) {
  const nodes = new Map(),globalEvents=new Map();
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.children = []; this.listeners = {}; this.dataset = {}; this.value = ''; this.hidden = false; this.disabled = false; this.classList = { toggle() {} }; this._html = ''; }
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
    dispatch(type) { return Promise.all((this.listeners[type] || []).map(callback => callback({ target: this }))); }
    click() { return this.dispatch('click'); }
    setAttribute(name, value) { this[name] = value; }
    focus() {shadow.activeElement=this;} scrollIntoView() {} setSelectionRange(start,end,direction) {this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction;}
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = [...items]; }
    insertBefore(item) { this.children.push(item); }
    get options() { return this.children; }
    set innerHTML(value) { this._html = value; for (const match of value.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) { const element = new Element(match[1]); element.id = match[3]; if (/\bhidden\b/.test(match[2])) element.hidden = true; nodes.set(element.id, element); } }
    get innerHTML() { return this._html; }
    querySelector(selector) { if (selector.startsWith('#')) return nodes.get(selector.slice(1)); if (selector === 'table' || selector === 'tfoot' || selector === 'button') return this._generic ||= new Element(selector); return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
      const attr=selector.match(/^\[(data-(?:stock-note|followup-[\w-]+))\]$/)?.[1];
      if(attr){
        if(this._inputsFor!==this._html){this._inputsFor=this._html;this._inputs={};}
        if(!this._inputs[selector])this._inputs[selector]=[...this._html.matchAll(/<(textarea|button)\b([^>]*)>([\s\S]*?)<\/(?:textarea|button)>/g)].filter(match=>new RegExp('\\b'+attr+'="').test(match[2])).map(match=>{
          const input=new Element(match[1]);input.disabled=/\bdisabled\b/.test(match[2]);
          for(const item of match[2].matchAll(/data-([\w-]+)="([^"]*)"/g))input.dataset[item[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=decode(item[2]);
          input.value=decode(match[3]);return input;
        });
        return this._inputs[selector];
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
  const context = { window: { document,addEventListener:(type,fn)=>globalEvents.set(type,fn),removeEventListener:type=>globalEvents.delete(type) }, URL, Intl, Map, Set, console };
  vm.runInNewContext(source, context, { filename: 'stock_order_review.js' });
  const data = fixture(), before = JSON.stringify(data);
  const api = context.window.AAFOrderReviewUI.mount(host, data, services);
  return { api, data, before, nodes, shadow,globalEvents,input: () => nodes.get('stock-table').querySelectorAll('[data-stock-note]')[0],freeInput:()=>nodes.get('free-detail-panel').querySelectorAll('[data-stock-note]')[0],followups:()=>nodes.get('stock-table').querySelectorAll('[data-followup-edit]'),stockButtons:attribute=>nodes.get('stock-table').querySelectorAll('['+attribute+']') };
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
  const data = fixture(), nodes = {}, select = { value: 'all' }, notesState = { loaded: true, canSave:true,liveRows:new Map([[key,{}]]),notes: new Map([[key, '<note>']]), readAt: 'synthetic', drafts: new Map(),conflicts:new Map() };
  const document = { getElementById: id => nodes[id] ||= { innerHTML: '', addEventListener() {}, setAttribute() {}, focus() {} } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const context = { data, rows: data.rows, select, document, notesState, notesBusy:false,workbookBySpec:new Map(),noteKey:r=>[r.t,r.grade,...[r.w,r.l].sort((a,b)=>a-b),r.unit].join('|'),uiState: {}, esc, num: Number, fmt: String, fmtEquivalent: String, thick: String, unitLabel: String, dimensions: r => r.w + '×' + r.l };
  const start = source.indexOf('  const finance ='), end = source.indexOf('  const commercialTag =', start);
  const noteHelper=source.slice(source.indexOf('  const notesField ='),source.indexOf('  function noteEditorContainers'));
  const ui = vm.runInNewContext(source.slice(start, end)+noteHelper + '\n({nativeUnitPrice,moneyPartitions,receiptEventMarkup,orderMoneyMarkup,freeCardMarkup,freeNoteMarkup})', context);
  assert.equal(ui.nativeUnitPrice(0.106, 'USD'), 'US$ 0.106');
  assert.match(ui.moneyPartitions({ received: money(), pending: money(), unconfirmed: money(0, 2), unconfirmedLineCount: 1 }), /รอยืนยัน/);
  const event = { id: 'example-event', amount: 1, currency: 'USD', date: '2000-01-01', ref: '<ref>' };
  assert.equal((ui.receiptEventMarkup([event, event]).match(/<li>/g) || []).length, 1);
  for (const row of data.rows) assert.match(ui.orderMoneyMarkup(row), /US\$ 0.106/);
  assert.match(ui.freeNoteMarkup(data.freeStock.rows[0]), /&lt;note&gt;/);
});
test('tracking-only top save sends raw-key-only change, verifies metadata, and does not touch other fields',async()=>{
  let remote=trackingSnapshot(),writes=[];remote.canSave=false;
  const h=harness({readNotes:async()=>copy(remote),saveChanges:async payload=>{writes.push(copy(payload));remote.rows[0].records[0].followup=payload.followupChanges[0].after;remote.rows[0].records[0].followupBy='verified server author';remote.rows[0].records[0].followupAt='2000-01-02T01:02:03Z';return copy(remote);}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(h.followups()[0].value,'before followup');assert.equal(h.followups()[0].disabled,false);
  h.followups()[0].value='new followup';await h.followups()[0].dispatch('input');assert.equal(h.api.hasDirty(),true);assert.equal(h.nodes.get('changes-stage').disabled,false);assert.match(h.nodes.get('changes-count').textContent,/ติดตาม 1 แถว/);
  await h.nodes.get('changes-stage').click();assert.equal(writes.length,0);assert.match(h.nodes.get('notes-confirmation').innerHTML,/before followup/);
  await h.nodes.get('notes-confirm').click();assert.deepEqual(writes,[{notesChanges:[],followupChanges:[{rawKey,before:'before followup',after:'new followup'}]}]);assert.equal(h.api.hasDirty(),false);assert.match(h.nodes.get('stock-table').innerHTML,/verified server author/);assert.equal(JSON.stringify(h.data),h.before);h.api.destroy();
});
test('mixed notes plus explicit tracking clear is one confirmed atomic payload; reversed aliases remain separate',async()=>{
  let remote=trackingSnapshot('first',true,true);const writes=[];
  const h=harness({readNotes:async()=>copy(remote),saveChanges:async payload=>{writes.push(copy(payload));for(const change of payload.notesChanges)remote.notesBySpec[change.key]=change.after;for(const change of payload.followupChanges)remote.rows[0].records.find(row=>row.rawKey===change.rawKey).followup=change.after;return copy(remote);}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(h.followups().length,2);assert.equal(h.stockButtons('data-followup-suggest').length,0,'ambiguous aliases never get a chosen workbook suggestion');
  h.input().value='mixed note';await h.input().dispatch('input');h.followups()[0].value='';await h.followups()[0].dispatch('input');h.followups()[1].value='second changed';await h.followups()[1].dispatch('input');
  await h.nodes.get('changes-stage').click();assert.match(h.nodes.get('notes-confirmation').innerHTML,/ล้างข้อความเดิม/);assert.equal(writes.length,0);await h.nodes.get('notes-confirm').click();
  assert.deepEqual(writes,[{notesChanges:[{key,before:'before synthetic',after:'mixed note'}],followupChanges:[{rawKey,before:'first',after:''},{rawKey:'SYNTH-RAW-REVERSED',before:'second followup',after:'second changed'}]}]);assert.equal(h.api.hasDirty(),false);h.api.destroy();
});
test('workbook tracking is not dirty or copied until explicit single-record suggestion',async()=>{
  const h=harness({readNotes:async()=>trackingSnapshot(''),saveChanges:async()=>trackingSnapshot()});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.followups()[0].value,'');assert.equal(h.api.hasDirty(),false);assert.match(h.nodes.get('stock-table').innerHTML,/ข้อมูลจาก Excel เดิม/);
  const button=h.stockButtons('data-followup-suggest')[0];assert(button);await button.click();assert.equal(h.followups()[0].value,'synthetic followup');assert.equal(h.api.hasDirty(),true);await h.nodes.get('changes-stage').click();assert.match(h.nodes.get('notes-confirmation').innerHTML,/\(ว่าง\)/);h.api.destroy();
});
test('missing tracking capability stays disabled, conflicts preserve drafts, and unload guard cleans up',async()=>{
  const denied=harness({readNotes:async()=>trackingSnapshot('protected',false),saveChanges:async()=>{throw Error('must not save');}});await new Promise(resolve=>setImmediate(resolve));assert.equal(denied.followups()[0].disabled,true);denied.followups()[0].value='injected';await denied.followups()[0].dispatch('input');assert.equal(denied.api.hasDirty(),false);assert.match(denied.nodes.get('changes-permission').textContent,/เข้าสู่ระบบบัญชีที่มีสิทธิ์/);denied.api.destroy();
  let remote=trackingSnapshot();const h=harness({readNotes:async()=>copy(remote),saveChanges:async()=>{throw Error('must not save conflict');}});await new Promise(resolve=>setImmediate(resolve));h.followups()[0].value='draft tracking';await h.followups()[0].dispatch('input');h.api.update(copy(h.data));assert.equal(h.followups()[0].value,'draft tracking');
  let prevented=false;const event={preventDefault(){prevented=true;}};h.globalEvents.get('beforeunload')(event);assert.equal(prevented,true);assert.equal(event.returnValue,'');
  remote=trackingSnapshot('remote changed');await h.api.refreshNotes();assert.equal(h.followups()[0].value,'draft tracking');assert.equal(h.nodes.get('changes-stage').disabled,true);assert.match(h.nodes.get('stock-table').innerHTML,/remote changed/);h.api.destroy();assert.equal(h.globalEvents.has('beforeunload'),false);
});
test('failed mixed save retains both drafts and forbids automatic retry',async()=>{
  let calls=0;const h=harness({readNotes:async()=>trackingSnapshot(),saveChanges:async()=>{calls++;throw Error('synthetic denied or uncertain');}});await new Promise(resolve=>setImmediate(resolve));h.input().value='keep note';await h.input().dispatch('input');h.followups()[0].value='keep followup';await h.followups()[0].dispatch('input');await h.nodes.get('changes-stage').click();await h.nodes.get('notes-confirm').click();assert.equal(calls,1);assert.equal(h.api.hasDirty(),true);assert.equal(h.input().value,'keep note');assert.equal(h.followups()[0].value,'keep followup');assert.equal(h.nodes.get('changes-stage').disabled,true);await h.api.refreshNotes();assert.equal(calls,1);h.api.destroy();
});
test('unresolved snapshot preserves matching drafts and retry block until fully verified',async()=>{
  let remote=trackingSnapshot();const h=harness({readNotes:async()=>copy(remote),saveChanges:async()=>{remote=trackingSnapshot('draft followup');remote.notesBySpec[key]='draft note';remote.saveUnresolved=true;return copy(remote);}});
  await new Promise(resolve=>setImmediate(resolve));h.input().value='draft note';await h.input().dispatch('input');h.followups()[0].value='draft followup';await h.followups()[0].dispatch('input');await h.nodes.get('changes-stage').click();await h.nodes.get('notes-confirm').click();
  assert.equal(h.api.hasDirty(),true);assert.equal(h.nodes.get('changes-stage').disabled,true);await h.api.refreshNotes();assert.equal(h.api.hasDirty(),true);assert.match(h.nodes.get('notes-status').textContent,/ยังตรวจไม่ครบ/);
  remote.saveUnresolved=false;await h.api.refreshNotes();assert.equal(h.api.hasDirty(),false);h.api.destroy();
});
test('same-session editing suspension locks controls without losing drafts',async()=>{
  const h=harness({readNotes:async()=>trackingSnapshot(),saveChanges:async()=>trackingSnapshot()});await new Promise(resolve=>setImmediate(resolve));h.followups()[0].value='keep through expiry';await h.followups()[0].dispatch('input');h.api.suspendEditing('synthetic expired session');
  assert.equal(h.api.hasDirty(),true);assert.equal(h.followups()[0].value,'keep through expiry');assert.equal(h.followups()[0].disabled,true);assert.equal(h.nodes.get('changes-stage').disabled,true);await h.api.refreshNotes();assert.equal(h.followups()[0].value,'keep through expiry');assert.equal(h.followups()[0].disabled,false);h.api.destroy();
});
test('Free Stock and registry share one draft, preserve input focus, and save one exact note change',async()=>{
  let remote=snapshot();const writes=[];const h=harness({readNotes:async()=>copy(remote),saveChanges:async payload=>{writes.push(copy(payload));remote=snapshot(payload.notesChanges[0].after);return copy(remote);}});await new Promise(resolve=>setImmediate(resolve));
  await h.nodes.get('free-detail-toggle').click();const free=h.freeInput(),registry=h.input();assert.equal(free.value,'before synthetic');assert.equal(free.disabled,false);free.focus();free.setSelectionRange(4,4,'none');free.value='from Free';await free.dispatch('input');
  assert.equal(h.freeInput(),free,'typing does not rebuild the Free editor');assert.equal(h.input(),registry,'typing does not rebuild registry');assert.equal(registry.value,'from Free');assert.equal(h.shadow.activeElement,free);assert.equal(free.selectionStart,4);assert.equal(writes.length,0);
  registry.focus();registry.value='final from registry';await registry.dispatch('input');assert.equal(free.value,'final from registry');assert.equal(h.shadow.activeElement,registry);assert.match(h.nodes.get('changes-count').textContent,/หมายเหตุ 1 สเปก/);
  assert.equal(h.nodes.get('free-notes-stage').disabled,false);await h.nodes.get('free-notes-stage').click();assert.equal(writes.length,0);await h.nodes.get('notes-confirm').click();assert.deepEqual(writes,[{notesChanges:[{key,before:'before synthetic',after:'final from registry'}],followupChanges:[]}]);assert.equal(h.input().value,'final from registry');assert.equal(h.freeInput().value,'final from registry');assert.equal(h.api.hasDirty(),false);assert.equal(JSON.stringify(h.data),h.before);h.api.destroy();
});
test('Free notes inherit permissions, missing exact spec protection, conflict and failed-save draft retention',async()=>{
  let remote=snapshot();let calls=0;const h=harness({readNotes:async()=>copy(remote),saveChanges:async()=>{calls++;throw Error('synthetic uncertain');}});await new Promise(resolve=>setImmediate(resolve));await h.nodes.get('free-detail-toggle').click();h.freeInput().value='keep Free draft';await h.freeInput().dispatch('input');await h.nodes.get('changes-stage').click();await h.nodes.get('notes-confirm').click();assert.equal(calls,1);assert.equal(h.freeInput().value,'keep Free draft');assert.equal(h.input().value,'keep Free draft');assert.equal(h.api.hasDirty(),true);
  remote=snapshot('remote changed');await h.api.refreshNotes();assert.equal(h.freeInput().value,'keep Free draft');assert.equal(h.input().value,'keep Free draft');assert.equal(h.nodes.get('changes-stage').disabled,true);assert.match(h.nodes.get('free-detail-panel').innerHTML,/remote changed/);
  h.api.suspendEditing('Synthetic session expired');assert.equal(h.freeInput().disabled,true);assert.equal(h.input().disabled,true);h.api.destroy();
  const denied=harness({readNotes:async()=>snapshot('protected',false),saveChanges:async()=>{throw Error('must not write');}});await new Promise(resolve=>setImmediate(resolve));await denied.nodes.get('free-detail-toggle').click();assert.equal(denied.freeInput().disabled,true);denied.freeInput().value='injected';await denied.freeInput().dispatch('input');assert.equal(denied.api.hasDirty(),false);denied.api.destroy();
  const missing=harness({readNotes:async()=>({...snapshot(),rows:[]}),saveChanges:async()=>{throw Error('must not write');}});await new Promise(resolve=>setImmediate(resolve));await missing.nodes.get('free-detail-toggle').click();assert.equal(missing.freeInput().disabled,true);assert.match(missing.nodes.get('free-detail-panel').innerHTML,/ไม่พบสเปก/);missing.api.destroy();
});
