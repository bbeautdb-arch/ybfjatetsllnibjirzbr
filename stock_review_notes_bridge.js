/* Notes-only review connection. Authentication stays on this AAF origin. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    // Shared, pure validators for the same-origin report. No credentials or
    // transport are exported; the localhost channel keeps its original scope.
    root.AAFStockNotesCore = Object.freeze({ parseSnapshot: api.parseSnapshot, validChanges: api.validChanges });
    api.boot(root);
  }
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const PROTOCOL = 'aaf-review-notes-v1';
  const LOCAL_ORIGIN = 'http://127.0.0.1:8766';
  const STOCK_ORIGIN = 'https://bbeautdb-arch.github.io';
  const API = 'https://aaf-grade-insight-2569.bbeautybbsoraai.chatgpt.site/api/aaf/stock';
  const INTENT_KEY = 'aaf_review_notes_intent_v1';
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  const GRADES = new Set(['AV', 'AAA', 'A', 'B', 'F', 'REJ', 'C', 'UN', 'CTS']);
  const messages = {
    'approval-required': 'กรุณาอนุญาตเชื่อมหมายเหตุในหน้าต่าง AAF นี้ก่อน',
    'auth-required': 'กรุณาเข้าสู่ระบบ AAF ด้วยตัวเอง แล้วกลับมาอนุญาตเชื่อมหมายเหตุ',
    'auth-expired': 'สิทธิ์ AAF หมดอายุ กรุณาเข้าสู่ระบบใหม่ด้วยตัวเอง',
    'permission-denied': 'บัญชีนี้ยังไม่มีสิทธิ์อ่านหรือบันทึกหมายเหตุฝ่ายขาย',
    'session-changed': 'บัญชีหรือเซสชันเปลี่ยนแล้ว ยกเลิกการเชื่อมต่อเพื่อป้องกันข้อมูลข้ามบัญชี',
    'disconnected': 'ยกเลิกการเชื่อมหมายเหตุแล้ว',
    'expired': 'การเชื่อมต่อครบ 30 นาทีแล้ว กรุณาเปิดการเชื่อมใหม่',
    'invalid-request': 'รูปแบบคำขอหมายเหตุไม่ถูกต้อง ยังไม่ได้บันทึก',
    'read-failed': 'อ่านข้อมูลส่วนกลางไม่สำเร็จ กรุณาลองโหลดใหม่',
    'invalid-snapshot': 'ข้อมูลทะเบียนหรือหมายเหตุส่วนกลางยังตรวจสอบไม่ครบ',
    'conflict': 'ข้อมูลหมายเหตุเปลี่ยนจากที่เริ่มแก้ กรุณาเปรียบเทียบใหม่ ยังไม่ได้เขียนทับ',
    'busy': 'มีรายการรอยืนยันหรือกำลังบันทึก กรุณาตรวจหน้าต่าง AAF นี้ก่อน',
    'save-rejected': 'ระบบปฏิเสธการบันทึกหมายเหตุ ยังไม่ได้ยืนยันผลสำเร็จ',
    'save-uncertain': 'ยังยืนยันผลบันทึกไม่ได้ ห้ามส่งซ้ำ ให้โหลดส่วนกลางเพื่อตรวจผลก่อน',
    'retry-cleared': 'ตรวจส่วนกลางแล้วหมายเหตุยังเป็นค่าเดิม กรุณาตรวจร่างและส่งมายืนยันใหม่',
    'readback-conflict': 'ข้อมูลหลังบันทึกไม่ตรงกับที่คาด ต้องตรวจร่างกับส่วนกลางก่อนทำต่อ'
  };
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clone = v => JSON.parse(JSON.stringify(v));
  const equal = (a, b) => {
    if (a === b) return true;
    if (!object(a) && !Array.isArray(a) || !object(b) && !Array.isArray(b) || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
  };
  const exactKeys = (v, keys) => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
  const fail = code => { throw Object.assign(new Error(messages[code] || messages['read-failed']), { code }); };
  const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const dimension = v => (typeof v === 'number' || typeof v === 'string' && /^\d+(?:\.\d+)?$/.test(v)) && positive(Number(v));
  const qty = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const integer = v => Number.isSafeInteger(v) && v >= 0;
  const keyOf = r => [Number(r.t), r.grade, Math.min(Number(r.w), Number(r.l)), Math.max(Number(r.w), Number(r.l)), r.unit].join('|');
  const sourceRecord = r => {
    // Keep the server's exact raw-row identity. Do not replace a reversed alias
    // with the shared-note key or pick one alias's tracking as the winner.
    if (typeof r.key !== 'string' || r.key !== `w${Number(r.w)}_l${Number(r.l)}_t${Number(r.t)}_g${r.grade}`) fail('invalid-snapshot');
    const result = { rawKey: r.key };
    for (const field of ['note', 'noteBy', 'noteAt', 'followup', 'followupBy', 'followupAt']) {
      const value = r[field];
      if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > 4000)) fail('invalid-snapshot');
      result[field] = value == null ? '' : value;
    }
    return result;
  };
  function canonicalKey(key) {
    if (typeof key !== 'string') return false;
    const p = key.split('|');
    return p.length === 5 && [p[0], p[2], p[3]].every(n => n !== '' && positive(Number(n))) && GRADES.has(p[1]) && ['sheet', 'strip'].includes(p[4]) && key === keyOf({ t: p[0], grade: p[1], w: p[2], l: p[3], unit: p[4] });
  }
  function parseSnapshot(stock, catalog, now) {
    if (!stock?.ok || !catalog?.ok || !integer(stock.revision) || stock.revision !== catalog.revision || !integer(catalog.catalogRevision) || !/^\d{4}-\d{2}-\d{2}$/.test(stock.report?.reportDate || '') || stock.report.reportDate !== catalog.stockReportDate || !Array.isArray(stock.rows) || !stock.rows.length || stock.rows.length > 2000) fail('invalid-snapshot');
    const p = catalog.widgetState?.privateContent;
    if (!object(p) || !object(p.prices) || !object(p.currencies) || !object(p.notesByThickness) || (p.notesBySpec !== undefined && !object(p.notesBySpec))) fail('invalid-snapshot');
    const grouped = new Map();
    for (const r of stock.rows) {
      if (!object(r) || !['w', 'l', 't'].every(k => dimension(r[k])) || !GRADES.has(r.grade) || !['sheet', 'strip'].includes(r.unit) || !qty(r.qty) || !qty(r.freeQty)) fail('invalid-snapshot');
      const key = keyOf(r);
      if (!grouped.has(key)) grouped.set(key, { key, w: Math.min(Number(r.w), Number(r.l)), l: Math.max(Number(r.w), Number(r.l)), t: Number(r.t), grade: r.grade, unit: r.unit, qty: 0, freeQty: 0, skus: new Set(), records: [] });
      const row = grouped.get(key); row.qty += r.qty; row.freeQty += r.freeQty;
      if (!qty(row.qty) || !qty(row.freeQty)) fail('invalid-snapshot');
      row.records.push(sourceRecord(r));
      if (typeof r.sku === 'string' && r.sku) row.skus.add(r.sku);
    }
    // Reversed axes are one notes identity. Aggregate only exact dimensions;
    // retain raw rows privately for unchanged-stock readback after a note save.
    const rows = [...grouped.values()].map(({ skus, ...r }) => ({ ...r, ...(skus.size ? { sku: [...skus].join(', ') } : {}) }));
    const keys = new Set(grouped.keys());
    const notesBySpec = {};
    for (const [key, value] of Object.entries(p.notesBySpec || {})) {
      if (!canonicalKey(key) || typeof value !== 'string' || value.length > 4000) fail('invalid-snapshot');
      if (keys.has(key)) notesBySpec[key] = value;
    }
    const legacyNotesByThickness = {};
    for (const [key, value] of Object.entries(p.notesByThickness)) {
      if (!positive(Number(key)) || String(Number(key)) !== key || typeof value !== 'string' || value.length > 4000) fail('invalid-snapshot');
      legacyNotesByThickness[key] = value;
    }
    return { snapshot: { rows, notesBySpec, legacyNotesByThickness, revision: stock.revision, catalogRevision: catalog.catalogRevision, reportDate: stock.report.reportDate, readAt: new Date(now).toISOString(), canSave: catalog.permissions?.pricesAndNotes === true, canEditFollowup: stock.permissions?.followup === true }, catalog: clone(catalog), stock: clone(stock) };
  }
  function validChanges(changes, snapshot) {
    if (!Array.isArray(changes) || !changes.length || changes.length > 2000 || !snapshot.canSave) fail('invalid-request');
    const known = new Set(snapshot.rows.map(r => r.key)), seen = new Set();
    return changes.map(c => {
      if (!exactKeys(c, ['key', 'before', 'after']) || !canonicalKey(c.key) || !known.has(c.key) || seen.has(c.key) || typeof c.before !== 'string' || c.before.length > 4000 || typeof c.after !== 'string' || !c.after.trim() || c.after.length > 4000 || c.before === c.after) fail('invalid-request');
      seen.add(c.key);
      if (c.before !== (snapshot.notesBySpec[c.key] || '')) fail('conflict');
      return clone(c);
    });
  }
  function createController(env) {
    if (!UUID.test(env.nonce || '') || !env.opener) throw Error('Invalid review channel');
    let approved = false, stopped = false, busy = false, auth = '', latest = null, stage = null, uncertain = null;
    const sentRequests = new Set();
    const state = () => ({ approved, stopped, busy, snapshot: latest?.snapshot ? clone(latest.snapshot) : null, stage: stage ? clone(stage) : null, retryBlocked: !!uncertain });
    const update = () => env.onState?.(state());
    const send = (type, data = {}) => env.send({ protocol: PROTOCOL, nonce: env.nonce, type, ...data }, LOCAL_ORIGIN);
    const report = (code, requestId) => { send('ERROR', { ...(requestId ? { requestId } : {}), code, message: messages[code] || messages['read-failed'], retryBlocked: !!uncertain }); env.onError?.(messages[code] || messages['read-failed'], code); update(); };
    function disconnect(code = 'disconnected') {
      if (stopped) return;
      approved = false; stopped = true; auth = ''; latest = null; stage = null; uncertain = null;
      env.clearIntent?.(); send('DISCONNECTED', { code, message: messages[code] || messages.disconnected }); env.onError?.(messages[code] || messages.disconnected, code); update();
    }
    function guard() {
      if (stopped) fail('disconnected');
      if (env.now() >= env.expiresAt) { disconnect('expired'); fail('expired'); }
      if (!approved) fail('approval-required');
      const token = env.getToken();
      if (!token || token !== auth) { disconnect('session-changed'); fail('session-changed'); }
      if (env.isOpenerClosed?.()) { disconnect(); fail('disconnected'); }
    }
    async function request(suffix = '', body = null) {
      guard();
      let response;
      try { response = await env.fetch(API + suffix, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { Authorization: 'Bearer ' + auth, ...(body ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
      catch { fail(body ? 'save-uncertain' : 'read-failed'); }
      guard();
      if (response.status === 401 || response.status === 403) { const code = response.status === 401 ? 'auth-expired' : 'permission-denied'; disconnect(code); fail(code); }
      if (response.status === 409 || response.status === 412) fail('conflict');
      if (body && [400, 422].includes(response.status)) fail('save-rejected');
      let data;
      try { data = await response.json(); } catch { fail(body ? 'save-uncertain' : 'read-failed'); }
      guard();
      if (!response.ok || !data?.ok) fail(body ? 'save-uncertain' : 'read-failed');
      return data;
    }
    async function readCurrent() {
      for (let attempt = 0; attempt < 2; attempt++) {
        const stock = await request(), catalog = await request('?view=salesReport&catalogOnly=1');
        if (stock.revision !== catalog.revision && attempt === 0) continue;
        return parseSnapshot(stock, catalog, env.now());
      }
      fail('read-failed');
    }
    function expectedCatalog(before, changes, savedAt) {
      const p = before.catalog.widgetState.privateContent;
      return { ...clone(p), notesBySpec: { ...(p.notesBySpec || {}), ...Object.fromEntries(changes.map(c => [c.key, c.after])) }, savedAt };
    }
    function verifiedWrite(before, after, changes) {
      const p = after.catalog.widgetState.privateContent;
      return after.snapshot.revision === before.snapshot.revision + 1 && after.snapshot.catalogRevision === before.snapshot.catalogRevision + 1 && typeof p.savedAt === 'string' && Number.isFinite(Date.parse(p.savedAt)) && equal(p, expectedCatalog(before, changes, p.savedAt)) && equal(after.stock.rows, before.stock.rows) && after.snapshot.reportDate === before.snapshot.reportDate;
    }
    async function refresh() {
      if (busy) return false;
      busy = true; update();
      try {
        guard();
        const fresh = await readCurrent();
        latest = fresh;
        if (uncertain) {
          const pending = uncertain;
          if (verifiedWrite(pending.before, fresh, pending.changes)) {
            uncertain = null; stage = null;
            send('SAVED', { requestId: pending.requestId, snapshot: fresh.snapshot });
          } else if (pending.changes.every(c => (fresh.snapshot.notesBySpec[c.key] || '') === c.before) && fresh.snapshot.revision === pending.before.snapshot.revision && fresh.snapshot.catalogRevision === pending.before.snapshot.catalogRevision) {
            uncertain = null; stage = null; report('retry-cleared', pending.requestId);
          } else {
            send('SNAPSHOT', { snapshot: fresh.snapshot }); report('readback-conflict', pending.requestId);
          }
        } else send('SNAPSHOT', { snapshot: fresh.snapshot });
        return true;
      } catch (e) { if (!stopped) report(e.code || 'read-failed', uncertain?.requestId); return false; }
      finally { busy = false; update(); }
    }
    async function approve() {
      if (stopped || approved) return false;
      if (env.now() >= env.expiresAt) { disconnect('expired'); return false; }
      auth = env.getToken();
      if (!auth) { report('auth-required'); return false; }
      approved = true; send('READY', { approved: true }); update();
      return refresh();
    }
    async function receive(event) {
      if (stopped || event.origin !== LOCAL_ORIGIN || event.source !== env.opener) return false;
      const data = event.data;
      if (!object(data) || data.protocol !== PROTOCOL || data.nonce !== env.nonce || !['HELLO', 'REFRESH', 'STAGE'].includes(data.type)) return false;
      const allowed = data.type === 'STAGE' ? ['protocol', 'nonce', 'type', 'requestId', 'changes'] : ['protocol', 'nonce', 'type'];
      if (!exactKeys(data, allowed)) { report('invalid-request'); return false; }
      if (env.now() >= env.expiresAt) { disconnect('expired'); return false; }
      if (data.type === 'HELLO') { send('READY', { approved }); if (approved && !busy && !stage && !uncertain) await refresh(); return true; }
      if (!approved) { report('approval-required', data.type === 'STAGE' && UUID.test(data.requestId || '') ? data.requestId : undefined); return false; }
      try { guard(); } catch (e) { if (!stopped) report(e.code); return false; }
      if (data.type === 'REFRESH') return refresh();
      if (!UUID.test(data.requestId || '')) { report('invalid-request'); return false; }
      if (busy || stage || uncertain || sentRequests.has(data.requestId)) { report('busy', data.requestId); return false; }
      try {
        if (!latest) fail('read-failed');
        const changes = validChanges(data.changes, latest.snapshot);
        stage = { requestId: data.requestId, changes };
        send('STAGED', { requestId: data.requestId, count: changes.length }); update(); return true;
      } catch (e) { report(e.code || 'invalid-request', data.requestId); return false; }
    }
    async function confirm() {
      if (busy || uncertain || !stage) return false;
      const pending = clone(stage);
      busy = true; update();
      try {
        guard();
        const fresh = await readCurrent();
        validChanges(pending.changes, fresh.snapshot);
        latest = fresh;
        const body = { action: 'saveSalesNotes', expectedRevision: fresh.snapshot.revision, expectedCatalogRevision: fresh.snapshot.catalogRevision, notesBySpec: Object.fromEntries(pending.changes.map(c => [c.key, c.after])) };
        sentRequests.add(pending.requestId);
        uncertain = { ...pending, before: fresh };
        let saved;
        try { saved = await request('', body); }
        catch (e) {
          if (['conflict', 'save-rejected'].includes(e.code)) uncertain = null;
          throw e;
        }
        if (saved.revision !== fresh.snapshot.revision + 1 || saved.catalogRevision !== fresh.snapshot.catalogRevision + 1) fail('save-uncertain');
        const verified = await readCurrent();
        if (!verifiedWrite(fresh, verified, pending.changes)) fail('save-uncertain');
        latest = verified; stage = null; uncertain = null;
        send('SAVED', { requestId: pending.requestId, snapshot: verified.snapshot }); return true;
      } catch (e) {
        if (!uncertain) stage = null;
        if (!stopped) report(uncertain ? 'save-uncertain' : (e.code || 'save-rejected'), pending.requestId);
        return false;
      } finally { busy = false; update(); }
    }
    function cancel() {
      if (busy || uncertain || !stage) return false;
      const requestId = stage.requestId; stage = null; send('CANCELLED', { requestId }); update(); return true;
    }
    function checkSession() { if (!approved || stopped) return; try { guard(); } catch (e) { if (!stopped) report(e.code); } }
    return { receive, approve, refresh, confirm, cancel, disconnect, checkSession, state };
  }
  function captureIntent(win) {
    if (win.location.origin !== STOCK_ORIGIN || win.location.pathname !== '/ybfjatetsllnibjirzbr/stock_manager.html' || !win.opener) return null;
    const now = Date.now(), match = /^#review-channel=([a-f0-9-]+)$/i.exec(win.location.hash || '');
    const requested = new URLSearchParams(win.location.search).get('reviewNotes') === '1';
    let intent = null;
    if (requested && match && UUID.test(match[1])) {
      intent = { nonce: match[1], expiresAt: now + 30 * 60 * 1000 };
      try { win.sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent)); } catch {}
      win.history.replaceState(null, '', win.location.pathname + win.location.search);
    } else {
      try {
        const value = JSON.parse(win.sessionStorage.getItem(INTENT_KEY) || 'null');
        if (exactKeys(value, ['nonce', 'expiresAt']) && UUID.test(value.nonce || '') && Number.isSafeInteger(value.expiresAt) && value.expiresAt > now && value.expiresAt <= now + 30 * 60 * 1000) intent = value;
        else win.sessionStorage.removeItem(INTENT_KEY);
      } catch {}
    }
    return intent;
  }
  function boot(win) {
    if (!win?.document) return;
    // Capture only intent synchronously in <head>, before existing login redirects.
    const intent = captureIntent(win);
    if (!intent) return;
    const start = () => {
      const doc = win.document, opener = win.opener;
      if (!opener) return;
      const panel = doc.createElement('section');
      panel.setAttribute('aria-label', 'เชื่อมหมายเหตุและอ่านการติดตามกับหน้าตรวจสต๊อกส่วนตัว');
      panel.style.cssText = 'position:fixed;z-index:2147483000;top:12px;right:12px;width:min(620px,calc(100vw - 24px));max-height:90vh;overflow:auto;padding:18px;border:2px solid #0f766e;border-radius:12px;background:#fff;color:#102b39;box-shadow:0 6px 36px #0005;font:14px/1.6 system-ui,sans-serif';
      const make = (tag, text) => { const el = doc.createElement(tag); if (text) el.textContent = text; return el; };
      const title = make('h2', 'หมายเหตุสินค้าและการติดตาม · หน้าตรวจสต๊อกส่วนตัว');
      title.style.cssText = 'font-size:18px;margin:0 0 8px';
      const intro = make('p', 'อนุญาตให้หน้าตรวจที่ http://127.0.0.1:8766 อ่านทะเบียนสินค้า หมายเหตุร่วมกับ Free Stock และข้อความติดตามการขายพร้อมผู้ติดตาม/เวลาติดตาม ไม่ส่งรหัสเข้าสู่ระบบหรือราคาไปยังหน้านั้น การติดตามอ่านอย่างเดียว การบันทึกยังทำได้เฉพาะหมายเหตุสินค้าและต้องยืนยันในหน้าต่าง AAF นี้ทุกครั้ง');
      const status = make('p', 'ยังไม่เชื่อมต่อ · ยังไม่ได้อ่านหรือส่งข้อมูลส่วนกลาง'); status.setAttribute('role', 'status');
      const controls = make('div'); controls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
      const approve = make('button', 'อนุญาตเชื่อมหมายเหตุและอ่านการติดตาม'), refresh = make('button', 'โหลดหมายเหตุและการติดตามล่าสุด'), disconnect = make('button', 'ตัดการเชื่อมต่อ');
      for (const b of [approve, refresh, disconnect]) { b.type = 'button'; b.style.cssText = 'padding:9px 12px;border:1px solid #6b8795;border-radius:6px;background:#f0f8f7;color:#102b39;cursor:pointer'; }
      const login = make('a', 'เข้าสู่ระบบ AAF ด้วยตัวเอง'); login.href = 'login.html?next=stock-sales'; login.style.cssText = 'display:block;margin:8px 0;color:#075985';
      const preview = make('div'), save = make('button', 'ยืนยันบันทึกเฉพาะหมายเหตุ'), cancel = make('button', 'ยกเลิกร่างนี้');
      save.type = cancel.type = 'button'; save.style.cssText = 'padding:10px;margin-right:8px;background:#0f766e;color:white;border:0;border-radius:6px'; cancel.style.cssText = 'padding:10px;border:1px solid #aaa;border-radius:6px';
      const actions = make('div'); actions.append(save, cancel); controls.append(approve, refresh, disconnect);
      panel.append(title, intro, controls, login, status, preview, actions); doc.body.append(panel);
      let lastStage = null, lastError = '';
      const controller = createController({
        nonce: intent.nonce, expiresAt: intent.expiresAt, opener, now: () => Date.now(), fetch: win.fetch.bind(win),
        getToken: () => win.AAFStockAccess?.token?.() || '', isOpenerClosed: () => !win.opener || win.opener !== opener || opener.closed,
        clearIntent: () => { try { win.sessionStorage.removeItem(INTENT_KEY); } catch {} },
        send: (message, origin) => { if (['SNAPSHOT', 'SAVED', 'STAGED'].includes(message.type)) lastError = ''; try { opener.postMessage(message, origin); } catch {} },
        onError: (message, code) => { lastError = message; status.textContent = message; if (code === 'auth-expired') login.href = 'login.html?reauth=1&next=stock-sales'; },
        onState: s => {
          approve.disabled = s.approved || s.stopped || s.busy; refresh.disabled = !s.approved || s.stopped || s.busy; disconnect.disabled = s.stopped;
          login.hidden = s.approved && !s.stopped;
          actions.hidden = !s.stage; save.disabled = !s.stage || s.busy || s.retryBlocked; cancel.disabled = !s.stage || s.busy || s.retryBlocked;
          if (s.stage?.requestId !== lastStage) {
            preview.replaceChildren(); lastStage = s.stage?.requestId || null;
            if (s.stage) {
              preview.append(make('h3', 'ตรวจหมายเหตุก่อนบันทึก · ' + s.stage.changes.length + ' สินค้า'));
              for (const c of s.stage.changes) {
                const box = make('div'); box.style.cssText = 'border:1px solid #d2e2e5;border-radius:6px;padding:10px;margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere';
                box.append(make('strong', c.key), make('p', 'เดิม: ' + (c.before || '(ว่าง)')), make('p', 'ใหม่: ' + c.after)); preview.append(box);
              }
              status.textContent = 'รอยืนยันใน AAF · จะเขียนเฉพาะหมายเหตุ ไม่แก้ยอดสต๊อก ยอดจอง หรือราคา';
            }
          }
          if (s.stopped) { preview.replaceChildren(); status.textContent = lastError || 'ตัดการเชื่อมต่อแล้ว · กดปิดแผงนี้หรือเริ่มใหม่จากหน้าตรวจ'; disconnect.disabled = false; disconnect.textContent = 'ปิดแผงนี้'; }
          else if (s.busy) status.textContent = 'กำลังตรวจข้อมูลส่วนกลาง…';
          else if (lastError) status.textContent = lastError;
          else if (s.snapshot && !s.stage && !s.retryBlocked) status.textContent = 'อ่านหมายเหตุและการติดตามส่วนกลางล่าสุดแล้ว · ' + s.snapshot.rows.length + ' สเปก · การติดตามอ่านอย่างเดียว · รุ่น ' + s.snapshot.revision + ' · ' + new Date(s.snapshot.readAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        }
      });
      approve.onclick = () => { lastError = ''; return controller.approve(); }; refresh.onclick = () => { lastError = ''; return controller.refresh(); }; save.onclick = () => { lastError = ''; return controller.confirm(); }; cancel.onclick = () => { lastError = ''; return controller.cancel(); };
      disconnect.onclick = () => { if (controller.state().stopped) panel.remove(); else controller.disconnect(); };
      win.addEventListener('message', event => { void controller.receive(event); });
      const sessionTimer = win.setInterval(() => controller.checkSession(), 1000);
      const pollTimer = win.setInterval(() => { const s = controller.state(); if (s.approved && !s.stopped && !s.busy && !s.stage) void controller.refresh(); }, 30000);
      win.addEventListener('pagehide', () => { win.clearInterval(sessionTimer); win.clearInterval(pollTimer); });
      refresh.disabled = true; actions.hidden = true;
    };
    if (win.document.readyState === 'loading') win.document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  }
  return { PROTOCOL, LOCAL_ORIGIN, STOCK_ORIGIN, API, INTENT_KEY, canonicalKey, parseSnapshot, validChanges, createController, captureIntent, boot };
});
