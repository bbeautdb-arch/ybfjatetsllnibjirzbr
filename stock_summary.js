/* Saved-state stock report. Inline price editors delegate to the existing
   section 02 catalog; this module never writes stock/storage or source sales. */
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
  const blankUnit=()=>({qty:0,committedQty:0,reservedInStockQty:0,reservedProductionQty:0,freeQty:0,agingBaseQty:0,aging90:0,aging180:0,agingOver180:0,d90:0,d180:0,d270:0,d360:0,dOver:0,count:0});
  const blank=()=>({qty:0,baseQty:0,freeQty:0,committedQty:0,reservedInStockQty:0,reservedProductionQty:0,stripEq4x8:0,stripEq:0,eq4x8:0,eq:0,value:0,freeValue:0,freeEq4x8:0,freeEq:0,reservedEq4x8:0,reservedEq:0,reservedValue:0,reservedUnpricedQty:0,agingBaseQty:0,aging90:0,aging180:0,agingOver180:0,count:0,byUnit:{sheet:blankUnit(),strip:blankUnit()}});
  const add=(s,r)=>{for(const k of ['qty','baseQty','freeQty','committedQty','reservedInStockQty','reservedProductionQty','stripEq4x8','stripEq','eq4x8','eq','value','freeValue','freeEq4x8','freeEq','reservedEq4x8','reservedEq','reservedValue','reservedUnpricedQty','agingBaseQty','aging90','aging180','agingOver180'])s[k]+=r[k];s.count++;const unit=s.byUnit[r.unit];if(unit){for(const k of Object.keys(unit).filter(k=>k!=='count'))unit[k]+=r[k];unit.count++;}return s;};
  let latest=null,exporting=false,canvasLoader=null,headerExchangeRate=null,savedStockCatalog=null;

  // Saved stock prices are independent of the sales-allocation package. Exact
  // identity is required; never apply yesterday's prices/quantities as today's
  // complete sales report, or turn an unknown unit price into zero.
  function withSavedCatalog(m,catalog,fx){
    const empty=()=>({...m,savedCatalog:null,rows:m.rows.map(r=>({...r,catalogPrice:null,catalogCurrency:null,catalogValue:null,catalogFreeValue:null}))});
    if(!catalog||String(catalog.revision)!==String(m.revision)||catalog.reportDate!==m.reportDate||!Array.isArray(catalog.rows)||catalog.rows.length!==m.rows.length)return empty();
    const rows=new Map(catalog.rows.map(r=>[String(r.key),r]));
    const fields=['w','l','t','grade','unit','qty','committedQty','freeQty'];
    if(rows.size!==m.rows.length||m.rows.some(r=>{const c=rows.get(String(r.key));return !c||fields.some(k=>['grade','unit'].includes(k)?c[k]!==r[k]:Number(c[k])!==Number(r[k]));}))return empty();
    const rate=validHeaderFx(fx)?.rate??null;
    const totals={sheet:{known:0,unknown:0,pricedRows:0},strip:{known:0,unknown:0,pricedRows:0}};
    const decorated=m.rows.map(r=>{
      const c=rows.get(String(r.key)),price=typeof c.price==='number'&&Number.isFinite(c.price)&&c.price>0?c.price:null;
      const currency=['THB','USD'].includes(c.currency)?c.currency:null;
      const factor=currency==='THB'?1:currency==='USD'?rate:null;
      const value=price!==null&&factor!==null?r.qty*price*factor:null,free=price!==null&&factor!==null?r.freeQty*price*factor:null;
      const safeValue=value!==null&&Number.isFinite(value)?value:null,safeFree=free!==null&&Number.isFinite(free)?free:null;
      const total=totals[r.unit];
      if(total){if(safeValue!==null){total.known+=safeValue;if(r.qty>0)total.pricedRows++;}else total.unknown+=r.qty;}
      return {...r,catalogPrice:price,catalogCurrency:currency,catalogValue:safeValue,catalogFreeValue:safeFree};
    });
    if(Object.values(totals).some(t=>!Number.isFinite(t.known)||!Number.isFinite(t.unknown)))return empty();
    return {...m,rows:decorated,savedCatalog:{catalogRevision:catalog.catalogRevision,savedAt:catalog.savedAt||'',totals}};
  }
  function stockPriceCells(r){
    const applied=Object.hasOwn(r,'catalogPrice'),price=applied?r.catalogPrice:(r.priceMissing||!(r.price>0)?null:r.price),currency=applied?r.catalogCurrency:r.curr;
    const value=applied?r.catalogValue:price===null?null:r.value,free=applied?r.catalogFreeValue:price===null?null:r.freeValue;
    const monetary=v=>v===null?'—':number(v);
    return `<td class="ss-num" data-saved-price>${price===null?'—':number(price,4)}<small>${esc(currency||'ยังไม่ทราบราคา/สกุลเงิน')}</small></td><td class="ss-num" data-saved-value>${monetary(value)}</td><td class="ss-num" data-saved-free-value>${monetary(free)}</td>`;
  }
  function savedPhysicalValueHTML(m){
    const c=m?.savedCatalog;if(!c)return '<b>—</b><small>รอยืนยันชุดราคาสต๊อก · ไม่ใช้ราคาขายหรือศูนย์แทน</small>';
    const values=['sheet','strip'].map(unit=>{
      const t=c.totals[unit],label=unit==='sheet'?'แผ่น':'ไม้แถบ';
      return `<div>${label}: <b>${t.pricedRows||!t.unknown?'฿ '+number(t.known):'—'}</b>${t.unknown?` <small>เฉพาะส่วนที่มีราคา · รอราคา/FX ${number(t.unknown)} ${unit==='sheet'?'แผ่น':'ชิ้น'}</small>`:''}</div>`;
    }).join('');
    return `${values}<small>Physical × ราคาประเมินที่บันทึก · ไม่ขึ้นกับยอดจองหรือรับเงิน · ไม่ใช่ราคาขายจริง</small><small>ชุดราคา ${esc(c.catalogRevision??'—')}${c.savedAt?' · เซฟ '+esc(when(c.savedAt)):''} · ยังไม่เปิดอัปเดตเฉลี่ย 6 เดือนอัตโนมัติ</small>`;
  }
  function repaintSavedCatalog(){
    if(!latest)return;latest=withSavedCatalog(latest,savedStockCatalog,headerExchangeRate);
    for(const node of root?.querySelectorAll('.ss-stock-row[data-stock-row-key]')||[]){
      const r=latest.rows.find(row=>String(row.key)===node.dataset.stockRowKey);if(!r)continue;
      const container=document.createElement('tr');container.innerHTML=stockPriceCells(r);
      for(const name of ['data-saved-price','data-saved-value','data-saved-free-value']){const old=node.querySelector('['+name+']'),fresh=container.querySelector('['+name+']');if(old&&fresh)old.replaceWith(fresh);}
    }
    const value=root?.querySelector('[data-basic-stock="physical"] .ss-kpi-value');if(value)value.innerHTML='<span>มูลค่าสต๊อกจริง · ราคาที่บันทึก</span>'+savedPhysicalValueHTML(latest);
  }
  function setSavedStockCatalog(value){savedStockCatalog=value;repaintSavedCatalog();}

  // A dated FX reference is independently readable even when sales/valuation
  // readiness is pending. It must never turn pending money totals into estimates.
  function validHeaderFx(value){
    if(!value||value.basis!=='BOT_USD_THB_BUYING_TRANSFER'||typeof value.rate!=='number'||!Number.isFinite(value.rate)||value.rate<=0||value.rate>1000||!['current','stale','unavailable'].includes(value.status))return null;
    const date=value.date;if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;
    const parsed=new Date(date+'T00:00:00Z');if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return null;
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
    if(date>[parts.year,parts.month,parts.day].join('-'))return null;
    return {rate:value.rate,date,status:value.status,basis:value.basis};
  }
  function exchangeRateDisplay(summary,reference){
    const catalog=summary?.catalog;
    if(typeof catalog?.fxThbPerUsd==='number'&&Number.isFinite(catalog.fxThbPerUsd)&&catalog.fxThbPerUsd>0&&catalog.fxThbPerUsd<=1000)return {rate:catalog.fxThbPerUsd,status:catalog.fxStatus||'เรทที่บันทึกไว้ในหัวข้อ 02 · ไม่ใช่เรทรับเงินจริง'};
    const fx=validHeaderFx(reference);
    if(!fx)return {rate:null,status:'ยังยืนยันเรท USD ไม่ได้ · ไม่ใช้ 0 แทน'};
    const prefix=fx.status==='current'?'ธปท. ซื้อเงินโอน':fx.status==='stale'?'ธปท. ซื้อเงินโอน · ข้อมูลเกิน 7 วัน':'ดึงเรทล่าสุดไม่สำเร็จ · คงเรท ธปท. ที่ยืนยันแล้ว';
    return {rate:fx.rate,status:prefix+' · '+reportDay(fx.date)+' · บาท / 1 USD · อัตรารายวัน ไม่ใช่เรทรับเงินจริง'};
  }
  function paintExchangeRate(){
    const display=exchangeRateDisplay(latest?.salesSummary,headerExchangeRate);
    const value=root?.querySelector('.ss-exchange b');if(value)value.textContent=display.rate===null?'—':number(display.rate,4);
    const status=root?.querySelector('.ss-exchange small');if(status)status.textContent=display.status;
  }
  function setExchangeRate(value){
    headerExchangeRate=validHeaderFx(value);
    if(latest)latest={...latest,headerExchangeRate};
    paintExchangeRate();
    repaintSavedCatalog();
  }

  function model(data,calculate){
    if(!data.report||!Array.isArray(data.rows)||!data.rows.length)throw new Error('ยังไม่มีรายงานสต๊อกส่วนกลาง');
    const rows=data.rows.map(r=>{
      const result={};
      result.rawSource=r.rawSource!==false;
      result.retained=!!r.retained;
      result.priceMissing=!!r.priceMissing;
      // Whitelist display fields: no account, token or permissions enter the report.
      for(const k of ['key','sku','desc','size','w','l','t','grade','unit','followup','note','followupBy','followupAt','noteBy','noteAt'])result[k]=r[k]??'';
      for(const k of ['qty','baseQty','freeQty','committedQty',...agingKeys]){
        if(r.rawSource===false&&agingKeys.includes(k)){result[k]=0;continue;}
        if(typeof r[k]!=='number'||!Number.isFinite(r[k])||r[k]<0)throw new Error('ข้อมูลจำนวนไม่ครบ: '+(r.key||r.sku)+' / '+k);
        result[k]=r[k];
      }
      if(!r.grade||['w','l','t'].some(k=>!Number.isFinite(Number(r[k]))||Number(r[k])<=0))throw new Error('ขนาดหรือเกรดไม่ครบ');
      // Split each saved spec before aggregating: spare stock in another spec
      // cannot cover this spec's shortage. Saved/manual Free remains untouched.
      result.reservedInStockQty=Math.min(r.qty,r.committedQty);
      result.reservedProductionQty=Math.max(0,r.committedQty-r.qty);
      result.freeReconciliationException=Math.abs(r.qty-result.reservedInStockQty-r.freeQty)>0.000001;
      // Display-only equivalents. Never add strip pieces to real sheet counts,
      // or feed these equivalents back into stock allocation / source Aging.
      result.stripEq4x8=r.unit==='strip'?r.qty*Number(r.w)*Number(r.l)/standardArea:0;
      result.stripEq=result.stripEq4x8*Number(r.t)/2.5;
      if(!Number.isFinite(result.stripEq4x8)||!Number.isFinite(result.stripEq))throw new Error('ข้อมูลเทียบไม้แถบไม่ถูกต้อง');
      // Area equivalent at the row's original thickness, using saved Physical only.
      result.eq4x8=r.unit==='strip'?0:r.qty*(Number(r.w)*Number(r.l)/standardArea);
      if(!Number.isFinite(result.eq4x8))throw new Error('ข้อมูลแปลง 4×8 ไม่ถูกต้อง');
      const v=calculate(r);
      for(const k of ['eq','value','freeValue','price']){if(!Number.isFinite(v[k])||v[k]<0)throw new Error('ข้อมูลมูลค่าไม่ครบ');result[k]=v[k];}
      if(r.unit==='strip')result.eq=0;
      result.curr=v.curr;result.physicalAt=r.physicalOverride?.at||'';result.freeAt=r.freeOverride?.at||'';
      const area=r.unit==='strip'?0:Number(r.w)*Number(r.l)/standardArea,thickness=Number(r.t)/2.5;
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
      if(r.rawSource&&r.unit!=='strip'){
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
  const stockQuantityText=(totals,field)=>totals.byUnit?.strip.count?number(totals.byUnit.sheet[field])+' แผ่น · ไม้แถบ '+number(totals.byUnit.strip[field])+' ชิ้น':number(totals[field])+' แผ่น';
  const stockQuantityCell=(totals,field,free=false,extra='')=>'<td class="ss-num'+(free?' ss-free':'')+(extra?' '+extra:'')+'">'+(totals.byUnit?.strip.count?number(totals.byUnit.sheet[field])+' แผ่น<small style="display:block">ไม้แถบ '+number(totals.byUnit.strip[field])+' ชิ้น</small>':number(totals[field]))+'</td>';
  const stripEquivalent=(v,field)=>v.byUnit?.strip.count?`<small class="ss-strip-equivalent">ไม้แถบเทียบ ${number(v[field],2)} แผ่น</small>`:'';
  const equivalents=v=>`<td class="ss-num ss-equivalent">${number(v.eq4x8,2)}${stripEquivalent(v,'stripEq4x8')}</td><td class="ss-num ss-equivalent">${number(v.eq,2)}${stripEquivalent(v,'stripEq')}</td>`;
  function physicalEquivalentsHTML(m){
    if(!m?.total)return '';
    const v=m.total;
    return `<dl class="ss-physical-equivalents ss-physical-with-strips">${[['เทียบ 4×8 · ความหนาเดิม','eq4x8','stripEq4x8'],['เทียบ 4×8 · หนา 2.5 มม.','eq','stripEq']].map(([label,sheet,strip])=>`<div><dt>${label} · เฉพาะแผ่น</dt><dd>${number(v[sheet],2)} <small>แผ่น</small>${stripEquivalent(v,strip)}<span class="ss-combined-equivalent">รวมไม้แถบแล้ว <b>${number(v[sheet]+v[strip],2)}</b> แผ่นเทียบ</span></dd></div>`).join('')}</dl>`;
  }
  function groupTable(title,groups,label,total){
    const agingCells=v=>stockQuantityCell(v,'aging90',false,'ss-aging-mail')+stockQuantityCell(v,'aging180',false,'ss-aging-mail')+stockQuantityCell(v,'agingOver180',false,'ss-aging-mail ss-aging-over');
    const quantities=v=>stockQuantityCell(v,'qty')+stockQuantityCell(v,'committedQty')+stockQuantityCell(v,'reservedInStockQty',false,'ss-reserved-stock')+stockQuantityCell(v,'reservedProductionQty',false,'ss-reserved-production')+stockQuantityCell(v,'freeQty',true);
    return `<section class="ss-group"><div class="ss-group-heading"><h3>${title}</h3><small>Aging เมล = ยอดต้นฉบับก่อนโยก</small></div><div class="ss-group-scroll" role="region" tabindex="0" aria-label="${esc(title)} 12 คอลัมน์ เลื่อนแนวนอนได้"><table><caption class="ss-sr">${title} · Aging เมลจากต้นฉบับ · ยอดเทียบขนาดคำนวณจาก Physical</caption><thead><tr><th scope="col" rowspan="2">${label}</th><th scope="col" rowspan="2" class="ss-num">สเปก</th><th scope="col" rowspan="2" class="ss-num">Physical</th><th scope="col" rowspan="2" class="ss-num">จองรวม</th><th scope="col" rowspan="2" class="ss-num ss-reserved-stock">จองมีของ</th><th scope="col" rowspan="2" class="ss-num ss-reserved-production">จองต้องผลิตเพิ่ม</th><th scope="col" rowspan="2" class="ss-num">Free</th><th scope="colgroup" colspan="3" class="ss-num ss-aging-mail-group">Aging เมล</th><th scope="col" rowspan="2" class="ss-num ss-equivalent">เทียบ 4×8<br><small>หนาเดิม · เฉพาะแผ่น</small></th><th scope="col" rowspan="2" class="ss-num ss-equivalent">เทียบ 4×8<br><small>หนา 2.5 mm · เฉพาะแผ่น</small></th></tr><tr><th scope="col" class="ss-num ss-aging-mail">0–90</th><th scope="col" class="ss-num ss-aging-mail">91–180</th><th scope="col" class="ss-num ss-aging-mail ss-aging-over">&gt;180 วัน</th></tr></thead><tbody>${groups.map(([k,v])=>`<tr><th scope="row">${esc(k)}</th>${cell(v.count)}${quantities(v)}${agingCells(v)}${equivalents(v)}</tr>`).join('')}</tbody><tfoot><tr><th scope="row">รวม</th>${cell(total.count)}${quantities(total)}${agingCells(total)}${equivalents(total)}</tr><tr class="ss-combined-total"><th scope="row" colspan="10">รวมเทียบแผ่น · รวมไม้แถบแล้ว<small>รวมเฉพาะหน่วยเทียบเดียวกัน ไม่บวกชิ้นกับแผ่นจริง</small></th><td class="ss-num ss-equivalent">${number(total.eq4x8+total.stripEq4x8,2)}<small>แผ่นเทียบ 4×8</small></td><td class="ss-num ss-equivalent">${number(total.eq+total.stripEq,2)}<small>แผ่นเทียบ 4×8 @ 2.5</small></td></tr></tfoot></table></div></section>`;
  }
  function memo(r,key,title){return `<div><b>${title}</b><div class="ss-text">${esc(r[key]||'—')}</div>${r[key+'At']?`<small>${esc(r[key+'By']||'ไม่ระบุผู้บันทึก')} · ${esc(when(r[key+'At']))}</small>`:''}</div>`;}
  function provenance(r){
    if(r.rawSource)return `ยอดเมล ${number(r.baseQty)} · Aging: ${agingKeys.map((k,i)=>agingLabels[i]+' = '+number(r[k])).join(' / ')} ${r.unit==='strip'?'ชิ้นไม้แถบ':'แผ่น'}`;
    if(r.retained)return 'เก็บรายการสินค้าเดิม · ไม่พบในเมลวันนี้ · ยอดเมลและ Aging = 0 · ยังคงรหัส ราคา หมายเหตุและการติดตาม';
    return 'สเปกหลังโยก/ต้องผลิต — ไม่มี SKU หรือ Aging ของตัวเองในเมลต้นฉบับ';
  }
  // Existing report chart, kept dependency-free so it also renders in long PNG exports.
  const agingPalette=['#0072B2','#E69F00','#009E73','#D55E00','#CC79A7','#56B4E9','#F0E442','#000000','#6A3D9A','#1B9E77','#E31A1C','#A6761D','#1F78B4','#B15928','#33A02C','#7570B3'];
  function agingPanel(m){
    const t=m.total,mixed=t.byUnit?.strip.count>0;
    const cells=m.aging.map((n,i)=>{
      if(!mixed)return `<div><small>${agingLabels[i]}</small><b>${number(n)}</b><span>${t.agingBaseQty?number(n/t.agingBaseQty*100,1):'0'}%</span></div>`;
      const sheet=t.byUnit.sheet,strip=t.byUnit.strip,key=agingKeys[i];
      return `<div><small>${agingLabels[i]}</small><b>${number(sheet[key])}</b><span>แผ่น · ${sheet.agingBaseQty?number(sheet[key]/sheet.agingBaseQty*100,1):'0'}%</span><small>ไม้แถบ ${number(strip[key])} ชิ้น · ${strip.agingBaseQty?number(strip[key]/strip.agingBaseQty*100,1):'0'}%</small></div>`;
    }).join('');
    const basis=mixed?'ฐาน Aging เมลต้นฉบับแยกหน่วย '+stockQuantityText(t,'agingBaseQty'):'ฐาน Aging '+number(m.aging.reduce((a,b)=>a+b,0))+' / ยอดเมลต้นฉบับ '+number(t.agingBaseQty)+' หน่วย';
    return `<div class="ss-aging"><h3>Aging ตามรายงานเมลต้นฉบับ</h3><div class="ss-aging-grid">${cells}</div><p>${basis} · ไม่กระจายยอดปรับระหว่างวันเข้าอายุสินค้า · กราฟ Aging ไม่นับไม้แถบ</p>${agingChart(m)}</div>`;
  }
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
  const reportMoney=b=>{
    if(!b)return '—';
    const value=b.valueTHB??((b.coverage?.valuedSpecCount||b.coverage?.knownRowCount)?b.knownValueTHB:null);
    return value===null?'ยังระบุมูลค่าไม่ได้':'฿ '+number(value)+(b.coverage?.complete?'':' · เฉพาะที่มีราคา');
  };
  function priceCoverage(b,group=''){
    if(!b)return '';
    const specs=b.unpricedSpecs||[],fx=b.coverage?.missingFxSpecCount||0;
    if(window.AAFSalesPreview?.isReadOnly?.()===true&&specs.length)return `<details class="ss-price-gaps"><summary>ยังไม่มีราคา ${specs.length} สเปก${fx?' · ขาดเรท '+fx+' สเปก':''}</summary>${specs.map(r=>`<div class="ss-gap-spec"><span>${esc(thicknessLabel(r.t)+' '+r.grade+' · '+number(r.w)+' × '+number(r.l))}</span><b>${number(r.qty)} ${r.unit==='strip'?'ชิ้น':'แผ่น'}</b></div>`).join('')}<small>รอเจ้าของบันทึกราคา · ยังไม่รวมรายการนี้ในมูลค่า</small></details>`;
    if(!specs.length&&!fx)return b.coverage?.complete?'<small>ราคาครบทุกสเปกในกลุ่มนี้</small>':'<small>มูลค่ายังไม่ครบ · ไม่ตีรายการที่ไม่มีราคาเป็นศูนย์</small>';
    return `<details class="ss-price-gaps" data-stock-gap-group="${esc(group)}"><summary>ยังไม่มีราคา ${specs.length} สเปก${fx?' · ขาดเรท '+fx+' สเปก':''}</summary>${specs.map(r=>{
      const key=r.key||[r.t,r.grade,r.w,r.l,r.unit].join('|'),unit=r.unit==='strip'?'ชิ้น':'แผ่น';
      const label=thicknessLabel(r.t)+' '+r.grade+' · '+number(r.w)+' × '+number(r.l);
      return `<div class="ss-gap-editor" data-stock-price-row="${esc(key)}"><div class="ss-gap-spec"><span>${esc(label)}</span><b>${number(r.qty)} ${unit}</b></div><label><span>ราคาต่อ${unit}</span><input type="number" min="0" step="any" inputmode="decimal" placeholder="ใส่ราคา" data-stock-gap-price="${esc(key)}" aria-label="ราคา ${esc(label)} ต่อ${unit}" disabled></label><label><span>สกุลเงิน</span><select data-stock-gap-currency="${esc(key)}" aria-label="สกุลเงิน ${esc(label)}" disabled><option value="THB">บาท</option><option value="USD">USD</option></select></label></div>`;
    }).join('')}${specs.length?'<div class="ss-gap-actions"><button type="button" data-stock-gap-save disabled>เซฟราคาและหมายเหตุทั้งหมด</button><span data-stock-gap-status role="status">รอเชื่อมชุดราคาหัวข้อ 02</span></div><small>กรอกครั้งเดียว ใช้ราคาประเมินสต๊อกชุดเดียวกันทุกกล่อง · ยอดสรุปเปลี่ยนหลังเซฟสำเร็จ</small>':'<small>ยังไม่รวมในมูลค่า · รออัตราแลกเปลี่ยน</small>'}</details>`;
  }
  function soldLoadingBreakdown(summary){
    const sold=summary?.sold,p=summary?.partition;
    const valid=b=>b&&['sheet','strip'].every(unit=>typeof b[unit]==='number'&&Number.isFinite(b[unit])&&b[unit]>=0);
    const total=valid(sold?.byUnit)?sold.byUnit:null,loaded=valid(sold?.loaded?.byUnit)?sold.loaded.byUnit:null;
    const inStock=p?.status==='verified'&&valid(p.sold?.inStock?.byUnit)?p.sold.inStock.byUnit:null;
    const toProduce=p?.status==='verified'&&valid(p.sold?.toProduce?.byUnit)?p.sold.toProduce.byUnit:null;
    const units=['sheet','strip'],epsilon=0.000001;
    const remaining=total&&loaded&&units.every(unit=>total[unit]>=loaded[unit])?Object.fromEntries(units.map(unit=>[unit,Number((total[unit]-loaded[unit]).toFixed(6))])):null;
    const reconciled=!!(remaining&&inStock&&toProduce&&units.every(unit=>Math.abs(remaining[unit]-inStock[unit]-toProduce[unit])<epsilon));
    const reason=!remaining?'ยังตรวจยอดรอโหลดไม่ได้ · รอยอดขายทั้งหมดและยอดโหลดที่ถูกต้อง':!inStock||!toProduce?'รอยืนยันส่วนมีของในสต๊อกและต้องผลิตเพิ่ม':!reconciled?'ยอดแยกยังไม่ตรงกับยอดรอโหลด · กรุณาตรวจข้อมูลจัดสรร':'';
    return {loaded,remaining,inStock,toProduce,reconciled,reason};
  }
  function soldLoadingHTML(summary){
    const b=soldLoadingBreakdown(summary);
    return `<div class="ss-sold-quantity-split ss-sold-loading-breakdown" aria-label="ยอดขายแยกการโหลด"><div class="ss-loaded-total"><span>โหลดออกแล้ว</span><b>${quantityText(b.loaded)}</b></div><section class="ss-awaiting-load" aria-label="เหลือรอโหลดและส่วนประกอบ"><div class="ss-awaiting-total"><span>เหลือรอโหลด</span><b>${quantityText(b.remaining)}</b></div><small>ยอดขายทั้งหมด − โหลดออกแล้ว</small><div class="ss-awaiting-subsets"><small>แยกจากยอดเหลือรอโหลด</small><div><span>มีของในสต๊อก</span><b>${quantityText(b.inStock)}</b></div><div><span>ต้องผลิตเพิ่ม</span><b>${quantityText(b.toProduce)}</b></div></div>${b.reconciled?'<small class="ss-loading-equation">มีของ + ต้องผลิต = เหลือรอโหลด</small>':`<small class="ss-loading-warning" role="alert">${esc(b.reason)}</small>`}</section></div>`;
  }
  // Commercial money comes only from actual sale rows, never the stock catalog.
  // The pending bucket is not total sales minus an estimated stock valuation.
  const validSaleMoney=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
  const nearSaleMoney=(a,b)=>validSaleMoney(a)&&validSaleMoney(b)&&Math.abs(a-b)<=Math.max(.005,Math.max(a,b)*1e-10);
  function soldSettlementState(sold){
    const s=sold?.settlement,byCurrency=s?.byCurrency||{},sales=sold?.byCurrency||{};
    const codes=['THB','USD'].filter(code=>Object.hasOwn(sales,code)||Object.hasOwn(byCurrency,code));
    const currencies=codes.map(code=>{
      const b=byCurrency[code],valid=b&&['sales','received','outstanding','unallocated'].every(k=>validSaleMoney(b[k]));
      const matchesSales=!!(valid&&nearSaleMoney(b.sales,sales[code]));
      return {code,b,matchesSales,reconciled:!!(matchesSales&&nearSaleMoney(b.sales,b.received+b.outstanding+b.unallocated))};
    });
    const unsupported=[...Object.keys(sales),...Object.keys(byCurrency)].some(code=>!['THB','USD'].includes(code));
    const reconciled=!!(s&&currencies.length&&!unsupported&&currencies.every(c=>c.reconciled));
    const totalsValid=s&&['knownReceivedTHB','knownOutstandingTHB','unallocatedTHB'].every(k=>validSaleMoney(s[k]));
    const equivalentReconciled=!!(totalsValid&&nearSaleMoney(sold?.valueTHB,s.knownReceivedTHB+s.knownOutstandingTHB+s.unallocatedTHB));
    const complete=!!(s?.complete===true&&sold?.coverage?.complete===true&&reconciled&&equivalentReconciled&&currencies.every(c=>c.b.unallocated===0)&&s.unallocatedTHB===0);
    return {s,currencies,reconciled,complete};
  }
  function soldSettlementHTML(sold){
    const state=soldSettlementState(sold),{s,complete}=state;
    const hasCount=(c,kind)=>[kind+'OrderCount',kind+'RowCount'].some(k=>typeof c?.[k]==='number'&&Number.isFinite(c[k])&&c[k]>0);
    // Partial zero is not evidence of no receipts. It needs explicit coverage;
    // never infer cash received from a paid/loaded status or a remaining balance.
    const known=(value,kind,c)=>validSaleMoney(value)&&(value>0||complete||hasCount(c,kind));
    const native=(field,kind)=>state.currencies.filter(({b})=>known(b?.[field],kind,b?.coverage)).map(({code,b})=>`${code} ${number(b[field])}`).join(' · ');
    const amount=(field,kind)=>known(s?.[field],kind,s?.coverage)?'฿ '+number(s[field])+(complete?'':' · ยอดที่ยืนยันได้บางส่วน'):'ยังยืนยันไม่ได้';
    const row=(field,kind,title)=>{const source=native(kind,kind);return `<div class="ss-settlement-${kind}"><span>${title}</span><b>${amount(field,kind)}</b>${source?`<small>ต้นทาง ${source}${complete?'':' · เฉพาะยอดที่ยืนยันได้'}</small>`:''}</div>`;};
    const unallocatedNative=native('unallocated','unallocated'),unallocated=validSaleMoney(s?.unallocatedTHB)&&s.unallocatedTHB>0?'฿ '+number(s.unallocatedTHB):'ยังระบุยอดไม่ได้';
    const hasUnallocated=state.currencies.some(({b})=>validSaleMoney(b?.unallocated)&&b.unallocated>0);
    const unknown=!complete&&(!state.reconciled||hasUnallocated)?`<div class="ss-settlement-unallocated"><span>ยอดขายที่ยังแยกรับแล้ว / รอรับไม่ได้</span><b>${unallocated}</b>${unallocatedNative?`<small>ต้นทาง ${unallocatedNative}</small>`:''}<small>ยังไม่ใช่ยอดค้างรับที่ยืนยันแล้ว · ไม่ถือว่ารับครบหรือใช้ 0 แทน</small></div>`:'';
    const warning=!s?'ยังไม่มีหลักฐานรับเงินที่ตรงกับชุดยอดขายนี้':!state.reconciled?'หลักฐานมูลค่ายังตรวจยอดรวมไม่ครบหรือไม่ตรงกัน · ยังไม่ยืนยันยอดรับเงินครบ':!complete?'หลักฐานรับเงินยังไม่ครบทุกออเดอร์ · แสดงเฉพาะส่วนที่ยืนยันได้':'';
    const equation=state.reconciled?`<small class="ss-settlement-equation">${complete?'มูลค่าการขาย = รับเงินแล้ว + เหลือรอรับเงิน':'เฉพาะมูลค่าที่มีหลักฐาน: รับแล้ว + รอรับ + ยังไม่ยืนยันการรับเงิน = มูลค่าการขาย'}</small>`:'';
    const reasons={
      'domestic-vat-basis-unconfirmed':'ยอดในประเทศยังไม่ยืนยันฐาน VAT',
      'ambiguous-current-cash-details':'รายละเอียดรับเงินปัจจุบันยังไม่ชัดเจน',
      'current-cash-details-missing':'ยังไม่มีรายละเอียดรับเงินปัจจุบัน',
      'goods-only-excludes-document-adjustments':'มูลค่าสินค้าไม่รวมค่าธรรมเนียมหรือรายการปรับในเอกสาร',
      'master-contract-cash-allocation-unconfirmed':'ยังยืนยันการแบ่งยอดรับเงินจากสัญญา / Invoice หลักมาออเดอร์นี้ไม่ได้',
      'lc-obtained-is-not-cash-settlement':'การได้ LC ยังไม่ใช่หลักฐานรับเงินสด',
      'received-date-in-future':'วันรับเงินอยู่ในอนาคต ต้องตรวจหลักฐาน',
      'receipt-date-disagrees-between-current-sources':'วันที่รับเงินจากต้นทางปัจจุบันไม่ตรงกัน',
      'deposit-allocation-or-invoice-basis-unconfirmed':'ยังไม่ยืนยันการจัดสรรมัดจำหรือฐานยอด Invoice',
      'deposit-history-unconfirmed':'ประวัติมัดจำยังไม่ยืนยัน',
      'received-date-unconfirmed-not-invented':'ยังไม่ยืนยันวันรับเงิน จึงไม่ใส่วันที่เอง',
      'old-source-receipt-year-retained':'คงปีรับเงินตามต้นทางเดิมไว้ รอตรวจยืนยัน',
      'source-payment-note-review':'ต้องตรวจหมายเหตุการรับเงินต้นทาง',
      'remaining-cash-receivable-unconfirmed':'ยังไม่ยืนยันยอดเงินที่เหลือรอรับ',
      'receipt-or-net-outstanding-amount-unconfirmed':'ยังไม่ยืนยันยอดรับแล้วหรือยอดคงค้างสุทธิ'
    };
    const unconfirmedOrders=(Array.isArray(s?.orders)?s.orders:[]).filter(o=>o&&typeof o==='object'&&validSaleMoney(o.unconfirmedAmount)&&o.unconfirmedAmount>0);
    const details=unconfirmedOrders.length?`<details class="ss-settlement-details" data-stock-gap-group="sold-settlement-unknown"><summary>ดูรายการรับเงินที่ยังไม่ยืนยัน · ${number(unconfirmedOrders.length)} ออเดอร์</summary>${unconfirmedOrders.map(o=>{
      const explanation=[...new Set((Array.isArray(o.reasons)?o.reasons:[]).map(reason=>Object.hasOwn(reasons,reason)?reasons[reason]:'รอตรวจหลักฐานการรับเงินของออเดอร์นี้'))];
      const value=validSaleMoney(o.unconfirmedAmount)&&o.unconfirmedAmount>0&&['THB','USD'].includes(o.currency)?o.currency+' '+number(o.unconfirmedAmount):'ยังระบุยอดไม่ได้';
      return `<div><b>${esc(o.ref||o.orderKey||'ไม่ระบุเลขใบขาย')}</b>${o.customer?`<span>${esc(o.customer)}</span>`:''}<span>ส่วนที่ยังไม่ยืนยัน: ${value}</span><small>${esc(explanation.length?explanation.join(' · '):'รอตรวจหลักฐานการรับเงินของออเดอร์นี้')}</small></div>`;
    }).join('')}</details>`:'';
    const basis=s?.valueBasis==='product-line-sale-value'?'รับแล้ว / รอรับตามบันทึก Sales เฉพาะส่วนมูลค่าสินค้า · ไม่ใช่การยืนยันยอดเงินเข้าบัญชีธนาคาร':'รับแล้ว / รอรับอิงหลักฐานจาก Sales · ไม่ใช่การยืนยันยอดเงินเข้าบัญชีธนาคาร';
    return `<div class="ss-sales-settlement" aria-label="การรับเงินของยอดขาย"><small>แยกตามหลักฐานการรับเงิน · ไม่อิงสถานะโหลด</small>${row('knownReceivedTHB','received','รับเงินแล้ว')}${row('knownOutstandingTHB','outstanding','เหลือรอรับเงิน')}${unknown}${equation}${warning?`<small class="ss-sales-value-warning" role="status">${warning}</small>`:''}${details}<small class="ss-settlement-basis">${basis}</small></div>`;
  }
  function soldSalesValuesHTML(summary){
    const breakdown=soldLoadingBreakdown(summary),pending=summary?.sold?.paidUnloaded;
    const validPending=breakdown.remaining&&pending?.byUnit&&['sheet','strip'].every(unit=>typeof pending.byUnit[unit]==='number'&&Number.isFinite(pending.byUnit[unit])&&Math.abs(pending.byUnit[unit]-breakdown.remaining[unit])<0.000001);
    const money=b=>{
      const value=validSaleMoney(b?.valueTHB)?b.valueTHB:b?.coverage?.knownRowCount>0&&validSaleMoney(b?.knownValueTHB)?b.knownValueTHB:null;
      return value===null?'ยังระบุมูลค่าไม่ได้':'฿ '+number(value)+(b?.coverage?.complete?'':' · ยอดที่ยืนยันได้บางส่วน');
    };
    const coverage=b=>{
      if(!b)return '<small class="ss-sales-value-warning">รอข้อมูลราคาขายจริง · ไม่ใช้ราคาสต๊อกแทน</small>';
      const c=b.coverage||{},issues=[];
      if(c.unknownRowCount>0)issues.push('รอราคาขายหรือสกุลเงิน '+number(c.unknownRowCount)+' รายการ');
      if(c.missingFxRowCount>0)issues.push('รออัตราแลกเปลี่ยน '+number(c.missingFxRowCount)+' รายการ');
      if(!c.complete&&!issues.length)issues.push('มูลค่ายังไม่ครบ · รอข้อมูลราคาขาย');
      const sourceCurrencies=c.missingFxRowCount>0?Object.entries(b.byCurrency||{}).filter(([code,value])=>code!=='THB'&&typeof value==='number'&&Number.isFinite(value)&&value>=0).map(([code,value])=>esc(code)+' '+number(value)).join(' · '):'';
      return issues.length?`<small class="ss-sales-value-warning">${issues.join(' · ')} · ไม่ตีเป็นศูนย์</small>${sourceCurrencies?`<small>ยอดต้นทางที่ยังแปลงไม่ครบ: ${sourceCurrencies}</small>`:''}`:'<small>มูลค่าตามราคาขายจริงครบกลุ่มนี้</small>';
    };
    const native=['THB','USD'].filter(code=>validSaleMoney(summary?.sold?.byCurrency?.[code])).map(code=>`<span>${code} ${number(summary.sold.byCurrency[code])}</span>`).join('');
    const fx=validSaleMoney(summary?.sold?.byCurrency?.USD)&&summary.sold.byCurrency.USD>0?'<small class="ss-sales-fx-basis">ยอดรวมบาทรวม USD ที่แปลงด้วยเรทอ้างอิง · เป็นยอดเทียบ ไม่ใช่ยอดเงินบาทที่ธนาคารรับจริง</small>':'';
    const goodsBasis=summary?.sold?.settlement?.valueBasis==='product-line-sale-value'?'<small class="ss-sales-goods-basis">ฐานมูลค่าสินค้า: ราคาขายจริง × จำนวน ก่อนค่าธรรมเนียม / ค่าใช้จ่ายที่ไม่ใช่สินค้าและใบลดหนี้ · ยอดในประเทศยังไม่ยืนยันฐาน VAT</small>':'';
    return `<div class="ss-sold-sales-values" aria-label="มูลค่าการขายจากราคาขายจริง"><div class="ss-sales-total-value"><span>มูลค่าการขาย</span><b>${money(summary?.sold)}</b>${native?`<div class="ss-sales-native" aria-label="มูลค่าการขายแยกสกุลเงินต้นทาง">${native}</div>`:''}${coverage(summary?.sold)}${fx}</div>${soldSettlementHTML(summary?.sold)}<details class="ss-sales-pending-value" data-stock-gap-group="sold-waiting-value"><summary>มูลค่ารอโหลด · ${quantityText(breakdown.remaining)}</summary><b>${money(validPending?pending:null)}</b>${validPending?coverage(pending):'<small class="ss-sales-value-warning">รอตรวจยอดขายรอโหลดให้ตรงกับยอดขายทั้งหมด − โหลดออกแล้ว</small>'}<small>ส่วนหนึ่งของยอดขายรวม · รวมมีของและต้องผลิตเพิ่ม · ไม่ใช่ยอดเงินรอรับ</small></details>${goodsBasis}<small class="ss-sales-value-basis">ราคาขายจริงรายออเดอร์ · ไม่ใช่มูลค่าสต๊อกหรือยอดเงินรับจริง</small></div>`;
  }
  function partitionKpiHTML(summary,m){
    const p=summary.partition,verified=p?.status==='verified',firmOnly=p?.reservationPolicy==='aaf-firm-only-20261003-v1';
    const equivalents=b=>`<dl class="ss-physical-equivalents"><div><dt>เทียบ 4×8 · ความหนาเดิม</dt><dd>${display(b?.eq4x8)} <small>แผ่น</small></dd></div><div><dt>เทียบ 4×8 · หนา 2.5 มม.</dt><dd>${display(b?.eq2_5)} <small>แผ่น</small></dd></div></dl>`;
    const production=(b,group,stockValuation=true)=>{
      const specs=b?.productionSpecs||[];
      const details=specs.length?`<details class="ss-production-details"><summary>ดูรายการต้องผลิต · ${specs.length} สเปก</summary><table><thead><tr><th>หนา (มม.)</th><th>เกรด</th><th>ขนาด (มม.)</th><th>จำนวน</th></tr></thead><tbody>${specs.map(r=>`<tr><td>${esc(thicknessLabel(r.t))}</td><td>${esc(r.grade)}</td><td>${number(r.w)} × ${number(r.l)}</td><td>${number(r.qty)} ${r.unit==='strip'?'ชิ้น':'แผ่น'}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="3">รวมต้องผลิต</th><td>${quantityText(b.byUnit)}</td></tr></tfoot></table></details>`:'';
      return `<div class="ss-outside-stock"><span>ต้องผลิตเพิ่ม · นอกสต๊อกจริง</span><b>${quantityText(b?.byUnit)}</b>${stockValuation?`<div>${reportMoney(b)}</div>`:''}${details}${stockValuation?priceCoverage(b,group):''}</div>`;
    };
    const definitions=[['physical','สต๊อกจริง · Physical','ทั้งหมดในโรงงาน',summary.physical],['sold','ขายแล้วทั้งหมด','ขายแล้วตามชุดใบขาย · ไม่ขึ้นกับการรับเงิน',summary.sold],['reserved','ยอดจองอื่น · มีของรองรับ',firmOnly?'PI / มีเรือ · ไม่รวมขายแล้ว':'PI / มีเรือ / เจรจา / Forecast · ไม่รวมขายแล้ว',verified?p.reserved.inStock:null],['free','พร้อมขาย · Free','มีในสต๊อก · ยังไม่ถูกจัดสรร',summary.free]];
    const cards=definitions.map(([id,label,note,b])=>{
      const units=(id==='sold'?summary.sold:b)?.byUnit;
      let detail='';
      if(id==='physical'&&verified)detail=`<div class="ss-stock-equation"><b>สต๊อกจริง = ขายแล้วที่มีของ + จองอื่นที่มีของ + Free</b><span>ตรวจยอดตรงกัน · ใช้ราคาสต๊อกที่เซฟชุดเดียวกัน</span><small>ไม่รวมของที่ต้องผลิตเพิ่ม หรือที่โหลดออกแล้ว</small></div>`;
      if(id==='sold')detail=production(verified?p.sold.toProduce:null,'sold-production',false);
      if(id==='reserved')detail=production(verified?p.reserved.toProduce:null,'reserved-production')+`<small class="ss-demand-note">ยอดสั่งจองอื่นทั้งหมด ${quantityText(verified?p.reserved.demand.byUnit:null)} · รวมส่วนต้องผลิต</small>`;
      const stages=[['pi','เปิด PI แล้ว'],['vessel','มีเรือแล้ว'],['negotiate','เจรจา'],['forecast','Forecast']].filter(([status])=>!firmOnly||!['negotiate','forecast'].includes(status));
      if(verified&&Object.values(p.reserved.byStatus?.unknown?.inStock?.byUnit||{}).some(q=>q>0))stages.push(['unknown','สถานะอื่น / ยังไม่ระบุ']);
      const reservationSplit=`<div class="ss-sold-quantity-split"><small>แยกเฉพาะที่มีของรองรับ</small>${stages.map(([status,title])=>`<div><span>${title}</span><b>${quantityText(verified?p.reserved.byStatus?.[status]?.inStock?.byUnit:null)}</b></div>`).join('')}</div><div class="ss-sold-equivalents">${equivalents(b)}</div>`;
      const split=id==='sold'?`${soldLoadingHTML(summary)}<div class="ss-sold-equivalents">${equivalents(summary.sold)}</div>`:id==='reserved'?reservationSplit:id==='physical'&&m?.total?physicalEquivalentsHTML(m):equivalents(b);
      const value=id==='sold'?'':`<div class="ss-kpi-value"><span>${id==='physical'?'มูลค่าสต๊อกจริงทั้งหมด':'มูลค่าส่วนที่อยู่ในสต๊อกจริง'}</span><b>${reportMoney(b)}</b>${priceCoverage(b,id+'-stock')}</div>`;
      return `<div class="ss-kpi ss-kpi-${id}"><div class="ss-physical-main"><h3>${label}</h3><strong>${display(units?.sheet)}</strong><small>แผ่น · ${note}</small>${units?.strip?`<div class="ss-strip-quantity">ไม้แถบ <b>${number(units.strip)}</b> ชิ้น</div>`:''}${id==='sold'?soldSalesValuesHTML(summary):''}</div>${split}${value}${detail}</div>`;
    }).join('');
    return cards+(!verified?`<p class="ss-partition-error" role="alert">${esc(p?.reason||'รอตรวจข้อมูลจัดสรรจากหัวข้อ 02')} · ยังไม่รวมยอดแยกกลุ่ม</p>`:'');
  }
  // Basic stock has its own authenticated read. A pending sales allocation must
  // not hide these saved quantities or turn them into a fabricated sales report.
  function basicStockKpis(m){
    if(!m?.rows?.length||m.rows.some(r=>!['sheet','strip'].includes(r.unit)))return '';
    const bucket=field=>{
      const b={byUnit:{sheet:0,strip:0},eq4x8:0,eq2_5:0};
      for(const r of m.rows){const qty=r[field];if(typeof qty!=='number'||!Number.isFinite(qty)||qty<0)return null;b.byUnit[r.unit]+=qty;if(r.unit==='sheet'){const area=Number(r.w)*Number(r.l)/standardArea;b.eq4x8+=qty*area;b.eq2_5+=qty*area*Number(r.t)/2.5;}}
      return b;
    };
    const cards=[['physical','สต๊อกจริง · Physical',bucket('qty')],['sold','ขายแล้วทั้งหมด',null],['reserved','ยอดจองที่บันทึกไว้',bucket('committedQty')],['free','Free ที่บันทึกไว้',bucket('freeQty')]];
    return cards.map(([id,label,b])=>`<div class="ss-kpi ss-kpi-${id}" data-basic-stock="${id}"><div class="ss-physical-main"><h3>${label}</h3><strong>${display(b?.byUnit.sheet)}</strong><small>${b?'แผ่น · ข้อมูลส่วนกลางที่บันทึกแล้ว':'รอชุดยอดขายที่ตรวจตรงกับสต๊อก'}</small>${b?`<div class="ss-strip-quantity">ไม้แถบ <b>${number(b.byUnit.strip)}</b> ชิ้น</div>`:''}</div>${id==='physical'&&m?.total?physicalEquivalentsHTML(m):b?`<dl class="ss-physical-equivalents"><div><dt>เฉพาะแผ่น · เทียบ 4×8</dt><dd>${display(b.eq4x8)} <small>แผ่น</small></dd></div><div><dt>เฉพาะแผ่น · เทียบ 2.5 มม.</dt><dd>${display(b.eq2_5)} <small>แผ่น</small></dd></div></dl>`:''}<div class="ss-kpi-value"><span>${id==='sold'?'มูลค่าการขาย':'มูลค่าสต๊อก'}</span>${id==='physical'?savedPhysicalValueHTML(m):`<b>—</b><small>${id==='sold'?'รอราคาขายจริงและข้อมูลจัดสรร':'รอยืนยันชุดราคาสต๊อก · ไม่ใช้ราคาขายหรือศูนย์แทน'}</small>`}</div>${['reserved','free'].includes(id)?'<small class="ss-demand-note">ยอดตามที่บันทึกไว้ · ยังไม่ยืนยันกับยอดขายล่าสุด ไม่ใช่การตัดสต๊อกรอบใหม่</small>':''}</div>`).join('');
  }
  function summarySourceText(summary,m){
    if(summary){
      const e=summary.evidence,dated=e?.version===1&&e.stockReportDate===m?.reportDate&&/^\d{4}-\d{2}-\d{2}$/.test(e.salesReportDate||'')&&e.sourceIsLive===false;
      const source=dated?'สต๊อก '+e.stockReportDate+' · '+(e.financialEvidence==='unavailable-plan-only'?'จำนวน/สถานะขายจากชุดที่บันทึก ':'ยอดขาย/รับเงินตามหลักฐาน ')+e.salesReportDate+(e.salesCapturedAt?' (อ่านต้นทาง '+when(e.salesCapturedAt)+')':'')+' · จัดสรรใหม่กับสต๊อกปัจจุบัน · '+(e.needsSalesRefresh?'ยังไม่ได้อ่านยอดขายใหม่จากหน้า 09':'เป็นชุดยอดขายที่บันทึกไว้ ไม่ใช่ข้อมูลสด')+' · '+(e.financialEvidence==='unavailable-plan-only'?'ยังไม่มีราคาขาย/ยอดรับเงินที่ตรงกับชุดนี้ '+number(e.financialMissingLineCount)+' รายการ · ไม่ใช้เงินชุดเก่าหรือ 0 แทน · ':''):'';
      return source+(summary.catalog?.automaticFx?'ราคาสต๊อกที่เซฟแล้ว + เรท ธปท. อัตโนมัติ':'ใช้ราคาและเรทที่เซฟแล้ว')+' · มูลค่าการขายใช้ราคาขายจริง ไม่ใช่ราคาสต๊อก · ยอดเทียบหลักเฉพาะแผ่น · ไม้แถบแสดงแยกและรวมในแถวรวมไม้แถบแล้ว';
    }
    const status=window.AAFSalesPreview?.getReportLoadStatus?.();
    return 'แสดงสต๊อกส่วนกลางตามรายงาน '+reportDay(m?.reportDate)+(m?.savedCatalog?' · ราคาประเมินจากชุดที่บันทึกตามสเปก แยกจากยอดขาย':' · กำลังตรวจชุดราคาที่บันทึก')+' · ยอดขายและมูลค่าการขายยังรอตรวจชุดข้อมูล'+(status?.message?' · '+status.message:'');
  }
  function kpiHTML(summary,m){
    if(!summary){const basic=basicStockKpis(m);if(basic)return basic;}
    if(summary?.version>=2)return partitionKpiHTML(summary,m);
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
      return `<div class="ss-kpi ss-kpi-${id}"><div class="ss-physical-main"><h3>${label}</h3><strong>${display(units?.sheet)}</strong><small>${b?'แผ่น · '+note:'รอข้อมูลหัวข้อ 02'}</small>${units?.strip?`<div class="ss-strip-quantity">ไม้แถบ <b>${number(units.strip)}</b> ชิ้น</div>`:''}</div>${id==='physical'&&m?.total?physicalEquivalentsHTML(m):`<dl class="ss-physical-equivalents"><div><dt>เทียบ 4×8 · ความหนาเดิม</dt><dd>${display(b?.eq4x8)} <small>แผ่น</small></dd></div><div><dt>เทียบ 4×8 · หนา 2.5 มม.</dt><dd>${display(b?.eq2_5)} <small>แผ่น</small></dd></div></dl>`}${split}<div class="ss-kpi-value"><span>${moneyLabel}${partial}</span><b>${money===null?'—':'฿ '+number(money)}</b>${b&&!complete?'<small>มูลค่ายังไม่ครบ · ไม่ตีรายการที่ไม่มีราคาเป็นศูนย์</small>':''}</div></div>`;
    }).join('');
  }
  function setSalesSummary(summary){
    if(latest)latest={...latest,salesSummary:summary};
    const cards=root?.querySelector('.ss-kpis');if(cards){
      const opened=new Set([...cards.querySelectorAll('[data-stock-gap-group]')].filter(node=>node.open).map(node=>node.dataset.stockGapGroup));
      cards.innerHTML=kpiHTML(summary,latest);
      cards.querySelectorAll('[data-stock-gap-group]').forEach(node=>{node.open=opened.has(node.dataset.stockGapGroup);});
    }
    paintExchangeRate();
    const status=root?.querySelector('.ss-sales-summary-source');if(status)status.textContent=summarySourceText(summary,latest);
    syncPriceDrafts();
  }
  function syncPriceDrafts(){
    if(!root)return;
    const bridge=window.AAFSalesPreview,state=bridge?.getPriceState?.(),saveStatus=bridge?.getSaveStatus?.();
    const blocked=!state||state.readOnly||state.loading||state.loadFailed||state.saving||saveStatus?.blocked;
    const exactKey=key=>{const [t,g,w,l,u]=String(key).split('|');return [Number(t),g,...[Number(w),Number(l)].sort((a,b)=>a-b),u].join('|');};
    root.querySelectorAll('[data-stock-price-row]').forEach(row=>{
      const draft=bridge?.getDraftPrice?.(row.dataset.stockPriceRow),input=row.querySelector('[data-stock-gap-price]'),select=row.querySelector('[data-stock-gap-currency]');
      input.disabled=select.disabled=!!(blocked||!draft);
      if(Array.isArray(state?.invalidKeys))input.setAttribute('aria-invalid',String(state.invalidKeys.some(key=>exactKey(key)===exactKey(row.dataset.stockPriceRow))));
      if(draft&&input!==document.activeElement)input.value=draft.value??'';
      if(draft&&select!==document.activeElement)select.value=draft.currency;
    });
    const invalid=!!state?.invalidKeys?.length||[...root.querySelectorAll('[data-stock-gap-price]')].some(input=>input.validity?.badInput||input.getAttribute('aria-invalid')==='true');
    const saveError=state?.error||saveStatus?.error;
    const status=blocked?(state?.saving?'กำลังเซฟ…':saveError||'รอเชื่อมชุดราคาหัวข้อ 02'):invalid?'ตรวจราคาให้มากกว่า 0 หรือเว้นว่าง':saveError||(state.dirty?'แก้ไขแล้ว · ยังไม่เซฟ':'ใช้ราคาประเมินสต๊อกชุดเดียวกันทุกกล่อง');
    root.querySelectorAll('[data-stock-gap-save]').forEach(button=>{button.disabled=!!(blocked||invalid||!state?.dirty);button.textContent=state?.saving?'กำลังเซฟ…':'เซฟราคาและหมายเหตุทั้งหมด';});
    root.querySelectorAll('[data-stock-gap-status]').forEach(node=>{node.textContent=status;});
  }
  function editGapPrice(event){
    const target=event.target,isPrice=target.matches?.('[data-stock-gap-price]'),isCurrency=target.matches?.('[data-stock-gap-currency]');
    if(!isPrice&&!isCurrency)return;
    if((isPrice&&event.type!=='input')||(isCurrency&&event.type!=='change'))return;
    const row=target.closest('[data-stock-price-row]'),input=row.querySelector('[data-stock-gap-price]'),select=row.querySelector('[data-stock-gap-currency]');
    const bad=input.validity?.badInput;
    const accepted=window.AAFSalesPreview?.setDraftPrice?.(row.dataset.stockPriceRow,bad?'invalid':input.value,select.value)===true;
    input.setAttribute('aria-invalid',String(!accepted));
    syncPriceDrafts();
  }
  async function saveGapPrices(event){
    if(!event.target.closest?.('[data-stock-gap-save]'))return;
    if([...root.querySelectorAll('[data-stock-gap-price]')].some(input=>input.validity?.badInput||input.getAttribute('aria-invalid')==='true')){syncPriceDrafts();return;}
    try{await window.AAFSalesPreview?.savePrices?.();}finally{syncPriceDrafts();}
  }
  root?.addEventListener('input',editGapPrice);root?.addEventListener('change',editGapPrice);root?.addEventListener('click',saveGapPrices);
  function html(m){
    const t=m.total,overrides=m.rows.filter(r=>r.physicalAt||r.freeAt).length,followed=m.rows.filter(r=>String(r.followup).trim()).length;
    let index=0;
    return `<article class="ss-sheet">
      <header class="ss-hero"><div><div class="ss-eyebrow">AAF / STOCK & SALES FOLLOW-UP</div><h2>รายงานสต๊อกและติดตามการขาย</h2><p>อ้างอิงรายงานเมล ${esc(reportDay(m.reportDate))}</p></div><div class="ss-hero-meta"><div class="ss-stamp">ข้อมูลที่บันทึกแล้ว<br><b>ครบ ${number(m.rows.length)} สเปก</b><br>ทุกเกรด · ทุกขนาด</div><div class="ss-exchange"><span>อัตราแลกเปลี่ยน USD → บาท</span><b>${exchangeRateDisplay(m.salesSummary,m.headerExchangeRate).rate===null?'—':number(exchangeRateDisplay(m.salesSummary,m.headerExchangeRate).rate,4)}</b><small>${esc(exchangeRateDisplay(m.salesSummary,m.headerExchangeRate).status)}</small></div></div></header>
      <div class="ss-content"><div class="ss-context"><span>ข้อมูลส่วนกลางล่าสุด <b>${esc(when(m.updatedAt))}</b></span><span>เวลาไทย (UTC+7) · ภาพรวมทั้งชุด ไม่ใช้ตัวกรองในหน้าสต๊อก</span></div>
      <p class="ss-sales-summary-source" role="status">${esc(summarySourceText(m.salesSummary,m))}</p>
      <div class="ss-kpis">${kpiHTML(m.salesSummary,m)}</div>
      <div class="ss-section-title"><span>01</span><h3>ภาพรวมแยกเกรดและความหนา</h3></div>
      <p class="ss-help ss-reservation-help">จองรวม = จองมีของ + จองต้องผลิตเพิ่ม · Physical − จองมีของ = Free · แยกคำนวณรายสเปกก่อนรวม ไม่เอาของคนละสเปกหักกัน${m.rows.some(r=>r.freeReconciliationException)?'<br><strong class="ss-manual">มีค่า Free ที่บันทึกไว้ต่างจากสูตรในบางสเปก · คงค่าที่บันทึกไว้ ไม่ล้างค่าปรับเอง</strong>':''}<br>เทียบ 4×8 ใช้ขนาด 1,220 × 2,440 มม. · เทียบหนา 2.5 เพิ่มสัดส่วนความหนา ÷ 2.5 · ไม้แถบเป็นยอดเทียบเพื่อแสดงผล ไม่ใช่การเพิ่มแผ่นจริง</p>
      <div class="ss-groups">${groupTable('แยกตามเกรด',m.grades,'เกรด',t)}${groupTable('แยกตามความหนา',m.thickness.filter(([,totals])=>totals.qty>0||totals.committedQty>0||totals.freeQty>0).map(([thick,totals])=>[thicknessLabel(thick),totals]),'หนา (mm)',t)}</div>
      ${agingPanel(m)}
      <section class="ss-sales-block" data-html2canvas-ignore><div class="ss-section-title"><span>02</span><h3>ยอดขายและสต๊อก</h3></div><div id="stock-sales-preview-slot"></div></section>
      <div class="ss-section-title"><span>03</span><h3>รายละเอียดครบทุกสเปก</h3><small>ปรับเอง ${number(overrides)} สเปก · มีติดตาม ${number(followed)} สเปก</small></div>
      <p class="ss-help">เรียงความหนา → กว้าง → ยาว → เกรด • แสดง SKU, อายุสินค้า, ข้อความติดตาม และหมายเหตุครบ ไม่ตัดข้อความ</p>
      ${m.thickness.map(([thick,totals])=>`<section class="ss-detail-group"><div class="ss-band"><h4>ความหนา ${esc(thick)} mm</h4><span>${totals.count} สเปก · Physical ${stockQuantityText(totals,'qty')} · Free ${stockQuantityText(totals,'freeQty')}</span></div><table class="ss-detail"><caption class="ss-sr">รายละเอียดความหนา ${esc(thick)} mm</caption><colgroup><col style="width:4%"><col style="width:18%"><col style="width:6%"><col style="width:11%"><col style="width:9%"><col style="width:11%"><col style="width:10%"><col style="width:10%"><col style="width:11%"><col style="width:10%"></colgroup><thead><tr><th>#</th><th>กว้าง × ยาว × หนา<br><small>หน่วย mm</small></th><th>เกรด</th><th class="ss-num">Physical</th><th class="ss-num">ยอดจอง</th><th class="ss-num">Free</th><th class="ss-num">เทียบ 2.5</th><th class="ss-num">ราคา/หน่วย</th><th class="ss-num">มูลค่า (฿)</th><th class="ss-num">Free (฿)</th></tr></thead><tbody>${m.rows.filter(r=>String(Number(r.t))===thick).map(r=>`<tr class="ss-stock-row" data-stock-row-key="${esc(r.key)}"><td>${++index}</td><th>${number(r.w,3)} × ${number(r.l,3)} × ${number(r.t,3)}</th><td><b class="ss-grade">${esc(r.grade)}</b></td>${cell(r.qty)}${cell(r.committedQty)}<td class="ss-num ss-free">${number(r.freeQty)}</td>${cell(r.eq)}${stockPriceCells(r)}</tr><tr class="ss-description"><td colspan="10"><div><b>SKU</b> ${esc(r.sku||'—')} <span>· ${esc(r.desc)} · ${esc(r.size)}</span></div><div>${provenance(r)}</div>${r.physicalAt||r.freeAt?`<div class="ss-manual">${r.physicalAt?'ปรับ Physical '+esc(when(r.physicalAt)):''}${r.physicalAt&&r.freeAt?' · ':''}${r.freeAt?'ปรับ Free '+esc(when(r.freeAt)):''}</div>`:''}<div class="ss-memos">${memo(r,'followup','การติดตามยอดขาย')}${memo(r,'note','หมายเหตุ / แนวทางจัดการสต๊อก')}</div></td></tr>`).join('')}</tbody></table></section>`).join('')}
      <div class="ss-grand"><b>รวมครบ ${number(t.count)} สเปก</b><span>Physical <strong>${stockQuantityText(t,'qty')}</strong></span><span>ยอดจอง <strong>${stockQuantityText(t,'committedQty')}</strong></span><span>Free <strong>${stockQuantityText(t,'freeQty')}</strong></span></div>
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
    [data-aaf-stock-summary] .ss-exchange small{font-size:11px;max-width:230px;line-height:1.5}
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
    [data-aaf-stock-summary] .ss-strip-equivalent{display:block;font-size:10px;font-weight:400;line-height:1.5;white-space:normal}
    [data-aaf-stock-summary] .ss-physical-with-strips .ss-strip-equivalent{font-size:11px;margin-top:4px;color:#52657a}
    [data-aaf-stock-summary] .ss-combined-equivalent{display:block;margin-top:6px;padding-top:6px;border-top:1px solid #c3d5e3;font-size:11px;line-height:1.6;font-weight:400;white-space:normal;color:#234c7b}
    [data-aaf-stock-summary] .ss-combined-equivalent b{font-size:16px;font-weight:700;white-space:nowrap}
    [data-aaf-stock-summary] .ss-kpi-value{grid-column:1/-1;border-top:1px solid #cbd8e3;padding-top:10px;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;font-size:12px;color:#52657a}
    [data-aaf-stock-summary] .ss-kpi-value b{font-size:20px;color:#172b42;margin-left:auto;font-variant-numeric:tabular-nums}
    [data-aaf-stock-summary] .ss-kpi-value small{flex-basis:100%;font-size:10px}
    [data-aaf-stock-summary] .ss-stock-equation,[data-aaf-stock-summary] .ss-outside-stock,[data-aaf-stock-summary] .ss-commercial,[data-aaf-stock-summary] .ss-demand-note{grid-column:1/-1;font-size:12px;line-height:1.6}
    [data-aaf-stock-summary] .ss-stock-equation{display:grid;gap:5px;border:1px solid #b9cddd;border-radius:9px;background:#fff;padding:12px}
    [data-aaf-stock-summary] .ss-stock-equation span{color:#176b53}
    [data-aaf-stock-summary] .ss-outside-stock{display:grid;grid-template-columns:1fr auto;gap:3px 10px;border:1px solid #edc8c5;border-radius:9px;padding:10px 12px;background:#fff6f4;color:#9e3b33}
    [data-aaf-stock-summary] .ss-outside-stock>div,[data-aaf-stock-summary] .ss-outside-stock>small,[data-aaf-stock-summary] .ss-outside-stock>details{grid-column:1/-1}
    [data-aaf-stock-summary] .ss-commercial{border-top:1px solid #d3e2f4;padding-top:8px;color:#52657a}
    [data-aaf-stock-summary] .ss-commercial div{display:flex;justify-content:space-between;gap:10px}
    [data-aaf-stock-summary] .ss-sales-total{grid-column:1/-1;display:flex;flex-wrap:wrap;justify-content:space-between;gap:3px 10px;font-size:12px;color:#172b42;border-top:1px solid #cbd8e3;padding-top:8px}
    [data-aaf-stock-summary] .ss-sales-total small{flex-basis:100%;font-size:10px}
    [data-aaf-stock-summary] .ss-sold-quantity-split{display:grid;gap:8px;border-left:1px solid #c3d5e3;padding-left:14px;font-size:11px}
    [data-aaf-stock-summary] .ss-sold-quantity-split div{display:flex;flex-wrap:wrap;justify-content:space-between;gap:3px 8px}
    [data-aaf-stock-summary] .ss-sold-quantity-split b{font-size:14px}
    [data-aaf-stock-summary] .ss-sold-loading-breakdown{align-self:start;gap:12px}
    [data-aaf-stock-summary] .ss-loaded-total{color:#176b53}
    [data-aaf-stock-summary] .ss-awaiting-load{min-width:0;border-top:1px solid #bdd2ef;padding-top:10px}
    [data-aaf-stock-summary] .ss-awaiting-total{font-weight:700;align-items:baseline}
    [data-aaf-stock-summary] .ss-awaiting-total b{font-size:17px}
    [data-aaf-stock-summary] .ss-awaiting-load>small{display:block;margin-top:4px;font-size:10px}
    [data-aaf-stock-summary] .ss-sold-quantity-split .ss-awaiting-subsets{display:grid;justify-content:stretch;gap:8px;margin-top:10px;padding:8px 0 4px 10px;border-left:3px solid #aac4e5}
    [data-aaf-stock-summary] .ss-awaiting-subsets>small{font-size:10px}
    [data-aaf-stock-summary] .ss-awaiting-load .ss-loading-equation{color:#176b53;margin-top:8px}
    [data-aaf-stock-summary] .ss-awaiting-load .ss-loading-warning{color:#9e3b33;margin-top:8px}
    [data-aaf-stock-summary] .ss-sold-equivalents{grid-column:1/-1}
    [data-aaf-stock-summary] .ss-sold-equivalents .ss-physical-equivalents{border-left:0;border-top:1px solid #c3d5e3;padding:8px 0 0;grid-template-columns:1fr 1fr;gap:8px}
    [data-aaf-stock-summary] .ss-sold-equivalents dd{font-size:17px}
    [data-aaf-stock-summary] .ss-kpi-sold .ss-physical-main{align-self:start}
    [data-aaf-stock-summary] .ss-sold-sales-values{display:grid;gap:10px;margin-top:14px;font-size:12px;line-height:1.5}
    [data-aaf-stock-summary] .ss-sold-sales-values>div{display:grid;gap:3px;border-top:1px solid #bdd2ef;padding-top:8px}
    [data-aaf-stock-summary] .ss-sold-sales-values b{font-size:19px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
    [data-aaf-stock-summary] .ss-sales-total-value>b{font-size:23px;color:#163d73}
    [data-aaf-stock-summary] .ss-sales-native{display:flex;flex-wrap:wrap;gap:3px 12px;font-weight:600}
    [data-aaf-stock-summary] .ss-sold-sales-values .ss-sales-settlement{gap:8px;margin-left:7px;padding-left:10px;border-top:0;border-left:3px solid #bdd2ef}
    [data-aaf-stock-summary] .ss-sales-settlement>div{display:grid;gap:2px}
    [data-aaf-stock-summary] .ss-sales-settlement b{font-size:16px}
    [data-aaf-stock-summary] .ss-sales-settlement .ss-settlement-unallocated{padding:7px;border-radius:6px;background:#fff7e6;color:#785018}
    [data-aaf-stock-summary] .ss-settlement-details{font-size:11px;border-top:1px solid #bdd2ef;padding-top:7px}
    [data-aaf-stock-summary] .ss-settlement-details>div{display:grid;gap:3px;margin-top:7px;padding:7px;background:#fff;border-radius:6px;overflow-wrap:anywhere}
    [data-aaf-stock-summary] .ss-settlement-details>div>b{font-size:12px}
    [data-aaf-stock-summary] .ss-settlement-equation{color:#176b53}
    [data-aaf-stock-summary] .ss-sold-sales-values .ss-sales-pending-value{border:1px solid #aac7e8;border-radius:8px;padding:8px;background:#fff}
    [data-aaf-stock-summary] .ss-sold-sales-values .ss-sales-pending-value b{display:block;margin-top:6px;font-size:15px}
    [data-aaf-stock-summary] .ss-sales-pending-value small{display:block}
    [data-aaf-stock-summary] .ss-sold-sales-values .ss-sales-value-warning{color:#9e3b33}
    [data-aaf-stock-summary] .ss-sales-value-basis{display:block;line-height:1.5}
    [data-aaf-stock-summary] .ss-price-gaps{width:100%;font-size:11px;color:#9e3b33}
    [data-aaf-stock-summary] .ss-price-gaps div{display:flex;justify-content:space-between;gap:12px;padding:3px 0}
    [data-aaf-stock-summary] .ss-kpi .ss-price-gaps b{font-size:11px;margin:0;color:inherit;letter-spacing:0}
    [data-aaf-stock-summary] .ss-kpi summary{cursor:pointer}
    [data-aaf-stock-summary] .ss-production-details table{width:100%;border-collapse:collapse;font-size:11px;margin:6px 0;color:#172b42;background:#fff}
    [data-aaf-stock-summary] .ss-production-details th,[data-aaf-stock-summary] .ss-production-details td{text-align:left;padding:7px 5px;border-bottom:1px solid #ecd8d5;white-space:normal}
    [data-aaf-stock-summary] .ss-production-details td:last-child,[data-aaf-stock-summary] .ss-production-details th:last-child{text-align:right}
    [data-aaf-stock-summary] .ss-production-details tfoot{font-weight:600}
    [data-aaf-stock-summary] .ss-price-gaps .ss-gap-editor{display:grid;grid-template-columns:minmax(0,1fr) 92px 74px;gap:8px;align-items:end;padding:9px 0;border-bottom:1px solid #e2e8f0;color:#172b42}
    [data-aaf-stock-summary] .ss-price-gaps .ss-gap-spec{display:grid;gap:3px;padding:0}
    [data-aaf-stock-summary] .ss-gap-editor label{display:grid;gap:3px;font-size:10px;color:#52657a}
    [data-aaf-stock-summary] .ss-gap-editor input,[data-aaf-stock-summary] .ss-gap-editor select{box-sizing:border-box;width:100%;min-width:0;border:1px solid #b9cddd;border-radius:6px;background:white;color:#172b42;padding:7px 6px;font:inherit;font-size:12px}
    [data-aaf-stock-summary] .ss-gap-editor input[aria-invalid="true"]{border-color:#b42332;background:#fff1f1}
    [data-aaf-stock-summary] .ss-price-gaps .ss-gap-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 0}
    [data-aaf-stock-summary] .ss-gap-actions button{border:0;border-radius:7px;padding:8px 10px;background:#117963;color:white;font:inherit;cursor:pointer}
    [data-aaf-stock-summary] .ss-gap-actions button:disabled{opacity:.5;cursor:default}
    [data-aaf-stock-summary] .ss-partition-error{grid-column:1/-1;color:#9e3b33;background:#fff6f4;padding:12px;border-radius:8px}
    [data-aaf-stock-summary] .ss-kpi-sold{background:#eff6ff;border-color:#bdd2ef;color:#24528a}
    [data-aaf-stock-summary] .ss-kpi-reserved{background:#fff9ed;border-color:#e5d5ad;color:#785b24}
    [data-aaf-stock-summary] .ss-kpi-free{background:#e4f6f0;border-color:#8bcdba;color:#06634e}
    [data-aaf-stock-summary] .ss-sales-summary-source{font-size:13px;color:#334e68;margin:0 0 12px;padding:11px 14px;background:#f0f6fb;border-left:4px solid #48799b;border-radius:4px;line-height:1.75}
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
    [data-aaf-stock-summary] .ss-groups{display:grid;grid-template-columns:1fr;gap:20px;align-items:start;min-width:0}
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
    [data-aaf-stock-summary] .ss-group table{table-layout:fixed;font-size:11px;min-width:1080px;line-height:1.5}
    [data-aaf-stock-summary] .ss-group th,[data-aaf-stock-summary] .ss-group td{padding:7px 3px}
    [data-aaf-stock-summary] .ss-group thead th{font-size:10px}
    [data-aaf-stock-summary] .ss-group thead tr:first-child th:nth-child(1){width:5%}
    [data-aaf-stock-summary] .ss-group thead tr:first-child th:nth-child(2){width:4%}
    [data-aaf-stock-summary] .ss-group thead tr:first-child th:nth-child(n+3):nth-child(-n+7){width:9%}
    [data-aaf-stock-summary] .ss-group thead tr:first-child th:nth-child(8){width:24%}
    [data-aaf-stock-summary] .ss-group thead tr:first-child th:nth-child(9),[data-aaf-stock-summary] .ss-group thead tr:first-child th:nth-child(10){width:11%}
    [data-aaf-stock-summary] .ss-group thead small{font-size:9px;font-weight:400;white-space:normal}
    [data-aaf-stock-summary] .ss-group td.ss-num{white-space:nowrap}
    [data-aaf-stock-summary] .ss-group .ss-equivalent{background:#eff5ff;color:#234c7b}
    [data-aaf-stock-summary] .ss-group .ss-reserved-stock{background:#f0f7fb;color:#2c526d}
    [data-aaf-stock-summary] .ss-group .ss-reserved-production{background:#fff1e8;color:#944a15}
    [data-aaf-stock-summary] .ss-combined-total th,[data-aaf-stock-summary] .ss-combined-total td{border-top:2px solid #9bb8d5;background:#e2edfb!important;color:#234c7b}
    [data-aaf-stock-summary] .ss-combined-total small{display:block;font-weight:400;font-size:10px;white-space:normal}
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
    if(!root)return;let m=model(data,calculate);m.salesSummary=window.AAFSalesPreview?.getReportSummary?.()||null;
    if(typeof window.AAFSalesPreview?.getExchangeRateStatus==='function')headerExchangeRate=validHeaderFx(window.AAFSalesPreview.getExchangeRateStatus());
    m.headerExchangeRate=headerExchangeRate;m=withSavedCatalog(m,savedStockCatalog,headerExchangeRate);latest=m;root.classList.remove('ss-error');
    // Retain the same native preview node: changing stock revisions must not discard price/note drafts.
    const preview=root.querySelector('#stock-sales-preview-host');
    const focused=preview?.shadowRoot?.activeElement;
    const selection=focused&&typeof focused.selectionStart==='number'?{start:focused.selectionStart,end:focused.selectionEnd}:null;
    preview?.remove();
    root.innerHTML=`<div class="ss-tools ss-report-intro"><div><h2>สรุปสต๊อกสำหรับส่งรายงาน</h2><p>รายงานยาวครบทุกแถว • ข้อมูลอ่านอย่างเดียว ไม่เปลี่ยนข้อมูลสต๊อก</p><a href="#stock-cash">ดูสต๊อกและเงิน ↓</a></div><button type="button" class="ss-download" ${exporting?'disabled':''}>ดาวน์โหลดภาพยาว PNG</button></div><p class="ss-status" role="status">ภาพรวมจากข้อมูลส่วนกลางที่โหลดล่าสุด — ใช้เฉพาะค่าที่บันทึกสำเร็จจากหน้าสต๊อก</p>${html(m)}${m.cash?`<div class="ss-tools" style="margin-top:28px"><h2>กล่องสต๊อกและเงิน</h2><button type="button" class="cash-download" ${exporting?'disabled':''}>ดาวน์โหลดกล่องสต๊อกและเงิน PNG</button></div>${window.AAFStockCash.render(m.cash)}`:m.cashError?`<p class="ss-error">ยังแสดงกล่องเงินไม่ได้: ${esc(m.cashError)}</p>`:''}`;
    root.querySelector('.ss-download').addEventListener('click',()=>download());root.querySelector('.cash-download')?.addEventListener('click',()=>download('cash'));
    window.AAFSalesPreview?.attach(root.querySelector('#stock-sales-preview-slot'));
    syncPriceDrafts();
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
  window.AAFStockSummary={update,showError,setSalesSummary,setExchangeRate,setSavedStockCatalog,syncPriceDrafts};
  // Pure read-only builders exposed for regression tests and isolated previews.
  window.AAFStockSummary.buildModel=model;window.AAFStockSummary.renderHTML=html;window.AAFStockSummary.renderKpis=kpiHTML;
  window.AAFStockSummary.soldLoadingBreakdown=soldLoadingBreakdown;
  window.AAFStockSummary.soldSettlementState=soldSettlementState;
  window.AAFStockSummary.exchangeRateDisplay=exchangeRateDisplay;
  window.AAFStockSummary.withSavedCatalog=withSavedCatalog;
})();
