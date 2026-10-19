/* Read-only download model. Callers supply fresh authorized saved responses.
   This is not the Sales04 import workbook: reservations and zero rows stay intact. */
(() => {
  'use strict';
  const host=typeof window==='undefined'?globalThis:window;
  const owns=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
  const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const text=value=>typeof value==='string'?value:typeof value==='number'&&Number.isFinite(value)?String(value):'';
  const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:null;
  const qty=(value,label)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('จำนวนไม่ถูกต้อง: '+label);return value;};
  const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value?value:null;
  const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:'';
  const unitLabel=unit=>unit==='sheet'?'แผ่น':'ชิ้น strip';
  const catalogContext='aaf-sales-stock-preview|free-price-catalog';
  const normalKey=r=>[Number(r.t),r.grade,Number(r.w),Number(r.l),r.unit].join('|');
  const reverseKey=r=>[Number(r.t),r.grade,Number(r.l),Number(r.w),r.unit].join('|');
  const noteKey=r=>[Number(r.t),r.grade,Math.min(Number(r.w),Number(r.l)),Math.max(Number(r.w),Number(r.l)),r.unit].join('|');
  const noteHeaders=['หมายเหตุสต๊อก','ผู้บันทึกหมายเหตุ','เวลาบันทึกหมายเหตุ','ติดตามการขาย','ผู้ติดตาม','เวลาติดตาม','หมายเหตุสเปกในชุดราคา','หมายเหตุความหนาเดิม'];
  const headers=['ลำดับ','SKU เดิม/aliases','SKU ส่งออกที่บันทึก','SKU ในรายงานเมล','กว้าง (mm)','ยาว (mm)','หนา (mm)','เกรด','หน่วย','ยอดเมลเดิม','Physical','ยอดจอง','Free','ราคาประเมินต่อหน่วย','สกุลเงิน','มูลค่า Physical (THB)','มูลค่า Free (THB)','สถานะราคา/มูลค่า','Aging 0–90','Aging 91–180','Aging 181–270','Aging 271–360','Aging เกิน360',...noteHeaders,'รายละเอียดสินค้า','แหล่งแถว','เวลาปรับ Physical','เวลาปรับ Free'];
  function readCatalog(stock,response){
    if(!response)return {value:null,revision:null};
    if(response.ok===false)throw Error('ยังยืนยันข้อมูลราคาส่วนกลางไม่ได้');
    if(response.revision!==stock.revision)throw Error('สต๊อกกับชุดราคาเป็นคนละรุ่น กรุณาโหลดข้อมูลใหม่');
    if(response.stockReportDate!==undefined&&response.stockReportDate!==stock.report.reportDate)throw Error('สต๊อกกับชุดราคาอ้างอิงคนละวัน');
    const value=response.widgetState?.privateContent;
    if(!value)return {value:null,revision:response.catalogRevision??null};
    const legacy=[1,2].includes(value.version)&&/^\d{4}-\d{2}-\d{2}\|[\d.]+\|(THB-)?per-sheet$/.test(value.context||'');
    if(!(legacy||value.version===3&&value.context===catalogContext)||!plain(value.prices)||value.currencies!==undefined&&!plain(value.currencies)||value.notesBySpec!==undefined&&!plain(value.notesBySpec)||value.notesByThickness!==undefined&&!plain(value.notesByThickness))throw Error('รูปแบบชุดราคาที่บันทึกไม่ถูกต้อง');
    return {value,revision:response.catalogRevision??null};
  }
  function readFx(options,catalog){
    if(owns(options,'fx')){
      const fx=options.fx;
      const valid=fx&&['ok','available','verified','fresh'].includes(fx.status)&&positive(fx.rate)!==null&&date(fx.date);
      return {rate:valid?fx.rate:null,date:valid?fx.date:'',source:valid?'อัตราแลกเปลี่ยนที่ยืนยันแล้ว':'ยังไม่มีอัตราแลกเปลี่ยนที่ยืนยัน'};
    }
    return {rate:positive(catalog?.fx),date:timestamp(catalog?.savedAt),source:'อัตราแลกเปลี่ยนที่บันทึกในชุดราคา ไม่ใช่การดึงเรทใหม่'};
  }
  function build(stock,options={}){
    if(!stock||stock.ok===false||!date(stock.report?.reportDate)||!Array.isArray(stock.rows)||!stock.rows.length||!Number.isSafeInteger(stock.revision)||stock.revision<0)throw Error('ยังไม่มีรายงานสต๊อกส่วนกลางที่พร้อมดาวน์โหลด');
    const exportedAt=options.exportedAt??new Date().toISOString();
    if(!timestamp(exportedAt))throw Error('เวลาสร้างรายงานไม่ถูกต้อง');
    const saved=readCatalog(stock,options.catalog),catalog=saved.value,fx=readFx(options,catalog);
    const totals=Object.fromEntries(['sheet','strip'].map(unit=>[unit,{count:0,physical:0,reserved:0,free:0,knownPhysicalValueTHB:0,knownFreeValueTHB:0,valuedPhysicalRows:0,valuedFreeRows:0,unpricedRows:0,unpricedPhysical:0,unpricedFree:0,missingFxRows:0,missingFxPhysical:0,missingFxFree:0}]));
    const warnings=new Set(),keys=new Set();
    if(!catalog)warnings.add('ยังไม่มีชุดราคาที่บันทึกหรือยังอ่านชุดราคาไม่ได้ ช่องราคาและมูลค่าเว้นว่าง ไม่ใช้ราคาเก่าหรือศูนย์แทน');
    const plan=stock.sellablePlan,planDay=date(plan?.reportDate),reservationCurrent=!!planDay&&planDay===stock.report.reportDate&&plan.needsSalesRefresh===false;
    if(!reservationCurrent)warnings.add('ยอดจองและ Free เป็นค่าที่บันทึกอยู่ ยังไม่ยืนยันว่าอัปเดตยอดขายล่าสุด'+(planDay?' (แผนจองอ้างอิง '+planDay+')':' (ไม่มีวันที่แผนจองที่ยืนยัน)')+' ไม่ได้ปรับวันหรือตัดจองใหม่ในไฟล์นี้');
    const rows=stock.rows.map((r,index)=>{
      if(!r||!['sheet','strip'].includes(r.unit)||!['w','l','t'].every(k=>Number.isFinite(Number(r[k]))&&Number(r[k])>0)||!['AV','AAA','A','B','F','REJ','C','UN','CTS'].includes(r.grade))throw Error('ขนาด เกรด หรือหน่วยไม่ครบในแถว '+(index+1));
      const key=text(r.key)||normalKey(r);
      if(keys.has(key))throw Error('พบรหัสแถวซ้ำในรายงาน '+key);keys.add(key);
      const row={index:index+1,key,sku:text(r.sku),rawSku:text(r.rawSku),exportSku:text(r.exportSku),aliases:Array.isArray(r.aliases)?r.aliases.filter(v=>typeof v==='string').join(', '):text(r.aliases),w:r.w,l:r.l,t:r.t,grade:r.grade,unit:r.unit,
        baseQty:qty(r.baseQty,key+' ยอดเมล'),physical:qty(r.qty,key+' Physical'),reserved:qty(r.committedQty,key+' ยอดจอง'),free:qty(r.freeQty,key+' Free'),
        price:null,currency:'',physicalValueTHB:null,freeValueTHB:null,priceStatus:'',desc:text(r.desc),rawSource:typeof r.rawSource==='boolean'?r.rawSource:null,retained:r.retained===true,
        note:text(r.note),noteBy:text(r.noteBy),noteAt:text(r.noteAt),followup:text(r.followup),followupBy:text(r.followupBy),followupAt:text(r.followupAt),specNote:text(catalog?.notesBySpec?.[noteKey(r)]),thicknessNote:text(catalog?.notesByThickness?.[String(Number(r.t))]),
        physicalAt:text(r.physicalOverride?.at),freeAt:text(r.freeOverride?.at)};
      for(const k of ['d90','d180','d270','d360','dOver']){
        row[k]=r[k]===undefined||r[k]===null?null:qty(r[k],key+' '+k);
        if(row[k]===null)warnings.add('บางแถวไม่มีค่า Aging ในข้อมูลที่อ่านได้ ช่องนั้นเว้นว่าง');
      }
      const ownPrice=k=>owns(catalog?.prices,k)||owns(catalog?.currencies,k);
      const selected=ownPrice(normalKey(r))?normalKey(r):ownPrice(reverseKey(r))?reverseKey(r):normalKey(r);
      row.price=catalog?positive(catalog.prices[selected]):null;
      const code=catalog?.currencies?.[selected];
      row.currency=row.price!==null||code!==undefined?(code===undefined?'THB':text(code)):'';
      if(row.price===null){row.priceStatus='ยังไม่มีราคาที่บันทึก';}
      else if(!['THB','USD'].includes(row.currency)){row.priceStatus='ยังยืนยันสกุลเงินไม่ได้';}
      else if(row.currency==='USD'&&fx.rate===null){row.priceStatus='มีราคา USD แต่ยังไม่มีอัตราแลกเปลี่ยนที่ยืนยัน';}
      else {
        const rate=row.currency==='USD'?fx.rate:1;
        row.physicalValueTHB=row.physical*row.price*rate;row.freeValueTHB=row.free*row.price*rate;
        if(!Number.isFinite(row.physicalValueTHB)||!Number.isFinite(row.freeValueTHB))throw Error('มูลค่าเกินขอบเขต '+key);
        row.priceStatus='ราคาประเมินที่บันทึก ไม่ใช่ราคาขายรายออเดอร์';
      }
      const total=totals[row.unit];total.count++;total.physical+=row.physical;total.reserved+=row.reserved;total.free+=row.free;
      if(row.physicalValueTHB!==null){total.knownPhysicalValueTHB+=row.physicalValueTHB;total.knownFreeValueTHB+=row.freeValueTHB;if(row.physical>0)total.valuedPhysicalRows++;if(row.free>0)total.valuedFreeRows++;}
      else if(row.price!==null&&row.currency==='USD'){total.missingFxRows++;total.missingFxPhysical+=row.physical;total.missingFxFree+=row.free;}
      else {total.unpricedRows++;total.unpricedPhysical+=row.physical;total.unpricedFree+=row.free;}
      if(row.priceStatus!=='ราคาประเมินที่บันทึก ไม่ใช่ราคาขายรายออเดอร์')warnings.add('มีรายการที่ราคา/มูลค่ายังไม่ครบ ดูคอลัมน์สถานะราคา/มูลค่า ไม่ตีเป็นศูนย์');
      return row;
    });
    for(const total of Object.values(totals)){
      if(Object.values(total).some(v=>!Number.isFinite(v)))throw Error('ยอดรวมเกินขอบเขต');
      total.physicalValueTHB=total.unpricedPhysical+total.missingFxPhysical>0?null:total.knownPhysicalValueTHB;
      total.freeValueTHB=total.unpricedFree+total.missingFxFree>0?null:total.knownFreeValueTHB;
    }
    const reportDate=stock.report.reportDate;
    const summary=[['รายงานสต๊อกที่บันทึกในระบบ'],['รายงานเมลอ้างอิง',reportDate],['สร้างไฟล์เมื่อ (UTC)',exportedAt],['บันทึกสต๊อกเมื่อ',text(stock.updatedAt)],['รุ่นข้อมูลสต๊อก',stock.revision],['จำนวนสเปกทั้งหมด รวมสต๊อก 0',rows.length],['วันที่แผนจองอ้างอิง',planDay||''],['เดือนแผนจอง',text(plan?.month)],['บันทึกแผนจองเมื่อ',text(plan?.appliedAt)],['สถานะยอดจอง/Free',reservationCurrent?'แผนจองอ้างอิงวันเดียวกับสต๊อก ใช้ยอดที่บันทึก':'รอตรวจยอดขายล่าสุด ใช้ยอดจองและ Free ที่บันทึกอยู่'],['รุ่นชุดราคา',saved.revision],['บันทึกชุดราคาเมื่อ',text(catalog?.savedAt)],['USD/THB ที่ใช้',fx.rate],['วันที่/เวลาหลักฐานอัตราแลกเปลี่ยน',fx.date],['แหล่งอัตราแลกเปลี่ยน',fx.source],[],['หน่วย','จำนวนสเปก','Physical','ยอดจอง','Free','มูลค่า Physical ที่ทราบ (THB)','มูลค่า Free ที่ทราบ (THB)','Physical ไม่มีราคา/FX','Free ไม่มีราคา/FX','สถานะมูลค่า']];
    for(const unit of ['sheet','strip']){const t=totals[unit],unknownPhysical=t.unpricedPhysical+t.missingFxPhysical,unknownFree=t.unpricedFree+t.missingFxFree,incomplete=t.physicalValueTHB===null||t.freeValueTHB===null;summary.push([unitLabel(unit),t.count,t.physical,t.reserved,t.free,unknownPhysical>0&&t.valuedPhysicalRows===0?null:t.knownPhysicalValueTHB,unknownFree>0&&t.valuedFreeRows===0?null:t.knownFreeValueTHB,unknownPhysical,unknownFree,incomplete?(t.valuedPhysicalRows===0&&t.valuedFreeRows===0?'ยังไม่มีมูลค่าที่ทราบ ไม่ตีเป็นศูนย์':'มูลค่ารวมยังไม่ครบ แสดงเฉพาะส่วนที่ทราบ'):'ครบสำหรับจำนวนที่มีอยู่']);}
    summary.push([],['วิธีอ่าน','แผ่นและชิ้น strip แยกกัน ไม่บวกจำนวนข้ามหน่วย'],['ราคา','ใช้ชุดราคาประเมินสต๊อกที่บันทึกตามสเปกจริง ไม่ใช่ราคาขายหรือยอดรับเงินจริง'],['ขอบเขต','ทุกสเปกในทะเบียน รวมสต๊อก 0 ไม่รวมร่างที่ยังไม่ได้เซฟ'],['ประเภทไฟล์','รายงานสต๊อกและหมายเหตุรายสินค้า ไม่ใช่ไฟล์นำเข้าสต๊อกหน้า Sales04'],['กรอกหมายเหตุรายสินค้า','แก้คอลัมน์ AD: หมายเหตุสเปกในชุดราคา ในชีต สต๊อกทุกสเปก แล้วใช้ปุ่ม นำเข้าหมายเหตุจาก Excel ใน Free'],['นำเข้ากลับ','ตรวจข้อความก่อน–หลังแล้วกดบันทึกเฉพาะหมายเหตุ ช่องว่างไม่ลบของเดิม ไม่เปลี่ยนยอดสต๊อก ยอดจอง ราคา หรือสกุลเงิน'],['หมายเหตุ AE','เป็นหมายเหตุเดิมรวมรายความหนา ไม่ใช่หมายเหตุเฉพาะสินค้า และไม่นำเข้าอัตโนมัติ'],['แหล่งข้อมูล','https://bbeautdb-arch.github.io/ybfjatetsllnibjirzbr/stock_manager.html'],['Checksum รายงานเมล',text(stock.report.checksum)]);
    for(const warning of warnings)summary.push(['ข้อมูลที่ต้องตรวจ',warning]);
    const detail=rows.map(r=>[r.index,r.sku,r.exportSku,r.rawSku,Number(r.w),Number(r.l),Number(r.t),r.grade,unitLabel(r.unit),r.baseQty,r.physical,r.reserved,r.free,r.price,r.currency,r.physicalValueTHB,r.freeValueTHB,r.priceStatus,r.d90,r.d180,r.d270,r.d360,r.dOver,r.note,r.noteBy,r.noteAt,r.followup,r.followupBy,r.followupAt,r.specNote,r.thicknessNote,r.desc,r.retained?'เก็บทะเบียนเดิม ไม่พบในเมล':r.rawSource===true?'รายการจากเมล':r.rawSource===false?'รายการหลังโยก/ต้องผลิต':'ยังไม่มีข้อมูลแหล่งแถว',r.physicalAt,r.freeAt]);
    return {fileName:'AAF_Stock_Report_'+reportDate+'_r'+stock.revision+'.xlsx',reportDate,revision:stock.revision,reservationCurrent,rows,summary,totals,warnings:[...warnings],sheets:[{name:'สรุปสต๊อก',data:summary},{name:'สต๊อกทุกสเปก',data:[headers,...detail]}]};
  }
  function createWorkbook(model,XLSX=host.XLSX){
    if(!XLSX?.utils?.book_new||!XLSX.utils.aoa_to_sheet||!XLSX.utils.book_append_sheet)throw Error('โหลดเครื่องมือ Excel ไม่สำเร็จ กรุณาลองใหม่');
    const wb=XLSX.utils.book_new();
    for(const entry of model.sheets){
      const ws=XLSX.utils.aoa_to_sheet(entry.data);
      // Explicit scalar types: source notes/SKUs can never become formulas/links.
      for(const address of Object.keys(ws)){
        if(address[0]==='!')continue;
        const cell=ws[address];delete cell.f;delete cell.l;
        if(typeof cell.v==='string'){cell.t='s';delete cell.w;}
        if(typeof cell.v==='number'){cell.t='n';cell.z='#,##0.00';}
      }
      if(entry.name==='สต๊อกทุกสเปก'){
        ws['!cols']=headers.map((_,i)=>({wch:i===0?8:[1,2,3].includes(i)?28:[17,23,26,29,30,31,32].includes(i)?40:[25,28,33,34].includes(i)?25:18}));
        ws['!autofilter']={ref:'A1:AI'+entry.data.length};ws['!rows']=[{hpt:42}];
      }else{ws['!cols']=[{wch:38},{wch:75},...Array.from({length:8},()=>({wch:25}))];}
      XLSX.utils.book_append_sheet(wb,ws,entry.name);
    }
    wb.Props={Title:'รายงานสต๊อก AAF '+model.reportDate,Subject:'รายงานสต๊อกและหมายเหตุรายสินค้า ไม่ใช่ไฟล์นำเข้ายอดสต๊อก',Author:'AAF',Company:'AAF'};
    return wb;
  }
  function download(stock,options={},XLSX=host.XLSX){
    if(typeof XLSX?.writeFile!=='function')throw Error('โหลดเครื่องมือดาวน์โหลด Excel ไม่สำเร็จ');
    const model=build(stock,options),wb=createWorkbook(model,XLSX);XLSX.writeFile(wb,model.fileName,{compression:true});return model;
  }
  host.AAFStockReportExport={build,createWorkbook,download};
})();
