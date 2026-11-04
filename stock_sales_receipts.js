/* Read-only payment projection for the three source-sales display groups.
   Whole-order evidence only: no stock values, rounded K/M, ETD dates or
   historical financial totals are substituted for missing receipt evidence. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AAFSalesReceipts = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const GROUPS = ['confirmed', 'negotiation', 'forecast'];
  const CURRENCIES = ['THB', 'USD'];
  const STATES = ['received', 'expected', 'lc_received', 'lc_pending', 'unconfirmed', 'opportunity'];
  const text = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const hash = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
  const month = value => typeof value === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1900;
  function day(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !month(value.slice(0, 7))) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function timestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !day(value.slice(0, 10))) return null;
    const match = value.match(/T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/);
    if (Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3]) > 59 || match[4] !== 'Z' && (Number(match[6]) > 14 || Number(match[7]) > 59 || Number(match[6]) === 14 && Number(match[7]) !== 0)) return null;
    const n = Date.parse(value); return Number.isFinite(n) ? n : null;
  }
  function cents(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    const n = Math.round(value * 100);
    return Number.isSafeInteger(n) && Math.abs(value * 100 - n) < 1e-5 ? n : null;
  }
  const problem = (code, message, severity = 'warning') => ({code, message, severity});
  const countTemplate = () => ({orders: 0, received: 0, partial: 0, waiting: 0, lcAwaiting: 0, unconfirmed: 0, missingAmount: 0});
  const empty = () => ({status: 'pending', currencies: [], counts: countTemplate(), receiptMonths: [], orders: [], issues: [], checkedAt: null});
  function pendingOrder(id, rows, message) {
    const row = rows[0] || {};
    return {orderId: id, customer: text(row.customer), ref: text(row.ref), status: 'unconfirmed', statusLabel: 'รอยืนยันสถานะเงิน', term: text(row.term), received: null, pending: null, currency: null, receiptEvents: [], issues: [problem('payment-evidence-pending', message, 'error')]};
  }
  function sourceProblems(review, packageValue) {
    const out = [], rm = review?.readModel || {}, source = rm.source || {}, metadata = review?.metadata || {};
    const fail = (code, message) => out.push(problem(code, message, 'error'));
    if (!packageValue || packageValue.version !== 1 || packageValue.status !== 'verified-payment-source') {fail('receipt-source-pending', 'ยังไม่มีหลักฐานสถานะเงินที่ผูกกับชุดหน้า 09 นี้'); return out;}
    const p = packageValue, expected = p.reviewSource || {}, fresh = p.financialSource || {};
    if (!['current-month-order-review', 'dated-order-review'].includes(rm.kind) || rm.kind === 'current-month-order-review' && !['verified', 'verified-sales-only'].includes(rm.status)) fail('review-source-unverified', 'ชุดขายยังไม่ผ่านการตรวจต้นทาง');
    if (!month(metadata.month) || p.month !== metadata.month || source.month !== metadata.month || rm.selectedMonth !== undefined && rm.selectedMonth !== metadata.month) fail('receipt-source-month-mismatch', 'เดือนของหลักฐานเงินไม่ตรงกับชุดขายที่เลือก');
    if (expected.page !== 9 || fresh.page !== 9 || !hash(source.checksum) || expected.checksum !== source.checksum || !hash(expected.rowsChecksum) || !hash(fresh.checksum) || !hash(fresh.rawRowsChecksum)) fail('receipt-source-checksum-mismatch', 'หลักฐานเงินยังไม่ตรงกับตัวตนชุดหน้า 09');
    const original = timestamp(source.capturedAt), bound = timestamp(expected.capturedAt), checked = timestamp(fresh.checkedAt);
    if (original === null || bound !== original || metadata.sourceSalesCapturedAt !== undefined && timestamp(metadata.sourceSalesCapturedAt) !== original || checked === null || checked < original || !day(fresh.asOf) || checked !== null && new Date(checked + 7 * 3600000).toISOString().slice(0, 10) !== fresh.asOf) fail('receipt-capture-mismatch', 'วันเวลาตรวจหลักฐานเงินไม่ครบหรือไม่ตรงชุดต้นทาง');
    if (rm.kind === 'current-month-order-review' && original !== null && new Date(original + 7 * 3600000).toISOString().slice(0, 7) !== metadata.month) fail('receipt-current-capture-month-mismatch', 'ชุดเงินเดือนปัจจุบันใช้หลักฐานขายต่างเดือน');
    if (!Array.isArray(review?.rows) || !Array.isArray(p.orders)) fail('receipt-orders-missing', 'หลักฐานเงินรายออเดอร์ยังไม่ครบ');
    if (Array.isArray(review?.rows) && (fresh.lineCount !== review.rows.length || fresh.orderCount !== new Set(review.rows.map(row => row?.orderId)).size)) fail('receipt-coverage-mismatch', 'จำนวนรายการหลักฐานเงินไม่ตรงกับรายการขาย');
    return out;
  }
  function build(review, groupInput) {
    const groupList = Array.isArray(groupInput) ? groupInput : groupInput?.groups;
    const groups = Array.isArray(groupList) ? groupList.filter(group => GROUPS.includes(group?.id)) : [];
    const result = Object.fromEntries(GROUPS.map(id => [id, empty()]));
    const sourceRows = Array.isArray(review?.rows) ? review.rows : [];
    const rowsByOrder = new Map(), rowsById = new Map(), badOrderIds = new Set();
    for (const row of sourceRows) {
      const id = text(row?.orderId);
      if (!rowsByOrder.has(id)) rowsByOrder.set(id, []);
      rowsByOrder.get(id).push(row);
      if (!text(row?.id) || rowsById.has(row.id)) {badOrderIds.add(id); if (rowsById.has(row?.id)) badOrderIds.add(text(rowsById.get(row.id).orderId));}
      rowsById.set(row?.id, row);
    }
    const membership = new Map(), groupOrders = new Map();
    for (const group of groups) {
      const orders = new Map();
      for (const row of Array.isArray(group.rows) ? group.rows : []) {
        const id = text(row?.orderId) || 'missing-order:' + text(row?.id);
        if (!orders.has(id)) orders.set(id, []);
        orders.get(id).push(row);
        if (!membership.has(id)) membership.set(id, new Set());
        membership.get(id).add(group.id);
        const original = rowsById.get(row?.id);
        if (!original || text(original.orderId) !== id) badOrderIds.add(id);
      }
      groupOrders.set(group.id, orders);
    }
    const packageValue = review?.receiptSummary;
    const commonProblems = sourceProblems(review, packageValue);
    if (!Array.isArray(groupList) || GROUPS.some(id => groups.filter(group => group.id === id).length !== 1)) commonProblems.push(problem('receipt-groups-missing', 'ชุดกลุ่มขายยังไม่ครบ · ไม่แสดงเงินเป็นศูนย์', 'error'));
    const evidence = new Map(), duplicateEvidence = new Set(), eventOwners = new Map(), conflictedEvents = new Set();
    for (const order of Array.isArray(packageValue?.orders) ? packageValue.orders : []) {
      const id = text(order?.orderId);
      if (evidence.has(id)) duplicateEvidence.add(id);
      evidence.set(id, order);
      for (const event of Array.isArray(order?.events) ? order.events : []) {
        if (eventOwners.has(event?.eventId)) {conflictedEvents.add(id); conflictedEvents.add(eventOwners.get(event.eventId));}
        eventOwners.set(event?.eventId, id);
      }
    }
    for (const id of GROUPS) {
      const output = result[id], orders = groupOrders.get(id) || new Map();
      output.counts.orders = orders.size;
      output.issues = commonProblems.map(value => ({...value}));
      output.checkedAt = commonProblems.length ? null : packageValue.financialSource.checkedAt;
      const currencyTotals = new Map(), monthTotals = new Map(), invalidTotals = new Set();
      let validOrders = 0, incomplete = false;
      for (const [orderId, groupRows] of orders) {
        const allRows = rowsByOrder.get(orderId) || [], order = evidence.get(orderId);
        const bindingProblems = [];
        const fail = message => bindingProblems.push(problem('order-receipt-binding-conflict', message, 'error'));
        if (membership.get(orderId)?.size > 1) fail('ออเดอร์เดียวอยู่หลายกลุ่ม · ยังไม่รวมเงินซ้ำ');
        if (badOrderIds.has(orderId) || !allRows.length || allRows.length !== groupRows.length) fail('บรรทัดของออเดอร์ไม่ครบหรือรหัสซ้ำ · รอตรวจหลักฐานเงิน');
        if (!order || duplicateEvidence.has(orderId) || conflictedEvents.has(orderId)) fail('หลักฐานเงินรายออเดอร์หายหรือซ้ำ');
        if (order) {
          const rowIds = Array.isArray(order.rowIds) ? order.rowIds : [];
          if (rowIds.length !== allRows.length || new Set(rowIds).size !== rowIds.length || allRows.some(row => !rowIds.includes(row.id))) fail('หลักฐานเงินไม่ตรงกับบรรทัดขายของออเดอร์นี้');
          if (!hash(order.sourceFingerprint) || !hash(order.sourceFullRowChecksum) || !Array.isArray(order.events) || !order.events.length) fail('หลักฐานเงินรายออเดอร์ยังไม่ครบ');
          if (order.cancelled === true || allRows.some(row => row.cancelled === true)) fail('รายการยกเลิกแยกไว้ ไม่รวมเป็นเงินของกลุ่มขาย');
          for (const row of allRows) {
            for (const key of ['customer', 'ref', 'term', 'payment', 'receiptDateText']) if (own(row, key) && text(row[key]) !== text(order[key])) fail('ข้อความสถานะเงินหรือออเดอร์เปลี่ยนจากชุดที่ตรวจ');
            if (own(row, 'sourceIndex') && row.sourceIndex !== order.sourceIndex || own(row, 'sourceFullRowChecksum') && row.sourceFullRowChecksum !== order.sourceFullRowChecksum) fail('ตัวตนแถวต้นทางไม่ตรงกับหลักฐานเงิน');
          }
        }
        if (commonProblems.length || bindingProblems.length) {
          const item = pendingOrder(orderId, groupRows, commonProblems[0]?.message || bindingProblems[0].message);
          item.issues.push(...bindingProblems); output.orders.push(item); output.counts.unconfirmed++; output.counts.missingAmount++; incomplete = true;
          output.issues.push(...bindingProblems); continue;
        }
        validOrders++;
        const item = {orderId, customer: text(order.customer), ref: text(order.ref), status: 'unconfirmed', statusLabel: '', term: text(order.term), received: null, pending: null, currency: null, receiptEvents: [], issues: []};
        const cashEvents = [], pendingEvents = [], usableEvents = [], installments = new Set();
        let eventConflict = false;
        for (const event of order.events) {
          if (!event || !text(event.eventId) || event.orderKey !== orderId || event.sourceFingerprint !== order.sourceFingerprint || event.sourceOrderMonth !== packageValue.month || !STATES.includes(event.state) || !['single', 'deposit', 'balance'].includes(event.installment) || installments.has(event.installment)) eventConflict = true;
          installments.add(event?.installment);
        }
        if (installments.has('single') && installments.size > 1) eventConflict = true;
        if (eventConflict) item.issues.push(problem('receipt-event-conflict', 'หลักฐานงวดเงินซ้ำหรือไม่ตรงออเดอร์ · ยังไม่รวมเงิน', 'error'));
        for (const event of order.events) {
          if (eventConflict) continue;
          const eventIssues = Array.isArray(event.issues) ? event.issues.map(value => problem(text(value.code) || 'source-payment-issue', text(value.message) || 'หลักฐานเงินบางส่วนยังรอตรวจ', value.severity === 'error' ? 'error' : 'warning')) : [];
          let eventError = event.hasError === true || eventIssues.some(value => value.severity === 'error');
          const dateValid = event.date == null || day(event.date), monthValid = event.month == null || month(event.month);
          if (!dateValid || !monthValid || event.date && event.month !== event.date.slice(0, 7) || event.datePrecision === 'day' && !event.date || event.datePrecision === 'month' && (event.date || !event.month) || event.datePrecision === 'unknown' && (event.date || event.month) || !['day', 'month', 'unknown'].includes(event.datePrecision)) eventError = true;
          if (['received', 'lc_received'].includes(event.state) && (event.date && event.date > packageValue.financialSource.asOf || event.month && event.month > packageValue.financialSource.asOf.slice(0, 7))) {eventError = true; eventIssues.push(problem('received-date-in-future', 'วันที่ระบุว่ารับแล้วอยู่ในอนาคต · แยกไว้รอตรวจ ไม่รวมเป็นรับเงินจริง', 'error'));}
          if (event.state === 'received' && event.dateBasis !== 'actual-source' && event.dateBasis !== 'owner-evidence' && !(event.dateBasis === 'unknown' && !event.date && !event.month)) {eventError = true; eventIssues.push(problem('receipt-date-not-actual', 'วันรับเงินยังไม่ใช่หลักฐานรับเงินจริง', 'error'));}
          if (event.amount != null && cents(event.amount) === null) {eventError = true; eventIssues.push(problem('invalid-receipt-amount', 'จำนวนเงินไม่ถูกต้อง · ไม่ใช้แทนด้วยศูนย์', 'error'));}
          item.issues.push(...eventIssues);
          if (eventError) {item.issues.push(problem('payment-event-excluded', 'งวดเงินมีข้อมูลขัดแย้ง · ยังไม่รวมในยอดรับหรือยอดรอรับ', 'error')); continue;}
          const currency = CURRENCIES.includes(event.currency) ? event.currency : null;
          const known = currency !== null && text(event.proof) && cents(event.amount) !== null;
          const value = {...event, currency, amount: known ? cents(event.amount) / 100 : null};
          usableEvents.push(value);
          if (event.state === 'received') cashEvents.push(value);
          if (['expected', 'lc_received', 'lc_pending'].includes(event.state)) pendingEvents.push(value);
        }
        const hasError = item.issues.some(value => value.severity === 'error');
        const partial = cashEvents.length && (pendingEvents.length || usableEvents.some(event => event.state !== 'received') || cashEvents.some(event => event.installment === 'deposit') && !cashEvents.some(event => event.installment === 'balance') || hasError);
        item.status = cashEvents.length ? partial ? 'partial' : 'received' : usableEvents.some(event => event.state === 'lc_received' || event.state === 'lc_pending') ? 'lcAwaiting' : pendingEvents.length ? 'waiting' : 'unconfirmed';
        if (hasError && !usableEvents.length) item.status = 'unconfirmed';
        item.statusLabel = {received:'รับแล้วตามต้นทาง', partial:'รับบางส่วน · เหลือรอรับ', waiting:'รอรับเงิน', lcAwaiting:'LC · ยังไม่ยืนยันเงินเข้า', unconfirmed:'รอยืนยันสถานะเงิน'}[item.status];
        output.counts[item.status]++;
        const relevant = [...cashEvents, ...pendingEvents];
        const missingAmount = !relevant.length || relevant.some(event => event.amount === null) || usableEvents.some(event => ['unconfirmed', 'opportunity'].includes(event.state)) || hasError;
        if (missingAmount) {output.counts.missingAmount++; incomplete = true;}
        if (item.status === 'unconfirmed' || hasError || cashEvents.some(event => !event.month)) incomplete = true;
        const knownCurrencies = new Set(relevant.map(event => event.currency).filter(Boolean));
        item.currency = knownCurrencies.size === 1 ? [...knownCurrencies][0] : null;
        // A proven subtraction can help follow up an order without claiming
        // that the calculated balance is an acknowledged cash receivable.
        const arithmetic = usableEvents.filter(event => event.installment === 'balance' && event.state === 'unconfirmed' && event.amount !== null && event.currency === order.currency && Array.isArray(event.issues) && event.issues.some(issue => issue.code === 'remaining-cash-receivable-unconfirmed'));
        if (!hasError && arithmetic.length === 1 && cents(order.exactAmount) !== null && CURRENCIES.includes(order.currency) && !!text(order.amountSourceProof) && cashEvents.length && cashEvents.every(event => event.amount !== null && event.currency === order.currency) && cashEvents.reduce((sum, event) => sum + cents(event.amount), 0) + cents(arithmetic[0].amount) === cents(order.exactAmount)) item.arithmeticBalance = {amount:arithmetic[0].amount, currency:order.currency, label:'ยอดตามใบหลังหักมัดจำ · รอยืนยันยอดค้าง'};
        // Zero remaining is evidence, not a fallback: only an exact, proven
        // whole-order total completely covered by actual received installments.
        const fullyPaid = !hasError && item.status === 'received' && cents(order.exactAmount) !== null && CURRENCIES.includes(order.currency) && !!text(order.amountSourceProof) && cashEvents.length === order.events.length && cashEvents.every(event => event.amount !== null && event.currency === order.currency) && cashEvents.reduce((sum, event) => sum + cents(event.amount), 0) === cents(order.exactAmount);
        for (const [side, events] of [['received', cashEvents], ['pending', pendingEvents]]) {
          const values = events.filter(event => event.amount !== null);
          const distinct = new Set(values.map(event => event.currency));
          if (values.length && distinct.size === 1) {
            const total = values.reduce((sum, event) => sum + cents(event.amount), 0);
            if (Number.isSafeInteger(total)) item[side] = total / 100;
            else {incomplete = true; item.issues.push(problem('receipt-total-overflow', 'ยอดเงินเกินขอบเขตที่ตรวจสอบได้', 'error'));}
          }
          for (const currency of CURRENCIES) {
            const known = values.filter(event => event.currency === currency);
            if (!known.length && !events.some(event => event.currency === currency)) continue;
            if (!currencyTotals.has(currency)) currencyTotals.set(currency, {currency, received:null, pending:null, receivedKnownOrders:0, pendingKnownOrders:0});
            const target = currencyTotals.get(currency);
            if (known.length && !invalidTotals.has(currency + ':' + side)) {
              const total = known.reduce((sum, event) => sum + cents(event.amount), 0) + (target[side] === null ? 0 : cents(target[side]));
              if (Number.isSafeInteger(total)) {target[side] = total / 100; target[side + 'KnownOrders']++;}
              else {target[side] = null; target[side + 'KnownOrders'] = 0; invalidTotals.add(currency + ':' + side); incomplete = true; output.issues.push(problem('receipt-total-overflow', 'ยอดเงินเกินขอบเขตที่ตรวจสอบได้', 'error'));}
            }
          }
        }
        if (fullyPaid) {
          item.pending = 0;
          if (!currencyTotals.has(order.currency)) currencyTotals.set(order.currency, {currency:order.currency, received:null, pending:null, receivedKnownOrders:0, pendingKnownOrders:0});
          const target = currencyTotals.get(order.currency);
          if (!invalidTotals.has(order.currency + ':pending')) {if (target.pending === null) target.pending = 0; target.pendingKnownOrders++;}
        }
        for (const event of cashEvents) {
          item.receiptEvents.push({date:event.date || null, month:event.month || null, amount:event.amount, currency:event.currency, label:event.installment === 'deposit' ? 'รับมัดจำ' : event.installment === 'balance' ? 'รับส่วนที่เหลือ' : 'รับเงิน'});
          const key = event.month || null;
          if (!monthTotals.has(key)) monthTotals.set(key, {month:key, orderIds:new Set(), missingIds:new Set(), invalidCurrencies:new Set(), knownAmountByCurrency:{THB:null,USD:null}});
          const target = monthTotals.get(key); target.orderIds.add(orderId);
          if (event.amount === null || !event.currency) target.missingIds.add(orderId);
          else if (!target.invalidCurrencies.has(event.currency)) {
            const total = (target.knownAmountByCurrency[event.currency] === null ? 0 : cents(target.knownAmountByCurrency[event.currency])) + cents(event.amount);
            if (Number.isSafeInteger(total)) target.knownAmountByCurrency[event.currency] = total / 100;
            else {target.knownAmountByCurrency[event.currency] = null; target.invalidCurrencies.add(event.currency); target.missingIds.add(orderId); incomplete = true;}
          }
        }
        output.orders.push(item);
      }
      output.currencies = CURRENCIES.filter(currency => currencyTotals.has(currency)).map(currency => currencyTotals.get(currency));
      output.receiptMonths = [...monthTotals.values()].sort((a, b) => (a.month || '9999').localeCompare(b.month || '9999')).map(value => ({month:value.month, orderCount:value.orderIds.size, knownAmountByCurrency:value.knownAmountByCurrency, missingAmountCount:value.missingIds.size}));
      output.status = commonProblems.length || orders.size && !validOrders ? 'pending' : incomplete ? 'partial' : 'verified';
      if (output.counts.missingAmount) output.issues.push(problem('exact-money-pending', 'แสดงยอดเงินเฉพาะส่วนที่มีหลักฐานจำนวนตรง · รายการขาดจำนวนเงินยังไม่ใช้เป็นศูนย์'));
    }
    return result;
  }
  return {build};
});
