/* Restore only the viewport lost by a synchronous production-grid edit render.
 * Original handlers, values, validation, dirty tracking and saves are untouched. */
(function(){
  'use strict';
  if(window.__AAF_PLAN_VIEWPORT__)return;window.__AAF_PLAN_VIEWPORT__=true;
  var epoch=0,navigation=null,buttonSeed=null;
  function controls(){return Array.prototype.slice.call(document.querySelectorAll('input,select,textarea,button,a[href],[tabindex]'));}
  function isControl(node){return !!(node&&node.matches&&node.matches('input,select,textarea'));}
  function matchesKey(node,id){return node.tagName===id.tag&&node.getAttribute(id.handler)===id.call&&node.getAttribute('aria-label')===id.aria&&node.getAttribute('title')===id.title;}
  function key(node){
    if(!node||!node.getAttribute)return null;
    if(node.id)return {id:node.id};
    var handlers=['onchange','onclick','oninput'];
    for(var i=0;i<handlers.length;i++){
      var call=node.getAttribute(handlers[i]);if(!call)continue;
      var id={handler:handlers[i],call:call,tag:node.tagName,aria:node.getAttribute('aria-label'),title:node.getAttribute('title')};
      if(controls().filter(function(n){return matchesKey(n,id);}).length===1)return id;
    }
    return null;
  }
  function findKey(id){
    if(!id)return null;if(id.id)return document.getElementById(id.id);
    var matches=controls().filter(function(n){return matchesKey(n,id);});return matches.length===1?matches[0]:null;
  }
  function tables(){return Array.prototype.slice.call(document.querySelectorAll('table.production-overview-grid'));}
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
  function cancel(){epoch++;navigation=null;buttonSeed=null;}
  function pointer(event){
    cancel();var active=document.activeElement,target=event.target&&event.target.closest&&event.target.closest('input,select,textarea,button,a[href],[tabindex]');
    if(isControl(active)&&active!==target)navigation={from:active,to:key(target),kind:'pointer'};
    rememberButton(event.target);
  }
  function keyboard(event){
    cancel();if(event.key==='Enter'||event.key===' '||event.key==='Spacebar')rememberButton(event.target);
    if(event.key!=='Tab'||!isControl(event.target))return;
    var list=controls().filter(visible),index=list.indexOf(event.target),next=list[index+(event.shiftKey?-1:1)];
    navigation={from:event.target,to:key(next),kind:'tab'};
  }
  function capture(event){
    var input=event.target,table=isControl(input)&&input.closest('table.production-overview-grid');if(!table)return;
    preserve(input,table,null,null);
  }
  function click(event){
    var button=event.target&&event.target.closest&&event.target.closest('button'),action=actionFor(button);if(!action)return;
    var seed=buttonSeed&&buttonSeed.button===button&&buttonSeed.view.epoch===epoch?buttonSeed.view:null;buttonSeed=null;
    preserve(button,action.table,action,seed);
  }
  function preserve(input,table,action,seed){
    var view=seed&&seed.month===month()?seed:viewSnapshot(table,action);if(!view.scrolls.length)return;
    var move=!action&&navigation&&navigation.from===input?navigation:null;
    var state={epoch:++epoch,month:view.month,table:view.table,input:input,scrolls:view.scrolls,x:view.x,y:view.y,action:action,expanded:view.expanded,focus:action?key(input):(move?move.to:(document.activeElement===input?key(input):null)),navigation:move?move.kind:null,keepPage:true,focused:false,caret:null};
    if(!move&&document.activeElement===input){try{if(typeof input.selectionStart==='number')state.caret=[input.selectionStart,input.selectionEnd,input.selectionDirection];}catch(_){}}
    navigation=null;
    function valid(){return state.epoch===epoch&&state.month===month();}
    function revealNavigation(target,now){
      if(!state.navigation||!target||!target.getBoundingClientRect)return;
      now.forEach(function(node,index){
        if(!node.getBoundingClientRect)return;
        var rect=target.getBoundingClientRect(),bounds=node.getBoundingClientRect(),top=bounds.top;
        var targetTable=target.closest('table.production-overview-grid'),header=targetTable&&targetTable.tHead;if(header&&header.isConnected&&header.getBoundingClientRect)top=Math.max(top,header.getBoundingClientRect().bottom);
        if(rect.left<bounds.left)node.scrollLeft-=bounds.left-rect.left;else if(rect.right>bounds.right)node.scrollLeft+=rect.right-bounds.right;
        if(rect.top<top)node.scrollTop-=top-rect.top;else if(rect.bottom>bounds.bottom)node.scrollTop+=rect.bottom-bounds.bottom;
        state.scrolls[index].left=node.scrollLeft;state.scrolls[index].top=node.scrollTop;
      });
    }
    function restore(focus){
      if(!valid())return;
      var tableNow=tables()[state.table],now=wraps(tableNow);if(now.length!==state.scrolls.length)return;
      var active=document.activeElement,target=state.action?actionButton(state.action,tableNow):findKey(state.focus);
      var activeOutside=active&&active!==document.body&&active!==document.documentElement&&active!==state.input&&active.closest&&active.closest('table.production-overview-grid')!==tableNow;
      var intendedOutside=state.navigation&&target&&target.closest&&target.closest('table.production-overview-grid')!==tableNow;
      if(activeOutside||intendedOutside)state.keepPage=false;
      now.forEach(function(node,index){var saved=state.scrolls[index];if(node.scrollLeft!==saved.left)node.scrollLeft=saved.left;if(node.scrollTop!==saved.top)node.scrollTop=saved.top;});
      if(focus&&(state.focus||state.action)){
        if(target&&(active===document.body||active===document.documentElement||active===state.input||!active||(state.navigation==='tab'&&!activeOutside))){
          try{target.focus({preventScroll:true});if(state.caret&&typeof target.setSelectionRange==='function')target.setSelectionRange(state.caret[0],state.caret[1],state.caret[2]);}catch(_){}
        }
        if(!intendedOutside&&document.activeElement===target)revealNavigation(target,now);
      }
      if(state.keepPage&&(window.scrollX!==state.x||window.scrollY!==state.y))window.scrollTo({left:state.x,top:state.y,behavior:'instant'});
    }
    function attempt(){
      if(!valid())return;
      var now=wraps(tables()[state.table]);
      var replaced=now.some(function(node,index){return node!==state.scrolls[index].node;})||state.input.isConnected===false;
      var detail=state.action&&state.action.kind==='detail'?actionButton(state.action,tables()[state.table]):null;
      var toggled=detail&&detail.getAttribute('aria-expanded')!==state.expanded;
      // In-place detail toggles are explicit layout changes; ordinary unchanged
      // edits or rejected/cancelled button actions still cause no restore writes.
      if(now.length!==state.scrolls.length||(!replaced&&!toggled))return;
      restore(!state.focused);state.focused=true;
    }
    queueMicrotask(attempt);
    // A native capture-listener microtask may run before the target's inline
    // change handler. Always recheck in the bounded frames, not just microtasks.
    requestAnimationFrame(function(){attempt();if(valid())requestAnimationFrame(attempt);});
  }
  document.addEventListener('pointerdown',pointer,true);
  document.addEventListener('keydown',keyboard,true);
  document.addEventListener('wheel',cancel,{capture:true,passive:true});
  document.addEventListener('touchmove',cancel,{capture:true,passive:true});
  document.addEventListener('pointermove',function(event){if(event.buttons)cancel();},{capture:true,passive:true});
  document.addEventListener('change',capture,true);
  document.addEventListener('click',click,true);
})();
