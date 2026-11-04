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
    const time=typeof captured==='string'&&Number.isFinite(Date.parse(captured))?new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(captured))+' น.':'ยังไม่ยืนยันวันและเวลา';
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
      return `<details class="sg-card sg-${id}" data-sales-group="${id}"><summary><span class="sg-card-title"><span class="sg-number">${number}</span>${title}</span><strong class="sg-card-total">${quantities(bucket,showStrip)}</strong><span class="sg-counts">${esc(counts(bucket))}</span>${sub}<span class="sg-card-description">${description}</span><span class="sg-open-hint">กดดูรายการ ▾</span></summary><div class="sg-card-details">${warningMarkup(issuesFor(model,id))}${content}</div></details>`;
    }).join('');
    const outside=[['unclassified','ยังจัดกลุ่มไม่ได้ · ไม่รวมในยอด 3 กลุ่ม'],['cancelled','ยกเลิกตามต้นทาง · ไม่รวมในยอด 3 กลุ่ม']].filter(([key])=>(model?.[key]?.rows||[]).length).map(([key,title])=>`<details class="sg-exceptions" data-sales-exception="${key}"><summary>${title}<span>${esc(counts(model[key]))}</span></summary>${rowTable(model[key],model,title)}</details>`).join('');
    const blocking=issues.filter(issue=>issue.severity!=='warning');
    return `<div class="month-dashboard-heading"><h2>ยอดขาย · ${esc(month)}</h2><span>ทุกความหนา · ไม่ตามตัวกรองรายการด้านล่าง</span></div>${sourceLabel(model,options)}${!hasModel?'<p class="sg-warning" role="status">ยังโหลดตัวสรุป 3 กลุ่มไม่ครบ · ไม่ใช้ยอดเก่าหรือศูนย์แทน โปรดโหลดหน้าใหม่</p>':''}${model?.status==='pending'?'<p class="sg-warning" role="status">ยังมีข้อมูลที่ต้องตรวจ · ส่วนที่ยังไม่ยืนยันไม่ใช่ศูนย์ และไม่รวมรายการจัดกลุ่มไม่ได้ในยอด 3 กลุ่ม</p>':''}${warningMarkup(blocking)}${options.warning?`<p class="sg-warning">${esc(options.warning)}</p>`:''}<div class="sg-grid">${cards}</div>${outside}<p class="sg-footnote">${Number.isSafeInteger(model?.sourceLineCount)?`เก็บรายการต้นทาง ${count(model.sourceLineCount)} บรรทัด · `:''}สามกลุ่มนี้ใช้สถานะการขาย ไม่ใช่ลำดับจองคลัง · กลุ่ม 1 = โหลดแล้ว + รอโหลด · ไม่ใช่สรุปเงินรับ</p><p class="sg-footnote">รายละเอียดเรียง ETD ที่ตรวจรูปแบบได้ก่อน–หลัง แล้ววันที่ไม่ทราบ/ต้องตรวจไว้ท้าย · คงวันที่ต้นทาง ไม่ใช้ ETD ตัดสินว่าโหลดแล้ว</p>`;
  }
  return Object.freeze({render,parseETD,sortedRows});
});
