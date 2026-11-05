/* Current-month presentation only. Both upper cards reuse the exact Section02
   source-status and receipt projections; warehouse reservation rules stay separate. */
(function (root, factory) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const api = factory(
    () => node && typeof require === 'function' ? require('./stock_sales_groups.js') : root?.AAFSalesGroups,
    () => node && typeof require === 'function' ? require('./stock_sales_receipts.js') : root?.AAFSalesReceipts,
    () => node && typeof require === 'function' ? require('./stock_sales_thickness.js') : root?.AAFSalesThickness
  );
  if (node) module.exports = api;
  else root.AAFCurrentSalesGroups = api;
})(typeof window === 'undefined' ? null : window, function (getGroups, getReceipts, getThickness) {
  'use strict';
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const units = value => value && ['sheet', 'strip'].every(key => count(value[key]));
  const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const bangkokMonth = now => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit'}).formatToParts(new Date(now)).filter(part => ['year', 'month'].includes(part.type)).map(part => [part.type, part.value]).reduce((out, [key, value]) => ({...out, [key]: value}), {});
  function period(now) {
    const parts = bangkokMonth(now), month = parts.year + '-' + parts.month;
    const monthLabel = new Intl.DateTimeFormat('th-TH', {timeZone: 'Asia/Bangkok', year: 'numeric', month: 'long'}).format(new Date(month + '-01T00:00:00+07:00'));
    return {month, monthLabel};
  }
  const pending = (now, reason) => ({version: 1, status: 'pending', ...period(now), reason: reason || 'รอชุดหน้า 09 เดือนปัจจุบันที่ตรงกับหัวข้อ 02 · ไม่ใช้ยอดเก่าหรือเดือนอื่นแทน'});

  // Exact source dimensions, not allocation pool dimensions. Keep this additive
  // projection outside the group/receipt DTO so quantities and money stay intact.
  function equivalentGroups(data, grouped) {
    try {
      const engine = getThickness();
      if (typeof engine?.build !== 'function') return null;
      const result = engine.build(data, grouped);
      return Object.fromEntries(grouped.groups.map(group => {
        const aggregate = result?.byGroup?.[group.id];
        return [group.id, aggregate ? {total: aggregate.totals?.eq25 ?? null, loaded: aggregate.loaded?.eq25 ?? null, waiting: aggregate.waiting?.eq25 ?? null} : null];
      }));
    } catch { return null; }
  }

  // The existing sold DTO proves current-month source identity only. Its narrow
  // legacy sold categories are not reused as the new confirmed/negotiation totals.
  function verifiedSoldSource(value, now) {
    const {month} = period(now), source = value?.source, captured = Date.parse(source?.capturedAt);
    if (value?.version !== 1 || value.status !== 'verified-quantities' || value.month !== month || source?.page !== 9 || source.sourceIsLive !== false ||
      !Number.isFinite(captured) || captured > Number(now) || period(captured).month !== month || !/^sha256:[a-f0-9]{64}$/.test(source.checksum || '') ||
      ![value.orderCount, value.lineCount, source.orderCount, source.lineCount].every(count) || value.orderCount > value.lineCount || source.orderCount > source.lineCount ||
      value.orderCount > source.orderCount || value.lineCount > source.lineCount || ![value.quantity, value.loaded, value.paidOrDeposit, value.lcETD].every(units) ||
      ['sheet', 'strip'].some(key => value.quantity[key] !== value.loaded[key] + value.paidOrDeposit[key] + value.lcETD[key])) return null;
    return {page: 9, month, capturedAt: source.capturedAt, sourceIsLive: false, checksum: source.checksum, orderCount: source.orderCount, lineCount: source.lineCount};
  }
  function build(review, readModel, currentMonthSold, now = Date.now()) {
    try {
      const source = verifiedSoldSource(currentMonthSold, now), rm = readModel, rows = review?.rows;
      if (!source || rm?.kind !== 'current-month-order-review' || !['verified', 'verified-sales-only'].includes(rm.status) || rm.historical === true ||
        review?.metadata?.month !== source.month || rm.selectedMonth !== undefined && rm.selectedMonth !== source.month ||
        rm.source?.month !== source.month || rm.source.page !== 9 || rm.source.sourceIsLive !== false || rm.source.checksum !== source.checksum || rm.source.capturedAt !== source.capturedAt ||
        !Array.isArray(rows) || rows.length !== source.lineCount) return pending(now);
      const orders = new Set();
      for (const row of rows) {
        if (typeof row?.orderId === 'string' && row.orderId.trim()) orders.add('order:' + row.orderId);
        else if (count(row?.sourceIndex)) orders.add('source:' + JSON.stringify([row.sourceMonth || source.month, row.sourceIndex]));
        else return pending(now, 'รหัสรายการต้นทางไม่ครบ · ยังเทียบจำนวนใบกับหัวข้อ 02 ไม่ได้');
      }
      if (orders.size !== source.orderCount) return pending(now, 'จำนวนใบต้นทางไม่ตรงชุดหน้า 09 ที่ยืนยัน · รอตรวจ ไม่ใช้ยอดเก่าแทน');
      const groupModule = getGroups(), receiptModule = getReceipts();
      if (typeof groupModule?.build !== 'function' || typeof receiptModule?.build !== 'function') return pending(now, 'กำลังรอตัวสรุปกลุ่มขายและหลักฐานเงินชุดเดียวกับหัวข้อ 02');
      const data = {...review, readModel: rm};
      const grouped = groupModule.build(data), receipts = receiptModule.build(data, grouped);
      const result = {...grouped, version: 1, ...period(now), source,
        groups: grouped.groups.map(group => ({...group, money: receipts[group.id]})),
        equivalentByGroup: equivalentGroups(data, grouped),
        reason: grouped.status === 'verified' ? undefined : 'บางรายการหน้า 09 ยังจัดกลุ่มหรือยืนยันจำนวนไม่ได้ · ไม่ใช้ยอดเก่าหรือศูนย์แทน'};
      // Retain the source inputs read by these pure projections. Rebuilding at
      // render catches mutated totals, equivalents, cash and old-month data.
      const proof = {kind: rm.kind, status: rm.status, source: rm.source,
        ...(rm.selectedMonth !== undefined ? {selectedMonth: rm.selectedMonth} : {}),
        ...(rm.sourceCapturedAt !== undefined ? {sourceCapturedAt: rm.sourceCapturedAt} : {}),
        ...(rm.historical !== undefined ? {historical: rm.historical} : {})};
      result.evidence = clone({metadata: review.metadata, rows, readModel: proof,
        ...(review.financial?.metadata ? {financial: {metadata: review.financial.metadata}} : {}),
        ...(review.receiptSummary !== undefined ? {receiptSummary: review.receiptSummary} : {})});
      return result;
    } catch { return pending(now, 'ชุดสรุปกลุ่มขายยังตรวจสอบไม่ครบ · ไม่ใช้ยอดเก่าหรือเดือนอื่นแทน'); }
  }
  function view(value, currentMonthSold, now = Date.now()) {
    try {
      if (value?.version !== 1 || value.status !== 'verified' || value.month !== period(now).month || !value.evidence) return pending(now, value?.month === period(now).month && typeof value.reason === 'string' ? value.reason : undefined);
      const fresh = build(value.evidence, value.evidence.readModel, currentMonthSold, now);
      if (fresh.status !== 'verified') return fresh;
      for (const key of ['month', 'monthLabel', 'source', 'capturedAt', 'sourceLineCount', 'groups', 'summary', 'cancelled', 'unclassified', 'issues']) {
        if (JSON.stringify(value[key]) !== JSON.stringify(fresh[key])) return pending(now, 'ยอดสรุปกับรายการต้นทางไม่ตรงกัน · รออ่านชุดหน้า 09 ใหม่');
      }
      // A missing conversion module must not invent zero or hide separately
      // verified actual quantities/cash. When available, its evidence is checked.
      if (fresh.equivalentByGroup !== null && JSON.stringify(value.equivalentByGroup) !== JSON.stringify(fresh.equivalentByGroup)) return pending(now, 'ยอดแผ่นเทียบกับรายการต้นทางไม่ตรงกัน · รอตรวจชุดหน้า 09');
      return fresh;
    } catch { return pending(now); }
  }
  return {build, view};
});
