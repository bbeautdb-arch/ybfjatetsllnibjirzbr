/* Authenticated monthly read model. Never writes allocations, stock or prices. */
(function(root,factory){
  'use strict';
  const api=factory(typeof module==='object'&&module.exports?require('./stock_review_notes_bridge.js'):root.AAFStockNotesCore);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AAFOrderReview=api.boot(root);
})(typeof window==='undefined'?null:window,function(core){
  'use strict';
  const API='https://aaf-grade-insight-2569.bbeautybbsoraai.chatgpt.site/api/aaf/stock';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const equal=(a,b)=>a===b||!!a&&!!b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));
  const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
  const currentBangkokMonth=(now=Date.now())=>{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).formatToParts(new Date(now));
    return parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
  };
  const verifiedWrite=(before,after,changes)=>core.verifiedAnnotationWrite(before,after,changes);
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
      if(busy)fail('save-blocked','กำลังบันทึก กรุณารอผลก่อนโหลดหมายเหตุตรวจซ้ำ');
      const scope=env.scope(),fresh=await readCurrent(scope);
      if(uncertain){
        if(verifiedWrite(uncertain.before,fresh,uncertain.changes))uncertain=null;
        else if(equal(uncertain.before.stock,fresh.stock)&&equal(uncertain.before.catalog,fresh.catalog))uncertain=null;
        else {fresh.snapshot.canSave=false;fresh.snapshot.canEditFollowup=false;fresh.snapshot.saveUnresolved=true;}
      }
      return fresh.snapshot;
    }
    async function save(changes,combined=false){
      if(busy||uncertain)fail('save-blocked','กำลังบันทึกหรือยังยืนยันผลครั้งก่อนไม่ได้ กรุณาโหลดหมายเหตุเพื่อตรวจผลก่อน');
      busy=true;const scope=env.scope();
      try{
        const before=await readCurrent(scope),valid=combined?env.core.validAnnotationChanges(changes,before.snapshot):env.core.validChanges(changes,before.snapshot);
        guard(scope);uncertain={before,changes:valid};
        const notesChanges=combined?valid.notesChanges:valid,followupChanges=combined?valid.followupChanges:[];
        let result;
        try{result=await env.request('',combined?{action:'saveSalesAnnotations',expectedRevision:before.snapshot.revision,expectedCatalogRevision:before.snapshot.catalogRevision,reportDate:before.snapshot.reportDate,...valid}:{action:'saveSalesNotes',expectedRevision:before.snapshot.revision,expectedCatalogRevision:before.snapshot.catalogRevision,notesBySpec:Object.fromEntries(valid.map(c=>[c.key,c.after]))});}
        catch(e){if(['conflict','save-rejected','permission-denied','read-only'].includes(e.code))uncertain=null;throw e;}
        guard(scope);
        if(result.revision!==before.snapshot.revision+1||result.catalogRevision!==before.snapshot.catalogRevision+(notesChanges.length?1:0)||combined&&(result.savedNoteCount!==notesChanges.length||result.savedFollowupCount!==followupChanges.length||typeof result.updatedAt!=='string'||!Number.isFinite(Date.parse(result.updatedAt))))fail('save-uncertain','ยังยืนยันผลบันทึกไม่ได้ ห้ามส่งซ้ำ ให้โหลดหมายเหตุตรวจผลก่อน');
        const after=await readCurrent(scope);
        if(!verifiedWrite(before,after,valid)||combined&&after.stock.updatedAt!==result.updatedAt)fail('save-uncertain','อ่านกลับไม่ตรงกับที่คาด ห้ามบันทึกซ้ำจนกว่าจะตรวจผล');
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
    return {readNotes,saveNotes:changes=>save(changes),saveChanges:changes=>save(changes,true),prepareNotesFile,isBusy:()=>busy,isUncertain:()=>!!uncertain};
  }
  function boot(win){
    let host=null,body=null,status=null,monthLabel=null,view=null,loading=null,auth='',epoch=0,reportEpoch=0,access=null,response=null,failed=false,needsLoad=true;
    const now=()=>win.Date?.now?.()??Date.now();
    let selectedMonth=currentBangkokMonth(now()),expected=null,refreshHandler=null;
    const token=()=>{if(win.AAFStockAccess)return win.AAFStockAccess.token();if(win.AAFStockAccessRequired)return '';try{const user=JSON.parse(win.sessionStorage.getItem('aaf_user'));return user?.stockSessionToken||user?.gradeBridgeSessionToken||user?.bridgeSessionToken||'';}catch{return '';}};
    const scope=()=>epoch+'|'+token();
    const reportScope=()=>scope()+'|'+reportEpoch+'|'+selectedMonth;
    const tell=text=>{if(status)status.textContent=text;};
    const paintMonth=()=>{if(monthLabel)monthLabel.textContent='ภาพรวมขายเดือนนี้ · '+selectedMonth+' · เวลาไทย';};
    function suspendSales(message){
      response=null;failed=true;win.AAFStockSummary?.setOrderReview?.(null,null);
      if(view?.suspendSales)view.suspendSales(message);else if(view&&body){body.hidden=true;body.inert=true;}
      tell(message);
    }
    function checkCurrentMonth(){
      const month=currentBangkokMonth(now());if(month===selectedMonth)return false;
      selectedMonth=month;reportEpoch++;loading=null;expected=null;needsLoad=true;paintMonth();
      suspendSales('เปลี่ยนเดือนแล้ว · รอภาพรวมขายเดือน '+month+' ที่ตรวจครบ · ไม่แสดงเดือนก่อนแทน · ร่างหมายเหตุยังอยู่');
      win.AAFStockSummary?.invalidateCurrentMonthSold?.();return true;
    }
    function sourceBinding(next){
      const sold=next.currentMonthSold,allocation=next.currentAllocation,source=sold?.source,stock=allocation?.stock,captured=Date.parse(source?.capturedAt||'');
      if(sold?.status!=='verified-quantities'||sold.month!==selectedMonth||source?.page!==9||source.sourceIsLive!==false||
        !/^sha256:[a-f0-9]{64}$/.test(source.checksum||'')||!Number.isFinite(captured)||captured>now()||currentBangkokMonth(captured)!==selectedMonth)return null;
      const sourceOnly={source:{page:9,month:selectedMonth,capturedAt:source.capturedAt,checksum:source.checksum,sourceIsLive:false},stock:null};
      if(allocation?.status!=='verified-allocation')return sourceOnly;
      if(allocation.month!==selectedMonth||allocation.source?.checksum!==source.checksum||allocation.source?.capturedAt!==source.capturedAt||
        stock?.revision!==next.revision||stock.reportDate!==next.reportDate||!/^sha256:[a-f0-9]{64}$/.test(stock.planChecksum||'')||
        !Number.isFinite(Date.parse(stock.planCapturedAt||''))||Date.parse(stock.planCapturedAt)>now()||currentBangkokMonth(Date.parse(stock.planCapturedAt))!==selectedMonth)return null;
      return {source:{page:9,month:selectedMonth,capturedAt:source.capturedAt,checksum:source.checksum,sourceIsLive:false},
        stock:{revision:stock.revision,reportDate:stock.reportDate,planChecksum:stock.planChecksum,planCapturedAt:stock.planCapturedAt}};
    }
    const invalidate=(message='กรุณาโหลดข้อมูลส่วนกลางใหม่')=>{
      const keepDraft=!!auth&&token()===auth&&view?.hasDirty?.();
      epoch++;reportEpoch++;access=null;response=null;auth='';loading=null;failed=true;expected=null;needsLoad=true;
      win.AAFStockSummary?.invalidateCurrentMonthSold?.();
      if(keepDraft){
        // Same credential expired/was denied: retain the user's draft in this
        // mounted view, but no editing/write can resume without fresh access.
        // A different token or logout always follows the destructive branch.
        auth=token();
        const retained=message+' · ร่างยังอยู่ในหน้านี้ กรุณาคัดลอกก่อนเข้าสู่ระบบใหม่; เปลี่ยนบัญชีหรือรีโหลดอาจทำให้ร่างหาย · ยังไม่ส่งซ้ำ';
        if(view.suspendEditing)view.suspendEditing(retained);else if(body){body.hidden=true;body.inert=true;}
        win.AAFStockSummary?.setOrderReview?.(null,null);tell(retained);return;
      }
      view?.destroy?.();view=null;body?.replaceChildren();if(body){body.hidden=false;body.inert=false;}
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
      if(res.status===403&&payload)fail('permission-denied','ยังไม่บันทึก · บัญชีนี้ไม่มีสิทธิ์แก้หมายเหตุหรือการติดตามที่เลือก ร่างยังอยู่ กรุณาตรวจสิทธิ์');
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
      if(!checkCurrentMonth()&&response)win.AAFStockSummary?.setOrderReview?.(response.review,{...response.readModel,availableMonths:[selectedMonth],selectedMonth});
    }
    function shell(){
      host=win.document.createElement('div');host.id='stock-order-review-host';
      const toolbar=win.document.createElement('div');toolbar.className='stock-order-toolbar';toolbar.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0';
      monthLabel=win.document.createElement('strong');paintMonth();
      const refresh=win.document.createElement('button');refresh.type='button';refresh.textContent='โหลดข้อมูลเดือนนี้ล่าสุด';refresh.addEventListener('click',()=>refreshHandler?refreshHandler():load(true));
      status=win.document.createElement('p');status.setAttribute('role','status');status.style.cssText='white-space:pre-wrap;font-size:13px;margin:8px 0';
      body=win.document.createElement('div');toolbar.append(monthLabel,refresh);host.append(toolbar,status,body);
    }
    async function load(force=false){
      checkCurrentMonth();
      if(loading)return loading;
      if(!force&&!needsLoad)return;
      if(!expected){suspendSales('รอชุดขายเดือน '+selectedMonth+' จากส่วนกลางที่ตรวจครบ · ยังไม่ทราบยอด ไม่ใช้เดือนอื่นหรือศูนย์แทน');return;}
      if(view?.hasDirty?.()||notes.isBusy()||notes.isUncertain()){suspendSales('มีร่างหมายเหตุหรือผลบันทึกที่ต้องตรวจ · เก็บร่างไว้ ไม่แสดงยอดชุดเก่าแทนเดือนนี้ · ตรวจ/เซฟร่างก่อนโหลดภาพรวมล่าสุด');return;}
      const stamp=reportScope(),binding=clone(expected),month=selectedMonth;needsLoad=false;
      tell('กำลังอ่านภาพรวมขายเดือน '+month+' จากส่วนกลาง…');
      loading=(async()=>{
        try{
          const data=await request('?view=orderReview&month='+encodeURIComponent(month));
          checkCurrentMonth();if(stamp!==reportScope())return;
          const rm=data.readModel;
          if(data.selectedMonth!==month||rm?.kind!=='current-month-order-review'||rm.selectedMonth&&rm.selectedMonth!==month||rm.sourceIsLive!==false||rm.queueApplied!==false)fail('invalid-report','รูปแบบหรือเดือนรายงานไม่ตรงเดือนปัจจุบัน ยังไม่แสดงยอดปะปน');
          if(rm.status==='pending'&&data.review===null){suspendSales(rm.warning||'ข้อมูลขายเดือนนี้ยังตรวจไม่ครบ · ไม่ใช้เดือนอื่นหรือศูนย์แทน');return;}
          const salesOnly=rm.status==='verified-sales-only';
          const invalidCommon=!['verified','verified-sales-only'].includes(rm.status)||!data.review||data.review.metadata?.month!==month||data.review.financial&&data.review.financial.metadata?.month!==month||!equal(rm.source,binding.source);
          const invalidMode=salesOnly?rm.stock!==null||!win.AAFOrderHeader?.salesOnlyReviewValid?.(data.review,rm,access.currentMonthSold):!binding.stock||!equal(rm.stock,binding.stock);
          if(invalidCommon||invalidMode)fail('invalid-report','ชุดขายหรือแผนจัดสรรไม่ตรงข้อมูลส่วนกลางล่าสุด · รอชุดเดือนปัจจุบันที่ตรงกัน');
          if(data.revision!==access.revision||data.stockReportDate!==access.reportDate)fail('snapshot-changed','สต๊อกเปลี่ยนระหว่างอ่าน กรุณากดโหลดข้อมูลส่วนกลางล่าสุดด้านบนก่อน');
          if(view?.hasDirty?.()||notes.isBusy()||notes.isUncertain()){needsLoad=true;suspendSales('มีร่างระหว่างโหลด · เก็บร่างไว้ กรุณาตรวจ/เซฟก่อนโหลดภาพรวมล่าสุด');return;}
          response=data;failed=false;if(body){body.hidden=false;body.inert=false;}
          const review={...data.review,readModel:data.readModel};
          if(view)view.update(review);else view=win.AAFOrderReviewUI.mount(body,review,{readNotes:async()=>{const snapshot=await notes.readNotes();if(snapshot.saveUnresolved)fail('save-uncertain','ข้อมูลหลังบันทึกยังไม่ตรงครบทุกช่องที่ต้องคงเดิม · เก็บร่างและสถานะรอตรวจไว้ ห้ามส่งซ้ำ ยังไม่ถือว่าเซฟสำเร็จ');return access?.notesReadOnly?{...snapshot,canSave:false,canEditFollowup:false}:snapshot;},saveNotes:notes.saveNotes,saveChanges:notes.saveChanges,prepareNotesFile:async(file,settings)=>{if(access?.notesReadOnly)fail('read-only','รายงานหน้านี้อ่านอย่างเดียว');return notes.prepareNotesFile(file,settings);}});
          publish();tell((rm.warning||'ชุดยอดขายที่ตรวจไว้ ไม่ใช่การอ่านหน้า 09 สด')+' · เดือน '+month+' · อ่านส่วนกลาง '+new Date(now()).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})+' · ไม่เปลี่ยนยอดสต๊อก/จอง/ราคา');
        }catch(e){
          checkCurrentMonth();if(stamp!==reportScope())return;
          suspendSales(e.message||'ยังแสดงภาพรวมเดือนนี้ไม่ได้ กรุณาโหลดล่าสุด');
          if(!view?.hasDirty?.()&&!notes.isBusy()&&!notes.isUncertain()){view?.destroy?.();view=null;body?.replaceChildren();}
        }finally{if(stamp===reportScope())loading=null;}
      })();return loading;
    }
    function selectMonth(month){
      checkCurrentMonth();if(month!==selectedMonth){tell('ภาพรวมนี้ใช้เฉพาะเดือนปัจจุบัน '+selectedMonth+' ตามเวลาไทย');return false;}
      void load(true);return true;
    }
    function setAccess(next){
      checkCurrentMonth();
      const credential=token();
      if(!credential){invalidate('กรุณาเข้าสู่ระบบ AAF');return;}
      if(auth&&credential!==auth)invalidate('เซสชันเปลี่ยน กรุณาโหลดข้อมูลส่วนกลางใหม่');
      const changed=!access||access.revision!==next.revision||access.reportDate!==next.reportDate;
      const binding=sourceBinding(next),sourceChanged=!equal(binding,expected);
      auth=credential;access={revision:next.revision,reportDate:next.reportDate,notesReadOnly:next.notesReadOnly===true,currentMonthSold:clone(next.currentMonthSold||null)};
      expected=binding;
      if(changed||next.refreshReport||sourceChanged){if(changed)epoch++;reportEpoch++;loading=null;needsLoad=true;suspendSales('รอภาพรวมขายเดือน '+selectedMonth+' ที่ตรงกับข้อมูลส่วนกลางล่าสุด');}
      return changed||next.refreshReport||sourceChanged;
    }
    function syncCurrentSource(next){
      if(!access)return;
      setAccess({...next,notesReadOnly:access.notesReadOnly});
      if(host&&needsLoad&&!loading)return load();
    }
    function attach(slot){
      if(!slot)return;
      if(!host)shell();slot.replaceChildren(host);
      checkCurrentMonth();if(response&&!failed){publish();return;}
      if(access&&!loading)return load();
    }
    win.addEventListener('beforeunload',event=>{if(view?.hasDirty?.()||notes.isBusy()||notes.isUncertain()){event.preventDefault();event.returnValue='';}});
    return {setAccess,attach,invalidate,selectMonth,syncCurrentSource,checkCurrentMonth,setRefreshHandler:fn=>{refreshHandler=typeof fn==='function'?fn:null;},isDirty:()=>!!view?.hasDirty?.(),isSaving:()=>notes.isBusy()||notes.isUncertain()};
  }
  return {createNotesService,verifiedWrite,boot,currentBangkokMonth};
});
