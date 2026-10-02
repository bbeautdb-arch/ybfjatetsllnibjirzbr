/* Owner-only UI. API checks identity and current revision again on every action. */
(() => {
  'use strict';
  const API='https://aaf-grade-insight-2569.bbeautybbsoraai.chatgpt.site/api/aaf/stock';
  let box,status,list,output,create,busy=false;
  const element=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
  const durable=link=>link.expiryMode==='until-revoked'&&link.expiresAt===null;
  const expiry=link=>durable(link)?'ไม่หมดอายุ · ใช้ได้จนกว่าเจ้าของยกเลิก':'หมดอายุ '+date(link.expiresAt);
  const date=value=>new Date(value).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'});
  async function request(body){
    const res=await fetch(API,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+window.AAFStockAccess.token(),...(body?{'Content-Type':'text/plain;charset=UTF-8'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await res.json();if(!res.ok||!data.ok)throw new Error(data.error||'ติดต่อส่วนกลางไม่ได้');return data;
  }
  function render(links){
    list.replaceChildren();
    for(const link of links||[]){
      const active=!link.revokedAt&&(durable(link)||((!link.expiryMode||link.expiryMode==='7-days')&&typeof link.expiresAt==='string'&&Date.parse(link.expiresAt)>Date.now())),row=element('div');row.style.cssText='display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px';
      row.append(element('span',link.label+' · '+(link.revokedAt?'ยกเลิกแล้ว':active?expiry(link):'หมดอายุแล้ว')));
      if(active){const revoke=element('button','ยกเลิกลิงก์');revoke.type='button';revoke.onclick=()=>{
        if(confirm('ยกเลิกลิงก์ '+link.label+'? ผู้ที่มีลิงก์นี้จะโหลดและเซฟต่อไม่ได้'))change({action:'revokeSalesLink',id:link.id});
      };row.append(revoke);}list.append(row);
    }
  }
  async function change(action){
    if(busy)return;busy=true;create.disabled=true;status.textContent='กำลังตรวจสิทธิ์และบันทึกส่วนกลาง…';
    try{
      const latest=await request();if(!latest.actor?.owner)throw new Error('ต้องเข้าสู่ระบบเจ้าของก่อน');
      const result=await request({...action,expectedRevision:latest.revision});render(result.salesLinks);
      if(result.created){output.hidden=false;output.querySelector('textarea').value=result.created.url;status.textContent='สร้างแล้ว · '+expiry(result.created)+' · คัดลอกเก็บไว้ตอนนี้ ระบบไม่แสดงลิงก์เต็มซ้ำ';}
      else{output.hidden=true;output.querySelector('textarea').value='';status.textContent='ยกเลิกลิงก์ในส่วนกลางแล้ว';}
    }catch(e){status.textContent=e.message+' · หากผลสร้างไม่แน่นอน ให้โหลดรายชื่อลิงก์ล่าสุดก่อนสร้างซ้ำ';}
    finally{busy=false;create.disabled=false;}
  }
  window.AAFStockLinks={update(data){
    if(!data.actor?.owner||window.AAFStockAccess.isShared()){if(box)box.hidden=true;return;}
    if(!box){
      box=element('details');box.id='stock-sales-link-manager';box.style.cssText='max-width:1500px;width:100%;margin:0 auto 12px;padding:12px 16px;background:#fff;border:1px solid #cbd5e1;border-radius:12px;font-size:13px;color:#334155';
      box.append(element('summary','ลิงก์สำหรับ AAF Sales · เจ้าของจัดการ'));
      box.append(element('p','ลิงก์ไม่หมดอายุจนกว่าเจ้าของยกเลิก · ดูสต๊อกและแก้ราคา/สกุลเงินราคา/หมายเหตุในหัวข้อ 02 ได้ · ไม่แก้จำนวนหรืออัตราแลกเปลี่ยน ทุกคนที่มีลิงก์ใช้สิทธิ์นี้ได้ และบันทึกชื่อเป็นลิงก์ฝ่ายขาย ไม่ใช่บุคคล'));
      const label=element('label','ชื่อกลุ่ม '),input=element('input');input.value='AAF Sales หน้า 04';input.maxLength=80;input.setAttribute('aria-label','ชื่อกลุ่มลิงก์ฝ่ายขาย');input.style.cssText='border:1px solid #cbd5e1;border-radius:6px;padding:6px';label.append(input);box.append(label);
      create=element('button','สร้างลิงก์ไม่หมดอายุ');create.type='button';create.onclick=()=>{if(confirm('สร้างลิงก์ไม่หมดอายุให้ทุกคนที่ถือดูสต๊อกและแก้ราคา/หมายเหตุได้โดยไม่ล็อกอิน จนกว่าเจ้าของยกเลิก? ผู้ที่ได้รับลิงก์ต่อก็ใช้สิทธิ์ได้ ห้ามส่งในกลุ่มสาธารณะ'))change({action:'createSalesLink',label:input.value,expiryMode:'until-revoked'});};box.append(create);
      const reload=element('button','โหลดรายชื่อลิงก์ล่าสุด');reload.type='button';reload.onclick=async()=>{try{const data=await request();if(!data.actor?.owner)throw new Error('ต้องเข้าสู่ระบบเจ้าของก่อน');render(data.salesLinks);status.textContent='โหลดรายชื่อส่วนกลางแล้ว';}catch(e){status.textContent=e.message;}};box.append(reload);
      status=element('p');status.setAttribute('role','status');box.append(status);
      output=element('div');output.hidden=true;const url=element('textarea');url.readOnly=true;url.rows=3;url.setAttribute('aria-label','ลิงก์ลับสำหรับส่งให้ AAF Sales');url.style.cssText='width:100%;border:1px solid #cbd5e1;padding:8px';const copy=element('button','คัดลอกลิงก์');copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText(url.value);status.textContent='คัดลอกลิงก์แล้ว · ส่งเฉพาะผู้ที่อนุญาต';}catch{url.focus();url.select();status.textContent='เลือกลิงก์แล้ว กรุณาคัดลอกเอง';}};output.append(url,copy);box.append(output);
      list=element('div');box.append(list);document.getElementById('stock-summary').before(box);
      const css=element('style');css.textContent='#stock-sales-link-manager button{margin:8px 8px 0 0;padding:7px 12px;border:1px solid #b8c8d8;border-radius:7px;background:#edf5fa;color:#17344d;cursor:pointer}#stock-sales-link-manager p{margin:10px 0;line-height:1.6}';document.head.append(css);
    }
    box.hidden=false;if(!busy)render(data.salesLinks);
  }};
})();

