/* Read-only presentation of AAFSalesThickness. No acquisition, storage or writes. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AAFSalesThicknessView=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;
  const positive=value=>valid(value)&&value>0;
  const num=value=>valid(value)?value.toLocaleString('en-US',{maximumFractionDigits:2}):'ยังไม่ยืนยัน';
  const money=value=>valid(value)?value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'ยังไม่ยืนยัน';
  const count=value=>Number.isSafeInteger(value)&&value>=0?num(value):'—';
  const labels={confirmed:'ขายแล้ว / ออเดอร์ยืนยัน',negotiation:'เจรจา · โอกาสซื้อ 80%+',forecast:'Forecast'};
  const unitLabel=unit=>unit==='sheet'?'แผ่น':unit==='strip'?'ชิ้นไม้แถบ':'หน่วยไม่ยืนยัน';
  const detailStatus={loaded:'โหลดแล้ว',waiting:'รอโหลด',negotiation:'เจรจา',forecast:'Forecast'};
  function quantity(aggregate){
    const q=aggregate?.quantity;
    return `<span class="stv-number" data-stv-unit="sheet">${num(q?.sheet)} <small>แผ่น</small></span>${q?.strip!==0?`<span class="stv-secondary" data-stv-unit="strip">${num(q?.strip)} ชิ้นไม้แถบ</span>`:''}`;
  }
  function equivalent(aggregate){
    const eq=aggregate?.eq25;
    const strict=valid(eq?.total);
    const title=strict?`${num(eq.total)} <small>แผ่นเทียบ</small>`:'รอขนาดต้นทาง';
    const missing=Number.isSafeInteger(eq?.missingLineCount)&&eq.missingLineCount>0?`<span class="stv-warning">ขาดขนาด ${num(eq.missingLineCount)} บรรทัด</span>`:'';
    const known=!strict&&valid(eq?.knownTotal)?`<span class="stv-secondary">ส่วนที่แปลงได้ ${num(eq.knownTotal)}</span>`:'';
    const parts=aggregate?.quantity?.strip!==0?`<span class="stv-secondary">แผ่น ${num(eq?.sheet)} · แถบ ${num(eq?.strip)}</span>`:'';
    return `<span class="stv-number${strict?'':' stv-unknown'}">${title}</span>${parts}${known}${missing}`;
  }
  function missingText(m){
    const entries=[['missingPriceCount','ขาดราคา'],['missingCurrencyCount','ขาดสกุลเงิน'],['missingFxCount','ขาดเรท']];
    return entries.filter(([key])=>Number.isSafeInteger(m?.[key])&&m[key]>0).map(([key,label])=>`${label} ${num(m[key])}`).join(' · ');
  }
  function coverage(aggregate){
    return ['sheet','strip'].filter(unit=>aggregate?.quantity?.[unit]!==0).map(unit=>{
      const m=aggregate?.money?.[unit];
      return `${num(m?.thbPricedQty)} / ${num(aggregate?.quantity?.[unit])} ${unitLabel(unit)}`;
    }).join(' · ');
  }
  function saleValue(aggregate){
    const m=aggregate?.money?.combined,fullyKnown=m?.complete===true&&valid(m?.totalTHB);
    const hasKnown=valid(m?.knownTHB)&&Number.isSafeInteger(m?.thbPricedLineCount)&&m.thbPricedLineCount>0;
    const value=fullyKnown?m.totalTHB:hasKnown?m.knownTHB:null;
    const isFx=positive(m?.knownNative?.USD)&&Number.isSafeInteger(m?.missingFxCount)&&m.missingFxCount===0;
    const amount=value===null?'<span class="stv-number stv-unknown">ยังไม่มีมูลค่าที่รวมเป็นบาทได้</span>':`<span class="stv-number">${isFx?'≈ ':''}฿ ${money(value)}</span>`;
    const partial=!fullyKnown&&hasKnown?'<span class="stv-secondary">รวมเฉพาะส่วนที่ทราบ</span>':'';
    const warnings=missingText(m);
    const native=positive(m?.knownNative?.USD)&&m?.missingFxCount>0?`<span class="stv-secondary">US$ ${money(m.knownNative.USD)} · ยังไม่รวมเป็นบาท</span>`:'';
    return `${amount}${partial}${native}${warnings?`<span class="stv-warning">${esc(warnings)} บรรทัด</span>`:''}`;
  }
  function averages(aggregate){
    const parts=['sheet','strip'].filter(unit=>aggregate?.quantity?.[unit]!==0).map(unit=>{
      const m=aggregate?.money?.[unit],average=positive(m?.thbPricedQty)&&valid(m?.averageTHBPerUnit)?money(m.averageTHBPerUnit):'ยังไม่ยืนยัน';
      return `<span class="stv-average" data-stv-average-unit="${unit}">${average} <small>บาท/${unit==='sheet'?'แผ่น':'ชิ้น'}</small></span>`;
    });
    return (parts.length?parts.join(''):'<span class="stv-unknown">—</span>')+(coverage(aggregate)?`<span class="stv-coverage">ฐานที่มีราคาเป็นบาท ${esc(coverage(aggregate))}</span>`:'');
  }
  function nativeAmount(value,currency){
    return valid(value)&&['THB','USD'].includes(currency)?`${currency==='THB'?'฿':'US$'} ${money(value)}`:'ยังไม่ยืนยันราคา / สกุลเงิน';
  }
  function lineDetails(thickness){
    const rows=Array.isArray(thickness?.rows)?thickness.rows:[];
    if(!rows.length)return '<p class="stv-empty">ไม่มีบรรทัดสินค้าในชุดนี้</p>';
    return `<div class="stv-detail-scroll" role="region" tabindex="0" aria-label="รายละเอียดขายแยกความหนา"><table class="stv-detail-table"><thead><tr><th scope="col">ลูกค้า / เอกสาร</th><th scope="col">ขนาด / เกรด</th><th scope="col">จำนวน / แผ่นเทียบ</th><th scope="col">สถานะ</th><th scope="col">ราคาขายจริง / หน่วย</th><th scope="col">มูลค่าสินค้า</th></tr></thead><tbody>${rows.map(row=>{
      const sale=row?.sale,unit=unitLabel(row?.unit);
      const size=positive(row?.w)&&positive(row?.l)?`${num(row.w)} × ${num(row.l)} มม.`:'ขนาดยังไม่ยืนยัน';
      const price=row?.qty===0&&sale?.unitPrice===null?'—':nativeAmount(sale?.unitPrice,sale?.currency);
      const amount=row?.qty===0?'0.00 บาท · จำนวนขายเป็น 0':nativeAmount(sale?.amount,sale?.currency);
      const warning=sale?.status==='missing-fx'?'รอเรทแปลงบาท':sale?.status==='missing-currency'?'รอสกุลเงินจริง':sale?.status==='verified'||sale?.status==='no-quantity'?'':'รอราคาจริงตรงบรรทัด';
      return `<tr data-stv-sales-line="${esc(row?.id||'')}"><td><strong>${esc(row?.customer||'ไม่ระบุลูกค้า')}</strong><span class="stv-secondary">${esc(row?.ref||'ไม่ระบุเอกสาร')}</span></td><td>${esc(size)}<span class="stv-secondary">หนา ${num(row?.t)} มม. · ${esc(row?.grade||'ยังไม่ระบุเกรด')}</span></td><td><strong>${num(row?.qty)} ${esc(unit)}</strong><span class="stv-secondary">${valid(row?.eq25)?num(row.eq25)+' แผ่นเทียบ':'แผ่นเทียบรอขนาด'}</span></td><td><span class="stv-state stv-state-${['loaded','waiting','negotiation','forecast'].includes(row?.state)?row.state:'unknown'}">${esc(detailStatus[row?.state]||'รอตรวจ')}</span><span class="stv-secondary">${esc(row?.sourceStatus||'ยังไม่ระบุสถานะ')}</span></td><td>${esc(price)}${valid(sale?.unitPrice)?`<span class="stv-secondary">ต่อ${esc(unit)}</span>`:''}</td><td><strong>${esc(amount)}</strong>${sale?.currency==='USD'&&valid(sale?.amountTHB)?`<span class="stv-secondary">≈ ฿ ${money(sale.amountTHB)}</span>`:''}${warning?`<span class="stv-warning">${warning}</span>`:''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function thicknessTable(group){
    const thicknesses=Array.isArray(group?.thicknesses)?group.thicknesses:[];
    if(!thicknesses.length)return '<p class="stv-empty">ไม่มีรายการในกลุ่มนี้</p>';
    return `<div class="stv-table-scroll" role="region" tabindex="0" aria-label="สรุป ${esc(labels[group.id]||'ยอดขาย')} แยกความหนา"><table class="stv-table"><colgroup><col class="stv-col-spec"><col class="stv-col-qty"><col class="stv-col-eq"><col class="stv-col-money"><col class="stv-col-avg"></colgroup><thead><tr><th scope="col">ความหนา / เกรด</th><th scope="col">จำนวนจริง</th><th scope="col">เทียบ 4×8 · หนา 2.5 มม.</th><th scope="col">ยอดขายสินค้า · บาท</th><th scope="col">เฉลี่ย / หน่วยจริง</th></tr></thead>${thicknesses.map(item=>`<tbody data-stv-thickness="${esc(item?.key??'unknown')}"><tr class="stv-summary-row"><th scope="row"><strong>${positive(item?.t)?num(item.t)+' มม.':'ไม่ระบุความหนา'}</strong><span class="stv-secondary">${esc(Array.isArray(item?.grades)?item.grades.join(' · '):'')}</span></th><td>${quantity(item?.totals)}</td><td>${equivalent(item?.totals)}</td><td>${saleValue(item?.totals)}</td><td>${averages(item?.totals)}</td></tr><tr class="stv-drill-row"><td colspan="5"><details class="stv-drill"><summary>ดูรายละเอียด · ${count(item?.orderCount)} ใบ / ${count(item?.lineCount)} บรรทัด <span aria-hidden="true">↗</span></summary>${lineDetails(item)}</details></td></tr></tbody>`).join('')}<tfoot><tr><th scope="row">รวมกลุ่มนี้<span class="stv-secondary">${count(group?.orderCount)} ใบ · ${count(group?.lineCount)} บรรทัด</span></th><td>${quantity(group?.totals)}</td><td>${equivalent(group?.totals)}</td><td>${saleValue(group?.totals)}</td><td>${averages(group?.totals)}</td></tr></tfoot></table></div>`;
  }
  function render(model){
    const groups=Array.isArray(model?.groups)?model.groups:[];
    if(model?.version!==1||!['verified','pending'].includes(model?.status)||!groups.some(g=>g?.id==='confirmed'))return '<section class="stv-panel" data-sales-thickness><h3>สรุปยอดขายแยกความหนา</h3><p class="stv-warning" role="status">รอชุดสรุปหน้า 09 ที่ตรวจแล้ว · ไม่ใช้ยอดเก่าหรือศูนย์แทน</p></section>';
    const excluded=model?.excluded,excludedText=[excluded?.cancelledLineCount>0?'ยกเลิก '+count(excluded.cancelledLineCount)+' บรรทัด':'',excluded?.unclassifiedLineCount>0?'รอจัดกลุ่ม '+count(excluded.unclassifiedLineCount)+' บรรทัด':''].filter(Boolean).join(' · ');
    const fx=model?.fx?.verified===true?model.fx:model?.fx;
    const fxText=positive(fx?.rate)&&typeof fx?.date==='string'?` · USD/THB ${fx.rate.toLocaleString('en-US',{maximumFractionDigits:6})} (${esc(fx.date)})`:'';
    return `<section class="stv-panel" data-sales-thickness data-stv-month="${esc(model.month)}"><header class="stv-heading"><div><span class="stv-eyebrow">ยอดขายตามรายการสินค้า</span><h3>สรุปแยกความหนา</h3></div><span class="stv-caption">กดดูแต่ละความหนาเพื่อไล่ลูกค้าและราคา</span></header>${model.status==='pending'?'<p class="stv-warning stv-source-warning" role="status">บางข้อมูลยังรอตรวจ · แสดงส่วนที่ยืนยันได้ ไม่แทนข้อมูลที่ขาดด้วย 0</p>':''}${['confirmed','negotiation','forecast'].map(id=>{
      const group=groups.find(g=>g?.id===id);if(!group)return '';
      return `<details class="stv-group stv-group-${id}" data-stv-group="${id}"${id==='confirmed'?' open':''}><summary><span class="stv-group-label">${labels[id]}</span><span class="stv-group-count">${count(group.orderCount)} ใบ · ${count(group.lineCount)} บรรทัด</span><span class="stv-group-action">ดูตามความหนา</span></summary>${id!=='confirmed'?'<p class="stv-group-note">โอกาสขายตามกลุ่มต้นทาง · ไม่ใช่ยอดขายยืนยันหรือยอดจองคลัง</p>':''}${thicknessTable(group)}</details>`;
    }).join('')}<footer class="stv-footer">ราคาเฉลี่ยถ่วงด้วยจำนวนจริงเฉพาะส่วนที่มีมูลค่าเป็นบาท · แผ่นกับไม้แถบแยกกัน · ไม่หารด้วยแผ่นเทียบ<br>ใช้ราคาขายจริง ไม่ใช่ราคาสต๊อกหรือยอดรับเงิน${fxText}${excludedText?`<span class="stv-secondary">ไม่รวมในสามกลุ่ม: ${esc(excludedText)}</span>`:''}</footer></section>`;
  }
  return Object.freeze({render});
});
