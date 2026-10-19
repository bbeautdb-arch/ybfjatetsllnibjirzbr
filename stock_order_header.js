/* Data-free selected-month header. Read-only: no storage, tokens or network. */
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
  function sourceText(model) {
    return `ขาย/จอง: ${model.monthLabel} · ชุดเดียวกับหัวข้อ02 ทุกความหนา · อ่านขาย ${model.sourceCapturedAt || 'ไม่ระบุเวลา'} · Physical/Free ทั้งคลังรายงาน ${model.stockReportDate} · Freeยังเป็นแผนเดิม ไม่ใช่คิวใหม่ · USD/THB ${model.fx.rate} (${model.fx.date})`;
  }
  const line = (label, value, warning = false) => `<div class="ss-overview-row${warning ? ' ss-overview-warning' : ''}"><span>${esc(label)}</span><b>${value}</b></div>`;
  function receiptsHTML(info, fx) {
    const cash = info.money;
    return line('รับแล้วตามหลักฐานสินค้า', money(totalTHB(cash.received,fx))) + line('รอรับที่ยืนยันได้',money(totalTHB(cash.pending,fx))) +
      (cash.unconfirmed.THB || cash.unconfirmed.USD ? line('ยังแยกรับแล้ว/รอรับไม่ได้', money(totalTHB(cash.unconfirmed,fx)), true) : '') +
      '<small>เป็นยอดสินค้าตามที่ฝ่ายขายบันทึก ไม่ใช่รายการเดินบัญชีธนาคาร</small>';
  }
  function receiptDetails(info) {
    return `<details class="ss-settlement-details"><summary>รับเมื่อไร / หลักฐานรายใบ</summary>${info.money.orders.map(order => `<div><b>${esc(order.ref || 'ยังไม่มีเลขใบ')} · ${esc(order.customer)}</b><span>ยอดขาย ${esc(nativeText(order.sale))}</span>${order.receiptEvents.map(event => `<small>${esc(event.date || (event.month ? event.month + ' · ไม่ระบุวัน' : 'ยังไม่ระบุวันรับ'))} · ${esc(event.currency)} ${n(event.amount)}</small>`).join('')}${order.unconfirmed.THB || order.unconfirmed.USD ? `<small>ยังแยกรับ/คงเหลือไม่ได้ ${esc(nativeText(order.unconfirmed))}${order.partial ? ' · เลือกไม่ครบใบ จึงไม่เฉลี่ยงวดเงิน' : ''}</small>` : ''}</div>`).join('')}</details>`;
  }
  function render(model, expanded = new Set()) {
    const fx = model.fx.rate;
    const physicalMoney = model.physical.value?.equivalentTHB ?? null;
    const freeMoney = model.free.value?.equivalentTHB ?? model.free.knownValueTHB;
    const cards = [
      {id:'physical', label:'สต๊อกจริง · ทั้งคลัง', data:model.physical, money:physicalMoney, moneyLabel:'มูลค่าสต๊อก · ราคาประเมินที่บันทึก',
        breakdown:line('ฐานข้อมูล',esc(model.stockReportDate)) + line('เทียบ 4×8 ความหนาเดิม · รวมไม้แถบ',n(model.physical.eq4x8)+' แผ่นเทียบ') + line('เทียบ 4×8 หนา 2.5 · รวมไม้แถบ',n(model.physical.eq25)+' แผ่นเทียบ'),
        basis:'Physical ทั้งคลัง ไม่ใช่ยอดเฉพาะเดือนขาย · ยังไม่ปรับตามคิวใหม่'},
      {id:'sold', label:'ขายแล้ว · เดือนที่เลือก', data:model.sold, money:model.sold.money.complete ? totalTHB(model.sold.money.sale,fx) : null,
        moneyLabel:'ราคาขายจริง · ไม่ใช่ราคาสต๊อก', breakdown:receiptsHTML(model.sold,fx) + line('โหลดแล้ว',qtyText(model.sold.loaded)) +
          line('รับเงิน/มัดจำ · ยังไม่โหลด',qtyText(model.sold.paidOrDeposit)) + line('LCมีETD · ขายแล้วรอเก็บLC',qtyText(model.sold.lcETD)),
        basis:'นับแต่ละรายการครั้งเดียว · รับมัดจำไม่เท่ากับรับครบ · ยังรอตรวจมีของ/ต้องผลิตทั้งคิว', detail:receiptDetails(model.sold)},
      {id:'reserved', label:'จองอื่น · ไม่ซ้ำขายแล้ว', data:model.reserved, money:model.reserved.value?.equivalentTHB ?? null,
        moneyLabel:'มูลค่าความต้องการ · ราคาประเมินสต๊อก', breakdown:line('PI/มีเรือ + ETD · ไม่รวมLCที่ขายแล้ว',qtyText(model.reserved.quantity)) +
          line('มูลค่าขายตามใบในกลุ่มนี้',model.reserved.money.complete ? money(totalTHB(model.reserved.money.sale,fx)) : 'ยังไม่ครบ') +
          line('มีของ / ต้องผลิต', 'รอตรวจจัดสรรทั้งคิว', true) + line('รอเงื่อนไข · แยกจากจองอื่น',qtyText(model.waiting.quantity)),
        basis:'เฉพาะเดือนที่เลือก ไม่ได้ใช้แทนจองทั้งคลัง · รอเงื่อนไขไม่เท่ากับยกเลิก', detail:receiptDetails(model.reserved)},
      {id:'free', label:'Free Stock · ทั้งคลัง', data:model.free, money:freeMoney, moneyLabel:'มูลค่า Free · ราคาประเมินที่บันทึก',
        breakdown:line('เทียบ 4×8 หนา 2.5 · รวมไม้แถบ',n(model.free.eq25)+' แผ่นเทียบ') + line('ฐานจัดสรร', 'แผนเดิม · ไม่ใช่ยอดหลังคิวใหม่', true),
        basis:'รวมทุกเดือนและทุกความหนา · ไม่เพิ่มคืนของที่เพิ่งขึ้นโหลดโดยยังไม่ตรวจ Physical'}
    ];
    return cards.map(card => {
      const open = expanded.has(card.id), native = card.data.money ? `<small>${card.id==='reserved'?'ราคาขายจริงตามใบขาย (ไม่ใช่ราคาประเมินสต๊อก): ':''}${esc(nativeText(card.data.money.sale))}${card.data.money.complete?'':' · เฉพาะส่วนที่มีราคา; รอราคา '+n(card.data.money.missingPriceLineCount)+' บรรทัด'}</small>` : '';
      const content = `<div class="ss-card-overview"><h3>${esc(card.label)}</h3><div class="ss-overview-quantity"><strong>${n(card.data.quantity.sheet)}</strong><span>แผ่น</span>${card.data.quantity.strip ? `<small>ไม้แถบ ${n(card.data.quantity.strip)} ชิ้น</small>` : ''}</div><div class="ss-overview-value"><span>${esc(card.moneyLabel)}</span><b>${money(card.money)}</b>${native}</div><div class="ss-overview-breakdown">${card.breakdown}</div><small class="ss-overview-basis">${esc(card.basis)}</small>${model.stale ? '<small class="ss-overview-warning">วัน/จำนวน/ราคา/เรทต่างหรือยังยืนยันไม่ได้ · ชุดตรวจย้อนหลัง</small>' : ''}</div>`;
      return `<div class="ss-kpi ss-kpi-${card.id}" data-stock-card="${card.id}" data-order-header-month="${esc(model.month)}"><div class="ss-card-overview-wrap"${open?' hidden':''}>${content}</div><button type="button" class="ss-card-toggle" data-stock-card-toggle="${card.id}" aria-expanded="${open}" aria-controls="ss-card-details-${card.id}" data-html2canvas-ignore>${open?'ซ่อน':'ดู'}รายละเอียด · ${esc(card.label)}</button><div class="ss-card-detail-content" id="ss-card-details-${card.id}"${open?'':' hidden'}>${content}${card.detail || ''}</div></div>`;
    }).join('');
  }
  return {build, render, sourceText, summarizeMoney};
});
