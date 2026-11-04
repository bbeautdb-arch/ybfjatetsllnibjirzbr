/* Saved stock-price editor. Reads the independent exact-spec catalog, never
   Page09 selling prices; writes through existing authorized catalog CAS only. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AAFStockPriceEditor=api.createBrowserService(root);
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const API='https://aaf-grade-insight-2569.bbeautybbsoraai.chatgpt.site/api/aaf/stock';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
  const quantity=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const equal=(a,b)=>a===b||object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]))||Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
  const exactKey=row=>[Number(row.t),String(row.grade),Math.min(Number(row.w),Number(row.l)),Math.max(Number(row.w),Number(row.l)),row.unit].join('|');
  const messages={
    'auth-required':'กรุณาเข้าสู่ระบบ AAF หรือใช้ลิงก์ฝ่ายขายที่ได้รับอนุญาต',
    'auth-expired':'สิทธิ์เข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่',
    'permission-denied':'สิทธิ์นี้ไม่อนุญาตให้แก้ราคาสต๊อก',
    'session-changed':'บัญชีหรือเซสชันเปลี่ยน กรุณาโหลดราคาล่าสุดใหม่',
    'read-failed':'ยังอ่านสต๊อกและชุดราคาส่วนกลางที่ตรงกันไม่ได้ กรุณาโหลดใหม่',
    'catalog-unavailable':'ยังไม่มีชุดราคาที่ตรวจยืนยันได้ ไม่ใช้ราคาขายหรือศูนย์แทน',
    'conflict':'มีข้อมูลส่วนกลางเปลี่ยนแล้ว ยังไม่บันทึกทับ กรุณาโหลดใหม่และตรวจร่างราคา',
    'invalid-price':'กรุณาใส่ราคามากกว่า 0 และเลือกบาทหรือ USD ไม่ล้างราคาเดิมด้วยช่องว่าง',
    'save-rejected':'ระบบไม่ยอมรับการเปลี่ยนราคา ยังไม่ได้บันทึก',
    'save-uncertain':'ยังยืนยันผลบันทึกไม่ได้ ห้ามบันทึกซ้ำ ให้โหลดราคาตรวจผลก่อน',
    'save-blocked':'กำลังบันทึกหรือยังไม่ยืนยันผลครั้งก่อน กรุณาตรวจผลก่อนทำต่อ',
    'unloaded':'กรุณาโหลดชุดราคาล่าสุดก่อนแก้ไข'
  };
  const error=code=>Object.assign(new Error(messages[code]||messages['read-failed']),{code:Object.hasOwn(messages,code)?code:'read-failed'});
  const fail=code=>{throw error(code);};
  function mapKey(key){
    if(typeof key!=='string')return null;
    const p=key.split('|');
    if(p.length!==5||![p[0],p[2],p[3]].every(v=>v.trim()&&positive(Number(v)))||!/^[A-Z]+$/.test(p[1])||!['sheet','strip'].includes(p[4]))return null;
    return exactKey({t:Number(p[0]),grade:p[1],w:Number(p[2]),l:Number(p[3]),unit:p[4]});
  }
  function parseSnapshot(stock,catalog){
    if(!stock?.ok||!catalog?.ok||!Number.isSafeInteger(stock.revision)||stock.revision<0||stock.revision!==catalog.revision||!Number.isSafeInteger(catalog.catalogRevision)||catalog.catalogRevision<1||stock.report?.reportDate!==catalog.stockReportDate||!/^\d{4}-\d{2}-\d{2}$/.test(catalog.stockReportDate||'')||!Array.isArray(stock.rows)||!stock.rows.length)fail('read-failed');
    const p=catalog.widgetState?.privateContent;
    if(!object(p)||p.version!==3||p.context!=='aaf-sales-stock-preview|free-price-catalog'||!object(p.prices)||!object(p.currencies)||!object(p.notesByThickness)||p.notesBySpec!==undefined&&!object(p.notesBySpec))fail('catalog-unavailable');
    const aliases=new Map();
    for(const key of new Set([...Object.keys(p.prices),...Object.keys(p.currencies)])){
      const canonical=mapKey(key);if(!canonical)fail('catalog-unavailable');
      if(!aliases.has(canonical))aliases.set(canonical,[]);aliases.get(canonical).push(key);
      if(Object.hasOwn(p.prices,key)&&!positive(p.prices[key])||Object.hasOwn(p.currencies,key)&&!['THB','USD'].includes(p.currencies[key]))fail('catalog-unavailable');
    }
    const groups=new Map(),rawKeys=new Set();
    for(const row of stock.rows){
      if(!object(row)||typeof row.key!=='string'||!row.key||rawKeys.has(row.key)||!['w','l','t'].every(k=>positive(Number(row[k])))||typeof row.grade!=='string'||!/^[A-Z]+$/.test(row.grade)||!['sheet','strip'].includes(row.unit)||!['qty','freeQty','committedQty'].every(k=>quantity(row[k])))fail('read-failed');
      rawKeys.add(row.key);const key=exactKey(row);
      if(!groups.has(key))groups.set(key,{key,rawKeys:[],w:Math.min(Number(row.w),Number(row.l)),l:Math.max(Number(row.w),Number(row.l)),t:Number(row.t),grade:row.grade,unit:row.unit,qty:0,freeQty:0,price:null,currency:'THB',priceStatus:'missing-price'});
      const item=groups.get(key);item.rawKeys.push(row.key);item.qty+=row.qty;item.freeQty+=row.freeQty;
      if(!quantity(item.qty)||!quantity(item.freeQty))fail('read-failed');
    }
    for(const row of groups.values()){
      const keys=aliases.get(row.key)||[];
      const values=keys.map(key=>({price:Object.hasOwn(p.prices,key)?p.prices[key]:null,currency:p.currencies[key]||'THB'}));
      if(values.some(value=>!equal(value,values[0]))){row.priceStatus='price-conflict';row.currency=null;}
      else if(values.length){row.price=values[0].price;row.currency=values[0].currency;row.priceStatus=row.price===null?'missing-price':'saved-price';}
    }
    const rows=[...groups.values()].sort((a,b)=>a.t-b.t||a.grade.localeCompare(b.grade)||a.w-b.w||a.l-b.l||a.unit.localeCompare(b.unit));
    const protectedStock={rows:clone(stock.rows).sort((a,b)=>a.key.localeCompare(b.key))};
    for(const field of ['report','exchangeRate','sellableRules','sellableSetup','sellablePlan','reservationBreakdown','dimensionAllocationPolicy','stockWorkflowVersion','thicknessRuleAmendment','importedAt'])if(Object.hasOwn(stock,field))protectedStock[field]=clone(stock[field]);
    return {view:{loaded:true,rows,revision:stock.revision,catalogRevision:catalog.catalogRevision,reportDate:catalog.stockReportDate,canEdit:catalog.permissions?.pricesAndNotes===true},protectedStock,widgetState:clone(catalog.widgetState),aliases};
  }
  function createService(env){
    let snapshot=null,loadedIdentity=null,busy=false,uncertain=null,lastError=null;
    const identity=()=>String(env.identity?.()??'');
    const guard=value=>{if(!value||identity()!==value)fail('session-changed');};
    const accessErrors=new Set(['auth-required','auth-expired','permission-denied','session-changed','read-failed','catalog-unavailable','conflict']);
    const state=()=>{
      const validIdentity=loadedIdentity&&identity()===loadedIdentity;
      return {...(validIdentity&&snapshot?clone(snapshot.view):{loaded:false,rows:[],canEdit:false}),busy,uncertain:!!uncertain,error:lastError?.message||'',errorCode:lastError?.code||'',canEdit:!!(validIdentity&&snapshot?.view.canEdit&&!busy&&!uncertain&&!accessErrors.has(lastError?.code))};
    };
    const report=cause=>{lastError=error(cause?.code);return lastError;};
    async function readCurrent(scope){
      for(let attempt=0;attempt<2;attempt++){
        guard(scope);const stock=await env.request('');guard(scope);
        const catalog=await env.request('?view=salesReport&catalogOnly=1');guard(scope);
        if(stock?.revision!==catalog?.revision&&attempt===0)continue;
        return parseSnapshot(stock,catalog);
      }
      fail('read-failed');
    }
    function sameBaseline(a,b){return a.view.revision===b.view.revision&&a.view.catalogRevision===b.view.catalogRevision&&equal(a.protectedStock,b.protectedStock)&&equal(a.widgetState,b.widgetState);}
    function verified(attempt,after){
      if(after.view.revision!==attempt.before.view.revision+1||after.view.catalogRevision!==attempt.before.view.catalogRevision+1||!equal(attempt.before.protectedStock,after.protectedStock))return false;
      const expected=clone(attempt.expected),stamp=after.widgetState.privateContent.savedAt;
      if(typeof stamp!=='string'||!Number.isFinite(Date.parse(stamp)))return false;
      expected.privateContent.savedAt=stamp;return equal(expected,after.widgetState);
    }
    async function load(){
      if(busy)throw report(error('save-blocked'));
      const scope=identity();if(!scope)throw report(error('auth-required'));
      busy=true;
      try{
        const fresh=await readCurrent(scope);
        if(uncertain){
          if(scope!==uncertain.identity)fail('save-uncertain');
          if(verified(uncertain,fresh)||sameBaseline(uncertain.before,fresh))uncertain=null;
          else fail('save-uncertain');
        }
        snapshot=fresh;loadedIdentity=scope;lastError=null;return {...state(),busy:false,canEdit:fresh.view.canEdit};
      }catch(cause){throw report(cause);}finally{busy=false;}
    }
    async function save(changes){
      if(busy||uncertain)throw report(error('save-blocked'));
      const scope=identity();if(!scope)throw report(error('auth-required'));
      if(!snapshot)throw report(error('unloaded'));
      if(scope!==loadedIdentity)throw report(error('session-changed'));
      if(!snapshot.view.canEdit)throw report(error('permission-denied'));
      busy=true;
      try{
        if(!Array.isArray(changes)||!changes.length||changes.length>snapshot.view.rows.length)fail('invalid-price');
        const byKey=new Map(snapshot.view.rows.map(row=>[row.key,row])),seen=new Set();
        for(const change of changes){if(!object(change)||Object.keys(change).some(k=>!['key','price','currency'].includes(k))||!byKey.has(change.key)||seen.has(change.key)||!positive(change.price)||!['THB','USD'].includes(change.currency))fail('invalid-price');seen.add(change.key);}
        const before=await readCurrent(scope);
        if(!before.view.canEdit)fail('permission-denied');
        if(!sameBaseline(snapshot,before))fail('conflict');
        const expected=clone(before.widgetState),p=expected.privateContent;
        for(const change of changes){
          // Resolve only this exact specification, including reversed axes.
          // Never merge allocation-only near-size dimensions or other grades.
          const keys=before.aliases.get(change.key)||[change.key];
          for(const key of keys){p.prices[key]=change.price;p.currencies[key]=change.currency;}
        }
        if(equal(expected,before.widgetState))return {...state(),busy:false,canEdit:true,changed:false};
        guard(scope);uncertain={before,expected,identity:scope};
        let result;
        try{result=await env.request('',{action:'saveSalesReport',expectedRevision:before.view.revision,expectedCatalogRevision:before.view.catalogRevision,prices:clone(p.prices),currencies:clone(p.currencies),notesByThickness:clone(p.notesByThickness),...(Object.hasOwn(p,'notesBySpec')?{notesBySpec:clone(p.notesBySpec)}:{})});}
        catch(cause){if(['conflict','save-rejected','permission-denied','auth-expired','auth-required'].includes(cause?.code))uncertain=null;throw cause;}
        guard(scope);
        if(result?.ok!==true||result.revision!==before.view.revision+1||result.catalogRevision!==before.view.catalogRevision+1)fail('save-uncertain');
        const after=await readCurrent(scope);if(!verified(uncertain,after))fail('save-uncertain');
        snapshot=after;loadedIdentity=scope;uncertain=null;lastError=null;
        const saved={...state(),busy:false,canEdit:after.view.canEdit,changed:true};
        try{env.onSaved?.(clone(saved));}catch{}
        return saved;
      }catch(cause){throw report(uncertain?error('save-uncertain'):cause);}finally{busy=false;}
    }
    return {load,getState:state,save};
  }
  function createBrowserService(win){
    const token=()=>{if(win.AAFStockAccess)return win.AAFStockAccess.token();if(win.AAFStockAccessRequired)return '';try{const user=JSON.parse(win.sessionStorage.getItem('aaf_user'));return user?.stockSessionToken||user?.gradeBridgeSessionToken||user?.bridgeSessionToken||'';}catch{return '';}};
    const request=async(suffix='',body)=>{
      const auth=token();if(!auth)fail('auth-required');
      let response;
      try{response=await win.fetch(API+suffix,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+auth,...(body?{'Content-Type':'text/plain;charset=UTF-8'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
      catch{fail(body?'save-uncertain':'read-failed');}
      if(response.status===401)fail('auth-expired');if(response.status===403)fail('permission-denied');
      if(response.status===409||response.status===412)fail('conflict');if(body&&[400,422].includes(response.status))fail('save-rejected');
      if(!response.ok)fail(body?'save-uncertain':'read-failed');
      let data;try{data=await response.json();}catch{fail(body?'save-uncertain':'read-failed');}
      if(!data?.ok)fail(body?'save-uncertain':'read-failed');return data;
    };
    return createService({identity:token,request});
  }
  return {createService,createBrowserService,parseSnapshot,exactKey};
});
