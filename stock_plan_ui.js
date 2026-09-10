/* Owner-only import UI. Server revalidates and computes the entire plan in one
   revision-checked transaction. No browser-storage authority or embedded data. */
(() => {
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2});
  let data,save,section,dialog,morningDialog,morningReview=null,morningSubmitting=false;
  function render(){
    if(!section||!data)return;
    const p=data.sellablePlan,mode=document.getElementById('plan-filter').value;
    const rows=data.rows.filter(r=>mode==='short'?r.productionQty>0:mode==='free'?r.freeQty>0:mode==='unreserved'?r.freeQty>0&&r.committedQty===0:true).slice().sort((a,b)=>a.t-b.t||a.grade.localeCompare(b.grade)||a.w-b.w||a.l-b.l);
    document.getElementById('plan-state').textContent=p?`บันทึกส่วนกลางแล้ว · เมล ${data.report.reportDate} · ข้อมูลขาย ${p.month} · ${p.source.rowCount} รายการ · ${new Date(p.appliedAt).toLocaleString('th-TH')}${p.needsSalesRefresh?' · รออัปเดตแผนขายของรายงานวันนี้':''}`:data.sellableRules==='aaf-sellable-20260910-v2'?'บันทึกกติกาโยกรอบเช้าแล้ว · ยอดจองเดิมยังอยู่ · รอแผนหน้า 09 รอบ 13:30':'ยังไม่ได้บันทึกกติกาโยกในระบบกลาง';
    document.getElementById('plan-open').hidden=!data.permissions.adjust;
    for(const id of ['plan-enable','plan-sales-export'])document.getElementById(id).hidden=!data.permissions.adjust;
    document.getElementById('plan-enable').disabled=morningSubmitting||data.stockWorkflowVersion!==1||data.sellableRules==='aaf-sellable-20260910-v2';
    document.getElementById('plan-sales-export').disabled=data.stockWorkflowVersion!==1||data.sellableRules!=='aaf-sellable-20260910-v2';
    const totals=['sheet','strip'].map(unit=>{const r=data.rows.filter(x=>(x.unit||'sheet')===unit),sum=k=>r.reduce((n,x)=>n+Math.round((x[k]||0)*100),0)/100;return `${unit==='sheet'?'แผ่น':'ชิ้น strip'}: หลังโยก ${fmt(sum('qty'))} · จอง ${fmt(sum('committedQty'))} · Free ${fmt(sum('freeQty'))} · ต้องผลิต ${fmt(sum('productionQty'))}`;});
    document.getElementById('plan-totals').textContent=totals.join('\n');
    document.getElementById('plan-rows').innerHTML=rows.map(r=>`<tr><td>${esc(r.t)}</td><td>${esc(r.grade)}</td><td>${esc(r.w)} × ${esc(r.l)}<small>${r.movedTo?'โยกไป '+esc(r.movedTo):r.rawSource===false?'สเปกขาย/สเปกที่ต้องผลิต — ไม่ใช่แถวเมล':''}</small></td><td>${r.unit==='strip'?'ชิ้น strip':'แผ่น'}</td><td>${fmt(r.qty)}</td><td>${fmt(r.committedQty)}</td><td class="${r.remainingQty<0?'plan-negative':''}">${fmt(r.remainingQty??r.qty-r.committedQty)}</td><td>${fmt(r.freeQty)}${r.freeOverride?'<small>ค่าปรับมือ</small>':''}</td><td class="plan-negative">${r.productionQty?fmt(r.productionQty):'—'}</td></tr>`).join('');
    const unpriced=data.rows.filter(r=>r.priceMissing).length;
    document.getElementById('plan-count').textContent=rows.length+' สเปก · Mix / AAA+B แยก AAA 85% + B 15% ไม่ปัดเศษ'+(unpriced?` · มี ${unpriced} สเปกปลายทางยังไม่มีราคา: มูลค่า THB ในตาราง/รายงานยังไม่ครบ ไม่ได้หมายถึงสินค้าราคา 0 บาท`:'');
  }
  function setup(bar){
    const style=document.createElement('style');style.textContent='#sellable-plan{margin:24px 0;background:white;padding:24px;border:1px solid #cbd5e1;border-radius:14px}#sellable-plan h2{font-size:24px;font-weight:700}#sellable-plan p{margin:12px 0}#plan-totals{white-space:pre-line;background:#f0fdfa;padding:14px}#sellable-plan table{width:100%;border-collapse:collapse;font-size:14px}#sellable-plan th,#sellable-plan td{padding:10px;border-bottom:1px solid #dbe3ec;text-align:right}#sellable-plan small{display:block;color:#64748b;font-size:11px}#sellable-plan th{background:#eef2ff}#plan-filter{padding:8px;border:1px solid #94a3b8;border-radius:6px}.plan-negative{color:#be123c;font-weight:700}#plan-dialog{width:min(850px,95vw);padding:24px;border:1px solid #94a3b8;border-radius:12px}#plan-dialog::backdrop{background:#0f172a99}#plan-json{width:100%;min-height:260px;border:1px solid #94a3b8;margin:12px 0;padding:10px;font-size:12px}#plan-import-state{white-space:pre-wrap;color:#be123c;margin:12px 0}';document.head.append(style);
    const jump=document.createElement('button');jump.className='shared-btn shared-secondary';jump.textContent='ยอดจอง / Free / ต้องผลิต';jump.onclick=()=>section.scrollIntoView({behavior:'smooth'});bar.append(jump);
    section=document.createElement('section');section.id='sellable-plan';section.innerHTML='<h2>สต๊อกหลังจัดการ · ยอดจองและแผนผลิต</h2><p id="plan-state"></p><p id="plan-totals"></p><p>โยก 1220×2440: 1.6 A + 1.8 A/B → 1.6 B และกว้าง 1270 → 1260 โดยคงยาว/หนา/เกรด ไม่เปลี่ยนสเปกออเดอร์ · โหลดแล้วไม่หักเพิ่ม · เมลต้นฉบับ หมายเหตุ และการติดตามยังอยู่เดิม</p><button class="shared-btn" id="plan-open" hidden>นำเข้าแผนโยก + ยอดจองหน้า 09</button> <select id="plan-filter" aria-label="เลือกดูสต๊อก"><option value="all">ทั้งหมด</option><option value="short">ต้องผลิตเพิ่ม</option><option value="free">มี Free เหลือ</option><option value="unreserved">มีของและไม่มีคนจอง</option></select><p id="plan-count"></p><div style="overflow:auto"><table><thead><tr><th>หนา</th><th>เกรด</th><th>ขนาด</th><th>หน่วย</th><th>หลังโยก / ปรับมือ</th><th>ยอดจอง</th><th>คงเหลือสุทธิ</th><th>Free</th><th>ต้องผลิต</th></tr></thead><tbody id="plan-rows"></tbody></table></div>';
    (document.querySelector('main')||document.body).append(section);
    const morning=document.createElement('div');morning.innerHTML='<button class="shared-btn" id="plan-enable" hidden>บันทึกกติกาโยกรอบเช้า (คงยอดจอง)</button> <button class="shared-btn shared-secondary" id="plan-sales-export" hidden>Excel ส่งฝ่ายขาย · ก่อนหักจอง</button><p id="morning-plan-state" style="white-space:pre-wrap"></p>';
    section.insertBefore(morning,document.getElementById('plan-open'));
    morningDialog=document.createElement('dialog');morningDialog.id='morning-confirm-dialog';
    morningDialog.setAttribute('aria-labelledby','morning-confirm-title');morningDialog.setAttribute('aria-describedby','morning-confirm-review');
    morningDialog.innerHTML='<h2 id="morning-confirm-title">ยืนยันกติกาโยกรอบเช้า</h2><p id="morning-confirm-review" style="white-space:pre-wrap"></p><p id="morning-confirm-state" role="status" aria-live="polite"></p><button type="button" id="morning-confirm-cancel" class="shared-btn shared-secondary" autofocus>ยกเลิก</button> <button type="button" id="morning-confirm-submit" class="shared-btn">ยืนยันและบันทึกกติกา</button>';
    document.body.append(morningDialog);
    style.textContent+='#morning-confirm-dialog{width:min(650px,95vw);padding:24px;border:1px solid #94a3b8;border-radius:12px}#morning-confirm-dialog::backdrop{background:#0f172a99}#morning-confirm-dialog h2{font-size:22px;font-weight:700}#morning-confirm-dialog p{margin:14px 0}#morning-confirm-state{color:#be123c}';
    const confirmSubmit=document.getElementById('morning-confirm-submit'),confirmCancel=document.getElementById('morning-confirm-cancel'),confirmState=document.getElementById('morning-confirm-state');
    document.getElementById('plan-enable').onclick=()=>{
      if(morningSubmitting||morningDialog.open||!data?.permissions.adjust||data.stockWorkflowVersion!==1||!data.report||data.sellableRules==='aaf-sellable-20260910-v2')return;
      morningReview={reportDate:data.report.reportDate,stockChecksum:data.report.checksum,revision:data.revision};
      document.getElementById('morning-confirm-review').textContent='รายงานเมล '+morningReview.reportDate+' · Revision '+morningReview.revision+'\n\n1. เฉพาะขนาด 1220×2440: โยก 1.6 A และ 1.8 A/B รวมกับ 1.6 B เดิม\n2. กว้าง 1270 → 1260 โดยคงยาว ความหนา และเกรด\n\nคงยอดจอง ราคา หมายเหตุ และการติดตามเดิม ไม่เปลี่ยนสเปกออเดอร์ และยังไม่ส่งไฟล์ให้ฝ่ายขาย\nกติกา: aaf-sellable-20260910-v2';
      confirmState.textContent='';morningDialog.showModal();
    };
    confirmCancel.onclick=()=>{if(!morningSubmitting)morningDialog.close();};
    morningDialog.addEventListener('cancel',event=>{if(morningSubmitting)event.preventDefault();});
    morningDialog.addEventListener('close',()=>{morningReview=null;});
    confirmSubmit.onclick=async()=>{
      if(morningSubmitting||!morningDialog.open||!morningReview)return;
      if(!data?.permissions.adjust||data.stockWorkflowVersion!==1){confirmState.textContent='ไม่มีสิทธิ์บันทึกกติกา กรุณาปิดแล้วโหลดข้อมูลล่าสุด';return;}
      if(data.revision!==morningReview.revision||data.report?.reportDate!==morningReview.reportDate||data.report?.checksum!==morningReview.stockChecksum||data.sellableRules==='aaf-sellable-20260910-v2'){
        confirmState.textContent='ข้อมูลเปลี่ยนหลังเปิดหน้าต่างยืนยัน กรุณายกเลิกแล้วตรวจข้อมูลล่าสุดก่อนยืนยันใหม่';return;
      }
      morningSubmitting=true;confirmSubmit.disabled=true;confirmCancel.disabled=true;confirmState.textContent='กำลังบันทึกกติกา…';render();
      try{
        const ok=await save({action:'enableSellableRules',rules:'aaf-sellable-20260910-v2',stockChecksum:morningReview.stockChecksum});
        const message=ok?'บันทึกกติกาในระบบกลางแล้ว ยังไม่ได้ส่งไฟล์ให้ฝ่ายขาย':'ยังไม่บันทึก กรุณาดูสาเหตุด้านบน';
        document.getElementById('morning-plan-state').textContent=message;confirmState.textContent=message;if(ok)morningDialog.close();
      }catch{confirmState.textContent='ยืนยันผลบันทึกไม่ได้ กรุณาปิดแล้วโหลดข้อมูลล่าสุดก่อนลองอีกครั้ง';}
      finally{morningSubmitting=false;confirmSubmit.disabled=false;confirmCancel.disabled=false;render();}
    };
    document.getElementById('plan-sales-export').onclick=()=>window.downloadSales04Stock();
    dialog=document.createElement('dialog');dialog.id='plan-dialog';dialog.innerHTML='<h2>บันทึกแผนโยกและยอดจองทั้งชุด</h2><p>ใช้สต๊อกเมลต้นฉบับแล้วโยกตามสองกติกา ยอดจองใหม่แทนแผนเดิม ไม่บวกซ้ำ หากมีค่าปรับมือของรายงานวันนี้ ระบบจะหยุดให้ตรวจสอบก่อน</p><textarea id="plan-json" aria-label="JSON แผนโยกและยอดจอง" spellcheck="false"></textarea><p id="plan-import-state"></p><button id="plan-apply" class="shared-btn">ตรวจสอบและบันทึกส่วนกลาง</button> <button id="plan-cancel" class="shared-btn shared-secondary">ปิด</button>';
    document.body.append(dialog);document.getElementById('plan-open').onclick=()=>{document.getElementById('plan-import-state').textContent='';dialog.showModal();};document.getElementById('plan-cancel').onclick=()=>dialog.close();document.getElementById('plan-filter').onchange=render;
    document.getElementById('plan-apply').onclick=async()=>{
      const button=document.getElementById('plan-apply'),message=document.getElementById('plan-import-state');if(!data?.permissions.adjust)return;
      let plan;try{plan=JSON.parse(document.getElementById('plan-json').value);if(plan.reportDate!==data.report.reportDate)throw Error('วันที่แผนไม่ตรงเมลล่าสุด');if(plan.rules!=='aaf-sellable-20260910-v2')throw Error('กติกาแผนไม่ถูกต้อง');}catch(e){message.textContent=e.message;return;}
      button.disabled=true;try{const ok=await save({action:'applySellablePlan',plan});message.textContent=ok?'บันทึกสำเร็จ ตรวจยอดในตารางด้านล่างได้':'ยังไม่บันทึก ดูสาเหตุในข้อความสถานะด้านบน';if(ok)dialog.close();}finally{button.disabled=false;}
    };
  }
  window.AAFStockPlanUI={setup,update(d,s){data=d;save=s;render();}};
})();
