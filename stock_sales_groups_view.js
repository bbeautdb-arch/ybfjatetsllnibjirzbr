/* Read-only selected-month sales grouping. Runtime source only; no acquisition or writes. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AAFSalesGroupsView=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const fmt=value=>{
    if(!finite(value))return 'ยังไม่ยืนยัน';
    const text=value.toLocaleString('en-US',{maximumFractionDigits:20});
    return value>0&&Number(text.replace(/,/g,''))===0?String(value):text;
  };
  const count=value=>Number.isSafeInteger(value)&&value>=0?value.toLocaleString('en-US'):'ยังไม่ยืนยัน';
  const label=unit=>unit==='sheet'?'แผ่น':unit==='strip'?'ชิ้นไม้แถบ':String(unit||'หน่วยยังไม่ยืนยัน');
  const groups=[['confirmed','1','ขายแล้ว / ออเดอร์ยืนยัน'],['negotiation','2','เจรจา · โอกาสซื้อ 80%+'],['forecast','3','Forecast']];
  function parseETD(value){
    const raw=String(value??'').trim();let match,year,month,day;
    if((match=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/))){
      year=Number(match[1]);month=Number(match[2]);day=Number(match[3]);
      const zone=match[7],invalidTime=match[4]!==undefined&&(Number(match[4])>23||Number(match[5])>59||Number(match[6]||0)>59||zone!=='Z'&&(Number(zone.slice(1,3))>14||Number(zone.slice(4))>59||Number(zone.slice(1,3))===14&&Number(zone.slice(4))!==0));
      if(invalidTime)return {raw,valid:false,missing:false,timestamp:null};
    }
    else if((match=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))){day=Number(match[1]);month=Number(match[2]);year=Number(match[3]);if(year<100)year+=2000;else if(year>=2400)year-=543;}
    else return {raw,valid:false,missing:!raw||['—','-'].includes(raw),timestamp:null};
    const timestamp=Date.UTC(year,month-1,day),date=new Date(timestamp);
    const valid=year>=1900&&year<=2200&&month>=1&&month<=12&&day>=1&&date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
    return {raw,valid,missing:false,timestamp:valid?timestamp:null};
  }
  function sortedRows(rows){
    return (Array.isArray(rows)?rows:[]).map((row,index)=>({row,index,etd:parseETD(row?.etd)})).sort((a,b)=>a.etd.valid!==b.etd.valid?a.etd.valid?-1:1:a.etd.valid?a.etd.timestamp-b.etd.timestamp||a.index-b.index:a.index-b.index).map(entry=>entry.row);
  }
  const quantities=(bucket,showStrip=false)=>['sheet',...(showStrip?['strip']:[])].map(unit=>`<span class="sg-quantity" data-sales-unit="${unit}">${finite(bucket?.totals?.[unit])?`${fmt(bucket.totals[unit])} <small>${label(unit)}</small>`:`<span class="sg-unknown">ยังไม่ยืนยัน <small>${label(unit)}</small></span>`}</span>`).join('');
  const counts=bucket=>`${count(bucket?.orderCount)} รายการต้นทาง · ${count(bucket?.lineCount)} บรรทัดสินค้า`;
  const issuesFor=(model,groupId,row)=>{
    const issues=Array.isArray(model?.issues)?model.issues:[];
    return issues.filter(issue=>{
      if(row)return issue.rowId!==undefined&&String(issue.rowId)===String(row.id)||Number.isSafeInteger(issue.rowIndex)&&Array.isArray(model?.sourceRows)&&model.sourceRows[issue.rowIndex]===row;
      return issue.groupId===groupId&&issue.severity==='warning';
    });
  };
  const warningMarkup=issues=>[...new Set(issues.map(issue=>issue.message).filter(value=>typeof value==='string'&&value))].map(message=>`<p class="sg-warning">${esc(message)}</p>`).join('');
  const moneyFmt=value=>finite(value)?value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'ยังไม่ยืนยัน';
  const nativeMoney=(value,currency)=>finite(value)&&['THB','USD'].includes(currency)?`${currency==='THB'?'฿':'US$'} ${moneyFmt(value)}`:'ยังไม่ยืนยันจำนวน / สกุลเงิน';
  const bangkokTimeLabel=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value))+' น.':'ยังไม่ยืนยันวันและเวลา';
  function monthLabel(value){
    if(typeof value!=='string'||!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value))return 'ยังไม่ยืนยันเดือนรับ';
    const months=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return `${months[Number(value.slice(5))-1]} ${Number(value.slice(0,4))+543}`;
  }
  function moneySummary(money,id){
    if(!money)return '<div class="sg-money-summary"><span class="sg-money-unconfirmed">เงินรับ / รอรับ · ยังไม่มีข้อมูลจำนวนเงินที่ยืนยัน</span></div>';
    const currencies=(Array.isArray(money.currencies)?money.currencies:[]).filter(item=>['THB','USD'].includes(item?.currency));
    const amount=kind=>{
      const known=currencies.filter(item=>finite(item[kind])&&Number.isSafeInteger(item[kind+'KnownOrders'])&&item[kind+'KnownOrders']>0);
      return known.length?known.map(item=>`<span>${esc(nativeMoney(item[kind],item.currency))}</span>`).join(''):'<span class="sg-money-unconfirmed">ยังไม่ยืนยันจำนวน</span>';
    };
    const counts=money.counts||{},labels=[['received','รับแล้ว'],['partial','รับบางส่วน'],['waiting','รอรับ'],['lcAwaiting','LC · รอเงิน']];
    const countText=labels.filter(([key])=>Number.isSafeInteger(counts[key])&&counts[key]>0).map(([key,label])=>`${label} ${count(counts[key])} ใบ`).join(' · ');
    const receiptMonthText=[...new Set((Array.isArray(money.receiptMonths)?money.receiptMonths:[]).filter(item=>Number.isSafeInteger(item?.orderCount)&&item.orderCount>0).map(item=>monthLabel(item.month)))].join(' · ');
    const unknown=[Number.isSafeInteger(counts.missingAmount)&&counts.missingAmount>0?`ขาดจำนวนเงิน ${count(counts.missingAmount)} ใบ`:'',Number.isSafeInteger(counts.unconfirmed)&&counts.unconfirmed>0?`สถานะเงินรอตรวจ ${count(counts.unconfirmed)} ใบ`:''].filter(Boolean).join(' · ');
    const errors=(Array.isArray(money.issues)?money.issues:[]).filter(issue=>issue?.severity==='error'&&typeof issue.message==='string');
    return `<div class="sg-money-summary" data-sales-money="${esc(id)}"><span class="sg-money-label">${id==='confirmed'?'เงินของกลุ่มนี้ · ตามหลักฐานที่ตรวจได้':'สถานะเงินตามต้นทาง · ไม่ถือโอกาสขายเป็นลูกหนี้'}</span><span class="sg-money-row"><span>รับแล้ว</span><strong>${amount('received')}</strong></span><span class="sg-money-row"><span>เหลือรับ / รอรับ</span><strong>${amount('pending')}</strong></span>${countText?`<span class="sg-money-counts">${esc(countText)}</span>`:''}${receiptMonthText?`<span class="sg-money-counts" data-receipt-months>รับใน: ${esc(receiptMonthText)}</span>`:''}${unknown?`<span class="sg-money-coverage">${esc(unknown)} · รวมเฉพาะส่วนที่ทราบ</span>`:money.status!=='verified'?'<span class="sg-money-coverage">ยังตรวจยอดเงินไม่ครบ · ไม่ใช้ศูนย์แทนส่วนที่ขาด</span>':''}${counts.lcAwaiting>0?'<span class="sg-money-coverage">ได้ LC ไม่ใช่รับเงินสด · ยังรอหลักฐานรับจริง</span>':''}${errors.map(issue=>`<span class="sg-money-alert" role="status">${esc(issue.message)}</span>`).join('')}</div>`;
  }
  function moneyDetails(money,id){
    if(!money)return '';
    const months=Array.isArray(money.receiptMonths)?money.receiptMonths:[],orders=Array.isArray(money.orders)?money.orders:[];
    const monthTable=months.length?`<div class="sg-table-scroll" role="region" aria-label="เดือนที่รับเงินจริง"><table class="sg-table sg-money-table"><caption>รับเดือนไหน · แยกตามงวดรับจริง ไม่ใช้เดือนขายหรือ ETD</caption><thead><tr><th scope="col">เดือนรับเงินจริง</th><th scope="col">ใบขาย</th><th scope="col">บาท (THB)</th><th scope="col">ดอลลาร์ (USD)</th><th scope="col">ยังขาดจำนวนเงิน</th></tr></thead><tbody>${months.map(item=>`<tr><th scope="row">${esc(monthLabel(item.month))}</th><td>${count(item.orderCount)} ใบ</td><td>${finite(item.knownAmountByCurrency?.THB)?moneyFmt(item.knownAmountByCurrency.THB):'ยังไม่ยืนยัน'}</td><td>${finite(item.knownAmountByCurrency?.USD)?moneyFmt(item.knownAmountByCurrency.USD):'ยังไม่ยืนยัน'}</td><td>${Number.isSafeInteger(item.missingAmountCount)?count(item.missingAmountCount)+' ใบ':'ยังไม่ยืนยัน'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="sg-empty">ยังไม่มีวันและจำนวนเงินที่แยกเดือนรับได้ · ไม่ใช้ ETD แทนวันรับ</p>';
    const orderTable=orders.length?`<div class="sg-table-scroll" role="region" aria-label="รายละเอียดเงินแยกตามใบขาย"><table class="sg-table sg-money-table"><caption>เงินรายใบขาย · ใบเดียวไม่บวกซ้ำตามจำนวนสินค้า</caption><thead><tr><th scope="col">ลูกค้า / เอกสาร</th><th scope="col">สถานะเงิน</th><th scope="col">รับแล้ว</th><th scope="col">เหลือรับ / รอรับ</th><th scope="col">งวดรับ / วันรับจริง</th></tr></thead><tbody>${orders.map(order=>{
      const events=Array.isArray(order.receiptEvents)?order.receiptEvents:[],issues=Array.isArray(order.issues)?order.issues:[];
      const eventsHtml=events.length?'<ul class="sg-receipt-events">'+events.map(event=>`<li><strong>${esc(event.label||'งวดรับตามหลักฐาน')}</strong><span>${esc(nativeMoney(event.amount,event.currency))}</span><span>${esc(event.date||monthLabel(event.month))}</span></li>`).join('')+'</ul>':'<span class="sg-money-unconfirmed">ยังไม่มีงวดรับที่ยืนยัน · ไม่ใช้ ETD แทน</span>';
      const arithmetic=order.arithmeticBalance,arithmeticHtml=finite(arithmetic?.amount)&&['THB','USD'].includes(arithmetic?.currency)?`<span class="sg-money-coverage" data-arithmetic-balance>${esc(arithmetic.label||'ยอดตามใบหลังหักมัดจำ · รอยืนยันยอดค้าง')}<br><strong>${esc(nativeMoney(arithmetic.amount,arithmetic.currency))}</strong> · ไม่รวมยอดรอรับที่ยืนยัน</span>`:'';
      return `<tr data-sales-money-order="${esc(order.orderId||'')}"><th scope="row">${esc(order.customer||'ไม่ระบุลูกค้า')}<span class="sg-source-ref">${esc(order.ref||'ยังไม่ระบุเอกสาร')}</span></th><td>${esc(order.statusLabel||'สถานะเงินยังไม่ยืนยัน')}<span class="sg-spec">${esc(order.term||'ยังไม่ระบุวิธีชำระ')}</span>${issues.map(issue=>`<span class="sg-money-coverage">${esc(typeof issue==='string'?issue:issue?.message||'หลักฐานต้องตรวจ')}</span>`).join('')}</td><td>${esc(nativeMoney(order.received,order.currency))}</td><td>${esc(nativeMoney(order.pending,order.currency))}${arithmeticHtml}</td><td>${eventsHtml}</td></tr>`;
    }).join('')}</tbody></table></div>`:'<p class="sg-empty">ยังไม่มีรายละเอียดจำนวนเงินรายใบที่ตรวจได้</p>';
    const warnings=(Array.isArray(money.issues)?money.issues:[]).filter(issue=>issue?.severity!=='error');
    return `<details class="sg-money-details" data-sales-money-details="${esc(id)}"><summary>รายละเอียดเงิน · รับเดือนไหน</summary><div class="sg-money-detail-content"><p class="sg-money-scope">ยอดเงินเป็นของใบขายในกลุ่มนี้ แยกตามสกุลเงินจริง · จำนวนสถานะและจำนวนใบรายเดือนใช้คนละฐาน ใบขายหนึ่งอาจรับหลายเดือน ไม่บวกข้ามส่วนเป็นจำนวนใบทั้งหมด</p>${id!=='confirmed'?'<p class="sg-money-coverage">เจรจา / Forecast ไม่ใช่ลูกหนี้หรือเงินที่จะได้รับแน่นอน แสดงเฉพาะหลักฐานสถานะเงินที่มี</p>':''}${money.checkedAt?`<p class="sg-money-scope" data-receipts-checked-at="${esc(money.checkedAt)}">ตรวจหลักฐานเงิน ณ ${esc(bangkokTimeLabel(money.checkedAt))}</p>`:''}${warningMarkup(warnings)}${monthTable}${orderTable}</div></details>`;
  }
  function rowTable(bucket,model,context){
    const rows=sortedRows(bucket?.rows);
    if(!rows.length)return '<p class="sg-empty">ไม่มีรายการในกลุ่มนี้ในชุดข้อมูลที่อ่านไว้</p>';
    return `<div class="sg-table-scroll" role="region" aria-label="รายละเอียด ${esc(context)}"><table class="sg-table"><thead><tr><th scope="col">ลูกค้า / เอกสาร</th><th scope="col">สินค้า / จำนวน</th><th scope="col">สถานะต้นทาง</th><th scope="col">ETD</th></tr></thead><tbody>${rows.map(sourceRow=>{
      const row=sourceRow&&typeof sourceRow==='object'?sourceRow:{};
      const etd=parseETD(row.etd),status=({ready:'พร้อมโหลด',waiting:'รอผลิต',loaded:'โหลดแล้ว'}[String(row.productStatus)]||row.productStatus||'ยังไม่ระบุ');
      const reference=typeof row.sourceRefText==='string'&&row.sourceRefText.trim()?row.sourceRefText:row.ref||'ไม่ระบุเอกสาร';
      const dimensions=['w','l'].every(k=>finite(row[k])&&row[k]>0)?fmt(row.w)+'×'+fmt(row.l):'ขนาดยังไม่ยืนยัน';
      const payment=[row.payment,row.commercial?.receiptLabel].filter(value=>typeof value==='string'&&value.trim());
      const cancelled=bucket===model?.cancelled||row.cancelled===true;
      const quantity=cancelled?(Object.hasOwn(row,'sourceQty')?row.sourceQty:finite(row.qty)&&row.qty>0?row.qty:null):row.qty;
      return `<tr data-sales-line="${esc(row.id||'')}"><td><strong>${esc(row.customer||'ไม่ระบุลูกค้า')}</strong><span class="sg-source-ref">${esc(reference)}</span></td><td>${esc(dimensions)} มม.<span class="sg-spec">หนา ${finite(row.t)?fmt(row.t):'ยังไม่ยืนยัน'} มม. · เกรด ${esc(String(row.grade).toLowerCase()==='mix'?'AAA+B':row.grade||'ยังไม่ระบุ')}</span><strong class="sg-line-quantity">${cancelled?'ยอดยกเลิก ':''}${fmt(quantity)} ${esc(label(row.unit))}</strong>${cancelled?'<span class="sg-source-quantity">จำนวนตามต้นทาง · ไม่นับใน 3 กลุ่ม</span>':''}</td><td>${esc(row.sourceStatus||'ยังไม่ระบุ')}<span class="sg-spec">สินค้า: ${esc(status)}</span>${payment.length?`<span class="sg-source-payment">${esc([...new Set(payment)].join(' · '))}</span>`:''}${warningMarkup(issuesFor(model,null,row))}</td><td class="sg-etd">${esc(etd.missing?'ยังไม่ระบุวัน':etd.raw)}${!etd.valid&&!etd.missing?'<span class="sg-date-warning">วันที่ต้นทางต้องตรวจ</span>':''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function sourceLabel(model,options){
    const captured=model?.capturedAt;
    const time=bangkokTimeLabel(captured);
    return `<p class="sg-source-date"${captured?` data-sales-captured-at="${esc(captured)}"`:''}>ข้อมูลหน้า 09 ที่อ่านเมื่อ <strong>${esc(time)}</strong> · ไม่ใช่ข้อมูลสด</p>${options.historical?'<p class="sg-warning">ชุดตรวจย้อนหลัง · ไม่ใช่ยอดปิดเดือน'+(options.stale?' · ฐานสต๊อก/ราคาปัจจุบันอาจต่างจากชุดนี้':'')+'</p>':''}`;
  }
  function render(model,options={}){
    const month=options.monthLabel||model?.month||'เดือนยังไม่ยืนยัน';
    const buckets=Array.isArray(model?.groups)?model.groups:[];
    const allBuckets=[...buckets,model?.cancelled,model?.unclassified].filter(Boolean);
    const showStrip=allBuckets.some(bucket=>bucket.totals?.strip===null||bucket.totals?.strip>0||(bucket.rows||[]).some(row=>row?.unit==='strip'));
    const hasModel=!!model&&buckets.length===3;
    const issues=Array.isArray(model?.issues)?model.issues:[];
    const cards=groups.map(([id,number,title])=>{
      const bucket=buckets.find(group=>group.id===id);
      const sub=id==='confirmed'?`<div class="sg-subsets-preview"><span>โหลดแล้ว <b>${quantities(bucket?.loaded,showStrip)}</b></span><span>รอโหลด <b>${quantities(bucket?.waiting,showStrip)}</b></span></div>`:'';
      const description=id==='confirmed'?'รวม PI ที่ยืนยันแล้ว · ไม่ขึ้นกับว่ารับเงินครบหรือยัง':id==='negotiation'?'ตามกลุ่มเจรจา · ไม่ใช่จำนวนที่จองคลัง':'โอกาสขายที่ยังเป็น Forecast · ไม่หักสต๊อกด้วยการจัดกลุ่มนี้';
      const content=id==='confirmed'?['loaded','waiting'].map(kind=>`<details class="sg-subset" data-sales-subset="${kind}"><summary><span>${kind==='loaded'?'โหลดแล้ว':'รอโหลด / ยังไม่โหลด'}</span><strong>${quantities(bucket?.[kind],showStrip)}</strong><small>${esc(counts(bucket?.[kind]))}</small></summary>${rowTable(bucket?.[kind],model,kind==='loaded'?'โหลดแล้ว':'รอโหลด')}</details>`).join(''):rowTable(bucket,model,title);
      return `<details class="sg-card sg-${id}" data-sales-group="${id}"><summary><span class="sg-card-title"><span class="sg-number">${number}</span>${title}</span><strong class="sg-card-total">${quantities(bucket,showStrip)}</strong><span class="sg-counts">${esc(counts(bucket))}</span>${sub}${moneySummary(bucket?.money,id)}<span class="sg-card-description">${description}</span><span class="sg-open-hint">กดดูรายการ / รายละเอียดเงิน ▾</span></summary><div class="sg-card-details">${warningMarkup(issuesFor(model,id))}${moneyDetails(bucket?.money,id)}${content}</div></details>`;
    }).join('');
    const outside=[['unclassified','ยังจัดกลุ่มไม่ได้ · ไม่รวมในยอด 3 กลุ่ม'],['cancelled','ยกเลิกตามต้นทาง · ไม่รวมในยอด 3 กลุ่ม']].filter(([key])=>(model?.[key]?.rows||[]).length).map(([key,title])=>`<details class="sg-exceptions" data-sales-exception="${key}"><summary>${title}<span>${esc(counts(model[key]))}</span></summary>${rowTable(model[key],model,title)}</details>`).join('');
    const blocking=issues.filter(issue=>issue.severity!=='warning');
    return `<div class="month-dashboard-heading"><h2>ยอดขาย · ${esc(month)}</h2><span>ทุกความหนา · ไม่ตามตัวกรองรายการด้านล่าง</span></div>${sourceLabel(model,options)}${!hasModel?'<p class="sg-warning" role="status">ยังโหลดตัวสรุป 3 กลุ่มไม่ครบ · ไม่ใช้ยอดเก่าหรือศูนย์แทน โปรดโหลดหน้าใหม่</p>':''}${model?.status==='pending'?'<p class="sg-warning" role="status">ยังมีข้อมูลที่ต้องตรวจ · ส่วนที่ยังไม่ยืนยันไม่ใช่ศูนย์ และไม่รวมรายการจัดกลุ่มไม่ได้ในยอด 3 กลุ่ม</p>':''}${warningMarkup(blocking)}${options.warning?`<p class="sg-warning">${esc(options.warning)}</p>`:''}<div class="sg-grid">${cards}</div>${outside}<p class="sg-footnote">${Number.isSafeInteger(model?.sourceLineCount)?`เก็บรายการต้นทาง ${count(model.sourceLineCount)} บรรทัด · `:''}สามกลุ่มนี้ใช้สถานะการขาย ไม่ใช่ลำดับจองคลัง · กลุ่ม 1 = โหลดแล้ว + รอโหลด · เงินรับใช้หลักฐานแต่ละงวดแยกจากสถานะการขาย</p><p class="sg-footnote">รายละเอียดเรียง ETD ที่ตรวจรูปแบบได้ก่อน–หลัง แล้ววันที่ไม่ทราบ/ต้องตรวจไว้ท้าย · คงวันที่ต้นทาง ไม่ใช้ ETD ตัดสินว่าโหลดแล้วหรือรับเงินแล้ว</p>`;
  }
  return Object.freeze({render,parseETD,sortedRows});
});
