/* Read-only categories from the saved Page09 plan. Payment is an independent,
   unknown dimension: PI/readiness/shipping must never be treated as payment. */
(() => {
  'use strict';
  const fields=['pi','negotiation','forecast','shipping','other'];
  const labels={pi:'เปิด PI',negotiation:'เจรจา',forecast:'Forecast',shipping:'มีเรือ',other:'สถานะอื่น / รอตรวจ'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Number(n).toLocaleString('th-TH',{maximumFractionDigits:2});
  const empty=()=>Object.fromEntries([...fields,'total'].map(k=>[k,0]));
  function hundredths(n){
    if(typeof n!=='number'||!Number.isFinite(n)||n<0||!Number.isSafeInteger(Math.round(n*100))||Math.abs(n*100-Math.round(n*100))>0.000001)throw Error('จำนวนแยกสถานะไม่ถูกต้อง');
    return Math.round(n*100);
  }
  const add=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n))throw Error('ยอดแยกสถานะเกินขอบเขต');return n;};
  function bucket(value){
    if(!value||value.paid!==null)throw Error('ไม่มีหลักฐานแยกจำนวนจ่ายเงินแล้ว');
    const b=Object.fromEntries([...fields,'total'].map(k=>[k,hundredths(value[k])]));
    if(fields.reduce((n,k)=>add(n,b[k]),0)!==b.total)throw Error('ผลรวมสถานะไม่ตรงยอดจอง');
    return b;
  }
  const normal=b=>({...Object.fromEntries([...fields,'total'].map(k=>[k,b[k]/100])),paid:null});
  function build(data){
    const source=data?.reservationBreakdown;
    const unknown=(status,reason)=>({version:1,status,reason,sourceCapturedAt:source?.sourceCapturedAt||null,month:source?.month||null,appliedAt:source?.appliedAt||null,planChecksum:source?.planChecksum||null,needsSalesRefresh:!!(source?.needsSalesRefresh||data?.sellablePlan?.needsSalesRefresh),paymentEvidence:'not-captured',byKey:{},totals:{sheet:null,strip:null}});
    if(!source||source.status==='unavailable')return unknown('unavailable','ยังไม่มีข้อมูลแยกสถานะจากแผนที่บันทึก');
    if(source.status!=='verified')return unknown('mismatch','ยังยืนยันการแยกยอดไม่ได้ กรุณาตรวจข้อมูลส่วนกลาง');
    try{
      if(source.version!==1||source.paymentEvidence!=='not-captured'||!Array.isArray(data.rows)||!data.rows.length||!source.byKey||typeof source.byKey!=='object'||Array.isArray(source.byKey))throw Error('ข้อมูลแยกสถานะไม่ครบ');
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(source.month)||typeof source.sourceCapturedAt!=='string'||!Number.isFinite(Date.parse(source.sourceCapturedAt))||typeof source.appliedAt!=='string'||!Number.isFinite(Date.parse(source.appliedAt))||typeof source.planChecksum!=='string'||!source.planChecksum)throw Error('ไม่พบวันเวลาและหลักฐานของแผน');
      const plan=data.sellablePlan;
      if(plan&&((plan.checksum&&source.planChecksum!==plan.checksum)||(plan.month&&source.month!==plan.month)||(plan.source?.capturedAt&&source.sourceCapturedAt!==plan.source.capturedAt)||(plan.appliedAt&&source.appliedAt!==plan.appliedAt)))throw Error('หลักฐานสถานะไม่ตรงแผนที่บันทึก');
      const byKey={},seen=new Set(),totals={sheet:empty(),strip:empty()};
      for(const r of data.rows){
        const key=`w${Number(r.w)}_l${Number(r.l)}_t${Number(r.t)}_g${r.grade}`;
        if(!r.key||r.key!==key||seen.has(key)||!['sheet','strip'].includes(r.unit)||!r.grade||['w','l','t'].some(k=>!Number.isFinite(Number(r[k]))||Number(r[k])<=0))throw Error('สเปกหรือหน่วยสำหรับยอดจองไม่ตรง');
        seen.add(key);
        const committed=hundredths(r.committedQty),value=Object.prototype.hasOwnProperty.call(source.byKey,key)?source.byKey[key]:null;
        if(!value&&committed!==0)throw Error('ขาดรายละเอียดของรายการที่มียอดจอง');
        const b=value?bucket(value):empty();
        if(b.total!==committed)throw Error('สถานะรวมไม่เท่ายอดจองที่บันทึก');
        for(const k of [...fields,'total'])totals[r.unit][k]=add(totals[r.unit][k],b[k]);
        byKey[key]=normal(b);
      }
      if(Object.keys(source.byKey).some(k=>!seen.has(k)))throw Error('พบสถานะของสเปกนอกตารางสต๊อก');
      for(const unit of ['sheet','strip']){
        const expected=bucket(source.totals?.[unit]);
        for(const k of [...fields,'total'])if(expected[k]!==totals[unit][k])throw Error('ยอดรวมแยกหน่วยไม่ตรง');
      }
      return {...unknown('verified',null),byKey,totals:{sheet:normal(totals.sheet),strip:normal(totals.strip)}};
    }catch{return unknown('mismatch','ยอดแยกสถานะไม่ตรงยอดจองเดิม จึงยังไม่แสดงตัวเลขแยก');}
  }
  function renderBuckets(b){
    if(!b)return '<small class="reservation-breakdown reservation-unknown">จ่ายเงินแล้ว — ยังไม่มีหลักฐาน<br>เปิด PI —<br>เจรจา —<br>Forecast —<br>ยังยืนยันยอดแยกไม่ได้</small>';
    return `<small class="reservation-breakdown">${fields.filter(k=>!['shipping','other'].includes(k)||b[k]>0).map(k=>`${labels[k]} ${fmt(b[k])}`).join('<br>')}<br><span class="reservation-payment">จ่ายเงินแล้ว — ยังไม่มีหลักฐาน</span><br>สถานะจ่ายไม่บวกซ้ำกับยอดจอง</small>`;
  }
  function describe(m){
    if(m.status!=='verified')return m.reason+' · คงยอดจองรวมเดิม · จำนวนจ่ายแล้วไม่ทราบ ไม่ใช่ 0';
    return `ยอดแยกจากหน้า 09 เดือน ${m.month} · อ่าน ${new Date(m.sourceCapturedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · เปิด PI / เจรจา / Forecast / มีเรือ / อื่น รวมเท่าจองเดิม · จ่ายเงินแล้ว: ยังไม่มีหลักฐาน${m.needsSalesRefresh?' · ใช้แผนเดิม ยังรอทบทวนหลังอัปเดตเมล':''}`;
  }
  function renderTotals(m){
    return `<div class="reservation-totals"><p>${esc(describe(m))}</p>${m.status==='verified'?['sheet','strip'].filter(u=>m.totals[u].total>0).map(u=>`<div><b>${u==='sheet'?'แผ่น':'ชิ้น strip'} · จอง ${fmt(m.totals[u].total)}</b>${renderBuckets(m.totals[u])}</div>`).join(''):''}</div>`;
  }
  window.AAFStockReservations={build,renderBuckets,renderTotals,describe};
})();
