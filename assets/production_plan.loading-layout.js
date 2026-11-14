/* Pending departures: presentation only. Move original nodes; never recreate
 * shipment controls, infer dates, recompute quantities, or save any plan. */
(function(){
  'use strict';
  if(window.__AAF_LOADING_LAYOUT__)return;window.__AAF_LOADING_LAYOUT__=true;
  var rememberedOpen=false,scheduled=false,observer=null;
  function compactSummary(text){
    var match=String(text||'').replace(/\s+/g,' ').match(/เทียบ\s*2\.5\s+[^·]*?แผ่น/);
    return 'รอกำหนดโหลด'+(match?' · '+match[0].trim().replace(/^(เทียบ\s*2\.5)\s+(?:ยอด\s*)?/,'$1 ยอด '):'');
  }
  function ownChild(parent,tag,attribute){
    return Array.prototype.find.call(parent.children,function(node){return String(node.tagName).toLowerCase()===tag&&(!attribute||node.getAttribute(attribute)!==null);})||null;
  }
  function panel(row){
    var td=ownChild(row,'td');if(!td)return;
    var outer=ownChild(td,'details','data-aaf-loading-collapse'),body,summary;
    if(!outer){
      outer=document.createElement('details');outer.setAttribute('data-aaf-loading-collapse','1');outer.open=rememberedOpen;
      summary=document.createElement('summary');summary.setAttribute('data-aaf-loading-summary','1');
      body=document.createElement('div');body.setAttribute('data-aaf-loading-body','1');
      while(td.firstChild)body.appendChild(td.firstChild);
      outer.appendChild(summary);outer.appendChild(body);td.appendChild(outer);
      outer.addEventListener('toggle',function(){rememberedOpen=outer.open;});
    }else{
      rememberedOpen=outer.open;
      summary=ownChild(outer,'summary','data-aaf-loading-summary');body=ownChild(outer,'div','data-aaf-loading-body');
    }
    if(!summary||!body)return;
    var primary=body.querySelector('details'),source=primary?ownChild(primary,'summary'):null;
    var label=compactSummary(source?source.textContent:'');
    if(summary.textContent!==label)summary.textContent=label;
  }
  function paint(){
    document.querySelectorAll('table.production-overview-grid').forEach(function(table){
      var row=table.querySelector('tr.production-shipment-pending'),loaded=table.querySelector('tr.production-daily-loaded');
      if(!row||!loaded||row.parentNode!==loaded.parentNode)return;
      if(loaded.nextElementSibling!==row)loaded.parentNode.insertBefore(row,loaded.nextSibling);
      panel(row);
    });
  }
  function attach(){var host=document.getElementById('main')||document.body;if(observer&&host)observer.observe(host,{childList:true,subtree:true,characterData:true});}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){scheduled=false;if(observer)observer.disconnect();try{paint();}finally{attach();}});}
  function boot(){
    var style=document.createElement('style');style.setAttribute('data-aaf-loading-layout','css');
    style.textContent='html body #main table.production-overview-grid tr.production-shipment-pending>td{padding:0!important}html body #main table.production-overview-grid [data-aaf-loading-collapse]{margin:0!important;border:0!important;border-radius:0!important;background:#fffaf0!important}html body #main table.production-overview-grid [data-aaf-loading-collapse]>summary{display:list-item!important;list-style:disclosure-closed inside!important;cursor:pointer;margin:0!important;padding:5px 10px!important;color:#86501d!important;font-size:11px!important;font-weight:700!important;line-height:1.45!important;white-space:normal!important;text-align:left!important}html body #main table.production-overview-grid [data-aaf-loading-collapse][open]>summary{list-style-type:disclosure-open!important;border-bottom:1px solid #e4d7bd}html body #main table.production-overview-grid [data-aaf-loading-collapse]:not([open])>[data-aaf-loading-body]{display:none!important}html body #main table.production-overview-grid [data-aaf-loading-body]{padding:8px!important;min-width:0;max-width:100%;box-sizing:border-box}';
    (document.head||document.documentElement).appendChild(style);
    observer=typeof MutationObserver==='undefined'?null:new MutationObserver(schedule);attach();schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
