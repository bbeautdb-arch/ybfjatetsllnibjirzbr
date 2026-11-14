/* Daily production actual color only. No value, input, plan or layout writes.
 * Match existing displayed pairs; P/hr must belong to an exact-thickness group.
 * An equal rounded display or unknown target is neutral. Hours are not a target
 * achievement comparison: known actual hours stay green. */
(function(){
  'use strict';
  if(window.__AAF_ACTUAL_COLORS__)return;
  window.__AAF_ACTUAL_COLORS__=true;
  var actualSelector='.mail-inline-actual, .mail-metric-actual, .gm4-a, .gm2-ha, .gm3-ha';
  function number(el){
    if(!el)return null;
    var s=String(el.textContent||'').replace(/,/g,'').replace(/\s+/g,'').replace(/\*$/,'');
    if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(s))return null;
    var n=Number(s);return Number.isFinite(n)?n:null;
  }
  function state(goal,actual){
    if(goal===null||actual===null)return 'unknown';
    var d=actual-goal,tolerance=1e-9*Math.max(1,goal,actual);
    return Math.abs(d)<=tolerance?'equal':d<0?'below':'above';
  }
  function exactGroup(pair){
    var g=pair.closest('[data-mail-phr-thickness]');
    var raw=g&&g.getAttribute('data-mail-phr-thickness'),t=raw===null?NaN:Number(raw);
    return !!g&&Number.isFinite(t)&&t>0;
  }
  function paintRow(row){
    var table=row.closest('table'),metric=row.getAttribute('data-mail-plan-metric');
    if(!table||(!table.classList.contains('production-overview-grid')&&!table.classList.contains('preview-table'))||['qty','eq25','phr','hours'].indexOf(metric)<0)return;
    var states=new Map();
    row.querySelectorAll(actualSelector).forEach(function(a){states.set(a,metric==='hours'&&number(a)!==null?'hours':'unknown');});
    function put(a,s){if(!a)return;states.set(a,s);a.querySelectorAll(actualSelector).forEach(function(child){states.set(child,s);});}
    function pair(goal,actual){put(actual,state(number(goal),number(actual)));}
    if(metric!=='hours'){
      if(metric==='qty'||metric==='eq25'){
        row.querySelectorAll('.mail-quantity-total, .mail-thickness-pair, .mail-inline-pair, [data-mail-metric-source]').forEach(function(p){
          // A wrapper spanning several groups is not itself a matched pair.
          var actuals=p.querySelectorAll('.mail-inline-actual');
          if(actuals.length===1)pair(p.querySelector('.mail-inline-goal'),actuals[0]);
        });
      }else{
        row.querySelectorAll('.mail-phr-pair').forEach(function(p){
          if(exactGroup(p))pair(p.querySelector('.mail-inline-goal'),p.querySelector('.mail-inline-actual'));
        });
      }
      // Clarity's Eq25 grid and v6 copied lanes keep each actual directly after
      // its own goal. Never use the first target elsewhere in the day cell.
      if(metric==='qty'||metric==='eq25')row.querySelectorAll('.mail-metric-actual').forEach(function(a){
        var goal=a.previousElementSibling;
        if(goal&&goal.classList.contains('mail-metric-goal'))pair(goal,a);
      });
      row.querySelectorAll('.gm4-pair').forEach(function(p){
        var goal=p.querySelector('.gm4-p'),actual=p.querySelector('.gm4-a');
        if(metric==='phr'){
          var td=p.closest('td'),g=number(goal),a=number(actual),matched=false;
          if(td&&g!==null&&a!==null)td.querySelectorAll('.mail-phr-pair').forEach(function(source){
            if(exactGroup(source)&&number(source.querySelector('.mail-inline-goal'))===g&&number(source.querySelector('.mail-inline-actual'))===a)matched=true;
          });
          if(!matched)return; // No exact source pair: never borrow a mixed-day rate.
        }
        pair(goal,actual);
      });
    }
    states.forEach(function(s,a){if(a.getAttribute('data-aaf-actual-state')!==s)a.setAttribute('data-aaf-actual-state',s);});
  }
  function paint(){document.querySelectorAll('tr[data-mail-plan-metric]').forEach(paintRow);}
  var scheduled=false;
  function schedule(){
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(function(){scheduled=false;paint();});
  }
  function boot(){
    var host=document.getElementById('main')||document.body;
    if(host&&typeof MutationObserver!=='undefined')new MutationObserver(schedule).observe(host,{childList:true,subtree:true,characterData:true});
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
