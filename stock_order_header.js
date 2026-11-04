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
  const physicalItemKey=(w,l,t,grade,unit)=>JSON.stringify([Math.min(Number(w),Number(l)),Math.max(Number(w),Number(l)),Number(t),String(grade??'').trim(),unit]);
  const requireValue = (condition, message) => {if (!condition) throw new Error(message);};
  const add = (target, currency, value) => {requireValue(['THB','USD'].includes(currency) && valid(value), 'ข้อมูลมูลค่าไม่ครบ'); target[currency] += value;};
  const quantity = rows => rows.reduce((out, row) => {requireValue(['sheet','strip'].includes(row.unit) && valid(row.qty), 'ข้อมูลจำนวนไม่ครบ'); out[row.unit] += row.qty; return out;}, units());
  const equivalent = rows => rows.reduce((sum, row) => sum + row.qty * row.w * row.l / (1220 * 2440) * row.t / 2.5, 0);
  const equivalentArea = rows => rows.reduce((sum, row) => sum + row.qty * row.w * row.l / (1220 * 2440), 0);
  // Display composition only: the allocation-only 1200×2400 equivalence does
  // not turn a differently sized saved sheet into a literal 1220×2440 sheet.
  function physicalComposition(rows) {
    const pending=()=>({status:'pending',reason:'ยังแยกขนาด/หน่วย/เกรดจากสต๊อกที่บันทึกได้ไม่ครบ'});
    if(!Array.isArray(rows)||!rows.length)return pending();
    const blank=()=>({quantity:0,eq4x8:0,eq25:0,grades:[],unknownGrade:{quantity:0,eq4x8:0,eq25:0,freeQty:0},gradesComplete:true});
    const groups={normal:blank(),nonstandard:blank(),strip:blank()},maps={normal:new Map(),nonstandard:new Map(),strip:new Map()},seen=new Set(),savedFreeQuantity=units();
    const dimension=value=>(typeof value==='number'||typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value))&&Number.isFinite(Number(value))&&Number(value)>0;
    const safe=value=>valid(value)&&value<=Number.MAX_SAFE_INTEGER;
    const accumulate=(target,qty,area,volume)=>{target.quantity+=qty;target.eq4x8+=area;target.eq25+=volume;return [target.quantity,target.eq4x8,target.eq25].every(safe);};
    for(const row of rows){
      if(!row||!['sheet','strip'].includes(row.unit)||!safe(row.qty)||![row.w,row.l,row.t].every(dimension))return pending();
      if(row.key!==undefined){if(typeof row.key!=='string'||!row.key||seen.has(row.key))return pending();seen.add(row.key);}
      const w=Number(row.w),l=Number(row.l),t=Number(row.t),kind=row.unit==='strip'?'strip':(w===1220&&l===2440||w===2440&&l===1220)?'normal':'nonstandard';
      const area=row.qty*w*l/(1220*2440),volume=area*t/2.5,group=groups[kind];
      if(!accumulate(group,row.qty,area,volume))return pending();
      const savedFree=safe(row.freeQty)?row.freeQty:null;
      savedFreeQuantity[row.unit]=savedFreeQuantity[row.unit]===null||savedFree===null?null:savedFreeQuantity[row.unit]+savedFree;
      if(savedFreeQuantity[row.unit]!==null&&!safe(savedFreeQuantity[row.unit]))savedFreeQuantity[row.unit]=null;
      const grade=typeof row.grade==='string'?row.grade.trim():'';
      if(grade.length>100||row.grade!==undefined&&row.grade!==null&&typeof row.grade!=='string')return pending();
      if(!grade){if(row.qty>0)group.gradesComplete=false;if(!accumulate(group.unknownGrade,row.qty,area,volume))return pending();group.unknownGrade.freeQty=group.unknownGrade.freeQty===null||savedFree===null?null:group.unknownGrade.freeQty+savedFree;continue;}
      if(!maps[kind].has(grade))maps[kind].set(grade,{grade,quantity:0,eq4x8:0,eq25:0,items:[]});
      const gradeGroup=maps[kind].get(grade);
      if(!accumulate(gradeGroup,row.qty,area,volume))return pending();
      // Only exactly reversed edges share a display row. Allocation-only near
      // sizes, different thicknesses, grades and units never merge here.
      const edges=[w,l].sort((a,b)=>a-b);
      let item=gradeGroup.items.find(i=>i.w===edges[0]&&i.l===edges[1]&&i.t===t&&i.unit===row.unit);
      if(!item){item={w:edges[0],l:edges[1],t,unit:row.unit,quantity:0,freeQty:0,rowCount:0};gradeGroup.items.push(item);}
      item.quantity+=row.qty;item.rowCount++;
      item.freeQty=item.freeQty===null||savedFree===null?null:item.freeQty+savedFree;
      if(item.freeQty!==null&&!safe(item.freeQty))item.freeQty=null;
    }
    const order=['AV','AAA','A','B','F','REJ','C','UN','CTS'],rank=g=>order.includes(g)?order.indexOf(g):order.length;
    for(const kind of Object.keys(groups))groups[kind].grades=[...maps[kind].values()].filter(g=>g.quantity>0||g.items.some(i=>i.freeQty>0)).sort((a,b)=>rank(a.grade)-rank(b.grade)||a.grade.localeCompare(b.grade,'en')).map(g=>({...g,items:g.items.sort((a,b)=>a.w-b.w||a.l-b.l||a.t-b.t)}));
    const quantity={sheet:groups.normal.quantity+groups.nonstandard.quantity,strip:groups.strip.quantity},eq4x8=groups.normal.eq4x8+groups.nonstandard.eq4x8+groups.strip.eq4x8,eq25=groups.normal.eq25+groups.nonstandard.eq25+groups.strip.eq25;
    if(![quantity.sheet,quantity.strip,eq4x8,eq25].every(safe))return pending();
    return {status:'verified-quantities',quantity,eq4x8,eq25,savedFreeQuantity,groups,gradesComplete:Object.values(groups).every(g=>g.gradesComplete)};
  }
  const totalTHB = (native, fx) => native && valid(native.THB) && valid(native.USD) && valid(fx) && fx > 0 ? native.THB + native.USD * fx : null;
  const money = value => value === null || !valid(value) ? 'ยังยืนยันไม่ได้' : '≈ ฿ ' + n(value);
  const qtyText = value => n(value.sheet) + ' แผ่น' + (value.strip ? ' · ไม้แถบ ' + n(value.strip) + ' ชิ้น' : '');
  const nativeText = value => 'THB ' + n(value.THB) + ' · USD ' + n(value.USD);

  // A complete sales-source view may be useful before a stock cutoff is safe.
  // This is NOT an allocation fallback: any supplied stock result rejects it.
  function salesOnlyReviewValid(review, readModel, sold) {
    try {
      const rows=review?.rows,queue=review?.queueReview,meta=review?.metadata;
      if(readModel?.kind!=='current-month-order-review'||readModel.status!=='verified-sales-only'||readModel.stock!==null||readModel.queueApplied!==false||readModel.allocationFullyReconciled!==false||
        meta?.salesOnly!==true||meta.allocationBasis!=='pending-current-stock-cutoff'||meta.allocationFullyReconciled!==false||meta.stockPhysicalRowsReconciled!==false||meta.month!==sold?.month||sold?.status!=='verified-quantities'||
        readModel.source?.month!==sold.month||readModel.source.checksum!==sold.source?.checksum||readModel.source.capturedAt!==sold.source?.capturedAt||readModel.source.page!==9||readModel.source.sourceIsLive!==false||
        !Array.isArray(rows)||rows.length!==sold.source.lineCount||!Array.isArray(review.stockPools)||review.stockPools.length||review.freeStock!==null||
        !queue||queue.allocationComplete!==false||queue.stockBasis?.physicalCutoffVerified!==false||!Array.isArray(queue.poolQueues)||queue.poolQueues.length||JSON.stringify(queue.rows)!==JSON.stringify(rows))return false;
      const count=v=>Number.isSafeInteger(v)&&v>=0,empty=v=>Array.isArray(v)&&v.length===0;
      const ids=new Set(),orders=new Set(),actual=units(),raw=units(),groups={loaded:units(),paidOrDeposit:units(),lcETD:units()};
      for(const r of rows){
        const q=r.queue;
        if(typeof r.id!=='string'||!r.id||ids.has(r.id)||typeof r.orderId!=='string'||!r.orderId||!['sheet','strip'].includes(r.unit)||!count(r.qty)||!count(r.sourceQty)||
          typeof r.cancelled!=='boolean'||!['loaded','paidOrDeposit','lcETD','notSold'].includes(r.soldGroup)||(r.cancelled?r.qty!==0:r.qty!==r.sourceQty)||r.allocated!==null||r.shortage!==null||r.reservationKind!==null||!empty(r.parts)||!empty(r.priorParts)||
          !q||typeof q.eligible!=='boolean'||![1,2,3,4].includes(q.group)||q.allocationStatus!=='pending'||q.allocated!==null||q.shortage!==null||q.remaining!==null||
          q.availableBefore!==undefined&&q.availableBefore!==null||!empty(q.parts)||!count(r.loaded)||!count(r.unreserved)||!count(r.pendingQty)||
          r.loaded+r.unreserved+r.pendingQty!==r.qty||r.loaded!==(q.group===1?r.qty:0)||r.pendingQty!==(q.eligible?r.qty:0))return false;
        ids.add(r.id);orders.add(r.orderId);actual[r.unit]+=r.qty;raw[r.unit]+=r.sourceQty;
        if(Object.hasOwn(groups,r.soldGroup)&&!r.cancelled)groups[r.soldGroup][r.unit]+=r.qty;
      }
      const soldRows=rows.filter(r=>!r.cancelled&&r.soldGroup!=='notSold');
      if(orders.size!==sold.source.orderCount||soldRows.length!==sold.lineCount||new Set(soldRows.map(r=>r.orderId)).size!==sold.orderCount)return false;
      const unitEqual=(a,b)=>a&&['sheet','strip'].every(u=>count(a[u])&&a[u]===b[u]);
      for(const key of Object.keys(groups))if(!unitEqual(sold[key],groups[key]))return false;
      if(!unitEqual(sold.quantity,{sheet:groups.loaded.sheet+groups.paidOrDeposit.sheet+groups.lcETD.sheet,strip:groups.loaded.strip+groups.paidOrDeposit.strip+groups.lcETD.strip}))return false;
      const total=(rr,field)=>rr.reduce((s,r)=>(s[r.unit]+=r[field],s),units());
      const checkSummary=(s,rr,withUnits=false)=>{
        const qty=total(rr,'qty'),sourceQty=total(rr,'sourceQty');
        if(!s||s.allocationComplete!==false||s.allocated!==null||s.shortage!==null||s.lineCount!==rr.length||s.orderCount!==new Set(rr.map(r=>r.orderId)).size||!unitEqual(s.quantityByUnit,qty)||!unitEqual(s.sourceQuantityByUnit,sourceQty))return false;
        if(withUnits||s.byUnit)for(const u of ['sheet','strip'])if(!s.byUnit?.[u]||s.byUnit[u].allocated!==null||s.byUnit[u].shortage!==null||s.byUnit[u].ordered!==qty[u]||s.byUnit[u].sourceOrdered!==sourceQty[u])return false;
        return true;
      };
      if(!checkSummary(review.summary,rows,true)||!checkSummary(queue.summary,rows))return false;
      const thicknesses=[...new Set(rows.map(r=>String(Number(r.t))))].sort();
      if(!Array.isArray(review.thicknesses)||review.thicknesses.map(t=>String(Number(t))).sort().join('|')!==thicknesses.join('|'))return false;
      for(const [byThickness,withUnits]of [[review.byThickness,true],[queue.byThickness,false]]){
        if(!byThickness||Object.keys(byThickness).sort().join('|')!==thicknesses.join('|'))return false;
        for(const t of thicknesses)if(!checkSummary(byThickness[t],rows.filter(r=>Number(r.t)===Number(t)),withUnits))return false;
      }
      return true;
    } catch {return false;}
  }

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
    const physicalRows = stockRows.map(row => ({...row, qty: row.physical, freeQty: row.free}));
    const freeRows = stockRows.map(row => ({...row, qty: row.free}));
    const value = review.reconciliation?.headerStockValuations || {};
    const fx = financial.metadata.fx;
    requireValue(valid(fx?.rate) && fx.rate > 0, 'ยังยืนยันอัตราแลกเปลี่ยนไม่ได้');
    const out = {month: review.metadata.month, monthLabel: review.metadata.monthLabel || review.metadata.month,
      sourceCapturedAt: review.metadata.sourceSalesCapturedAt, stockReportDate: review.metadata.stockReportDate,
      sourceIsLive: false, queueApplied: false, sameMonthAsSection02: true, thicknessScope: 'all',
      stale: readModel.stale === true, stockMatches: readModel.stockMatches === true, warning: readModel.warning || '',
      availableMonths: readModel.availableMonths || [review.metadata.month], fx,
      physical: {quantity: quantity(physicalRows), eq4x8: equivalentArea(physicalRows), eq25: equivalent(physicalRows), value: value.physical || null,composition:physicalComposition(physicalRows)},
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
    const freeValueItems={};
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
        if(field==='freeQty'){
          // catalogFreeValue is already THB, decorated by the exact saved
          // catalog and evidenced FX. Never use Page09 or legacy row prices.
          const key=physicalItemKey(row.w,row.l,row.t,row.grade,row.unit);
          const item=freeValueItems[key]||(freeValueItems[key]={freeQty:0,valueTHB:0,knownValueTHB:0,unknownPriceRows:0});
          item.freeQty+=qty;
          if(priced){item.knownValueTHB+=row[valueField];if(item.valueTHB!==null)item.valueTHB+=row[valueField];}
          else {item.valueTHB=null;item.unknownPriceRows++;}
        }
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
    physical.composition={...physicalComposition(stock.rows),stockReportDate:stock.reportDate,stockRevision:stock.revision,
      freeValuation:{catalogRevision:stock.savedCatalog?.catalogRevision??null,fx:stock.headerExchangeRate||null,knownValueTHB:free.knownValueTHB,items:freeValueItems}};
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
    const sales = model ? `รายละเอียดหัวข้อ02 เดือนนี้: ${model.monthLabel} · ทุกความหนา · อ่านขาย ${model.sourceCapturedAt || 'ไม่ระบุเวลา'} · ${model.salesOnly?'ตรวจต้นทางขายแล้ว · การจัดสรร/Free/ต้องผลิตยังรอยืนยัน':'ชุดที่ตรวจแล้ว'} ไม่ใช่ฟีดขายสด`
      : 'รายละเอียดหัวข้อ02 เดือนนี้: รอชุดเดือนปัจจุบันที่ตรงกับกล่องด้านบน · ไม่ใช้เดือนก่อนแทน';
    const current = warehouse === undefined ? model : warehouse;
    const stock = current ? `Physical/Free ทั้งคลังรายงาน ${current.stockReportDate}${current.stockRevision !== undefined ? ' · รุ่น '+current.stockRevision : ''} · ${allocation.status==='verified-allocation'?'Free จากแผนจองที่ยืนยันกับรุ่นนี้ · คงค่าปรับมือ':'Free ตามยอดที่บันทึก · การจัดสรรล่าสุดยังรอตรวจ'}` : 'Physical/Free รอยืนยันข้อมูลส่วนกลาง';
    const fx = warehouse?.fx;
    return `${currentSoldSource(currentMonthSoldView(currentMonthSold))} · ${allocationSource} · ${sales} · ${stock}${fx ? ` · เรทประเมินสต๊อก USD/THB ${fx.rate} (${fx.date})` : ''}${model?.fx ? ` · เรทชุดขาย USD/THB ${model.fx.rate} (${model.fx.date})` : ''}`;
  }
  const line = (label, value, warning = false) => `<div class="ss-overview-row${warning ? ' ss-overview-warning' : ''}"><span>${esc(label)}</span><b>${value}</b></div>`;
  const boundPhysicalComposition=physical=>{
    const c=physical?.composition,close=(a,b)=>valid(a)&&valid(b)&&Math.abs(a-b)<=Math.max(1e-6,Math.abs(b)*1e-12);
    return c?.status==='verified-quantities'&&c.groups&&close(c.quantity?.sheet,physical.quantity?.sheet)&&close(c.quantity?.strip,physical.quantity?.strip)&&close(c.eq4x8,physical.eq4x8)&&close(c.eq25,physical.eq25)?c:null;
  };
  const physicalNumber=(value,field)=>field==='quantity'?Number(value).toLocaleString('th-TH',{maximumFractionDigits:20}):value>0&&value<0.005?'&lt; 0.01':n(value);
  const physicalGradesHTML=(group,field,unit)=>{
    const entries=group.grades.filter(g=>g.quantity>0).map(g=>`<span class="ss-physical-grade" data-physical-grade="${esc(g.grade)}">${esc(g.grade)} ${physicalNumber(g[field],field)} ${esc(unit)}</span>`);
    if(group.unknownGrade.quantity>0)entries.push(`<span class="ss-physical-grade ss-overview-warning">ยังไม่ระบุเกรด ${physicalNumber(group.unknownGrade[field],field)} ${esc(unit)} · รอตรวจ</span>`);
    return entries.length?`<small class="ss-physical-grades"${field==='quantity'?'':' data-grade-quantity-basis="equivalent"'}>เกรด: ${entries.join(' · ')}</small>`:'';
  };
  function physicalGradeDetailsHTML(group,unit,freeBound,freeValuation,valueBound){
    const entries=group.grades.map(g=>{
      const items=g.items,close=(a,b)=>valid(a)&&valid(b)&&Math.abs(a-b)<=Math.max(1e-6,Math.abs(b)*1e-12);
      const complete=Array.isArray(items)&&items.length>0&&items.every(i=>[i.w,i.l,i.t].every(v=>valid(v)&&v>0)&&valid(i.quantity)&&['sheet','strip'].includes(i.unit))&&close(items.reduce((s,i)=>s+i.quantity,0),g.quantity);
      const label=`${esc(g.grade)} ${physicalNumber(g.quantity,'quantity')} ${esc(unit)}`;
      if(!complete)return `<div class="ss-physical-grade">${label}<small class="ss-overview-warning"> รายละเอียดรายความหนารอยืนยัน</small></div>`;
      let previousSize='';
      const rows=items.map(i=>{
        const size=i.w+' × '+i.l,heading=size!==previousSize?`<div class="ss-physical-item-size">${esc(size)} มม.</div>`:'';previousSize=size;
        const knownFree=freeBound&&valid(i.freeQty);
        const valuation=freeValuation?.items?.[physicalItemKey(i.w,i.l,i.t,g.grade,i.unit)];
        const knownValue=knownFree&&valueBound&&valuation?.unknownPriceRows===0&&close(valuation.freeQty,i.freeQty)&&close(valuation.valueTHB,valuation.knownValueTHB);
        const valueText=!knownFree?'รอยืนยัน':knownValue?money(valuation.valueTHB):'รอราคา/FX';
        return `${heading}<div class="ss-physical-item" data-physical-item="${esc([i.w,i.l,i.t,i.unit].join('|'))}"><span>${esc(i.t)} <small>มม.</small></span><b data-item-physical>${physicalNumber(i.quantity,'quantity')}</b><b class="ss-physical-item-free${knownFree?'':' ss-overview-warning'}" data-item-free>${knownFree?physicalNumber(i.freeQty,'quantity'):'รอยืนยัน'}</b><b class="ss-physical-item-value${knownValue?'':' ss-overview-warning'}" data-item-free-value>${valueText}</b></div>`;
      }).join('');
      return `<details class="ss-physical-grade-detail" data-physical-grade="${esc(g.grade)}"><summary aria-label="ดูขนาดและความหนา เกรด ${esc(g.grade)} ${esc(unit)}"><span>${label}</span><small>ดูความหนา</small></summary><div class="ss-physical-items"><div class="ss-physical-item-head"><span>หนา</span><span>สต๊อก · ${esc(unit)}</span><span>Free ที่บันทึก</span><span>มูลค่า Free<br>ประเมิน · บาท</span></div>${rows}<small class="ss-physical-value-note">ราคาสต๊อกที่บันทึก · ไม่ใช่ราคาขายจริง</small></div></details>`;
    });
    if(group.unknownGrade.quantity>0)entries.push(`<small class="ss-overview-warning">ยังไม่ระบุเกรด ${physicalNumber(group.unknownGrade.quantity,'quantity')} ${esc(unit)} · รอตรวจ</small>`);
    return entries.length?'<div class="ss-physical-grade-list"><small class="ss-physical-grade-hint">เกรด: กดดูขนาด / ความหนา / Free</small>'+entries.join('')+'</div>':'';
  }
  function physicalCompositionHTML(physical,current,verified){
    const c=boundPhysicalComposition(physical);
    if(!c)return '<div class="ss-physical-composition"><small class="ss-overview-warning" role="status">รายละเอียดขนาดและเกรดยังรอยืนยัน · ไม่เติมยอดส่วนย่อยเป็น 0</small></div>';
    const itemFree=units();
    for(const [kind,g] of Object.entries(c.groups)){
      const unit=kind==='strip'?'strip':'sheet',values=[g.unknownGrade.freeQty,...g.grades.flatMap(grade=>grade.items?.map(i=>i.freeQty)||[null])];
      for(const value of values)itemFree[unit]=itemFree[unit]===null||!valid(value)?null:itemFree[unit]+value;
    }
    const close=(a,b)=>valid(a)&&valid(b)&&Math.abs(a-b)<=Math.max(1e-6,Math.abs(b)*1e-12);
    const freeBound=c.stockReportDate===current?.stockReportDate&&c.stockRevision===current?.stockRevision&&['sheet','strip'].every(u=>close(c.savedFreeQuantity?.[u],current?.free?.quantity?.[u])&&close(itemFree[u],c.savedFreeQuantity[u]));
    const valuation=c.freeValuation,fxIdentity=fx=>fx?JSON.stringify([fx.rate,fx.date,fx.status,fx.basis]):'none';
    const valueBound=freeBound&&current?.catalogRevision!==null&&current?.catalogRevision!==undefined&&valuation?.catalogRevision===current.catalogRevision&&
      fxIdentity(valuation.fx)===fxIdentity(current.fx)&&close(valuation.knownValueTHB,current.free?.knownValueTHB)&&
      close(Object.values(valuation.items||{}).reduce((sum,item)=>sum+item.knownValueTHB,0),valuation.knownValueTHB);
    const definitions=[['normal','แผ่นปกติ 1220×2440 · ในยอดแผ่นรวม','แผ่น'],['nonstandard','ไม่ใช่ขนาดปกติ · ในยอดแผ่นรวม','แผ่น'],['strip','ไม้แถบ · แยกจากยอดแผ่น','ชิ้น']];
    const basis=`รายงาน ${esc(current?.stockReportDate||'รอยืนยัน')}${current?.stockRevision!==undefined?' · รุ่น '+esc(current.stockRevision):''}`;
    const warning=!freeBound?'Free รายรายการยังรอยืนยันฐานเดียวกับยอดรวม':verified?'Free ตามแผนที่บันทึก · ไม่ใช่การยืนยันพร้อมโหลด':'Free ที่บันทึก · ยังรอยืนยันกับยอดขายล่าสุด';
    return '<div class="ss-physical-composition">'+definitions.filter(([id])=>id!=='strip'||c.groups.strip.quantity>0||c.groups.strip.grades.length).map(([id,label,unit])=>{const g=c.groups[id];return `<div class="ss-physical-group" data-physical-group="${id}"><div class="ss-physical-group-heading"><span>${esc(label)}</span><b>${physicalNumber(g.quantity,'quantity')} ${esc(unit)}</b></div>${physicalGradeDetailsHTML(g,unit,freeBound,valuation,valueBound)}</div>`;}).join('')+`<small class="ss-physical-subset-note">ส่วนย่อยของยอดรวม ไม่บวกเพิ่ม · ${basis}</small><small class="ss-physical-free-basis${verified&&freeBound?'':' ss-overview-warning'}" role="status">${warning}</small></div>`;
  }
  function physicalEquivalentsHTML(physical){
    const c=boundPhysicalComposition(physical);
    return '<div class="ss-physical-equivalent-breakdown">'+[['eq4x8','area','เทียบ 4×8 ความหนาเดิม · รวมไม้แถบ'],['eq25','volume','เทียบ 4×8 หนา 2.5 · รวมไม้แถบ']].map(([field,id,label])=>
      `<div class="ss-physical-equivalent" data-physical-equivalent="${id}">${line(label,n(physical[field])+' แผ่นเทียบ')}${c?['nonstandard','strip'].filter(kind=>c.groups[kind].quantity>0).map(kind=>{const g=c.groups[kind];return `<div class="ss-physical-subset" data-physical-equivalent-group="${kind}">${line('↳ '+(kind==='strip'?'เฉพาะไม้แถบ':'เฉพาะที่ไม่ใช่ขนาดปกติ'),physicalNumber(g[field],field)+' แผ่นเทียบ')}${physicalGradesHTML(g,field,'แผ่นเทียบ')}</div>`;}).join(''):''}</div>`
    ).join('')+'</div>';
  }
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
        breakdown:current ? line('ฐานข้อมูล',esc(current.stockReportDate)+(current.stockRevision !== undefined ? ' · รุ่น '+esc(current.stockRevision) : '')) + physicalEquivalentsHTML(physical) : '',
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
      const content = `<div class="ss-card-overview"><h3>${esc(card.label)}</h3><div class="ss-overview-quantity"><strong>${n(card.data.quantity.sheet)}</strong><span>แผ่น</span>${card.data.quantity.strip&&!(card.id==='physical'&&boundPhysicalComposition(physical)) ? `<small>ไม้แถบ ${n(card.data.quantity.strip)} ชิ้น</small>` : ''}</div>${card.id==='physical'?physicalCompositionHTML(physical,current,verified):''}<div class="ss-overview-value"><span>${esc(card.moneyLabel)}</span><b>${money(card.money)}${liveWarehouse && !card.data.complete && card.money !== null ? ' · ส่วนที่ยืนยันได้' : ''}</b>${native}${coverage}${stockFx}</div><div class="ss-overview-breakdown">${card.breakdown}</div><small class="ss-overview-basis">${esc(card.basis)}</small>${model?.stale && !['sold','reserved'].includes(card.id) ? `<small class="ss-overview-warning">${liveWarehouse ? 'ยอดคลังส่วนกลางล่าสุด · ต่างจากฐานหัวข้อ02ที่ยังเป็นชุดตรวจย้อนหลัง' : 'วัน/จำนวน/ราคา/เรทต่างหรือยังยืนยันไม่ได้ · ชุดตรวจย้อนหลัง'}</small>` : ''}</div>`;
      const cardMonth=card.month||model?.month;
      return `<div class="ss-kpi ss-kpi-${card.id}" data-stock-card="${card.id}"${cardMonth ? ` data-order-header-month="${esc(cardMonth)}"` : ''}${liveWarehouse ? ` data-current-stock-revision="${esc(current.stockRevision)}"` : ''}><div class="ss-card-overview-wrap"${open?' hidden':''}>${content}</div><button type="button" class="ss-card-toggle" data-stock-card-toggle="${card.id}" aria-expanded="${open}" aria-controls="ss-card-details-${card.id}" data-html2canvas-ignore>${open?'ซ่อน':'ดู'}รายละเอียด · ${esc(card.label)}</button><div class="ss-card-detail-content" id="ss-card-details-${card.id}"${open?'':' hidden'}>${content}${card.detail || ''}</div></div>`;
    }).join('');
  }
  return {build, render, sourceText, summarizeMoney, warehouseProjection,physicalComposition,currentBangkokMonth,currentMonthSoldView,currentAllocationView,salesOnlyReviewValid};
});
