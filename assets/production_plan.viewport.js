/* Keep the plan table in place after an edit render.
 * Root cause: renderAll / renderEntryPage replace #main.innerHTML, so the
 * document height collapses and window.scrollY falls to 0 (the plan table's
 * .tablewrap is overflow:visible, so the window is the vertical scroller).
 * v8 then hammered scrollTo for ~450ms (interval + MutationObserver + timeouts),
 * which fought later add-on paints, iOS keyboard resize, and Safari auto-zoom
 * on inputs under 16px — that is the jump-and-jitter.
 * Fix: pin #main min-height across the rebuild, restore scroll once (sync +
 * one animation frame), and put focus back with preventScroll. No hold loop.
 * Original handlers, values, validation, dirty tracking and saves are untouched.
 * Enter may move to the next cell when that is already the page's behaviour,
 * but must not jump the page to the top. */
(function(){
  'use strict';
  if(window.__AAF_PLAN_VIEWPORT__)return;window.__AAF_PLAN_VIEWPORT__=true;
  var epoch=0,navigation=null,buttonSeed=null,pinCount=0,pendingUnpin=null;
  function controls(){return Array.prototype.slice.call(document.querySelectorAll('input,select,textarea,button,a[href],[tabindex]'));}
  function isControl(node){return !!(node&&node.matches&&node.matches('input,select,textarea'));}
  function inPlanGrid(node){return !!(node&&node.closest&&node.closest('table.production-overview-grid, table.preview-table, #main'));}
  function matchesKey(node,id){return node.tagName===id.tag&&node.getAttribute(id.handler)===id.call&&node.getAttribute('aria-label')===id.aria&&node.getAttribute('title')===id.title;}
  function key(node){
    if(!node||!node.getAttribute)return null;
    if(node.id)return {id:node.id};
    var handlers=['onchange','onclick','oninput','onkeydown','onkeyup'];
    for(var i=0;i<handlers.length;i++){
      var call=node.getAttribute(handlers[i]);if(!call)continue;
      var id={handler:handlers[i],call:call,tag:node.tagName,aria:node.getAttribute('aria-label'),title:node.getAttribute('title')};
      if(controls().filter(function(n){return matchesKey(n,id);}).length===1)return id;
    }
    var table=node.closest&&node.closest('table.production-overview-grid, table.preview-table');
    if(table){
      var row=node.closest('tr'),rows=Array.prototype.indexOf.call(table.rows||[],row);
      var cell=node.closest('td,th'),cells=row?Array.prototype.indexOf.call(row.children,cell):-1;
      var kind=node.className||node.getAttribute('type')||node.tagName;
      return {pos:true,table:Array.prototype.indexOf.call(document.querySelectorAll('table.production-overview-grid, table.preview-table'),table),row:rows,cell:cells,kind:String(kind),tag:node.tagName,name:node.getAttribute('name'),aria:node.getAttribute('aria-label')};
    }
    return null;
  }
  function findKey(id){
    if(!id)return null;if(id.id)return document.getElementById(id.id);
    if(id.pos){
      var tables=document.querySelectorAll('table.production-overview-grid, table.preview-table');
      var table=tables[id.table];if(!table||!table.rows||!table.rows[id.row])return null;
      var row=table.rows[id.row],cell=row.children[id.cell];if(!cell)return null;
      var nodes=cell.querySelectorAll(id.tag);
      var matches=Array.prototype.filter.call(nodes,function(n){
        return String(n.className||n.getAttribute('type')||n.tagName)===id.kind && n.getAttribute('name')===id.name && n.getAttribute('aria-label')===id.aria;
      });
      return matches.length===1?matches[0]:(nodes.length===1?nodes[0]:null);
    }
    var matches=controls().filter(function(n){return matchesKey(n,id);});return matches.length===1?matches[0]:null;
  }
  function tables(){return Array.prototype.slice.call(document.querySelectorAll('table.production-overview-grid, table.preview-table'));}
  function wraps(table){var found=[],node=table&&table.closest('.tablewrap');while(node){found.push(node);node=node.parentElement&&node.parentElement.closest('.tablewrap');}return found;}
  function month(){var picker=document.getElementById('monthPicker');return picker?picker.value:null;}
  function visible(node){return !node.disabled&&node.tabIndex>=0&&node.getAttribute('type')!=='hidden'&&(!node.getClientRects||node.getClientRects().length>0);}
  function actionFor(button){
    if(!button||button.disabled||!button.matches||!button.matches('button'))return null;
    var call=String(button.getAttribute('onclick')||'').trim(),match,table=button.closest('table.production-overview-grid'),clone=!table&&button.closest('#floatingDayHeader');
    if(button.matches('button.pv-add-btn')&&(button.closest('thead')||clone)&&(match=/^productionAddDayRun\(\s*([1-9]|[12][0-9]|3[01])\s*\)\s*;?$/.exec(call))){
      table=table||(clone&&tables()[0]);return table?{kind:'add',day:Number(match[1]),table:table,clone:!!clone}:null;
    }
    if(table&&button.matches('button.line-detail-toggle')&&(match=/^toggleProductionLineDetail\(\s*(['"])(Line [123])\1\s*\)\s*;?$/.exec(call))&&button.getAttribute('data-line-toggle')===match[2])return {kind:'detail',line:match[2],table:table,clone:false};
    return null;
  }
  function actionButton(action,table){
    var host=action.clone?document.getElementById('floatingDayHeader'):table;if(!host)return null;
    var matches=Array.prototype.filter.call(host.querySelectorAll('button'),function(button){var candidate=actionFor(button);return candidate&&candidate.kind===action.kind&&candidate.day===action.day&&candidate.line===action.line;});
    return matches.length===1?matches[0]:null;
  }
  function viewSnapshot(table,action){return {epoch:epoch,month:month(),table:tables().indexOf(table),scrolls:wraps(table).map(function(node){return {node:node,top:node.scrollTop,left:node.scrollLeft};}),x:window.scrollX,y:window.scrollY,expanded:action&&action.kind==='detail'?actionButton(action,table)?.getAttribute('aria-expanded'):null};}
  function rememberButton(target){var button=target&&target.closest&&target.closest('button'),action=actionFor(button);if(action)buttonSeed={button:button,action:action,view:viewSnapshot(action.table,action)};}
  function scrollWindow(x,y){
    if(window.scrollX===x&&window.scrollY===y)return;
    try{window.scrollTo(x,y);}catch(_){}
    if(window.scrollX!==x||window.scrollY!==y){
      try{window.scrollTo({left:x,top:y,behavior:'auto'});}catch(_){}
    }
    if(window.scrollX!==x||window.scrollY!==y){
      try{document.documentElement.scrollTop=y;document.documentElement.scrollLeft=x;if(document.body){document.body.scrollTop=y;document.body.scrollLeft=x;}}catch(_){}
    }
  }
  function allWraps(){return Array.prototype.slice.call(document.querySelectorAll('#main .tablewrap, .tablewrap'));}
  function snapshotScrolls(){
    return {x:window.scrollX,y:window.scrollY,wraps:allWraps().map(function(node){return {left:node.scrollLeft,top:node.scrollTop};})};
  }
  function restoreScrolls(snap){
    if(!snap)return;
    var nodes=allWraps();
    snap.wraps.forEach(function(saved,i){
      var node=nodes[i];if(!node||!saved)return;
      if(node.scrollLeft!==saved.left)node.scrollLeft=saved.left;
      if(node.scrollTop!==saved.top)node.scrollTop=saved.top;
    });
    scrollWindow(snap.x,snap.y);
  }
  function focusQuiet(node){
    if(!node||!node.focus)return;
    try{node.focus({preventScroll:true});}catch(_){try{node.focus();}catch(__){}}
  }
  function pinMain(){
    var main=document.getElementById('main');
    if(!main)return null;
    var h=Math.max(main.offsetHeight||0, main.scrollHeight||0);
    if(h>0){
      var cur=parseFloat(main.style.minHeight)||0;
      if(h>cur)main.style.minHeight=h+'px';
    }
    pinCount++;
    if(pendingUnpin){clearTimeout(pendingUnpin);pendingUnpin=null;}
    return main;
  }
  function scheduleUnpin(main,snap){
    function finish(){
      pinCount=Math.max(0,pinCount-1);
      restoreScrolls(snap);
      if(pinCount===0&&main&&main.style&&main.style.minHeight){
        main.style.minHeight='';
        restoreScrolls(snap);
      }
    }
    if(typeof requestAnimationFrame==='function'){
      requestAnimationFrame(function(){
        restoreScrolls(snap);
        requestAnimationFrame(finish);
      });
    }else{
      finish();
    }
  }
  function pointer(event){
    var active=document.activeElement,target=event.target&&event.target.closest&&event.target.closest('input,select,textarea,button,a[href],[tabindex]');
    if(isControl(active)&&active!==target)navigation={from:active,to:key(target),kind:'pointer'};
    rememberButton(event.target);
    var table=target&&target.closest&&target.closest('table.production-overview-grid, table.preview-table');
    if(table&&isControl(target))snapshotFocus(target,table);
  }
  function keyboard(event){
    if(event.key==='Enter'||event.key===' '||event.key==='Spacebar')rememberButton(event.target);
    var table=isControl(event.target)&&event.target.closest&&event.target.closest('table.production-overview-grid, table.preview-table');
    if(table&&(event.key==='Enter'||event.key==='Tab')){
      if(event.key==='Tab'){
        var list=controls().filter(visible),index=list.indexOf(event.target),next=list[index+(event.shiftKey?-1:1)];
        navigation={from:event.target,to:key(next),kind:'tab'};
      }
      snapshotFocus(event.target,table);
      return;
    }
    if(event.key!=='Tab'||!isControl(event.target))return;
    var list=controls().filter(visible),index=list.indexOf(event.target),next=list[index+(event.shiftKey?-1:1)];
    navigation={from:event.target,to:key(next),kind:'tab'};
  }
  function capture(event){
    var input=event.target,table=isControl(input)&&input.closest('table.production-overview-grid, table.preview-table');if(!table)return;
    preserve(input,table,null,null);
  }
  function onFocus(event){
    var input=event.target,table=isControl(input)&&input.closest('table.production-overview-grid, table.preview-table');if(!table)return;
    snapshotFocus(input,table);
  }
  var lastSnap=null;
  function snapshotFocus(input,table){
    lastSnap=viewSnapshot(table,null);
    lastSnap.input=input;
    lastSnap.focus=key(input);
  }
  function click(event){
    var button=event.target&&event.target.closest&&event.target.closest('button'),action=actionFor(button);if(!action)return;
    var seed=buttonSeed&&buttonSeed.button===button?buttonSeed.view:null;buttonSeed=null;
    preserve(button,action.table,action,seed);
  }
  function preserve(input,table,action,seed){
    var view=seed&&seed.month===month()?seed:(lastSnap&&lastSnap.month===month()?lastSnap:viewSnapshot(table,action));
    var move=!action&&navigation&&navigation.from===input?navigation:null;
    var state={epoch:++epoch,month:view.month,table:view.table,input:input,scrolls:view.scrolls,x:view.x,y:view.y,action:action,expanded:view.expanded,focus:action?key(input):(move?move.to:(document.activeElement===input||(lastSnap&&lastSnap.input===input)?(move?move.to:key(input)):null)),navigation:move?move.kind:null,keepPage:true,focused:false,caret:null};
    if(!move&&document.activeElement===input){try{if(typeof input.selectionStart==='number')state.caret=[input.selectionStart,input.selectionEnd,input.selectionDirection];}catch(_){}}
    navigation=null;
    function valid(){return state.epoch===epoch&&state.month===month();}
    function revealHorizontal(target,now){
      if(!target||!target.getBoundingClientRect)return;
      now.forEach(function(node){
        if(!node.getBoundingClientRect)return;
        var rect=target.getBoundingClientRect(),bounds=node.getBoundingClientRect();
        if(rect.left<bounds.left)node.scrollLeft-=bounds.left-rect.left;
        else if(rect.right>bounds.right)node.scrollLeft+=rect.right-bounds.right;
      });
    }
    function restore(focus){
      if(!valid())return;
      var tableNow=tables()[state.table],now=wraps(tableNow);
      var active=document.activeElement,target=state.action?actionButton(state.action,tableNow):findKey(state.focus);
      var activeOutside=active&&active!==document.body&&active!==document.documentElement&&active!==state.input&&active.closest&&!inPlanGrid(active)&&active.closest('table.production-overview-grid, table.preview-table')!==tableNow;
      var intendedOutside=state.navigation&&target&&target.closest&&target.closest('table.production-overview-grid, table.preview-table')!==tableNow;
      if(activeOutside||intendedOutside)state.keepPage=false;
      if(now.length===state.scrolls.length){
        now.forEach(function(node,index){var saved=state.scrolls[index];if(!saved)return;if(node.scrollLeft!==saved.left)node.scrollLeft=saved.left;if(node.scrollTop!==saved.top)node.scrollTop=saved.top;});
      }
      if(focus&&(state.focus||state.action)){
        if(target&&(active===document.body||active===document.documentElement||active===state.input||!active||!active.isConnected||(state.navigation==='tab'&&!activeOutside))){
          focusQuiet(target);
          try{if(state.caret&&typeof target.setSelectionRange==='function')target.setSelectionRange(state.caret[0],state.caret[1],state.caret[2]);}catch(_){}
        }
        if(!intendedOutside&&document.activeElement===target)revealHorizontal(target,now);
      }
      if(state.keepPage)scrollWindow(state.x,state.y);
    }
    function attempt(){
      if(!valid()||state.focused)return;
      var tableNow=tables()[state.table],now=wraps(tableNow);
      var replaced=!state.input||state.input.isConnected===false||now.some(function(node,index){return !state.scrolls[index]||node!==state.scrolls[index].node;});
      var drifted=window.scrollX!==state.x||window.scrollY!==state.y;
      var detail=state.action&&state.action.kind==='detail'?actionButton(state.action,tableNow):null;
      var toggled=detail&&detail.getAttribute('aria-expanded')!==state.expanded;
      if(!replaced&&!toggled&&!drifted)return;
      restore(true);state.focused=true;
    }
    if(typeof requestAnimationFrame==='function'){
      requestAnimationFrame(function(){attempt();});
    }else{
      attempt();
    }
  }
  var skipRebuild=0;
  function isSafeInplace(el){
    if(!el||!el.matches)return false;
    if(!el.closest||!el.closest('table.production-overview-grid, table.preview-table'))return false;
    if(el.matches('button,select,input.pv-thk,input.pv-size'))return false;
    return !!el.matches('input,textarea');
  }
  function inplaceRefresh(){
    try{if(window.enhancePlanGridMetricRows)window.enhancePlanGridMetricRows();}catch(_){}
    try{if(window.__AAF_EQ25_SIZE__)window.__AAF_EQ25_SIZE__.correctAll();}catch(_){}
    try{if(window.__AAF_COLORS__&&typeof window.__AAF_COLORS__.paint==='function')window.__AAF_COLORS__.paint();}catch(_){}
    try{if(window.__AAF_MODERN_METRICS__)window.__AAF_MODERN_METRICS__();}catch(_){}
    try{if(typeof refreshProductionSummaryActualCards==='function')refreshProductionSummaryActualCards();}catch(_){}
  }
  function beginInplace(){
    skipRebuild++;
    queueMicrotask(function(){
      try{inplaceRefresh();}
      finally{skipRebuild=Math.max(0,skipRebuild-1);}
    });
  }
  function hookRender(name){
    try{
      var orig=window[name];
      if(typeof orig!=='function'||orig.__aafViewportHook)return false;
      var wrapped=function(){
        if(skipRebuild>0&&(name==='renderAll'||name==='renderEntryPage'))return;
        var snap=snapshotScrolls();
        var main=pinMain();
        var ret;
        try{ret=orig.apply(this,arguments);}
        finally{
          restoreScrolls(snap);
          try{if(window.__AAF_PAINT__&&typeof window.__AAF_PAINT__.flush==='function')window.__AAF_PAINT__.flush();}catch(_){}
          restoreScrolls(snap);
          scheduleUnpin(main,snap);
        }
        return ret;
      };
      wrapped.__aafViewportHook=true;
      window[name]=wrapped;
      return true;
    }catch(_){return false;}
  }
  function hookAll(){
    ['renderAll','renderEntryPage','refreshProductionMailActual','refreshProductionSummaryActualCards','updatePlan','updateRun'].forEach(hookRender);
  }
  document.addEventListener('pointerdown',pointer,true);
  document.addEventListener('keydown',keyboard,true);
  document.addEventListener('focusin',onFocus,true);
  document.addEventListener('change',function(ev){if(isSafeInplace(ev.target))beginInplace();},true);
  document.addEventListener('input',function(ev){
    var el=ev.target;if(!isSafeInplace(el))return;
    var h=el.getAttribute('oninput')||'';
    if(/updateRun|updatePlan|renderAll|renderEntryPage/.test(h))beginInplace();
  },true);
  document.addEventListener('change',capture,true);
  document.addEventListener('click',click,true);
  hookAll();
  var tries=0,iv=setInterval(function(){hookAll();if(++tries>40)clearInterval(iv);},250);
})();
