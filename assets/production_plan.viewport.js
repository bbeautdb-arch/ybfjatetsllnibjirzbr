/* Restore the viewport lost by a synchronous production-grid edit render.
 * Vertical scroll lives on the window (.tablewrap is overflow-y: clip).
 * Original handlers, values, validation, dirty tracking and saves are untouched.
 * Enter may move to the next cell when that is already the page's behaviour,
 * but must not jump the page to the top. */
(function(){
  'use strict';
  if(window.__AAF_PLAN_VIEWPORT__)return;window.__AAF_PLAN_VIEWPORT__=true;
  var epoch=0,navigation=null,buttonSeed=null,holdTimer=null,holdObserver=null;
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
    /* Position fallback so a rebuilt identical onchange can still be found. */
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
  var userEdit=false;
  function markUserEdit(){userEdit=true;setTimeout(function(){userEdit=false;},600);}
  function holdScroll(x,y){
    var until=Date.now()+450;
    function tick(){if(Date.now()>until){releaseHold();return;}scrollWindow(x,y);}
    releaseHold();
    holdTimer=setInterval(tick,50);
    var host=document.getElementById('main')||document.body;
    if(host&&typeof MutationObserver!=='undefined'){
      holdObserver=new MutationObserver(function(){scrollWindow(x,y);});
      holdObserver.observe(host,{childList:true,subtree:true});
    }
    requestAnimationFrame(function(){scrollWindow(x,y);requestAnimationFrame(function(){scrollWindow(x,y);});});
    setTimeout(function(){scrollWindow(x,y);},0);
    setTimeout(function(){scrollWindow(x,y);},120);
    setTimeout(function(){scrollWindow(x,y);releaseHold();},400);
  }
  function releaseHold(){
    if(holdTimer){clearInterval(holdTimer);holdTimer=null;}
    if(holdObserver){try{holdObserver.disconnect();}catch(_){}holdObserver=null;}
  }
  /* User-initiated page scroll cancels a pending restore. Pointer/keys must not,
     because they are what start the edit that we need to restore after. */
  function cancel(){epoch++;navigation=null;buttonSeed=null;releaseHold();}
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
    navigation=null;markUserEdit();
    function valid(){return state.epoch===epoch&&state.month===month();}
    function revealNavigation(target,now){
      if(!state.navigation||!target||!target.getBoundingClientRect)return;
      now.forEach(function(node,index){
        if(!node.getBoundingClientRect)return;
        var rect=target.getBoundingClientRect(),bounds=node.getBoundingClientRect(),top=bounds.top;
        var targetTable=target.closest('table.production-overview-grid, table.preview-table'),header=targetTable&&targetTable.tHead;if(header&&header.isConnected&&header.getBoundingClientRect)top=Math.max(top,header.getBoundingClientRect().bottom);
        if(rect.left<bounds.left)node.scrollLeft-=bounds.left-rect.left;else if(rect.right>bounds.right)node.scrollLeft+=rect.right-bounds.right;
        if(rect.top<top)node.scrollTop-=top-rect.top;else if(rect.bottom>bounds.bottom)node.scrollTop+=rect.bottom-bounds.bottom;
        if(state.scrolls[index]){state.scrolls[index].left=node.scrollLeft;state.scrolls[index].top=node.scrollTop;}
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
          try{target.focus({preventScroll:true});if(state.caret&&typeof target.setSelectionRange==='function')target.setSelectionRange(state.caret[0],state.caret[1],state.caret[2]);}catch(_){}
        }
        if(!intendedOutside&&document.activeElement===target)revealNavigation(target,now);
      }
      if(state.keepPage)scrollWindow(state.x,state.y);
    }
    function attempt(){
      if(!valid())return;
      var tableNow=tables()[state.table],now=wraps(tableNow);
      var replaced=!state.input||state.input.isConnected===false||now.some(function(node,index){return !state.scrolls[index]||node!==state.scrolls[index].node;});
      var drifted=window.scrollX!==state.x||window.scrollY!==state.y;
      var detail=state.action&&state.action.kind==='detail'?actionButton(state.action,tableNow):null;
      var toggled=detail&&detail.getAttribute('aria-expanded')!==state.expanded;
      if(!replaced&&!toggled&&!drifted)return;
      restore(!state.focused);state.focused=true;
      if(state.keepPage)holdScroll(state.x,state.y);
    }
    queueMicrotask(attempt);
    requestAnimationFrame(function(){attempt();if(valid())requestAnimationFrame(attempt);});
    setTimeout(attempt,0);
    setTimeout(attempt,60);
    setTimeout(attempt,200);
  }
  function hookRender(name){
    try{
      var orig=window[name];
      if(typeof orig!=='function'||orig.__aafViewportHook)return false;
      var wrapped=function(){
        var x=window.scrollX,y=window.scrollY;
        var ret=orig.apply(this,arguments);
        scrollWindow(x,y);
        if(userEdit)holdScroll(x,y);
        else requestAnimationFrame(function(){scrollWindow(x,y);});
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
  document.addEventListener('wheel',cancel,{capture:true,passive:true});
  document.addEventListener('touchmove',cancel,{capture:true,passive:true});
  document.addEventListener('pointermove',function(event){if(event.buttons)cancel();},{capture:true,passive:true});
  document.addEventListener('change',capture,true);
  document.addEventListener('click',click,true);
  hookAll();
  var tries=0,iv=setInterval(function(){hookAll();if(++tries>40)clearInterval(iv);},250);
})();
