/* Read-only screenshot report. Receives saved central data; never reads drafts,
   writes stock/storage, fetches business data, or changes existing table filters. */
(() => {
  'use strict';
  const root=document.getElementById('stock-summary');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=(v,d=2)=>Number(v).toLocaleString('th-TH',{maximumFractionDigits:d});
  const when=v=>v&&!Number.isNaN(new Date(v).getTime())?new Date(v).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'ไม่ระบุเวลา';
  const reportDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?new Date(v+'T00:00:00+07:00').toLocaleDateString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'long',year:'numeric'}):'ยังไม่มีรายงาน';
  const thicknessLabel=v=>Number(v).toFixed(1);
  const gradeOrder=['AV','AAA','A','B','F','REJ','C','UN','CTS'];
  const agingKeys=['d90','d180','d270','d360','dOver'];
  const agingLabels=['0–90 วัน','91–180 วัน','181–270 วัน','271–360 วัน','เกิน 360 วัน'];
  const standardArea=1220*2440;
  const blank=()=>({qty:0,baseQty:0,freeQty:0,committedQty:0,eq4x8:0,eq:0,value:0,freeValue:0,freeEq4x8:0,freeEq:0,reservedEq4x8:0,reservedEq:0,reservedValue:0,reservedUnpricedQty:0,agingBaseQty:0,aging90:0,aging180:0,agingOver180:0,count:0});
  const add=(s,r)=>{for(const k of ['qty','baseQty','freeQty','committedQty','eq4x8','eq','value','freeValue','freeEq4x8','freeEq','reservedEq4x8','reservedEq','reservedValue','reservedUnpricedQty','agingBaseQty','aging90','aging180','agingOver180'])s[k]+=r[k];s.count++;return s;};
  let latest=null,exporting=false,canvasLoader=null;

  function model(data,calculate){
    if(!data.report||!Array.isArray(data.rows)||!data.rows.length)throw new Error('ยังไม่มีรายงานสต๊อกส่วนกลาง');
    const rows=data.rows.map(r=>{
      const result={};
      result.rawSource=r.rawSource!==false;
      result.retained=!!r.retained;
      result.priceMissing=!!r.priceMissing;
      // Whitelist display fields: no account, token or permissions enter the report.
      for(const k of ['key','sku','desc','size','w','l','t','grade','followup','note','followupBy','followupAt','noteBy','noteAt'])result[k]=r[k]??'';
      for(const k of ['qty','baseQty','freeQty','committedQty',...agingKeys]){
        if(r.rawSource===false&&agingKeys.includes(k)){result[k]=0;continue;}
        if(typeof r[k]!=='number'||!Number.isFinite(r[k])||r[k]<0)throw new Error('ข้อมูลจำนวนไม่ครบ: '+(r.key||r.sku)+' / '+k);
        result[k]=r[k];
      }
      if(!r.grade||['w','l','t'].some(k=>!Number.isFinite(Number(r[k]))||Number(r[k])<=0))throw new Error('ขนาดหรือเกรดไม่ครบ');
      // Area equivalent at the row's original thickness, using saved Physical only.
      result.eq4x8=r.qty*(Number(r.w)*Number(r.l)/standardArea);
      if(!Number.isFinite(result.eq4x8))throw new Error('ข้อมูลแปลง 4×8 ไม่ถูกต้อง');
      const v=calculate(r);
      for(const k of ['eq','value','freeValue','price']){if(!Number.isFinite(v[k])||v[k]<0)throw new Error('ข้อมูลมูลค่าไม่ครบ');result[k]=v[k];}
      result.curr=v.curr;result.physicalAt=r.physicalOverride?.at||'';result.freeAt=r.freeOverride?.at||'';
      const area=Number(r.w)*Number(r.l)/standardArea,thickness=Number(r.t)/2.5;
      result.freeEq4x8=r.freeQty*area;result.freeEq=result.freeEq4x8*thickness;
      result.reservedEq4x8=r.committedQty*area;result.reservedEq=result.reservedEq4x8*thickness;
      result.reservedValue=r.committedQty*v.price*(v.curr==='USD'?data.exchangeRate:1);
      result.reservedUnpricedQty=r.priceMissing||!(v.price>0)?r.committedQty:0;
      result.agingBaseQty=result.rawSource?r.baseQty:0;
      result.aging90=result.d90;result.aging180=result.d180;result.agingOver180=result.d270+result.d360+result.dOver;
      for(const k of ['freeEq4x8','freeEq','reservedEq4x8','reservedEq','reservedValue'])if(!Number.isFinite(result[k])||result[k]<0)throw new Error('ข้อมูลยอดเทียบไม่ถูกต้อง');
      return result;
    }).sort((a,b)=>Number(a.t)-Number(b.t)||Number(a.w)-Number(b.w)||Number(a.l)-Number(b.l)||String(a.grade).localeCompare(String(b.grade))||String(a.key).localeCompare(String(b.key)));
    const total=blank(),grades=new Map(gradeOrder.map(g=>[g,blank()])),thickness=new Map(),aging=agingKeys.map(()=>0),agingEquivalent=agingKeys.map(()=>0),agingEquivalentByThickness=new Map();
    for(const r of rows){
      add(total,r);if(!grades.has(r.grade))grades.set(r.grade,blank());add(grades.get(r.grade),r);const t=String(Number(r.t));if(!thickness.has(t))thickness.set(t,blank());add(thickness.get(t),r);
      agingKeys.forEach((k,i)=>aging[i]+=r[k]);
      if(r.rawSource){
        if(!agingEquivalentByThickness.has(t))agingEquivalentByThickness.set(t,agingKeys.map(()=>0));
        const ta=agingEquivalentByThickness.get(t),areaFactor=Number(r.w)*Number(r.l)/standardArea;
        agingKeys.forEach((k,i)=>{const equivalent=r[k]*areaFactor;agingEquivalent[i]+=equivalent;ta[i]+=equivalent;});
      }
    }
    let cash=null,cashError='';
    try{cash=window.AAFStockCash?.build(data)||null;}catch(e){cashError=e.message;}
    let sold=null;
    const evidence=data.soldSummary;
    if(evidence?.status==='verified'&&evidence.month===data.report.reportDate?.slice(0,7)&&Number.isFinite(Date.parse(evidence.capturedAt))){
      const sheet=evidence.totals?.sheet,strip=evidence.totals?.strip;
      const valid=b=>b&&['qty','eq4x8','eq','valueTHB','valueUSD','unpricedQty'].every(k=>typeof b[k]==='number'&&Number.isFinite(b[k])&&b[k]>=0);
      if(valid(sheet)&&valid(strip)&&Number.isFinite(data.exchangeRate)&&data.exchangeRate>0)sold={qty:sheet.qty,stripQty:strip.qty,eq4x8:sheet.eq4x8+strip.eq4x8,eq:sheet.eq+strip.eq,value:sheet.valueTHB+strip.valueTHB+(sheet.valueUSD+strip.valueUSD)*data.exchangeRate,unpricedQty:sheet.unpricedQty+strip.unpricedQty,month:String(evidence.month),capturedAt:String(evidence.capturedAt)};
    }
    return {rows,total,grades:[...grades],thickness:[...thickness],aging,agingEquivalent,agingEquivalentByThickness:[...agingEquivalentByThickness],reportDate:data.report.reportDate,updatedAt:data.updatedAt,importedAt:data.importedAt,revision:String(data.revision??''),exchangeRate:data.exchangeRate,sourceRowCount:data.report.sourceRowCount,renderedAt:new Date().toISOString(),cash,cashError,sold};
  }
  const cell=n=>'<td class="ss-num">'+number(n)+'</td>';
  const equivalents=v=>`<td class="ss-num ss-equivalent">${number(v.eq4x8,2)}</td><td class="ss-num ss-equivalent">${number(v.eq,2)}</td>`;
  function groupTable(title,groups,label,total){
    const agingCells=v=>`<td class="ss-num ss-aging-mail">${number(v.aging90)}</td><td class="ss-num ss-aging-mail">${number(v.aging180)}</td><td class="ss-num ss-aging-mail ss-aging-over">${number(v.agingOver180)}</td>`;
    return `<section class="ss-group"><div class="ss-group-heading"><h3>${title}</h3><small>Aging เมล = ยอดต้นฉบับก่อนโยก</small></div><div class="ss-group-scroll" role="region" tabindex="0" aria-label="${esc(title)} 10 คอลัมน์ เลื่อนแนวนอนได้"><table><caption class="ss-sr">${title} · Aging เมลจากต้นฉบับ · ยอดเทียบขนาดคำนวณจาก Physical</caption><thead><tr><th scope="col" rowspan="2">${label}</th><th scope="col" rowspan="2" class="ss-num">สเปก</th><th scope="col" rowspan="2" class="ss-num">Physical</th><th scope="col" rowspan="2" class="ss-num">ยอดจอง</th><th scope="col" rowspan="2" class="ss-num">Free</th><th scope="colgroup" colspan="3" class="ss-num ss-aging-mail-group">Aging เมล</th><th scope="col" rowspan="2" class="ss-num ss-equivalent">เทียบ 4×8<br><small>หนาเดิม</small></th><th scope="col" rowspan="2" class="ss-num ss-equivalent">เทียบ 4×8<br><small>หนา 2.5 mm</small></th></tr><tr><th scope="col" class="ss-num ss-aging-mail">0–90</th><th scope="col" class="ss-num ss-aging-mail">91–180</th><th scope="col" class="ss-num ss-aging-mail ss-aging-over">&gt;180 วัน</th></tr></thead><tbody>${groups.map(([k,v])=>`<tr><th scope="row">${esc(k)}</th>${cell(v.count)}${cell(v.qty)}${cell(v.committedQty)}<td class="ss-num ss-free">${number(v.freeQty)}</td>${agingCells(v)}${equivalents(v)}</tr>`).join('')}</tbody><tfoot><tr><th scope="row">รวม</th>${cell(total.count)}${cell(total.qty)}${cell(total.committedQty)}<td class="ss-num ss-free">${number(total.freeQty)}</td>${agingCells(total)}${equivalents(total)}</tr></tfoot></table></div></section>`;
  }
  function memo(r,key,title){return `<div><b>${title}</b><div class="ss-text">${esc(r[key]||'—')}</div>${r[key+'At']?`<small>${esc(r[key+'By']||'ไม่ระบุผู้บันทึก')} · ${esc(when(r[key+'At']))}</small>`:''}</div>`;}
  function provenance(r){
    if(r.rawSource)return `ยอดเมล ${number(r.baseQty)} · Aging: ${agingKeys.map((k,i)=>agingLabels[i]+' = '+number(r[k])).join(' / ')} แผ่น`;
    if(r.retained)return 'เก็บรายการสินค้าเดิม · ไม่พบในเมลวันนี้ · ยอดเมลและ Aging = 0 · ยังคงรหัส ราคา หมายเหตุและการติดตาม';
    return 'สเปกหลังโยก/ต้องผลิต — ไม่มี SKU หรือ Aging ของตัวเองในเมลต้นฉบับ';
  }
  // Existing report chart, kept dependency-free so it also renders in long PNG exports.
  const agingPalette=['#0072B2','#E69F00','#009E73','#D55E00','#CC79A7','#56B4E9','#F0E442','#000000','#6A3D9A','#1B9E77','#E31A1C','#A6761D','#1F78B4','#B15928','#33A02C','#7570B3'];
  function agingChart(m){
    const groups=m.agingEquivalentByThickness.slice().sort((a,b)=>Number(a[0])-Number(b[0])).map(([t,values],i)=>({t,values,color:agingPalette[i%agingPalette.length]}));
    const max=Math.max(...m.agingEquivalent,1),width=760,height=270,left=108,right=18,top=22,bottom=46,innerW=width-left-right,innerH=height-top-bottom;
    const gap=14,barW=(innerW-gap*(agingLabels.length-1))/agingLabels.length,bars=[];
    for(let i=0;i<agingLabels.length;i++){
      let offset=0;
      for(const g of groups){const v=g.values[i]||0;if(v<=0)continue;const h=v/max*innerH,y=top+innerH-offset-h,x=left+i*(barW+gap);bars.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(h,0.5).toFixed(2)}" rx="3" fill="${g.color}"><title>${esc(agingLabels[i])} · ${esc(thicknessLabel(g.t))} mm · ${number(v)} แผ่นเทียบ 1,220 × 2,440</title></rect>`);offset+=h;}
    }
    const ticks=[0,.25,.5,.75,1].map(f=>{const y=top+innerH-innerH*f;return `<line x1="${left}" x2="${width-right}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}" class="ss-aging-gridline"/><text x="${left-10}" y="${(y+4).toFixed(2)}" text-anchor="end" class="ss-aging-axis">${number(max*f,0)}</text>`;}).join('');
    const labels=agingLabels.map((label,i)=>`<text x="${(left+i*(barW+gap)+barW/2).toFixed(2)}" y="${height-14}" text-anchor="middle" class="ss-aging-label">${esc(label.replace(' วัน',''))}</text>`).join('');
    const insights=agingLabels.map((label,i)=>{let best=null;for(const g of groups){const v=g.values[i]||0;if(!best||v>best.value)best={t:g.t,value:v};}return `<div><span>${esc(label)}</span><b>${best&&best.value?esc(thicknessLabel(best.t))+' mm · '+number(best.value)+' แผ่นเทียบ':'ไม่มีแผ่น'}</b></div>`;}).join('');
    const legend=groups.map(g=>`<span><i style="background:${g.color}"></i>${esc(thicknessLabel(g.t))} mm</span>`).join('');
    return `<div class="ss-aging-chart"><h4>กราฟ Aging เดิม · เทียบพื้นที่เป็นแผ่นมาตรฐาน 1,220 × 2,440 มม.</h4><div class="ss-aging-chart-main"><div><svg class="ss-aging-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="กราฟ Aging จากรายงานเมล แยกตามความหนา โดยแปลงเป็นแผ่นมาตรฐาน 1220 × 2440 มม.">${ticks}<line x1="${left}" x2="${left}" y1="${top}" y2="${top+innerH}" class="ss-aging-axisline"/><line x1="${left}" x2="${width-right}" y1="${top+innerH}" y2="${top+innerH}" class="ss-aging-axisline"/>${bars.join('')}${labels}</svg></div><div class="ss-aging-insights"><h4>ความหนาที่สูงสุดในแต่ละช่วง</h4>${insights}</div></div><div class="ss-aging-legend">${legend}</div><div class="ss-aging-total">รวม Aging ${number(m.agingEquivalent.reduce((a,b)=>a+b,0))} แผ่นเทียบ 1,220 × 2,440 มม.</div></div>`;
  }
  const display=v=>v===null||v===undefined?'—':number(v);
  const quantityText=b=>b?number(b.sheet||0)+' แผ่น'+(b.strip?' · ไม้แถบ '+number(b.strip)+' ชิ้น':''):'—';
  function kpiHTML(summary){
    const cards=[
      ['physical','สต๊อกจริง · Physical','สต๊อกหลังโยก','มูลค่าสต๊อกรวม'],
      ['sold','ขายแล้ว','โหลดแล้ว / รับเงินแล้ว · ไม่ซ้ำกัน','มูลค่าขายโดยประมาณ'],
      ['reserved','ยอดจอง','รายการยังไม่โหลด · รวมรับเงินแล้วที่รอโหลด','มูลค่าจอง · ราคาสต๊อกประมาณการ'],
      ['free','พร้อมขาย · Free','คงเหลือหลังหักจองรายสเปก','มูลค่า Free']
    ];
    return cards.map(([id,label,note,moneyLabel])=>{
      const b=summary?.[id],complete=!!b?.coverage?.complete;
      const money=b?(b.valueTHB??((b.coverage?.valuedSpecCount||b.coverage?.knownRowCount)?b.knownValueTHB:null)):null;
      const partial=b&&!complete?' · บางส่วน':'';
      const units=b?.byUnit;
      const split=id==='sold'?`<div class="ss-sold-loading" aria-label="ยอดขายแยกการโหลด"><div><span>โหลดแล้ว</span><b>${quantityText(b?.loaded?.byUnit)}</b></div><div><span>ยังไม่โหลด</span><b>${quantityText(b?.paidUnloaded?.byUnit)}</b></div></div>`:'';
      return `<div class="ss-kpi ss-kpi-${id}"><div class="ss-physical-main"><h3>${label}</h3><strong>${display(units?.sheet)}</strong><small>${b?'แผ่น · '+note:'รอข้อมูลหัวข้อ 02'}</small>${units?.strip?`<div class="ss-strip-quantity">ไม้แถบ <b>${number(units.strip)}</b> ชิ้น</div>`:''}</div><dl class="ss-physical-equivalents"><div><dt>เทียบ 4×8 · ความหนาเดิม</dt><dd>${display(b?.eq4x8)} <small>แผ่น</small></dd></div><div><dt>เทียบ 4×8 · หนา 2.5 มม.</dt><dd>${display(b?.eq2_5)} <small>แผ่น</small></dd></div></dl>${split}<div class="ss-kpi-value"><span>${moneyLabel}${partial}</span><b>${money===null?'—':'฿ '+number(money)}</b>${b&&!complete?'<small>มูลค่ายังไม่ครบ · ไม่ตีรายการที่ไม่มีราคาเป็นศูนย์</small>':''}</div></div>`;
    }).join('');
  }
  function setSalesSummary(summary){
    if(!latest)return;
    latest={...latest,salesSummary:summary};
    const cards=root?.querySelector('.ss-kpis');if(cards)cards.innerHTML=kpiHTML(summary);
    const fx=root?.querySelector('.ss-exchange b');if(fx)fx.textContent=summary?.catalog?.fxThbPerUsd?number(summary.catalog.fxThbPerUsd,4):'—';
    const status=root?.querySelector('.ss-sales-summary-source');if(status)status.textContent=summary?'อ้างอิงหัวข้อ 02 · ใช้ราคาและเรทที่เซฟแล้ว':'รอข้อมูลจากหัวข้อ 02 · ยังไม่แสดงยอดจากชุดอื่น';
  }
  function html(m){
    const t=m.total,overrides=m.rows.filter(r=>r.physicalAt||r.freeAt).length,followed=m.rows.filter(r=>String(r.followup).trim()).length;
    let index=0;
    return `<article class="ss-sheet">
      <header class="ss-hero"><div><div class="ss-eyebrow">AAF / STOCK & SALES FOLLOW-UP</div><h2>รายงานสต๊อกและติดตามการขาย</h2><p>อ้างอิงรายงานเมล ${esc(reportDay(m.reportDate))}</p></div><div class="ss-hero-meta"><div class="ss-stamp">ข้อมูลที่บันทึกแล้ว<br><b>ครบ ${number(m.rows.length)} สเปก</b><br>ทุกเกรด · ทุกขนาด</div><div class="ss-exchange"><span>อัตราแลกเปลี่ยน · หัวข้อ 02</span><b>${m.salesSummary?.catalog?.fxThbPerUsd?number(m.salesSummary.catalog.fxThbPerUsd,4):'—'}</b><small>บาท / 1 USD</small></div></div></header>
      <div class="ss-content"><div class="ss-context"><span>ข้อมูลส่วนกลางล่าสุด <b>${esc(when(m.updatedAt))}</b></span><span>เวลาไทย (UTC+7) · ภาพรวมทั้งชุด ไม่ใช้ตัวกรองในหน้าสต๊อก</span></div>
      <p class="ss-sales-summary-source" role="status">${m.salesSummary?'อ้างอิงหัวข้อ 02 · ใช้ราคาและเรทที่เซฟแล้ว':'รอข้อมูลจากหัวข้อ 02 · ยังไม่แสดงยอดจากชุดอื่น'}</p>
      <div class="ss-kpis">${kpiHTML(m.salesSummary)}</div>
      <div class="ss-section-title"><span>01</span><h3>ภาพรวมแยกเกรดและความหนา</h3></div>
      <div class="ss-groups">${groupTable('แยกตามเกรด',m.grades,'เกรด',t)}${groupTable('แยกตามความหนา',m.thickness.filter(([,totals])=>totals.qty>0).map(([thick,totals])=>[thicknessLabel(thick),totals]),'หนา (mm)',t)}</div>
      <div class="ss-aging"><h3>Aging ตามรายงานเมลต้นฉบับ</h3><div class="ss-aging-grid">${m.aging.map((n,i)=>`<div><small>${agingLabels[i]}</small><b>${number(n)}</b><span>${t.agingBaseQty?number(n/t.agingBaseQty*100,1):'0'}%</span></div>`).join('')}</div><p>ฐาน Aging ${number(m.aging.reduce((a,b)=>a+b,0))} / ยอดเมลต้นฉบับ ${number(t.agingBaseQty)} หน่วย · ไม่กระจายยอดปรับระหว่างวันเข้าอายุสินค้า</p>${agingChart(m)}</div>
      <section class="ss-sales-block" data-html2canvas-ignore><div class="ss-section-title"><span>02</span><h3>ยอดขายและสต๊อก</h3></div><div id="stock-sales-preview-slot"></div></section>
      <div class="ss-section-title"><span>03</span><h3>รายละเอียดครบทุกสเปก</h3><small>ปรับเอง ${number(overrides)} สเปก · มีติดตาม ${number(followed)} สเปก</small></div>
      <p class="ss-help">เรียงความหนา → กว้าง → ยาว → เกรด • แสดง SKU, อายุสินค้า, ข้อความติดตาม และหมายเหตุครบ ไม่ตัดข้อความ</p>
      ${m.thickness.map(([thick,totals])=>`<section class="ss-detail-group"><div class="ss-band"><h4>ความหนา ${esc(thick)} mm</h4><span>${totals.count} สเปก · Physical ${number(totals.qty)} · Free ${number(totals.freeQty)} แผ่น</span></div><table class="ss-detail"><caption class="ss-sr">รายละเอียดความหนา ${esc(thick)} mm</caption><colgroup><col style="width:4%"><col style="width:18%"><col style="width:6%"><col style="width:11%"><col style="width:9%"><col style="width:11%"><col style="width:10%"><col style="width:10%"><col style="width:11%"><col style="width:10%"></colgroup><thead><tr><th>#</th><th>กว้าง × ยาว × หนา<br><small>หน่วย mm</small></th><th>เกรด</th><th class="ss-num">Physical</th><th class="ss-num">ยอดจอง</th><th class="ss-num">Free</th><th class="ss-num">เทียบ 2.5</th><th class="ss-num">ราคา/แผ่น</th><th class="ss-num">มูลค่า (฿)</th><th class="ss-num">Free (฿)</th></tr></thead><tbody>${m.rows.filter(r=>String(Number(r.t))===thick).map(r=>`<tr class="ss-stock-row"><td>${++index}</td><th>${number(r.w,3)} × ${number(r.l,3)} × ${number(r.t,3)}</th><td><b class="ss-grade">${esc(r.grade)}</b></td>${cell(r.qty)}${cell(r.committedQty)}<td class="ss-num ss-free">${number(r.freeQty)}</td>${cell(r.eq)}<td class="ss-num">${number(r.price,4)}<small>${esc(r.curr)}</small></td>${cell(r.value)}${cell(r.freeValue)}</tr><tr class="ss-description"><td colspan="10"><div><b>SKU</b> ${esc(r.sku||'—')} <span>· ${esc(r.desc)} · ${esc(r.size)}</span></div><div>${provenance(r)}</div>${r.physicalAt||r.freeAt?`<div class="ss-manual">${r.physicalAt?'ปรับ Physical '+esc(when(r.physicalAt)):''}${r.physicalAt&&r.freeAt?' · ':''}${r.freeAt?'ปรับ Free '+esc(when(r.freeAt)):''}</div>`:''}<div class="ss-memos">${memo(r,'followup','การติดตามยอดขาย')}${memo(r,'note','หมายเหตุ / แนวทางจัดการสต๊อก')}</div></td></tr>`).join('')}</tbody></table></section>`).join('')}
      <div class="ss-grand"><b>รวมครบ ${number(t.count)} สเปก</b><span>Physical <strong>${number(t.qty)}</strong></span><span>ยอดจอง <strong>${number(t.committedQty)}</strong></span><span>Free <strong>${number(t.freeQty)}</strong></span></div>
      <footer class="ss-footer"><div><b>จบรายงาน · แสดงครบ ${number(t.count)} / ${number(t.count)} สเปก</b><br>แหล่งข้อมูล: Stock AAF ส่วนกลาง${m.sourceRowCount?' · ต้นฉบับ '+number(m.sourceRowCount)+' แถว':''}<br>bbeautdb-arch.github.io/ybfjatetsllnibjirzbr/stock_manager.html</div><div>สร้างมุมมอง ${esc(when(m.renderedAt))}<br>ข้อมูลบันทึกล่าสุด ${esc(when(m.updatedAt))}<br>รายงานสำหรับใช้ภายในบริษัท</div></footer>
      </div></article>`;
  }

  const style=document.createElement('style');style.textContent=`
    [data-aaf-stock-summary]{font-family:'Prompt',sans-serif;color:#172b42;padding-bottom:40px;min-width:0;font-size:14px;line-height:1.55}
    [data-aaf-stock-summary] *{box-sizing:border-box}
    [data-aaf-stock-summary] .ss-tools{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:0 0 16px;flex-wrap:wrap}
    [data-aaf-stock-summary] .ss-tools h2{font-size:23px;font-weight:700;margin:0}
    [data-aaf-stock-summary] .ss-tools p{margin:4px 0;color:#52657a}
    [data-aaf-stock-summary] button{border:0;border-radius:10px;background:#0d7669;color:white;padding:12px 18px;cursor:pointer;font:600 14px 'Prompt',sans-serif}
    [data-aaf-stock-summary] button:disabled{opacity:.5;cursor:wait}
    [data-aaf-stock-summary] .ss-status{margin:8px 0;color:#52657a;white-space:pre-wrap}
    [data-aaf-stock-summary] .ss-error{color:#a52728;background:#fff0ef;padding:12px;border-radius:8px}
    [data-aaf-stock-summary] .ss-sheet{background:#fff;border:1px solid #ccd8e2;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px #14283c0a}
    [data-aaf-stock-summary] .ss-hero{padding:32px;background:#142c42;color:white;display:flex;justify-content:space-between;gap:20px;align-items:center;border-bottom:6px solid #25ac98}
    [data-aaf-stock-summary] .ss-eyebrow{font-size:12px;letter-spacing:2px;color:#8ed8cd;font-weight:600}
    [data-aaf-stock-summary] .ss-hero h2{font-size:30px;line-height:1.35;font-weight:700;margin:10px 0}
    [data-aaf-stock-summary] .ss-hero p{margin:0;color:#d4e4ef;font-size:17px}
    [data-aaf-stock-summary] .ss-stamp{border:1px solid #60798d;border-radius:10px;padding:14px 20px;color:#cee1ef;font-size:13px;text-align:right;flex-shrink:0}
    [data-aaf-stock-summary] .ss-stamp b{font-size:21px;color:white}
    [data-aaf-stock-summary] .ss-hero-meta{display:flex;gap:12px;align-items:stretch;flex-shrink:0;flex-wrap:wrap;max-width:100%}
    [data-aaf-stock-summary] .ss-exchange{border:1px solid #60798d;border-radius:10px;padding:14px 18px;text-align:right;color:#cee1ef;display:flex;flex-direction:column;justify-content:center;font-size:12px}
    [data-aaf-stock-summary] .ss-exchange b{font-size:24px;color:white;font-variant-numeric:tabular-nums}
    [data-aaf-stock-summary] .ss-exchange small{font-size:11px}
    [data-aaf-stock-summary] .ss-content{padding:24px 28px}
    [data-aaf-stock-summary] .ss-context{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;font-size:12px;color:#52657a;margin-bottom:20px}
    [data-aaf-stock-summary] .ss-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    [data-aaf-stock-summary] .ss-kpi{border:1px solid #cbd8e3;background:#f4f7fa;border-radius:12px;padding:18px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px 18px;align-items:center}
    [data-aaf-stock-summary] .ss-kpi h3{font-size:14px;font-weight:600;margin:0}
    [data-aaf-stock-summary] .ss-kpi strong{display:block;font-size:32px;font-weight:700;letter-spacing:-1px;line-height:1.4;margin:6px 0;font-variant-numeric:tabular-nums}
    [data-aaf-stock-summary] .ss-kpi small{color:#52657a;font-size:11px}
    [data-aaf-stock-summary] .ss-kpi-physical{background:#f0f6fb;border-color:#b9cddd}
    [data-aaf-stock-summary] .ss-physical-equivalents{margin:0;padding-left:18px;border-left:1px solid #c3d5e3;display:grid;gap:10px}
    [data-aaf-stock-summary] .ss-physical-equivalents dt{font-size:11px;color:#52657a;line-height:1.5}
    [data-aaf-stock-summary] .ss-physical-equivalents dd{margin:2px 0 0;font-size:21px;font-weight:700;line-height:1.35;color:#172b42;font-variant-numeric:tabular-nums;white-space:nowrap}
    [data-aaf-stock-summary] .ss-physical-equivalents dd small{font-weight:400}
    [data-aaf-stock-summary] .ss-kpi-value{grid-column:1/-1;border-top:1px solid #cbd8e3;padding-top:10px;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;font-size:12px;color:#52657a}
    [data-aaf-stock-summary] .ss-kpi-value b{font-size:20px;color:#172b42;margin-left:auto;font-variant-numeric:tabular-nums}
    [data-aaf-stock-summary] .ss-kpi-value small{flex-basis:100%;font-size:10px}
    [data-aaf-stock-summary] .ss-kpi-sold{background:#eff6ff;border-color:#bdd2ef;color:#24528a}
    [data-aaf-stock-summary] .ss-kpi-reserved{background:#fff9ed;border-color:#e5d5ad;color:#785b24}
    [data-aaf-stock-summary] .ss-kpi-free{background:#e4f6f0;border-color:#8bcdba;color:#06634e}
    [data-aaf-stock-summary] .ss-sales-summary-source{font-size:12px;color:#52657a;margin:0 0 10px}
    [data-aaf-stock-summary] .ss-strip-quantity{font-size:13px;margin-top:6px;color:#52657a}
    [data-aaf-stock-summary] .ss-sold-loading{display:grid;grid-template-columns:1fr 1fr;gap:10px;grid-column:1/-1;border-top:1px solid #bdd2ef;padding-top:10px}
    [data-aaf-stock-summary] .ss-sold-loading div{display:flex;flex-direction:column;gap:4px;background:#ffffffa6;border:1px solid #d3e2f4;border-radius:8px;padding:8px 10px;min-width:0}
    [data-aaf-stock-summary] .ss-sold-loading span{font-size:12px;color:#52657a}
    [data-aaf-stock-summary] .ss-sold-loading b{font-size:15px;font-variant-numeric:tabular-nums}
    [data-aaf-stock-summary] .ss-values{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px;margin:20px 0;font-size:12px;color:#52657a}
    [data-aaf-stock-summary] .ss-values b{display:block;color:#172b42;font-size:19px;font-weight:600;margin-top:4px}
    [data-aaf-stock-summary] .ss-help{font-size:12px;color:#52657a;line-height:1.8;margin:12px 0 18px}
    [data-aaf-stock-summary] .ss-section-title{display:flex;align-items:center;gap:10px;margin:30px 0 15px;border-bottom:1px solid #cfdae4;padding-bottom:12px;flex-wrap:wrap}
    [data-aaf-stock-summary] .ss-section-title>span{background:#142c42;color:white;font-size:12px;padding:5px 8px;border-radius:6px}
    [data-aaf-stock-summary] .ss-section-title h3{margin:0;font-size:20px;font-weight:700}
    [data-aaf-stock-summary] .ss-section-title small{margin-left:auto;color:#52657a;font-size:12px}
    [data-aaf-stock-summary] .ss-groups{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;min-width:0}
    [data-aaf-stock-summary] .ss-group{border:1px solid #d4dee7;border-radius:10px;overflow:hidden;min-width:0}
    [data-aaf-stock-summary] .ss-group-heading{padding:9px 10px;background:#edf3f7;display:flex;justify-content:space-between;align-items:baseline;gap:6px;flex-wrap:wrap}
    [data-aaf-stock-summary] .ss-group h3{margin:0;font-weight:700;font-size:13px}
    [data-aaf-stock-summary] .ss-group-heading small{font-size:9px;color:#64748b}
    [data-aaf-stock-summary] .ss-group-scroll{width:100%;max-width:100%;overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
    [data-aaf-stock-summary] .ss-group-scroll:focus-visible{outline:2px solid #2563eb;outline-offset:-2px}
    [data-aaf-stock-summary] table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px}
    [data-aaf-stock-summary] th,[data-aaf-stock-summary] td{padding:9px 10px;text-align:left;vertical-align:top;border-bottom:1px solid #dde5ec;overflow-wrap:anywhere;white-space:normal}
    [data-aaf-stock-summary] th{font-weight:600}
    [data-aaf-stock-summary] thead{background:#edf3f7;color:#3b5268}
    [data-aaf-stock-summary] thead th{font-size:11px;vertical-align:middle}
    [data-aaf-stock-summary] .ss-num{text-align:right;font-variant-numeric:tabular-nums}
    [data-aaf-stock-summary] .ss-free{color:#08654f;font-weight:700;background:#f0faf6}
    [data-aaf-stock-summary] .ss-group table{table-layout:fixed;font-size:11px;min-width:0;line-height:1.5}
    [data-aaf-stock-summary] .ss-group th,[data-aaf-stock-summary] .ss-group td{padding:7px 3px}
    [data-aaf-stock-summary] .ss-group thead th{font-size:10px}
    [data-aaf-stock-summary] .ss-group thead tr:first-child th:nth-child(1){width:7%}
    [data-aaf-stock-summary] .ss-group thead tr:first-child th:nth-child(2){width:5%}
    [data-aaf-stock-summary] .ss-group thead tr:first-child th:nth-child(3),[data-aaf-stock-summary] .ss-group thead tr:first-child th:nth-child(4),[data-aaf-stock-summary] .ss-group thead tr:first-child th:nth-child(5){width:11%}
    [data-aaf-stock-summary] .ss-group thead tr:first-child th:nth-child(6){width:30%}
    [data-aaf-stock-summary] .ss-group thead tr:first-child th:nth-child(7),[data-aaf-stock-summary] .ss-group thead tr:first-child th:nth-child(8){width:12.5%}
    [data-aaf-stock-summary] .ss-group thead small{font-size:9px;font-weight:400;white-space:normal}
    [data-aaf-stock-summary] .ss-group td.ss-num{white-space:nowrap}
    [data-aaf-stock-summary] .ss-group .ss-equivalent{background:#eff5ff;color:#234c7b}
    [data-aaf-stock-summary] .ss-group .ss-aging-mail{background:#fff8df;color:#72551c}
    [data-aaf-stock-summary] .ss-group .ss-aging-mail-group{text-align:center;background:#f8e9b9;color:#624812;border-bottom:1px solid #d8c68e}
    [data-aaf-stock-summary] .ss-group .ss-aging-over{font-weight:700;color:#9a4d12}
    [data-aaf-stock-summary] .ss-group tfoot{font-weight:700;background:#edf3f7;border-top:2px solid #bacbd9}
    [data-aaf-stock-summary].ss-export .ss-groups{grid-template-columns:1fr}
    [data-aaf-stock-summary].ss-export .ss-sales-block{display:none}
    [data-aaf-stock-summary].ss-export .ss-group-scroll{overflow:visible}
    [data-aaf-stock-summary] .ss-conversion-help{font-size:13px}
    @media(max-width:1450px){[data-aaf-stock-summary]:not(.ss-export) .ss-groups{grid-template-columns:1fr}}
    @media(max-width:540px){[data-aaf-stock-summary]:not(.ss-export) .ss-group table{table-layout:fixed}[data-aaf-stock-summary]:not(.ss-export) .ss-group th,[data-aaf-stock-summary]:not(.ss-export) .ss-group td{padding:8px 3px}[data-aaf-stock-summary]:not(.ss-export) .ss-group td.ss-num,[data-aaf-stock-summary]:not(.ss-export) .ss-group thead small{white-space:normal}}
    [data-aaf-stock-summary] .ss-aging{padding:12px;border:1px solid #dccba7;border-radius:10px;background:#fffaf0;margin-top:14px}
    [data-aaf-stock-summary] .ss-aging h3{margin:0 0 7px;font-size:13px;font-weight:600}
    [data-aaf-stock-summary] .ss-aging-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
    [data-aaf-stock-summary] .ss-aging-grid small{font-size:10px}
    [data-aaf-stock-summary] .ss-aging-grid b{display:inline-block;font-size:16px;font-weight:600;margin-right:7px}
    [data-aaf-stock-summary] .ss-aging-grid small{display:block}
    [data-aaf-stock-summary] .ss-aging-grid span,[data-aaf-stock-summary] .ss-aging p{font-size:10px;color:#756347}
    [data-aaf-stock-summary] .ss-aging p{margin:5px 0 0}
    [data-aaf-stock-summary] .ss-aging-chart{border:1px solid #eadbbd;border-radius:8px;background:#fffdf7;padding:8px;margin-top:7px;min-width:0}
    [data-aaf-stock-summary] .ss-aging-chart>h4{font-size:10px;margin:0 0 4px;color:#574b3c}
    [data-aaf-stock-summary] .ss-aging-chart-main{display:grid;grid-template-columns:minmax(0,1fr) 195px;gap:10px;align-items:start;min-width:0}
    [data-aaf-stock-summary] .ss-aging-svg{display:block;width:100%;height:190px}
    [data-aaf-stock-summary] .ss-aging-gridline{stroke:#eadfca;stroke-width:1}
    [data-aaf-stock-summary] .ss-aging-axisline{stroke:#9d8b6c;stroke-width:1.2}
    [data-aaf-stock-summary] .ss-aging-axis{fill:#756347;font-size:11px}
    [data-aaf-stock-summary] .ss-aging-label{fill:#574b3c;font-size:11px}
    [data-aaf-stock-summary] .ss-aging-insights{border-left:1px solid #eadbbd;padding-left:12px;min-width:0}
    [data-aaf-stock-summary] .ss-aging-insights h4{font-size:10px;margin:0 0 4px;color:#574b3c}
    [data-aaf-stock-summary] .ss-aging-insights div{border-top:1px solid #f0e7d6;padding:3px 0}
    [data-aaf-stock-summary] .ss-aging-insights span{display:block;color:#756347;font-size:9px}
    [data-aaf-stock-summary] .ss-aging-insights b{display:block;color:#172b42;font-size:10px;font-weight:600}
    [data-aaf-stock-summary] .ss-aging-legend{display:flex;flex-wrap:wrap;gap:6px 12px;border-top:1px solid #eadbbd;padding-top:8px;margin-top:4px;color:#574b3c;font-size:10px}
    [data-aaf-stock-summary] .ss-aging-legend span{display:inline-flex;align-items:center;gap:4px}
    [data-aaf-stock-summary] .ss-aging-legend i{display:inline-block;width:10px;height:10px;border-radius:2px}
    [data-aaf-stock-summary] .ss-aging-total{margin-top:8px;color:#756347;font-size:10px;text-align:right}
    @media(max-width:760px){[data-aaf-stock-summary]:not(.ss-export) .ss-aging-chart-main{grid-template-columns:1fr}[data-aaf-stock-summary]:not(.ss-export) .ss-aging-insights{border-left:0;border-top:1px solid #eadbbd;padding:10px 0 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px}[data-aaf-stock-summary]:not(.ss-export) .ss-aging-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    [data-aaf-stock-summary] .ss-detail-group{margin-bottom:24px;border:1px solid #bacbd9;border-radius:9px;overflow:hidden}
    [data-aaf-stock-summary] .ss-band{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 14px;background:#213e56;color:white}
    [data-aaf-stock-summary] .ss-band h4{margin:0;font-size:17px;font-weight:600}
    [data-aaf-stock-summary] .ss-band span{font-size:12px;color:#d1e2ef}
    [data-aaf-stock-summary] .ss-detail{font-size:13px}
    [data-aaf-stock-summary] .ss-detail th,[data-aaf-stock-summary] .ss-detail td{padding:10px 8px}
    [data-aaf-stock-summary] .ss-stock-row{font-weight:600}
    [data-aaf-stock-summary] .ss-stock-row small{display:block;color:#62778b;font-weight:400;font-size:10px}
    [data-aaf-stock-summary] .ss-grade{display:inline-block;background:#edf2f7;border-radius:4px;padding:1px 4px;font-size:12px}
    [data-aaf-stock-summary] .ss-description>td{padding:8px 12px 14px!important;border-bottom:2px solid #bacbd9;background:#f8fafc;color:#52657a;font-size:10px;line-height:1.8}
    [data-aaf-stock-summary] .ss-manual{color:#966215}
    [data-aaf-stock-summary] .ss-memos{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:8px;border-top:1px dashed #cbd8e3;padding-top:8px}
    [data-aaf-stock-summary] .ss-memos b{color:#27465d;font-size:11px}
    [data-aaf-stock-summary] .ss-text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;color:#172b42;line-height:1.65}
    [data-aaf-stock-summary] .ss-memos small{display:block;margin-top:5px;font-size:10px;color:#62778b}
    [data-aaf-stock-summary] .ss-grand{background:#e4f6f0;border:1px solid #87c8b6;border-radius:10px;padding:18px;display:flex;gap:20px;justify-content:space-between;align-items:center;flex-wrap:wrap;color:#08654f}
    [data-aaf-stock-summary] .ss-grand strong{display:block;font-size:25px;font-weight:700}
    [data-aaf-stock-summary] .ss-grand span{font-size:12px}
    [data-aaf-stock-summary] .ss-footer{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #cbd8e3;padding-top:20px;margin-top:24px;font-size:11px;color:#52657a;line-height:1.8}
    [data-aaf-stock-summary] .ss-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    @media(max-width:1100px){[data-aaf-stock-summary]:not(.ss-export) .ss-hero{flex-wrap:wrap}}
    @media(max-width:900px){[data-aaf-stock-summary]:not(.ss-export) .ss-kpis{display:flex;flex-direction:column}}
    @media(max-width:420px){[data-aaf-stock-summary]:not(.ss-export) .ss-kpi{grid-template-columns:1fr}[data-aaf-stock-summary]:not(.ss-export) .ss-physical-equivalents{padding:12px 0 0;border-left:0;border-top:1px solid #c3d5e3;grid-template-columns:1fr 1fr;gap:8px}[data-aaf-stock-summary]:not(.ss-export) .ss-physical-equivalents dd{font-size:17px}}
    @media(max-width:800px){[data-aaf-stock-summary]:not(.ss-export) .ss-content{padding:12px}[data-aaf-stock-summary]:not(.ss-export) .ss-hero{padding:20px;flex-wrap:wrap}[data-aaf-stock-summary]:not(.ss-export) .ss-hero h2{font-size:25px}[data-aaf-stock-summary]:not(.ss-export) .ss-kpis,[data-aaf-stock-summary]:not(.ss-export) .ss-values{grid-template-columns:1fr 1fr}[data-aaf-stock-summary]:not(.ss-export) .ss-groups{grid-template-columns:1fr}[data-aaf-stock-summary]:not(.ss-export) .ss-detail{font-size:10px}[data-aaf-stock-summary]:not(.ss-export) .ss-detail th,[data-aaf-stock-summary]:not(.ss-export) .ss-detail td{padding:6px 3px}[data-aaf-stock-summary]:not(.ss-export) .ss-band{flex-wrap:wrap}[data-aaf-stock-summary]:not(.ss-export) .ss-aging-grid b{font-size:17px}[data-aaf-stock-summary]:not(.ss-export) .ss-kpi strong{font-size:26px}[data-aaf-stock-summary]:not(.ss-export) .ss-footer{flex-direction:column}}
  `;document.head.append(style);
  function showError(message){if(!root)return;const n=root.querySelector('.ss-status')||root;n.textContent=message;n.classList.add('ss-error');root.querySelectorAll('.ss-download,.cash-download').forEach(b=>b.disabled=true);latest=null;root.querySelector('.ss-sheet')?.remove();root.querySelector('.cash-sheet')?.remove();}
  let jumpedToCash=false;
  function update(data,calculate){
    if(!root)return;const m=model(data,calculate);m.salesSummary=window.AAFSalesPreview?.getReportSummary?.()||null;latest=m;root.classList.remove('ss-error');
    // Retain the same native preview node: changing stock revisions must not discard price/note drafts.
    const preview=root.querySelector('#stock-sales-preview-host');
    const focused=preview?.shadowRoot?.activeElement;
    const selection=focused&&typeof focused.selectionStart==='number'?{start:focused.selectionStart,end:focused.selectionEnd}:null;
    preview?.remove();
    root.innerHTML=`<div class="ss-tools ss-report-intro"><div><h2>สรุปสต๊อกสำหรับส่งรายงาน</h2><p>รายงานยาวครบทุกแถว • ข้อมูลอ่านอย่างเดียว ไม่เปลี่ยนข้อมูลสต๊อก</p><a href="#stock-cash">ดูสต๊อกและเงิน ↓</a></div><button type="button" class="ss-download" ${exporting?'disabled':''}>ดาวน์โหลดภาพยาว PNG</button></div><p class="ss-status" role="status">ภาพรวมจากข้อมูลส่วนกลางที่โหลดล่าสุด — ใช้เฉพาะค่าที่บันทึกสำเร็จจากหน้าสต๊อก</p>${html(m)}${m.cash?`<div class="ss-tools" style="margin-top:28px"><h2>กล่องสต๊อกและเงิน</h2><button type="button" class="cash-download" ${exporting?'disabled':''}>ดาวน์โหลดกล่องสต๊อกและเงิน PNG</button></div>${window.AAFStockCash.render(m.cash)}`:m.cashError?`<p class="ss-error">ยังแสดงกล่องเงินไม่ได้: ${esc(m.cashError)}</p>`:''}`;
    root.querySelector('.ss-download').addEventListener('click',()=>download());root.querySelector('.cash-download')?.addEventListener('click',()=>download('cash'));
    window.AAFSalesPreview?.attach(root.querySelector('#stock-sales-preview-slot'));
    if(focused?.isConnected){focused.focus({preventScroll:true});if(selection)focused.setSelectionRange(selection.start,selection.end);}
    if(!jumpedToCash&&location.hash==='#stock-cash'&&m.cash){jumpedToCash=true;root.querySelector('#stock-cash').scrollIntoView();}
  }
  async function loadCanvas(){
    if(window.html2canvas)return window.html2canvas;
    if(!canvasLoader)canvasLoader=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';script.crossOrigin='anonymous';script.referrerPolicy='no-referrer';script.onload=()=>window.html2canvas?resolve(window.html2canvas):reject(new Error('โหลดเครื่องมือสร้างภาพไม่สำเร็จ'));script.onerror=()=>{script.remove();canvasLoader=null;reject(new Error('โหลดเครื่องมือสร้างภาพไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'));};document.head.append(script);});
    return canvasLoader;
  }
  async function download(which='stock'){
    if(!latest||exporting)return;exporting=true;const captured=latest;let box=null;
    const status=text=>{const p=root.querySelector('.ss-status');if(p)p.textContent=text;};
    root.querySelectorAll('.ss-download,.cash-download').forEach(b=>b.disabled=true);status('กำลังสร้างภาพยาวครบทุกแถว กรุณารอสักครู่…');
    try{
      const canvasFn=await loadCanvas();await document.fonts?.ready;
      box=document.createElement('div');box.dataset.aafStockSummary='';box.className='ss-export';box.style.cssText='position:absolute;left:-20000px;top:0;width:1440px;padding:0;background:white;';box.innerHTML=which==='cash'?window.AAFStockCash.render(captured.cash):html(captured);document.body.append(box);
      const sheet=box.querySelector(which==='cash'?'.cash-sheet':'.ss-sheet'),height=Math.ceil(sheet.getBoundingClientRect().height),scale=Math.min(1.5,30000/height,Math.sqrt(48000000/(1440*height)));
      if(scale<0.65)throw new Error('ข้อความยาวเกินขนาดภาพที่อ่านได้ในรูปเดียว กรุณาถ่ายภาพเต็มหน้าผ่านเบราว์เซอร์แทน');
      const canvas=await canvasFn(sheet,{backgroundColor:'#ffffff',scale,width:1440,height,windowWidth:1500,windowHeight:1000,scrollX:0,scrollY:0,logging:false});
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('เบราว์เซอร์สร้างภาพไม่สำเร็จ');
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(which==='cash'?'AAF_Stock_Cash_':'AAF_Stock_Summary_')+captured.reportDate+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      status(`ดาวน์โหลดภาพครบ ${captured.rows.length} สเปกแล้ว · ข้อมูลบันทึก ${when(captured.updatedAt)}${latest!==captured?' · มีข้อมูลใหม่บนหน้าจอหลังเริ่มสร้างภาพ':''}`);
    }catch(e){status('ยังไม่ได้ดาวน์โหลดภาพ: '+e.message);}finally{box?.remove();exporting=false;root.querySelectorAll('.ss-download,.cash-download').forEach(b=>b.disabled=!latest);}
  }
  window.AAFStockSummary={update,showError,setSalesSummary};
  // Pure read-only builders exposed for regression tests and isolated previews.
  window.AAFStockSummary.buildModel=model;window.AAFStockSummary.renderHTML=html;
})();
