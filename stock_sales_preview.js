/* AAF sales/stock preview runtime. Public asset contains formulas and view only; private rows arrive at runtime. */
(function (host) {
  'use strict';
  const modelModule = {exports:{}};
  (function (module) {
'use strict';

/*
 * Pure AAF sales/stock model.
 *
 * Direct OrderWorkflow line money should set `amountBasis: 'line'`. A legacy
 * approximate display value may be retained separately as `sourceAmountSnapshot`.
 * Deposit rows never infer a net balance. Optional `confirmedDepositAmount` and
 * `netReceivableAmount` are honored only with a non-empty `amountSourceProof`;
 * the latter becomes the row's finance amount while the deposit stays separate.
 */

const DEFAULT_MIX = Object.freeze({ AAA: 0.85, B: 0.15 });
const DEFAULT_PAID_OVERRIDE_REFS = Object.freeze([]);
const DEFAULT_GRADE_ORDER = Object.freeze([
  'AV',
  'AAA',
  'A',
  'B',
  'F',
  'C',
  'REJ',
  'UN',
  'CTS',
]);
const STATUS_ORDER = Object.freeze([
  'loaded',
  'paid',
  'pi',
  'vessel',
  'negotiate',
  'forecast',
  'unknown',
]);
const FINANCE_TERM_ORDER = Object.freeze(['TT', 'LC', 'credit', 'unknown']);
const FINANCE_STAGE_ORDER = Object.freeze([
  'received',
  'loadedLc',
  'followup',
  'opportunity',
  'credit',
  'unknown',
  'unreserved',
]);

const STATUS_META = Object.freeze({
  loaded: { title: 'โหลดแล้ว · ออก Invoice แล้ว', short: 'โหลดแล้ว' },
  paid: { title: 'เก็บเงินแล้ว · ยังไม่โหลด', short: 'เก็บเงินแล้ว' },
  pi: { title: 'เปิด PI แล้ว', short: 'เปิด PI' },
  vessel: { title: 'มีเรือแล้ว', short: 'มีเรือ' },
  negotiate: { title: 'เจรจา', short: 'เจรจา' },
  forecast: { title: 'Forecast', short: 'Forecast' },
  unknown: { title: 'ยังไม่จัดกลุ่ม', short: 'ไม่ทราบสถานะ' },
});

const EXACT_PAID_PAYMENT_VALUES = new Set([
  'เก็บเงิน / ได้ LC แล้ว',
  'เก็บเงินแล้ว',
  'รับเงินแล้ว',
  'ชำระแล้ว',
  'PAID',
]);

const EXACT_LOADED_PRODUCT_VALUES = new Set([
  'โหลดแล้ว',
  'LOADED',
]);

const SOURCE_STATUS_MAP = new Map([
  ['โหลดแล้ว', 'loaded'],
  ['LOADED', 'loaded'],
  ['ออก INV', 'loaded'],
  ['เปิด PI', 'pi'],
  ['PI', 'pi'],
  ['มีเรือ', 'vessel'],
  ['VESSEL', 'vessel'],
  ['เจรจา', 'negotiate'],
  ['NEGOTIATE', 'negotiate'],
  ['FORECAST', 'forecast'],
]);

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizedText(value) {
  return text(value).replace(/\s+/g, ' ');
}

function upperText(value) {
  return normalizedText(value).toUpperCase();
}

function finiteNumber(value) {
  if (value === null || value === undefined || text(value) === '') return null;
  const number = typeof value === 'number'
    ? value
    : Number(String(value).replaceAll(',', ''));
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function nonNegativeNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function canonicalNumber(value) {
  const number = positiveNumber(value);
  if (number === null) return '';
  return String(Number(number.toPrecision(15)));
}

function normalizeGrade(value) {
  const grade = upperText(value);
  return grade === 'MIX' || grade === 'AAA+B' || grade === 'AAA/B'
    ? 'mix'
    : grade;
}

function normalizeUnit(value) {
  const unit = normalizedText(value).toLowerCase();
  return unit || 'unknown';
}

function normalizeCurrency(value) {
  const currency = upperText(value);
  return currency || null;
}

function normalizeTerm(value) {
  const term = upperText(value);
  const hasTT = /(?:^|[^A-Z])T\/?T(?:[^A-Z]|$)/u.test(term);
  const hasLC = /(?:^|[^A-Z])L\/?C(?:[^A-Z]|$)/u.test(term);
  // A combined "TT / LC" label is unresolved; never choose one by position.
  if (hasTT !== hasLC) return hasTT ? 'TT' : 'LC';
  if (/(?:^|[^A-Z])CREDIT(?:[^A-Z]|$)/u.test(term) || term.includes('เครดิต')) return 'credit';
  return 'unknown';
}

function isDepositPayment(value) {
  const payment = upperText(value);
  return /(?:มัดจำ|บางส่วน|DEPOSIT|PARTIAL)/u.test(payment);
}

// Financial evidence still refers to the original source line orientation.
// Keep invoice safety checks independent from the owner's stock matching rule.
function sourceSpecKey(row) {
  return [
    canonicalNumber(row.t),
    normalizeGrade(row.grade),
    canonicalNumber(row.w),
    canonicalNumber(row.l),
    normalizeUnit(row.unit),
  ].join('|');
}

function exactSpecKey(row) {
  const dimensions = [canonicalNumber(row.w), canonicalNumber(row.l)]
    .sort((a, b) => Number(a) - Number(b));
  return [canonicalNumber(row.t), normalizeGrade(row.grade), ...dimensions, normalizeUnit(row.unit)].join('|');
}

function orderKey(row, index) {
  return text(row.orderId) || text(row.ref) || text(row.id) || `row-${index + 1}`;
}

function invoiceKey(row, index) {
  return text(row.orderId) || text(row.ref) || text(row.id) || `row-${index + 1}`;
}

function compareGrades(a, b, gradeOrder) {
  const ai = gradeOrder.indexOf(a);
  const bi = gradeOrder.indexOf(b);
  if (ai !== -1 || bi !== -1) {
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    if (ai !== bi) return ai - bi;
  }
  return a.localeCompare(b, 'en');
}

function uniqueOrderCount(rows) {
  return new Set(rows.map(row => row.orderKey)).size;
}

function addNumber(map, key, amount) {
  map[key] = (map[key] || 0) + amount;
}

function qtySummary(rows) {
  const byUnit = {};
  rows.forEach(row => addNumber(byUnit, row.unit, row.qty));
  const units = Object.keys(byUnit).sort();
  return {
    byUnit,
    units,
    unit: units.length === 1 ? units[0] : null,
    qty: units.length === 1 ? byUnit[units[0]] : null,
    mixedUnits: units.length > 1,
  };
}

function equivalentSummary(rows) {
  const byUnit = {};
  const unsupportedUnits = new Set();
  rows.forEach(row => {
    if (row.unit === 'unknown') {
      unsupportedUnits.add(row.unit);
      return;
    }
    const equivalent = row.qty * row.w * row.l * row.t / (1220 * 2440 * 2.5);
    addNumber(byUnit, row.unit, equivalent);
  });
  const total = Object.values(byUnit).reduce((sum, value) => sum + value, 0);
  return {
    byUnit,
    // `sheet` is retained as the legacy UI field: total 4x8 @ 2.5 equivalents.
    sheet: total,
    total,
    unsupportedUnits: [...unsupportedUnits].sort(),
    complete: unsupportedUnits.size === 0,
  };
}

function moneySummary(rows) {
  const byCurrency = {};
  const confirmedDepositByCurrency = {};
  const netReceivableByCurrency = {};
  const unknownReasons = {};
  let knownRows = 0;
  let unknownRows = 0;

  rows.forEach(row => {
    if (row.currency && row.confirmedDepositAmount !== null) {
      addNumber(confirmedDepositByCurrency, row.currency, row.confirmedDepositAmount);
    }
    if (row.currency && row.netReceivableAmount !== null) {
      addNumber(netReceivableByCurrency, row.currency, row.netReceivableAmount);
    }
    if (row.amount !== null && row.currency) {
      addNumber(byCurrency, row.currency, row.amount);
      knownRows += 1;
      return;
    }
    unknownRows += 1;
    const reason = row.amountReason || (row.currency ? 'source-amount-missing' : 'currency-unknown');
    unknownReasons[reason] = (unknownReasons[reason] || 0) + 1;
  });

  const state = unknownRows === 0 ? 'complete' : knownRows > 0 ? 'partial' : 'unknown';
  return {
    byCurrency,
    confirmedDepositByCurrency,
    netReceivableByCurrency,
    knownRows,
    unknownRows,
    totalRows: rows.length,
    state,
    complete: state === 'complete',
    partial: state === 'partial',
    unknown: state === 'unknown',
    unknownReasons,
  };
}

function summarizeRows(rows) {
  return {
    rowCount: rows.length,
    orderCount: uniqueOrderCount(rows),
    quantities: qtySummary(rows),
    equivalent4x8At2_5: equivalentSummary(rows),
    money: moneySummary(rows),
  };
}

function emptyBucket(id, meta = {}) {
  return {
    id,
    ...meta,
    rows: [],
    totals: null,
  };
}

function finishBucket(bucket) {
  bucket.totals = summarizeRows(bucket.rows);
  return bucket;
}

function sourceStatus(value) {
  return SOURCE_STATUS_MAP.get(upperText(value)) || 'unknown';
}

function classifyStatus(row, paidOverrideRefs, paidPaymentValues) {
  const product = upperText(row.productStatus);
  // Page09 and the reservation API classify an issued invoice as loaded even
  // when an older per-product selector still says ready. Preserve both fields.
  const loaded = EXACT_LOADED_PRODUCT_VALUES.has(product)
    || sourceStatus(row.sourceStatus) === 'loaded';

  if (loaded) return 'loaded';
  if (!row.isDeposit && (paidOverrideRefs.has(row.ref) || paidPaymentValues.has(normalizedText(row.payment)))) {
    return 'paid';
  }
  return sourceStatus(row.sourceStatus);
}

function financeTermBucket(row) {
  return row.term;
}

function financeStage(row, firmOnly = false) {
  // Final paid/loaded precedence has already been resolved. Keep unknown net
  // deposits unknown; this changes grouping, never their amount or receipts.
  if (firmOnly && row.status === 'vessel') return 'opportunity';
  if (firmOnly && ['negotiate','forecast'].includes(row.status)) return 'unreserved';
  // Only proven net TT receivables at PI/vessel stage enter follow-up. The
  // deposit remains a separately reported receipt, never part of this amount.
  if (row.isDeposit && row.financeTerm === 'TT'
    && row.netReceivableAmount !== null && row.amount !== null
    && ['pi', 'vessel'].includes(row.status)) return 'followup';
  if (row.isDeposit || row.financeTerm === 'credit') return 'credit';
  if (row.status === 'loaded' || row.status === 'paid') {
    if (row.financeTerm === 'TT') return 'received';
    if (row.financeTerm === 'LC') return row.status === 'loaded' ? 'loadedLc' : 'followup';
    return 'unknown';
  }
  if (row.status === 'pi' || row.status === 'vessel') return 'followup';
  if (row.status === 'negotiate' || row.status === 'forecast') return 'opportunity';
  return 'unknown';
}

function buildFinance(rows) {
  const buckets = Object.fromEntries(FINANCE_TERM_ORDER.map(id => [id, emptyBucket(id)]));
  const stages = Object.fromEntries(FINANCE_STAGE_ORDER.map(id => [id, emptyBucket(id)]));

  rows.forEach(row => {
    buckets[row.financeTerm].rows.push(row);
    stages[row.financeStage].rows.push(row);
  });

  Object.values(buckets).forEach(finishBucket);
  Object.values(stages).forEach(finishBucket);
  return {
    buckets,
    stages,
    totals: summarizeRows(rows),
  };
}

function buildGroups(rows) {
  const groups = Object.fromEntries(STATUS_ORDER.map(id => [
    id,
    emptyBucket(id, STATUS_META[id]),
  ]));
  rows.forEach(row => groups[row.status].rows.push(row));
  Object.values(groups).forEach(finishBucket);
  return groups;
}

function stockUnitTotals(rows) {
  const byUnit = {};
  rows.forEach(row => {
    const target = byUnit[row.unit] || {
      physical: 0,
      reserved: 0,
      free: 0,
      shortage: 0,
      specCount: 0,
    };
    target.physical += row.physical;
    target.reserved += row.reserved;
    target.free += row.free;
    target.shortage += row.shortage;
    target.specCount += 1;
    byUnit[row.unit] = target;
  });
  return byUnit;
}

function buildStock(stockRows, reservationRows) {
  const specs = new Map();

  stockRows.forEach(row => {
    const key = exactSpecKey(row);
    const existing = specs.get(key);
    if (existing) {
      existing.physical += row.physical;
      existing.sourceStockRows += 1;
      if (row.sku) existing.skus.push(row.sku);
      return;
    }
    specs.set(key, {
      key,
      w: row.w,
      l: row.l,
      t: row.t,
      grade: row.grade,
      unit: row.unit,
      physical: row.physical,
      reserved: 0,
      free: 0,
      shortage: 0,
      missingStockSpec: false,
      sourceStockRows: 1,
      skus: row.sku ? [row.sku] : [],
    });
  });

  reservationRows.filter(row => row.status !== 'loaded' && row.reservesStock !== false).forEach(row => {
    const key = exactSpecKey(row);
    if (!specs.has(key)) {
      specs.set(key, {
        key,
        w: row.w,
        l: row.l,
        t: row.t,
        grade: row.grade,
        unit: row.unit,
        physical: 0,
        reserved: 0,
        free: 0,
        shortage: 0,
        missingStockSpec: true,
        sourceStockRows: 0,
        skus: [],
      });
    }
    specs.get(key).reserved += row.qty;
  });

  const rows = [...specs.values()].map(row => ({
    ...row,
    free: Math.max(0, row.physical - row.reserved),
    shortage: Math.max(0, row.reserved - row.physical),
  })).sort((a, b) => (
    a.t - b.t
    || a.grade.localeCompare(b.grade, 'en')
    || a.w - b.w
    || a.l - b.l
    || a.unit.localeCompare(b.unit, 'en')
  ));

  return {
    rows,
    byKey: Object.fromEntries(rows.map(row => [row.key, row])),
    unitTotals: stockUnitTotals(rows),
    missingSpecCount: rows.filter(row => row.missingStockSpec).length,
  };
}

function buildView(sourceRows, allocationRows, stockRows, grade) {
  const unloadedRows = sourceRows.filter(row => row.status !== 'loaded');
  return {
    grade,
    rows: sourceRows,
    allocations: allocationRows,
    groups: buildGroups(sourceRows),
    totals: summarizeRows(sourceRows),
    unloaded: {
      rows: unloadedRows,
      totals: summarizeRows(unloadedRows),
    },
    finance: buildFinance(sourceRows),
    stock: buildStock(stockRows, allocationRows),
  };
}

function normalizeStockRows(stockRows, invalidRows, strict) {
  const normalized = [];
  stockRows.forEach((source, index) => {
    const w = positiveNumber(source.w);
    const l = positiveNumber(source.l);
    const t = positiveNumber(source.t);
    const physical = nonNegativeNumber(source.physical);
    const grade = normalizeGrade(source.grade);
    const unit = normalizeUnit(source.unit);
    const reasons = [];
    if (w === null) reasons.push('invalid-width');
    if (l === null) reasons.push('invalid-length');
    if (t === null) reasons.push('invalid-thickness');
    if (!grade || grade === 'mix') reasons.push('invalid-grade');
    if (unit === 'unknown') reasons.push('invalid-unit');
    if (physical === null) reasons.push('invalid-physical');
    if (reasons.length) {
      const issue = { index, reasons, source };
      invalidRows.push(issue);
      if (strict) throw new TypeError(`Invalid stock row ${index}: ${reasons.join(', ')}`);
      return;
    }
    normalized.push({
      id: text(source.id) || `stock-${index + 1}`,
      sku: text(source.sku),
      w,
      l,
      t,
      grade,
      unit,
      physical,
    });
  });
  return normalized;
}

function normalizeSalesRows(salesRows, options, invalidRows) {
  const normalized = [];
  salesRows.forEach((source, index) => {
    const w = positiveNumber(source.w);
    const l = positiveNumber(source.l);
    const t = positiveNumber(source.t);
    const qty = nonNegativeNumber(source.qty);
    const grade = normalizeGrade(source.grade);
    const unit = normalizeUnit(source.unit);
    const reasons = [];
    if (w === null) reasons.push('invalid-width');
    if (l === null) reasons.push('invalid-length');
    if (t === null) reasons.push('invalid-thickness');
    if (!grade) reasons.push('invalid-grade');
    if (unit === 'unknown') reasons.push('invalid-unit');
    if (qty === null) reasons.push('invalid-quantity');
    if (reasons.length) {
      const issue = { index, reasons, source };
      invalidRows.push(issue);
      if (options.strict) throw new TypeError(`Invalid sales row ${index}: ${reasons.join(', ')}`);
      return;
    }

    const rawAmount = nonNegativeNumber(source.amount);
    const currency = normalizeCurrency(source.currency);
    const isDeposit = isDepositPayment(source.payment) || source.hasDeposit === true;
    const amountSourceProof = normalizedText(source.amountSourceProof);
    const amountBasis = normalizedText(source.amountBasis).toLowerCase() === 'line'
      ? 'line'
      : normalizedText(source.amountBasis).toLowerCase() === 'invoice'
        ? 'invoice'
        : 'unknown';
    const suppliedConfirmedDeposit = nonNegativeNumber(source.confirmedDepositAmount);
    const suppliedNetReceivable = nonNegativeNumber(source.netReceivableAmount);
    const hasDepositProof = amountSourceProof !== '';
    const confirmedDepositAmount = isDeposit && hasDepositProof
      ? suppliedConfirmedDeposit
      : null;
    const netReceivableAmount = isDeposit && hasDepositProof
      ? suppliedNetReceivable
      : null;
    const effectiveAmount = isDeposit ? netReceivableAmount : rawAmount;
    const row = {
      id: text(source.id) || `sale-${index + 1}`,
      orderId: text(source.orderId),
      ref: text(source.ref),
      customer: text(source.customer),
      w,
      l,
      t,
      grade,
      unit,
      qty,
      amount: effectiveAmount,
      rawAmount,
      grossAmount: rawAmount,
      unresolvedAmount: null,
      currency,
      amountBasis: isDeposit && netReceivableAmount !== null
        ? 'net-receivable'
        : amountBasis,
      lineAmountConfirmed: amountBasis === 'line',
      amountSourceProof: hasDepositProof ? amountSourceProof : null,
      confirmedDepositAmount,
      netReceivableAmount,
      depositEvidenceIgnored: isDeposit
        && !hasDepositProof
        && (suppliedConfirmedDeposit !== null || suppliedNetReceivable !== null),
      sourceAmountSnapshot: source.sourceAmountSnapshot === undefined
        ? null
        : source.sourceAmountSnapshot,
      term: normalizeTerm(source.term),
      sourceStatus: normalizedText(source.sourceStatus),
      productStatus: normalizedText(source.productStatus),
      payment: normalizedText(source.payment),
      notes: source.notes === undefined ? null : source.notes,
      isDeposit,
      hasDeposit: isDeposit,
      amountReason: null,
      amountReasons: [],
      orderKey: orderKey(source, index),
      invoiceKey: invoiceKey(source, index),
      sourceIndex: index,
      allocationShare: 1,
      mixedAllocation: false,
    };

    if (isDeposit && netReceivableAmount === null) {
      row.amountReasons.push('deposit-net-amount-unknown');
    }
    if (effectiveAmount === null && !isDeposit) row.amountReasons.push('source-amount-missing');
    if (effectiveAmount !== null && currency === null) row.amountReasons.push('currency-unknown');
    normalized.push(row);
  });
  return normalized;
}

function findMixedSpecInvoices(rows, trustMixedSpecLineAmounts) {
  const groups = new Map();
  rows.forEach(row => {
    if (!groups.has(row.invoiceKey)) groups.set(row.invoiceKey, []);
    groups.get(row.invoiceKey).push(row);
  });

  const unresolvedInvoices = [];
  groups.forEach((invoiceRows, key) => {
    const specs = [...new Set(invoiceRows.map(row => sourceSpecKey(row)))];
    if (specs.length <= 1 || trustMixedSpecLineAmounts) return;

    const unresolvedRows = invoiceRows.filter(row => !row.lineAmountConfirmed);
    if (!unresolvedRows.length) return;

    const currencies = [...new Set(unresolvedRows.map(row => row.currency).filter(Boolean))];
    const amounts = [...new Set(unresolvedRows.map(row => row.rawAmount).filter(value => value !== null))];
    const fullInvoiceAmount = currencies.length === 1 && amounts.length === 1 ? amounts[0] : null;
    unresolvedInvoices.push({
      invoiceKey: key,
      rowIds: invoiceRows.map(row => row.id),
      unresolvedRowIds: unresolvedRows.map(row => row.id),
      specs,
      currency: currencies.length === 1 ? currencies[0] : null,
      fullInvoiceAmount,
      sourceAmounts: amounts,
      amountReason: 'mixed-invoice-across-specs',
    });
    unresolvedRows.forEach(row => row.amountReasons.push('mixed-invoice-across-specs'));
  });
  return unresolvedInvoices;
}

function finalizeAmounts(rows) {
  rows.forEach(row => {
    row.amountReasons = [...new Set(row.amountReasons)];
    if (row.amountReasons.length) {
      row.unresolvedAmount = row.rawAmount;
      row.amount = null;
      row.amountReason = row.amountReasons[0];
    }
  });
}

function allocateRows(rows, mix) {
  const allocations = [];
  rows.forEach(row => {
    if (row.grade !== 'mix') {
      allocations.push({ ...row });
      return;
    }
    Object.entries(mix).forEach(([grade, share]) => {
      allocations.push({
        ...row,
        id: `${row.id}::${grade}`,
        grade,
        qty: row.qty * share,
        amount: row.amount === null ? null : row.amount * share,
        confirmedDepositAmount: row.confirmedDepositAmount === null
          ? null
          : row.confirmedDepositAmount * share,
        netReceivableAmount: row.netReceivableAmount === null
          ? null
          : row.netReceivableAmount * share,
        allocationShare: share,
        mixedAllocation: true,
        allocationSourceGrade: 'mix',
      });
    });
  });
  return allocations;
}

function validateMix(mix) {
  const result = {};
  Object.entries(mix || {}).forEach(([grade, shareValue]) => {
    const gradeName = normalizeGrade(grade);
    const share = positiveNumber(shareValue);
    if (!gradeName || gradeName === 'mix' || share === null) {
      throw new TypeError('Mix allocation must contain positive shares for concrete grades');
    }
    result[gradeName] = share;
  });
  const total = Object.values(result).reduce((sum, share) => sum + share, 0);
  if (!Object.keys(result).length || Math.abs(total - 1) > 1e-9) {
    throw new TypeError('Mix allocation shares must sum to 1');
  }
  return result;
}

function buildScope(sourceRows, allocationRows, stockRows, gradeOrder) {
  const gradeSet = new Set(stockRows.map(row => row.grade));
  allocationRows.forEach(row => gradeSet.add(row.grade));
  const grades = [...gradeSet].sort((a, b) => compareGrades(a, b, gradeOrder));
  const all = buildView(sourceRows, allocationRows, stockRows, 'all');
  const byGrade = {};
  grades.forEach(grade => {
    const rows = allocationRows.filter(row => row.grade === grade);
    const gradeStock = stockRows.filter(row => row.grade === grade);
    byGrade[grade] = buildView(rows, rows, gradeStock, grade);
  });
  return { grades, all, byGrade, totals: all.totals };
}

function buildModel(salesRows = [], stockRows = [], opts = {}) {
  if (!Array.isArray(salesRows) || !Array.isArray(stockRows)) {
    throw new TypeError('buildModel expects salesRows and stockRows arrays');
  }

  const options = {
    strict: opts.strict === true,
    reservationPolicy: opts.reservationPolicy || null,
    mix: validateMix(opts.mix || DEFAULT_MIX),
    gradeOrder: Array.isArray(opts.gradeOrder)
      ? opts.gradeOrder.map(normalizeGrade).filter(Boolean)
      : [...DEFAULT_GRADE_ORDER],
    paidOverrideRefs: new Set(opts.paidOverrideRefs || DEFAULT_PAID_OVERRIDE_REFS),
    paidPaymentValues: new Set(
      [...(opts.paidPaymentValues || EXACT_PAID_PAYMENT_VALUES)].map(normalizedText),
    ),
    trustMixedSpecLineAmounts: opts.trustMixedSpecLineAmounts === true,
  };

  const invalidSalesRows = [];
  const invalidStockRows = [];
  const normalizedSales = normalizeSalesRows(salesRows, options, invalidSalesRows);
  const normalizedStock = normalizeStockRows(stockRows, invalidStockRows, options.strict);
  const unresolvedInvoices = findMixedSpecInvoices(
    normalizedSales,
    options.trustMixedSpecLineAmounts,
  );
  finalizeAmounts(normalizedSales);

  normalizedSales.forEach(row => {
    row.status = classifyStatus(row, options.paidOverrideRefs, options.paidPaymentValues);
    row.financeTerm = financeTermBucket(row);
    row.reservesStock = row.status !== 'loaded' && !(options.reservationPolicy === 'aaf-firm-only-20261003-v1' && ['negotiate','forecast'].includes(row.status));
    row.financeStage = financeStage(row, options.reservationPolicy === 'aaf-firm-only-20261003-v1');
  });

  const allocations = allocateRows(normalizedSales, options.mix);
  const thicknesses = [...new Set([
    ...normalizedSales.map(row => row.t),
    ...normalizedStock.map(row => row.t),
  ])].sort((a, b) => a - b);

  const globalScope = buildScope(
    normalizedSales,
    allocations,
    normalizedStock,
    options.gradeOrder,
  );

  const byThickness = {};
  thicknesses.forEach(thickness => {
    const key = canonicalNumber(thickness);
    const sourceRowsForThickness = normalizedSales.filter(row => row.t === thickness);
    const allocationsForThickness = allocations.filter(row => row.t === thickness);
    const stockForThickness = normalizedStock.filter(row => row.t === thickness);
    byThickness[key] = {
      t: thickness,
      ...buildScope(
        sourceRowsForThickness,
        allocationsForThickness,
        stockForThickness,
        options.gradeOrder,
      ),
    };
  });

  return {
    version: 1,
    reservationPolicy: options.reservationPolicy,
    meta: {
      sourceSalesRowCount: salesRows.length,
      sourceStockRowCount: stockRows.length,
      normalizedSalesRowCount: normalizedSales.length,
      normalizedStockRowCount: normalizedStock.length,
      invalidSalesRows,
      invalidStockRows,
      unresolvedInvoices,
      deposits: normalizedSales
        .filter(row => row.isDeposit)
        .map(row => ({
          id: row.id,
          orderKey: row.orderKey,
          ref: row.ref,
          grossAmount: row.grossAmount,
          confirmedDepositAmount: row.confirmedDepositAmount,
          netReceivableAmount: row.netReceivableAmount,
          unresolvedAmount: row.unresolvedAmount,
          currency: row.currency,
          amountSourceProof: row.amountSourceProof,
          depositEvidenceIgnored: row.depositEvidenceIgnored,
          amountReason: row.amountReason,
        })),
      unresolvedDeposits: normalizedSales
        .filter(row => row.isDeposit && row.amount === null)
        .map(row => ({
          id: row.id,
          orderKey: row.orderKey,
          ref: row.ref,
          grossAmount: row.grossAmount,
          confirmedDepositAmount: row.confirmedDepositAmount,
          unresolvedAmount: row.unresolvedAmount,
          currency: row.currency,
          amountReason: 'deposit-net-amount-unknown',
        })),
      mix: { ...options.mix },
      paidOverrideRefs: [...options.paidOverrideRefs],
      quantityPolicy: 'Quantities are summed by exact unit; cross-unit qty is null.',
      stockPolicy: 'Reserve unloaded rows by exact t|grade|min(w,l)|max(w,l)|unit; reversed axes share one pool; never approximate dimensions or cross-compensate grade/thickness/unit.',
      amountPolicy: 'Unknown and unsafe allocations remain null with amountReason metadata.',
    },
    thicknesses,
    grades: globalScope.grades,
    gradeOrder: options.gradeOrder,
    salesRows: normalizedSales,
    allocationRows: allocations,
    stockRows: normalizedStock,
    all: globalScope.all,
    byGrade: globalScope.byGrade,
    totals: globalScope.totals,
    byThickness,
  };
}

module.exports = {
  buildModel,
  exactSpecKey,
  canonicalNumber,
  constants: {
    DEFAULT_MIX,
    DEFAULT_PAID_OVERRIDE_REFS,
    DEFAULT_GRADE_ORDER,
    STATUS_ORDER,
    FINANCE_TERM_ORDER,
    FINANCE_STAGE_ORDER,
  },
};

  })(modelModule);
  host.AafAllModel = modelModule.exports;
})(typeof window !== 'undefined' ? window : globalThis);

/* Shared view for the AAF preview. Data and calculations are supplied by the pure model. */
(function (host) {
  'use strict';
  function mountAllThickness(root, model, options = {}) {
    const readOnly = options.readOnly === true;
    const priceNotesOnly = options.priceNotesOnly === true;
    if (!root || !model) throw new Error('Missing preview root or verified model');
    const doc = root.ownerDocument;
    const win = doc.defaultView || host;
    const fxReference = options.fxReference || {};
    const metadata = options.metadata || {};
    const externalStore = options.store || null;
    if (externalStore !== null && (typeof externalStore !== 'object' || Array.isArray(externalStore))) throw new Error('Invalid preview persistence store');
    const loadSavedState = () => externalStore ? typeof externalStore.load === 'function' ? externalStore.load() : externalStore.widgetState ?? null : win.openai?.widgetState ?? null;
    const persistSavedState = value => {
      if (!externalStore) {
        if (!win.openai?.setWidgetState) throw new Error('ไม่มีช่องทางบันทึก');
        return win.openai.setWidgetState(value);
      }
      const writer = typeof externalStore.save === 'function' ? externalStore.save : externalStore.setWidgetState;
      if (typeof writer !== 'function') throw new Error('ไม่มีช่องทางบันทึก');
      return writer.call(externalStore,value);
    };
    // Reference evidence is display-only: never seed or overwrite the saved catalog.
    const historicalFreePriceReferences = options.historicalFreePriceReferences || {};
    const receiptBreakdown = options.receiptBreakdown;
    const pricingContext = 'aaf-sales-stock-preview|free-price-catalog';
    const paidOverrideRefs = new Set(options.paidOverrideRefs || model.meta?.paidOverrideRefs || []);
    const sourceCurrencyNoteIncludes = ['ต้นทางแสดง USD','สกุลเงิน',...(Array.isArray(options.sourceCurrencyNoteIncludes) ? options.sourceCurrencyNoteIncludes : [])].filter(value => typeof value === 'string' && value);
    const positive = value => value === null || value === undefined || String(value).trim() === '' ? null : Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
    const fmt = (value, precision = 2) => Number.isFinite(value) ? value.toLocaleString('en-US', {maximumFractionDigits:precision}) : '—';
    const thick = value => Number(value).toFixed(Number.isInteger(Number(value)) ? 1 : Math.max(1, (String(value).split('.')[1] || '').length));
    const unitName = unit => unit === 'sheet' ? 'แผ่น' : unit === 'strip' ? 'ชิ้น' : unit || 'หน่วย';
    const specKey = row => [row.t,row.grade,row.w,row.l,row.unit].join('|');
    const currency = (catalog, key) => catalog[key] === 'USD' ? 'USD' : 'THB';
    const thicknessKey = value => positive(value) === null ? null : String(Number(value));
    const copyCatalog = value => ({prices:{...value.prices},currencies:{...value.currencies},notesByThickness:{...value.notesByThickness}});
    let pricing = {fx:positive(fxReference.rate), prices:{}, currencies:{},notesByThickness:{}};
    let committed = {prices:{},currencies:{},notesByThickness:{},savedAt:null};
    let committedFx = pricing.fx, hasSavedState = false;
    const automaticFx = options.automaticFx === true;
    let autoFx = null;
    // Automatic FX is a valuation input, never a price/catalog write.
    const effectiveFx = (saved = false) => automaticFx ? positive(autoFx?.rate) ?? positive(committedFx) : positive(saved ? committedFx : pricing.fx);
    function fxStatusText() {
      if (!automaticFx) return pricing.fx === null ? 'กรอกอัตรามากกว่า 0 เพื่อคำนวณเงินบาท' : pricing.fx === fxReference.rate ? 'ใช้อัตราอ้างอิง · ไม่ใช่เรทสดอัตโนมัติ' : 'ใช้อัตราที่กรอกเอง · ไม่ใช่อัตรารับเงินจริง';
      const savedDate=committedFx===fxReference.rate?fxReference.date:null;
      const dateValue=autoFx?.date||savedDate;
      const date = dateValue ? new Date(dateValue+'T12:00:00+07:00').toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Bangkok'}) : 'ไม่ทราบวันที่';
      if (!autoFx) return 'กำลังตรวจเรทอัตโนมัติ · ใช้เรทเดิม '+date;
      return (autoFx.status === 'current' ? 'อัตโนมัติ · ธปท. ซื้อเงินโอน · ' : autoFx.status === 'stale' ? 'เรทต้นทางเกิน 7 วัน · คงเรทเดิม · ' : 'ดึงเรทล่าสุดไม่สำเร็จ · คงเรทเดิม · ')+date+' · อัตรารายวัน ไม่ใช่เรทระหว่างวัน';
    }
    function setAutomaticFx(value) {
      if (!automaticFx || destroyed || storeLoading || storeLoadFailed || dirty || saving) return false;
      const valid = value && typeof value.rate==='number' && positive(value.rate) !== null && value.rate <= 1000 && /^\d{4}-\d{2}-\d{2}$/.test(value.date || '') && Number.isFinite(Date.parse(value.date)) && new Date(value.date).toISOString().slice(0,10)===value.date && value.date<=new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10) && value.basis === 'BOT_USD_THB_BUYING_TRANSFER';
      if (valid && (!autoFx?.date || value.date >= autoFx.date)) autoFx = {...value};
      else autoFx = {...autoFx,status:'unavailable'};
      syncInputs();updateFinancialView();saveStatus();notifyReportSummary('exchange-rate');return true;
    }
    let dirty = false, saving = false, error = '', writeCount = 0, queuedWrites = 0, writeFailed = false;
    let storeLoading = false, storeLoadFailed = false;
    let queue = Promise.resolve();
    const cleanups = [];
    const scopes = new Map();
    const rowLookup = new Map();
    // Display dimensions retain their source order; catalog ownership must not move
    // while a price is edited/cleared, or create a duplicate reversed-axis entry.
    const priceKeyBindings = new Map();
    const knownPoolKeys = new Map();
    model.all.stock.rows.forEach(row => {
      const key = specKey(row), reverse = reversedSpecKey(key);
      knownPoolKeys.set(key,key);knownPoolKeys.set(reverse,key);
    });
    const invalidDraftValues = new Map();
    const freeDisclosures = new Map();
    const on = (element, event, fn) => {element.addEventListener(event, fn); cleanups.push(() => element.removeEventListener(event, fn));};
    function syncFreeDisclosure(id) {
      const disclosure = freeDisclosures.get(id);
      if (!disclosure) return;
      const expanded = disclosure.isOpen();
      root.querySelectorAll('[data-open-free]').forEach(button => {
        if (button.dataset.openFree !== id) return;
        button.setAttribute('aria-controls',disclosure.target.id);
        button.setAttribute('aria-expanded',String(expanded));
        button.textContent = expanded ? 'ซ่อนราคาประเมินและหมายเหตุ' : 'เปิด Free · ราคาและหมายเหตุ';
      });
      disclosure.barButton?.setAttribute('aria-expanded',String(expanded));
    }

    function validKey(key) {
      if (typeof key !== 'string') return false;
      const fields = key.split('|');
      return fields.length === 5 && [fields[0],fields[2],fields[3]].every(v => positive(v) !== null) && /^[A-Z]+$/.test(fields[1]) && ['sheet','strip'].includes(fields[4]);
    }
    function reversedSpecKey(key) {
      const [t,grade,w,l,unit] = key.split('|');
      return [t,grade,l,w,unit].join('|');
    }
    function priceKey(displayKey) {
      if (!priceKeyBindings.has(displayKey)) {
        const reverse = reversedSpecKey(displayKey);
        // A currency-only record retains an explicitly cleared price. Respect it
        // before fallback so a deleted exact price cannot reappear after reload.
        const owns = key => Object.hasOwn(pricing.prices,key) || Object.hasOwn(pricing.currencies,key);
        priceKeyBindings.set(displayKey,owns(displayKey) ? displayKey : owns(reverse) ? reverse : displayKey);
      }
      return priceKeyBindings.get(displayKey);
    }
    function sameCatalog(a, b) {
      const keys = new Set([...Object.keys(a.prices),...Object.keys(b.prices),...Object.keys(a.currencies),...Object.keys(b.currencies)]);
      const notes = new Set([...Object.keys(a.notesByThickness || {}),...Object.keys(b.notesByThickness || {})]);
      return [...keys].every(key => a.prices[key] === b.prices[key] && currency(a.currencies,key) === currency(b.currencies,key)) && [...notes].every(key => (a.notesByThickness?.[key] || '') === (b.notesByThickness?.[key] || ''));
    }
    function readState(saved) {
      const value = saved?.privateContent;
      const legacy = value && [1,2].includes(value.version) && /^\d{4}-\d{2}-\d{2}\|[\d.]+\|(THB-)?per-sheet$/.test(value.context || '');
      if (!value || !(legacy || (value.version === 3 && value.context === pricingContext))) return false;
      pricing = {fx:positive(value.fx),prices:{},currencies:{},notesByThickness:{}};
      // Keep the complete saved catalog, including specs absent from this snapshot.
      Object.entries(value.prices || {}).forEach(([key,price]) => {if (validKey(key) && positive(price) !== null) pricing.prices[key] = Number(price);});
      if (value.version >= 2) Object.entries(value.currencies || {}).forEach(([key,value]) => {if (validKey(key) && ['THB','USD'].includes(value)) pricing.currencies[key] = value;});
      // Notes belong to a thickness, not to one grade/spec or one snapshot.
      Object.entries(value.notesByThickness || {}).forEach(([key,note]) => {const normalized = thicknessKey(key);if (normalized !== null && typeof note === 'string' && note !== '') pricing.notesByThickness[normalized] = note;});
      committed = {...copyCatalog(pricing),savedAt:typeof value.savedAt === 'string' && Number.isFinite(Date.parse(value.savedAt)) ? value.savedAt : null};
      committedFx = pricing.fx; hasSavedState = true;
      priceKeyBindings.clear();
      invalidDraftValues.clear();
      dirty = false; error = ''; return true;
    }
    function payload(catalog, fx = pricing.fx) {
      return {modelContent:{scope:'AAF preview price catalog',fxThbPerUsd:fx,freePriceUnit:'THB or USD per actual sheet or strip piece',freeValueCurrency:'THB'},privateContent:{version:3,context:pricingContext,fx,...copyCatalog(catalog),savedAt:catalog.savedAt || null}};
    }
    function enqueue(build, success = () => {}) {
      if (readOnly) return Promise.reject(new Error('รายงานนี้ดูอย่างเดียว'));
      queuedWrites++;
      const write = queue.catch(() => {}).then(async () => {
        writeCount++;
        try {
          const value = build();
          if (new TextEncoder().encode(JSON.stringify(value)).byteLength >= 16*1024) {const cause = new Error('ข้อมูลราคาและหมายเหตุเกินขอบเขตบันทึก');cause.code = 'state-too-large';throw cause;}
          const confirmed = await persistSavedState(value);
          success(priceNotesOnly && confirmed?.privateContent ? confirmed : value); writeFailed = false;
        } catch (cause) {writeFailed = true; throw cause;}
        finally {writeCount--; queuedWrites--;}
      });
      queue = write; return write;
    }
    function updatePersistenceAccess() {
      const blocked = readOnly || storeLoading || storeLoadFailed;
      root.setAttribute('aria-busy',String(storeLoading));
      root.querySelectorAll('[data-fx],[data-thickness-note],[data-free-price],[data-free-currency]').forEach(node => {node.disabled = blocked;if(readOnly){node.setAttribute('aria-readonly','true');node.placeholder='';}});
      if(priceNotesOnly || automaticFx)root.querySelectorAll('[data-fx]').forEach(node=>{node.disabled=true;node.setAttribute('aria-readonly','true');node.title=automaticFx?'อัปเดตอัตโนมัติจาก ธปท.':'อัตราแลกเปลี่ยนกำหนดโดยเจ้าของ';});
    }
    function saveStatus() {
      const label = storeLoading ? 'กำลังโหลดราคาและหมายเหตุ…' : saving ? 'กำลังเซฟ…' : error || (dirty ? 'แก้ไขแล้ว · ยังไม่เซฟ' : committed.savedAt ? 'เซฟแล้ว '+new Date(committed.savedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : 'กดเซฟเพื่อเก็บราคาและหมายเหตุ');
      root.querySelectorAll('[data-save-price-status]').forEach(node => {node.textContent = label; node.dataset.state = error || storeLoadFailed ? 'error' : dirty ? 'dirty' : 'saved';});
      root.querySelectorAll('[data-save-prices]').forEach(node => {node.disabled = storeLoading || storeLoadFailed || saving; node.textContent = saving ? 'กำลังเซฟ…' : 'เซฟราคาและหมายเหตุ';});
      root.querySelectorAll('[data-export-prices]').forEach(node => {node.disabled = storeLoading || storeLoadFailed || !hasSavedState;node.title = hasSavedState ? 'ส่งออกเฉพาะข้อมูลที่เซฟแล้ว ไม่รวมร่างบนจอ' : 'ยังไม่มีข้อมูลที่เซฟให้ส่งออก';});
      updatePersistenceAccess();
    }
    function knownDisplayKey(key) {return typeof key === 'string' ? knownPoolKeys.get(key) || null : null;}
    function getPriceState() {return {...pricing,...copyCatalog(pricing),readOnly,dirty,saving,error,loading:storeLoading,loadFailed:storeLoadFailed,invalidKeys:[...invalidDraftValues.keys()]};}
    function getDraftPrice(key) {
      if (destroyed || storeLoading || storeLoadFailed) return null;
      const displayKey = knownDisplayKey(key);if (displayKey === null) return null;
      const ownerKey = priceKey(displayKey);
      return {value:invalidDraftValues.has(displayKey) ? invalidDraftValues.get(displayKey) : Object.hasOwn(pricing.prices,ownerKey) ? pricing.prices[ownerKey] : '',currency:currency(pricing.currencies,ownerKey)};
    }
    function notifyPriceDraftChange(reason,key = null) {
      if (destroyed || typeof options.onPriceDraftChange !== 'function') return;
      const state = getPriceState(), change = {reason,key,draft:key === null ? null : getDraftPrice(key),dirty:state.dirty,saving:state.saving,error:state.error,loading:state.loading,loadFailed:state.loadFailed,invalidKeys:state.invalidKeys};
      try {options.onPriceDraftChange(change);} catch (cause) {win.console?.error?.('AAF sales preview price draft callback failed',cause);}
    }
    const draftValidationError = 'ยังไม่เซฟ · ตรวจราคาให้มากกว่า 0 หรือเว้นว่าง';
    function recomputeDirty() {dirty = invalidDraftValues.size > 0 || !sameCatalog(pricing,committed);return dirty;}
    function markEdited() {recomputeDirty();error = invalidDraftValues.size ? draftValidationError : '';saveStatus();}
    function rejectDraftPrice(displayKey,value,active = null) {
      if (displayKey !== null) invalidDraftValues.set(displayKey,typeof value === 'string' || typeof value === 'number' ? value : String(value ?? ''));
      active?.setAttribute?.('aria-invalid','true');
      recomputeDirty();error = draftValidationError;saveStatus();notifyPriceDraftChange('invalid',displayKey);return false;
    }
    function setDraftPrice(key,value,currencyCode) {
      if (readOnly) return false;
      if (destroyed || storeLoading || storeLoadFailed) return false;
      const displayKey = knownDisplayKey(key);if (displayKey === null) return false;
      if (!['string','number'].includes(typeof value)) return rejectDraftPrice(displayKey,value);
      const blank = typeof value === 'string' && value.trim() === '';
      const parsed = blank ? null : positive(value);
      if ((!blank && parsed === null) || (currencyCode !== undefined && !['THB','USD'].includes(currencyCode))) return rejectDraftPrice(displayKey,value);
      const ownerKey = priceKey(displayKey), hadPrice = Object.hasOwn(pricing.prices,ownerKey);
      if (blank) {
        if (hadPrice) pricing.currencies[ownerKey] = currency(pricing.currencies,ownerKey);
        delete pricing.prices[ownerKey];
      } else pricing.prices[ownerKey] = parsed;
      if (currencyCode !== undefined) pricing.currencies[ownerKey] = currencyCode;
      invalidDraftValues.delete(displayKey);syncInputs();updateFinancialView();markEdited();notifyPriceDraftChange('draft',displayKey);return true;
    }
    function setDraftCurrency(key,currencyCode,active = null) {
      if (readOnly) return false;
      if (destroyed || storeLoading || storeLoadFailed || !['THB','USD'].includes(currencyCode)) return false;
      const displayKey = knownDisplayKey(key);if (displayKey === null) return false;
      pricing.currencies[priceKey(displayKey)] = currencyCode;syncInputs(active);updateFinancialView();markEdited();notifyPriceDraftChange('draft',displayKey);return true;
    }
    async function savePrices() {
      if (readOnly) return false;
      const loaded = await ready;
      if (destroyed || loaded === false || storeLoading || storeLoadFailed) {error = 'ยังไม่เซฟ · โหลด catalog ไม่สำเร็จ';saveStatus();notifyPriceDraftChange('save-blocked');return false;}
      if (saving) return false;
      if (invalidDraftValues.size || [...root.querySelectorAll('[data-free-price]')].some(input => input.validity.badInput || input.getAttribute('aria-invalid') === 'true')) {error = 'ยังไม่เซฟ · ตรวจราคาให้มากกว่า 0 หรือเว้นว่าง';saveStatus();notifyPriceDraftChange('save-blocked');return false;}
      const snapshot = {...copyCatalog(pricing),savedAt:new Date().toISOString()};
      saving = true; error = ''; saveStatus();notifyPriceDraftChange('save-start');
      let saved = false;
      try {await enqueue(() => payload(snapshot),value => {committed = {...snapshot,savedAt:value.privateContent.savedAt};committedFx = positive(value.privateContent.fx);hasSavedState = true;recomputeDirty();});saved = true;}
      catch (cause) {error = cause?.code === 'state-too-large' ? 'ยังไม่เซฟ · ราคาและหมายเหตุรวมเกิน 16 KB กรุณาย่อหมายเหตุ' : 'เซฟไม่สำเร็จ · ราคาและหมายเหตุยังไม่ถูกบันทึก กรุณากดใหม่';}
      finally {saving = false; saveStatus();}
      if (saved) notifyReportSummary('saved');
      notifyPriceDraftChange(saved ? 'saved' : 'save-failed');return saved;
    }
    function saveFx() {
      if (readOnly || priceNotesOnly || automaticFx) return;
      if (storeLoading || storeLoadFailed) return;
      // Only the committed catalog accompanies FX autosaves. Price/note drafts are never saved implicitly.
      enqueue(() => payload(committed),value => {committedFx = positive(value.privateContent.fx);hasSavedState = true;if (error === 'บันทึกอัตราไม่สำเร็จ · กรุณาลองใหม่') {error = ''; saveStatus();}}).then(() => notifyReportSummary('saved')).catch(() => {error = 'บันทึกอัตราไม่สำเร็จ · กรุณาลองใหม่'; saveStatus();});
    }
    function exportSaved(button = null) {
      if (readOnly) return null;
      if (!hasSavedState) {error = 'ยังไม่มีราคาและหมายเหตุที่เซฟให้ส่งออก';saveStatus();return null;}
      const state = payload(committed,committedFx), json = JSON.stringify(state,null,2);
      if (typeof options.onExport === 'function') options.onExport({state:JSON.parse(JSON.stringify(state)),json,filename:'aaf-sales-preview-price-catalog-v3.json'});
      if (button) {
        const toolbar = button.closest('.sp-save-prices'), panel = toolbar?.querySelector('[data-export-panel]'), output = panel?.querySelector('[data-export-json]');
        if (panel && output) {panel.hidden = false;output.value = json;output.focus();output.select();}
      }
      return state;
    }
    async function copyExport(button) {
      const panel = button.closest('.sp-save-prices')?.querySelector('[data-export-panel]'), output = panel?.querySelector('[data-export-json]'), status = panel?.querySelector('[data-export-copy-status]');
      if (!output) return;
      output.focus();output.select();
      try {if (!win.navigator?.clipboard?.writeText) throw new Error('clipboard unavailable');await win.navigator.clipboard.writeText(output.value);if(status)status.textContent = 'คัดลอกแล้ว';}
      catch {const copied = typeof doc.execCommand === 'function' && doc.execCommand('copy');if(status)status.textContent = copied ? 'คัดลอกแล้ว' : 'เลือก JSON แล้ว · กด Copy ได้ทันที';}
    }
    function syncInputs(active = doc.activeElement) {
      const fx = root.querySelector('[data-fx]');
      if (fx && fx !== active) fx.value = effectiveFx() ?? '';
      root.querySelectorAll('[data-free-price]').forEach(input => {
        const displayKey = knownDisplayKey(input.dataset.freePrice), key = priceKey(displayKey || input.dataset.freePrice), invalid = displayKey !== null && invalidDraftValues.has(displayKey);
        input.setAttribute('aria-label',input.dataset.priceLabel+' '+(currency(pricing.currencies,key) === 'USD' ? 'USD' : 'บาท')+'ต่อ'+unitName(input.dataset.unit));
        // Preserve the focused raw string (e.g. "2." or "0.05") and its caret.
        if (input !== active) {input.value = invalid ? invalidDraftValues.get(displayKey) : pricing.prices[key] ?? ''; input.setAttribute('aria-invalid',String(invalid));}
      });
      root.querySelectorAll('[data-free-currency]').forEach(input => {if (input !== active) input.value = currency(pricing.currencies,priceKey(input.dataset.freeCurrency));});
      root.querySelectorAll('[data-thickness-note]').forEach(input => {if (input !== active) input.value = pricing.notesByThickness[input.dataset.thicknessNote] || '';});
    }
    function rowValue(row) {
      if (!row) return null;
      const key = priceKey(specKey(row)), price = positive(pricing.prices[key]);
      const fx = currency(pricing.currencies,key) === 'USD' ? effectiveFx() : 1;
      return price !== null && fx !== null ? row.free*price*fx : null;
    }
    function valuation(rows) {
      const available = rows.filter(row => row.free > 0);
      const priced = available.filter(row => positive(pricing.prices[priceKey(specKey(row))]) !== null);
      const values = priced.map(rowValue).filter(value => value !== null);
      const partial = values.reduce((sum,value) => sum+value,0);
      return {value:values.length === available.length ? partial : null, partial,priced:priced.length,valued:values.length,total:available.length,missingFx:priced.filter(row => currency(pricing.currencies,priceKey(specKey(row))) === 'USD' && effectiveFx() === null).length};
    }
    const reportUnits = () => ({sheet:0,strip:0});
    const addReportUnit = (target,unit,value) => {if (Object.hasOwn(target,unit)) target[unit] += value;};
    function reportQuantities(rows, quantityOf) {
      const byUnit = reportUnits();let eq4x8 = 0, eq2_5 = 0;
      rows.forEach(row => {
        const qty = Number(quantityOf(row));if (!Number.isFinite(qty)) return;
        addReportUnit(byUnit,row.unit,qty);
        const areaEquivalent = qty*row.w*row.l/(1220*2440);
        eq4x8 += areaEquivalent;eq2_5 += areaEquivalent*row.t/2.5;
      });
      return {byUnit,eq4x8,eq2_5};
    }
    function committedPriceKey(displayKey) {
      const reverse = reversedSpecKey(displayKey);
      const owns = key => Object.hasOwn(committed.prices,key) || Object.hasOwn(committed.currencies,key);
      return owns(displayKey) ? displayKey : owns(reverse) ? reverse : displayKey;
    }
    function inventoryReport(field, rows = model.all.stock.rows) {
      const quantities = reportQuantities(rows,row => row[field]), unpricedSpecs = [];
      const unpricedByUnit = reportUnits(), missingFxByUnit = reportUnits();
      let knownValueTHB = 0, pricedSpecCount = 0, valuedSpecCount = 0, totalSpecCount = 0, missingFxSpecCount = 0;
      rows.forEach(row => {
        const qty = Number(row[field]);if (!(qty > 0)) return;
        totalSpecCount++;
        const key = committedPriceKey(specKey(row)), price = positive(committed.prices[key]);
        if (price === null) {addReportUnit(unpricedByUnit,row.unit,qty);unpricedSpecs.push({key:specKey(row),t:row.t,grade:row.grade,w:row.w,l:row.l,unit:row.unit,qty});return;}
        pricedSpecCount++;
        const code = currency(committed.currencies,key), fx = code === 'USD' ? effectiveFx(true) : 1;
        if (fx === null) {missingFxSpecCount++;addReportUnit(missingFxByUnit,row.unit,qty);return;}
        knownValueTHB += qty*price*fx;valuedSpecCount++;
      });
      const complete = valuedSpecCount === totalSpecCount;
      return {...quantities,valueTHB:complete ? knownValueTHB : null,knownValueTHB,unpricedSpecs,coverage:{complete,pricedSpecCount,valuedSpecCount,totalSpecCount,missingFxSpecCount,unpricedByUnit,missingFxByUnit}};
    }
    // Project the existing readiness allocation, never reserve a second time or
    // value stock with invoice money. Reject stale/incomplete readiness evidence.
    function inventoryPartition() {
      try {
        const keyOf = host.AafAllModel.exactSpecKey, epsilon = 1e-7;
        const near = (a,b) => {if (!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)>epsilon) throw new Error('allocation mismatch');};
        const rows = model.all.stock.rows.map(row => ({...row,soldStock:0,otherStock:0,soldShortage:0,otherShortage:0,soldDemand:0,otherDemand:0}));
        const pools = new Map(rows.map(row => [keyOf(row),row])), remaining = new Map(rows.map(row => [keyOf(row),row.physical]));
        const statusOrder = host.AafAllModel.constants.STATUS_ORDER;
        const allocations = model.allocationRows.map((row,index) => ({row,index})).filter(({row}) => row.status !== 'loaded' && row.reservesStock !== false);
        allocations.sort((a,b) => {
          const stage=statusOrder.indexOf(a.row.status)-statusOrder.indexOf(b.row.status);if(stage)return stage;
          const ready=row=>String(row.productStatus||'').trim().replace(/\s+/g,' ')==='พร้อมโหลด'?0:1;
          if(a.row.status==='forecast'&&ready(a.row)!==ready(b.row))return ready(a.row)-ready(b.row);
          return a.row.sourceIndex-b.row.sourceIndex||a.index-b.index;
        });
        const seen = new Set(), reservedStatusPools = new Map();
        allocations.forEach(({row}) => {
          const parts=options.readiness?.byAllocationId?.[row.id]?.parts, key=keyOf(row), pool=pools.get(key);
          if(seen.has(row.id)||!pool||!Array.isArray(parts)||parts.length!==1)throw new Error('missing allocation');
          seen.add(row.id);const part=parts[0], available=remaining.get(key), allocated=Math.min(row.qty,available);
          if(part.allocationId!==row.id||part.key!==key||keyOf(part)!==key)throw new Error('stale allocation');
          near(part.requested,row.qty);near(part.availableBefore,available);near(part.allocated,allocated);
          near(part.shortage,row.qty-allocated);near(part.remaining,available-allocated);
          const prefix=row.status==='paid'?'sold':'other';
          pool[prefix+'Stock']+=part.allocated;pool[prefix+'Shortage']+=part.shortage;pool[prefix+'Demand']+=part.requested;
          if (prefix === 'other') {
            if (!reservedStatusPools.has(row.status)) reservedStatusPools.set(row.status,new Map());
            const statusPool = reservedStatusPools.get(row.status);
            if (!statusPool.has(key)) statusPool.set(key,{...pool,statusStock:0,statusShortage:0,statusDemand:0});
            const statusRow = statusPool.get(key);statusRow.statusStock+=part.allocated;statusRow.statusShortage+=part.shortage;statusRow.statusDemand+=part.requested;
          }
          remaining.set(key,part.remaining);
        });
        rows.forEach(row => {
          near(row.soldStock+row.otherStock+row.free,row.physical);
          near(row.soldDemand+row.otherDemand,row.reserved);
          near(row.soldShortage+row.otherShortage,row.shortage);
          const statusRows = [...reservedStatusPools.values()].map(pool => pool.get(keyOf(row))).filter(Boolean);
          near(statusRows.reduce((sum,item) => sum+item.statusStock,0),row.otherStock);
          near(statusRows.reduce((sum,item) => sum+item.statusShortage,0),row.otherShortage);
          near(statusRows.reduce((sum,item) => sum+item.statusDemand,0),row.otherDemand);
        });
        const withProductionSpecs = (field,report) => ({...report,productionSpecs:rows.filter(row => row[field] > 0).map(row => ({key:specKey(row),t:row.t,grade:row.grade,w:row.w,l:row.l,unit:row.unit,qty:row[field]}))});
        const byStatus = Object.fromEntries([...reservedStatusPools].map(([status,pool]) => {
          const statusRows = [...pool.values()];
          const withStatusProductionSpecs = (field,report) => ({...report,productionSpecs:statusRows.filter(row => row[field] > 0).map(row => ({key:specKey(row),t:row.t,grade:row.grade,w:row.w,l:row.l,unit:row.unit,qty:row[field]}))});
          return [status,{inStock:inventoryReport('statusStock',statusRows),toProduce:withStatusProductionSpecs('statusShortage',inventoryReport('statusShortage',statusRows)),demand:inventoryReport('statusDemand',statusRows)}];
        }));
        return {status:'verified',reservationPolicy:model.reservationPolicy,basis:'committed-stock-catalog',sold:{inStock:inventoryReport('soldStock',rows),toProduce:withProductionSpecs('soldShortage',inventoryReport('soldShortage',rows)),demand:inventoryReport('soldDemand',rows)},reserved:{inStock:inventoryReport('otherStock',rows),toProduce:withProductionSpecs('otherShortage',inventoryReport('otherShortage',rows)),demand:inventoryReport('otherDemand',rows),byStatus}};
      } catch {
        return {status:'unavailable',reason:'ยอดจัดสรรไม่ตรงกับข้อมูลหัวข้อ 02 · ยังไม่แสดงตัวเลขแยกกลุ่ม'};
      }
    }
    function soldReport(rows) {
      const quantities = reportQuantities(rows,row => row.qty), byCurrency = {};
      let knownValueTHB = 0, knownRowCount = 0, unknownRowCount = 0, missingFxRowCount = 0;
      rows.forEach(row => {
        if (!Number.isFinite(row.amount) || !row.currency) {unknownRowCount++;return;}
        byCurrency[row.currency] = (byCurrency[row.currency] || 0)+row.amount;
        if (row.currency === 'THB') {knownValueTHB += row.amount;knownRowCount++;return;}
        if (row.currency === 'USD' && effectiveFx(true) !== null) {knownValueTHB += row.amount*effectiveFx(true);knownRowCount++;return;}
        missingFxRowCount++;
      });
      const complete = unknownRowCount === 0 && missingFxRowCount === 0;
      return {...quantities,valueTHB:complete ? knownValueTHB : null,knownValueTHB,byCurrency,coverage:{complete,knownRowCount,unknownRowCount,missingFxRowCount,totalRowCount:rows.length,orderCount:new Set(rows.map(row => row.orderKey)).size}};
    }
    function getReportSummary() {
      const loadedRows = model.salesRows.filter(row => row.status === 'loaded');
      const paidUnloadedRows = model.salesRows.filter(row => row.status === 'paid');
      return {version:2,catalog:{hasSavedCatalog:hasSavedState,fxThbPerUsd:effectiveFx(true),savedAt:committed.savedAt || null,...(automaticFx?{automaticFx:true,fxStatus:fxStatusText(),fxDate:autoFx?.date||null}:{})},partition:inventoryPartition(),physical:inventoryReport('physical'),reserved:inventoryReport('reserved'),free:inventoryReport('free'),sold:{...soldReport([...loadedRows,...paidUnloadedRows]),loaded:soldReport(loadedRows),paidUnloaded:soldReport(paidUnloadedRows)}};
    }
    function notifyReportSummary(reason) {
      if (destroyed) return;
      const meta = {reason};
      const call = callback => {try {callback(getReportSummary(),meta);} catch (cause) {win.console?.error?.('AAF sales preview report summary callback failed',cause);}};
      if (typeof options.onReportSummary === 'function') call(options.onReportSummary);
      if (reason === 'saved' && typeof options.onSavedReportSummary === 'function' && options.onSavedReportSummary !== options.onReportSummary) call(options.onSavedReportSummary);
    }
    const bahtText = (value, decimals = 0) => Number.isFinite(value) ? '≈ '+value.toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals})+' ฿' : 'รอมูลค่า';

    const unitText = (byUnit, fallback = '0 แผ่น') => Object.entries(byUnit || {}).filter(([,value]) => value !== 0).map(([unit,value]) => fmt(value)+' '+unitName(unit)).join(' + ') || fallback;
    const quantitiesText = totals => unitText(totals?.quantities?.byUnit);
    const stockText = (stock, field) => unitText(Object.fromEntries(Object.entries(stock.unitTotals || {}).map(([unit,totals]) => [unit,totals[field]])));
    function moneyNative(money) {
      const known = Object.entries(money?.byCurrency || {}).map(([code,value]) => fmt(value)+' '+code).join(' + ');
      if (!money?.totalRows) return '≈ 0';
      return (known ? '≈ '+known : 'รอมูลค่า')+(money.unknownRows ? ' · ยังไม่รวม '+money.unknownRows+' บรรทัด' : '');
    }
    function moneyMarkup(money) {
      const known = Object.entries(money?.byCurrency || {});
      const values = known.length ? known.map(([code,value]) => '<span class="sp-value-line">≈ '+fmt(value)+' '+esc(code)+'</span>').join('') : '<span class="sp-value-line">'+(money?.totalRows ? 'รอมูลค่า' : '≈ 0')+'</span>';
      return values+(money?.unknownRows ? '<small class="sp-money-partial">ยังไม่รวม '+fmt(money.unknownRows)+' บรรทัด</small>' : '');
    }
    function unitMarkup(byUnit) {
      const units = Object.entries(byUnit || {}).filter(([,value]) => value !== 0);
      return units.length ? units.map(([unit,value]) => '<span class="sp-unit-line">'+fmt(value)+' '+esc(unitName(unit))+'</span>').join('') : '<span class="sp-unit-line">0 แผ่น</span>';
    }
    const stockUnitMarkup = (stock,field) => unitMarkup(Object.fromEntries(Object.entries(stock.unitTotals || {}).map(([unit,totals]) => [unit,totals[field]])));
    function moneySummary(rows) {
      const byCurrency = {}; let unknownRows = 0;
      rows.forEach(row => {if (Number.isFinite(row.amount) && row.currency) byCurrency[row.currency] = (byCurrency[row.currency] || 0)+row.amount; else unknownRows++;});
      return {byCurrency,unknownRows,totalRows:rows.length};
    }
    function moneyBaht(money, decimals = 0) {
      let known = 0, hasKnown = false, unknownCurrency = 0;
      Object.entries(money?.byCurrency || {}).forEach(([code,amount]) => {
        if (code === 'THB') {known += amount; hasKnown = true;}
        else if (code === 'USD' && effectiveFx() !== null) {known += amount*effectiveFx(); hasKnown = true;}
        else unknownCurrency++;
      });
      if (!money?.totalRows) return bahtText(0,decimals);
      const qualifiers = [];
      if (money.unknownRows) qualifiers.push('ยังไม่รวม '+money.unknownRows+' บรรทัดที่รอมูลค่า');
      if (unknownCurrency) qualifiers.push(effectiveFx() === null ? 'รออัตราแลกเปลี่ยน' : 'มีสกุลเงินที่ยังไม่แปลง');
      return (hasKnown ? bahtText(known,decimals) : 'รอมูลค่า')+(qualifiers.length ? ' · '+qualifiers.join(' · ') : '');
    }
    const equivalentText = totals => {
      const equivalent = totals?.equivalent4x8At2_5;
      if (!equivalent) return '—';
      return fmt(equivalent.sheet)+(equivalent.complete ? '' : ' · บางหน่วยยังแปลงไม่ได้');
    };
    const rowEquivalent = row => ['sheet','strip'].includes(row.unit) ? fmt(row.qty*row.w*row.l*row.t/(1220*2440*2.5)) : 'รอหน่วยที่แปลงได้';
    function paymentText(row) {
      if (['loaded','paid'].includes(row.status)) {
        if (row.term === 'LC') return 'รอ LC';
        if (row.term === 'TT' && !row.isDeposit) return 'รับเงินแล้ว';
      }
      return row.payment || 'ยังไม่ระบุ';
    }
    const reasonText = reason => ({'mixed-invoice-across-specs':'มูลค่าอินวอยซ์หลายสเปก · ยังไม่แบ่งรายสเปก','source-amount-missing':'รอมูลค่ารายการต้นทาง','currency-unknown':'รอยืนยันสกุลเงิน','deposit-net-amount-unknown':'มีมัดจำ · ยังไม่ทราบยอดคงค้างสุทธิ'}[reason] || 'รอยืนยันมูลค่า');
    function rowMoneyText(row) {
      if (Number.isFinite(row.amount) && row.currency) return (row.isDeposit && row.netReceivableAmount !== null ? 'คงค้างสุทธิ ' : '≈ ')+fmt(row.amount)+' '+row.currency;
      return reasonText(row.amountReason);
    }
    function sourceCurrencyNotes(row) {
      const notes = Array.isArray(row.notes) ? row.notes : typeof row.notes === 'string' ? [row.notes] : [];
      return notes.filter(note => typeof note === 'string' && sourceCurrencyNoteIncludes.some(fragment => note.includes(fragment)));
    }
    function rowProvenance(row) {
      const notes = [];
      if (row.ref) notes.push(row.ref);
      if (row.mixedAllocation) notes.push('มิกซ์ → '+row.grade+' '+fmt(row.allocationShare*100)+'% · แผ่นและเงินตามสัดส่วน');
      if (paidOverrideRefs.has(row.ref) && row.status === 'paid') notes.push('เจ้าของยืนยันเก็บเงินแล้ว · ไม่แก้สถานะต้นทาง');
      if (row.isDeposit) {
        if (row.netReceivableAmount !== null && row.confirmedDepositAmount !== null) notes.push('มัดจำรับแล้ว '+fmt(row.confirmedDepositAmount)+' '+(row.currency || '')+' · ยอดแสดงเป็นคงค้างสุทธิ ไม่บวกมัดจำซ้ำ');
        else notes.push('มีมัดจำ · ยังไม่ทราบยอดคงค้างสุทธิ');
      }
      sourceCurrencyNotes(row).forEach(note => notes.push(note));
      return notes.map(note => '<span class="sp-provenance">'+esc(note)+'</span>').join('');
    }
    function totalsMarkup(totals) {
      return '<span class="sp-group-totals"><span class="sp-metric"><small>'+fmt(totals.orderCount)+' รายการ ·</small><strong>'+unitMarkup(totals.quantities.byUnit)+'</strong></span><span class="sp-metric"><small>เทียบ 4×8 @2.5</small><strong>'+esc(equivalentText(totals))+'</strong></span><span class="sp-metric"><small>มูลค่าโดยประมาณ</small><strong>'+moneyMarkup(totals.money)+'</strong></span></span>';
    }
    function customerTable(rows) {
      if (!rows.length) return '<span class="sp-empty">ไม่มีรายการในกลุ่มนี้</span>';
      return '<div class="sp-table-scroll"><table class="sp-table"><thead><tr><th scope="col">ลูกค้า</th><th class="sp-qty" scope="col">จำนวน</th><th class="sp-grade-cell" scope="col">เกรด</th><th class="sp-thickness" scope="col">หนา (มม.)</th><th class="sp-size" scope="col">ขนาด (มม.)</th><th class="sp-equivalent" scope="col">แผ่นเทียบ<br>4×8 @2.5</th><th class="sp-payment" scope="col">สถานะการรับเงิน</th><th class="sp-money" scope="col">มูลค่ารายการ<br>โดยประมาณ</th></tr></thead><tbody>'+rows.map(row => '<tr><td><span class="sp-customer-name"><span class="sp-term">'+esc(row.term === 'unknown' ? '—' : row.term === 'credit' ? 'เครดิต' : row.term)+'</span><span class="sp-term-divider" aria-hidden="true">—</span><span>'+esc(row.customer)+'</span></span>'+rowProvenance(row)+'</td><td class="sp-qty"><strong>'+fmt(row.qty)+'</strong><small class="sp-unit-break">'+esc(unitName(row.unit))+'</small></td><td class="sp-grade-cell">'+esc(row.grade === 'mix' ? 'AAA+B' : row.grade)+'</td><td class="sp-thickness">'+esc(thick(row.t))+'</td><td class="sp-size">'+fmt(row.w)+' × '+fmt(row.l)+'</td><td class="sp-equivalent">'+esc(rowEquivalent(row))+'</td><td class="sp-payment"><span class="sp-payment-label">'+esc(paymentText(row))+'</span></td><td class="sp-money">'+esc(rowMoneyText(row))+'</td></tr>').join('')+'</tbody></table></div>';
    }
    function saveToolbar() {if(readOnly)return '<p class="sp-save-scope">ดูอย่างเดียว · ใช้ราคาและหมายเหตุที่เจ้าของบันทึกไว้</p>';return '<div class="sp-save-prices"><button type="button" class="cursor-interaction" data-save-prices aria-label="เซฟราคาและหมายเหตุทุกความหนา">เซฟราคาและหมายเหตุ</button><button type="button" class="cursor-interaction" data-export-prices aria-label="ส่งออก JSON ราคาและหมายเหตุที่เซฟแล้ว">Export JSON ที่เซฟแล้ว</button><span class="sp-save-status" data-save-price-status role="status" aria-live="polite"></span><span class="sp-save-scope">'+esc(options.persistenceLabel || 'เก็บราคา สกุลเงิน และหมายเหตุในพรีวิว Codex นี้ · ไม่แก้สต๊อกหรือข้อมูลส่วนกลาง')+' · Export ไม่รวมร่างที่ยังไม่เซฟ</span><div class="sp-export-panel" data-export-panel hidden style="flex-basis:100%;width:100%"><label class="sp-thickness-note-label">JSON สำหรับย้าย catalog ที่เซฟแล้ว<textarea class="sp-thickness-note" rows="8" readonly data-export-json aria-label="JSON ราคาและหมายเหตุที่เซฟแล้ว"></textarea></label><button type="button" class="cursor-interaction" data-copy-export-json>คัดลอก JSON</button><span class="sp-save-status" data-export-copy-status role="status" aria-live="polite">เลือกข้อความแล้วคัดลอกได้ทันที</span></div></div>';}
    function thicknessNotesMarkup(thicknesses, scopeId) {
      const keys = [...new Set(thicknesses.map(thicknessKey).filter(key => key !== null))].sort((a,b) => Number(a)-Number(b));
      const fields = '<div class="sp-free-notes">'+keys.map(key => {
        const id = scopeId+'-note-'+encodeURIComponent(key).replaceAll('%','_');
        return '<label class="sp-thickness-note-label" for="'+esc(id)+'">หมายเหตุความหนา '+esc(thick(key))+' มม.<textarea id="'+esc(id)+'" class="sp-thickness-note" rows="2" data-thickness-note="'+esc(key)+'" placeholder="พิมพ์หมายเหตุ แล้วกดเซฟราคาและหมายเหตุ"></textarea></label>';
      }).join('')+'</div>';
      return keys.length > 1 ? '<details class="sp-free-notes-disclosure"><summary class="cursor-interaction">หมายเหตุรายความหนา</summary>'+fields+'</details>' : fields;
    }
    function historicalReference(key) {
      const catalogKey = priceKey(key), reverse = reversedSpecKey(catalogKey);
      const reference = Object.hasOwn(historicalFreePriceReferences,catalogKey) ? historicalFreePriceReferences[catalogKey] : Object.hasOwn(historicalFreePriceReferences,reverse) ? historicalFreePriceReferences[reverse] : null;
      return reference && positive(reference.price) !== null && ['THB','USD'].includes(reference.currency) ? reference : null;
    }
    function historicalPriceText(key) {
      const reference = historicalReference(key);
      if (!reference) return '';
      key = priceKey(key);
      const period = [reference.dateMin,reference.dateMax].filter(value => typeof value === 'string' && value).filter((value,index,values) => values.indexOf(value) === index).join(' – ');
      const evidence = [period,Number.isInteger(reference.count) && reference.count > 0 ? fmt(reference.count)+' รายการ' : ''].filter(Boolean).join(' · ');
      const price = positive(pricing.prices[key]);
      if (price === null) return 'ราคาเฉลี่ยย้อนหลังอ้างอิง '+fmt(Number(reference.price),6)+' '+reference.currency+(evidence ? ' · '+evidence : '');
      if (price === Number(reference.price) && currency(pricing.currencies,key) === reference.currency) return 'เฉลี่ยย้อนหลัง'+(evidence ? ' · '+evidence : '');
      return 'ปรับราคาเอง · มีราคาอ้างอิงย้อนหลัง';
    }
    function historicalPriceMarkup(key) {
      return historicalReference(key) ? '<small class="sp-historical-price" data-historical-free-price="'+esc(key)+'">'+esc(historicalPriceText(key))+'</small>' : '';
    }
    function historicalSourceMarkup(rows) {
      const references = rows.map(row => historicalReference(specKey(row))).filter(Boolean);
      if (!references.length) return '';
      const sources = [...new Set(references.map(reference => reference.sourceLabel).filter(value => typeof value === 'string' && value.trim()))];
      return '<small class="sp-historical-source">'+esc([sources.join(' / '),'ราคาอ้างอิงย้อนหลัง · เฉลี่ยถ่วงจำนวน · สกุลเงินต้นฉบับ · ไม่เติมราคาอัตโนมัติ'].filter(Boolean).join(' · '))+'</small>';
    }
    function freeMarkup(inventory, scopeId, thicknesses) {
      const rows = inventory.rows.filter(row => row.free > 0);
      const controls = saveToolbar();
      if (!rows.length) return controls+thicknessNotesMarkup(thicknesses || inventory.rows.map(row => row.t),scopeId)+'<span class="sp-empty">ไม่มีสเปกที่มี Free มากกว่า 0</span>';
      return controls+'<div class="sp-table-scroll"><table class="sp-stock-table sp-free-table"><caption>เฉพาะสเปกที่มี Free มากกว่า 0 · ราคาต่อแผ่นจริง / ชิ้นแถบ · เลือกบาทหรือ USD · เว้นว่าง = ยังไม่ทราบราคา'+historicalSourceMarkup(rows)+'</caption><thead><tr><th scope="col">หนา (มม.)</th><th scope="col">เกรด</th><th scope="col">ขนาด (มม.)</th><th scope="col">Free</th><th scope="col">ราคาต่อหน่วย</th><th scope="col">หมายเหตุ</th><th scope="col">มูลค่า Free โดยประมาณ (บาท)</th></tr></thead><tbody>'+rows.map(row => {
        const key = specKey(row), label = 'ราคาประเมิน '+thick(row.t)+' มม. '+row.grade+' '+row.w+' × '+row.l;
        const noteId = scopeId+'-note-'+encodeURIComponent(key).replaceAll('%','_');
        return '<tr><td>'+esc(thick(row.t))+'</td><td>'+esc(row.grade)+'</td><td>'+fmt(row.w)+' × '+fmt(row.l)+'</td><td>'+fmt(row.free)+' '+esc(unitName(row.unit))+'</td><td><div class="sp-price-controls"><input class="sp-number-input" type="number" min="0.0000001" step="any" inputmode="decimal" placeholder="ใส่ราคา" data-unit="'+esc(row.unit)+'" data-price-label="'+esc(label)+'" data-free-price="'+esc(key)+'"><select class="sp-currency-select cursor-interaction" aria-label="สกุลเงิน '+esc(label)+'" data-free-currency="'+esc(key)+'"><option value="THB">บาท</option><option value="USD">USD</option></select></div>'+historicalPriceMarkup(key)+'</td><td class="sp-free-note-cell"><textarea id="'+esc(noteId)+'" class="sp-thickness-note" rows="2" data-thickness-note="'+esc(thicknessKey(row.t))+'" aria-label="หมายเหตุความหนา '+esc(thick(row.t))+' มม. '+esc(row.grade)+' '+row.w+' × '+row.l+'" placeholder="ใส่หมายเหตุความหนานี้"></textarea></td><td class="sp-free-value-cell" data-free-row-value="'+esc(key)+'"></td></tr>';
      }).join('')+'</tbody><tfoot><tr><td colspan="3">รวม Free</td><td>'+esc(stockText(inventory,'free'))+'</td><td colspan="2"><small data-free-coverage="'+scopeId+'"></small></td><td class="sp-free-value-cell" data-free-value="'+scopeId+'"></td></tr></tfoot></table></div>';
    }
    function stockMarkup(inventory) {
      return '<div class="sp-table-scroll"><table class="sp-stock-table"><thead><tr><th scope="col">เกรด</th><th scope="col">ขนาด (มม.)</th><th scope="col">หน่วย</th><th scope="col">หลังโยก</th><th scope="col">ยังไม่โหลด</th><th scope="col">Free</th><th scope="col">ต้องผลิตใหม่</th></tr></thead><tbody>'+inventory.rows.map(row => '<tr><td>'+esc(row.grade)+'</td><td>'+fmt(row.w)+' × '+fmt(row.l)+(row.missingStockSpec ? '<span class="sp-provenance">ไม่พบสต๊อกตรงสเปก</span>' : '')+'</td><td>'+esc(unitName(row.unit))+'</td><td>'+fmt(row.physical)+'</td><td>'+fmt(row.reserved)+'</td><td>'+fmt(row.free)+'</td><td>'+fmt(row.shortage)+'</td></tr>').join('')+'</tbody></table></div><span class="sp-provenance">Physical หลังโยก · โหลดแล้วไม่หักซ้ำ · ไม่ชดเชยของขาดข้ามขนาด เกรด หรือหน่วย</span>';
    }
    function renderGrade(thickness, grade, view, parent, thicknessId) {
      const gradeLabel = grade === 'all' ? 'รวมทุกเกรด' : 'เกรด '+grade;
      const id = thicknessId+'-g-'+encodeURIComponent(grade).replaceAll('%','_');
      const detailId = id+'-details';
      const inventory = view.stock, groups = Object.values(view.groups);
      scopes.set(id,{view,inventory});
      const section = doc.createElement('section'); section.className = 'sp-grade'+(grade === 'all' ? ' sp-grade-total' : ''); section.id = id;
      section.setAttribute('aria-label',thick(thickness)+' มม. '+gradeLabel);
      section.innerHTML = '<header class="sp-grade-heading"><h3>'+esc(thick(thickness))+' มม. · '+esc(gradeLabel)+'</h3>'+totalsMarkup(view.totals)+'<button type="button" class="sp-detail-toggle cursor-interaction" aria-expanded="false" aria-controls="'+detailId+'">รายละเอียด</button></header><div class="sp-overview"><div class="sp-bar" aria-label="ยอดตามสถานะ '+esc(gradeLabel)+'"></div></div><div id="'+detailId+'" class="sp-groups" hidden></div>';
      const bar = section.querySelector('.sp-bar'), container = section.querySelector('.sp-groups'), toggle = section.querySelector('.sp-detail-toggle');
      parent.append(section);
      const show = shown => {container.hidden = !shown; container.dataset.detailView = 'all'; toggle.setAttribute('aria-expanded',String(shown)); toggle.textContent = shown ? 'ซ่อนรายละเอียด' : 'รายละเอียด';syncFreeDisclosure(id);};
      on(toggle,'click',() => show(container.hidden));
      function detail(kind, title, summary, body) {
        const node = doc.createElement('details');node.className = 'sp-group sp-'+kind+'-detail';node.id = id+'-'+kind+'-detail';
        node.innerHTML = '<summary class="cursor-interaction"><span class="sp-name"><span class="sp-chevron" aria-hidden="true">›</span>'+esc(title)+'</span><span class="sp-stock-detail-total">'+esc(summary)+'</span></summary><div class="sp-children">'+body+'</div>';
        container.append(node); return node;
      }
      const free = detail('free','Free แยกขนาด',stockText(inventory,'free'),freeMarkup(inventory,id,[thickness]));
      const stock = detail('stock','สต๊อกหลังโยก / Free','หลังโยก '+stockText(inventory,'physical')+' · Free '+stockText(inventory,'free'),stockMarkup(inventory));
      function toggleMetric(kind, target) {
        const visible = !container.hidden && target.open && ['all',kind].includes(container.dataset.detailView);
        if (visible) {
          target.open = false;
          if (container.dataset.detailView === kind) show(false);
        } else {
          show(true);container.dataset.detailView = kind;
          container.querySelectorAll('details').forEach(node => node.open = false);
          target.open = true;target.scrollIntoView({block:'nearest'});target.querySelector('summary').focus({preventScroll:true});
        }
        syncFreeDisclosure(id);
      }
      freeDisclosures.set(id,{target:free,isOpen:() => !container.hidden && free.open && ['all','free'].includes(container.dataset.detailView),toggle:() => toggleMetric('free',free)});
      on(free,'toggle',() => syncFreeDisclosure(id));
      const liveGroups = groups.filter(group => group.rows.length);
      bar.style.setProperty('--sp-status-count',Math.max(1,liveGroups.length)+2);
      if (!liveGroups.length) bar.innerHTML = '<span class="sp-bar-empty">ไม่มีรายการขายในชุดนี้</span>';
      let unloadedHeading = false;
      groups.forEach(group => {
        if (!group.rows.length) return;
        if (group.id !== 'loaded' && !unloadedHeading) {
          unloadedHeading = true;
          if (view.unloaded?.totals) {const divider = doc.createElement('div');divider.className = 'sp-divider';divider.innerHTML = '<strong>ยังไม่โหลด</strong>'+totalsMarkup(view.unloaded.totals);container.append(divider);}
        }
        const status = doc.createElement('details');status.className = 'sp-group';status.id = id+'-status-'+group.id;status.open = true;
        status.style.setProperty('--sp-color','var(--sp-'+(group.id === 'unknown' ? 'forecast' : group.id)+')');
        status.innerHTML = '<summary class="cursor-interaction"><span class="sp-name"><span class="sp-chevron" aria-hidden="true">›</span><i class="sp-swatch" aria-hidden="true"></i>'+esc(group.title)+'</span>'+totalsMarkup(group.totals)+'</summary><div class="sp-children">'+customerTable(group.rows)+'</div>';
        container.append(status);
        const button = doc.createElement('button');button.type = 'button';button.className = 'sp-segment cursor-interaction';button.style.setProperty('--sp-color','var(--sp-'+(group.id === 'unknown' ? 'forecast' : group.id)+')');
        button.setAttribute('aria-label',group.title+' '+quantitiesText(group.totals));button.setAttribute('aria-controls',status.id);
        button.innerHTML = '<span class="sp-segment-label">'+esc(group.short)+'</span><strong>'+esc(quantitiesText(group.totals))+'</strong>';
        on(button,'click',() => {show(true);status.open = true;status.scrollIntoView({block:'nearest'});status.querySelector('summary').focus({preventScroll:true});});bar.append(button);
      });
      [['stock','สต๊อกหลังโยก','physical',stock],['free','Free','free',free]].forEach(([kind,label,field,target]) => {
        const button = doc.createElement('button');button.type = 'button';button.className = 'sp-segment sp-stock-tile cursor-interaction';button.dataset.stockMetric = kind;button.style.setProperty('--sp-color','var(--sp-'+kind+')');button.setAttribute('aria-controls',target.id);
        const shortage = Object.values(inventory.unitTotals).some(totals => totals.shortage > 0);
        button.innerHTML = '<span class="sp-segment-label">'+label+'</span><strong>'+esc(stockText(inventory,field))+'</strong>'+(kind === 'free' && shortage ? '<small class="sp-shortage-line">ต้องผลิตใหม่ '+esc(stockText(inventory,'shortage'))+'</small>' : '');
        button.setAttribute('aria-expanded','false');
        if (kind === 'free') freeDisclosures.get(id).barButton = button;
        on(button,'click',() => {toggleMetric(kind,target);button.setAttribute('aria-expanded',String(!container.hidden && target.open));});
        on(target,'toggle',() => button.setAttribute('aria-expanded',String(!container.hidden && target.open)));
        bar.append(button);
      });
      syncFreeDisclosure(id);
      return section;
    }
    function receiptMonthText(month) {
      const parts = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month || '');
      if (!parts) return 'ไม่ระบุเดือน';
      return ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][Number(parts[2])-1]+(Number(parts[1])+543);
    }
    function receiptDateText(event) {
      const date = /^(\d{4}-\d{2})-(\d{2})$/.exec(event.date || '');
      if (date) return Number(date[2])+' '+receiptMonthText(date[1]);
      return event.month ? receiptMonthText(event.month) : 'ยังไม่ระบุวันรับเงิน';
    }
    function receiptNativeAmount(event) {
      return Number.isFinite(event.amount) && event.currency ? (event.approximate ? '≈ ' : '')+fmt(event.amount)+' '+event.currency : 'รอมูลค่า';
    }
    function receiptBreakdownMarkup(id) {
      if (id !== 'sp-money-all' || !receiptBreakdown?.buckets) return '';
      const labels = {
        currentMonth:'เดือนนี้ · '+receiptMonthText(receiptBreakdown.month),
        previousMonth:'เดือนที่แล้ว · '+receiptMonthText(receiptBreakdown.previousMonth),
        earlier:'ก่อน '+receiptMonthText(receiptBreakdown.previousMonth),
        future:'ข้อมูลผิดพลาด · วันรับเงินอยู่ในอนาคต',
        unallocated:'ยังระบุเดือนไม่ได้'
      };
      const buckets = Object.keys(labels).filter(key => ['currentMonth','previousMonth'].includes(key) || receiptBreakdown.buckets[key]?.events?.length);
      const futureEvents = receiptBreakdown.buckets.future?.events || [];
      const errorAlert = futureEvents.length ? '<div class="sp-receipt-error" role="alert" data-receipt-error><strong>ข้อมูลผิดพลาด · วันรับเงินอยู่ในอนาคต</strong><span>'+fmt(futureEvents.length)+' รายการ · <span data-receipt-error-total="future"></span></span><small>สถานะรับเงินแล้ว แต่วันที่ยังมาไม่ถึง · ต้องตรวจข้อมูลต้นทาง</small></div>' : '';
      return errorAlert+'<details class="sp-finance-subset sp-receipt-breakdown" data-receipt-breakdown><summary class="cursor-interaction">แยกตามเดือนที่รับเงิน</summary><div class="sp-receipt-buckets">'+buckets.map(key => {
        const events = receiptBreakdown.buckets[key]?.events || [];
        return '<details class="sp-receipt-bucket" data-receipt-bucket="'+key+'"><summary class="cursor-interaction"><span class="sp-receipt-bucket-heading"><span>'+esc(labels[key])+'</span><strong data-receipt-total="'+key+'"></strong></span></summary><div class="sp-receipt-events">'+(events.length ? events.map((event,index) => '<div class="sp-receipt-event"><span class="sp-receipt-customer">'+esc(event.customer || 'ไม่ระบุลูกค้า')+'</span><small>'+esc([event.ref || 'ไม่ระบุเอกสาร',receiptDateText(event),event.label].filter(Boolean).join(' · '))+'</small><span class="sp-receipt-native">'+esc(receiptNativeAmount(event))+'</span><span data-receipt-event-amount="'+key+'|'+index+'"></span></div>').join('') : '<span class="sp-empty">ไม่มีรายการรับเงินในเดือนนี้</span>')+'</div></details>';
      }).join('')+'</div><small class="sp-receipt-basis">อิงวันรับเงินใน AAF Sales · บาทแปลงด้วยอัตราที่เลือก</small></details>';
    }
    function financeMarkup(id, view) {
      function list(bucket, label) {return '<details class="sp-finance-subset"><summary class="cursor-interaction">'+label+'</summary><div data-finance-list="'+id+'|'+bucket+'"></div></details>';}
      function termSplit(bucket) {return '<dl class="sp-payment-split" aria-label="TT LC แยกกัน"><div><dt>TT · เงินสดที่จะเข้า</dt><dd data-finance-term="'+id+'|'+bucket+'|TT"></dd></div><div><dt>LC · เงินรอเก็บ</dt><dd data-finance-term="'+id+'|'+bucket+'|LC"></dd></div><div data-term-unknown="'+id+'|'+bucket+'"><dt>ยังไม่ระบุ TT / LC</dt><dd data-finance-term="'+id+'|'+bucket+'|unknown"></dd></div></dl>';}
      return '<div class="sp-finance-grid"><section class="sp-finance-block"><h3>ได้เงินแล้ว</h3><strong class="sp-finance-value" data-finance-amount="'+id+'|received"></strong>'+receiptBreakdownMarkup(id)+'<span class="sp-finance-description">TT · โหลดแล้ว + เก็บเงินแล้ว</span><details class="sp-finance-subset"><summary class="cursor-interaction">โหลดแล้ว · รอเก็บ LC <span data-finance-amount="'+id+'|loadedLc"></span></summary><div data-finance-list="'+id+'|loadedLc"></div><small>ไม่รวมในยอดได้เงินแล้ว</small></details>'+list('received','ดูรายการได้เงินแล้ว')+'</section><section class="sp-finance-block"><h3>ตามเก็บเงิน <span class="sp-confidence">80%</span></h3><strong class="sp-finance-value" data-finance-amount="'+id+'|followup"></strong>'+termSplit('followup')+'<span class="sp-finance-description">'+(model.reservationPolicy === 'aaf-firm-only-20261003-v1' ? 'เปิด PI · LC ยังไม่โหลด' : 'เปิด PI · มีเรือแล้ว · LC ยังไม่โหลด')+'</span>'+list('followup','ดูรายการที่ต้องตาม')+'</section><section class="sp-finance-block"><h3>อยู่ระหว่างขาย <span class="sp-confidence">40%</span></h3><strong class="sp-finance-value" data-finance-amount="'+id+'|opportunity"></strong>'+termSplit('opportunity')+'<span class="sp-finance-description">'+(model.reservationPolicy === 'aaf-firm-only-20261003-v1' ? 'มีเรือแล้ว' : 'เจรจา · Forecast')+'</span>'+list('opportunity','ดูรายการโอกาสขาย')+'</section><section class="sp-finance-block"><h3>เพิ่มยอดขายจาก Free</h3><strong class="sp-finance-value" data-free-value="'+id+'-g-all"></strong><span class="sp-finance-description" data-free-coverage="'+id+'-g-all"></span><button class="sp-price-link cursor-interaction" type="button" data-open-free="'+id+'-g-all">ใส่ราคาประเมินรายขนาด ↓</button></section></div><div class="sp-finance-note">≈ มูลค่ารายการตามสถานะ ไม่ใช่ยอดเงินจริงเข้าบัญชี</div>'+(view.finance.stages.unknown.rows.length ? '<div class="sp-finance-unknown"><details><summary class="cursor-interaction">รอยืนยันสถานะรับเงิน <span data-finance-amount="'+id+'|unknown"></span></summary><div data-finance-list="'+id+'|unknown"></div></details></div>' : '');
    }
    function receivedLoadingMarkup(row) {
      if (row.reservesStock === false && row.status !== 'loaded') return '<span class="sp-empty">ไม่กันสต๊อก · คงไว้ใน Free</span>';
      if (row.status === 'loaded') return '<span class="sp-load-status sp-load-status-loaded" data-load-status="loaded" aria-label="สถานะการโหลด: โหลดแล้ว">โหลดแล้ว</span>';
      const readiness = options.readiness?.byAllocationId?.[row.id] || options.readiness?.byRowId?.[row.id];
      const needsProduction = Boolean(readiness && Object.values(readiness.shortageByUnit).some(value => value > 1e-7));
      let content = '<span class="sp-empty">รอตรวจการจัดสรรสต๊อก</span>';
      if (readiness) {
        const label = readiness.state === 'ready' ? 'มีสต๊อกครบ · พร้อมจัดโหลด' : readiness.state === 'partial' ? 'มีสต๊อกบางส่วน · ต้องผลิตใหม่' : 'ยังไม่มีสต๊อก · ต้องผลิตใหม่';
        content = '<strong class="sp-ready-result">'+label+'</strong><dl class="sp-ready-totals"><div><dt>ยอดสั่ง</dt><dd>'+unitMarkup(readiness.requestedByUnit)+'</dd></div><div><dt>จัดสรรจากสต๊อก</dt><dd>'+unitMarkup(readiness.allocatedByUnit)+'</dd></div><div'+(needsProduction?' class="sp-ready-needed"':'')+'><dt>ต้องผลิตใหม่</dt><dd>'+unitMarkup(readiness.shortageByUnit)+'</dd></div></dl>'
          +readiness.parts.map(part => '<div class="sp-ready-part"><small>'+esc(thick(part.t)+' มม. '+part.grade+' · '+fmt(part.w)+' × '+fmt(part.l))+'</small><span>มีของ '+fmt(part.allocated)+' '+esc(unitName(part.unit))+'</span><span class="'+(part.shortage>0?'sp-ready-shortage':'')+'">ต้องผลิตใหม่ '+fmt(part.shortage)+' '+esc(unitName(part.unit))+'</span></div>').join('')
          +'<small class="sp-ready-basis">ตามลำดับจอง · สต๊อกหลังโยก · พรีวิว</small>';
      }
      const pendingLabel = needsProduction ? 'ยังไม่โหลด · ต้องผลิตใหม่' : 'ยังไม่โหลด · เตรียมสินค้า';
      return '<details class="sp-loading-detail"><summary class="sp-load-status sp-load-status-pending'+(needsProduction?' sp-load-status-production':'')+' cursor-interaction" data-load-status="pending" aria-label="สถานะการโหลด: '+pendingLabel+'">'+pendingLabel+'</summary><div class="sp-ready-content">'+content+'</div></details>';
    }
    function mountMoneyOverview() {
      const id = 'sp-money-all', view = model.all;
      // Use source product lines once, never the grade allocations or rendered totals.
      scopes.set(id,{view,inventory:view.stock});
      scopes.set(id+'-g-all',{view,inventory:view.stock});
      const overview = doc.createElement('section');
      overview.id = id; overview.className = 'sp-window sp-money-overview';
      overview.setAttribute('aria-labelledby',id+'-title');
      overview.innerHTML = '<header class="sp-header sp-finance-header"><div><span class="sp-eyebrow">'+esc(metadata.monthLabel || '')+' · '+fmt(model.thicknesses.length)+' ความหนา</span><h2 id="'+id+'-title">ภาพรวมเงิน · รวมทุกความหนา</h2></div></header>'+financeMarkup(id,view)+'<details id="'+id+'-g-all" class="sp-global-free sp-group" hidden><summary class="cursor-interaction">Free ทุกความหนา · ใส่ราคาประเมินรายขนาด</summary><div class="sp-children">'+freeMarkup(view.stock,id+'-g-all',model.thicknesses)+'</div></details>';
      root.append(overview);
      const free = overview.querySelector('.sp-global-free');
      freeDisclosures.set(id+'-g-all',{target:free,isOpen:() => !free.hidden && free.open,toggle:() => {
        const opening = free.hidden || !free.open;
        free.hidden = !opening;free.open = opening;
        if (opening) {free.scrollIntoView({block:'nearest'});free.querySelector('summary')?.focus({preventScroll:true});}
        syncFreeDisclosure(id+'-g-all');
      }});
      on(free,'toggle',() => syncFreeDisclosure(id+'-g-all'));
      syncFreeDisclosure(id+'-g-all');
    }
    function mountThickness(thickness, index) {
      const scope = model.byThickness[String(thickness)], view = scope.all;
      const id = 'sp-thickness-'+String(thickness).replace('.','_');
      scopes.set(id,{view,inventory:view.stock});
      view.stock.rows.forEach(row => rowLookup.set(specKey(row),row));
      const details = doc.createElement('details');details.className = 'sp-window sp-thickness';details.id = id;
      details.innerHTML = '<summary class="sp-thickness-summary cursor-interaction" aria-controls="'+id+'-content"><div class="sp-thickness-heading"><h2>'+esc(thick(thickness))+' <small>มม.</small></h2><span class="sp-thickness-name">รวมทุกเกรด<small>'+fmt(view.totals.orderCount)+' รายการ · '+esc(metadata.monthLabel || '')+'</small></span></div><span class="sp-thickness-metrics"><span class="sp-thickness-metric"><small>ยอดขาย</small><strong>'+unitMarkup(view.totals.quantities.byUnit)+'</strong></span><span class="sp-thickness-metric"><small>เทียบ 4×8 @2.5</small><strong>'+esc(equivalentText(view.totals))+'</strong></span><span class="sp-thickness-metric"><small>มูลค่าขาย</small><strong>'+moneyMarkup(view.totals.money)+'</strong></span><span class="sp-thickness-metric sp-thickness-stock"><small>สต๊อกหลังโยก</small><strong>'+stockUnitMarkup(view.stock,'physical')+'</strong></span><span class="sp-thickness-metric sp-thickness-free"><small>Free</small><strong>'+stockUnitMarkup(view.stock,'free')+'</strong></span></span><span class="sp-thickness-action"><span class="sp-when-closed">ดูภาพรวม</span><span class="sp-when-open">ย่อทั้งหมด</span><span class="sp-thickness-chevron" aria-hidden="true">›</span></span></summary><div id="'+id+'-content" class="sp-thickness-content"></div>';
      root.append(details);let mounted = false;
      on(details,'toggle',() => {
        if (!details.open || mounted) return;mounted = true;
        const content = details.querySelector('.sp-thickness-content');
        content.innerHTML = '<header class="sp-header sp-finance-header"><div><span class="sp-eyebrow">ความหนา '+esc(thick(thickness))+' มม. · รวมทุกเกรด</span><h2>ภาพรวมเงิน</h2></div></header>'+financeMarkup(id,view)+'<div class="sp-grade-sections"></div><footer class="sp-footer"><span>มิกซ์: AAA 85% / B 15% · แผ่นและเงินตามสัดส่วน · ยอดรวมไม่บวกซ้ำ</span><span>ราคา Free กรอกเอง · พรีวิวเท่านั้น ไม่บันทึกส่วนกลาง</span></footer>';
        const grades = content.querySelector('.sp-grade-sections');renderGrade(thickness,'all',view,grades,id);
        scope.grades.forEach(grade => renderGrade(thickness,grade,scope.byGrade[grade],grades,id));
        syncInputs();updateFinancialView();saveStatus();
      });
    }
    function updateFinancialView() {
      root.querySelectorAll('[data-receipt-error-total]').forEach(node => {
        const totals = receiptBreakdown?.buckets?.[node.dataset.receiptErrorTotal]?.totals;
        node.textContent = totals ? moneyBaht(totals) : 'รอมูลค่า';
      });
      root.querySelectorAll('[data-receipt-total]').forEach(node => {
        const totals = receiptBreakdown?.buckets?.[node.dataset.receiptTotal]?.totals;
        node.textContent = totals ? moneyBaht(totals) : 'รอมูลค่า';
      });
      root.querySelectorAll('[data-receipt-event-amount]').forEach(node => {
        const [bucket,index] = node.dataset.receiptEventAmount.split('|');
        const event = receiptBreakdown?.buckets?.[bucket]?.events?.[Number(index)];
        node.textContent = event ? moneyBaht(moneySummary([event]),2) : 'รอมูลค่า';
      });
      root.querySelectorAll('[data-historical-free-price]').forEach(node => {node.textContent = historicalPriceText(node.dataset.historicalFreePrice);});
      root.querySelectorAll('[data-finance-amount]').forEach(node => {
        const [id,bucket] = node.dataset.financeAmount.split('|');node.textContent = moneyBaht(scopes.get(id).view.finance.stages[bucket].totals.money);
      });
      root.querySelectorAll('[data-finance-term]').forEach(node => {
        const [id,bucket,term] = node.dataset.financeTerm.split('|');
        const rows = scopes.get(id).view.finance.stages[bucket].rows.filter(row => term === 'unknown' ? !['TT','LC'].includes(row.financeTerm) : row.financeTerm === term);
        node.textContent = moneyBaht(moneySummary(rows));
      });
      root.querySelectorAll('[data-term-unknown]').forEach(node => {const [id,bucket] = node.dataset.termUnknown.split('|');node.hidden = !scopes.get(id).view.finance.stages[bucket].rows.some(row => !['TT','LC'].includes(row.financeTerm));});
      root.querySelectorAll('[data-finance-list]').forEach(node => {
        const [id,bucket] = node.dataset.financeList.split('|'), rows = scopes.get(id).view.finance.stages[bucket].rows;
        const loadingStatus = row => ['received','followup','opportunity'].includes(bucket) ? receivedLoadingMarkup(row) : '';
        node.innerHTML = rows.length ? rows.map(row => '<div class="sp-finance-item"><span>'+esc((row.term === 'unknown' ? '—' : row.term)+' — '+row.customer)+'</span><small>'+esc(row.ref || row.orderKey)+' · '+esc(thick(row.t)+' มม. '+(row.grade === 'mix' ? 'AAA+B' : row.grade)+' '+fmt(row.w)+' × '+fmt(row.l))+'</small><span>'+esc(rowMoneyText(row))+'</span><span>'+esc(moneyBaht(moneySummary([row]),2))+'</span>'+loadingStatus(row)+sourceCurrencyNotes(row).map(note => '<small>'+esc(note)+'</small>').join('')+'</div>').join('') : 'ไม่มีรายการในกลุ่มนี้';
      });
      const valuations = new Map();
      const getValuation = id => {if (!valuations.has(id)) valuations.set(id,valuation(scopes.get(id).inventory.rows)); return valuations.get(id);};
      root.querySelectorAll('[data-free-value]').forEach(node => {const value = getValuation(node.dataset.freeValue);node.textContent = value.value !== null ? bahtText(value.value) : value.valued ? bahtText(value.partial)+' (บางส่วน)' : value.missingFx ? 'รออัตราแลกเปลี่ยน' : 'รอใส่ราคา';});
      root.querySelectorAll('[data-free-coverage]').forEach(node => {const value = getValuation(node.dataset.freeCoverage);node.textContent = 'ความครบมูลค่า Free · ใส่ราคาแล้ว '+value.priced+' / '+value.total+' สเปก'+(value.missingFx ? ' · รออัตรา USD '+value.missingFx+' สเปก' : '')+(value.value === null ? ' · ยังไม่ใช่มูลค่ารวม' : '');});
      root.querySelectorAll('[data-free-row-value]').forEach(node => {const key = node.dataset.freeRowValue, value = rowValue(rowLookup.get(key));node.textContent = positive(pricing.prices[priceKey(key)]) === null ? 'รอใส่ราคา' : value === null ? 'รออัตราแลกเปลี่ยน' : bahtText(value,2);});
      root.querySelector('[data-fx-status]').textContent = fxStatusText();
    }

    let destroyed = false, ready = Promise.resolve();
    try {
      const loaded = loadSavedState();
      if (loaded && typeof loaded.then === 'function') {
        storeLoading = Boolean(externalStore);
        ready = Promise.resolve(loaded).then(saved => {
          if (destroyed) return false;
          storeLoading = false;
          if (externalStore && saved !== null && saved !== undefined && !readState(saved)) {
            storeLoadFailed = true;error = 'รูปแบบ catalog ที่โหลดมาไม่ถูกต้อง';saveStatus();return false;
          }
          if (!writeCount && !queuedWrites && !dirty && !saving && saved !== null && saved !== undefined) readState(saved);
          syncInputs();updateFinancialView();saveStatus();return true;
        }).catch(() => {if(!destroyed){storeLoading = false;storeLoadFailed = Boolean(externalStore);error = 'โหลดราคาและหมายเหตุที่เซฟไว้ไม่สำเร็จ';saveStatus();}return false;});
      } else {
        const valid = readState(loaded);
        if (externalStore && loaded !== null && loaded !== undefined && !valid) {storeLoadFailed = true;error = 'รูปแบบ catalog ที่โหลดมาไม่ถูกต้อง';}
      }
    } catch {storeLoading = false;storeLoadFailed = Boolean(externalStore);error = 'โหลดราคาและหมายเหตุที่เซฟไว้ไม่สำเร็จ';}
    root.replaceChildren();
    root.removeAttribute?.('aria-labelledby');
    root.setAttribute('aria-label','ยอดขายและสต๊อกทุกความหนา');
    const header = doc.createElement('header');header.className = 'sp-all-header';
    const referenceUrl = /^https:\/\//.test(fxReference.url || '') ? fxReference.url : 'https://app.bot.or.th/BTWS_STAT/statistics/BOTWEBSTAT.aspx?reportID=123';
    header.innerHTML = '<div><h2>ยอดขายและสต๊อก · '+esc(metadata.monthLabel || '')+'</h2><p>'+fmt(model.thicknesses.length)+' ความหนา · เลือกแถวเพื่อดูเงิน เกรด และ Free รายขนาด</p></div><div class="sp-fx"><label for="sp-all-fx">USD → บาท <input id="sp-all-fx" class="sp-number-input" type="number" min="0.0000001" step="any" inputmode="decimal" data-fx aria-describedby="sp-all-fx-source sp-all-fx-status"></label><a id="sp-all-fx-source" href="'+esc(referenceUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(fxReference.sourceLabel || 'อัตราอ้างอิง ธปท.')+' ↗</a><span id="sp-all-fx-status" data-fx-status></span></div>';
    root.append(header);
    mountMoneyOverview();
    model.thicknesses.forEach(mountThickness);
    syncInputs();updateFinancialView();saveStatus();
    on(root,'input',event => {
      const input = event.target;
      if (readOnly) return;
      if (storeLoading || storeLoadFailed) return;
      if (input.matches('[data-fx]')) {if(priceNotesOnly || automaticFx)return;pricing.fx = positive(input.value);input.setAttribute('aria-invalid',String(pricing.fx === null));updateFinancialView();saveFx();return;}
      if (input.matches('[data-thickness-note]')) {const key = thicknessKey(input.dataset.thicknessNote);if (key === null) return;if (input.value === '') delete pricing.notesByThickness[key];else pricing.notesByThickness[key] = input.value;syncInputs(input);markEdited();return;}
      if (!input.matches('[data-free-price]')) return;
      const displayKey = knownDisplayKey(input.dataset.freePrice);
      if (input.validity.badInput) {rejectDraftPrice(displayKey,input.value,input);return;}
      const blank = input.value === '', value = blank ? null : positive(input.value);
      if (!blank && value === null) {rejectDraftPrice(displayKey,input.value,input);return;}
      if (displayKey === null) return;
      const key = priceKey(displayKey), hadPrice = Object.hasOwn(pricing.prices,key);
      if (blank) {if (hadPrice) pricing.currencies[key] = currency(pricing.currencies,key);delete pricing.prices[key];}
      else pricing.prices[key] = value;
      invalidDraftValues.delete(displayKey);input.setAttribute('aria-invalid','false');syncInputs(input);updateFinancialView();markEdited();notifyPriceDraftChange('draft',displayKey);
    });
    on(root,'change',event => {const input = event.target;if (readOnly || storeLoading || storeLoadFailed || !input.matches('[data-free-currency]')) return;setDraftCurrency(input.dataset.freeCurrency,input.value === 'USD' ? 'USD' : 'THB',input);});
    on(root,'click',event => {
      const save = event.target.closest('[data-save-prices]');if (save) {savePrices();return;}
      const exporter = event.target.closest('[data-export-prices]');if (exporter) {exportSaved(exporter);return;}
      const copy = event.target.closest('[data-copy-export-json]');if (copy) {copyExport(copy);return;}
      const link = event.target.closest('[data-open-free]');
      if (link) {
        freeDisclosures.get(link.dataset.openFree)?.toggle();
      }
    });
    if (!externalStore) on(win,'openai:set_globals',event => {
      if (event.detail?.globals?.widgetState && !writeCount && !queuedWrites && !writeFailed && !dirty && !saving && !error && readState(event.detail.globals.widgetState)) {syncInputs();updateFinancialView();saveStatus();notifyPriceDraftChange('load');}
    });
    ready = Promise.resolve(ready).then(result => {
      if (destroyed) return false;
      if (result === false || storeLoadFailed) {notifyPriceDraftChange('load-failed');return false;}
      notifyReportSummary('ready');notifyPriceDraftChange('load');return true;
    });
    // Mounting never writes state; changes are handled only by explicit interactions.
    function destroy() {destroyed = true;cleanups.forEach(fn => fn());}
    return {destroy,ready,getPriceState,getDraftPrice,setDraftPrice,getReportSummary,savePrices,exportSaved,setAutomaticFx};
  }
  host.mountAllThickness = mountAllThickness;
  if (typeof module !== 'undefined' && module.exports) module.exports = mountAllThickness;
})(typeof window !== 'undefined' ? window : globalThis);


