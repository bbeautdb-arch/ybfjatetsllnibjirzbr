/* Standalone report: authorized GETs only. Shares presentation with the stock
   page, not its editing/import/migration code. No writes to stock or storage. */
(() => {
  'use strict';
  const API='https://aaf-grade-insight-2569.bbeautybbsoraai.chatgpt.site/api/aaf/stock';
  const status=document.getElementById('report-status');
  const refresh=document.getElementById('report-refresh');
  const signin=document.getElementById('report-signin');
  let busy=false,revision=null,authRequired=false;
  const tell=(message,error=false)=>{status.textContent=message;status.dataset.error=String(error);};
  function sessionToken(){
    try{const user=JSON.parse(sessionStorage.getItem('aaf_user'));return user?.stockSessionToken||user?.gradeBridgeSessionToken||user?.bridgeSessionToken||'';}catch{return '';}
  }
  function values(r,data){
    const price=r.priceObj?.price||0,curr=r.priceObj?.currency||'THB',thb=price*(curr==='USD'?data.exchangeRate:1);
    return {price,curr,eq:r.qty*(Number(r.w)*Number(r.l)/2976800)*(Number(r.t)/2.5),value:r.qty*thb,freeValue:r.freeQty*thb};
  }
  function fail(message,login=false){
    revision=null;authRequired=login;signin.hidden=!login;tell(message,true);
    window.AAFStockSummary?.showError(login?'กรุณาเข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์ดูสต๊อก แล้วกลับมาเปิดหน้ารายงานนี้':message);
    document.title='รายงานสต๊อก AAF';
  }
  async function load(force=false){
    if(busy)return;
    const token=sessionToken();if(!token){fail('ต้องเข้าสู่ระบบ AAF ก่อนดูรายงาน — ใช้สิทธิ์เดียวกับหน้าสต๊อก',true);return;}
    busy=true;refresh.disabled=true;
    if(force||revision===null)tell('กำลังโหลดข้อมูลที่บันทึกแล้วจากระบบส่วนกลาง…');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const res=await fetch(API,{method:'GET',cache:'no-store',headers:{Authorization:'Bearer '+token},signal:controller.signal});
      if(res.status===401||res.status===403){fail('เซสชันหมดอายุหรือบัญชีนี้ไม่มีสิทธิ์ดูสต๊อก กรุณาเข้าสู่ระบบอีกครั้ง',true);return;}
      if(!res.ok)throw new Error('โหลดรายงานไม่ได้ กรุณาลองใหม่');
      const data=await res.json();if(!data.ok)throw new Error(data.error||'โหลดรายงานไม่ได้');
      if(!window.AAFStockSummary)throw new Error('โหลดส่วนแสดงรายงานไม่สำเร็จ กรุณารีเฟรชหน้านี้');
      // The API remains the authorization authority; the client role is never a grant.
      if(force||revision===null||String(data.revision)!==revision){
        window.AAFStockSummary.update(data,r=>values(r,data));revision=String(data.revision);
      }
      signin.hidden=true;authRequired=false;
      const now=new Date().toLocaleString('th-TH',{timeZone:'Asia/Bangkok'});
      tell('ข้อมูลที่กดเซฟแล้วทั้งชุด · ตรวจสอบล่าสุด '+now+' · หน้านี้ดูข้อมูลอย่างเดียว');
      document.title='รายงานสต๊อก AAF · '+(data.report?.reportDate||'');
    }catch(e){fail(e.name==='AbortError'?'ระบบตอบกลับช้า กรุณากดโหลดข้อมูลล่าสุดอีกครั้ง':'ยังแสดงรายงานไม่ได้: '+e.message);}
    finally{clearTimeout(timeout);busy=false;refresh.disabled=false;}
  }
  refresh.addEventListener('click',()=>load(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  window.addEventListener('pageshow',e=>{if(e.persisted)load(true);});
  // A lightweight page refresh, not an AI task. Pause while hidden or login is required.
  setInterval(()=>{if(!document.hidden&&!authRequired)load();},15000);
  load(true);
})();
