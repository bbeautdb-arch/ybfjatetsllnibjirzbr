/* Data-free current-month cards with a separate selected-month review.
   Read-only: no storage, tokens or network. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AAFOrderHeader = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n = value => Number(value).toLocaleString('th-TH', {maximumFractionDigits: 2});
  const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const zero = () => ({THB: 0, USD: 0});
  const units = () => ({sheet: 0, strip: 0});
  const requireValue = (condition, message) => {if (!condition) throw new Error(message);};
  const add = (target, currency, value) => {requireValue(['THB','USD'].includes(currency) && valid(value), 'ข้อมูลมูลค่าไม่ครบ'); target[currency] += value;};
  const quantity = rows => rows.reduce((out, row) => {requireValue(['sheet','strip'].includes(row.unit) && valid(row.qty), 'ข้อมูลจำนวนไม่ครบ'); out[row.unit] += row.qty; return out;}, units());
  const equivalent = rows => rows.reduce((sum, row) => sum + row.qty * row.w * row.l / (1220 * 2440) * row.t / 2.5, 0);
  const equivalentArea = rows => rows.reduce((sum, row) => sum + row.qty * row.w * row.l / (1220 * 2440), 0);
  const totalTHB = (native, fx) => native && valid(native.THB) && valid(native.USD) && valid(fx) && fx > 0 ? native.THB + native.USD * fx : null;
  const money = value => value === null || !valid(value) ? 'ยังยืนยันไม่ได้' : '≈ ฿ ' + n(value);
  const qtyText = value => n(value.sheet) + ' แผ่น' + (value.strip ? ' · ไม้แถบ ' + n(value.strip) + ' ชิ้น' : '');
  const nativeText = value => 'THB ' + n(value.THB) + ' · USD ' + n(value.USD);

  // The current-month sold card is a separate authenticated quantity DTO. It
  // must never inherit another month, money, receipts, or the teaching queue.
  function currentBangkokMonth(now = Date.now()) {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).formatToParts(new Date(now));
    return parts.find(p=>p.type==='year').value + '-' + parts.find(p=>p.type==='month').value;
  }
  function currentMonthSoldView(value, now = Date.now()) {
    const month = currentBangkokMonth(now);
    const monthLabel = new Intl.DateTimeFormat('th-TH', {timeZone:'Asia/Bangkok',year:'numeric',month:'long'}).format(new Date(month+'-01T00:00:00+07:00'));
    const pending = reason => ({version:1,status:'pending',month,monthLabel,reason:reason || 'รอข้อมูลขายเดือน '+monthLabel+' ที่ตรวจครบ · ไม่ใช้เดือนอื่นหรือศูนย์แทน'});
    if(value?.version!==1 || value.month!==month)return pending();
    if(value.status==='pending')return pending(typeof value.reason==='string'&&value.reason.length<=2000?value.reason:undefined);
    const count=v=>Number.isSafeInteger(v)&&v>=0,unitValues=v=>v&&['sheet','strip'].every(k=>count(v[k]));
    const source=value.source,captured=Date.parse(source?.capturedAt);
    if(value.status!=='verified-quantities'||source?.page!==9||source.sourceIsLive!==false||!Number.isFinite(captured)||captured>Number(now)||currentBangkokMonth(captured)!==month||
      typeof source.checksum!=='string'||!/^sha256:[a-f0-9]{64}$/.test(source.checksum)||
      ![value.orderCount,value.lineCount,source.orderCount,source.lineCount].every(count)||value.orderCount>value.lineCount||source.orderCount>source.lineCount||
      value.orderCount>source.orderCount||value.lineCount>source.lineCount||
      ![value.quantity,value.loaded,value.paidOrDeposit,value.lcETD].every(unitValues)||
      ['sheet','strip'].some(k=>value.quantity[k]!==value.loaded[k]+value.paidOrDeposit[k]+value.lcETD[k]))return pending();
    const copyUnits=v=>({sheet:v.sheet,strip:v.strip});
    return {version:1,status:'verified-quantities',month,monthLabel,
      source:{page:9,capturedAt:source.capturedAt,sourceIsLive:false,checksum:source.checksum,orderCount:source.orderCount,lineCount:source.lineCount},
      quantity:copyUnits(value.quantity),loaded:copyUnits(value.loaded),paidOrDeposit:copyUnits(value.paidOrDeposit),lcETD:copyUnits(value.lcETD),orderCount:value.orderCount,lineCount:value.lineCount};
  }
  const currentSoldSource = view => view.status==='verified-quantities'
    ? 'ขายแล้วเดือนนี้: '+view.monthLabel+' · หน้า 09 · อ่านต้นทาง '+new Date(view.source.capturedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})+' · ชุดข้อมูลที่ตรวจแล้ว ไม่ใช่ฟีดขายสด'
    : 'ขายแล้วเดือนนี้: '+view.monthLabel+' · '+view.reason;

  function currentAllocationView(value, warehouse, soldValue, now = Date.now()) {
    const sold=currentMonthSoldView(soldValue,now),month=sold.month,monthLabel=sold.monthLabel;
    const pending=reason=>({version:1,status:'pending',month,monthLabel,reason:reason||'รอยืนยันยอดจองเดือนนี้และการจัดสรรกับสต๊อกที่บันทึก · ไม่ใช้เดือนอื่นแทน'});
    if(value?.version!==1||value.month!==month)return pending();
    if(value.status==='pending')return pending(typeof value.reason==='string'&&value.reason.length<=2000?value.reason:undefined);
    const hundredths=(v,signed=false)=>typeof v==='number'&&Number.isFinite(v)&&(signed||v>=0)&&Number.isSafeInteger(Math.round(v*100))&&Math.abs(v*100-Math.round(v*100))<1e-6;
    const bucket=(v,signed=false)=>v&&['sheet','strip'].every(k=>hundredths(v[k],signed));
    const close=(a,b)=>Math.abs(a-b)<1e-7;
    const group=v=>v&&['demand','allocated','shortage'].every(k=>bucket(v[k]))&&['sheet','strip'].every(u=>close(v.demand[u],v.allocated[u]+v.shortage[u]));
    const source=value.source,stock=value.stock,t=value.totals;
    if(value.status!=='verified-allocation'||sold.status!=='verified-quantities'||!warehouse||
      source?.page!==9||source.sourceIsLive!==false||source.checksum!==sold.source.checksum||source.capturedAt!==sold.source.capturedAt||
      !Number.isSafeInteger(stock?.revision)||stock.revision<0||String(stock.revision)!==String(warehouse.stockRevision)||stock.reportDate!==warehouse.stockReportDate||
      !/^sha256:[a-f0-9]{64}$/.test(stock.planChecksum||'')||stock.planChecksum!==warehouse.planChecksum||stock.planCapturedAt!==warehouse.planCapturedAt||
      !Number.isFinite(Date.parse(stock.planCapturedAt))||Date.parse(stock.planCapturedAt)>Number(now)||currentBangkokMonth(Date.parse(stock.planCapturedAt))!==month||
      !group(value.current?.soldUnloaded)||!group(value.current?.other)||!group(value.carry)||
      !t||!['demand','allocated','shortage','physical','formulaFree','savedFree'].every(k=>bucket(t[k]))||!bucket(t.manualFreeDelta,true)||
      !Number.isSafeInteger(value.manualFreeOverrideCount)||value.manualFreeOverrideCount<0||value.manualFreeOverrideCount!==warehouse.manualFreeOverrideCount)return pending();
    for(const u of ['sheet','strip']){
      if(!close(value.current.soldUnloaded.demand[u],sold.quantity[u]-sold.loaded[u])||
        !['demand','allocated','shortage'].every(k=>close(t[k][u],value.current.soldUnloaded[k][u]+value.current.other[k][u]+value.carry[k][u]))||
        !close(t.demand[u],t.allocated[u]+t.shortage[u])||!close(t.physical[u],t.allocated[u]+t.formulaFree[u])||
        !close(t.savedFree[u],t.formulaFree[u]+t.manualFreeDelta[u])||
        !close(t.physical[u],warehouse.physical.quantity[u])||!close(t.savedFree[u],warehouse.free.quantity[u])||
        !close(t.demand[u],warehouse.reservationTotals?.demand[u])||!close(t.allocated[u],warehouse.reservationTotals?.allocated[u])||
        !close(t.shortage[u],warehouse.reservationTotals?.shortage[u])||!close(t.manualFreeDelta[u],warehouse.reservationTotals?.manualFreeDelta[u]))return pending();
    }
    const copy=v=>({sheet:v.sheet,strip:v.strip}),copyGroup=v=>Object.fromEntries(['demand','allocated','shortage'].map(k=>[k,copy(v[k])]));
    return {version:1,status:'verified-allocation',month,monthLabel,source:{page:9,capturedAt:source.capturedAt,sourceIsLive:false,checksum:source.checksum},
      stock:{revision:stock.revision,reportDate:stock.reportDate,planChecksum:stock.planChecksum,planCapturedAt:stock.planCapturedAt},
      current:{soldUnloaded:copyGroup(value.current.soldUnloaded),other:copyGroup(value.current.other)},carry:copyGroup(value.carry),
      totals:Object.fromEntries(['demand','allocated','shortage','physical','formulaFree','savedFree','manualFreeDelta'].map(k=>[k,copy(t[k])])),manualFreeOverrideCount:value.manualFreeOverrideCount};
  }

  function summarizeMoney(rows, financial) {
    const ids = new Set(rows.map(row => row.id));
    const result = {sale: zero(), received: zero(), pending: zero(), unconfirmed: zero(), complete: true,
      missingPriceLineCount: 0, receiptEvents: [], partialOrders: [], orders: []};
    for (const row of rows) {
      const sale = financial.byRowId?.[row.id]?.sale;
      if (sale?.status === 'cancelled-no-demand' && sale.amount === 0) continue;
      if (sale?.status !== 'verified' || !valid(sale.amount) || !['THB','USD'].includes(sale.currency)) {
        result.complete = false; result.missingPriceLineCount++; continue;
      }
      add(result.sale, sale.currency, sale.amount);
    }
    const covered = new Set(), eventIds = new Set();
    for (const order of financial.orders || []) {
      const included = (order.rowIds || []).filter(id => ids.has(id)); if (!included.length) continue;
      included.forEach(id => {requireValue(!covered.has(id), 'รายการเงินซ้ำ'); covered.add(id);});
      const selected = zero();
      for (const id of included) {const sale = financial.byRowId[id]?.sale; if (sale?.status === 'verified') add(selected, sale.currency, sale.amount);}
      const full = included.length === order.rowIds.length, settlement = full ? order.settlement : null;
      const detail = {ref: order.ref, customer: order.customer, sale: selected, received: zero(), pending: zero(), unconfirmed: zero(), receiptEvents: [], partial: !full};
      const fields = [['received','receivedAmount'],['pending','pendingAmount'],['unconfirmed','unconfirmedAmount']];
      const sTotal = settlement ? fields.reduce((sum, [, key]) => sum + (settlement[key] ?? 0), 0) : null;
      const match = settlement && ['THB','USD'].includes(settlement.currency) && valid(settlement.saleAmount) &&
        Math.abs(selected[settlement.currency] - settlement.saleAmount) < 1e-6 &&
        selected[settlement.currency === 'THB' ? 'USD' : 'THB'] === 0 && Math.abs(sTotal - settlement.saleAmount) < 1e-6;
      if (match) {
        for (const [field, key] of fields) if (settlement[key] !== null && settlement[key] !== undefined) {
          add(result[field], settlement.currency, settlement[key]); add(detail[field], settlement.currency, settlement[key]);
        }
        for (const event of settlement.receiptEvents || []) {
          requireValue(!eventIds.has(event.id), 'งวดรับเงินซ้ำ'); eventIds.add(event.id);
          const value = {...event, orderId: order.orderId || order.id, ref: order.ref, customer: order.customer};
          detail.receiptEvents.push(value); result.receiptEvents.push(value);
        }
      } else {
        for (const currency of ['THB','USD']) {add(result.unconfirmed, currency, selected[currency]); add(detail.unconfirmed, currency, selected[currency]);}
        if (!full) result.partialOrders.push(order.orderId || order.id);
      }
      result.orders.push(detail);
    }
    requireValue(rows.every(row => covered.has(row.id)), 'รายการยอดขายกับหลักฐานเงินไม่ครบชุด');
    for (const currency of ['THB','USD']) requireValue(Math.abs(result.sale[currency] - result.received[currency] - result.pending[currency] - result.unconfirmed[currency]) < 1e-5, 'แยกรับแล้ว/รอรับไม่ตรงมูลค่า');
    result.receiptEvents.sort((a,b) => (a.date || a.month || '9999').localeCompare(b.date || b.month || '9999'));
    return result;
  }
  function build(review, readModel = {}) {
    requireValue(readModel.kind!=='current-month-order-review'||review?.metadata?.month===currentBangkokMonth(),'รายงานไม่ใช่เดือนปัจจุบันตามเวลาไทย');
    requireValue(/^\d{4}-(0[1-9]|1[0-2])$/.test(review?.metadata?.month || ''), 'ยังไม่มีเดือนที่ตรวจครบ');
    requireValue(!readModel.selectedMonth || readModel.selectedMonth === review.metadata.month, 'เดือนหัวข้อ01และ02ไม่ตรงกัน');
    const rows = review.queueReview?.rows, financial = review.financial;
    requireValue(Array.isArray(rows) && rows.length > 0 && financial?.metadata?.month === review.metadata.month, 'รายการขายและราคาคนละเดือน');
    requireValue(new Set(rows.map(row => row.id)).size === rows.length, 'รายการขายซ้ำ');
    requireValue(rows.every(row => {
      const value = financial.byRowId?.[row.id];
      return value && ['id','orderId','w','l','t','grade','qty'].every(key => value[key] === row[key]);
    }), 'รายการขายกับชุดราคาสินค้าไม่ตรงกัน');
    const loaded = rows.filter(row => row.queue?.group === 1);
    const paid = rows.filter(row => row.queue?.group === 2);
    // Owner rule: LC with a valid ETD is sold, but LC is not bank cash received.
    const soldLC = rows.filter(row => row.queue?.group === 3 && row.commercial?.termKind === 'LC' && row.commercial?.etdValid === true && row.commercial?.soldByOwnerRule === true);
    const soldIds = new Set([...loaded, ...paid, ...soldLC].map(row => row.id));
    const soldRows = rows.filter(row => soldIds.has(row.id));
    const otherRows = rows.filter(row => row.queue?.group === 3 && !soldIds.has(row.id));
    const waitingRows = rows.filter(row => row.queue?.group === 4);
    requireValue(soldRows.length + otherRows.length + waitingRows.length === rows.length, 'แบ่งกลุ่มเดือนที่เลือกไม่ครบ');
    const stockRows = review.stockPools || [];
    requireValue(stockRows.length > 0, 'ยังไม่มีฐานคลังที่ตรวจไว้');
    const physicalRows = stockRows.map(row => ({...row, qty: row.physical}));
    const freeRows = stockRows.map(row => ({...row, qty: row.free}));
    const value = review.reconciliation?.headerStockValuations || {};
    const fx = financial.metadata.fx;
    requireValue(valid(fx?.rate) && fx.rate > 0, 'ยังยืนยันอัตราแลกเปลี่ยนไม่ได้');
    const out = {month: review.metadata.month, monthLabel: review.metadata.monthLabel || review.metadata.month,
      sourceCapturedAt: review.metadata.sourceSalesCapturedAt, stockReportDate: review.metadata.stockReportDate,
      sourceIsLive: false, queueApplied: false, sameMonthAsSection02: true, thicknessScope: 'all',
      stale: readModel.stale === true, stockMatches: readModel.stockMatches === true, warning: readModel.warning || '',
      availableMonths: readModel.availableMonths || [review.metadata.month], fx,
      physical: {quantity: quantity(physicalRows), eq4x8: equivalentArea(physicalRows), eq25: equivalent(physicalRows), value: value.physical || null},
      free: {quantity: quantity(freeRows), eq25: equivalent(freeRows), value: value.free || null,
        knownValueTHB: review.freeStock?.views?.all?.valuation?.valueTHB ?? null},
      sold: {quantity: quantity(soldRows), eq25: equivalent(soldRows), money: summarizeMoney(soldRows, financial),
        loaded: quantity(loaded), paidOrDeposit: quantity(paid), lcETD: quantity(soldLC), rowIds: soldRows.map(row => row.id)},
      reserved: {quantity: quantity(otherRows), eq25: equivalent(otherRows), money: summarizeMoney(otherRows, financial),
        value: value.otherReservationDemand || null, rowIds: otherRows.map(row => row.id)},
      waiting: {quantity: quantity(waitingRows), rowIds: waitingRows.map(row => row.id)},
      allOrders: {quantity: quantity(rows), money: summarizeMoney(rows, financial), rowIds: rows.map(row => row.id)},
      allocationComplete: false};
    requireValue(out.sold.rowIds.every(id => !out.reserved.rowIds.includes(id)), 'ขายแล้วซ้ำกับจองอื่น');
    return out;
  }
  // Current saved warehouse rows are independent of the dated sales review.
  // Only the exact-revision catalog decoration may value them; never fall back
  // to legacy row.price or the packaged review's inventory valuation.
  function warehouseProjection(stock) {
    requireValue(stock && typeof stock.reportDate === 'string' && Array.isArray(stock.rows) && stock.rows.length > 0, 'ยังไม่มีสต๊อกส่วนกลางล่าสุด');
    const keys = new Set();
    const bucket = () => ({quantity: units(), eq4x8: 0, eq25: 0, value: null,
      knownValueTHB: null, complete: false, unknownQuantity: units(), unpricedSpecCount: 0, valuedSpecCount: 0});
    const physical = bucket(), free = bucket(), catalogVerified = !!stock.savedCatalog;
    const reservationTotals={demand:units(),allocated:units(),shortage:units(),manualFreeDelta:units()};let manualFreeOverrideCount=0;
    let physicalKnown = 0, freeKnown = 0;
    for (const row of stock.rows) {
      requireValue(typeof row.key === 'string' && row.key && !keys.has(row.key), 'ทะเบียนสต๊อกซ้ำหรือไม่มีรหัส');
      keys.add(row.key);
      requireValue(['sheet','strip'].includes(row.unit) && valid(row.qty) && valid(row.freeQty) &&
        [row.w,row.l,row.t].every(v => Number.isFinite(Number(v)) && Number(v) > 0), 'ยอดหรือหน่วยสต๊อกไม่ครบ');
      if(valid(row.committedQty)){
        reservationTotals.demand[row.unit]+=row.committedQty;reservationTotals.allocated[row.unit]+=Math.min(row.qty,row.committedQty);
        reservationTotals.shortage[row.unit]+=Math.max(row.committedQty-row.qty,0);
        reservationTotals.manualFreeDelta[row.unit]+=row.freeQty-Math.max(row.qty-row.committedQty,0);
      }else reservationTotals.demand[row.unit]=NaN;
      if(row.manualFreeOverride===true||row.freeOverride)manualFreeOverrideCount++;
      for (const [target, field, valueField] of [[physical,'qty','catalogValue'],[free,'freeQty','catalogFreeValue']]) {
        const qty = row[field], area = Number(row.w) * Number(row.l) / (1220 * 2440);
        target.quantity[row.unit] += qty;
        target.eq4x8 += qty * area; target.eq25 += qty * area * Number(row.t) / 2.5;
        const priced = catalogVerified && valid(row.catalogPrice) && row.catalogPrice > 0 &&
          ['THB','USD'].includes(row.catalogCurrency) && valid(row[valueField]);
        if (qty > 0 && !priced) {target.unknownQuantity[row.unit] += qty; target.unpricedSpecCount++;}
        if (priced) {
          if (qty > 0) target.valuedSpecCount++;
          if (field === 'qty') physicalKnown += row[valueField];
          else freeKnown += row[valueField];
        }
      }
    }
    for (const [target, known] of [[physical,physicalKnown],[free,freeKnown]]) {
      requireValue([target.quantity.sheet,target.quantity.strip,target.eq4x8,target.eq25,known].every(valid), 'ยอดสต๊อกเกินขอบเขต');
      target.complete = catalogVerified && target.unpricedSpecCount === 0;
      target.knownValueTHB = catalogVerified && (target.complete || target.valuedSpecCount > 0) ? known : null;
      target.value = target.complete ? {equivalentTHB: known} : null;
    }
    return {physical,free,stockReportDate:stock.reportDate,stockRevision:stock.revision,
      catalogRevision:stock.savedCatalog?.catalogRevision ?? null,stockUpdatedAt:stock.updatedAt || '',
      fx:stock.headerExchangeRate || null,source:'current-central-saved-stock',queueApplied:false,
      planChecksum:stock.reservationPlan?.checksum||stock.sellablePlan?.checksum||null,planCapturedAt:stock.reservationPlan?.capturedAt||stock.sellablePlan?.source?.capturedAt||null,
      reservationTotals,manualFreeOverrideCount};
  }
  function sourceText(model, warehouse, _expanded, _pendingMessage, currentMonthSold, currentAllocation) {
    if(model?.month!==currentBangkokMonth()||model?.sourceChecksum&&model.sourceChecksum!==currentMonthSold?.source?.checksum)model=null;
    const allocation=currentAllocationView(currentAllocation,warehouse,currentMonthSold);
    const allocationSource=allocation.status==='verified-allocation'?`จองอื่นๆ: ${allocation.monthLabel} · แผนจองส่วนกลางรุ่น ${allocation.stock.revision} · รวมภาระเดือนอื่นในแผนในการคำนวณ Free แยกต่างหาก`:`จองอื่นๆ/การจัดสรร: ${allocation.reason}`;
    const sales = model ? `รายละเอียดหัวข้อ02 เดือนนี้: ${model.monthLabel} · ทุกความหนา · อ่านขาย ${model.sourceCapturedAt || 'ไม่ระบุเวลา'} · ชุดที่ตรวจแล้ว ไม่ใช่ฟีดขายสด`
      : 'รายละเอียดหัวข้อ02 เดือนนี้: รอชุดเดือนปัจจุบันที่ตรงกับกล่องด้านบน · ไม่ใช้เดือนก่อนแทน';
    const current = warehouse === undefined ? model : warehouse;
    const stock = current ? `Physical/Free ทั้งคลังรายงาน ${current.stockReportDate}${current.stockRevision !== undefined ? ' · รุ่น '+current.stockRevision : ''} · ${allocation.status==='verified-allocation'?'Free จากแผนจองที่ยืนยันกับรุ่นนี้ · คงค่าปรับมือ':'Free ตามยอดที่บันทึก · การจัดสรรล่าสุดยังรอตรวจ'}` : 'Physical/Free รอยืนยันข้อมูลส่วนกลาง';
    const fx = warehouse?.fx;
    return `${currentSoldSource(currentMonthSoldView(currentMonthSold))} · ${allocationSource} · ${sales} · ${stock}${fx ? ` · เรทประเมินสต๊อก USD/THB ${fx.rate} (${fx.date})` : ''}${model?.fx ? ` · เรทชุดขาย USD/THB ${model.fx.rate} (${model.fx.date})` : ''}`;
  }
  const line = (label, value, warning = false) => `<div class="ss-overview-row${warning ? ' ss-overview-warning' : ''}"><span>${esc(label)}</span><b>${value}</b></div>`;
  function receiptsHTML(info, fx) {
    const cash = info.money;
    return line('รับแล้วตามหลักฐานสินค้า', money(totalTHB(cash.received,fx))) + line('รอรับที่ยืนยันได้',money(totalTHB(cash.pending,fx))) +
      (cash.unconfirmed.THB || cash.unconfirmed.USD ? line('ยังแยกรับแล้ว/รอรับไม่ได้', money(totalTHB(cash.unconfirmed,fx)), true) : '') +
      '<small>เป็นยอดสินค้าตามที่ฝ่ายขายบันทึก ไม่ใช่รายการเดินบัญชีธนาคาร</small>';
  }
  function receiptDetails(info, id) {
    return `<details class="ss-settlement-details" data-stock-receipt-details="${esc(id)}"><summary>รับเมื่อไร / หลักฐานรายใบ</summary>${info.money.orders.map(order => `<div><b>${esc(order.ref || 'ยังไม่มีเลขใบ')} · ${esc(order.customer)}</b><span>ยอดขาย ${esc(nativeText(order.sale))}</span>${order.receiptEvents.map(event => `<small>${esc(event.date || (event.month ? event.month + ' · ไม่ระบุวัน' : 'ยังไม่ระบุวันรับ'))} · ${esc(event.currency)} ${n(event.amount)}</small>`).join('')}${order.unconfirmed.THB || order.unconfirmed.USD ? `<small>ยังแยกรับ/คงเหลือไม่ได้ ${esc(nativeText(order.unconfirmed))}${order.partial ? ' · เลือกไม่ครบใบ จึงไม่เฉลี่ยงวดเงิน' : ''}</small>` : ''}</div>`).join('')}</details>`;
  }
  function render(model, expanded = new Set(), warehouse, pendingMessage = 'รอโหลดรายงานเดือนที่ตรวจครบ', currentMonthSold, currentAllocation) {
    if(model?.month!==currentBangkokMonth()||model?.sourceChecksum&&model.sourceChecksum!==currentMonthSold?.source?.checksum)model=null;
    const fx = model?.fx?.rate;
    const sold = currentMonthSoldView(currentMonthSold);
    const allocation=currentAllocationView(currentAllocation,warehouse,sold),verified=allocation.status==='verified-allocation';
    const current = warehouse === undefined ? model : warehouse;
    const physical = current?.physical, free = current?.free;
    const physicalMoney = physical?.value?.equivalentTHB ?? physical?.knownValueTHB ?? null;
    const freeMoney = free?.value?.equivalentTHB ?? free?.knownValueTHB ?? null;
    const cards = [
      {id:'physical', label:'สต๊อกจริง · ทั้งคลัง', data:physical, money:physicalMoney, moneyLabel:'มูลค่าสต๊อก · ราคาประเมินที่บันทึก',
        breakdown:current ? line('ฐานข้อมูล',esc(current.stockReportDate)+(current.stockRevision !== undefined ? ' · รุ่น '+esc(current.stockRevision) : '')) + line('เทียบ 4×8 ความหนาเดิม · รวมไม้แถบ',n(physical.eq4x8)+' แผ่นเทียบ') + line('เทียบ 4×8 หนา 2.5 · รวมไม้แถบ',n(physical.eq25)+' แผ่นเทียบ') : '',
        basis:'Physical ทั้งคลัง ไม่ใช่ยอดเฉพาะเดือนขาย'},
      sold.status==='verified-quantities' ? {id:'sold',label:'ขายแล้วเดือนนี้',month:sold.month,data:sold,money:null,
        moneyLabel:'ราคาขาย / เงินรับจริง',breakdown:line('เดือนปัจจุบัน · เวลาไทย',esc(sold.monthLabel)) + line('โหลดแล้ว',qtyText(sold.loaded)) +
          line('รับเงิน/มัดจำ · ยังไม่โหลด',qtyText(sold.paidOrDeposit)) + line('LCมีETD · ขายแล้วรอเก็บLC',qtyText(sold.lcETD)) +
          line('หลักฐานราคา / รับเงิน','ยังไม่มีหลักฐานราคาขาย/รับเงินตรงชุดนี้',true) + line('ข้อมูลหน้า 09',esc(new Date(sold.source.capturedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}))),
        basis:'นับแต่ละรายการครั้งเดียว · รับมัดจำไม่เท่ากับรับครบ · ชุดหน้า 09 ที่ตรวจแล้ว ไม่ใช่ฟีดขายสด · ไม่เปลี่ยนสต๊อกหรือยอดจอง'}
        : {id:'sold',label:'ขายแล้วเดือนนี้',month:sold.month,pending:true,pendingMessage:sold.reason},
      verified ? {id:'reserved',label:'จองอื่นๆ · ไม่ซ้ำขายแล้ว',month:allocation.month,data:{quantity:allocation.current.other.demand},money:null,
        moneyLabel:'มูลค่าขาย / ราคาประเมิน',breakdown:line('เฉพาะเดือนปัจจุบัน · เวลาไทย',esc(allocation.monthLabel))+
          line('มีของรองรับ',qtyText(allocation.current.other.allocated))+line('ต้องผลิตเพิ่ม',qtyText(allocation.current.other.shortage))+
          line('หลักฐานมูลค่า','ยังไม่มีหลักฐานมูลค่าตรงชุดนี้',true),
        basis:'ความต้องการจองอื่น = มีของรองรับ + ต้องผลิต · ไม่ซ้ำขายแล้ว · ไม่รวมภาระเดือนอื่นในแผนไว้ในหัวกล่อง'}
        : {id:'reserved',label:'จองอื่นๆ · ไม่ซ้ำขายแล้ว',month:allocation.month,pending:true,pendingMessage:allocation.reason},
      {id:'free', label:'Free Stock · ทั้งคลัง', data:free, money:freeMoney, moneyLabel:'มูลค่า Free · ราคาประเมินที่บันทึก',
        breakdown:current ? line('ฐานข้อมูล',esc(current.stockReportDate)+(current.stockRevision !== undefined ? ' · รุ่น '+esc(current.stockRevision) : '')) + line('เทียบ 4×8 หนา 2.5 · รวมไม้แถบ',n(free.eq25)+' แผ่นเทียบ') +
          (verified?line('มีของรองรับขายแล้วเดือนนี้ · ยังไม่โหลด',qtyText(allocation.current.soldUnloaded.allocated))+line('มีของรองรับจองอื่นเดือนนี้',qtyText(allocation.current.other.allocated))+
            line('มีของรองรับภาระเดือนอื่นในแผน',qtyText(allocation.carry.allocated))+line('Free ตามสูตร · Physical ลบของที่จัดสรร',qtyText(allocation.totals.formulaFree))+
            line('Free ที่บันทึกจริง',qtyText(allocation.totals.savedFree))+
            (allocation.manualFreeOverrideCount?line('ปรับ Free ด้วยมือ '+n(allocation.manualFreeOverrideCount)+' สเปก · ส่วนต่างจากสูตร',qtyText(allocation.totals.manualFreeDelta),true):''):
            line('ฐานจัดสรร',esc(allocation.reason)+' · Free นี้ยังเป็นยอดที่บันทึกไว้',true)) : '',
        basis:verified?'รวมทุกเดือนในแผนที่บันทึกและทุกความหนา · หักเฉพาะของจริงที่จัดสรรครั้งเดียว ไม่หักยอดขาดผลิตหรือโหลดแล้วซ้ำ · คงค่าปรับ Free ที่บันทึก':'รวมทุกเดือนในแผนที่บันทึกและทุกความหนา · คง Free ที่บันทึก ไม่ใช้ยอดขายหรือจองเก่าคำนวณแทน'}
    ];
    return cards.map(card => {
      if(card.pending || !card.data)return `<div class="ss-kpi ss-kpi-${card.id}" data-stock-card="${card.id}"${card.month?` data-order-header-month="${esc(card.month)}"`:''}><h3>${esc(card.label)}</h3><p role="status">${esc(card.pending ? card.pendingMessage || pendingMessage : 'รอยืนยันสต๊อกส่วนกลางล่าสุด')}</p><small>ยังไม่แสดงชุดเก่าหรือเดือนอื่นแทน</small></div>`;
      const open = expanded.has(card.id), native = card.data.money ? `<small>${card.id==='reserved'?'ราคาขายจริงตามใบขาย (ไม่ใช่ราคาประเมินสต๊อก): ':''}${esc(nativeText(card.data.money.sale))}${card.data.money.complete?'':' · เฉพาะส่วนที่มีราคา; รอราคา '+n(card.data.money.missingPriceLineCount)+' บรรทัด'}</small>` : '';
      const liveWarehouse = warehouse !== undefined && ['physical','free'].includes(card.id);
      const coverage = liveWarehouse ? card.data.complete ? `<small>ชุดราคาส่วนกลาง ${esc(current.catalogRevision ?? '—')} · ไม่ใช่ราคาขายจริง</small>` :
        `<small class="ss-overview-warning">${card.data.knownValueTHB === null ? 'รอยืนยันชุดราคาหรือเรทส่วนกลาง' : 'เฉพาะส่วนที่ยืนยันราคาได้'}${card.data.unpricedSpecCount ? ' · รอราคา/เรท '+n(card.data.unpricedSpecCount)+' สเปก ('+qtyText(card.data.unknownQuantity)+')' : ''} · ไม่ใช้ 0 หรือราคาชุดเก่าแทน</small>` : '';
      const stockFx = liveWarehouse && current.fx ? `<small>USD/THB ${n(current.fx.rate)} · ${esc(current.fx.date)}${current.fx.status !== 'current' ? ' · คงเรทที่ยืนยันแล้ว ไม่ใช่เรทสด' : ''}</small>` : '';
      const content = `<div class="ss-card-overview"><h3>${esc(card.label)}</h3><div class="ss-overview-quantity"><strong>${n(card.data.quantity.sheet)}</strong><span>แผ่น</span>${card.data.quantity.strip ? `<small>ไม้แถบ ${n(card.data.quantity.strip)} ชิ้น</small>` : ''}</div><div class="ss-overview-value"><span>${esc(card.moneyLabel)}</span><b>${money(card.money)}${liveWarehouse && !card.data.complete && card.money !== null ? ' · ส่วนที่ยืนยันได้' : ''}</b>${native}${coverage}${stockFx}</div><div class="ss-overview-breakdown">${card.breakdown}</div><small class="ss-overview-basis">${esc(card.basis)}</small>${model?.stale && !['sold','reserved'].includes(card.id) ? `<small class="ss-overview-warning">${liveWarehouse ? 'ยอดคลังส่วนกลางล่าสุด · ต่างจากฐานหัวข้อ02ที่ยังเป็นชุดตรวจย้อนหลัง' : 'วัน/จำนวน/ราคา/เรทต่างหรือยังยืนยันไม่ได้ · ชุดตรวจย้อนหลัง'}</small>` : ''}</div>`;
      const cardMonth=card.month||model?.month;
      return `<div class="ss-kpi ss-kpi-${card.id}" data-stock-card="${card.id}"${cardMonth ? ` data-order-header-month="${esc(cardMonth)}"` : ''}${liveWarehouse ? ` data-current-stock-revision="${esc(current.stockRevision)}"` : ''}><div class="ss-card-overview-wrap"${open?' hidden':''}>${content}</div><button type="button" class="ss-card-toggle" data-stock-card-toggle="${card.id}" aria-expanded="${open}" aria-controls="ss-card-details-${card.id}" data-html2canvas-ignore>${open?'ซ่อน':'ดู'}รายละเอียด · ${esc(card.label)}</button><div class="ss-card-detail-content" id="ss-card-details-${card.id}"${open?'':' hidden'}>${content}${card.detail || ''}</div></div>`;
    }).join('');
  }
  return {build, render, sourceText, summarizeMoney, warehouseProjection,currentBangkokMonth,currentMonthSoldView,currentAllocationView};
});
