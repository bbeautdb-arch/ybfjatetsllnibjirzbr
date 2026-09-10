/* Pure morning export model. No network, storage, stock writes, or price invention. */
(() => {
  'use strict';
  const RULES='aaf-sellable-20260910-v2';
  const fail=message=>{throw Error(message);};
  function build(data,today){
    if(!data?.permissions?.adjust)fail('เฉพาะเจ้าของบัญชีเท่านั้นที่เตรียมไฟล์ส่งฝ่ายขายได้');
    if(data.stockWorkflowVersion!==1||data.sellableRules!==RULES)fail('ต้องบันทึกกติกาโยกในระบบกลางก่อนส่งฝ่ายขาย');
    if(!data.report||data.report.reportDate!==today)fail('ยังไม่มีรายงานเมลของวันนี้ ห้ามส่งรายงานเก่าเป็นของวันนี้');
    if(!Number.isSafeInteger(data.revision)||!data.report.checksum||!Array.isArray(data.rows)||!data.rows.length)fail('ข้อมูลส่วนกลางไม่ครบ');
    if(!Number.isFinite(data.exchangeRate)||data.exchangeRate<=0)fail('อัตราแลกเปลี่ยนไม่ถูกต้อง');
    const seen=new Set(),skuClaims=new Map(),stock=[],missing=[],totals={sheet:0,strip:0};
    for(const r of data.rows){
      const key=[Number(r.w),Number(r.l),Number(r.t),r.grade].join('|');
      // Sales04 normalizes orientation. Fail closed instead of letting it collapse our distinct specs.
      const importerKey=[...([Number(r.w),Number(r.l)].sort((a,b)=>a-b)),Number(r.t),r.grade].join('|');
      if(!['w','l','t'].every(k=>Number.isFinite(Number(r[k]))&&Number(r[k])>0)||!Number.isSafeInteger(r.qty)||r.qty<0||!['sheet','strip'].includes(r.unit)||!['AV','AAA','A','B','F','REJ','C','UN','CTS'].includes(r.grade))fail('ขนาด หน่วย เกรด หรือ Physical ไม่ถูกต้อง: '+key);
      if(r.qty===0)continue; // Sales04 zeros omitted quantities while keeping existing identities.
      if(seen.has(importerKey))fail('สเปกชนกันเมื่อเว็บขายสลับกว้าง/ยาว: '+key);seen.add(importerKey);
      const sku=String(r.exportSku||r.sku||'').trim(),aliases=sku.split(',').map(s=>s.trim());
      if(!sku||aliases.some(s=>!s)||r.skuNeedsReview)fail('ต้องตรวจรหัสสินค้าก่อนส่ง: '+key);
      for(const code of aliases){if(skuClaims.has(code)&&skuClaims.get(code)!==key)fail('รหัสสินค้าซ้ำต่างสเปก: '+code);skuClaims.set(code,key);}
      const p=r.priceObj;
      if(!r.priceConfirmed||r.priceMissing||!p||!Number.isFinite(p.price)||p.price<=0||!['THB','USD'].includes(p.currency))missing.push(key);
      const value=p?.price*r.qty*(p?.currency==='USD'?data.exchangeRate:1);
      if(p?.price>0&&!Number.isFinite(value))fail('มูลค่าเกินขอบเขต: '+key);
      const unit=r.unit==='strip'?'strip':'sheet';totals[unit]+=r.qty;
      if(!Number.isSafeInteger(totals[unit]))fail('ยอดรวมเกินขอบเขต');
      stock.push([sku,Number(r.w),Number(r.l),Number(r.t),r.grade,r.qty,0,r.qty,p?.price,p?.currency,value,unit==='strip'?'ชิ้น strip':'แผ่น']);
    }
    if(missing.length)fail('ยังส่งไม่ได้: '+missing.length+' สเปกไม่มีราคาที่ตรวจยืนยัน (ไม่ใช้ 0 แทนราคา)\n'+missing.join('\n'));
    if(!stock.length)fail('ไม่มีสต๊อกสำหรับส่ง');
    const total=totals.sheet+totals.strip;
    return {stock:[['SKU','กว้าง','ยาว','หนา','เกรด','Physical','ยอดจอง','Free','ราคาต่อแผ่น','สกุลเงิน','มูลค่าสต๊อก (THB)','หน่วย'],...stock],
      summary:[['รายการ','ค่า'],['วันที่รายงาน',today],['จำนวนสเปก',stock.length],['Physical รวม',total],['Free รวม',total],['แผ่น',totals.sheet],['ชิ้น strip',totals.strip],['นโยบาย','Physical หลังโยกและค่าปรับมือที่เซฟแล้ว ก่อนหักจอง; ยอดจองในไฟล์ 0, Free = Physical'],['ข้อควรตรวจ','ตัวนำเข้าเว็บขายเขียนทับราคาและรีเซ็ต Aging; ต้องเทียบราคาเดิมก่อนนำเข้า ไฟล์นี้ไม่ใช่หลักฐานว่าส่งแล้ว']],
      source:[['หลักฐาน','ค่า'],['URL','https://bbeautdb-arch.github.io/AAF-System/stock_manager.html'],['รายงานเมล',data.report.reportDate],['Checksum เมล',data.report.checksum],['Revision',data.revision],['กติกา',RULES],['บันทึกส่วนกลางเมื่อ',data.updatedAt||''],['USD/THB',data.exchangeRate]],
      fileName:'AAF_Stock_For_Sales_'+today+'.xlsx',totals};
  }
  window.AAFStockSalesExport={build};
})();
