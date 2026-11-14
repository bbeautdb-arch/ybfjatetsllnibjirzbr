/* AAF production_plan — evidence-aware, read-only pace presentation.
 * Canonical target, gap, rate and remaining days come from card.pace. The target
 * remains through the Bangkok cutoff, never through the last reported date.
 * Known actual subtotals retain report date and missing/partial coverage. An
 * incomplete report or plan never becomes a definitive pace conclusion.
 * No plan/input/save changes. Unsupported card markup is returned untouched.
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
  var isoDate=function(iso){return typeof iso==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(iso)&&isFinite(Date.parse(iso+'T00:00:00Z'))&&new Date(iso+'T00:00:00Z').toISOString().slice(0,10)===iso;};
  var dm=function(iso){return isoDate(iso)?Number(iso.slice(8))+'/'+Number(iso.slice(5,7)):'—';};
  var dateList=function(dates){var unique=dates.filter(isoDate).filter(function(d,i,a){return a.indexOf(d)===i;}).sort();return unique.slice(0,3).map(dm).join(', ')+(unique.length>3?' … (+'+(unique.length-3)+' วัน)':'');};
  function row(label,valueHtml,cls){var d=document.createElement('div');d.className='production-pace-row'+(cls?' '+cls:'');d.innerHTML='<span>'+label+'</span><b>'+valueHtml+'</b>';return d;}
  function note(text,kind){var n=document.createElement('div');n.className='production-pace-note';n.setAttribute('data-pace-note',kind);n.textContent=text;return n;}
  function coverageFacts(p){
    var c=p.coverage||{},facts=[],incomplete=false,current=p.calendar&&p.calendar.monthState==='current';
    [['missing','ขาดรายงาน'],['partial','รายงานบางส่วน'],['invalid','รอตรวจข้อมูล']].forEach(function(pair){
      var dates=c[pair[0]+'Dates'],count=fin(c[pair[0]+'Days'])?c[pair[0]+'Days']:0;
      if(count>0)incomplete=true;
      if(Array.isArray(dates)){
        var prior=dates.filter(function(d){return isoDate(d)&&(!current||!isoDate(p.today)||d<p.today);});
        if(dates.length)incomplete=true;
        if(prior.length)facts.push((current?'ก่อนวันนี้ ':'')+pair[1]+' '+dateList(prior));
      }else if(count>0)facts.push(pair[1]+' '+count+' วัน');
    });
    var today={missing:'วันนี้ยังไม่มีรายงาน',partial:'วันนี้มีข้อมูลบางส่วน',invalid:'วันนี้รอตรวจข้อมูล'}[p.todayEvidence];
    if(current&&today){facts.push(today);incomplete=true;}
    return {text:facts.join(' · '),incomplete:incomplete};
  }
  function enhance(html,card){
    var p=card&&card.pace;if(!p||!card.actual)return html;
    var t=document.createElement('template');t.innerHTML=html;
    var sec=t.content.querySelector('.production-summary-pace');if(!sec)return html;
    var rows=[].slice.call(sec.querySelectorAll('.production-pace-row'));
    var targetRow=rows.filter(function(r){return r.firstChild&&/^เป้าสะสมถึง/.test(r.firstChild.textContent);})[0];
    var gapRow=sec.querySelector('.production-pace-gap'),status=sec.querySelector('.production-pace-status');
    var focus=sec.querySelector('.production-pace-focus');
    if(!targetRow||!gapRow||!status||!focus||!targetRow.querySelector('b')||!focus.querySelector('strong'))return html;
    var c=p.coverage||{},facts=coverageFacts(p),calendar=p.calendar||{};
    var A=card.actual.status==='known-subtotal'&&fin(card.actual.eq25)?card.actual.eq25:null;
    var plan=card.plan&&card.plan.known===true&&fin(card.plan.eq25)?card.plan.eq25:null;
    var planInc=plan===null||!!card.plan.incomplete||p.planConsistent===false||(Array.isArray(p.missingPlanDates)&&p.missingPlanDates.length>0);
    var actualPartial=facts.incomplete||A===null,conditional=actualPartial||planInc||!!p.provisional;
    var T=fin(p.targetTodayEq25)?p.targetTodayEq25:null,gap=fin(p.gapTodayEq25)?p.gapTodayEq25:null;
    var rep=isoDate(c.latestProductionReportDate)?dm(c.latestProductionReportDate):null;
    targetRow.querySelector('b').classList.add('pace-target');
    targetRow.querySelector('b').textContent=f(T)+(p.targetTodayProvisional&&T!==null?'*':'');
    if(calendar.monthState==='future'){targetRow.firstChild.textContent='เป้าสะสม · ยังไม่เริ่มเดือน';targetRow.querySelector('b').textContent='—';}
    var actualRow=row('ผลิตจริงสะสมที่ทราบ'+(rep?' <small>(รายงานถึง '+rep+')</small>':''),f(A)+(actualPartial&&A!==null?'*':''));actualRow.querySelector('b').classList.add('pace-actual');
    actualRow.setAttribute('data-pace-actual','known-subtotal');
    targetRow.after(actualRow);
    var evidence=facts.text;
    if(!rep)evidence=(A===null?'ยังไม่มียอดผลิตที่ยืนยัน':'ยังไม่มีวันที่รายงานผลิต')+(evidence?' · '+evidence:'');
    if(planInc)evidence+=(evidence?' · ':'')+(plan===null?'แผนยังไม่พร้อม':Array.isArray(p.missingPlanDates)&&dateList(p.missingPlanDates)?'แผนรอตรวจ '+dateList(p.missingPlanDates):'แผนยังไม่ครบ/ยอดไม่ตรง');
    if(evidence)actualRow.after(note(evidence,'coverage'));
    // Keep the canonical gap and hidden status unchanged; never infer lead/lag
    // by subtracting a stale known subtotal from an unrelated report-date target.
    if(!conditional&&gap!==null&&T>0&&A!==null){var s1=document.createElement('div');s1.className='production-pace-sub '+tone(gap);s1.textContent='ทำได้ '+pc(A/T*100)+' ของเป้าสะสม';gapRow.after(s1);}
    var rq=fin(p.requiredPerDay)?p.requiredPerDay:null,av=fin(p.averageDailyEq25)?p.averageDailyEq25:null;
    if(A===null||plan===null){rq=null;focus.querySelector('strong').innerHTML='— <small>แผ่น / วัน</small>';}
    if(conditional&&focus.querySelector('span'))focus.querySelector('span').textContent='ต้องทำเฉลี่ย*';
    if(conditional&&rq!==null){
      focus.appendChild(note(planInc?'ประมาณจากแผนและยอดจริงที่ทราบ*':'อิงยอดจริงที่ยืนยันแล้ว* · อาจลดลงเมื่อมีรายงานเพิ่ม','required-conditional'));
    }
    if(!conditional&&rq!==null&&av>0){
      var dd=rq-av,sg=dd>1e-6?'+':dd<-1e-6?'−':'';
      var s3=document.createElement('div');s3.className='production-pace-focus-pct '+(dd>1e-6?'is-behind':'is-ahead');
      s3.textContent=sg+pc(Math.abs(dd)/av*100)+' จากค่าเฉลี่ยที่ทำได้ปัจจุบัน';
      var strong=focus.querySelector('strong');
      if(strong)strong.after(s3);else focus.appendChild(s3);
    }
    var est=fin(p.estimatedMonthEndEq25)?p.estimatedMonthEndEq25:null;
    if(!conditional&&p.planConsistent===true&&calendar.monthState==='current'&&p.forecastStatus!=='evidence-pending'&&est!==null&&plan!==null&&av>0&&fin(p.rateDays)&&p.rateDays>0){
      var box=document.createElement('div');box.className='production-pace-forecast';
      box.innerHTML='<div class="production-pace-ftitle">ประมาณสิ้นเดือน · ถ้าความเร็วเท่าเดิม</div>';
      var r1=row('ยอดสิ้นเดือนที่คาด',f(est));r1.querySelector('b').classList.add('pace-actual');box.appendChild(r1);
      var r2=row('เป้าทั้งเดือน',f(plan));r2.querySelector('b').classList.add('pace-target');box.appendChild(r2);
      box.appendChild(note('อิงวันผลิตที่รายงานครบ '+p.rateDays+' วัน · คงอัตราเดิมอีก '+(fin(p.forecastAvailableDays)?p.forecastAvailableDays:'—')+' วัน','scenario'));
      status.before(box);
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
