/* Download a saved report only. No writes, cache acceptance or draft changes. */
(() => {
  'use strict';
  const button=document.getElementById('stock-export-excel');
  const status=document.getElementById('stock-excel-status');
  if(!button||!status)return;
  let busy=false;
  button.addEventListener('click',async()=>{
    if(busy)return;
    busy=true;button.disabled=true;status.dataset.error='false';
    status.textContent='กำลังอ่านสต๊อกส่วนกลางที่บันทึกแล้ว…';
    try{
      if(!window.AAFSalesPreview?.readExportSnapshot||!window.AAFStockReportExport?.download)throw new Error('เครื่องมือส่งออกยังโหลดไม่ครบ กรุณาลองอีกครั้ง');
      const snapshot=await window.AAFSalesPreview.readExportSnapshot();
      const report=window.AAFStockReportExport.download(snapshot.stock,{catalog:snapshot.catalog,exportedAt:snapshot.verifiedAt},window.XLSX);
      status.textContent='ส่งออก Excel แล้ว · รายงาน '+report.reportDate+' · ครบ '+report.rows.length+' สเปก'+(report.warnings?.length?' · มีข้อมูลรอตรวจ ดูหมายเหตุในไฟล์':'')+' · ไม่เปลี่ยนยอดสต๊อก';
    }catch(error){
      status.dataset.error='true';
      status.textContent='ยังส่งออกไม่ได้ · '+(error?.userMessage||error?.message||'กรุณาตรวจการเชื่อมต่อและสิทธิ์');
    }finally{busy=false;button.disabled=false;}
  });
})();
