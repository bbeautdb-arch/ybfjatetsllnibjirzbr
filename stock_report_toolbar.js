/* Read-only Excel download from a fresh authorized saved snapshot.
   Keep a native download link available if the browser blocks the first attempt. */
(() => {
  'use strict';
  const button=document.getElementById('stock-export-excel');
  const status=document.getElementById('stock-excel-status');
  if(!button||!status)return;
  button.textContent='ดาวน์โหลด Excel';
  button.title='ดาวน์โหลดรายการครบทุกสเปกจากข้อมูลส่วนกลางที่บันทึกแล้ว';
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  const ready=document.getElementById('stock-download-ready')||document.createElement('a');
  ready.id='stock-download-ready';ready.textContent='ดาวน์โหลดไฟล์ Excel อีกครั้ง';ready.hidden=true;
  if(!ready.parentNode)button.insertAdjacentElement('afterend',ready);
  let busy=false,objectUrl=null,disposed=false,pageGeneration=0;
  const clearReady=()=>{
    ready.hidden=true;ready.removeAttribute('href');ready.removeAttribute('download');
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
  };
  window.addEventListener('pagehide',()=>{disposed=true;pageGeneration++;clearReady();});
  window.addEventListener('pageshow',()=>{disposed=false;});
  button.addEventListener('click',async()=>{
    if(busy||disposed)return;
    // Never leave a stale workbook available while reading a newer snapshot.
    clearReady();
    busy=true;const generation=pageGeneration;button.disabled=true;
    button.textContent='กำลังเตรียม Excel…';status.dataset.error='false';
    status.textContent='กำลังอ่านสต๊อกส่วนกลางที่บันทึกแล้ว…';
    try{
      if(!window.AAFSalesPreview?.readExportSnapshot||!window.AAFStockReportExport?.build||!window.AAFStockReportExport?.createWorkbook||typeof window.XLSX?.write!=='function')throw new Error('เครื่องมือส่งออกยังโหลดไม่ครบ กรุณาลองอีกครั้ง');
      const snapshot=await window.AAFSalesPreview.readExportSnapshot();
      if(disposed||generation!==pageGeneration)return;
      const report=window.AAFStockReportExport.build(snapshot.stock,{catalog:snapshot.catalog,exportedAt:snapshot.verifiedAt});
      const workbook=window.AAFStockReportExport.createWorkbook(report,window.XLSX);
      const bytes=window.XLSX.write(workbook,{type:'array',bookType:'xlsx',compression:true});
      const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      objectUrl=URL.createObjectURL(blob);ready.href=objectUrl;ready.download=report.fileName;ready.hidden=false;
      const details='รายงาน '+report.reportDate+' · ครบ '+report.rows.length+' สเปก'+(report.warnings?.length?' · มีข้อมูลรอตรวจ ดูหมายเหตุในไฟล์':'');
      // A request to the browser is not proof that it saved the file. Keep the
      // explicit, user-gesture link for browsers that suppress this attempt.
      status.textContent='เตรียมไฟล์แล้ว · '+details+' · หากไฟล์ยังไม่ลงเครื่อง กด “ดาวน์โหลดไฟล์ Excel อีกครั้ง” · ไม่เปลี่ยนยอดสต๊อก';
      try{ready.click();}catch(_){
        status.textContent='เตรียมไฟล์แล้ว · '+details+' · กรุณากด “ดาวน์โหลดไฟล์ Excel อีกครั้ง” เพื่อบันทึกลงเครื่อง · ไม่เปลี่ยนยอดสต๊อก';
      }
    }catch(error){
      clearReady();status.dataset.error='true';
      status.textContent='ยังส่งออกไม่ได้ · '+(error?.userMessage||error?.message||'กรุณาตรวจการเชื่อมต่อและสิทธิ์');
    }finally{busy=false;button.disabled=false;button.textContent='ดาวน์โหลด Excel';}
  });
})();
