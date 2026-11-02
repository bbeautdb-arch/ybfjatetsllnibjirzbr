/* Read-only explanation of saved stock allocation. No sales/source writes. */
(function(root,factory){
  'use strict';
  const api=factory(typeof module==='object'&&module.exports?require('./stock_order_header.js'):root.AAFOrderHeader);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AAFStockReadiness=api;
})(typeof window==='undefined'?null:window,function(header){
  'use strict';
  const units=['sheet','strip'],bucket=()=>({sheet:0,strip:0}),fields=['physical','demand','allocated','shortage','formulaFree','savedFree','manualFreeDelta'];
  const cents=n=>Math.round(n*100),valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&Number.isSafeInteger(cents(n))&&Math.abs(n*100-cents(n))<1e-5;
  const eq=(a,b)=>cents(a)===cents(b),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=n=>n.toLocaleString('en-US',{maximumFractionDigits:2});
  const unitLabel=u=>u==='sheet'?'แผ่น':'ชิ้นไม้แถบ';
  const gradeOrder=['AV','AAA','A','B','F','REJ','C','UN','CTS'];
  const rank=g=>gradeOrder.includes(g)?gradeOrder.indexOf(g):gradeOrder.length;
  function build(stock,now=Date.now()){
    const month=header?.currentBangkokMonth(now),pending=reason=>({status:'pending',month,reportDate:stock?.reportDate||null,reason});
    try{
      if(!header||!stock||!Array.isArray(stock.rows)||!stock.rows.length)return pending('ยังไม่มีสต๊อกส่วนกลางครบชุดสำหรับตรวจการจัดสรร');
      const warehouse=header.warehouseProjection(stock),allocation=header.currentAllocationView(stock.currentAllocation,warehouse,stock.currentMonthSold,now);
      if(allocation.status!=='verified-allocation')return pending(allocation.reason||'รอแผนส่วนกลางที่ตรงกับสต๊อกและหน้า 09 เดือนนี้');
      const totals=Object.fromEntries(fields.map(k=>[k,bucket()])),seen=new Set(),groups=new Map();let manualCount=0;
      for(const row of stock.rows){
        if(typeof row.key!=='string'||!row.key||seen.has(row.key)||!units.includes(row.unit)||!['qty','committedQty','freeQty'].every(k=>valid(row[k]))||!['w','l','t'].every(k=>Number.isFinite(Number(row[k]))&&Number(row[k])>0)||typeof row.grade!=='string'||!row.grade.trim())return pending('ข้อมูลรายสเปกไม่ครบ ซ้ำ หรือหน่วย/จำนวนไม่ถูกต้อง · ยังไม่สรุปยอดต้องผลิต');
        if(row.key!==`w${Number(row.w)}_l${Number(row.l)}_t${Number(row.t)}_g${row.grade}`)return pending('รหัสทะเบียนไม่ตรงขนาด ความหนา หรือเกรด · ยังไม่แสดงสเปกที่ต้องผลิต');
        seen.add(row.key);
        const qty=cents(row.qty),demand=cents(row.committedQty),backed=Math.min(qty,demand),shortage=Math.max(demand-qty,0),free=qty-backed,savedFree=cents(row.freeQty),delta=savedFree-free;
        const manual=row.manualFreeOverride===true||!!row.freeOverride;
        if(manual)manualCount++;
        if(delta&&!manual)return pending('Free บางสเปกไม่ตรงแผนและไม่มีหลักฐานค่าปรับมือ · คงยอดเดิมไว้ รอตรวจ');
        for(const [key,expected]of [['reservedInStockQty',backed],['reservedProductionQty',shortage],['productionQty',shortage]])if(row[key]!==undefined&&(!valid(row[key])||cents(row[key])!==expected))return pending('ยอดจัดสรรหรือขาดผลิตรายสเปกไม่ตรงฐานส่วนกลาง · ยังไม่แสดงผลสรุป');
        const values={physical:qty,demand,allocated:backed,shortage,formulaFree:free,savedFree,manualFreeDelta:delta};
        for(const field of fields){totals[field][row.unit]+=values[field];if(!Number.isSafeInteger(totals[field][row.unit]))return pending('ยอดรวมเกินขอบเขตที่ตรวจสอบได้');}
        const [w,l]=[Number(row.w),Number(row.l)].sort((a,b)=>a-b),t=Number(row.t),grade=row.grade.trim(),key=[w,l,t,grade,row.unit].join('|');
        const group=groups.get(key)||{key,w,l,t,grade,unit:row.unit,sourceRowCount:0,physical:0,demand:0,allocated:0,shortage:0,formulaFree:0,savedFree:0,manualFreeDelta:0};
        group.sourceRowCount++;for(const field of fields)group[field]+=values[field];groups.set(key,group);
      }
      for(const field of fields)for(const unit of units){totals[field][unit]/=100;if(!eq(totals[field][unit],allocation.totals[field][unit]))return pending('ยอดรายสเปกไม่ตรงยอดแผนส่วนกลาง · ยังไม่ยืนยันของที่มีหรือยอดต้องผลิต');}
      if(manualCount!==allocation.manualFreeOverrideCount)return pending('จำนวนค่าปรับ Free ไม่ตรงหลักฐานแผน · ยังไม่สรุปใหม่');
      const shortages=[...groups.values()].filter(r=>r.shortage>0).map(r=>{for(const field of fields)r[field]/=100;return r;}).sort((a,b)=>a.t-b.t||a.w-b.w||a.l-b.l||rank(a.grade)-rank(b.grade)||(a.grade<b.grade?-1:a.grade>b.grade?1:0)||(a.unit<b.unit?-1:a.unit>b.unit?1:0));
      const checked=bucket();for(const row of shortages)checked[row.unit]+=cents(row.shortage);for(const unit of units)if(checked[unit]!==cents(totals.shortage[unit]))return pending('รายการขาดผลิตรวมไม่ตรงยอดแผน · ยังไม่ใช้ตารางนี้');
      return {status:'verified',month,reportDate:allocation.stock.reportDate,revision:allocation.stock.revision,sourceCapturedAt:allocation.source.capturedAt,planCapturedAt:allocation.stock.planCapturedAt,sourceRowCount:stock.rows.length,manualFreeOverrideCount:manualCount,totals,current:allocation.current,carry:allocation.carry,shortages};
    }catch{return pending('ยังตรวจสต๊อกและแผนรายสเปกไม่ครบ · ไม่ใช้ยอดเก่าหรือคำนวณศูนย์แทน');}
  }
  function render(view){
    const title='<header class="ss-readiness-heading"><span>ตรวจของก่อนวางแผนผลิต</span><h3>สต๊อกจริง → จัดสรรจากคลัง → ต้องผลิตเพิ่ม</h3></header>';
    if(view?.status!=='verified')return '<section class="ss-readiness" aria-label="สต๊อกจริง จัดสรร และต้องผลิต"><div class="ss-readiness-inner">'+title+'<p class="ss-readiness-pending" role="status">'+esc(view?.reason||'รอฐานสต๊อกและแผนจองส่วนกลางที่ตรงกัน')+'</p><p class="ss-help">ยังไม่ทราบยอดที่ใช้สรุปได้ · ไม่ถือว่ายอดขาดเป็น 0 และไม่เปลี่ยนสต๊อกหรือยอดจอง</p></div></section>';
    const t=view.totals,activeUnits=units.filter(u=>[t.physical[u],t.demand[u],t.savedFree[u]].some(n=>n!==0));if(!activeUnits.length)activeUnits.push('sheet');
    const quantities=q=>activeUnits.map(u=>'<span><b>'+number(q[u])+'</b> '+unitLabel(u)+'</span>').join('');
    const box=(label,q,help,cls='')=>'<div class="ss-readiness-step '+cls+'"><h4>'+label+'</h4><div class="ss-readiness-quantity">'+quantities(q)+'</div><p>'+help+'</p></div>';
    const scopes=[['ขายแล้วเดือนนี้ · ยังไม่โหลด',view.current.soldUnloaded],['จองอื่นเดือนนี้ · ไม่ซ้ำขายแล้ว',view.current.other],['ภาระเดือนอื่นที่คงไว้ในแผน',view.carry]];
    const scopeRows=scopes.flatMap(([label,v])=>activeUnits.map(u=>'<tr><th>'+label+'</th><td>'+unitLabel(u)+'</td><td>'+number(v.demand[u])+'</td><td>'+number(v.allocated[u])+'</td><td>'+number(v.shortage[u])+'</td></tr>')).join('');
    const table=view.shortages.length?'<div class="ss-readiness-table-wrap"><table class="ss-readiness-table"><caption>ต้องผลิตเพิ่มตามภาระทั้งหมดในแผนที่บันทึก · '+view.shortages.length+' สเปก · ไม่ใช่เฉพาะเดือนนี้</caption><thead><tr><th>หนา (มม.)</th><th>ขนาดที่บันทึก (มม.)</th><th>เกรด</th><th>หน่วย</th><th>ภาระที่ผูกกับสเปกในแผน</th><th>จัดจากคลังในสเปกนี้แล้ว</th><th>ต้องผลิตเพิ่ม</th></tr></thead><tbody>'+view.shortages.map(r=>'<tr data-readiness-shortage-key="'+esc(r.key)+'"><th>'+number(r.t)+'</th><td>'+number(r.w)+' × '+number(r.l)+'</td><td>'+esc(r.grade)+'</td><td>'+unitLabel(r.unit)+'</td><td>'+number(r.demand)+'</td><td>'+number(r.allocated)+'</td><td class="ss-readiness-shortage">'+number(r.shortage)+'</td></tr>').join('')+'</tbody><tfoot>'+activeUnits.map(u=>'<tr><th colspan="6">รวมต้องผลิตเพิ่ม · '+unitLabel(u)+'</th><td class="ss-readiness-shortage">'+number(t.shortage[u])+'</td></tr>').join('')+'</tfoot></table></div>':'<p class="ss-readiness-complete">แผนที่ตรวจตรงกันนี้ไม่มีรายการขาดผลิต · ของจริงรองรับภาระที่จองไว้ครบ</p>';
    const date=value=>new Date(value).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'});
    return '<section class="ss-readiness" aria-label="สต๊อกจริง จัดสรร และต้องผลิต" data-readiness-status="verified" data-readiness-revision="'+view.revision+'"><div class="ss-readiness-inner">'+title+'<p class="ss-readiness-source">Physical / Free: รายงานเมล '+esc(view.reportDate)+' · ส่วนกลางรุ่น '+view.revision+' · ตรวจครบ '+view.sourceRowCount+' แถวทะเบียน<br>ขายเดือนปัจจุบัน '+esc(view.month)+' · อ่านหน้า 09 '+esc(date(view.sourceCapturedAt))+' · แผนที่บันทึก '+esc(date(view.planCapturedAt))+' (เวลาไทย)<br>ฐานรายงานตามวันที่ระบุ ไม่ใช่ตรวจนับคลัง ณ ขณะนี้</p><div class="ss-readiness-flow">'+box('1 · สต๊อกจริง Physical',t.physical,'จำนวนของจริงจากรายงาน · การจองไม่หัก Physical ซ้ำ')+box('2 · กันของจริงจากคลังแล้ว',t.allocated,'เฉพาะของที่มีรองรับภาระทั้งหมดในแผนที่บันทึก · ไม่รวมส่วนที่ยังขาด')+box('3 · Free ตามสูตร',t.formulaFree,'Physical − ของจริงที่กันไว้ · ไม่เอายอดขาดผลิตมาหักอีก','ss-readiness-free')+'</div><div class="ss-readiness-production">'+box('ยังไม่มีของ · ต้องผลิตเพิ่ม',t.shortage,'ภาระทั้งหมดในแผนที่บันทึก = ของที่กันไว้แล้ว + ต้องผลิตเพิ่ม · ของขาดไม่ทำให้ Physical ติดลบ','ss-readiness-need')+'</div><p class="ss-readiness-equation">'+activeUnits.map(u=>number(t.physical[u])+' Physical = '+number(t.allocated[u])+' จัดจากคลัง + '+number(t.formulaFree[u])+' Free ตามสูตร '+unitLabel(u)).join('<br>')+'</p><p class="ss-readiness-saved">Free ที่บันทึกจริง: '+activeUnits.map(u=>number(t.savedFree[u])+' '+unitLabel(u)).join(' · ')+(view.manualFreeOverrideCount?'<br><strong>มีค่าปรับ Free ด้วยมือ '+view.manualFreeOverrideCount+' สเปก</strong> · ส่วนต่างจากสูตร '+activeUnits.map(u=>(t.manualFreeDelta[u]>0?'+':'')+number(t.manualFreeDelta[u])+' '+unitLabel(u)).join(' · ')+' · คงค่าที่บันทึก ไม่ล้างหรือแก้ให้เท่ากับสูตร':' · ตรงกับ Free ตามสูตรทุกสเปก')+'</p><details class="ss-readiness-scopes"><summary>แยกภาระเดือนนี้กับเดือนอื่น · ยอดขายทั้งหมดไม่ใช่ยอดที่ต้องหักสต๊อกอีก</summary><div class="ss-readiness-table-wrap"><table class="ss-readiness-table"><thead><tr><th>ขอบเขต</th><th>หน่วย</th><th>ภาระยังต้องส่ง</th><th>มีของจากคลัง</th><th>ต้องผลิตเพิ่ม</th></tr></thead><tbody>'+scopeRows+'</tbody></table></div></details>'+table+(view.shortages.some(r=>!Number.isInteger(r.shortage))?'<p class="ss-readiness-pending">ยอดขาดมีทศนิยมจากแผนจัดสรร (เช่น การแยกเกรด MIX) · คงค่าตามหลักฐาน ไม่ปัดเป็นจำนวนสั่งผลิต · ต้องยืนยันก่อนออกคำสั่งผลิตจริง</p>':'')+'<p class="ss-help">อ่านจากแผนส่วนกลางที่บันทึกแล้ว ไม่จัดคิวหรือโยกสเปกใหม่ · ครอบคลุมเฉพาะรายการในแผนที่บันทึก ไม่ใช่ฟีดขายครบทุกเดือน · ภาระที่ผูกกับทะเบียนไม่ใช่ยอดขายต้นทางของขนาดนั้นเสมอไป เพราะแผนอาจใช้กองขนาดเทียบเท่าที่อนุมัติไว้ · ตารางคงสเปกขาดตามแผน ไม่หักกองเทียบเท่าซ้ำ<br>โหลดแล้ว/ออก INV ตามกติกาเจ้าของไม่จองซ้ำ · สถานะสุดท้ายเจรจา/Forecast ไม่จองและไม่รวมต้องผลิต เว้นแต่รับเงินแล้ว · หน่วยแผ่นกับไม้แถบแยกกัน</p></div></section>';
  }
  return {build,render};
});
