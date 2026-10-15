/* Authenticated home for the unchanged sales preview. Never writes stock quantities. */
(() => {
  'use strict';
  const API='https://aaf-grade-insight-2569.bbeautybbsoraai.chatgpt.site/api/aaf/stock';
  const assetBase=new URL('.',document.currentScript.src);
  let host=null,view=null,viewGeneration=0,session='',catalogRevision=0,pending=null,generation=0,reportSummary=null;
  let readOnly=false,salesMode=false,stockRevision=null,mountedRevision=null,mountedSalesMode=false,loadFailed=false,statusNode=null;
  let fxTimer=null,accessEpoch=0;
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
    'report-pending':'รายละเอียดยอดขายและมูลค่ายังไม่ตรงกับสต๊อกส่วนกลาง · แสดงจำนวนสต๊อกที่ยืนยันแล้วได้ แต่รอเจ้าของตรวจชุดยอดขายก่อน',
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
  function publishReportSummary(summary){reportSummary=mountedRevision===stockRevision?summary:null;window.AAFStockSummary?.setSalesSummary?.(reportSummary);}
  function publishPriceDraftChange(change){window.AAFStockSummary?.syncPriceDrafts?.(change);}
  async function request(body=null,catalogOnly=false){
    if(body&&readOnly)throw accessError||saveError('read-only');
    const auth=token();if(!auth)throw saveError('auth-required');
    let response;
    try{response=await fetch(API+(body?'':'?view='+(salesMode?'salesReport':'salesPreview')+(catalogOnly?'&catalogOnly=1':'')),{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+auth,...(body?{'Content-Type':'text/plain;charset=UTF-8'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
    catch{throw saveError(body?'save-outcome-unknown':'preflight-failed');}
    if(response.status===401)throw saveError('auth-expired');
    if(response.status===403)throw saveError('permission-denied');
    if(response.status===409||response.status===412)throw !body&&!catalogOnly?readError('report-pending'):saveError('catalog-conflict');
    if(body&&(response.status===400||response.status===422))throw saveError('save-rejected');
    let data;try{data=await response.json();}catch{throw saveError(body?'save-outcome-unknown':'preflight-failed');}
    if(!response.ok||!data.ok)throw saveError(body?'save-outcome-unknown':'preflight-failed');return data;
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
  function startAutomaticFx(active,version,currentHost,auth){
    if(typeof active.setAutomaticFx!=='function')return;
    let busy=false;
    const safe=()=>{const price=active.getPriceState?.();return !loadFailed&&!readOnly&&current(version,currentHost,auth)&&view===active&&!price?.dirty&&!price?.saving&&!document.activeElement?.matches?.('input,textarea,select')&&!currentHost.shadowRoot?.activeElement?.matches?.('input,textarea,select');};
    const refresh=async()=>{
      // Do not rebuild summary cards under a price/notes draft or its focused input.
      if(busy||!safe()||document.visibilityState==='hidden')return;
      busy=true;
      try{
        const response=await fetch(API+'?view=exchangeRate',{cache:'no-store',headers:{Authorization:'Bearer '+auth}});
        const data=await response.json();
        if(!response.ok||!data.ok)throw new Error('โหลดเรทไม่สำเร็จ');
        if(safe())active.setAutomaticFx(data.exchangeRate);
      }catch{
        if(safe())active.setAutomaticFx({status:'unavailable'});
      }finally{busy=false;}
    };
    refresh();
    fxTimer=window.setInterval?.(refresh,30*60*1000);
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
    if(salesMode&&data.permissions?.pricesAndNotes!==true)throw new Error('บัญชีนี้ยังไม่มีสิทธิ์ราคาและหมายเหตุฝ่ายขาย');
    if(salesMode&&stockRevision!==null&&data.revision!==stockRevision)throw new Error('ข้อมูลเปลี่ยนระหว่างโหลด · กรุณากดโหลดล่าสุดอีกครั้ง');
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
          await mount({...data,...result},content,state,version,currentHost,auth);
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
      mountedCatalogRevision=saved.catalogRevision;catalogRevision=saved.catalogRevision;store.widgetState=saved.widgetState;return saved.widgetState;
    }};
    // Both grouping and financial arithmetic remain in the original model/view.
    const model=window.AafAllModel.buildModel(p.salesRows,p.stockRows,p.modelOptions);
    const mountedView=window.mountAllThickness(root,model,{...p.options,automaticFx:true,fxReference:{...p.options?.fxReference,url:'https://www.bot.or.th/th/statistics/exchange-rate.html',sourceLabel:'ธปท. · อัตราซื้อเงินโอน USD รายวัน'},readOnly,priceNotesOnly:salesMode,store,persistenceLabel:salesMode?'ฝ่ายขาย · เซฟราคาและหมายเหตุร่วมกับเจ้าของ · ไม่แก้ยอดสต๊อก':'เก็บราคา สกุลเงิน และหมายเหตุในระบบ · ไม่เปลี่ยนยอดสต๊อกหรือใบขาย',onReportSummary:summary=>{if(current(version,currentHost,auth)&&view===mountedView)publishReportSummary(summary);},onPriceDraftChange:change=>{if(current(version,currentHost,auth)&&view===mountedView)publishPriceDraftChange(change);}});view=mountedView;viewGeneration=version;
    if(mountedView.ready&&(await mountedView.ready)===false){mountedView.destroy();if(view===mountedView){view=null;viewGeneration=0;}throw new Error('โหลดราคาที่เซฟไว้ไม่สำเร็จ · ยังไม่แสดงยอดสรุป');}
    if(!current(version,currentHost,auth)){mountedView.destroy();if(view===mountedView){view=null;viewGeneration=0;}return;}
    if(mountedView.getReportSummary)publishReportSummary(mountedView.getReportSummary());
    startAutomaticFx(mountedView,version,currentHost,auth);
    setReportLoadStatus('ready');
    message(state,salesMode?'ฝ่ายขาย · แก้ราคาและหมายเหตุได้ · สต๊อก '+data.stockReportDate+' · ข้อมูลฝ่ายขาย '+data.salesReportDate:'');state.hidden=!salesMode;
  }
  function attach(slot){
    if(!slot)return;
    const auth=token();
    const priceState=view?.getPriceState?.();
    if(host&&!loadFailed&&session===auth&&mountedSalesMode===salesMode&&(mountedRevision===stockRevision||priceState?.dirty||priceState?.saving)){
      if(mountedRevision!==stockRevision){if(statusNode){statusNode.hidden=false;message(statusNode,'ข้อมูลส่วนกลางเปลี่ยน · เก็บร่างราคาไว้แล้ว · เซฟหรือยกเลิกร่างแล้วกดโหลดล่าสุดก่อนใช้ยอดรายงาน',true);}publishReportSummary(null);}
      slot.replaceChildren(host);return pending;
    }
    mountedRevision=stockRevision;mountedSalesMode=salesMode;loadFailed=false;blockedSaveError=null;accessError=null;reconciliationError=null;
    if(fxTimer!==null)window.clearInterval?.(fxTimer);fxTimer=null;
    if(view)view.destroy();view=null;viewGeneration=0;session=auth;publishReportSummary(null);const version=++generation,{state,content}=shell(),currentHost=host;slot.replaceChildren(currentHost);
    setReportLoadStatus('loading');
    pending=request().then(data=>current(version,currentHost,auth)?mount(data,content,state,version,currentHost,auth):undefined).catch(e=>{if(current(version,currentHost,auth)){loadFailed=true;const cause=e.code==='report-pending'?e:readError(['auth-required','auth-expired','permission-denied'].includes(e.code)?e.code:'read-unavailable');setReportLoadStatus(cause.code==='report-pending'?'pending':'unavailable',cause);message(state,cause.message,true);publishReportSummary(null);}});return pending;
  }
  const sameSessionView=()=>session&&session===token()&&viewGeneration===generation?view:null;
  const editableView=()=>{if(readOnly)return null;const active=sameSessionView(),state=active?.getPriceState?.();return active&&state&&!state.loading&&!state.loadFailed?active:null;};
  const saveBlockage=()=>!token()?saveError('auth-required'):view&&session!==token()?saveError('session-changed'):reconciliationError||accessError||readOnly&&saveError('read-only')||saveError('catalog-unavailable');
  const getSaveStatus=()=>{const active=sameSessionView(),state=active?.getPriceState?.(),cause=active&&reconciliationError||blockedSaveError||accessError,uncertain=uncertainCodes.has(cause?.code||state?.errorCode);return {error:cause?.message||state?.error||'',errorCode:cause?.code||state?.errorCode||'',blocked:!!cause||uncertain,uncertain};};
  window.AAFSalesPreview={
    setAccess:access=>{const mode=window.AAFStockAccess?.isShared()===true||access.salesMode===true;if(mode!==salesMode||stockRevision!==(access.revision??null))accessEpoch++;if(mode!==salesMode){salesMode=mode;readOnly=mode;publishReportSummary(null);}stockRevision=access.revision??null;},
    invalidate:text=>{accessEpoch++;readOnly=true;loadFailed=true;accessError=saveError(/เข้าสู่ระบบ/.test(String(text))?'auth-expired':'access-invalidated');setReportLoadStatus('unavailable',readError('auth-expired'));sameSessionView()?.setPersistenceError?.(accessError);if(fxTimer!==null)window.clearInterval?.(fxTimer);fxTimer=null;publishReportSummary(null);if(statusNode){statusNode.hidden=false;message(statusNode,accessError.message,true);}},
    isReadOnly:()=>readOnly,
    attach,
    isDirty:()=>!!sameSessionView()?.getPriceState?.().dirty,
    isSaving:()=>!!sameSessionView()?.getPriceState?.().saving,
    getReportSummary:()=>session===token()?reportSummary:null,
    getReportLoadStatus:()=>session===token()?{...reportLoadStatus}:{state:'unavailable',code:'snapshot-changed',message:readMessages['snapshot-changed'],stockRevision:null},
    readExportSnapshot,
    getPriceState:()=>{const state=sameSessionView()?.getPriceState?.(),cause=reconciliationError||accessError;return state?{...state,readOnly,...(cause?{error:cause.message,errorCode:cause.code}:{})}:null;},
    getSaveStatus,
    getDraftPrice:key=>editableView()?.getDraftPrice?.(key) || null,
    setDraftPrice:(key,value,currency)=>editableView()?.setDraftPrice?.(key,value,currency) === true,
    savePrices:async()=>{const active=editableView(),version=generation,auth=session;if(!active?.savePrices||reconciliationError){blockedSaveError=saveBlockage();sameSessionView()?.setPersistenceError?.(blockedSaveError);return false;}blockedSaveError=null;try{const saved=await active.savePrices();return saved===true&&active===sameSessionView()&&version===generation&&auth===session&&auth===token();}catch(cause){blockedSaveError=saveError(Object.hasOwn(saveMessages,cause?.code)?cause.code:'save-outcome-unknown');if(active===sameSessionView())active.setPersistenceError?.(blockedSaveError);return false;}},
  };
  window.addEventListener('beforeunload',event=>{if(view?.getPriceState().dirty||view?.getPriceState().saving){event.preventDefault();event.returnValue='';}});
})();
