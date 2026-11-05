/* Pure selected-month Page09 display projection. No writes, allocations,
   inventory prices, receipts, or mixed-invoice apportionment. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./stock_sales_groups.js'));
  else root.AAFSalesThickness = factory(root.AAFSalesGroups);
})(typeof window === 'undefined' ? null : window, function (groupEngine) {
  'use strict';
  const units = ['sheet', 'strip'], currencies = ['THB', 'USD'];
  const denominator = 1220 * 2440 * 2.5;
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const number = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER;
  const positive = n => number(n) && n > 0;
  const text = s => typeof s === 'string' ? s.trim() : '';
  const near = (a, b) => number(a) && number(b) && Math.abs(a - b) <= Math.max(0.01, Math.abs(a) * 1e-10);
  const dateValid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  function verifiedFx(fx) {
    // This API deliberately does not infer verification from a naked rate or
    // from stock-price FX. The caller must supply its checked source evidence.
    return fx?.verified === true && positive(fx.rate) && dateValid(fx.date) && text(fx.source) ? {rate: fx.rate, date: fx.date, source: fx.source} : null;
  }
  function equivalent(row) {
    if (!number(row?.qty) || ![row?.w, row?.l, row?.t].every(positive)) return null;
    const result = row.qty * row.w * row.l * row.t / denominator;
    return number(result) ? result : null;
  }
  function missing(reason, status = 'missing-price') {
    return {status, reason, currency: null, unitPrice: null, amount: null, amountTHB: null, source: null, sourceDocument: null, valueBasis: 'actual-line-sale-only'};
  }
  function financialIdentity(record, row) {
    return ['id', 'orderId', 'ref', 'customer'].every(k => text(row?.[k]) && text(record?.[k]) === text(row[k])) &&
      ['w', 'l', 't', 'qty'].every(k => number(row?.[k]) && record?.[k] === row[k]) &&
      text(row?.grade) && text(record?.grade) === text(row.grade) &&
      (!own(record, 'unit') || record.unit === row.unit);
  }
  function financialProvenance(financial, grouped, review) {
    const meta = financial?.metadata;
    if (!meta || meta.month !== grouped.month) return false;
    // Historical evidence can use older Page02 price dates, but its row
    // binding must still refer to this review. Never substitute another month.
    for (const key of ['salesAsOf', 'sourceSalesCapturedAt', 'sourceCapturedAt']) {
      if (own(meta, key) && (!grouped.capturedAt || !Number.isFinite(Date.parse(meta[key])) || Date.parse(meta[key]) !== Date.parse(grouped.capturedAt))) return false;
    }
    if (own(meta, 'salesSourceChecksum')) {
      const checksum = review?.readModel?.source?.checksum;
      if (!/^sha256:[a-f0-9]{64}$/.test(meta.salesSourceChecksum) || checksum !== meta.salesSourceChecksum) return false;
    }
    return true;
  }
  function validateSale(sale, row, fx, embedded) {
    const approved = embedded ? sale?.verified === true && sale.amountBasis === 'line' : sale?.status === 'verified';
    if (!approved) return missing(sale?.reason || 'exact-line-sale-evidence-missing');
    if (!number(sale.unitPrice) || !number(sale.amount) || !number(row.qty) || !near(sale.amount, sale.unitPrice * row.qty)) return missing('line-amount-price-quantity-inconsistent');
    if (!currencies.includes(sale.currency)) return missing('line-currency-missing-or-unsupported', 'missing-currency');
    if (embedded && own(row, 'currency') && row.currency !== sale.currency) return missing('line-currency-conflict', 'missing-currency');
    if (!embedded && (!text(sale.source) || !text(sale.sourceDocument) || !text(sale.sourceId) || !['actual-product-sale-value-not-inventory-average', 'actual-order-sale-only-never-inventory-price', 'actual-line-sale-value'].includes(sale.valueBasis))) return missing('exact-line-sale-proof-missing');
    const amountTHB = sale.currency === 'THB' ? sale.amount : fx ? sale.amount * fx.rate : null;
    if (amountTHB !== null && !number(amountTHB)) return missing('sale-value-overflow');
    return {status: amountTHB === null ? 'missing-fx' : 'verified', reason: amountTHB === null ? 'verified-usd-thb-fx-required' : null,
      currency: sale.currency, unitPrice: sale.unitPrice, amount: sale.amount, amountTHB,
      source: sale.source || 'verified-embedded-actual-line-sale', sourceDocument: sale.sourceDocument || row.ref || null,
      sourceId: sale.sourceId || null, commercialTerm: sale.commercialTerm || null,
      valueBasis: 'actual-line-sale-only', fx: sale.currency === 'USD' ? fx : null};
  }
  function saleFor(row, review, grouped, fx, trusted, repeatedProof) {
    if (!trusted) return missing('source-quantity-or-provenance-pending', 'pending-source');
    if (row.qty === 0) return {...missing('zero-quantity-no-unit-price-invented', 'no-quantity'), amount: 0, amountTHB: 0};
    // An explicit financial entry is authoritative even when pending; do not
    // fall back to a second attached value and conceal conflicting evidence.
    if (own(review?.financial?.byRowId, row.id)) {
      const entry = review.financial.byRowId[row.id];
      if (!financialProvenance(review.financial, grouped, review) || !financialIdentity(entry, row)) return missing('financial-row-binding-mismatch');
      if (text(entry.sale?.sourceId) && repeatedProof.has(entry.sale.sourceId)) return missing('sale-line-proof-reused');
      return validateSale(entry.sale, row, fx, false);
    }
    if (own(row, 'actualSale')) return validateSale(row.actualSale, row, fx, true);
    return missing('exact-line-sale-evidence-missing');
  }
  function moneySummary(rows, trusted) {
    const result = {knownNative: {THB: 0, USD: 0}, pricedQuantityByCurrency: {THB: 0, USD: 0}, averageNativePerUnit: {THB: null, USD: null},
      knownTHB: 0, totalTHB: null, pricedQty: 0, thbPricedQty: 0, averageTHBPerUnit: null,
      pricedLineCount: 0, thbPricedLineCount: 0, missingPriceCount: 0, missingCurrencyCount: 0, missingFxCount: 0, missingQuantity: 0,
      sourceComplete: trusted, complete: trusted, lineCount: rows.length};
    for (const row of rows) {
      if (row.qty === 0) continue;
      const sale = row.sale;
      if (!trusted || !number(row.qty) || !currencies.includes(sale.currency) || !number(sale.amount)) {
        if (sale.status === 'missing-currency') result.missingCurrencyCount++;
        else result.missingPriceCount++;
        if (number(row.qty)) result.missingQuantity += row.qty;
        result.complete = false; continue;
      }
      result.knownNative[sale.currency] += sale.amount;
      result.pricedQuantityByCurrency[sale.currency] += row.qty;
      result.pricedQty += row.qty; result.pricedLineCount++;
      if (number(sale.amountTHB)) {
        result.knownTHB += sale.amountTHB; result.thbPricedQty += row.qty; result.thbPricedLineCount++;
      } else {result.missingFxCount++; result.missingQuantity += row.qty; result.complete = false;}
    }
    const sums = [result.knownTHB, result.pricedQty, result.thbPricedQty, result.missingQuantity, ...Object.values(result.knownNative), ...Object.values(result.pricedQuantityByCurrency)];
    if (sums.some(n => !number(n))) {
      result.complete = false; result.overflow = true;
      result.knownTHB = null; result.knownNative = {THB: null, USD: null};
      result.pricedQty = null; result.thbPricedQty = null; result.pricedQuantityByCurrency = {THB: null, USD: null};
    }
    result.totalTHB = result.complete ? result.knownTHB : null;
    if (positive(result.thbPricedQty) && number(result.knownTHB)) result.averageTHBPerUnit = result.knownTHB / result.thbPricedQty;
    for (const currency of currencies) if (positive(result.pricedQuantityByCurrency[currency]) && number(result.knownNative[currency])) result.averageNativePerUnit[currency] = result.knownNative[currency] / result.pricedQuantityByCurrency[currency];
    return result;
  }
  function aggregate(rows, sourceTotals) {
    const quantity = {sheet: 0, strip: 0}, eq = {sheet: 0, strip: 0};
    const known = {sheet: 0, strip: 0}, missingDimensions = {sheet: 0, strip: 0};
    let unknownUnitCount = 0;
    for (const row of rows) {
      if (!units.includes(row.unit)) {unknownUnitCount++; continue;}
      const unit = row.unit;
      if (!number(row.qty)) quantity[unit] = null;
      else if (quantity[unit] !== null) quantity[unit] += row.qty;
      if (row.eq25 === null) {eq[unit] = null; missingDimensions[unit]++;}
      else {known[unit] += row.eq25; if (eq[unit] !== null) eq[unit] += row.eq25;}
    }
    for (const unit of units) {
      if (unknownUnitCount || !number(sourceTotals?.[unit]) || !number(quantity[unit])) {quantity[unit] = null; eq[unit] = null;}
      if (!number(known[unit])) {known[unit] = null; eq[unit] = null;}
      if (!number(eq[unit])) eq[unit] = null;
    }
    const total = eq.sheet !== null && eq.strip !== null && number(eq.sheet + eq.strip) ? eq.sheet + eq.strip : null;
    const knownTotal = known.sheet !== null && known.strip !== null && number(known.sheet + known.strip) ? known.sheet + known.strip : null;
    const money = Object.fromEntries(units.map(unit => [unit, moneySummary(rows.filter(row => row.unit === unit), number(quantity[unit]))]));
    // Currency amounts can combine; physical sheet/strip denominators cannot.
    const combined = {knownNative: {}, knownTHB: null, totalTHB: null, complete: !unknownUnitCount && money.sheet.complete && money.strip.complete,
      missingPriceCount: money.sheet.missingPriceCount + money.strip.missingPriceCount + unknownUnitCount,
      missingCurrencyCount: money.sheet.missingCurrencyCount + money.strip.missingCurrencyCount,
      missingFxCount: money.sheet.missingFxCount + money.strip.missingFxCount,
      pricedLineCount: money.sheet.pricedLineCount + money.strip.pricedLineCount,
      thbPricedLineCount: money.sheet.thbPricedLineCount + money.strip.thbPricedLineCount};
    for (const currency of currencies) {
      const values = units.map(unit => money[unit].knownNative[currency]);
      combined.knownNative[currency] = values.every(number) && number(values[0] + values[1]) ? values[0] + values[1] : null;
    }
    const thb = units.map(unit => money[unit].knownTHB);
    combined.knownTHB = thb.every(number) && number(thb[0] + thb[1]) ? thb[0] + thb[1] : null;
    if (combined.knownTHB === null) combined.complete = false;
    combined.totalTHB = combined.complete ? combined.knownTHB : null;
    money.combined = combined;
    return {quantity, eq25: {sheet: eq.sheet, strip: eq.strip, total,
      knownSheet: known.sheet, knownStrip: known.strip, knownTotal, complete: total !== null,
      missingLineCount: missingDimensions.sheet + missingDimensions.strip + unknownUnitCount,
      missingByUnit: missingDimensions, unknownUnitCount}, money, lineCount: rows.length};
  }
  function build(review, _grouped, options = {}) {
    if (!groupEngine?.build) throw new Error('AAFSalesGroups must load before AAFSalesThickness');
    // Rebuild from the supplied review, not caller totals; this prevents stale
    // or modified group objects from changing the source shared with Section02.
    const grouped = groupEngine.build(review), fx = verifiedFx(options.fx), issues = [...grouped.issues];
    const seenProof = new Set(), repeatedProof = new Set();
    for (const group of grouped.groups) for (const row of group.rows) {
      const sale = review?.financial?.byRowId?.[row?.id]?.sale;
      if (sale?.status !== 'verified' || !text(sale.sourceId)) continue;
      if (seenProof.has(sale.sourceId)) repeatedProof.add(sale.sourceId);
      seenProof.add(sale.sourceId);
    }
    const groups = grouped.groups.map(group => {
      const loaded = new Set(group.loaded.rows), waiting = new Set(group.waiting.rows);
      const rows = group.rows.map(row => {
        const trusted = units.includes(row?.unit) && number(group.totals[row.unit]);
        const eq25 = trusted ? equivalent(row) : null;
        if (trusted && eq25 === null) issues.push({code: 'missing-or-invalid-equivalent-dimensions', severity: 'error', groupId: group.id, rowId: row?.id});
        return {id: row?.id || null, orderId: row?.orderId || null, ref: row?.ref || null, customer: row?.customer || null,
          w: row?.w ?? null, l: row?.l ?? null, t: row?.t ?? null, grade: row?.grade || null, unit: row?.unit || null, qty: number(row?.qty) ? row.qty : null,
          state: loaded.has(row) ? 'loaded' : waiting.has(row) ? 'waiting' : group.id,
          sourceStatus: row?.sourceStatus || null, productStatus: row?.productStatus || null,
          eq25, sale: saleFor(row, review, grouped, fx, trusted, repeatedProof)};
      });
      const byThickness = new Map();
      for (const row of rows) {
        const key = positive(row.t) ? String(row.t) : 'unknown';
        if (!byThickness.has(key)) byThickness.set(key, []);
        byThickness.get(key).push(row);
      }
      const thicknesses = [...byThickness].map(([key, detail]) => ({key, t: key === 'unknown' ? null : Number(key),
        totals: aggregate(detail, group.totals), loaded: aggregate(detail.filter(r => r.state === 'loaded'), group.loaded.totals),
        waiting: aggregate(detail.filter(r => r.state === 'waiting'), group.waiting.totals), rows: detail,
        orderCount: detail.every(r => text(r.orderId)) ? new Set(detail.map(r => r.orderId)).size : null, lineCount: detail.length,
        grades: [...new Set(detail.map(r => r.grade).filter(Boolean))].sort()})).sort((a, b) => a.t === null ? 1 : b.t === null ? -1 : a.t - b.t);
      return {id: group.id, label: group.label, orderCount: group.orderCount, lineCount: group.lineCount, rows, thicknesses,
        totals: aggregate(rows, group.totals), loaded: aggregate(rows.filter(r => r.state === 'loaded'), group.loaded.totals),
        waiting: aggregate(rows.filter(r => r.state === 'waiting'), group.waiting.totals)};
    });
    return {version: 1, status: issues.some(i => i.severity === 'error') ? 'pending' : 'verified', month: grouped.month, capturedAt: grouped.capturedAt,
      groups, byGroup: Object.fromEntries(groups.map(group => [group.id, group])), issues, fx,
      basis: {equivalent: 'actual-source-w*l*t/(1220*2440*2.5)', money: 'verified-exact-line-actual-sale-only', average: 'known-THB-sale/actual-THB-priced-quantity-by-unit'},
      excluded: {cancelledLineCount: grouped.cancelled.lineCount, unclassifiedLineCount: grouped.unclassified.lineCount}};
  }
  return {build};
});
