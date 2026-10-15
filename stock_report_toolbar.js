/* Prepare a saved report. A native explicit download keeps the user's gesture.
   No writes, cache acceptance, automatic clicks or draft changes. */
(() => {
  'use strict';
  const button=document.getElementById('stock-export-excel');
  const status=document.getElementById('stock-excel-status');
  if(!button||!status)return;
  const ready=document.getElementById('stock-download-ready')||document.createElement('a');
  ready.id='stock-download-ready';ready.textContent='ดาวน์โหลดไฟล์ Excel';ready.hidden=true;
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
    // A prior prepared report must not remain clickable during a newer read.
    clearReady();
    busy=true;const generation=pageGeneration;button.disabled=true;status.dataset.error='false';
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
      status.textContent='เตรียมไฟล์แล้ว · รายงาน '+report.reportDate+' · ครบ '+report.rows.length+' สเปก'+(report.warnings?.length?' · มีข้อมูลรอตรวจ ดูหมายเหตุในไฟล์':'')+' · กดดาวน์โหลดไฟล์ Excel · ไม่เปลี่ยนยอดสต๊อก';
    }catch(error){
      status.dataset.error='true';
      status.textContent='ยังส่งออกไม่ได้ · '+(error?.userMessage||error?.message||'กรุณาตรวจการเชื่อมต่อและสิทธิ์');
    }finally{busy=false;button.disabled=false;}
  });
})();
