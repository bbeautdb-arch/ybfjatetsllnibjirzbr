/* Restore only the viewport lost by a synchronous production-grid edit render.
 * Original handlers, values, validation, dirty tracking and saves are untouched. */
(function(){
  'use strict';
  if(window.__AAF_PLAN_VIEWPORT__)return;window.__AAF_PLAN_VIEWPORT__=true;
  var epoch=0,navigation=null;
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
  function cancel(){epoch++;navigation=null;}
  function pointer(event){
    cancel();var active=document.activeElement,target=event.target&&event.target.closest&&event.target.closest('input,select,textarea,button,a[href],[tabindex]');
    if(isControl(active)&&active!==target)navigation={from:active,to:key(target),kind:'pointer'};
  }
  function keyboard(event){
    cancel();if(event.key!=='Tab'||!isControl(event.target))return;
    var list=controls().filter(visible),index=list.indexOf(event.target),next=list[index+(event.shiftKey?-1:1)];
    navigation={from:event.target,to:key(next),kind:'tab'};
  }
  function capture(event){
    var input=event.target,table=isControl(input)&&input.closest('table.production-overview-grid');if(!table)return;
    var scrolls=wraps(table).map(function(node){return {node:node,top:node.scrollTop,left:node.scrollLeft};});if(!scrolls.length)return;
    var move=navigation&&navigation.from===input?navigation:null;
    var state={epoch:++epoch,month:month(),table:tables().indexOf(table),input:input,scrolls:scrolls,x:window.scrollX,y:window.scrollY,focus:move?move.to:(document.activeElement===input?key(input):null),navigation:move?move.kind:null,keepPage:true,focused:false,caret:null};
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
      var active=document.activeElement,target=findKey(state.focus);
      var activeOutside=active&&active!==document.body&&active!==document.documentElement&&active!==state.input&&active.closest&&active.closest('table.production-overview-grid')!==tableNow;
      var intendedOutside=state.navigation&&target&&target.closest&&target.closest('table.production-overview-grid')!==tableNow;
      if(activeOutside||intendedOutside)state.keepPage=false;
      now.forEach(function(node,index){var saved=state.scrolls[index];if(node.scrollLeft!==saved.left)node.scrollLeft=saved.left;if(node.scrollTop!==saved.top)node.scrollTop=saved.top;});
      if(focus&&state.focus){
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
      // Ordinary edits without replacement do not trigger focus or scroll writes.
      if(now.length!==state.scrolls.length||!now.some(function(node,index){return node!==state.scrolls[index].node;})&&state.input.isConnected!==false)return;
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
})();