(function (host) {
  'use strict';
  const modelApi = host.AafAllModel;
  const viewMount = host.mountAllThickness;
  function normalizeRoot(root) {
    if (!root) throw new Error('Missing sales preview root');
    if (root.id && root.id !== 'sales-stock-preview-16') throw new Error('Sales preview root id must be sales-stock-preview-16');
    root.id = 'sales-stock-preview-16';
    return root;
  }
  function mount(root, precomputedModel, options = {}, store) {
    const config = {...options};
    if (store !== undefined) config.store = store;
    return viewMount(normalizeRoot(root), precomputedModel, config);
  }
  function buildModel(salesRows, stockRows, modelOptions = {}) {
    return modelApi.buildModel(salesRows, stockRows, modelOptions);
  }
  function render(root, payload, store) {
    if (!payload || !Array.isArray(payload.salesRows) || !Array.isArray(payload.stockRows)) throw new Error('Invalid authenticated sales preview payload');
    return mount(root, buildModel(payload.salesRows, payload.stockRows, payload.modelOptions || {}), payload.options || {}, store);
  }
  const api = Object.freeze({mount,render,buildModel,model:modelApi});
  host.AAFSalesPreview = api;
  host.AAFSalesPreviewMount = mount;
  host.AAFSalesPreviewBuildModel = buildModel;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

