/* Selected-month source-status grouping for display only.
   Never replaces soldGroup, queue, reservations, stock or source records. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AAFSalesGroups = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const unitNames = ['sheet', 'strip'];
  const labels = {
    confirmed: '1 · ขายแล้ว / ออเดอร์ยืนยัน',
    negotiation: '2 · เจรจายังไม่เปิด PI · โอกาสสูง 80%+',
    forecast: '3 · Forecast'
  };
  const clean = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';
  const monthValid = value => typeof value === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1900;
  const quantityValid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
  const bucket = () => ({rows: [], totals: {sheet: 0, strip: 0}, orderCount: 0, lineCount: 0});
  function timestamp(value) {
    if (typeof value !== 'string') return null;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
    if (!match) return null;
    const [, y, m, d, h, minute, s, zone] = match;
    const days = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
    if (Number(y) < 1900 || Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > days || Number(h) > 23 || Number(minute) > 59 || Number(s) > 59) return null;
    if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 14 || Number(zone.slice(4)) > 59 || Number(zone.slice(1, 3)) === 14 && Number(zone.slice(4)) !== 0)) return null;
    const result = Date.parse(value);
    return Number.isFinite(result) ? result : null;
  }
  function bangkokMonth(time) {
    return new Date(time + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
  }
  function statusKind(value) {
    const v = clean(value);
    if (['ยกเลิก', 'cancelled', 'canceled'].includes(v)) return 'cancelled';
    if (['ออก inv', 'ออก invoice', 'issued invoice', 'invoice issued', 'issued-invoice', 'inv'].includes(v)) return 'invoice';
    if (['โหลดแล้ว', 'loaded', 'shipped'].includes(v)) return 'loaded';
    if (['เปิด pi', 'pi', 'opened pi', 'pi opened', 'confirmed pi'].includes(v)) return 'pi';
    if (['มีเรือ', 'vessel', 'vessel confirmed', 'confirmed vessel'].includes(v)) return 'vessel';
    if (['เจรจา', 'negotiation', 'negotiating'].includes(v)) return 'negotiation';
    if (['forecast', 'คาดการณ์'].includes(v)) return 'forecast';
    return v ? 'unknown' : 'missing';
  }
  function sourceClass(row, historical) {
    const status = statusKind(row?.sourceStatus), type = statusKind(row?.sourceType);
    if (row?.cancelled === true || status === 'cancelled' || type === 'cancelled') return {id: 'cancelled'};
    if (status === 'invoice' || status === 'loaded' || ['โหลดแล้ว', 'loaded', 'shipped'].includes(clean(row?.productStatus))) return {id: 'confirmed', loaded: true};
    // A Forecast-origin record can later open PI. Explicit final source status
    // takes precedence over an origin/type label; no document-prefix guessing.
    if (status === 'pi' || status === 'vessel') return {id: 'confirmed', loaded: false};
    if (status === 'forecast') {
      if (['pi', 'vessel', 'invoice', 'loaded'].includes(type)) return {id: 'unclassified', code: 'contradictory-source-status', message: 'สถานะขายและชนิดต้นทางขัดกัน · ยังไม่เดาว่าเปิด PI แล้ว'};
      return {id: 'forecast'};
    }
    if (status === 'negotiation') {
      if (type === 'forecast') return {id: 'forecast'};
      if (['pi', 'vessel', 'invoice', 'loaded'].includes(type)) return {id: 'unclassified', code: 'contradictory-source-status', message: 'สถานะขายและชนิดต้นทางขัดกัน · ยังไม่เดาว่าเปิด PI แล้ว'};
      if (historical && type !== 'negotiation') return {id: 'unclassified', code: 'historical-negotiation-ambiguous', message: 'ชุดย้อนหลังไม่ได้แยกต้นทาง Forecast ออกจากเจรจาครบ · ยังไม่จัดเป็นกลุ่มโอกาสสูง'};
      return {id: 'negotiation'};
    }
    if (status === 'missing') {
      if (type === 'forecast' || type === 'negotiation') return {id: type};
      if (type === 'pi' || type === 'vessel') return {id: 'confirmed', loaded: false};
      if (type === 'invoice' || type === 'loaded') return {id: 'confirmed', loaded: true};
    }
    return {id: 'unclassified', code: 'unclassified-source-status', message: 'สถานะขายต้นทางไม่ครบหรือยังไม่รู้จัก · คงรายการไว้ให้ตรวจ'};
  }
  function hasExistingPaidOrReservationEvidence(row) {
    // This is an exception warning only, never a group classifier or cash value.
    // A generic issued invoice or an LC term alone is not a receipt.
    if (row?.soldGroup === 'paidOrDeposit' || row?.reservationKind === 'sold-unloaded' || row?.reservationKind === 'other') return true;
    if (typeof row?.payment !== 'string') return false;
    return row.payment.split(/\r?\n/).some(part => ['รับเงินแล้ว', 'ชำระแล้ว', 'paid', 'paid in full', 'มัดจำแล้ว', 'มัดจำแล้ว ✓'].includes(clean(part)));
  }
  function orderIdentity(row, month) {
    if (typeof row?.orderId === 'string' && row.orderId.trim()) return 'order:' + row.orderId;
    if (Number.isSafeInteger(row?.sourceIndex) && row.sourceIndex >= 0) return 'source:' + JSON.stringify([row.sourceMonth || month, row.sourceIndex]);
    return null;
  }
  function cancelledQuantity(row) {
    // Current review qty=0 is the active exclusion, not the cancelled source
    // amount. A supplied sourceQty wins, including genuine source zero.
    if (row && Object.prototype.hasOwnProperty.call(row, 'sourceQty')) return row.sourceQty;
    return quantityValid(row?.qty) && row.qty > 0 ? row.qty : null;
  }
  function summarize(target, month, readQuantity = row => row?.qty) {
    const identities = new Set(); let identityMissing = false;
    for (const row of target.rows) {
      const id = orderIdentity(row, month);
      if (id === null) identityMissing = true; else identities.add(id);
      if (!unitNames.includes(row?.unit)) {target.totals.sheet = null; target.totals.strip = null; continue;}
      const qty = readQuantity(row);
      if (!quantityValid(qty)) {target.totals[row.unit] = null; continue;}
      if (target.totals[row.unit] !== null) {
        const sum = target.totals[row.unit] + qty;
        target.totals[row.unit] = quantityValid(sum) ? sum : null;
      }
    }
    target.orderCount = identityMissing ? null : identities.size;
    target.lineCount = target.rows.length;
    return target;
  }
  function build(review) {
    const metadata = review?.metadata || {}, readModel = review?.readModel || {};
    const groups = ['confirmed', 'negotiation', 'forecast'].map(id => ({id, label: labels[id], ...bucket(), loaded: bucket(), waiting: bucket(), issues: []}));
    const byId = Object.fromEntries(groups.map(group => [group.id, group]));
    const cancelled = bucket(), unclassified = bucket(), summary = bucket(), issues = [];
    const rows = Array.isArray(review?.rows) ? review.rows : [];
    const lineIds = new Set(), duplicateIds = new Set();
    for (const row of rows) {
      if (typeof row?.id !== 'string' || !row.id.trim()) continue;
      if (lineIds.has(row.id)) duplicateIds.add(row.id);
      lineIds.add(row.id);
    }
    const month = monthValid(metadata.month) ? metadata.month : null;
    const historical = readModel.kind === 'dated-order-review' || readModel.historical === true;
    const issue = (code, message, rowIndex, extra = {}) => {
      const entry = {code, message, severity: 'error', ...extra};
      if (rowIndex !== undefined) {entry.rowIndex = rowIndex; if (typeof rows[rowIndex]?.id === 'string') entry.rowId = rows[rowIndex].id;}
      issues.push(entry); return entry;
    };
    let provenanceValid = true;
    const provenanceIssue = (code, message) => {provenanceValid = false; issue(code, message);};
    if (!Array.isArray(review?.rows)) provenanceIssue('missing-source-rows', 'ยังไม่มีชุดรายการขายสำหรับจัดกลุ่ม');
    if (!month) provenanceIssue('invalid-source-month', 'เดือนของข้อมูลขายยังไม่ถูกต้อง · ไม่ใช้เดือนอื่นแทน');
    if (!['current-month-order-review', 'dated-order-review'].includes(readModel.kind)) provenanceIssue('unknown-source-kind', 'ยังไม่มีหลักฐานชนิดชุดขายปัจจุบันหรือชุดย้อนหลัง');
    if (readModel.kind === 'current-month-order-review' && !['verified', 'verified-sales-only'].includes(readModel.status)) provenanceIssue('unverified-current-source', 'ข้อมูลขายเดือนปัจจุบันยังไม่ผ่านการตรวจต้นทาง');
    for (const value of [readModel.selectedMonth, readModel.source?.month, review?.financial?.metadata?.month]) {
      if (value !== undefined && (!monthValid(value) || value !== month)) provenanceIssue('source-month-mismatch', 'เดือนที่เลือกกับเดือนของหลักฐานขายไม่ตรงกัน');
    }
    const captures = [readModel.source?.capturedAt, readModel.sourceCapturedAt, metadata.sourceSalesCapturedAt].filter(value => value !== undefined);
    const times = captures.map(timestamp);
    let capturedAt = captures.length && times[0] !== null ? captures[0] : null;
    if (!captures.length || times.some(value => value === null) || times.some(value => value !== times[0])) {capturedAt = null; provenanceIssue('invalid-source-capture', 'วันเวลาที่อ่านต้นทางขายไม่ครบหรือไม่ตรงกัน · ยังไม่อ้างว่าเป็นข้อมูลล่าสุด');}
    if (readModel.kind === 'current-month-order-review' && times[0] !== null && times[0] !== undefined && month && bangkokMonth(times[0]) !== month) provenanceIssue('current-capture-month-mismatch', 'ชุดขายเดือนปัจจุบันใช้เวลาตรวจต้นทางต่างเดือน');
    rows.forEach((row, rowIndex) => {
      if (row?.sourceMonth !== undefined && (!monthValid(row.sourceMonth) || row.sourceMonth !== month)) provenanceIssue('row-source-month-mismatch', 'เดือนของรายการขายไม่ตรงชุดเดือนที่เลือก · คงรายการไว้แต่ยังไม่ยืนยันยอดรวม');
      const classification = sourceClass(row, historical);
      const target = classification.id === 'cancelled' ? cancelled : classification.id === 'unclassified' ? unclassified : byId[classification.id];
      target.rows.push(row);
      if (classification.id !== 'cancelled') summary.rows.push(row);
      if (classification.id === 'confirmed') target[classification.loaded ? 'loaded' : 'waiting'].rows.push(row);
      if (classification.id === 'unclassified') issue(classification.code, classification.message, rowIndex);
      if (duplicateIds.has(row?.id)) {
        const duplicateIssue = issue('duplicate-source-line-id', 'รหัสบรรทัดต้นทางซ้ำ · คงทุกรายการไว้แต่ยังไม่ยืนยันยอดกลุ่มนี้', rowIndex, {groupId: classification.id});
        if (Array.isArray(target.issues)) target.issues.push(duplicateIssue);
      }
      if (!unitNames.includes(row?.unit)) issue('unknown-unit', 'หน่วยรายการไม่ครบ · ไม่รวมแผ่นกับไม้แถบหรือแทนด้วยศูนย์', rowIndex, {groupId: classification.id});
      if (classification.id === 'cancelled') {
        if (!quantityValid(cancelledQuantity(row))) issue('invalid-cancelled-source-quantity', 'จำนวนต้นทางของรายการยกเลิกยังไม่ยืนยัน · ไม่ใช้ยอดปัจจุบันศูนย์แทน', rowIndex, {groupId: classification.id});
      } else if (!quantityValid(row?.qty)) issue('invalid-quantity', 'จำนวนรายการไม่ครบหรือไม่ถูกต้อง · ยังไม่รวมเป็นศูนย์', rowIndex, {groupId: classification.id});
      if (orderIdentity(row, month) === null) issue('missing-order-identity', 'ยังนับจำนวนออเดอร์ไม่ได้ · ไม่เดารวมรายการจากชื่อหรือเลขเอกสาร', rowIndex, {groupId: classification.id});
      if (['negotiation', 'forecast'].includes(classification.id) && hasExistingPaidOrReservationEvidence(row)) {
        target.issues.push(issue('existing-paid-or-reservation', 'มีหลักฐานรับเงิน/จองตามกติกาเดิม · กลุ่มแสดงผลไม่ใช่ยอดจอง', rowIndex, {severity: 'warning', groupId: classification.id}));
      }
    });
    const buckets = [summary, cancelled, unclassified, ...groups.flatMap(group => [group, group.loaded, group.waiting])];
    for (const target of buckets) summarize(target, month, target === cancelled ? cancelledQuantity : undefined);
    if (buckets.some(target => unitNames.some(unit => target.totals[unit] === null)) && !issues.some(entry => ['unknown-unit', 'invalid-quantity', 'invalid-cancelled-source-quantity'].includes(entry.code))) issue('quantity-overflow', 'ยอดรวมเกินขอบเขตที่ตรวจสอบได้ · ยังไม่แสดงเป็นยอดยืนยัน');
    // Repeated exact line identity is a capture-integrity conflict, not a
    // business deduplication rule. Preserve both rows and suppress only buckets
    // containing those rows; distinct anonymous IDs remain distinct records.
    for (const target of buckets) if (target.rows.some(row => duplicateIds.has(row?.id))) {target.totals = {sheet: null, strip: null}; target.orderCount = null;}
    if (!provenanceValid) for (const target of buckets) {target.totals = {sheet: null, strip: null}; target.orderCount = null;}
    return {status: issues.some(entry => entry.severity === 'error') ? 'pending' : 'verified', month, capturedAt, groups, cancelled, unclassified, summary, sourceLineCount: rows.length, issues};
  }
  return {build};
});
