/* Authenticated home for the unchanged sales preview. Never writes stock quantities. */
(() => {
  'use strict';
  const API='https://aaf-grade-insight-2569.bbeautybbsoraai.chatgpt.site/api/aaf/stock';
  const assetBase=new URL('.',document.currentScript.src);
  let host=null,view=null,viewGeneration=0,session='',catalogRevision=0,pending=null,generation=0,reportSummary=null;
  let readOnly=false,salesMode=false,stockRevision=null,mountedRevision=null,mountedSalesMode=false,loadFailed=false,statusNode=null;
  let fxTimer=null,accessEpoch=0,fxRun=null,headerFx=null,fxSession='',fxBlocked=false;
  let stockSnapshot=null,snapshotRequired=false,mountedSnapshotStamp=null,fallbackContent=null;
  const guardedReports=new WeakSet();
  // Only controlled messages leave the persistence boundary; never expose server
  // response text, credentials or a previous session's private draft.
  const saveMessages={
    'auth-required':'ยังไม่เซฟ · กรุณาเข้าสู่ระบบ AAF ก่อนบันทึก · เก็บร่างในหน้านี้ไว้ก่อน',
    'auth-expired':'ยังไม่เซฟ · สิทธิ์เข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบ AAF ใหม่ · เก็บร่างในหน้านี้ไว้ก่อน',
    'permission-denied':'ยังไม่เซฟ · บัญชีนี้ไม่มีสิทธิ์บันทึกราคาและหมายเหตุ กรุณาตรวจสิทธิ์บัญชี',
    'read-only':'ยังไม่เซฟ · หน้านี้ดูอย่างเดียว กรุณาตรวจสิทธิ์และโหลดข้อมูลส่วนกลางใหม่ก่อนบันทึก',
    'access-invalidated':'ยังไม่เซฟ · ยังยืนยันสิทธิ์หรือข้อมูลส่วนกลางไม่ได้ กรุณาตรวจการเข้าสู่ระบบ · เก็บร่างในหน้านี้ไว้ก่อน',
    'session-changed':'ยังไม่เซฟ · เซสชันเปลี่ยนแล้ว กรุณายืนยันบัญชีและโหลดข้อมูลส่วนกลางใหม่ก่อนบันทึก',
    'catalog-conflict':'ยังไม่เซฟ · มีราคาใหม่จากอีกหน้า กรุณาเปรียบเทียบข้อมูลส่วนกลางกับร่างก่อนบันทึก ไม่ได้ทับข้อมูล',
    'preflight-failed':'ยังไม่เซฟ · อ่านข้อมูลส่วนกลางล่าสุดไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่ · ร่างยังอยู่',
    'save-rejected':'ยังไม่เซฟ · ระบบปฏิเสธการบันทึก กรุณาตรวจข้อมูลราคา หมายเหตุ และสิทธิ์บัญชี',
    'save-outcome-unknown':'เซฟไม่สำเร็จในการยืนยันผล · อาจบันทึกส่วนกลางแล้ว ห้ามกดเซฟซ้ำ ให้ตรวจข้อมูลส่วนกลางก่อน · ร่างยังอยู่',
    'readback-mismatch':'ยังยืนยันผลเซฟไม่ได้ · ข้อมูลที่อ่านกลับไม่ตรงกับที่ส่ง อาจบันทึกส่วนกลางแล้ว ห้ามเซฟซ้ำก่อนตรวจข้อมูลส่วนกลาง',
    'session-changed-after-save':'เซสชันเปลี่ยนแล้วหลังส่งบันทึก · อาจบันทึกส่วนกลางแล้ว ห้ามเซฟซ้ำก่อนตรวจข้อมูลส่วนกลาง',
    'catalog-unavailable':'ยังไม่เซฟ · ยังโหลดราคาและหมายเหตุไม่ครบ กรุณาตรวจการเชื่อมต่อส่วนกลาง'
  };
  const uncertainCodes=new Set(['save-outcome-unknown','readback-mismatch','session-changed-after-save']);
  const saveError=code=>Object.assign(new Error(saveMessages[code]||saveMessages['save-outcome-unknown']),{code:Object.hasOwn(saveMessages,code)?code:'save-outcome-unknown'});
  const readMessages={
    'report-pending':'รายละเอียดยอดขายและมูลค่าการขายยังไม่ตรงกับสต๊อกส่วนกลาง · แสดงจำนวนสต๊อกที่ยืนยันแล้วได้ แต่รอเจ้าของตรวจชุดยอดขายก่อน',
    'auth-required':'กรุณาเข้าสู่ระบบหรือเปิดลิงก์ฝ่ายขายที่ได้รับอนุญาตก่อนอ่านข้อมูลส่วนกลาง',
    'auth-expired':'สิทธิ์อ่านข้อมูลส่วนกลางหมดอายุหรือถูกยกเลิก · กรุณาตรวจบัญชีหรือลิงก์ฝ่ายขาย',
    'permission-denied':'สิทธิ์ปัจจุบันไม่อนุญาตให้อ่านรายงานนี้ · กรุณาให้เจ้าของตรวจสิทธิ์',
    'read-unavailable':'ยังอ่านข้อมูลส่วนกลางไม่สำเร็จ · กรุณาตรวจการเชื่อมต่อแล้วลองใหม่',
    'snapshot-changed':'ข้อมูลหรือเซสชันเปลี่ยนระหว่างเตรียมไฟล์ · ยังไม่ส่งออก กรุณาลองใหม่จากข้อมูลล่าสุด',
    'snapshot-invalid':'ข้อมูลส่วนกลางยังไม่ครบสำหรับส่งออก · ยังไม่ได้สร้างไฟล์'
  };
  const readError=code=>Object.assign(new Error(readMessages[code]||readMessages['read-unavailable']),{code:Object.hasOwn(readMessages,code)?code:'read-unavailable'});
  let reportLoadStatus={state:'idle',code:null,message:'',stockRevision:null};
  function setReportLoadStatus(state,cause=null){reportLoadStatus={state,code:cause?.code||null,message:cause?.message||'',stockRevision};}
  let accessError=null,blockedSaveError=null,reconciliationError=null;
  const token=()=>{if(window.AAFStockAccess)return window.AAFStockAccess.token();if(window.AAFStockAccessRequired)return '';try{const s=JSON.parse(sessionStorage.getItem('aaf_user'));return s?.stockSessionToken||s?.gradeBridgeSessionToken||s?.bridgeSessionToken||'';}catch{return '';}};
  const current=(version,currentHost,auth)=>version===generation&&currentHost===host&&auth===session&&auth===token();
  const sameSavedValue=(a,b)=>{
    if(a===b)return true;
    if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
    const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&sameSavedValue(a[key],b[key]));
  };
  const stockEvidenceCurrent=()=>!snapshotRequired||!!stockSnapshot&&stockSnapshot.auth===token()&&mountedSnapshotStamp===stockSnapshot.stamp;
  function publishReportSummary(summary){reportSummary=!fxBlocked&&mountedRevision===stockRevision&&stockEvidenceCurrent()?summary:null;window.AAFStockSummary?.setSalesSummary?.(reportSummary);}
  function clearSavedStockCatalog(){window.AAFStockSummary?.setSavedStockCatalog?.(null);}
  function clearFallback(){fallbackContent?.replaceChildren();fallbackContent=null;clearSavedStockCatalog();}
  function publishPriceDraftChange(change){window.AAFStockSummary?.syncPriceDrafts?.(change);}
  async function request(body=null,catalogOnly=false){
    if(body&&readOnly)throw accessError||saveError('read-only');
    const auth=token();if(!auth)throw saveError('auth-required');
    // Both live entry points use the server's date, demand and allocation-ledger
    // guards. Owner write/catalog actions retain their original authorization.
    const guarded=!body&&!catalogOnly&&(salesMode||snapshotRequired);
    const viewName=guarded||salesMode?'salesReport':'salesPreview';
    let response;
    try{response=await fetch(API+(body?'':'?view='+viewName+(catalogOnly?'&catalogOnly=1':'')),{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+auth,...(body?{'Content-Type':'text/plain;charset=UTF-8'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
    catch{throw saveError(body?'save-outcome-unknown':'preflight-failed');}
    if(response.status===401)throw saveError('auth-expired');
    if(response.status===403)throw saveError('permission-denied');
    if(response.status===409||response.status===412)throw !body&&!catalogOnly?readError('report-pending'):saveError('catalog-conflict');
    if(body&&(response.status===400||response.status===422))throw saveError('save-rejected');
    let data;try{data=await response.json();}catch{throw saveError(body?'save-outcome-unknown':'preflight-failed');}
    if(!response.ok||!data.ok)throw saveError(body?'save-outcome-unknown':'preflight-failed');if(guarded)guardedReports.add(data);return data;
  }
  // Export reads a new authorized snapshot, never the view's cache or private draft.
  // This does not call accept(), change the mounted revision, or POST a catalog.
  async function readExportSnapshot(){
    const auth=token(),version=generation,epoch=accessEpoch;if(!auth)throw readError('auth-required');
    const unchanged=()=>{if(token()!==auth||generation!==version||accessEpoch!==epoch)throw readError('snapshot-changed');};
    const read=async suffix=>{
      unchanged();let response;
      try{response=await fetch(API+suffix,{method:'GET',cache:'no-store',headers:{Authorization:'Bearer '+auth}});}catch{throw readError('read-unavailable');}
      unchanged();
      if(response.status===401)throw readError('auth-expired');
      if(response.status===403)throw readError('permission-denied');
      if(response.status===409||response.status===412)throw readError('read-unavailable');
      let data;try{data=await response.json();}catch{throw readError('read-unavailable');}
      unchanged();if(!response.ok||!data?.ok)throw readError('read-unavailable');return data;
    };
    const stock=await read('');
    if(!Number.isSafeInteger(stock.revision)||!/^\d{4}-\d{2}-\d{2}$/.test(stock.report?.reportDate||'')||!Array.isArray(stock.rows)||!stock.rows.length)throw readError('snapshot-invalid');
    let catalog=null,catalogWarning='';
    try{catalog=await read('?view=salesReport&catalogOnly=1');}
    catch(cause){unchanged();if(['auth-expired','permission-denied','snapshot-changed'].includes(cause.code))throw cause;catalogWarning='อ่านชุดราคาที่บันทึกไม่สำเร็จ · ส่งออกจำนวนสต๊อกได้ แต่เว้นราคาและมูลค่าที่ไม่มีหลักฐาน';}
    if(catalog&&(stock.revision!==catalog.revision||catalog.stockReportDate!==stock.report.reportDate))throw readError('snapshot-changed');
    if(catalog&&(!Number.isSafeInteger(catalog.catalogRevision)||!catalog.widgetState?.privateContent)){catalog=null;catalogWarning='ยังไม่มีชุดราคาที่บันทึกครบ · ส่งออกจำนวนสต๊อกได้ แต่เว้นราคาและมูลค่าที่ไม่มีหลักฐาน';}
    const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,JSON.parse(JSON.stringify(value[key]))]));
    const rows=stock.rows.map(row=>{
      const result=pick(row,'key sku desc size w l t grade unit baseQty qty committedQty remainingQty productionQty freeQty d90 d180 d270 d360 dOver note followup retained'.split(' '));
      if(typeof row.rawSource==='boolean')result.rawSource=row.rawSource;
      for(const key of ['rawSku','exportSku','noteBy','noteAt','followupBy','followupAt'])if(typeof row[key]==='string'||row[key]===null)result[key]=row[key];
      if(Array.isArray(row.aliases)&&row.aliases.every(alias=>typeof alias==='string'))result.aliases=[...row.aliases];
      for(const key of ['physicalOverride','freeOverride'])if(typeof row[key]?.at==='string')result[key]={at:row[key].at};
      return result;
    });
    unchanged();
    return {stock:{...pick(stock,['revision','updatedAt','exchangeRate']),report:pick(stock.report,['reportDate','checksum','sourceRowCount']),rows,sellablePlan:stock.sellablePlan?pick(stock.sellablePlan,['reportDate','month','appliedAt','needsSalesRefresh']):null},catalog:catalog?{...pick(catalog,['revision','catalogRevision','stockReportDate']),widgetState:{privateContent:pick(catalog.widgetState.privateContent,['version','context','fx','prices','currencies','notesByThickness','notesBySpec','savedAt'])}}:null,catalogWarning,verifiedAt:new Date().toISOString()};
  }
  // A central revision dates the saved state, not the packaged owner's preview.
  // Keep exact price/spec dimensions distinct from allocation-only equivalence.
  const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const finiteQty=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
  const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  const exactKey=row=>[Number(row.t),row.grade,...[Number(row.w),Number(row.l)].sort((a,b)=>a-b),row.unit].join('|');
  const validSpec=row=>row&&['sheet','strip'].includes(row.unit)&&['AV','AAA','A','B','F','REJ','C','UN','CTS'].includes(row.grade)&&['w','l','t'].every(key=>Number.isFinite(Number(row[key]))&&Number(row[key])>0);
  function centralSnapshot(access){
    if(!Number.isSafeInteger(access.revision)||!validDay(access.reportDate)||!Array.isArray(access.rows)||!access.rows.length)return null;
    const keys=new Set(),rows=[];
    for(const row of access.rows){
      if(!validSpec(row)||!['qty','committedQty','freeQty'].every(key=>finiteQty(row[key])))return null;
      const key=typeof row.key==='string'&&row.key?row.key:exactKey(row);
      if(keys.has(key))return null;keys.add(key);
      const saved={key,w:Number(row.w),l:Number(row.l),t:Number(row.t),grade:row.grade,unit:row.unit,qty:row.qty,committedQty:row.committedQty,freeQty:row.freeQty};
      for(const field of ['sku','note','followup'])saved[field]=typeof row[field]==='string'?row[field]:'';
      rows.push(saved);
    }
    const result={revision:access.revision,reportDate:access.reportDate,rows};
    return {...result,auth:token(),stamp:JSON.stringify(result)};
  }
  function previewMatchesStock(data){
    if(!snapshotRequired)return true; // Compatibility with isolated legacy callers.
    const stock=stockSnapshot;
    if(!stock||stock.auth!==token()||data.revision!==stock.revision||data.stockReportDate!==stock.reportDate)return false;
    const preview=data.preview,sourceDay=preview?.source?.stockReportDate||(guardedReports.has(data)?data.stockReportDate:preview?.options?.receiptBreakdown?.asOf?.slice?.(0,10));
    if(sourceDay!==stock.reportDate||!Array.isArray(preview?.stockRows))return false;
    const totals=(rows,field)=>{const result=new Map();for(const row of rows){if(!validSpec(row)||!finiteQty(row[field]))return null;const key=exactKey(row);result.set(key,(result.get(key)||0)+row[field]);}return result;};
    const expected=totals(preview.stockRows,'physical'),actual=totals(stock.rows,'qty');
    return !!expected&&!!actual&&expected.size===actual.size&&[...actual.keys()].every(key=>expected.has(key)&&Math.abs(expected.get(key)-actual.get(key))<1e-7);
  }
  // Current Physical can be reprojected from a previously verified sales ledger.
  // That is not a new Page09 read: keep both evidence clocks visible everywhere.
  function reportEvidence(data){
    if(!guardedReports.has(data)||!validDay(data.stockReportDate)||!validDay(data.salesReportDate))return null;
    const r=data.readModel,capturedAt=data.salesCapturedAt;
    if(r&&(r.version!==1||r.kind!=='current-stock-saved-sales-ledger'||r.sourceIsLive!==false||r.stockReportDate!==data.stockReportDate||r.salesCapturedAt!==capturedAt||!validDay(r.sourceStockReportDate)||!validDay(r.planReportDate)||typeof r.needsSalesRefresh!=='boolean'||typeof capturedAt!=='string'||!Number.isFinite(Date.parse(capturedAt))||r.financialEvidence!==undefined&&!['matched-verified-source','unavailable-plan-only'].includes(r.financialEvidence)||r.financialEvidence==='unavailable-plan-only'&&(!Number.isSafeInteger(r.financialMissingLineCount)||r.financialMissingLineCount<0)))throw readError('report-pending');
    return Object.freeze({version:1,kind:r?.kind||'verified-saved-sales-report',stockReportDate:data.stockReportDate,salesReportDate:data.salesReportDate,salesCapturedAt:typeof capturedAt==='string'&&Number.isFinite(Date.parse(capturedAt))?capturedAt:null,needsSalesRefresh:r?.needsSalesRefresh===true||data.salesReportDate!==data.stockReportDate,sourceIsLive:false,financialEvidence:r?.financialEvidence||'matched-verified-source',financialMissingLineCount:r?.financialMissingLineCount||0});
  }
  function evidenceText(e){
    if(!e)return '';
    return 'สต๊อก '+e.stockReportDate+' · '+(e.financialEvidence==='unavailable-plan-only'?'จำนวน/สถานะขายจากชุดที่บันทึก':'ข้อมูลขาย/รับเงินที่ตรวจไว้')+' '+e.salesReportDate+(e.salesCapturedAt?' · อ่านต้นทาง '+new Date(e.salesCapturedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'')+' · จัดสรรกับสต๊อกปัจจุบัน'+(e.needsSalesRefresh?' · ยังไม่ได้อ่านยอดขายใหม่จากหน้า 09':' · ใช้หลักฐานยอดขายที่บันทึกไว้ ไม่ใช่ข้อมูลสด')+(e.financialEvidence==='unavailable-plan-only'?' · ยังไม่มีราคาขาย/ยอดรับเงินที่ตรงกับชุดนี้ '+e.financialMissingLineCount+' รายการ · ไม่ใช้เงินชุดเก่าหรือ 0 แทน':'');
  }
  function savedCatalogRows(stock,response){
    if(response?.revision!==stock.revision||response.stockReportDate!==stock.reportDate||!Number.isSafeInteger(response.catalogRevision))throw readError('snapshot-changed');
    const catalog=response.widgetState?.privateContent;
    const legacy=[1,2].includes(catalog?.version)&&/^\d{4}-\d{2}-\d{2}\|[\d.]+\|(THB-)?per-sheet$/.test(catalog?.context||'');
    if(!catalog||!(legacy||catalog.version===3&&catalog.context==='aaf-sales-stock-preview|free-price-catalog')||!plain(catalog.prices)||catalog.currencies!==undefined&&!plain(catalog.currencies)||catalog.notesBySpec!==undefined&&!plain(catalog.notesBySpec)||catalog.notesByThickness!==undefined&&!plain(catalog.notesByThickness))throw readError('read-unavailable');
    const owns=key=>Object.hasOwn(catalog.prices,key)||Object.hasOwn(catalog.currencies||{},key);
    const lookup=key=>{const price=catalog.prices[key],code=catalog.currencies?.[key];return {price:positive(price)?price:null,currency:code===undefined?'THB':['THB','USD'].includes(code)?code:null};};
    const rows=stock.rows.map(row=>{
      const direct=[row.t,row.grade,row.w,row.l,row.unit].join('|'),reverse=[row.t,row.grade,row.l,row.w,row.unit].join('|');
      let price=null,currency=null,priceStatus='ยังไม่มีราคาที่บันทึก';
      const chosen=owns(direct)?direct:owns(reverse)?reverse:null;
      if(chosen){const value=lookup(chosen);price=value.price;currency=value.currency;
        if(direct!==reverse&&owns(direct)&&owns(reverse)&&!sameSavedValue(lookup(direct),lookup(reverse))){price=null;currency=null;priceStatus='ราคา/สกุลเงินขนาดกลับด้านขัดกัน · รอตรวจ';}
        else if(price!==null&&currency===null){price=null;priceStatus='ยังยืนยันสกุลเงินไม่ได้';}
        else if(price!==null)priceStatus='ราคาที่บันทึกตามสเปก · ไม่ใช่ราคาขายรายออเดอร์';
      }
      return {...row,price,currency,priceStatus,specNote:typeof catalog.notesBySpec?.[exactKey(row)]==='string'?catalog.notesBySpec[exactKey(row)]:'',thicknessNote:typeof catalog.notesByThickness?.[String(row.t)]==='string'?catalog.notesByThickness[String(row.t)]:''};
    });
    return {revision:stock.revision,reportDate:stock.reportDate,rows,catalogRevision:response.catalogRevision,savedAt:typeof catalog.savedAt==='string'&&Number.isFinite(Date.parse(catalog.savedAt))?catalog.savedAt:null};
  }
  function publishSavedCatalog(catalog){
    if(fxBlocked||!stockSnapshot||stockSnapshot.auth!==token()||catalog.revision!==stockSnapshot.revision||catalog.reportDate!==stockSnapshot.reportDate)return;
    window.AAFStockSummary?.setSavedStockCatalog?.(catalog);
  }
  function renderSavedStock(content,stock,catalog=null,warning=''){
    const rows=catalog?.rows||stock.rows.map(row=>({...row,price:null,currency:null,specNote:'',thicknessNote:'',priceStatus:'ยังไม่มีราคาที่อ่านยืนยันได้'}));
    const box=element('section',{className:'saved-stock-fallback'});box.setAttribute('aria-label','สต๊อกส่วนกลางและราคาที่บันทึก · อ่านอย่างเดียว');
    box.style.cssText='padding:16px;border:1px solid #cbd5e1;border-radius:10px;margin:0 0 16px;background:#f8fafc';
    box.append(element('h3',{},'สต๊อกส่วนกลางครบ '+rows.length+' สเปก · รายงาน '+stock.reportDate));
    box.append(element('p',{},'Physical ล่าสุด · ยอดจองและ Free เป็นค่าที่บันทึกไว้ ยังไม่ยืนยันกับยอดขายล่าสุด · ไม่หักซ้ำ'));
    box.append(element('p',{},catalog?'ราคา/สกุลเงิน/หมายเหตุที่บันทึกตามสเปก · ไม่ใช่ราคาขายรายออเดอร์ และยังไม่ใช่ราคาเฉลี่ย 6 เดือนอัตโนมัติ':'กำลังอ่านชุดราคาที่บันทึก · แสดงจำนวนสต๊อกได้โดยไม่ต้องรอยอดขาย'));
    if(warning)box.append(element('p',{},warning));
    const scroll=element('div');scroll.style.cssText='overflow:auto;max-width:100%';scroll.setAttribute('tabindex','0');
    const table=element('table');table.style.cssText='border-collapse:collapse;width:100%;min-width:840px;font-size:12px';
    const head=element('thead'),header=element('tr');
    for(const title of ['SKU / ขนาด / เกรด','หน่วย','Physical','ยอดจองที่บันทึก','Free ที่บันทึก','ราคาที่บันทึก / หน่วย','สกุลเงิน','หมายเหตุ / การติดตาม'])header.append(element('th',{},title));
    head.append(header);const body=element('tbody'),format=value=>typeof value==='number'?value.toLocaleString('th-TH',{maximumFractionDigits:4}):'—';
    for(const row of rows){
      const tr=element('tr');tr.setAttribute('data-saved-stock-key',row.key);
      const notes=[row.note&&'สต๊อก: '+row.note,row.followup&&'ติดตาม: '+row.followup,row.specNote&&'สเปก: '+row.specNote,row.thicknessNote&&'ความหนา: '+row.thicknessNote,row.priceStatus].filter(Boolean).join('\n');
      for(const value of [(row.sku||'—')+'\n'+row.w+' × '+row.l+' × '+row.t+' '+row.grade,row.unit==='sheet'?'แผ่น':'ชิ้น strip',format(row.qty),format(row.committedQty),format(row.freeQty),format(row.price),row.currency||'—',notes]){const td=element('td',{},value);td.style.cssText='padding:8px;border-top:1px solid #dbe3ed;white-space:pre-wrap;vertical-align:top';tr.append(td);}body.append(tr);
    }
    table.append(head,body);scroll.append(table);box.append(scroll);content.replaceChildren(box);fallbackContent=content;
  }
  async function mountSavedStockFallback(content,state,version,currentHost,auth){
    const stock=stockSnapshot,epoch=accessEpoch;
    const safe=()=>!fxBlocked&&current(version,currentHost,auth)&&epoch===accessEpoch&&stock&&stockSnapshot?.stamp===stock.stamp&&stock.auth===auth;
    if(!safe())return;
    readOnly=true;clearSavedStockCatalog();renderSavedStock(content,stock);
    try{
      const response=await request(null,true);if(!safe())return;
      const catalog=savedCatalogRows(stock,response);renderSavedStock(content,stock,catalog);publishSavedCatalog(catalog);
    }catch(cause){
      if(!safe())return;
      if(['auth-required','auth-expired','permission-denied'].includes(cause.code)){denyAutomaticFx();setReportLoadStatus('unavailable',readError(cause.code));message(state,readMessages[cause.code],true);return;}
      clearSavedStockCatalog();renderSavedStock(content,stock,null,cause.code==='snapshot-changed'?'ชุดราคากับสต๊อกเป็นคนละรุ่น · ไม่แสดงราคาปะปน กรุณาโหลดล่าสุด':'อ่านชุดราคาไม่สำเร็จ · จำนวนสต๊อกยังแสดงครบ ราคาไม่ทราบแสดง — ไม่ใช้ 0 แทน');
    }
  }
  function stopAutomaticFx(){if(fxRun)fxRun.stopped=true;fxRun=null;if(fxTimer!==null)window.clearInterval?.(fxTimer);fxTimer=null;}
  function clearHeaderFx(){headerFx=null;fxSession='';window.AAFStockSummary?.setExchangeRate?.(null);}
  function denyAutomaticFx(){const hadFallback=!!fallbackContent;fxBlocked=true;stopAutomaticFx();clearHeaderFx();clearFallback();if(hadFallback)setReportLoadStatus('unavailable',readError('auth-expired'));publishReportSummary(null);}
  function validAutomaticFx(value){
    const date=value?.date;
    if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
    const stamp=new Date(date+'T00:00:00.000Z');
    if(!Number.isFinite(stamp.getTime())||stamp.toISOString().slice(0,10)!==date||date>new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10))return null;
    if(value.basis!=='BOT_USD_THB_BUYING_TRANSFER'||typeof value.rate!=='number'||!Number.isFinite(value.rate)||value.rate<=0||value.rate>1000||!['current','stale','unavailable'].includes(value.status))return null;
    return {rate:value.rate,date,status:value.status,basis:value.basis,url:'https://www.bot.or.th/th/statistics/exchange-rate.html',sourceLabel:'ธปท. · อัตราซื้อเงินโอน USD รายวัน',...(typeof value.checkedAt==='string'?{checkedAt:value.checkedAt}:{})};
  }
  const sameSessionFx=()=>fxSession&&fxSession===session&&fxSession===token()&&headerFx?{...headerFx}:null;
  function applyViewFx(run,value){
    const active=view,price=active?.getPriceState?.();
    // Header reads are independent. The valuation view retains its existing draft/focus guards.
    if(!run.stopped&&fxRun===run&&run.epoch===accessEpoch&&current(run.version,run.host,run.auth)&&!loadFailed&&!readOnly&&viewGeneration===run.version&&!price?.dirty&&!price?.saving&&!document.activeElement?.matches?.('input,textarea,select')&&!run.host.shadowRoot?.activeElement?.matches?.('input,textarea,select'))active?.setAutomaticFx?.(value);
  }
  function startAutomaticFx(version,currentHost,auth){
    const hasHeader=typeof window.AAFStockSummary?.setExchangeRate==='function';
    if(fxBlocked||!auth||(!hasHeader&&typeof view?.setAutomaticFx!=='function'))return;
    if(fxRun&&fxRun.version===version&&fxRun.host===currentHost&&fxRun.auth===auth&&fxRun.epoch===accessEpoch){const value=sameSessionFx();if(value)applyViewFx(fxRun,value);return;}
    stopAutomaticFx();
    const run={version,host:currentHost,auth,epoch:accessEpoch,busy:false,stopped:false};fxRun=run;
    const safe=()=>!run.stopped&&fxRun===run&&run.epoch===accessEpoch&&current(version,currentHost,auth);
    const refresh=async()=>{
      if(run.busy||!safe()||document.visibilityState==='hidden')return;
      // Preserve the legacy view-only polling behavior when the header is not mounted.
      const price=view?.getPriceState?.();
      if(!hasHeader&&(loadFailed||readOnly||price?.dirty||price?.saving||document.activeElement?.matches?.('input,textarea,select')||currentHost.shadowRoot?.activeElement?.matches?.('input,textarea,select')))return;
      run.busy=true;
      try{
        const response=await fetch(API+'?view=exchangeRate',{method:'GET',cache:'no-store',headers:{Authorization:'Bearer '+auth}});
        if(!safe())return;
        if(response.status===401||response.status===403){denyAutomaticFx();return;}
        const data=await response.json();if(!safe())return;
        const value=response.ok&&data?.ok?validAutomaticFx(data.exchangeRate):null;
        if(!value||(sameSessionFx()&&value.date<headerFx.date))throw new Error('fx-unavailable');
        headerFx=value;fxSession=auth;window.AAFStockSummary?.setExchangeRate?.({...value});applyViewFx(run,value);
      }catch{
        if(safe()){
          const previous=sameSessionFx();headerFx=previous?{...previous,status:'unavailable'}:null;fxSession=headerFx?auth:'';
          window.AAFStockSummary?.setExchangeRate?.(headerFx?{...headerFx}:null);applyViewFx(run,headerFx||{status:'unavailable'});
        }
      }finally{run.busy=false;}
    };
    run.refresh=refresh;refresh();fxTimer=window.setInterval?.(refresh,30*60*1000)??null;
  }
  function message(node,text,error=false){node.textContent=text;node.style.color=error?'#b42332':'#52657a';}
  function element(tag,props={},text=''){const el=document.createElement(tag);Object.assign(el,props);if(text)el.textContent=text;return el;}
  function shell(){
    host=element('section',{id:'stock-sales-preview-host'});host.setAttribute('aria-label','พรีวิวฝ่ายขายและสต๊อกเดิม');
    // Native open shadow root preserves CSS isolation, unlike an origin-changing iframe.
    const shadow=host.attachShadow({mode:'open'}),css=element('link',{rel:'stylesheet',href:new URL('stock_sales_preview.css?v=20261002-stock-partition-prices',assetBase).href});
    const base=element('style',{},':host{display:block;background:#fff;color:#172b42;font-family:Prompt,Arial,sans-serif}*{box-sizing:border-box}.preview-state{padding:12px;font-size:13px}.preview-import{padding:18px;border:1px solid #d4dee7;border-radius:10px;background:#f8fafc;font-size:14px}.preview-import input{display:block;margin:10px 0;max-width:100%}.preview-import button{border:0;border-radius:8px;padding:10px 14px;background:#0d7669;color:#fff;font:inherit;cursor:pointer}.preview-import button:disabled{opacity:.5}');
    const state=element('p',{className:'preview-state'},'กำลังโหลดพรีวิวฝ่ายขายและราคาที่เซฟไว้…');statusNode=state;state.setAttribute('role','status');
    const content=element('div',{id:'sales-preview-content'});shadow.append(css,base,state,content);return {state,content};
  }
  async function mount(data,content,state,version,currentHost,auth){
    if(!current(version,currentHost,auth))return;
    catalogRevision=data.catalogRevision;let mountedCatalogRevision=data.catalogRevision;
    const p=data.preview;
    if(salesMode&&data.permissions?.pricesAndNotes!==true)throw readError('permission-denied');
    if(salesMode&&stockRevision!==null&&data.revision!==stockRevision)throw new Error('ข้อมูลเปลี่ยนระหว่างโหลด · กรุณากดโหลดล่าสุดอีกครั้ง');
    if(!previewMatchesStock(data))throw readError('report-pending');
    const evidence=reportEvidence(data),withEvidence=summary=>summary&&evidence?{...summary,evidence}:summary;
    mountedSnapshotStamp=stockSnapshot?.stamp??null;
    readOnly=false;accessError=null;blockedSaveError=null;reconciliationError=null;
    if(!p||!window.AafAllModel||!window.mountAllThickness)throw new Error('โหลดตัวแสดงพรีวิวไม่ครบ กรุณารีเฟรช');
    if(!data.widgetState){
      if(salesMode)throw new Error('ยังไม่มีชุดราคาที่บันทึก · รอเจ้าของจัดเตรียมรายงาน');
      const box=element('div',{className:'preview-import'}),label=element('label',{},'นำเข้าราคาและหมายเหตุที่เซฟไว้จากพรีวิวเดิม');
      const file=element('input',{type:'file',accept:'.json,application/json'});file.setAttribute('aria-label','ไฟล์ราคาและหมายเหตุจากพรีวิวเดิม');label.append(file);
      const pasted=element('textarea',{rows:5,placeholder:'หรือวาง JSON ที่ส่งออกจากพรีวิวเดิม'});pasted.setAttribute('aria-label','JSON ราคาและหมายเหตุจากพรีวิวเดิม');pasted.style.cssText='display:block;width:100%;margin:10px 0';
      const button=element('button',{type:'button',disabled:true},'นำเข้าราคาเดิมครั้งแรก'),feedback=element('p',{});
      box.append(label,pasted,button,feedback);content.replaceChildren(box);message(state,'ยังไม่นำเข้าราคาเดิม · ไม่ใช้ราคาเฉลี่ยมาทับ');
      const enable=()=>{button.disabled=!file.files?.length&&!pasted.value.trim();};file.addEventListener('change',enable);pasted.addEventListener('input',enable);
      button.addEventListener('click',async()=>{
        if(!file.files?.[0]&&!pasted.value.trim())return;button.disabled=true;
        try{
          const widgetState=JSON.parse(file.files?.[0]?await file.files[0].text():pasted.value);
          if(!current(version,currentHost,auth))throw new Error('เซสชันเปลี่ยนแล้ว · กรุณาเริ่มใหม่');
          const fresh=await request(null,true);
          if(!current(version,currentHost,auth))throw new Error('เซสชันเปลี่ยนแล้ว · กรุณาเริ่มใหม่');
          if(fresh.catalogRevision!==0)throw new Error('มีราคาในระบบแล้ว จึงไม่ได้นำเข้าทับ');
          const result=await request({action:'importSalesPreview',expectedRevision:fresh.revision,expectedCatalogRevision:0,widgetState});
          if(!current(version,currentHost,auth))return;
          if(!sameSavedValue(result.widgetState,widgetState))throw new Error('ข้อมูลหลังนำเข้าไม่ตรง กรุณาตรวจสอบ');
          const imported={...data,...result};if(guardedReports.has(data))guardedReports.add(imported);
          await mount(imported,content,state,version,currentHost,auth);
        }catch(e){message(feedback,e.message,true);button.disabled=false;}
      });
      return;
    }
    const root=element('section',{id:'sales-stock-preview-16'});content.replaceChildren(root);
    let reconcileRequired=null;
    const requireReconciliation=cause=>{reconcileRequired=cause;if(current(version,currentHost,auth))reconciliationError=cause;return cause;};
    const store={widgetState:data.widgetState,load:()=>data.widgetState,setWidgetState:async value=>{
      if(reconcileRequired)throw reconcileRequired;
      if(readOnly)throw accessError||saveError('read-only');
      if(!token())throw saveError('auth-required');
      if(!current(version,currentHost,auth))throw saveError('session-changed');
      const latest=await request(null,true);
      if(!current(version,currentHost,auth))throw saveError('session-changed');
      if(latest.catalogRevision!==mountedCatalogRevision)throw saveError('catalog-conflict');
      const p=value.privateContent;
      let saved;try{saved=await request(salesMode?{action:'saveSalesReport',expectedRevision:latest.revision,expectedCatalogRevision:mountedCatalogRevision,prices:p.prices,currencies:p.currencies,notesByThickness:p.notesByThickness,notesBySpec:p.notesBySpec,savedAt:p.savedAt}:{action:'saveSalesPreview',expectedRevision:latest.revision,expectedCatalogRevision:mountedCatalogRevision,widgetState:value});}
      catch(cause){if(uncertainCodes.has(cause?.code))requireReconciliation(cause);throw cause;}
      if(!current(version,currentHost,auth))throw requireReconciliation(saveError('session-changed-after-save'));
      const expected=salesMode?{...value.privateContent,savedAt:saved.widgetState?.privateContent?.savedAt}:value;
      if(!sameSavedValue(salesMode?saved.widgetState?.privateContent:saved.widgetState,expected))throw requireReconciliation(saveError('readback-mismatch'));
      mountedCatalogRevision=saved.catalogRevision;catalogRevision=saved.catalogRevision;store.widgetState=saved.widgetState;clearSavedStockCatalog();return saved.widgetState;
    }};
    // Both grouping and financial arithmetic remain in the original model/view.
    const model=window.AafAllModel.buildModel(p.salesRows,p.stockRows,p.modelOptions);
    const mountedView=window.mountAllThickness(root,model,{...p.options,financialEvidenceUnavailable:evidence?.financialEvidence==='unavailable-plan-only',automaticFx:true,fxReference:{...p.options?.fxReference,url:'https://www.bot.or.th/th/statistics/exchange-rate.html',sourceLabel:'ธปท. · อัตราซื้อเงินโอน USD รายวัน'},readOnly,priceNotesOnly:salesMode,store,persistenceLabel:salesMode?'ฝ่ายขาย · เซฟราคาและหมายเหตุร่วมกับเจ้าของ · ไม่แก้ยอดสต๊อก':'เก็บราคา สกุลเงิน และหมายเหตุในระบบ · ไม่เปลี่ยนยอดสต๊อกหรือใบขาย',onReportSummary:summary=>{if(current(version,currentHost,auth)&&view===mountedView)publishReportSummary(withEvidence(summary));},onPriceDraftChange:change=>{if(current(version,currentHost,auth)&&view===mountedView)publishPriceDraftChange(change);}});view=mountedView;viewGeneration=version;
    if(mountedView.ready&&(await mountedView.ready)===false){mountedView.destroy();if(view===mountedView){view=null;viewGeneration=0;}throw new Error('โหลดราคาที่เซฟไว้ไม่สำเร็จ · ยังไม่แสดงยอดสรุป');}
    if(!current(version,currentHost,auth)){mountedView.destroy();if(view===mountedView){view=null;viewGeneration=0;}return;}
    if(mountedView.getReportSummary)publishReportSummary(withEvidence(mountedView.getReportSummary()));
    if(stockSnapshot)try{publishSavedCatalog(savedCatalogRows(stockSnapshot,data));}catch{clearSavedStockCatalog();}
    startAutomaticFx(version,currentHost,auth);
    setReportLoadStatus('ready');
    message(state,evidence?evidenceText(evidence)+(salesMode?' · แก้ราคาและหมายเหตุได้':''):salesMode?'ฝ่ายขาย · แก้ราคาและหมายเหตุได้ · สต๊อก '+data.stockReportDate+' · ข้อมูลฝ่ายขาย '+data.salesReportDate:'');state.hidden=!evidence&&!salesMode;
  }
  function attach(slot){
    if(!slot)return;
    const auth=token();
    if(fxSession&&fxSession!==auth){stopAutomaticFx();clearHeaderFx();}
    const priceState=view?.getPriceState?.();
    if(host&&!loadFailed&&session===auth&&mountedSalesMode===salesMode&&(mountedRevision===stockRevision||priceState?.dirty||priceState?.saving)){
      if(mountedRevision!==stockRevision){if(statusNode){statusNode.hidden=false;message(statusNode,'ข้อมูลส่วนกลางเปลี่ยน · เก็บร่างราคาไว้แล้ว · เซฟหรือยกเลิกร่างแล้วกดโหลดล่าสุดก่อนใช้ยอดรายงาน',true);}publishReportSummary(null);}
      slot.replaceChildren(host);startAutomaticFx(generation,host,auth);return pending;
    }
    mountedRevision=stockRevision;mountedSalesMode=salesMode;loadFailed=false;blockedSaveError=null;accessError=null;reconciliationError=null;
    clearFallback();mountedSnapshotStamp=null;
    stopAutomaticFx();fxBlocked=false;
    if(view)view.destroy();view=null;viewGeneration=0;session=auth;publishReportSummary(null);const version=++generation,{state,content}=shell(),currentHost=host;slot.replaceChildren(currentHost);
    setReportLoadStatus('loading');
    pending=request().then(data=>current(version,currentHost,auth)?mount(data,content,state,version,currentHost,auth):undefined).catch(async e=>{if(current(version,currentHost,auth)){loadFailed=true;const cause=e.code==='report-pending'?e:readError(['auth-required','auth-expired','permission-denied'].includes(e.code)?e.code:'read-unavailable');if(['auth-required','auth-expired','permission-denied'].includes(cause.code))denyAutomaticFx();setReportLoadStatus(cause.code==='report-pending'?'pending':'unavailable',cause);message(state,cause.message,true);publishReportSummary(null);if(cause.code==='report-pending')await mountSavedStockFallback(content,state,version,currentHost,auth);}});
    startAutomaticFx(version,currentHost,auth);return pending;
  }
  const sameSessionView=()=>session&&session===token()&&viewGeneration===generation?view:null;
  const editableView=()=>{if(readOnly)return null;const active=sameSessionView(),state=active?.getPriceState?.();return active&&state&&!state.loading&&!state.loadFailed?active:null;};
  const saveBlockage=()=>!token()?saveError('auth-required'):view&&session!==token()?saveError('session-changed'):reconciliationError||accessError||readOnly&&saveError('read-only')||saveError('catalog-unavailable');
  const getSaveStatus=()=>{const active=sameSessionView(),state=active?.getPriceState?.(),cause=active&&reconciliationError||blockedSaveError||accessError,uncertain=uncertainCodes.has(cause?.code||state?.errorCode);return {error:cause?.message||state?.error||'',errorCode:cause?.code||state?.errorCode||'',blocked:!!cause||uncertain,uncertain};};
  window.AAFSalesPreview={
    setAccess:access=>{const price=view?.getPriceState?.(),refreshReport=access.refreshReport===true&&!price?.dirty&&!price?.saving;const mode=window.AAFStockAccess?.isShared()===true||access.salesMode===true;const required=Object.hasOwn(access,'rows')||Object.hasOwn(access,'reportDate'),snapshot=required?centralSnapshot(access):null;if(refreshReport||mode!==salesMode||stockRevision!==(access.revision??null)||stockSnapshot?.stamp!==snapshot?.stamp){accessEpoch++;clearSavedStockCatalog();}if(refreshReport){loadFailed=true;mountedSnapshotStamp=null;publishReportSummary(null);}snapshotRequired=required;stockSnapshot=snapshot;if(mode!==salesMode){salesMode=mode;readOnly=mode;publishReportSummary(null);}stockRevision=access.revision??null;},
    invalidate:text=>{accessEpoch++;readOnly=true;loadFailed=true;accessError=saveError(/เข้าสู่ระบบ/.test(String(text))?'auth-expired':'access-invalidated');setReportLoadStatus('unavailable',readError('auth-expired'));sameSessionView()?.setPersistenceError?.(accessError);denyAutomaticFx();publishReportSummary(null);if(statusNode){statusNode.hidden=false;message(statusNode,accessError.message,true);}},
    isReadOnly:()=>readOnly,
    attach,
    isDirty:()=>!!sameSessionView()?.getPriceState?.().dirty,
    isSaving:()=>!!sameSessionView()?.getPriceState?.().saving,
    getReportSummary:()=>session===token()&&mountedRevision===stockRevision&&stockEvidenceCurrent()?reportSummary:null,
    getReportLoadStatus:()=>session===token()?{...reportLoadStatus}:{state:'unavailable',code:'snapshot-changed',message:readMessages['snapshot-changed'],stockRevision:null},
    getExchangeRateStatus:sameSessionFx,
    readExportSnapshot,
    getPriceState:()=>{const state=sameSessionView()?.getPriceState?.(),cause=reconciliationError||accessError;return state?{...state,readOnly,...(cause?{error:cause.message,errorCode:cause.code}:{})}:null;},
    getSaveStatus,
    getDraftPrice:key=>editableView()?.getDraftPrice?.(key) || null,
    setDraftPrice:(key,value,currency)=>editableView()?.setDraftPrice?.(key,value,currency) === true,
    savePrices:async()=>{const active=editableView(),version=generation,auth=session;if(!active?.savePrices||reconciliationError){blockedSaveError=saveBlockage();sameSessionView()?.setPersistenceError?.(blockedSaveError);return false;}blockedSaveError=null;try{const saved=await active.savePrices();return saved===true&&active===sameSessionView()&&version===generation&&auth===session&&auth===token();}catch(cause){blockedSaveError=saveError(Object.hasOwn(saveMessages,cause?.code)?cause.code:'save-outcome-unknown');if(active===sameSessionView())active.setPersistenceError?.(blockedSaveError);return false;}},
  };
  document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState!=='hidden')fxRun?.refresh();});
  window.addEventListener('beforeunload',event=>{if(view?.getPriceState().dirty||view?.getPriceState().saving){event.preventDefault();event.returnValue='';}});
})();
