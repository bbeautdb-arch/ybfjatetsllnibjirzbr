/* Exact-spec saved stock-price editor. No sales price, quantity or annotation writes. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AAFStockPricePanel=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=value=>Number(value).toLocaleString('th-TH',{maximumFractionDigits:4});
  const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
  const hasPrice=row=>positive(row.price)&&['THB','USD'].includes(row.currency);
  const hasStock=row=>row.qty>0||row.freeQty>0;
  const unit=row=>row.unit==='strip'?'ชิ้นไม้แถบ':'แผ่น';
  const label=row=>`${row.t} มม. · ${row.grade} · ${num(row.w)} × ${num(row.l)} · ${unit(row)}`;
  const instances=new WeakMap();
  function coverage(rows){
    const specs=new Map();
    for(const row of rows){
      const key=[row.t,row.grade,...[row.w,row.l].map(Number).sort((a,b)=>a-b),row.unit].join('|');
      const prior=specs.get(key);
      if(prior){prior.qty+=row.qty;prior.freeQty+=row.freeQty;if(!hasPrice(row)){prior.price=null;prior.currency=null;}}
      else specs.set(key,{...row});
    }
    const missing=[...specs.values()].filter(row=>!hasPrice(row));
    return {active:missing.filter(hasStock).length,free:missing.filter(row=>row.freeQty>0).length,zero:missing.filter(row=>!hasStock(row)).length,all:missing.length};
  }
  function visibleRows(rows,mode){
    if(mode==='missing')return rows.filter(row=>!hasPrice(row)&&hasStock(row));
    if(mode==='unpriced')return rows.filter(row=>!hasPrice(row));
    return rows;
  }
  function missingDetails(rows){
    const missing={price:new Set(),currency:new Set(),conflict:new Set()};
    for(const row of rows){
      if(!hasStock(row)||hasPrice(row))continue;
      const key=[row.t,row.grade,...[row.w,row.l].map(Number).sort((a,b)=>a-b),row.unit].join('|');
      missing[row.priceStatus==='price-conflict'?'conflict':!positive(row.price)?'price':'currency'].add(key);
    }
    return Object.fromEntries(Object.entries(missing).map(([kind,keys])=>[kind,keys.size]));
  }
  function changesFor(rows,drafts){
    const changes=[],invalid=[];
    for(const row of rows){
      const draft=drafts.get(row.key);if(!draft)continue;
      // An untouched blank price is not a request to erase anything. A saved
      // positive number with no currency, however, requires explicit repair.
      if(!positive(row.price)&&typeof draft.value==='string'&&!draft.value.trim())continue;
      if(draft.value===(row.price===null||row.price===undefined?'':String(row.price))&&draft.currency===(row.currency||''))continue;
      const value=typeof draft.value==='string'&&draft.value.trim()!==''?Number(draft.value):NaN;
      if(!positive(value)||!['THB','USD'].includes(draft.currency)){invalid.push(row.key);continue;}
      if(value===row.price&&draft.currency===row.currency)continue;
      changes.push({key:row.key,price:value,currency:draft.currency});
    }
    return {changes,invalid};
  }
  function rowMarkup(row,draft,disabled){
    const value=draft?.value??(row.price===null||row.price===undefined?'':String(row.price));
    const currency=draft?.currency??row.currency??'';
    const suffix=esc(label(row));
    return `<tr data-price-panel-key="${esc(row.key)}"><th scope="row">${esc(row.t)} มม. · ${esc(row.grade)}<small>${num(row.w)} × ${num(row.l)} · ${unit(row)}</small></th><td class="spp-number">${num(row.qty)}</td><td class="spp-number">${num(row.freeQty)}</td><td><input type="number" step="any" min="0.0000001" inputmode="decimal" data-spp-price aria-label="ราคาสต๊อก ${suffix}" value="${esc(value)}" placeholder="ใส่ราคาต่อหน่วย" ${disabled?'disabled':''}></td><td><select data-spp-currency aria-label="สกุลเงินราคาสต๊อก ${suffix}" ${disabled?'disabled':''}><option value="" ${currency===''?'selected':''}>เลือกสกุลเงิน</option><option value="THB" ${currency==='THB'?'selected':''}>บาท</option><option value="USD" ${currency==='USD'?'selected':''}>USD</option></select></td><td class="spp-row-status">${row.priceStatus==='price-conflict'?'ราคาขนาดกลับด้านขัดกัน · รอตรวจ':hasPrice(row)?'มีราคาที่บันทึก':positive(row.price)?'ขาดสกุลเงิน · เลือกเพื่อยืนยันราคาเดิม':hasStock(row)?'ขาดราคาสต๊อก / สกุลเงิน':'ยอด 0 · ยังไม่มีราคา'}</td></tr>`;
  }
  function reviewMarkup(rows,changes){
    const map=new Map(rows.map(row=>[row.key,row]));
    return `<section class="spp-review" aria-label="ตรวจราคาก่อนบันทึก"><h4>ตรวจราคา ${num(changes.length)} รายการก่อนบันทึก</h4><ul>${changes.map(change=>{const row=map.get(change.key);return `<li><b>${esc(label(row))}</b><span>${row.priceStatus==='price-conflict'?'ราคาเดิมขนาดกลับด้านขัดกัน':hasPrice(row)?num(row.price)+' '+esc(row.currency):positive(row.price)?num(row.price)+' · ยังไม่มีสกุลเงิน':'ยังไม่มีราคา'} → <strong>${num(change.price)} ${esc(change.currency)}</strong> / ${unit(row)}</span>${row.priceStatus==='price-conflict'?'<small>ยืนยันใช้ราคาใหม่นี้กับสเปกเดียวกันทั้งสองทิศทาง ไม่รวมขนาดอื่น</small>':''}</li>`;}).join('')}</ul><p>เปลี่ยนเฉพาะราคาสต๊อกและสกุลเงินของรายการนี้ ไม่เปลี่ยนยอดสต๊อก ราคาขายจริง ติดตาม หรือหมายเหตุ</p><button type="button" data-spp-confirm>ยืนยันบันทึกราคาสต๊อก</button><button type="button" data-spp-back>กลับไปแก้</button></section>`;
  }
  const css=`
    .ss-price-panel{margin:14px 0 24px;border:1px solid #c8d7bd;border-radius:16px;background:rgba(250,253,246,.96);color:#274939;overflow:hidden;font-size:13px}
    .ss-price-panel>summary{padding:14px 18px;font-weight:700;cursor:pointer;display:list-item;list-style-position:inside}
    .ss-price-panel>summary small{font-size:11px;font-weight:500;margin-left:9px;color:#87642d;line-height:1.6}
    .spp-body{padding:0 18px 18px}.spp-help{font-size:11px;color:#63745e;line-height:1.7;margin:4px 0 12px}.spp-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0}.spp-toolbar label{display:flex;align-items:center;gap:7px}
    .ss-price-panel button,.ss-price-panel select{font:inherit;border:1px solid #bbceb4;border-radius:8px;background:#fffef9;color:#31523c;padding:8px 10px}.ss-price-panel button{cursor:pointer;font-weight:650}.ss-price-panel button:disabled,.ss-price-panel input:disabled,.ss-price-panel select:disabled{cursor:not-allowed;opacity:.58}.ss-price-panel :focus-visible{outline:2px solid #337964;outline-offset:2px}
    .spp-table-wrap{overflow:auto;max-height:540px;border:1px solid #dbe4d4;border-radius:10px;background:#fffef9}.ss-price-panel table{border-collapse:collapse;width:100%;min-width:720px;font-size:12px}.ss-price-panel td,.ss-price-panel th{padding:9px 11px;border-bottom:1px solid #e4e9db;text-align:left}.ss-price-panel thead{background:#edf3e7}.ss-price-panel thead th{position:sticky;top:0;background:#edf3e7;z-index:1}.ss-price-panel th small{display:block;font-weight:400;color:#63745e;margin-top:3px}.spp-number{text-align:right!important;font-variant-numeric:tabular-nums}.ss-price-panel input{width:125px;max-width:100%;box-sizing:border-box;padding:8px;border:1px solid #bbceb4;border-radius:8px;color:#274939;font:inherit;background:white}.ss-price-panel input[aria-invalid=true]{border-color:#ad512c;background:#fff0e5}.spp-row-status{font-size:11px;color:#866134}.spp-status{font-size:12px;line-height:1.6;margin-top:10px}.spp-error{color:#a54929}.spp-review{border:1px solid #bed1b2;background:#edf5e7;border-radius:12px;padding:14px;margin-top:12px}.spp-review h4{font-size:15px;margin:0 0 10px}.spp-review ul{list-style:none;padding:0;margin:0;max-height:320px;overflow:auto}.spp-review li{padding:7px 0;border-bottom:1px dashed #c5d6bc}.spp-review li span{display:block;margin-top:3px}.spp-review p{font-size:11px}.spp-review button{margin-right:7px}.spp-empty{padding:18px;color:#63745e}.ss-price-panel [hidden]{display:none!important}
    @media(max-width:650px){.ss-price-panel>summary small{display:block;margin-left:16px}.spp-body{padding:0 12px 12px}}
  `;
  function mount(host,options={}){
    if(!host)return null;
    if(instances.has(host)){const instance=instances.get(host);instance.updateContext(options.context);return instance;}
    const service=options.service,doc=host.ownerDocument;
    // This is the normal catalog editor: retained zero rows and already-priced
    // specs must stay visible. Missing-only views are an explicit user choice.
    let context=options.context||null,state={loaded:false,rows:[],canEdit:false},mode='all',working=false,message='',preview=null;
    const drafts=new Map();
    host.innerHTML=`<style>${css}</style><details class="ss-price-panel" data-stock-price-panel><summary>ตรวจ / แก้ราคาสต๊อก <small data-spp-coverage></small></summary><div class="spp-body"><p class="spp-help">ใช้ราคาสต๊อกที่บันทึกตามสเปก ไม่ใช่ราคาขายจริง · กรอกราคาได้ตามสิทธิ์เดิม · USD ใช้เรท ธปท. ที่ระบบอ่านยืนยัน</p><div data-spp-content></div><div class="spp-status" role="status" aria-live="polite" data-spp-status></div><div data-spp-review></div></div></details>`;
    const details=host.querySelector('[data-stock-price-panel]'),content=host.querySelector('[data-spp-content]'),status=host.querySelector('[data-spp-status]'),review=host.querySelector('[data-spp-review]');
    function live(){state=service?.getState?.()||state;return state;}
    function sameContext(){return !context||!state.loaded||String(context.revision)===String(state.revision)&&context.reportDate===state.reportDate;}
    function rowsForCoverage(){return state.loaded&&sameContext()?state.rows:context?.savedCatalog?context.rows.map(row=>({...row,price:row.catalogPrice,currency:row.catalogCurrency})):null;}
    function updateCoverage(){
      const rows=rowsForCoverage(),node=host.querySelector('[data-spp-coverage]');
      if(!rows){node.textContent='กดเพื่อตรวจราคาและสิทธิ์ล่าสุด';return;}
      const c=coverage(rows),details=missingDetails(rows),reasons=[details.price?'ขาดราคา '+num(details.price):'',details.currency?'ขาดสกุลเงิน '+num(details.currency):'',details.conflict?'ราคาขัดกัน '+num(details.conflict):''].filter(Boolean).join(' · ');
      node.textContent=`รอราคา / สกุลเงิน ${num(c.active)} สเปกที่มียอด${reasons?' ('+reasons+')':''}${c.free?' · มี Free '+num(c.free)+' สเปก':''}${c.zero?' · ทะเบียนยอด 0 ยังขาดข้อมูลราคา '+num(c.zero)+' รายการ':''}`;
    }
    function setStatus(value,error=false){status.textContent=value;status.classList.toggle('spp-error',error);}
    function pending(){return changesFor(state.rows||[],drafts);}
    function enabled(){return state.loaded&&sameContext()&&state.canEdit===true&&!state.busy&&!state.uncertain&&!working&&!state.errorCode;}
    function actions(){
      const change=pending();
      host.querySelectorAll('[data-spp-price],[data-spp-currency]').forEach(node=>node.disabled=!enabled()||!!preview);
      const button=host.querySelector('[data-spp-stage]');if(button)button.disabled=!enabled()||!!preview||!change.changes.length||change.invalid.length>0;
      const reload=host.querySelector('[data-spp-load]');if(reload)reload.disabled=working||state.busy;
      const discard=host.querySelector('[data-spp-discard]');if(discard){discard.hidden=!drafts.size;discard.disabled=working||state.busy;}
      host.querySelectorAll('[data-spp-confirm],[data-spp-back]').forEach(node=>node.disabled=working||state.busy);
      if(working)setStatus('กำลังตรวจข้อมูลส่วนกลาง…');
      else if(state.error||state.uncertain)setStatus(state.error||'ยังยืนยันผลบันทึกไม่ได้ กรุณาอ่านราคาล่าสุดก่อน ห้ามส่งซ้ำ',true);
      else if(!sameContext())setStatus('สต๊อกส่วนกลางเปลี่ยนแล้ว · อ่านราคาล่าสุดก่อนแก้ไข ร่างราคายังอยู่',true);
      else if(message)setStatus(message);
      else if(change.invalid.length)setStatus('กรอกราคามากกว่า 0 พร้อมสกุลเงิน ช่องว่างยังไม่บันทึก',true);
      else if(drafts.size)setStatus('มีร่างราคา '+num(change.changes.length)+' รายการ · ยังไม่บันทึก');
      else if(state.loaded)setStatus(state.canEdit===true?'ราคาที่อ่านจากส่วนกลาง · เปลี่ยนเฉพาะรายการที่แก้และยืนยัน':'บัญชีนี้ไม่มีสิทธิ์แก้ราคาสต๊อก');
    }
    function render(){
      updateCoverage();
      if(!state.loaded){content.innerHTML='<button type="button" data-spp-load>อ่านราคาล่าสุด</button>';actions();return;}
      const c=coverage(state.rows),rows=visibleRows(state.rows,mode);
      content.innerHTML=`<div class="spp-toolbar"><label>แสดง <select data-spp-mode><option value="all" ${mode==='all'?'selected':''}>ทุกสเปก (${num(state.rows.length)})</option><option value="missing" ${mode==='missing'?'selected':''}>ขาดราคาและมียอด (${num(c.active)})</option><option value="unpriced" ${mode==='unpriced'?'selected':''}>ยังไม่มีราคาทั้งหมด (${num(c.all)})</option></select></label><button type="button" data-spp-load>อ่านราคาล่าสุด</button><button type="button" data-spp-stage>ตรวจราคาก่อนบันทึก</button><button type="button" data-spp-discard hidden>ยกเลิกร่างราคา</button></div>${rows.length?`<div class="spp-table-wrap"><table><thead><tr><th>หนา / เกรด / ขนาด</th><th>สต๊อก</th><th>Free</th><th>ราคาสต๊อก / หน่วย</th><th>สกุลเงิน</th><th>สถานะราคา</th></tr></thead><tbody>${rows.map(row=>rowMarkup(row,drafts.get(row.key),!enabled())).join('')}</tbody></table></div>`:'<p class="spp-empty">ไม่มีรายการในกลุ่มนี้ · เลือกทุกสเปกเพื่อแก้ราคาที่บันทึกไว้</p>'}`;
      review.innerHTML=preview?reviewMarkup(state.rows,preview):'';actions();
    }
    async function load(){
      if(working)return;
      working=true;message='';preview=null;actions();
      try{if(!service?.load)throw new Error('ระบบแก้ราคายังไม่พร้อม กรุณาโหลดหน้าเว็บใหม่');await service.load();live();if(drafts.size)message='อ่านราคาล่าสุดแล้ว · ร่างราคายังอยู่ กรุณาตรวจเทียบราคาเดิมและราคาใหม่ก่อนยืนยัน';}
      catch(error){live();message=error?.message||'อ่านราคาไม่สำเร็จ กรุณาตรวจการเชื่อมต่อ';}
      finally{working=false;render();}
    }
    details.addEventListener('toggle',()=>{if(details.open&&!working&&!drafts.size)void load();});
    host.addEventListener('input',event=>{
      const input=event.target;if(!input.matches?.('[data-spp-price]')||!enabled()||preview)return;
      const tr=input.closest('[data-price-panel-key]');if(!tr)return;
      const currency=tr.querySelector('[data-spp-currency]').value;
      drafts.set(tr.dataset.pricePanelKey,{value:input.validity?.badInput?'invalid':input.value,currency});
      input.setAttribute('aria-invalid',String(!positive(Number(input.value))||input.value.trim()===''||input.validity?.badInput===true));message='';actions();
    });
    host.addEventListener('change',event=>{
      const input=event.target;
      if(input.matches?.('[data-spp-mode]')){mode=input.value;render();return;}
      if(!input.matches?.('[data-spp-currency]')||!enabled()||preview)return;
      const tr=input.closest('[data-price-panel-key]');drafts.set(tr.dataset.pricePanelKey,{value:tr.querySelector('[data-spp-price]').value,currency:input.value});message='';actions();
    });
    host.addEventListener('click',async event=>{
      const button=event.target.closest?.('button');if(!button||!host.contains(button)||button.disabled)return;
      if(button.matches('[data-spp-load]')){await load();return;}
      if(button.matches('[data-spp-discard]')){preview=null;review.innerHTML='<section class="spp-review"><p>ทิ้งเฉพาะร่างราคาในกล่องนี้? ราคาที่บันทึกไว้และร่างหมายเหตุจะไม่เปลี่ยน</p><button type="button" data-spp-discard-confirm>ยืนยันทิ้งร่างราคา</button><button type="button" data-spp-back>กลับไปแก้</button></section>';return;}
      if(button.matches('[data-spp-discard-confirm]')){drafts.clear();preview=null;message='';render();return;}
      if(button.matches('[data-spp-back]')){preview=null;review.innerHTML='';actions();return;}
      if(button.matches('[data-spp-stage]')){const change=pending();if(!enabled()||change.invalid.length||!change.changes.length)return;preview=change.changes;review.innerHTML=reviewMarkup(state.rows,preview);actions();return;}
      if(button.matches('[data-spp-confirm]')){
        if(!preview||!enabled())return;
        working=true;actions();const changes=preview.map(change=>({...change}));
        try{await service.save(changes);live();drafts.clear();preview=null;message='บันทึกและอ่านกลับยืนยันราคาสต๊อกแล้ว';try{const refreshed=await options.onSaved?.();if(refreshed===false)message+=' · มีร่างงานอื่นค้างอยู่ กรุณาบันทึกให้เสร็จแล้วกดโหลดล่าสุดเพื่ออัปเดตกล่องสรุป';}catch{message+=' · กรุณากดโหลดล่าสุดเพื่ออัปเดตกล่องสรุป';}}
        catch(error){live();preview=null;message=error?.message||'ยังยืนยันการบันทึกไม่ได้ กรุณาอ่านราคาล่าสุดก่อนส่งซ้ำ';}
        finally{working=false;render();}
      }
    });
    const unload=event=>{if(drafts.size||working){event.preventDefault();event.returnValue='';}};
    doc?.defaultView?.addEventListener?.('beforeunload',unload);
    const api={updateContext(value){if(value)context=value;updateCoverage();actions();},hasDraft:()=>drafts.size>0,isBusy:()=>working,load,destroy(){doc?.defaultView?.removeEventListener?.('beforeunload',unload);instances.delete(host);}};
    instances.set(host,api);render();return api;
  }
  return {mount,coverage,missingDetails,visibleRows,changesFor,rowMarkup,reviewMarkup};
});
