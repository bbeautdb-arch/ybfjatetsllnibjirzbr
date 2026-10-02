/* Authenticated home for the unchanged sales preview. Never writes stock quantities. */
(() => {
  'use strict';
  const API='https://aaf-grade-insight-2569.bbeautybbsoraai.chatgpt.site/api/aaf/stock';
  const assetBase=new URL('.',document.currentScript.src);
  let host=null,view=null,viewGeneration=0,session='',catalogRevision=0,pending=null,generation=0,reportSummary=null;
  let readOnly=false,salesMode=false,stockRevision=null,mountedRevision=null,mountedSalesMode=false,loadFailed=false,statusNode=null;
  const token=()=>{if(window.AAFStockAccess)return window.AAFStockAccess.token();if(window.AAFStockAccessRequired)return '';try{const s=JSON.parse(sessionStorage.getItem('aaf_user'));return s?.stockSessionToken||s?.gradeBridgeSessionToken||s?.bridgeSessionToken||'';}catch{return '';}};
  const current=(version,currentHost,auth)=>version===generation&&currentHost===host&&auth===session&&auth===token();
  function publishReportSummary(summary){reportSummary=mountedRevision===stockRevision?summary:null;window.AAFStockSummary?.setSalesSummary?.(reportSummary);}
  function publishPriceDraftChange(change){window.AAFStockSummary?.syncPriceDrafts?.(change);}
  async function request(body=null,catalogOnly=false){
    if(body&&readOnly)throw new Error('รายงานนี้ดูอย่างเดียว');
    const auth=token();if(!auth)throw new Error('กรุณาเข้าสู่ระบบ AAF ก่อนดูยอดขาย');
    const response=await fetch(API+(body?'':'?view='+(salesMode?'salesReport':'salesPreview')+(catalogOnly?'&catalogOnly=1':'')),{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+auth,...(body?{'Content-Type':'text/plain;charset=UTF-8'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'โหลดพรีวิวไม่สำเร็จ');return data;
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
    readOnly=false;
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
          if(JSON.stringify(result.widgetState)!==JSON.stringify(widgetState))throw new Error('ข้อมูลหลังนำเข้าไม่ตรง กรุณาตรวจสอบ');
          await mount({...data,...result},content,state,version,currentHost,auth);
        }catch(e){message(feedback,e.message,true);button.disabled=false;}
      });
      return;
    }
    const root=element('section',{id:'sales-stock-preview-16'});content.replaceChildren(root);
    const store={widgetState:data.widgetState,load:()=>data.widgetState,setWidgetState:async value=>{
      if(readOnly)throw new Error('รายงานนี้ดูอย่างเดียว');
      if(!current(version,currentHost,auth))throw new Error('เซสชันเปลี่ยนแล้ว · ยังไม่ได้เซฟ');
      const latest=await request(null,true);
      if(!current(version,currentHost,auth))throw new Error('เซสชันเปลี่ยนแล้ว · ยังไม่ได้เซฟ');
      if(latest.catalogRevision!==mountedCatalogRevision)throw new Error('มีราคาใหม่จากอีกหน้า ยังไม่ได้ทับข้อมูล');
      const p=value.privateContent;
      const saved=await request(salesMode?{action:'saveSalesReport',expectedRevision:latest.revision,expectedCatalogRevision:mountedCatalogRevision,prices:p.prices,currencies:p.currencies,notesByThickness:p.notesByThickness,savedAt:p.savedAt}:{action:'saveSalesPreview',expectedRevision:latest.revision,expectedCatalogRevision:mountedCatalogRevision,widgetState:value});
      if(!current(version,currentHost,auth))throw new Error('เซสชันเปลี่ยนแล้ว · เซฟแล้วแต่ไม่ได้นำมาทับหน้าใหม่');
      const expected=salesMode?{...value.privateContent,savedAt:saved.widgetState?.privateContent?.savedAt}:value;
      if(JSON.stringify(salesMode?saved.widgetState?.privateContent:saved.widgetState)!==JSON.stringify(expected))throw new Error('ข้อมูลที่อ่านกลับไม่ตรงกับที่เซฟ');
      mountedCatalogRevision=saved.catalogRevision;catalogRevision=saved.catalogRevision;store.widgetState=saved.widgetState;return saved.widgetState;
    }};
    // Both grouping and financial arithmetic remain in the original model/view.
    const model=window.AafAllModel.buildModel(p.salesRows,p.stockRows,p.modelOptions);
    const mountedView=window.mountAllThickness(root,model,{...p.options,readOnly,priceNotesOnly:salesMode,store,persistenceLabel:salesMode?'ฝ่ายขาย · เซฟราคาและหมายเหตุร่วมกับเจ้าของ · ไม่แก้ยอดสต๊อก':'เก็บราคา สกุลเงิน และหมายเหตุในระบบ · ไม่เปลี่ยนยอดสต๊อกหรือใบขาย',onReportSummary:summary=>{if(current(version,currentHost,auth)&&view===mountedView)publishReportSummary(summary);},onPriceDraftChange:change=>{if(current(version,currentHost,auth)&&view===mountedView)publishPriceDraftChange(change);}});view=mountedView;viewGeneration=version;
    if(mountedView.ready&&(await mountedView.ready)===false){mountedView.destroy();if(view===mountedView){view=null;viewGeneration=0;}throw new Error('โหลดราคาที่เซฟไว้ไม่สำเร็จ · ยังไม่แสดงยอดสรุป');}
    if(!current(version,currentHost,auth)){mountedView.destroy();if(view===mountedView){view=null;viewGeneration=0;}return;}
    if(mountedView.getReportSummary)publishReportSummary(mountedView.getReportSummary());
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
    mountedRevision=stockRevision;mountedSalesMode=salesMode;loadFailed=false;
    if(view)view.destroy();view=null;viewGeneration=0;session=auth;publishReportSummary(null);const version=++generation,{state,content}=shell(),currentHost=host;slot.replaceChildren(currentHost);
    pending=request().then(data=>current(version,currentHost,auth)?mount(data,content,state,version,currentHost,auth):undefined).catch(e=>{if(current(version,currentHost,auth)){loadFailed=true;message(state,e.message,true);}});return pending;
  }
  const sameSessionView=()=>session&&session===token()&&viewGeneration===generation?view:null;
  const editableView=()=>{if(readOnly)return null;const active=sameSessionView(),state=active?.getPriceState?.();return active&&state&&!state.loading&&!state.loadFailed?active:null;};
  window.AAFSalesPreview={
    setAccess:access=>{const mode=window.AAFStockAccess?.isShared()===true||access.salesMode===true;if(mode!==salesMode){salesMode=mode;readOnly=mode;publishReportSummary(null);}stockRevision=access.revision??null;},
    invalidate:text=>{readOnly=true;loadFailed=true;publishReportSummary(null);if(statusNode){statusNode.hidden=false;message(statusNode,text,true);}},
    isReadOnly:()=>readOnly,
    attach,
    isDirty:()=>!!sameSessionView()?.getPriceState?.().dirty,
    isSaving:()=>!!sameSessionView()?.getPriceState?.().saving,
    getReportSummary:()=>session===token()?reportSummary:null,
    getPriceState:()=>{const state=sameSessionView()?.getPriceState?.();return state?{...state,readOnly}:null;},
    getDraftPrice:key=>editableView()?.getDraftPrice?.(key) || null,
    setDraftPrice:(key,value,currency)=>editableView()?.setDraftPrice?.(key,value,currency) === true,
    savePrices:async()=>{const active=editableView(),version=generation,auth=session;if(!active?.savePrices)return false;try{const saved=await active.savePrices();return saved===true&&active===sameSessionView()&&version===generation&&auth===session&&auth===token();}catch{return false;}},
  };
  window.addEventListener('beforeunload',event=>{if(view?.getPriceState().dirty||view?.getPriceState().saving){event.preventDefault();event.returnValue='';}});
})();
