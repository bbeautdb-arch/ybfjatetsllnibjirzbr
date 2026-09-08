/* Shared stock is authoritative. Browser storage is retained only as a migration
   source / compatibility cache; it never grants rights or confirms a save. */
(() => {
  'use strict';
  const API='https://aaf-grade-insight-2569.bbeautybbsoraai.chatgpt.site/api/aaf/stock';
  const LOGIN='https://bbeautdb-arch.github.io/AAF-System/login.html?reauth=1';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Number(n||0).toLocaleString('th-TH',{maximumFractionDigits:0});
  const fmtPrice=n=>Number(n||0).toLocaleString('th-TH',{maximumFractionDigits:4});
  const dateText=d=>d?new Date(d).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'—';
  const $=id=>document.getElementById(id);
  const initialRows=structuredClone(currentStockData),initialMeta=getStockImportMeta(),initialRate=globalExchangeRate,initialPrices=structuredClone(priceDB);
  let shared=null,user=null,busy=false,dirty=false,reportData=null,reportDataDay=null;
  const drafts=new Map();
  const draftId=(kind,key)=>JSON.stringify([kind,key]);
  const draftValue=(kind,key,fallback)=>drafts.has(draftId(kind,key))?drafts.get(draftId(kind,key)):fallback;
  let session=safeJSONParse(sessionStorage.getItem('aaf_user'),null);
  const token=()=>session?.stockSessionToken||session?.gradeBridgeSessionToken||session?.bridgeSessionToken||'';
  const can=k=>!!shared?.permissions?.[k];
  const isOwner=()=>can('adjust');
  const banner=(message,error=false)=>{const n=$('shared-message');if(n){n.textContent=message;n.style.color=error?'#be123c':'#047857';}};
  const css=document.createElement('style');css.textContent=`
    [hidden]{display:none!important}
    #shared-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}
    .shared-btn{padding:7px 12px;border-radius:7px;background:#4f46e5;color:white;font-weight:600;font-size:14px;border:0;cursor:pointer}
    .shared-btn:disabled{opacity:.5;cursor:wait}.shared-secondary{background:#e2e8f0;color:#334155}
    .shared-input{width:110px;border:1px solid #a5b4fc;border-radius:6px;padding:6px;color:#0f172a;background:white;font-size:14px}
    .shared-edit{background:#eef2ff!important;min-width:210px}.shared-edit small,.shared-meta{display:block;color:#64748b;font-size:12px;font-weight:400;white-space:normal;margin-top:5px}
    .shared-note{min-width:260px;white-space:normal;vertical-align:top}.shared-note textarea{min-height:65px;width:240px;border:1px solid #cbd5e1;border-radius:6px;padding:7px;font-size:14px;color:#0f172a;background:white}
    .shared-copy{white-space:pre-wrap;overflow-wrap:anywhere;max-width:300px;min-width:210px;font-size:14px;font-weight:400}
    #stock-table-body td{padding:10px;border-right:1px solid #e2e8f0}#stock-table-body tr:hover{background:#f8fafc}
    #stock-table-foot td{padding:12px 10px;font-weight:700}#stock-table-head th{padding:12px 10px;border-right:1px solid #cbd5e1}
    #shared-report{background:white;border:1px solid #cbd5e1;border-radius:14px;padding:20px;margin:16px 0}
    #shared-message{white-space:normal;font-size:14px}#stock-user{font-size:14px;color:#475569}
    .stock-readonly{background:#f8fafc}.shared-number{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
  `;document.head.append(css);
  async function request(body=null,day=null){
    const res=await fetch(API+(day?'?day='+encodeURIComponent(day):''),{method:body?'POST':'GET',cache:'no-store',headers:{'Authorization':'Bearer '+token(),...(body?{'Content-Type':'text/plain;charset=UTF-8'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await res.json();if(!res.ok||!data.ok){const e=new Error(data.error||'ติดต่อฐานข้อมูลไม่ได้');e.status=res.status;throw e;}return data;
  }
  function header(){
    let cols=['ลำดับ','สเปกสินค้า (W x L x T)','เกรด'];if(isOwner())cols.push('ปรับสต๊อกระหว่างวัน');
    cols.push('แผ่นจริง (Physical)','แปลง 2.5 mm.','ราคา/แผ่น','มูลค่าสต๊อก (฿)');if(isOwner())cols.push('ปรับฟรีสต๊อก');
    cols.push('ฟรีสต๊อก (Free)','มูลค่าฟรีสต๊อก (฿)','การติดตามยอดขาย','หมายเหตุ');
    const head=$('stock-table-body').closest('table').querySelector('thead');head.id='stock-table-head';head.innerHTML='<tr>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr>';
  }
  function filtered(data=shared){return (data?.rows||[]).filter(r=>['t','w','l','grade'].every(k=>!$('view-'+k)?.value||String(r[k])===$('view-'+k).value));}
  function values(r,data=shared){const price=r.priceObj?.price||0,curr=r.priceObj?.currency||'THB',thb=price*(curr==='USD'?data.exchangeRate:1);return {price,curr,thb,eq:r.qty*(Number(r.w)*Number(r.l)/2976800)*(Number(r.t)/2.5),value:r.qty*thb,freeValue:r.freeQty*thb};}
  function editNumber(r,field){const active=field==='physical'?r.physicalOverride:r.freeOverride;return `<td class="shared-edit"><div><input class="shared-input" type="number" min="0" step="1" data-draft="${field}" data-key="${esc(r.key)}" aria-label="${field==='physical'?'ปรับสต๊อก':'ปรับฟรีสต๊อก'} ${esc(r.w+'x'+r.l+'x'+r.t+' '+r.grade)}" value="${field==='physical'?r.qty:r.freeQty}"> <button class="shared-btn" data-save="${field}" data-key="${esc(r.key)}">เซฟ</button></div><button class="shared-btn shared-secondary" style="margin-top:5px" data-reset="${field}" data-key="${esc(r.key)}">ใช้${field==='physical'?'ยอดเมล':'สูตรเดิม'}</button><small>${active?'เซฟ '+esc(dateText(active.at)):'ยังไม่ได้ปรับระหว่างวัน'}</small></td>`;}
  function textCell(r,field){const editable=can(field);return `<td class="shared-note">${editable?`<textarea maxlength="4000" data-draft="${field}" data-key="${esc(r.key)}" aria-label="${field==='note'?'หมายเหตุ':'การติดตามยอดขาย'} ${esc(r.key)}">${esc(r[field])}</textarea><br><button class="shared-btn" data-save="${field}" data-key="${esc(r.key)}">เซฟ</button>`:`<div class="shared-copy">${esc(r[field]||'—')}</div>`}<small class="shared-meta">${r[field+'At']?esc(r[field+'By']+' · '+dateText(r[field+'At'])):''}</small></td>`;}
  window.renderStockView=function(){
    if(!shared)return;header();const rows=filtered();let qty=0,eq=0,val=0,free=0,fv=0;
    $('stock-table-body').innerHTML=rows.map((r,i)=>{const v=values(r);qty+=r.qty;eq+=v.eq;val+=v.value;free+=r.freeQty;fv+=v.freeValue;
      return `<tr><td>${i+1}</td><td><b>${esc(r.w+' x '+r.l+' x '+r.t)}</b><small class="shared-meta">${esc(r.desc)}</small></td><td>${esc(r.grade)}</td>${isOwner()?editNumber(r,'physical'):''}<td class="shared-number" style="color:#047857">${fmt(r.qty)}${r.physicalOverride?'<small class="shared-meta">ยอดเมล '+fmt(r.baseQty)+'</small>':''}</td><td class="shared-number" style="color:#4f46e5">${fmt(v.eq)}</td><td>${isOwner()?`<input class="shared-input" type="number" min="0" step="0.001" data-price="${esc(r.key)}" value="${v.price}"><select data-currency="${esc(r.key)}" class="filter-select"><option ${v.curr==='THB'?'selected':''}>THB</option><option ${v.curr==='USD'?'selected':''}>USD</option></select><button class="shared-btn" data-save-price="${esc(r.key)}">เซฟ</button>`:fmtPrice(v.price)+' '+v.curr}</td><td class="shared-number">${fmt(v.value)}</td>${isOwner()?editNumber(r,'free'):''}<td class="shared-number" style="color:#0369a1">${fmt(r.freeQty)}${r.freeOverride?'<small class="shared-meta">ปรับระหว่างวัน</small>':''}</td><td class="shared-number">${fmt(v.freeValue)}</td>${textCell(r,'followup')}${textCell(r,'note')}</tr>`;
    }).join('')||`<tr><td colspan="${isOwner()?13:11}">ไม่พบรายการสินค้า</td></tr>`;
    $('stock-table-foot').innerHTML=`<tr><td colspan="${isOwner()?4:3}">ยอดรวมตามตัวกรอง</td><td>${fmt(qty)}</td><td>${fmt(eq)}</td><td></td><td>${fmt(val)}</td>${isOwner()?'<td></td>':''}<td>${fmt(free)}</td><td>${fmt(fv)}</td><td></td><td></td></tr>`;
    $('stock-count-label').textContent='แสดงผล '+rows.length+' รายการ';
    document.querySelectorAll('[data-draft],[data-price],[data-currency]').forEach(x=>{x.value=draftValue(x.dataset.draft||(x.dataset.price?'price':'currency'),x.dataset.key||x.dataset.price||x.dataset.currency,x.value);});
  };
  function accept(data){if(shared&&data.revision!==shared.revision){reportData=null;reportDataDay=null;$('download-stock-report').disabled=true;}shared=data;user=data.actor;currentStockData=data.rows;globalExchangeRate=data.exchangeRate;priceDB=Object.fromEntries(data.rows.map(r=>[r.key,r.priceObj]));
    $('global-exchange-rate').value=data.exchangeRate;$('global-exchange-rate').disabled=!isOwner();
    $('main-title').textContent='📦 Stock AAF Update '+(data.report?'ข้อมูลประจำวันที่ '+formatThaiReportDate(data.report.reportDate):'ยังไม่มีข้อมูลส่วนกลาง');
    $('stock-user').textContent=(user?.name||'')+' · '+(isOwner()?'เจ้าของบัญชี':can('followup')?'ฝ่ายขาย · ลงติดตามได้':'ดูข้อมูลเท่านั้น');
    $('followup-permission').hidden=!isOwner();
    if(isOwner()){$('followup-editor').innerHTML='<option value="">ยังไม่กำหนดผู้ลงติดตาม</option>'+(data.salesUsers||[]).map(u=>'<option value="'+esc(u.username)+'">'+esc(u.name+' ('+u.username+')')+'</option>').join('');$('followup-editor').value=data.followupEditors?.[0]||'';}
    $('btn-open-auto-mail-import').hidden=!isOwner();$('btn-sync-price').hidden=!isOwner();
    const file=document.querySelector('input[type=file]');if(file)file.closest('label').hidden=!isOwner();
    const hasPortal=['admin','sales'].includes(session?.role);
    $('stock-nav-home').hidden=!hasPortal;$('stock-nav-sales').hidden=!hasPortal;
    populateStockDropdowns();renderStockView();
    rawExcelHTML=stockRowsToRawHTML(data.rows.map(r=>({...r,qty:r.baseQty})));$('raw-table-container').innerHTML=rawExcelHTML;
    setAutoStockStatus(data.report?`ข้อมูลส่วนกลาง • รายงาน ${formatThaiReportDate(data.report.reportDate)} • ${data.rows.length} รายการ • ยอดเมล ${fmt(data.report.expectedTotal)} แผ่น`:'ยังไม่มีรายงานในฐานข้อมูลส่วนกลาง');
    // Read-only report; a rendering failure must never interrupt an existing save.
    try{window.AAFStockSummary?.update(data,r=>values(r,data));}catch(e){window.AAFStockSummary?.showError('รายงานภาพยาวแสดงไม่ได้: '+e.message);}
    // Compatibility for existing sales screens; never used as authoritative read.
    if(data.report)try{localStorage.setItem('fullInventoryData',JSON.stringify(data.rows));localStorage.setItem('stockPriceDB',JSON.stringify(priceDB));localStorage.setItem('exchangeRate_USD_THB',String(globalExchangeRate));localStorage.setItem('stockImportMeta',JSON.stringify({...data.report,importedAt:data.importedAt,sender:data.report.source?.sender,subject:data.report.source?.subject,sourceType:data.report.source?.type}));}catch{}
  }
  async function save(body){if(busy)return false;if(dirty&&(body.action==='import'||body.action==='commercial'&&Object.keys(body.values).length>1)){banner('มีร่างที่ยังไม่เซฟ กรุณาบันทึกให้ครบหรือกดโหลดล่าสุดก่อนเปลี่ยนข้อมูลทั้งชุด',true);return false;}busy=true;document.querySelectorAll('[data-save],[data-save-price],[data-reset],[data-draft],[data-price],[data-currency]').forEach(b=>b.disabled=true);
    try{const data=await request({...body,expectedRevision:shared.revision,reportDate:shared.report?.reportDate});
      if(body.action==='edit')drafts.delete(draftId(body.field,body.key));
      if(body.action==='commercial')for(const key of Object.keys(body.values)){drafts.delete(draftId('price',key));drafts.delete(draftId('currency',key));}
      dirty=drafts.size>0;accept(data);reportData=null;reportDataDay=null;$('download-stock-report').disabled=true;
      banner('บันทึกส่วนกลางแล้ว · '+dateText(data.updatedAt)+(dirty?' · ยังมีร่างในช่องอื่นที่ไม่ได้เซฟ':''));return true;}
    catch(e){banner(e.message+(e.status===409?' — ข้อมูลที่พิมพ์ยังอยู่ กรุณาจด/คัดลอกก่อนกดโหลดล่าสุด':''),true);return false;}
    finally{busy=false;document.querySelectorAll('[data-save],[data-save-price],[data-reset],[data-draft],[data-price],[data-currency]').forEach(b=>b.disabled=false);}}
  async function snapshotFromRows(rows,meta,type='outlook-auto-mail'){
    const base=rows.map(r=>({sku:r.sku||'',desc:r.desc,size:r.size||'Normal',w:String(Number(r.w)),l:String(Number(r.l)),t:String(Number(r.t)),grade:r.grade,qty:r.baseQty??r.qty,d90:r.d90,d180:r.d180,d270:r.d270,d360:r.d360,dOver:r.dOver}));
    const grades=Object.fromEntries(['AV','AAA','A','B','F','REJ','C','UN','CTS'].map(g=>[g,0]));base.forEach(r=>grades[r.grade]+=r.qty);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(base))))).map(b=>b.toString(16).padStart(2,'0')).join('');
    return {version:1,parserVersion:'stock-shared-migration-v1',reportDate:meta.reportDate,sourceRowCount:meta.sourceRowCount||base.reduce((n,r)=>n+Math.max(1,r.sku.split(',').filter(Boolean).length),0),source:{type,sender:meta.sender||'usermail@ace-energy.co.th',subject:meta.subject||'FYI-AAF :: รายงาน Aging Time สินค้าคงเหลือ',receivedAt:meta.receivedAt||meta.importedAt},expectedTotal:meta.expectedTotal??meta.totalQty??base.reduce((n,r)=>n+r.qty,0),expectedGradeTotals:{...Object.fromEntries(Object.keys(grades).map(g=>[g,0])),...(meta.expectedGradeTotals??meta.gradeTotals??grades)},checksum:'sha256:'+digest,rows:base};
  }
  window.importAutoMailSnapshotFromText=async()=>{if(!can('import'))return;let s;try{s=JSON.parse($('auto-mail-json-input').value);}catch{return banner('JSON ไม่ถูกต้อง',true);}if(await save({action:'import',snapshot:s})){closeAutoMailImport();alert('อัปเดตสต๊อกส่วนกลางสำเร็จ\n'+s.reportDate+'\n'+fmt(s.expectedTotal)+' แผ่น');}};
  window.openAutoMailImport=()=>{if(can('import')){$('auto-mail-json-input').value='';$('auto-mail-import-modal').classList.remove('hidden');}};
  window.applyAutoStockSnapshot=()=>false;window.rollbackStockImport=()=>banner('ไม่ย้อนรายงานเก่าอัตโนมัติ เพื่อป้องกันข้อมูลระหว่างวันหาย',true);
  window.editRawTable=()=>banner('ใช้ช่องปรับสต๊อกระหว่างวันและกดเซฟในตารางด้านบน');window.saveRawTable=()=>{};
  window.updateExchangeRate=value=>save({action:'exchangeRate',value:Number(value)});
  window.updateItemPrice=()=>{};window.fetchRealTimeExchangeRate=()=>{};
  window.uploadStockExcel=async event=>{const f=event.target.files[0];if(!f||!isOwner())return;try{const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});const p=parseAgingWorkbookRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''}));let day=reportDateFromFileName(f.name);if(!day)day=prompt('วันที่รายงานในไฟล์ (YYYY-MM-DD)');if(!day)return;await save({action:'import',snapshot:await snapshotFromRows(p.stock,{reportDate:day},'manual-excel')});}catch(e){banner(e.message,true);}finally{event.target.value='';}};
  window.syncSalesData=async()=>{if(!isOwner())return;
    const priceKeys=['salesDB_ConfLoaded','salesDB_ConfAdv','salesDB_ConfTT','salesDB_ConfLC','salesDB_ConfDom','salesDB_ConfNext','salesDB_Draft'];
    const deductKeys=['salesDB_ConfAdv','salesDB_ConfTT','salesDB_ConfLC','salesDB_ConfDom'];
    if(!deductKeys.some(k=>localStorage.getItem(k)))return banner('ไม่พบข้อมูลฝ่ายขายใน Chrome นี้ จึงยังไม่เปลี่ยนยอดจอง',true);
    const ps={},cs={};for(const k of priceKeys)for(const r of safeJSONParse(localStorage.getItem(k),[])){if(!r[8]||!r[9]||!r[10]||cleanNum(r[32])<=0)continue;const key=makeStockKey(r[8],r[9],r[10],String(r[11]||'').toUpperCase());(ps[key]??=[]).push({price:cleanNum(r[32]),currency:r[3]==='ในประเทศ'?'THB':'USD'});}
    for(const k of deductKeys)for(const r of safeJSONParse(localStorage.getItem(k),[])){const key=makeStockKey(r[8],r[9],r[10],String(r[11]||'').toUpperCase());cs[key]=(cs[key]||0)+cleanNum(r[31]);}
    const vals={};for(const r of shared.rows){const arr=ps[r.key];const v={committedQty:cs[r.key]||0};if(arr?.length){const currency=arr.every(p=>p.currency==='USD')?'USD':'THB';v.priceObj={currency,price:Number((arr.reduce((s,p)=>s+p.price*(currency==='THB'&&p.currency==='USD'?globalExchangeRate:1),0)/arr.length).toFixed(4))};}vals[r.key]=v;}
    await save({action:'commercial',values:vals});
  };
  function reportRows(data){return data.rows.map((r,i)=>{const v=values(r,data);return [i+1,r.sku,r.w,r.l,Number(r.t),r.grade,r.baseQty,r.qty,r.committedQty,r.freeQty,v.eq,v.price,v.curr,v.value,v.freeValue,r.followup,r.followupBy||'',r.followupAt||'',r.note,r.noteBy||'',r.noteAt||''];});}
  window.downloadStockReport=()=>{if(!reportData)return;const d=reportData;const wb=XLSX.utils.book_new();const hdr=['ลำดับ','SKU','กว้าง (mm)','ยาว (mm)','หนา (mm)','เกรด','ยอดเมล (แผ่น)','Physical ล่าสุด','ยอดจอง','Free ล่าสุด','เทียบ 2.5 mm','ราคาต่อแผ่น','สกุลเงิน','มูลค่าสต๊อก (THB)','มูลค่า Free (THB)','การติดตามยอดขาย','ผู้ติดตาม','บันทึกติดตามเมื่อ','หมายเหตุ','ผู้บันทึกหมายเหตุ','บันทึกหมายเหตุเมื่อ'];
    const ws=XLSX.utils.aoa_to_sheet([['รายงานสต๊อกและติดตามยอดขายประจำวัน'],['วันที่รายงาน', reportDataDay,'รายงานเมลอ้างอิง',d.report?.reportDate||''],['ข้อมูลส่วนกลางบันทึกล่าสุด',d.updatedAt||'','USD/THB',d.exchangeRate],[],hdr,...reportRows(d)]);
    ws['!cols']=hdr.map((_,i)=>({wch:[1,15,18].includes(i)?50:i===17||i===20?26:17}));ws['!autofilter']={ref:'A5:U'+(d.rows.length+5)};ws['!rows']=[{hpt:25},{hpt:22},{hpt:22},{hpt:8},{hpt:32}];
    // Explicit text cells prevent notes beginning with =,+,-,@ becoming formulas.
    for(const key of Object.keys(ws)){if(key[0]==='!')continue;const cell=ws[key];if(cell.t==='s')delete cell.f;if(cell.t==='n')cell.z=/^[ABCDGHIJ]\d+$/.test(key)?'#,##0':'#,##0.00';}
    const summary=[['สรุปรายงานสต๊อก'],['วันที่',reportDataDay],['รายงานเมลอ้างอิง',d.report?.reportDate||''],['จำนวนสเปก',d.rows.length],['Physical รวม',d.rows.reduce((s,r)=>s+r.qty,0)],['Free รวม',d.rows.reduce((s,r)=>s+r.freeQty,0)],['มูลค่าสต๊อก THB',d.rows.reduce((s,r)=>s+values(r,d).value,0)],['มูลค่า Free THB',d.rows.reduce((s,r)=>s+values(r,d).freeValue,0)],['แหล่งข้อมูล','Stock AAF ส่วนกลาง'],['URL','https://bbeautdb-arch.github.io/AAF-System/stock_manager.html'],['ข้อกำหนด','ใช้ข้อมูลที่กดเซฟแล้ว ไม่รวมข้อความหรือตัวเลขที่ยังเป็นร่าง']];
    const sum=XLSX.utils.aoa_to_sheet(summary);sum['!cols']=[{wch:27},{wch:85}];XLSX.utils.book_append_sheet(wb,sum,'สรุปประจำวัน');XLSX.utils.book_append_sheet(wb,ws,'สต๊อกและติดตาม');XLSX.writeFile(wb,'AAF_Stock_Report_'+reportDataDay+'.xlsx');
  };
  async function loadReport(){reportData=null;reportDataDay=null;$('download-stock-report').disabled=true;try{const day=$('report-day').value;const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const loaded=day===today?await request():await request(null,day);if($('report-day').value!==day)return;reportData=loaded;reportDataDay=day;$('report-summary').textContent=`${reportData.rows.length} สเปก · Physical ${fmt(reportData.rows.reduce((s,r)=>s+r.qty,0))} แผ่น · Free ${fmt(reportData.rows.reduce((s,r)=>s+r.freeQty,0))} แผ่น · บันทึกล่าสุด ${dateText(reportData.updatedAt)}`;$('download-stock-report').disabled=!reportData.report;}catch(e){$('report-summary').textContent=e.message;}}
  function openReport(){$('shared-report').hidden=false;loadReport();$('shared-report').scrollIntoView({behavior:'smooth'});}
  async function refresh(){if(busy)return;if(dirty&&!confirm('มีข้อมูลยังไม่เซฟ โหลดล่าสุดจะทิ้งร่างที่พิมพ์ ยืนยันหรือไม่?'))return;try{const fresh=await request();drafts.clear();dirty=false;accept(fresh);banner('โหลดข้อมูลส่วนกลางล่าสุดแล้ว');}catch(e){banner(e.message,true);}}
  window.onload=async()=>{
    const links=document.querySelectorAll('a[href="dashboard_home.html"],a[href="sales_analytics.html"]');links.forEach(a=>a.id=a.getAttribute('href')==='dashboard_home.html'?'stock-nav-home':'stock-nav-sales');
    const bar=document.createElement('div');bar.id='shared-toolbar';bar.innerHTML='<span id="stock-user"></span><button class="shared-btn shared-secondary" id="reload-shared">โหลดล่าสุด</button><button class="shared-btn" id="open-stock-report">รายงานประจำวัน / Excel</button><button class="shared-btn shared-secondary" id="stock-logout">ออกจากระบบ</button><span id="shared-message" role="status"></span>';
    $('auto-stock-panel').before(bar);
    const permission=document.createElement('div');permission.id='followup-permission';permission.hidden=true;permission.style.cssText='margin:10px 0;padding:12px;background:#eef2ff;border-radius:8px;font-size:14px';permission.innerHTML='<label>ผู้มีสิทธิ์ลงการติดตามยอดขาย <select id="followup-editor" class="filter-select"></select></label> <button class="shared-btn" id="save-followup-editor">เซฟสิทธิ์</button><span style="margin-left:8px;color:#64748b">แก้ได้เฉพาะติดตามยอดขาย · วีดูและดาวน์โหลดเท่านั้น</span>';bar.after(permission);
    $('save-followup-editor').onclick=()=>save({action:'assignFollowup',username:$('followup-editor').value||null});
    const rp=document.createElement('section');rp.id='shared-report';rp.hidden=true;rp.innerHTML='<h2 style="font-size:22px;font-weight:700">รายงานสต๊อกประจำวัน</h2><p style="font-size:14px;margin:8px 0">ใช้ค่าที่บันทึกในระบบแล้วทั้งชุด ไม่รวมร่างที่ยังไม่กดเซฟ รายงานย้อนหลังเริ่มตั้งแต่วันที่เปิดระบบส่วนกลาง</p><label>วันที่รายงาน <input type="date" id="report-day" class="shared-input" style="width:165px"></label> <button class="shared-btn shared-secondary" id="load-stock-report">ดูรายงาน</button> <button class="shared-btn" id="download-stock-report" disabled>ดาวน์โหลด Excel</button><p id="report-summary" style="margin-top:12px;font-size:14px"></p>';
    bar.before(rp);$('report-day').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    $('report-day').oninput=()=>{reportData=null;reportDataDay=null;$('download-stock-report').disabled=true;$('report-summary').textContent='กดดูรายงานเพื่อโหลดวันที่เลือก';};
    $('reload-shared').onclick=refresh;$('open-stock-report').onclick=()=>{location.hash='report';openReport();};$('load-stock-report').onclick=loadReport;$('download-stock-report').onclick=window.downloadStockReport;
    $('stock-logout').onclick=()=>{location.href='portal_logout.html';};
    $('btn-rollback-stock').hidden=true;$('btn-rollback-stock').classList.add('hidden');$('btn-edit-raw').hidden=true;$('btn-edit-raw').style.display='none';$('raw-edit-controls').remove();
    $('btn-open-auto-mail-import').hidden=true;$('btn-sync-price').hidden=true;document.querySelector('input[type=file]').closest('label').hidden=true;$('global-exchange-rate').disabled=true;
    $('stock-table-body').innerHTML='<tr><td>กำลังเชื่อมต่อข้อมูลส่วนกลาง...</td></tr>';
    if(!session||!token()){banner('กรุณาเข้าสู่ระบบเพื่อใช้ข้อมูลส่วนกลาง',true);const a=document.createElement('a');a.href=LOGIN;a.className='shared-btn';a.textContent='เข้าสู่ระบบ AAF';bar.append(a);return;}
    try{accept(await request());
      if(isOwner()&&!shared.report&&initialRows.length&&initialMeta?.reportDate){
        banner('กำลังย้ายสต๊อกที่ตรวจสอบแล้วจาก Chrome นี้เข้าส่วนกลาง...');
        try{if(!localStorage.getItem('stockBeforeSharedMigration'))localStorage.setItem('stockBeforeSharedMigration',JSON.stringify({rows:initialRows,meta:initialMeta,prices:initialPrices,exchangeRate:initialRate}));}catch{return banner('พื้นที่สำรองใน Chrome ไม่พอ จึงยังไม่ย้ายข้อมูลอัตโนมัติ',true);}
        const commercial=Object.fromEntries(initialRows.map(r=>[makeStockKey(r.w,r.l,r.t,r.grade),{priceObj:initialPrices[makeStockKey(r.w,r.l,r.t,r.grade)]||r.priceObj||{price:0,currency:'THB'},committedQty:r.committedQty||0}]));
        await save({action:'import',snapshot:await snapshotFromRows(initialRows,initialMeta),commercial,exchangeRate:initialRate});
      }
      if(location.hash==='#report')openReport();
      setInterval(async()=>{if(busy||dirty||document.hidden)return;try{const fresh=await request();if(fresh.revision!==shared.revision){accept(fresh);banner('มีข้อมูลใหม่ · '+dateText(fresh.updatedAt));}}catch{banner('ขาดการเชื่อมต่อ ข้อมูลบนจอเป็นค่าที่โหลดครั้งล่าสุด',true);}},15000);
    }catch(e){banner(e.message,true);if(e.status===401){const a=document.createElement('a');a.href=LOGIN;a.className='shared-btn';a.textContent='เข้าสู่ระบบอีกครั้ง';bar.append(a);}}
    document.addEventListener('input',e=>{const x=e.target;if(x.matches('[data-draft],[data-price],[data-currency]')){drafts.set(draftId(x.dataset.draft||(x.dataset.price?'price':'currency'),x.dataset.key||x.dataset.price||x.dataset.currency),x.value);dirty=true;}});
    document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||!shared)return;const key=b.dataset.key;
      if(b.dataset.save){const field=b.dataset.save;const input=Array.from(document.querySelectorAll('[data-draft]')).find(x=>x.dataset.key===key&&x.dataset.draft===field);if(!input)return;const value=['physical','free'].includes(field)?(input.value.trim()===''?NaN:Number(input.value)):input.value;if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<0))return banner('กรอกจำนวนเต็มตั้งแต่ 0 ขึ้นไป',true);await save({action:'edit',key,field,value});}
      else if(b.dataset.reset){await save({action:'edit',key,field:b.dataset.reset,value:null});}
      else if(b.dataset.savePrice){const k=b.dataset.savePrice;const p=Array.from(document.querySelectorAll('[data-price]')).find(x=>x.dataset.price===k);const c=Array.from(document.querySelectorAll('[data-currency]')).find(x=>x.dataset.currency===k);await save({action:'commercial',values:{[k]:{priceObj:{price:Number(p.value),currency:c.value}}}});}
    });
    window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  };
})();
