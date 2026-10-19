/* Authenticated monthly read model. Never writes allocations, stock or prices. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AAFOrderReview=api.boot(root);
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const API='https://aaf-grade-insight-2569.bbeautybbsoraai.chatgpt.site/api/aaf/stock';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const equal=(a,b)=>a===b||!!a&&!!b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));
  const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
  function verifiedWrite(before,after,changes){
    const p=after.catalog.widgetState.privateContent;
    const expected={...clone(before.catalog.widgetState.privateContent),notesBySpec:{...(before.catalog.widgetState.privateContent.notesBySpec||{}),...Object.fromEntries(changes.map(c=>[c.key,c.after]))},savedAt:p.savedAt};
    return after.snapshot.revision===before.snapshot.revision+1&&after.snapshot.catalogRevision===before.snapshot.catalogRevision+1&&typeof p.savedAt==='string'&&Number.isFinite(Date.parse(p.savedAt))&&equal(p,expected)&&equal(before.stock.rows,after.stock.rows)&&before.stock.exchangeRate===after.stock.exchangeRate&&equal(before.stock.report,after.stock.report)&&equal(before.stock.sellablePlan,after.stock.sellablePlan);
  }
  function createNotesService(env){
    let busy=false,uncertain=null;
    const guard=scope=>{if(scope!==env.scope())fail('session-changed','เซสชันหรือข้อมูลเปลี่ยน กรุณาโหลดส่วนกลางใหม่');};
    async function readCurrent(scope){
      for(let i=0;i<2;i++){
        guard(scope);const stock=await env.request(''),catalog=await env.request('?view=salesReport&catalogOnly=1');guard(scope);
        if(stock.revision!==catalog.revision&&i===0)continue;
        return env.core.parseSnapshot(stock,catalog,env.now());
      }
      fail('read-failed','ยังอ่านหมายเหตุส่วนกลางไม่ครบ');
    }
    async function readNotes(){
      const scope=env.scope(),fresh=await readCurrent(scope);
      if(uncertain){
        if(verifiedWrite(uncertain.before,fresh,uncertain.changes))uncertain=null;
        else if(equal(uncertain.before.stock,fresh.stock)&&equal(uncertain.before.catalog,fresh.catalog))uncertain=null;
        else fresh.snapshot.canSave=false;
      }
      return fresh.snapshot;
    }
    async function saveNotes(changes){
      if(busy||uncertain)fail('save-blocked','กำลังบันทึกหรือยังยืนยันผลครั้งก่อนไม่ได้ กรุณาโหลดหมายเหตุเพื่อตรวจผลก่อน');
      busy=true;const scope=env.scope();
      try{
        const before=await readCurrent(scope),valid=env.core.validChanges(changes,before.snapshot);
        guard(scope);uncertain={before,changes:valid};
        let result;
        try{result=await env.request('',{action:'saveSalesNotes',expectedRevision:before.snapshot.revision,expectedCatalogRevision:before.snapshot.catalogRevision,notesBySpec:Object.fromEntries(valid.map(c=>[c.key,c.after]))});}
        catch(e){if(['conflict','save-rejected'].includes(e.code))uncertain=null;throw e;}
        guard(scope);
        if(result.revision!==before.snapshot.revision+1||result.catalogRevision!==before.snapshot.catalogRevision+1)fail('save-uncertain','ยังยืนยันผลบันทึกไม่ได้ ห้ามส่งซ้ำ ให้โหลดหมายเหตุตรวจผลก่อน');
        const after=await readCurrent(scope);
        if(!verifiedWrite(before,after,valid))fail('save-uncertain','อ่านกลับไม่ตรงกับที่คาด ห้ามบันทึกซ้ำจนกว่าจะตรวจผล');
        uncertain=null;return after.snapshot;
      }finally{busy=false;}
    }
    async function prepareNotesFile(file,settings){
      if(busy||uncertain)fail('save-blocked','กรุณาตรวจผลบันทึกครั้งก่อนให้ครบก่อนนำเข้า');
      const scope=env.scope(),fresh=await readCurrent(scope);
      if(!fresh.snapshot.canSave||typeof env.parseFile!=='function')fail('read-only','ยังไม่มีสิทธิ์หรือเครื่องมือเพื่อนำเข้าหมายเหตุ');
      const plan=await env.parseFile(file,settings,fresh.stock.rows,fresh.snapshot.notesBySpec);guard(scope);
      return {...plan,snapshot:fresh.snapshot};
    }
    return {readNotes,saveNotes,prepareNotesFile,isBusy:()=>busy,isUncertain:()=>!!uncertain};
  }
  function boot(win){
    let host=null,body=null,status=null,select=null,view=null,loading=null,auth='',epoch=0,access=null,response=null,selectedMonth='',months=[],failed=false;
    const token=()=>{if(win.AAFStockAccess)return win.AAFStockAccess.token();if(win.AAFStockAccessRequired)return '';try{const user=JSON.parse(win.sessionStorage.getItem('aaf_user'));return user?.stockSessionToken||user?.gradeBridgeSessionToken||user?.bridgeSessionToken||'';}catch{return '';}};
    const scope=()=>epoch+'|'+token();
    const tell=text=>{if(status)status.textContent=text;};
    const invalidate=(message='กรุณาโหลดข้อมูลส่วนกลางใหม่')=>{
      epoch++;access=null;response=null;auth='';loading=null;failed=true;
      view?.destroy?.();view=null;body?.replaceChildren();
      win.AAFStockSummary?.setOrderReview?.(null,null);tell(message);
    };
    async function request(suffix='',payload=null){
      const current=scope(),credential=token();
      if(!credential||!access||credential!==auth)fail('auth-required','กรุณาเข้าสู่ระบบหรือโหลดสิทธิ์ส่วนกลางใหม่');
      if(payload&&access.notesReadOnly)fail('read-only','รายงานหน้านี้อ่านอย่างเดียว กรุณาแก้หมายเหตุที่หน้าสต๊อก');
      let res;
      try{res=await win.fetch(API+suffix,{method:payload?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+credential,...(payload?{'Content-Type':'text/plain;charset=UTF-8'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});}
      catch{fail(payload?'save-uncertain':'read-failed',payload?'ยังยืนยันผลบันทึกไม่ได้ ห้ามส่งซ้ำ ให้โหลดหมายเหตุตรวจผลก่อน':'อ่านส่วนกลางไม่สำเร็จ กรุณาตรวจการเชื่อมต่อ');}
      if(current!==scope())fail('session-changed','เซสชันเปลี่ยนระหว่างอ่าน ไม่ใช้ผลเก่า');
      if([401,403].includes(res.status)){invalidate(res.status===401?'กรุณาเข้าสู่ระบบ AAF ใหม่':'บัญชีหรือลิงก์นี้ไม่มีสิทธิ์อ่านรายงาน');fail('auth-expired','สิทธิ์อ่านข้อมูลหมดอายุหรือไม่เพียงพอ');}
      if([409,412].includes(res.status))fail('conflict','ข้อมูลส่วนกลางเปลี่ยนแล้ว กรุณาโหลดล่าสุดและตรวจร่างก่อนบันทึก');
      if(res.status===422&&!payload)fail('month-unavailable','เดือนนี้ยังไม่มีชุดข้อมูลที่ตรวจครบ ไม่ใช้เดือนอื่นแทน');
      if(payload&&[400,422].includes(res.status))fail('save-rejected','ระบบปฏิเสธรายการหมายเหตุ ยังไม่ได้ยืนยันผลสำเร็จ');
      let data;try{data=await res.json();}catch{fail(payload?'save-uncertain':'read-failed','ยังอ่านผลส่วนกลางไม่สำเร็จ');}
      if(current!==scope())fail('session-changed','เซสชันเปลี่ยนระหว่างอ่าน ไม่ใช้ผลเก่า');
      if(!res.ok||!data?.ok)fail(payload?'save-uncertain':'read-failed','ยังยืนยันผลจากส่วนกลางไม่ได้');
      return data;
    }
    const notes=createNotesService({scope,request,core:win.AAFStockNotesCore,now:()=>Date.now(),parseFile:async(file,settings,rows,existing)=>{
      if(!file||!/^.+\.(xlsx|xls)$/i.test(file.name||'')||file.size>10*1024*1024)fail('invalid-file','เลือกไฟล์ Excel ขนาดไม่เกิน 10 MB');
      if(!win.XLSX||!win.AAFStockNotesImport)fail('parser-unavailable','เครื่องมืออ่าน Excel ยังไม่พร้อม กรุณาโหลดหน้าใหม่');
      if(!['AD','AE'].includes(settings?.column)||!['append','replace'].includes(settings?.mode))fail('invalid-request','ต้องเลือกคอลัมน์หมายเหตุและวิธีนำเข้าให้ชัดเจน');
      const bytes=await file.arrayBuffer(),workbook=win.XLSX.read(bytes,{type:'array',cellFormula:true,cellDates:false});
      const parsed=win.AAFStockNotesImport.parseWorkbook(workbook,win.XLSX,{column:settings.column});
      return win.AAFStockNotesImport.buildPlan(parsed,rows,existing,{mode:settings.mode});
    }});
    function publish(){
      if(response)win.AAFStockSummary?.setOrderReview?.(response.review,{...response.readModel,availableMonths:months,selectedMonth});
    }
    function shell(){
      host=win.document.createElement('div');host.id='stock-order-review-host';
      const toolbar=win.document.createElement('div');toolbar.className='stock-order-toolbar';toolbar.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0';
      const label=win.document.createElement('label');label.textContent='เดือนขายเดียวกันในหัวข้อ 01 และ 02 ';
      select=win.document.createElement('select');select.setAttribute('aria-label','เดือนภาพรวมการขาย');select.addEventListener('change',()=>selectMonth(select.value));label.append(select);
      const refresh=win.document.createElement('button');refresh.type='button';refresh.textContent='โหลดภาพรวมล่าสุด';refresh.addEventListener('click',()=>load(true));
      status=win.document.createElement('p');status.setAttribute('role','status');status.style.cssText='white-space:pre-wrap;font-size:13px;margin:8px 0';
      body=win.document.createElement('div');toolbar.append(label,refresh);host.append(toolbar,status,body);
    }
    async function load(force=false){
      if(loading)return loading;
      if(view?.hasDirty?.()||notes.isBusy()||notes.isUncertain()){tell('มีร่างหมายเหตุหรือผลบันทึกที่ต้องตรวจ กรุณาเซฟ/ยกเลิกร่างหรือโหลดหมายเหตุตรวจผลก่อนเปลี่ยนรายงาน');return;}
      const stamp=scope();tell('กำลังอ่านภาพรวมเดือนที่เลือกจากส่วนกลาง…');
      loading=(async()=>{
        try{
          const data=await request('?view=orderReview'+(selectedMonth?'&month='+encodeURIComponent(selectedMonth):''));
          if(stamp!==scope())return;
          const available=data.availableMonths||data.readModel?.availableMonths||[];
          const month=data.selectedMonth||data.readModel?.selectedMonth||data.review?.metadata?.month;
          if(!data.review||!/^\d{4}-\d{2}$/.test(month||'')||!available.includes(month)||selectedMonth&&month!==selectedMonth||data.readModel?.sourceIsLive!==false||data.readModel?.queueApplied!==false)fail('invalid-report','รูปแบบหรือเดือนรายงานไม่ตรง ยังไม่แสดงยอดปะปน');
          if(data.revision!==access.revision||data.stockReportDate!==access.reportDate)fail('snapshot-changed','สต๊อกเปลี่ยนระหว่างอ่าน กรุณากดโหลดข้อมูลส่วนกลางล่าสุดด้านบนก่อน');
          response=data;selectedMonth=month;months=available;failed=false;
          select.replaceChildren(...months.map(m=>{const option=win.document.createElement('option');option.value=m;option.textContent=m;option.selected=m===month;return option;}));
          const review={...data.review,readModel:data.readModel};
          if(view)view.update(review);else view=win.AAFOrderReviewUI.mount(body,review,{readNotes:async()=>{const snapshot=await notes.readNotes();return access?.notesReadOnly?{...snapshot,canSave:false}:snapshot;},saveNotes:notes.saveNotes,prepareNotesFile:async(file,settings)=>{if(access?.notesReadOnly)fail('read-only','รายงานหน้านี้อ่านอย่างเดียว');return notes.prepareNotesFile(file,settings);}});
          publish();tell((data.readModel.warning||'ชุดยอดขายที่ตรวจไว้ ไม่ใช่การอ่านหน้า 09 สด')+' · เดือน '+month+' · อ่านส่วนกลาง '+new Date().toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})+' · ไม่เปลี่ยนยอดสต๊อก/จอง/ราคา');
        }catch(e){
          if(stamp!==scope())return;
          failed=true;response=null;view?.destroy?.();view=null;body.replaceChildren();win.AAFStockSummary?.setOrderReview?.(null,null);tell(e.message||'ยังแสดงภาพรวมไม่ได้ กรุณาโหลดล่าสุด');
        }finally{if(stamp===scope())loading=null;}
      })();return loading;
    }
    function selectMonth(month){
      if(!months.includes(month)||view?.hasDirty?.()||notes.isBusy()||notes.isUncertain()){if(select)select.value=selectedMonth;tell('ยังเปลี่ยนเดือนไม่ได้: ต้องเป็นเดือนที่ตรวจครบและไม่มีร่างค้าง');return false;}
      if(month===selectedMonth)return true;
      selectedMonth=month;response=null;win.AAFStockSummary?.setOrderReview?.(null,null);void load(true);return true;
    }
    function setAccess(next){
      const credential=token();
      if(!credential){invalidate('กรุณาเข้าสู่ระบบ AAF');return;}
      if(auth&&credential!==auth)invalidate('เซสชันเปลี่ยน กรุณาโหลดข้อมูลส่วนกลางใหม่');
      const changed=!access||access.revision!==next.revision||access.reportDate!==next.reportDate;
      auth=credential;access={revision:next.revision,reportDate:next.reportDate,notesReadOnly:next.notesReadOnly===true};
      if(changed||next.refreshReport){epoch++;loading=null;failed=true;response=null;win.AAFStockSummary?.setOrderReview?.(null,null);}
    }
    function attach(slot){
      if(!slot)return;
      if(!host)shell();slot.replaceChildren(host);
      if(response&&!failed){publish();return;}
      if(access&&!loading)return load();
    }
    win.addEventListener('beforeunload',event=>{if(view?.hasDirty?.()||notes.isBusy()||notes.isUncertain()){event.preventDefault();event.returnValue='';}});
    return {setAccess,attach,invalidate,selectMonth,isDirty:()=>!!view?.hasDirty?.(),isSaving:()=>notes.isBusy()||notes.isUncertain()};
  }
  return {createNotesService,verifiedWrite,boot};
});
