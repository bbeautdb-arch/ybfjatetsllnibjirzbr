/* Exact-thickness presentation only. Existing plan inputs, runs, saved data and
 * canonical refresh slots remain unchanged. Actual-only overflow is read-only. */
(function(){
  'use strict';
  if(window.__AAF_MIXED_LAYOUT__)return;window.__AAF_MIXED_LAYOUT__=true;
  function thickness(value){var s=value==null?'':String(value).trim(),n=Number(s);return s!==''&&Number.isFinite(n)&&n>0?n:null;}
  function buildDisplayLaneMap(slotThicknesses,groups){
    var normalize=function(value){var s=value==null?'':String(value).trim(),n=Number(s);return s!==''&&Number.isFinite(n)&&n>0?n:null;};
    var slots=slotThicknesses.map(normalize),first=new Map(),used=new Set(),items=new Map();
    slots.forEach(function(t,i){if(t!==null&&!first.has(String(t)))first.set(String(t),i);});
    groups.forEach(function(g){var t=normalize(g.thickness),key=t===null?'unknown':String(t);if(!items.has(key))items.set(key,{key:key,thickness:t,qty:g.qty});});
    var assignments=[],missing=[],extras=[];
    items.forEach(function(g){
      if(first.has(g.key)){var i=first.get(g.key);used.add(i);assignments.push({key:g.key,thickness:g.thickness,column:i+1,row:1,planned:true,overflow:false,repeatCount:slots.filter(function(t){return t!==null&&String(t)===g.key;}).length});}
      else extras.push(g);
    });
    extras.sort(function(a,b){var ap=a.thickness!==null&&typeof a.qty==='number'&&a.qty>0,bp=b.thickness!==null&&typeof b.qty==='number'&&b.qty>0;return Number(bp)-Number(ap)||(a.thickness===null?Infinity:a.thickness)-(b.thickness===null?Infinity:b.thickness);});
    var columns=Math.max(1,slots.length),overflowIndex=0;
    extras.forEach(function(g){
      var productive=g.thickness!==null&&typeof g.qty==='number'&&Number.isFinite(g.qty)&&g.qty>0;
      if(productive)missing.push(g.thickness);
      var blank=productive?slots.findIndex(function(t,i){return t===null&&!used.has(i);}):-1;
      if(blank>=0){used.add(blank);assignments.push({key:g.key,thickness:g.thickness,column:blank+1,row:1,planned:false,overflow:false});}
      else {assignments.push({key:g.key,thickness:g.thickness,column:overflowIndex%columns+1,row:2+Math.floor(overflowIndex/columns),planned:false,overflow:true});overflowIndex++;}
    });
    return {columns:columns,assignments:assignments,missing:missing};
  }
  function days(row){var out=[],g;Array.prototype.forEach.call(row.children,function(td){if(String(td.tagName).toUpperCase()!=='TD')return;if(!g||td.classList.contains('day-start')){g=[];out.push(g);}g.push(td);});return out;}
  function sourceGroups(line,day){try{return typeof productionActualThicknessPairs==='function'?productionActualThicknessPairs(line,day):[];}catch(_){return [];}}
  function mapFor(inputs,groups){return buildDisplayLaneMap(inputs.map(function(i){return i?i.value:'';}),groups.map(function(g){return {thickness:g.thickness,qty:g.actual?g.actual.qty:null};}));}
  function key(node,phr){var raw=node.getAttribute(phr?'data-mail-phr-thickness':'data-mail-thickness'),t=thickness(raw);return t===null?'unknown':String(t);}
  function setAttr(node,name,value){value=String(value);if(node.getAttribute(name)!==value)node.setAttribute(name,value);}
  function repeatLabel(node,item){if(item.repeatCount>1)setAttr(node,'data-mixed-repeat-label','รวม '+item.repeatCount+' รอบความหนานี้');else node.removeAttribute('data-mixed-repeat-label');}
  function position(node,item){setAttr(node,'data-mixed-column',item.column);setAttr(node,'data-mixed-row',item.row);setAttr(node,'data-mixed-overflow',item.overflow?'1':'0');repeatLabel(node,item);var col=String(item.column),row=String(item.row);if(node.style.gridColumn!==col)node.style.gridColumn=col;if(node.style.gridRow!==row)node.style.gridRow=row;}
  function warning(cells,inputs,groups){
    var map=mapFor(inputs,groups),byCell=new Map();
    map.assignments.forEach(function(a){if(map.missing.indexOf(a.thickness)<0)return;var cell=cells[a.overflow?0:a.column-1];if(!cell)return;var values=byCell.get(cell)||[];values.push(a.thickness);byCell.set(cell,values);});
    cells.forEach(function(cell){var old=cell.querySelector('[data-mixed-warning]'),values=byCell.get(cell),text=values?values.join(' · ')+' มม.':'';
      if(!text){if(old)old.remove();return;}
      if(!old){old=document.createElement('small');old.setAttribute('data-mixed-warning','1');old.setAttribute('role','note');old.title='ผลิตจริงแล้ว แต่ยังไม่มีความหนานี้ในช่องแผน';cell.insertBefore(old,cell.firstChild);}
      if(old.textContent!==text)old.textContent=text;
    });
    return map;
  }
  function layoutMetric(td,metric,map,groups,line,day){
    var root=td.querySelector(metric==='phr'?'.mail-phr-groups':'[data-mail-inline-metric="'+metric+'-pairs"]');if(!root)return;
    var container=metric==='phr'?root:root.querySelector('.mail-thickness-breakdown');
    if(!container&&metric!=='phr'&&(map.columns>1||groups.length>1)&&typeof productionActualThicknessPair==='function'){
      var stack=root.querySelector('.mail-quantity-stack');if(!stack)return;
      container=document.createElement('span');container.className='mail-thickness-breakdown';container.setAttribute('data-mixed-added-breakdown','1');
      container.innerHTML=groups.map(function(g){return productionActualThicknessPair(line,day,metric,g);}).join('');stack.appendChild(container);
    }
    if(!container)return;
    setAttr(td,'data-mixed-metric',metric);
    setAttr(container,'data-mixed-grid','1');container.style.setProperty('--mixed-columns',String(map.columns));
    var selector=metric==='phr'?'.mail-phr-group':'.mail-thickness-pair';
    container.querySelectorAll(selector).forEach(function(node){var k=key(node,metric==='phr'),item=map.assignments.find(function(a){return a.key===k;});if(item)position(node,item);});
  }
  function sourceHtml(node){return node.outerHTML.replace(/\sdata-(?:mixed-source-hidden|aaf-actual-state)="[^"]*"/g,'');}
  function layoutHours(cells,map){
    var mirrorByCell=new Map();
    cells.forEach(function(cell){setAttr(cell,'data-mixed-hours-cell','1');cell.querySelectorAll('[data-mail-inline-metric="hours-run"]').forEach(function(slot){
      slot.querySelectorAll('.mail-hour-group-total .mail-thickness-pair').forEach(function(node){var item=map.assignments.find(function(a){return a.key===key(node,false);});if(item)repeatLabel(node,item);});
      slot.querySelectorAll('.mail-hours-unplanned .mail-thickness-pair').forEach(function(node){
        var item=map.assignments.find(function(a){return a.key===key(node,false);});if(!item)return;
        if(!item.overflow&&cells[item.column-1]!==cell){
          node.removeAttribute('data-mixed-overflow');setAttr(node,'data-mixed-source-hidden','1');var target=cells[item.column-1],list=mirrorByCell.get(target)||[];list.push(node);mirrorByCell.set(target,list);
        }else{node.removeAttribute('data-mixed-source-hidden');setAttr(node,'data-mixed-overflow',item.overflow?'1':'0');}
      });
    });});
    cells.forEach(function(cell){var nodes=mirrorByCell.get(cell)||[],old=cell.querySelector('[data-mixed-hours-mirror]'),sig=nodes.map(sourceHtml).join('');
      if(!sig){if(old)old.remove();return;}
      if(!old){old=document.createElement('span');old.setAttribute('data-mixed-hours-mirror','1');cell.appendChild(old);}
      if(old.getAttribute('data-mixed-signature')!==sig){old.innerHTML=sig;setAttr(old,'data-mixed-signature',sig);}
    });
  }
  function hoursTotalEligible(inputs,cells,groups){
    var planned=inputs.filter(function(input,i){var hours=cells[i]&&cells[i].querySelector('input.pv-hr'),value=hours?String(hours.value).trim():'';return input&&thickness(input.value)!==null&&value!==''&&Number.isFinite(Number(value))&&Number(value)>0;}).length;
    var actual=new Set();groups.forEach(function(group){var t=thickness(group.thickness),qty=group.actual&&group.actual.qty;if(t!==null&&typeof qty==='number'&&Number.isFinite(qty)&&qty>0)actual.add(t);});
    return planned>1||actual.size>1;
  }
  function layoutHoursTotalRow(row,entries){
    var line=row.getAttribute('data-production-line'),parent=row.parentNode;if(!parent)return;
    var old=Array.prototype.find.call(parent.children,function(n){return n.getAttribute('data-mixed-hours-totals')===line;}),visible=false;
    var html='<th scope="row" aria-label="ชั่วโมงผลิตรวมวัน"></th>';
    entries.forEach(function(entry){
      var sources=[];entry.cells.forEach(function(cell){cell.querySelectorAll('[data-mail-inline-metric="hours-run"] .mail-hours-day-total').forEach(function(source){sources.push(source);setAttr(source,'data-mixed-source-hidden','1');});});
      // Never total displayed companions or invent a missing canonical total.
      // Shared empty lanes and SD-zero thicknesses do not create extra runs.
      var source=sources.length===1&&hoursTotalEligible(entry.inputs,entry.cells,entry.groups)?sources[0]:null;
      var span=entry.cells.reduce(function(sum,cell){var n=Number(cell.getAttribute('colspan')||1);return sum+(Number.isInteger(n)&&n>0?n:1);},0);
      html+='<td colspan="'+span+'" class="day-start day-end">'+(source?sourceHtml(source):'')+'</td>';if(source)visible=true;
    });
    if(!visible){if(old)old.remove();return;}
    if(!old){old=document.createElement('tr');old.setAttribute('data-mixed-hours-totals',line);old.setAttribute('data-production-line',line);old.setAttribute('data-line-compact','true');row.after(old);}
    if(old.getAttribute('data-mixed-signature')!==html){old.innerHTML=html;setAttr(old,'data-mixed-signature',html);}
    old.querySelectorAll('.mail-inline-actual').forEach(function(node){var value=node.textContent.trim().replace(/,/g,'').replace(/\*$/,'');setAttr(node,'data-mixed-hours-value',/^(?:\d+\.?\d*|\.\d+)$/.test(value)?'known':'unknown');});
    old.hidden=row.hidden;
  }
  function contexts(table){var result=[];
    table.querySelectorAll('tr[data-production-line]').forEach(function(row){if(!row.querySelector('input.pv-thk'))return;var line=row.getAttribute('data-production-line');
      days(row).forEach(function(cells,index){result.push({table:table,row:row,line:line,day:index+1,cells:cells,inputs:cells.map(function(td){return td.querySelector('input.pv-thk');})});});
    });return result;
  }
  function applyContext(ctx,warningOnly){
    var groups=sourceGroups(ctx.line,ctx.day),map=warning(ctx.cells,ctx.inputs,groups);if(warningOnly||ctx.inputs.some(function(input){return input&&editing.has(input);}))return;
    ctx.table.querySelectorAll('tr[data-production-line]').forEach(function(row){if(row.getAttribute('data-production-line')!==ctx.line)return;var metric=row.getAttribute('data-mail-plan-metric');if(['qty','eq25','phr','hours'].indexOf(metric)<0)return;
      var cells=days(row)[ctx.day-1];if(!cells)return;if(metric==='hours')layoutHours(cells,map);else if(cells.length===1)layoutMetric(cells[0],metric,map,groups,ctx.line,ctx.day);
    });
  }
  function paint(){document.querySelectorAll('table.production-overview-grid').forEach(function(table){var list=contexts(table);list.forEach(function(ctx){applyContext(ctx,false);});
    table.querySelectorAll('tr[data-mail-plan-metric="hours"]').forEach(function(row){var line=row.getAttribute('data-production-line'),dayCells=days(row),entries=list.filter(function(ctx){return ctx.line===line;}).map(function(ctx){return {cells:dayCells[ctx.day-1]||[],inputs:ctx.inputs,groups:sourceGroups(line,ctx.day)};});if(entries.length)layoutHoursTotalRow(row,entries);});
  });}
  var scheduled=false,observer=null,editing=new WeakSet();
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){scheduled=false;if(observer)observer.disconnect();try{paint();}finally{attach();}});}
  function attach(){var host=document.getElementById('main')||document.body;if(observer&&host)observer.observe(host,{childList:true,subtree:true,characterData:true});}
  function boot(){
    var style=document.createElement('style');style.setAttribute('data-aaf-mixed-layout','css');style.textContent='table.production-overview-grid [data-mixed-warning]{display:block!important;color:#b43b32!important;font-size:10px!important;font-weight:700;line-height:1.35;margin-bottom:3px}table.production-overview-grid [data-mixed-grid]{display:grid!important;grid-template-columns:repeat(var(--mixed-columns),minmax(0,1fr))!important;gap:3px!important;width:100%}table.production-overview-grid [data-mixed-grid]>.mail-thickness-pair,table.production-overview-grid [data-mixed-grid]>.mail-phr-group{min-width:0;display:flex!important;flex-wrap:wrap;align-items:center;justify-content:center;padding:3px!important;border:1px solid #d1dfd4;border-radius:4px;box-sizing:border-box}table.production-overview-grid [data-mixed-overflow="1"]{background:#fff5ef!important;border-top:1px dashed #c58463!important}table.production-overview-grid [data-mixed-overflow="1"]:before{content:"นอกช่องแผน";font-size:9px;color:#926443;width:100%;text-align:center}table.production-overview-grid [data-mixed-source-hidden="1"]{display:none!important}table.production-overview-grid [data-mixed-hours-mirror]{display:block;margin-top:3px}';(document.head||document.documentElement).appendChild(style);
    style.textContent+='table.production-overview-grid td[data-mixed-metric] .mail-quantity-stack{display:flex!important;width:100%;min-width:0;box-sizing:border-box}table.production-overview-grid [data-mixed-grid]>.mail-phr-group{flex-direction:column;align-items:stretch}table.production-overview-grid [data-mixed-grid] .mail-phr-pair{min-width:0;max-width:100%;flex-wrap:wrap;justify-content:center}table.production-overview-grid [data-mixed-grid] .mail-inline-presses{display:block!important;width:100%;text-align:center;margin:3px 0 0!important}table.production-overview-grid [data-mixed-repeat-label]:before{content:attr(data-mixed-repeat-label);display:block;width:100%;font-size:9px;color:#607184;text-align:center}';
    style.textContent+='html body #main table.production-overview-grid td[data-mixed-metric] .mail-quantity-total{display:flex!important;flex-wrap:nowrap!important;align-items:baseline;justify-content:center;gap:4px;width:100%;box-sizing:border-box}html body #main table.production-overview-grid td[data-mixed-metric] .mail-quantity-total>*{flex:0 0 auto!important;width:auto!important;white-space:nowrap}html body #main table.production-overview-grid td[data-mixed-metric] .mail-quantity-total .mail-inline-metric-stack,html body #main table.production-overview-grid td[data-mixed-metric] .mail-quantity-total .mail-inline-actual{display:inline-flex!important;width:auto!important;justify-self:auto!important;margin:0!important}html body #main table.production-overview-grid .mail-hours-unplanned .mail-thickness-pair[data-mixed-overflow="1"]{flex-wrap:wrap!important;max-width:100%;min-width:0}html body #main table.production-overview-grid .mail-hours-unplanned [data-mixed-overflow="1"]:before{display:block;flex-basis:100%}';
    style.textContent+='html body #main table.production-overview-grid tr[data-mail-plan-metric="hours"] td[data-mixed-hours-cell]{overflow:visible!important;white-space:normal!important;padding-left:2px!important;padding-right:2px!important}html body #main table.production-overview-grid tr[data-mail-plan-metric="hours"] td[data-mixed-hours-cell] input.pv-input.pv-hr,html body #main table.production-overview-grid tr[data-mail-plan-metric="hours"] td[data-mixed-hours-cell] input.pv-hr{box-sizing:border-box!important;width:clamp(36px,36%,42px)!important;min-width:36px!important;max-width:42px!important;padding:1px 2px!important;margin-right:1px!important;font-size:10px!important;font-variant-numeric:tabular-nums!important;letter-spacing:0!important;text-align:center!important;vertical-align:baseline}html body #main table.production-overview-grid tr[data-mail-plan-metric="hours"] [data-mail-inline-metric="hours-run"]{display:inline!important;min-width:0!important;max-width:100%!important}html body #main table.production-overview-grid tr[data-mail-plan-metric="hours"] .mail-hour-run-actual{display:inline-flex!important;align-items:baseline;gap:1px;max-width:100%;vertical-align:baseline;white-space:nowrap!important}html body #main table.production-overview-grid tr[data-mail-plan-metric="hours"] .mail-inline-actual,html body #main table.production-overview-grid tr[data-mail-plan-metric="hours"] .mail-inline-actual b{white-space:nowrap!important;font-size:10px!important;letter-spacing:0!important;padding-left:0!important;padding-right:0!important}html body #main table.production-overview-grid tr[data-mixed-hours-totals]>th,html body #main table.production-overview-grid tr[data-mixed-hours-totals]>td{padding:2px 3px!important;font-size:10px!important;line-height:1.25!important}html body #main table.production-overview-grid tr[data-mixed-hours-totals] .mail-hours-day-total{display:flex!important;align-items:baseline;justify-content:center;flex-wrap:wrap;gap:3px;width:100%;margin:0!important;box-sizing:border-box;white-space:normal!important}html body #main table.production-overview-grid tr[data-mixed-hours-totals] .mail-inline-metric-stack,html body #main table.production-overview-grid tr[data-mixed-hours-totals] .mail-inline-actual{display:inline-flex!important;flex:0 0 auto;align-items:baseline;white-space:nowrap!important;margin:0!important;width:auto!important}';
    style.textContent+='html body #main table.production-overview-grid tr[data-mixed-hours-totals] [data-mixed-hours-value="known"],html body #main table.production-overview-grid tr[data-mixed-hours-totals] [data-mixed-hours-value="known"] *{color:#087b4c!important}html body #main table.production-overview-grid tr[data-mixed-hours-totals] [data-mixed-hours-value="unknown"],html body #main table.production-overview-grid tr[data-mixed-hours-totals] [data-mixed-hours-value="unknown"] *{color:#53697a!important}';
    style.textContent+='html body #main table.production-overview-grid tr[data-mail-plan-metric="hours"] td[data-mixed-hours-cell] input.pv-hr{appearance:textfield!important;-moz-appearance:textfield!important}html body #main table.production-overview-grid tr[data-mail-plan-metric="hours"] td[data-mixed-hours-cell] input.pv-hr::-webkit-inner-spin-button,html body #main table.production-overview-grid tr[data-mail-plan-metric="hours"] td[data-mixed-hours-cell] input.pv-hr::-webkit-outer-spin-button{-webkit-appearance:none!important;margin:0!important}';
    style.textContent+='html body #main table.production-overview-grid tr[data-mixed-hours-totals] .mail-hours-day-total{width:100%!important;min-width:0!important;max-width:none!important;text-align:center!important}';
    style.textContent+='html body #main table.production-overview-grid tr[data-mail-plan-metric="hours"] .mail-hour-run-actual>.mail-inline-slash{padding:0!important;margin:0!important;min-width:0!important;width:auto!important}';
    observer=typeof MutationObserver==='undefined'?null:new MutationObserver(schedule);attach();
    document.addEventListener('input',function(event){var input=event.target;if(!input||!input.matches('input.pv-thk'))return;editing.add(input);var table=input.closest('table.production-overview-grid');if(!table)return;contexts(table).filter(function(ctx){return ctx.inputs.indexOf(input)>=0;}).forEach(function(ctx){applyContext(ctx,true);});});
    document.addEventListener('change',function(event){if(event.target&&event.target.matches('input.pv-thk')){editing.delete(event.target);schedule();}});schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
