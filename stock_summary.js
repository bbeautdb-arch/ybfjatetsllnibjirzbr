/* Read-only screenshot report. Receives saved central data; never reads drafts,
   writes stock/storage, fetches business data, or changes existing table filters. */
(() => {
  'use strict';
  const root=document.getElementById('stock-summary');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=(v,d=2)=>Number(v).toLocaleString('th-TH',{maximumFractionDigits:d});
  const when=v=>v&&!Number.isNaN(new Date(v).getTime())?new Date(v).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'ไม่ระบุเวลา';
  const reportDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?new Date(v+'T00:00:00+07:00').toLocaleDateString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'long',year:'numeric'}):'ยังไม่มีรายงาน';
  const gradeOrder=['AV','AAA','A','B','F','REJ','C','UN','CTS'];
  const agingKeys=['d90','d180','d270','d360','dOver'];
  const agingLabels=['0–90 วัน','91–180 วัน','181–270 วัน','271–360 วัน','เกิน 360 วัน'];
  const standardArea=1220*2440;
  const blank=()=>({qty:0,baseQty:0,freeQty:0,committedQty:0,eq4x8:0,eq:0,value:0,freeValue:0,count:0});
  const add=(s,r)=>{for(const k of ['qty','baseQty','freeQty','committedQty','eq4x8','eq','value','freeValue'])s[k]+=r[k];s.count++;return s;};
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
      return result;
    }).sort((a,b)=>Number(a.t)-Number(b.t)||Number(a.w)-Number(b.w)||Number(a.l)-Number(b.l)||String(a.grade).localeCompare(String(b.grade))||String(a.key).localeCompare(String(b.key)));
    const total=blank(),grades=new Map(gradeOrder.map(g=>[g,blank()])),thickness=new Map(),aging=agingKeys.map(()=>0);
    for(const r of rows){add(total,r);if(!grades.has(r.grade))grades.set(r.grade,blank());add(grades.get(r.grade),r);const t=String(Number(r.t));if(!thickness.has(t))thickness.set(t,blank());add(thickness.get(t),r);agingKeys.forEach((k,i)=>aging[i]+=r[k]);}
    return {rows,total,grades:[...grades],thickness:[...thickness],aging,reportDate:data.report.reportDate,updatedAt:data.updatedAt,importedAt:data.importedAt,revision:String(data.revision??''),exchangeRate:data.exchangeRate,sourceRowCount:data.report.sourceRowCount,renderedAt:new Date().toISOString()};
  }
  const cell=n=>'<td class="ss-num">'+number(n)+'</td>';
  const equivalents=v=>`<td class="ss-num ss-equivalent">${number(v.eq4x8,2)}</td><td class="ss-num ss-equivalent">${number(v.eq,2)}</td>`;
  function groupTable(title,groups,label,total){
    return `<section class="ss-group"><h3>${title}</h3><table><caption class="ss-sr">${title} · ยอดเทียบขนาดคำนวณจาก Physical</caption><thead><tr><th scope="col">${label}</th><th scope="col" class="ss-num">สเปก</th><th scope="col" class="ss-num">Physical</th><th scope="col" class="ss-num">ยอดจอง</th><th scope="col" class="ss-num">Free</th><th scope="col" class="ss-num ss-equivalent">เทียบ 4×8<br><small>หนาเดิม</small></th><th scope="col" class="ss-num ss-equivalent">เทียบ 4×8<br><small>หนา 2.5 mm</small></th></tr></thead><tbody>${groups.map(([k,v])=>`<tr><th scope="row">${esc(k)}</th>${cell(v.count)}${cell(v.qty)}${cell(v.committedQty)}<td class="ss-num ss-free">${number(v.freeQty)}</td>${equivalents(v)}</tr>`).join('')}</tbody><tfoot><tr><th scope="row">รวม</th>${cell(total.count)}${cell(total.qty)}${cell(total.committedQty)}<td class="ss-num ss-free">${number(total.freeQty)}</td>${equivalents(total)}</tr></tfoot></table></section>`;
  }
  function memo(r,key,title){return `<div><b>${title}</b><div class="ss-text">${esc(r[key]||'—')}</div>${r[key+'At']?`<small>${esc(r[key+'By']||'ไม่ระบุผู้บันทึก')} · ${esc(when(r[key+'At']))}</small>`:''}</div>`;}
  function provenance(r){
    if(r.rawSource)return `ยอดเมล ${number(r.baseQty)} · Aging: ${agingKeys.map((k,i)=>agingLabels[i]+' = '+number(r[k])).join(' / ')} แผ่น`;
    if(r.retained)return 'เก็บรายการสินค้าเดิม · ไม่พบในเมลวันนี้ · ยอดเมลและ Aging = 0 · ยังคงรหัส ราคา หมายเหตุและการติดตาม';
    return 'สเปกหลังโยก/ต้องผลิต — ไม่มี SKU หรือ Aging ของตัวเองในเมลต้นฉบับ';
  }
  function html(m){
    const t=m.total,overrides=m.rows.filter(r=>r.physicalAt||r.freeAt).length,followed=m.rows.filter(r=>String(r.followup).trim()).length;
    const kpis=[['สต๊อกจริง · Physical',t.qty,'แผ่น ณ ยอดที่เซฟล่าสุด'],['พร้อมขาย · Free',t.freeQty,'แผ่น ใช้ค่า Free ที่เซฟไว้'],['ยอดจอง',t.committedQty,'แผ่น จากยอดจองในระบบ'],['ยอดจากเมล',t.baseQty,'แผ่น ก่อนปรับระหว่างวัน']];
    let index=0;
    return `<article class="ss-sheet">
      <header class="ss-hero"><div><div class="ss-eyebrow">AAF / STOCK & SALES FOLLOW-UP</div><h2>รายงานสต๊อกและติดตามการขาย</h2><p>อ้างอิงรายงานเมล ${esc(reportDay(m.reportDate))}</p></div><div class="ss-stamp">ข้อมูลที่บันทึกแล้ว<br><b>ครบ ${number(m.rows.length)} สเปก</b><br>ทุกเกรด · ทุกขนาด</div></header>
      <div class="ss-content"><div class="ss-context"><span>ข้อมูลส่วนกลางล่าสุด <b>${esc(when(m.updatedAt))}</b></span><span>เวลาไทย (UTC+7) · ภาพรวมทั้งชุด ไม่ใช้ตัวกรองในหน้าสต๊อก</span></div>
      <div class="ss-kpis">${kpis.map(([label,value,note],i)=>`<div class="ss-kpi ${i===1?'ss-kpi-free':''}"><h3>${label}</h3><strong>${number(value)}</strong><small>${note}</small></div>`).join('')}</div>
      <div class="ss-values"><div>มูลค่าสต๊อก <b>฿ ${number(t.value)}</b></div><div>มูลค่า Free <b>฿ ${number(t.freeValue)}</b></div><div>เทียบ 4×8 ฟุต / 2.5 mm <b>${number(t.eq)} แผ่น</b></div><div>อัตราแปลง USD/THB <b>${number(m.exchangeRate,4)}</b></div></div>
      ${m.rows.some(r=>r.priceMissing)?'<p class="ss-help" style="color:#be123c">มูลค่ายังไม่ครบ: สเปกปลายทางจากการโยกบางรายการยังไม่มีราคา ไม่ใช่สินค้าราคา 0 บาท</p>':''}<p class="ss-help">Physical และ Free รวมการปรับที่กดเซฟแล้ว • Free อาจต่างจาก Physical − ยอดจอง เพราะปรับเองได้ • ไม่รวมตัวเลขหรือข้อความที่ยังเป็นร่าง • มูลค่าใช้ราคา/แผ่นและอัตราแลกเปลี่ยนเดียวกับตารางหลัก</p>
      <div class="ss-section-title"><span>01</span><h3>ภาพรวมแยกเกรดและความหนา</h3><small>หน่วย: แผ่น</small></div>
      <p class="ss-help ss-conversion-help">ยอดเทียบขนาดใช้ Physical ที่เซฟแล้ว · 4×8 ฟุต = 1,220 × 2,440 mm ตามมาตรฐานระบบ<br>เทียบ 4×8 หนาเดิม = Physical × (กว้าง × ยาว ÷ 2,976,800) · เทียบ 4×8 หนา 2.5 mm = ยอดเทียบ 4×8 × (ความหนา ÷ 2.5)<br>รวมค่าจริงก่อนปัดแสดงผลไม่เกิน 2 ตำแหน่ง · ไม่เปลี่ยนยอด Physical, Free หรือยอดจอง</p>
      <div class="ss-groups">${groupTable('แยกตามเกรด',m.grades,'เกรด',t)}${groupTable('แยกตามความหนา',m.thickness,'หนา (mm)',t)}</div>
      <div class="ss-aging"><h3>Aging ตามรายงานเมลต้นฉบับ</h3><div class="ss-aging-grid">${m.aging.map((n,i)=>`<div><small>${agingLabels[i]}</small><b>${number(n)}</b><span>${t.baseQty?number(n/t.baseQty*100,1):'0'}%</span></div>`).join('')}</div><p>ฐาน Aging ${number(m.aging.reduce((a,b)=>a+b,0))} แผ่น · ไม่กระจายยอดปรับระหว่างวันเข้าอายุสินค้า</p></div>
      <div class="ss-section-title"><span>02</span><h3>รายละเอียดครบทุกสเปก</h3><small>ปรับเอง ${number(overrides)} สเปก · มีติดตาม ${number(followed)} สเปก</small></div>
      <p class="ss-help">เรียงความหนา → กว้าง → ยาว → เกรด • แสดง SKU, อายุสินค้า, ข้อความติดตาม และหมายเหตุครบ ไม่ตัดข้อความ</p>
      ${m.thickness.map(([thick,totals])=>`<section class="ss-detail-group"><div class="ss-band"><h4>ความหนา ${esc(thick)} mm</h4><span>${totals.count} สเปก · Physical ${number(totals.qty)} · Free ${number(totals.freeQty)} แผ่น</span></div><table class="ss-detail"><caption class="ss-sr">รายละเอียดความหนา ${esc(thick)} mm</caption><colgroup><col style="width:4%"><col style="width:18%"><col style="width:6%"><col style="width:11%"><col style="width:9%"><col style="width:11%"><col style="width:10%"><col style="width:10%"><col style="width:11%"><col style="width:10%"></colgroup><thead><tr><th>#</th><th>กว้าง × ยาว × หนา<br><small>หน่วย mm</small></th><th>เกรด</th><th class="ss-num">Physical</th><th class="ss-num">ยอดจอง</th><th class="ss-num">Free</th><th class="ss-num">เทียบ 2.5</th><th class="ss-num">ราคา/แผ่น</th><th class="ss-num">มูลค่า (฿)</th><th class="ss-num">Free (฿)</th></tr></thead><tbody>${m.rows.filter(r=>String(Number(r.t))===thick).map(r=>`<tr class="ss-stock-row"><td>${++index}</td><th>${number(r.w,3)} × ${number(r.l,3)} × ${number(r.t,3)}</th><td><b class="ss-grade">${esc(r.grade)}</b></td>${cell(r.qty)}${cell(r.committedQty)}<td class="ss-num ss-free">${number(r.freeQty)}</td>${cell(r.eq)}<td class="ss-num">${number(r.price,4)}<small>${esc(r.curr)}</small></td>${cell(r.value)}${cell(r.freeValue)}</tr><tr class="ss-description"><td colspan="10"><div><b>SKU</b> ${esc(r.sku||'—')} <span>· ${esc(r.desc)} · ${esc(r.size)}</span></div><div>${provenance(r)}</div>${r.physicalAt||r.freeAt?`<div class="ss-manual">${r.physicalAt?'ปรับ Physical '+esc(when(r.physicalAt)):''}${r.physicalAt&&r.freeAt?' · ':''}${r.freeAt?'ปรับ Free '+esc(when(r.freeAt)):''}</div>`:''}<div class="ss-memos">${memo(r,'followup','การติดตามยอดขาย')}${memo(r,'note','หมายเหตุ / แนวทางจัดการสต๊อก')}</div></td></tr>`).join('')}</tbody></table></section>`).join('')}
      <div class="ss-grand"><b>รวมครบ ${number(t.count)} สเปก</b><span>Physical <strong>${number(t.qty)}</strong></span><span>ยอดจอง <strong>${number(t.committedQty)}</strong></span><span>Free <strong>${number(t.freeQty)}</strong></span></div>
      <footer class="ss-footer"><div><b>จบรายงาน · แสดงครบ ${number(t.count)} / ${number(t.count)} สเปก</b><br>แหล่งข้อมูล: Stock AAF ส่วนกลาง${m.sourceRowCount?' · ต้นฉบับ '+number(m.sourceRowCount)+' แถว':''}<br>bbeautdb-arch.github.io/AAF-System/stock_manager.html</div><div>สร้างมุมมอง ${esc(when(m.renderedAt))}<br>ข้อมูลบันทึกล่าสุด ${esc(when(m.updatedAt))}<br>รายงานสำหรับใช้ภายในบริษัท</div></footer>
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
    [data-aaf-stock-summary] .ss-content{padding:24px 28px}
    [data-aaf-stock-summary] .ss-context{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;font-size:12px;color:#52657a;margin-bottom:20px}
    [data-aaf-stock-summary] .ss-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    [data-aaf-stock-summary] .ss-kpi{border:1px solid #cbd8e3;background:#f4f7fa;border-radius:12px;padding:18px}
    [data-aaf-stock-summary] .ss-kpi h3{font-size:14px;font-weight:600;margin:0}
    [data-aaf-stock-summary] .ss-kpi strong{display:block;font-size:32px;font-weight:700;letter-spacing:-1px;line-height:1.4;margin:6px 0;font-variant-numeric:tabular-nums}
    [data-aaf-stock-summary] .ss-kpi small{color:#52657a;font-size:11px}
    [data-aaf-stock-summary] .ss-kpi-free{background:#e4f6f0;border-color:#8bcdba;color:#06634e}
    [data-aaf-stock-summary] .ss-values{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px;margin:20px 0;font-size:12px;color:#52657a}
    [data-aaf-stock-summary] .ss-values b{display:block;color:#172b42;font-size:19px;font-weight:600;margin-top:4px}
    [data-aaf-stock-summary] .ss-help{font-size:12px;color:#52657a;line-height:1.8;margin:12px 0 18px}
    [data-aaf-stock-summary] .ss-section-title{display:flex;align-items:center;gap:10px;margin:30px 0 15px;border-bottom:1px solid #cfdae4;padding-bottom:12px;flex-wrap:wrap}
    [data-aaf-stock-summary] .ss-section-title>span{background:#142c42;color:white;font-size:12px;padding:5px 8px;border-radius:6px}
    [data-aaf-stock-summary] .ss-section-title h3{margin:0;font-size:20px;font-weight:700}
    [data-aaf-stock-summary] .ss-section-title small{margin-left:auto;color:#52657a;font-size:12px}
    [data-aaf-stock-summary] .ss-groups{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
    [data-aaf-stock-summary] .ss-group{border:1px solid #d4dee7;border-radius:10px;overflow:hidden}
    [data-aaf-stock-summary] .ss-group h3{padding:12px 14px;margin:0;font-weight:700;background:#edf3f7;font-size:15px}
    [data-aaf-stock-summary] table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px}
    [data-aaf-stock-summary] th,[data-aaf-stock-summary] td{padding:9px 10px;text-align:left;vertical-align:top;border-bottom:1px solid #dde5ec;overflow-wrap:anywhere;white-space:normal}
    [data-aaf-stock-summary] th{font-weight:600}
    [data-aaf-stock-summary] thead{background:#edf3f7;color:#3b5268}
    [data-aaf-stock-summary] thead th{font-size:11px;vertical-align:middle}
    [data-aaf-stock-summary] .ss-num{text-align:right;font-variant-numeric:tabular-nums}
    [data-aaf-stock-summary] .ss-free{color:#08654f;font-weight:700;background:#f0faf6}
    [data-aaf-stock-summary] .ss-group table{table-layout:auto;font-size:14px}
    [data-aaf-stock-summary] .ss-group th,[data-aaf-stock-summary] .ss-group td{padding:10px 7px}
    [data-aaf-stock-summary] .ss-group thead th{font-size:14px}
    [data-aaf-stock-summary] .ss-group thead small{font-size:12px;font-weight:400;white-space:nowrap}
    [data-aaf-stock-summary] .ss-group td.ss-num{white-space:nowrap}
    [data-aaf-stock-summary] .ss-group .ss-equivalent{background:#eff5ff;color:#234c7b}
    [data-aaf-stock-summary] .ss-group tfoot{font-weight:700;background:#edf3f7;border-top:2px solid #bacbd9}
    [data-aaf-stock-summary] .ss-conversion-help{font-size:13px}
    @media(max-width:1200px){[data-aaf-stock-summary]:not(.ss-export) .ss-groups{grid-template-columns:1fr}}
    @media(max-width:540px){[data-aaf-stock-summary]:not(.ss-export) .ss-group table{table-layout:fixed}[data-aaf-stock-summary]:not(.ss-export) .ss-group th,[data-aaf-stock-summary]:not(.ss-export) .ss-group td{padding:8px 3px}[data-aaf-stock-summary]:not(.ss-export) .ss-group td.ss-num,[data-aaf-stock-summary]:not(.ss-export) .ss-group thead small{white-space:normal}}
    [data-aaf-stock-summary] .ss-aging{padding:18px;border:1px solid #dccba7;border-radius:10px;background:#fffaf0;margin-top:20px}
    [data-aaf-stock-summary] .ss-aging h3{margin:0 0 14px;font-size:15px;font-weight:600}
    [data-aaf-stock-summary] .ss-aging-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
    [data-aaf-stock-summary] .ss-aging-grid b{display:block;font-size:22px;font-weight:600}
    [data-aaf-stock-summary] .ss-aging-grid span,[data-aaf-stock-summary] .ss-aging p{font-size:11px;color:#756347}
    [data-aaf-stock-summary] .ss-aging p{margin:12px 0 0}
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
    @media(max-width:800px){[data-aaf-stock-summary]:not(.ss-export) .ss-content{padding:12px}[data-aaf-stock-summary]:not(.ss-export) .ss-hero{padding:20px;flex-wrap:wrap}[data-aaf-stock-summary]:not(.ss-export) .ss-hero h2{font-size:25px}[data-aaf-stock-summary]:not(.ss-export) .ss-kpis,[data-aaf-stock-summary]:not(.ss-export) .ss-values{grid-template-columns:1fr 1fr}[data-aaf-stock-summary]:not(.ss-export) .ss-groups{grid-template-columns:1fr}[data-aaf-stock-summary]:not(.ss-export) .ss-detail{font-size:10px}[data-aaf-stock-summary]:not(.ss-export) .ss-detail th,[data-aaf-stock-summary]:not(.ss-export) .ss-detail td{padding:6px 3px}[data-aaf-stock-summary]:not(.ss-export) .ss-band{flex-wrap:wrap}[data-aaf-stock-summary]:not(.ss-export) .ss-aging-grid b{font-size:17px}[data-aaf-stock-summary]:not(.ss-export) .ss-kpi strong{font-size:26px}[data-aaf-stock-summary]:not(.ss-export) .ss-footer{flex-direction:column}}
  `;document.head.append(style);
  function showError(message){if(!root)return;const n=root.querySelector('.ss-status')||root;n.textContent=message;n.classList.add('ss-error');if(root.querySelector('.ss-download'))root.querySelector('.ss-download').disabled=true;latest=null;root.querySelector('.ss-sheet')?.remove();}
  function update(data,calculate){if(!root)return;const m=model(data,calculate);latest=m;root.classList.remove('ss-error');root.innerHTML=`<div class="ss-tools"><div><h2>สรุปสต๊อกสำหรับส่งรายงาน</h2><p>รายงานยาวครบทุกแถว • ข้อมูลอ่านอย่างเดียว ไม่เปลี่ยนข้อมูลสต๊อก</p></div><button type="button" class="ss-download" ${exporting?'disabled':''}>ดาวน์โหลดภาพยาว PNG</button></div><p class="ss-status" role="status">ภาพรวมจากข้อมูลส่วนกลางที่โหลดล่าสุด — ใช้เฉพาะค่าที่บันทึกสำเร็จจากหน้าสต๊อก</p>${html(m)}`;root.querySelector('.ss-download').addEventListener('click',download);}
  async function loadCanvas(){
    if(window.html2canvas)return window.html2canvas;
    if(!canvasLoader)canvasLoader=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';script.crossOrigin='anonymous';script.referrerPolicy='no-referrer';script.onload=()=>window.html2canvas?resolve(window.html2canvas):reject(new Error('โหลดเครื่องมือสร้างภาพไม่สำเร็จ'));script.onerror=()=>{script.remove();canvasLoader=null;reject(new Error('โหลดเครื่องมือสร้างภาพไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'));};document.head.append(script);});
    return canvasLoader;
  }
  async function download(){
    if(!latest||exporting)return;exporting=true;const captured=latest;let box=null;
    const status=text=>{const p=root.querySelector('.ss-status');if(p)p.textContent=text;};
    root.querySelector('.ss-download').disabled=true;status('กำลังสร้างภาพยาวครบทุกแถว กรุณารอสักครู่…');
    try{
      const canvasFn=await loadCanvas();await document.fonts?.ready;
      box=document.createElement('div');box.dataset.aafStockSummary='';box.className='ss-export';box.style.cssText='position:absolute;left:-20000px;top:0;width:1440px;padding:0;background:white;';box.innerHTML=html(captured);document.body.append(box);
      const sheet=box.querySelector('.ss-sheet'),height=Math.ceil(sheet.getBoundingClientRect().height),scale=Math.min(1.5,30000/height,Math.sqrt(48000000/(1440*height)));
      if(scale<0.65)throw new Error('ข้อความยาวเกินขนาดภาพที่อ่านได้ในรูปเดียว กรุณาถ่ายภาพเต็มหน้าผ่านเบราว์เซอร์แทน');
      const canvas=await canvasFn(sheet,{backgroundColor:'#ffffff',scale,width:1440,height,windowWidth:1500,windowHeight:1000,scrollX:0,scrollY:0,logging:false});
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('เบราว์เซอร์สร้างภาพไม่สำเร็จ');
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AAF_Stock_Summary_'+captured.reportDate+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      status(`ดาวน์โหลดภาพครบ ${captured.rows.length} สเปกแล้ว · ข้อมูลบันทึก ${when(captured.updatedAt)}${latest!==captured?' · มีข้อมูลใหม่บนหน้าจอหลังเริ่มสร้างภาพ':''}`);
    }catch(e){status('ยังไม่ได้ดาวน์โหลดภาพ: '+e.message);}finally{box?.remove();exporting=false;const b=root.querySelector('.ss-download');if(b)b.disabled=!latest;}
  }
  window.AAFStockSummary={update,showError};
  // Pure read-only builders exposed for regression tests and isolated previews.
  window.AAFStockSummary.buildModel=model;window.AAFStockSummary.renderHTML=html;
})();
