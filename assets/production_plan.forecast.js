/* AAF production_plan — forecast add-on (visual + read-only maths).
 * Wraps the page's own productionSummaryActualCardMarkup(card). Uses ONLY values the page already computed:
 *   productionSummaryDailyPlan()   the page's own per-day/per-line plan (eq25, known) -> cumulative target through the LAST REPORTED day
 *                                  (same sum v139 uses for targetTodayEq25, just stopped at card.pace.coverage.latestReportedDate)
 *   card.actual.eq25               reported actual, 2.5-equivalent sheets (existing)
 *   card.plan.eq25 (known)         month plan, 2.5-equivalent sheets (existing)
 *   card.pace.estimatedMonthEndEq25 = actual + averageDailyEq25 * forecastAvailableDays (existing, was never displayed)
 *   card.pace.requiredPerDay / card.pace.averageDailyEq25  (existing) -> % increase shown inside the original "ต้องทำเฉลี่ย" box
 *   card.pace.provisional / card.plan.incomplete / card.pace.coverage.latestReportedDate / card.pace.calendar (existing)
 * No new formula for rate/remaining days. Does not touch plan data, save, or any input. Fails safe: on any anchor mismatch the original card is returned untouched.
 */
(function(){
  'use strict';
  if(window.__aafForecastAddon)return;window.__aafForecastAddon=true;
  var css='.production-pace-row b.pace-actual{color:#1A4D32;font-weight:800}.production-pace-row b.pace-target{color:#355066;font-style:italic;font-weight:600}.production-pace-sub{text-align:right;font-size:11px;font-weight:600;margin:-2px 0 4px}.production-pace-focus-pct{font-size:11px;font-weight:600;margin:1px 0 2px;line-height:1.4}.production-pace-forecast{border:1px solid #c8dae8;border-radius:8px;background:rgba(241,247,251,.72);padding:8px 10px;margin:9px 0}.production-pace-ftitle{font-weight:700;color:#243e56;margin-bottom:4px}.production-pace-note{font-size:10px;color:#607184;margin-top:4px}.production-summary-pace small{font-weight:400}';
  var st=document.createElement('style');st.setAttribute('data-aaf-forecast','css');st.textContent=css;(document.head||document.documentElement).appendChild(st);
  var fin=function(n){return typeof n==='number'&&isFinite(n);};
  var f=function(n){return fin(n)?(typeof num==='function'?num(n,2):n.toFixed(2)):'—';};
  var pc=function(n){return fin(n)?(typeof num==='function'?num(n,1):n.toFixed(1))+'%':'—';};
  var tone=function(n){return n===null?'':n<-1e-6?'is-behind':n>1e-6?'is-ahead':'';};
  var dm=function(iso){return Number(iso.slice(8))+'/'+Number(iso.slice(5,7));};
  function row(label,valueHtml,cls){var d=document.createElement('div');d.className='production-pace-row'+(cls?' '+cls:'');d.innerHTML='<span>'+label+'</span><b>'+valueHtml+'</b>';return d;}
  function enhance(html,card){
    var p=card&&card.pace;if(!p||!card.actual)return html;
    var t=document.createElement('template');t.innerHTML=html;
    var sec=t.content.querySelector('.production-summary-pace');if(!sec)return html;
    var rows=[].slice.call(sec.querySelectorAll('.production-pace-row'));
    var targetRow=rows.filter(function(r){return /^เป้าสะสมถึง/.test(r.firstChild.textContent);})[0];
    var gapRow=sec.querySelector('.production-pace-gap'),status=sec.querySelector('.production-pace-status');
    var focus=sec.querySelector('.production-pace-focus');
    if(!targetRow||!gapRow||!status||!focus)return html; // v139 anchors not found -> leave untouched
    var repIso=p.coverage&&p.coverage.latestReportedDate?p.coverage.latestReportedDate:null,T=null,tProv=false;
    if(repIso&&typeof window.productionSummaryDailyPlan==='function'&&card.plan&&card.plan.known===true){
      var repDay=Number(repIso.slice(8)),members=card.key==='all'?['Line 1','Line 2','Line 3']:[card.key],ok=true,sum=0;
      window.productionSummaryDailyPlan().forEach(function(d){
        if(d.day>repDay)return;
        members.forEach(function(m){var r=d.lines.filter(function(x){return x.line===m;});
          if(r.length!==1||!fin(r[0].eq25)){ok=false;return;}
          sum+=r[0].eq25;if(r[0].known!==true)tProv=true;});
      });
      if(ok)T=sum;
    }
    var A=fin(card.actual.eq25)?card.actual.eq25:null;
    var plan=card.plan&&card.plan.known===true&&fin(card.plan.eq25)?card.plan.eq25:null,est=fin(p.estimatedMonthEndEq25)?p.estimatedMonthEndEq25:null;
    var gap=T!==null&&A!==null?A-T:null,pct=gap!==null&&T>0?A/T*100:null;
    var fgap=est!==null&&plan!==null?est-plan:null,fpct=fgap!==null&&plan>0?est/plan*100:null;
    var planInc=!!(card.plan&&card.plan.incomplete),mstar=(p.provisional||planInc)?'*':'';
    var rep=repIso?dm(repIso):null;
    targetRow.querySelector('b').classList.add('pace-target');
    if(rep&&T!==null){targetRow.firstChild.textContent='เป้าสะสมถึง '+rep;targetRow.querySelector('b').textContent=f(T)+(tProv?'*':'');}
    var actualRow=row('ผลิตจริงสะสม'+(rep?' <small>(รายงานถึง '+rep+')</small>':''),f(A));actualRow.querySelector('b').classList.add('pace-actual');
    targetRow.after(actualRow);
    gapRow.className='production-pace-row production-pace-gap '+tone(gap);
    gapRow.querySelector('b').textContent=gap===null?'รอข้อมูลครบ*':(gap>0?'นำเป้า +':gap<0?'ต่ำกว่าเป้า −':'ตามเป้า ')+f(Math.abs(gap));
    if(pct!==null){var s1=document.createElement('div');s1.className='production-pace-sub '+tone(gap);s1.textContent='ทำได้ '+pc(pct)+' ของเป้าสะสม';gapRow.after(s1);}
    var rq=fin(p.requiredPerDay)?p.requiredPerDay:null,av=fin(p.averageDailyEq25)?p.averageDailyEq25:null;
    if(rq!==null&&av>0){
      var dd=rq-av,sg=dd>1e-6?'+':dd<-1e-6?'−':'';
      var s3=document.createElement('div');s3.className='production-pace-focus-pct '+(dd>1e-6?'is-behind':'is-ahead');
      s3.textContent=sg+pc(Math.abs(dd)/av*100)+' จากเดิม';
      var strong=focus.querySelector('strong');
      if(strong)strong.after(s3);else focus.appendChild(s3);
    }
    var box=document.createElement('div');box.className='production-pace-forecast';
    box.innerHTML='<div class="production-pace-ftitle">ประมาณสิ้นเดือน · ถ้าความเร็วเท่าเดิม</div>';
    var r1=row('ยอดสิ้นเดือนที่คาด'+mstar,f(est));r1.querySelector('b').classList.add('pace-actual');box.appendChild(r1);
    var r2=row('เป้าทั้งเดือน'+(planInc?'*':''),f(plan));r2.querySelector('b').classList.add('pace-target');box.appendChild(r2);
    box.appendChild(row('ต่างจากเป้า',fgap===null?'—':(fgap<0?'ต่ำกว่าเป้า −':fgap>0?'เกินเป้า +':'ตามเป้า ')+f(Math.abs(fgap)),'production-pace-gap '+tone(fgap)));
    if(fpct!==null){var s2=document.createElement('div');s2.className='production-pace-sub '+tone(fgap);s2.textContent='ทำได้ '+pc(fpct)+' ของเป้าเดือน';box.appendChild(s2);}
    var n=document.createElement('div');n.className='production-pace-note';n.textContent='= จริงสะสม + เฉลี่ย/วัน × '+p.forecastAvailableDays+' วันที่เหลือ';box.appendChild(n);
    status.before(box);
    if(p.forecastStatus==='evidence-pending'&&fgap!==null){
      status.textContent=(fgap<0?'ที่ความเร็วนี้ยังไม่ทันเป้า':'ที่ความเร็วนี้ทันเป้า')+' · ชั่วคราว* (วันนี้ยังไม่มีรายงานครบ)';
      status.classList.add(fgap<0?'is-behind':'is-ahead');
    }
    return t.innerHTML;
  }
  function install(){
    var orig=window.productionSummaryActualCardMarkup;
    if(typeof orig!=='function')return false;
    if(orig.__aafForecast)return true;
    var wrapped=function(card){var h=orig(card);try{return enhance(h,card);}catch(e){try{console.warn('aaf forecast addon skipped',e);}catch(_){}return h;}};
    wrapped.__aafForecast=true;window.productionSummaryActualCardMarkup=wrapped;
    try{if(typeof window.refreshProductionSummaryActualCards==='function')window.refreshProductionSummaryActualCards();}catch(e){}
    return true;
  }
  if(!install()){var tries=0,iv=setInterval(function(){if(install()||++tries>40)clearInterval(iv);},250);}
})();
