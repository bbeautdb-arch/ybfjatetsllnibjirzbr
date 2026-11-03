import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8');
const clone=v=>JSON.parse(JSON.stringify(v));
const area=1220*2440,calculate=r=>({price:2,curr:'THB',eq:r.qty*Number(r.w)*Number(r.l)/area*Number(r.t)/2.5,value:r.qty*2,freeValue:r.freeQty*2});
const row=(key,extra={})=>({key,sku:key,desc:'Synthetic catalog',size:'Normal',w:1220,l:2440,t:'1.60',grade:'AAA',unit:'sheet',qty:0,committedQty:0,freeQty:0,baseQty:0,d90:0,d180:0,d270:0,d360:0,dOver:0,note:'preserved draft source',...extra});
function data(){return {report:{reportDate:'2026-11-01',sourceRowCount:15},revision:8,exchangeRate:30,rows:[
  row('synthetic-short',{qty:10,committedQty:15,baseQty:10,d90:7,d180:3}),
  row('synthetic-spare',{w:610,l:1220,t:1.6,qty:20,freeQty:18,baseQty:20,d90:20,freeOverride:{value:18}}),
  row('synthetic-retained-A',{grade:'A',retained:true,baseQty:9,d90:6,d180:3}),
  row('synthetic-strip-B',{grade:'B',w:25,l:1000,unit:'strip',qty:100,committedQty:25,freeQty:75,baseQty:100,d90:100}),
  ...['AV','F','REJ','C','UN','CTS','ZETA','ALPHA'].map(grade=>row('synthetic-zero-'+grade,{grade,retained:true})),
  row('synthetic-derived-B',{grade:'B',rawSource:false,baseQty:99,d90:99}),
  row('synthetic-other-thickness',{t:2.5,grade:'B',qty:7,freeQty:7,baseQty:7,d90:7}),
  row('synthetic-hidden-thickness',{t:6,grade:'AAA',retained:true})
]};}
const table=html=>[...html.matchAll(/<section class="ss-group">[\s\S]*?<\/section>/g)][1][0];
const childBody=(html,key)=>html.match(new RegExp('<tbody class="ss-thickness-grades" id="ss-thickness-grades-'+key.replaceAll('.','_')+'"([^>]*)>([\\s\\S]*?)<\\/tbody>'));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
function runtime(){
  let html='',writes=0,exported='',resolveFonts;
  const events={},buttons=new Map(),bodies=new Map(),productionButtons=new Map(),productionPanels=new Map(),downloads={},status={textContent:''};
  const root={classList:{remove(){}},addEventListener(type,fn){(events[type]??=[]).push(fn);},querySelectorAll:()=>[],
    get innerHTML(){return html;},set innerHTML(value){html=value;writes++;buttons.clear();bodies.clear();productionButtons.clear();productionPanels.clear();
      for(const match of value.matchAll(/<button type="button" class="ss-thickness-toggle"[^>]*data-thickness-toggle="([^"]+)"[^>]*aria-expanded="([^"]+)"[^>]*aria-controls="([^"]+)"[^>]*aria-label="([^"]+)"/g)){
        const attrs={'aria-expanded':match[2],'aria-controls':match[3],'aria-label':match[4]},marker={textContent:match[2]==='true'?'▾':'▸'};
        const button={dataset:{thicknessToggle:match[1]},getAttribute:k=>attrs[k],setAttribute(k,v){attrs[k]=v;},querySelector:s=>s==='.ss-thickness-marker'?marker:null,closest:s=>s==='[data-thickness-toggle]'?button:null};
        buttons.set(match[1],button);
      }
      for(const match of value.matchAll(/<tbody class="ss-thickness-grades" id="([^"]+)"([^>]*)>/g))bodies.set(match[1],{hidden:match[2].includes('hidden')});
      for(const match of value.matchAll(/<button type="button" class="ss-production-toggle"[^>]*data-thickness-production-toggle="([^"]+)"[^>]*aria-expanded="([^"]+)"[^>]*aria-controls="([^"]+)"[^>]*aria-label="([^"]+)"/g)){
        const attrs={'aria-expanded':match[2],'aria-controls':match[3],'aria-label':match[4]},button={dataset:{thicknessProductionToggle:match[1]},getAttribute:k=>attrs[k],setAttribute(k,v){attrs[k]=v;},closest:s=>s==='[data-thickness-production-toggle]'?button:null};productionButtons.set(match[1],button);
      }
      for(const match of value.matchAll(/<div class="ss-thickness-production" id="([^"]+)"([^>]*)>/g))productionPanels.set(match[1],{hidden:match[2].includes('hidden')});
    },querySelector(selector){if(selector==='.ss-download')return{addEventListener(type,fn){downloads[type]=fn;}};if(selector==='.ss-status')return status;if(selector.startsWith('#ss-thickness-grades-'))return bodies.get(selector.slice(1));if(selector.startsWith('#ss-thickness-production-'))return productionPanels.get(selector.slice(1));return null;}};
  const window={html2canvas:async sheet=>({toBlob:fn=>fn({type:'image/png'})})};
  const document={getElementById:()=>root,head:{append(){}},fonts:{ready:new Promise(resolve=>{resolveFonts=resolve;})},body:{append(node){exported=node.innerHTML;}},createElement(tag){
    if(tag==='div')return {dataset:{},style:{},innerHTML:'',querySelectorAll:()=>[],querySelector:()=>({getBoundingClientRect:()=>({width:1440,height:2000})}),remove(){}};
    if(tag==='a')return{click(){}};return{};
  }};
  vm.runInNewContext(source,{window,document,location:{hash:''},URL:{createObjectURL:()=> 'synthetic-blob',revokeObjectURL(){}},setTimeout(){}});
  return {api:window.AAFStockSummary,buttons,bodies,productionButtons,productionPanels,get html(){return html;},get writes(){return writes;},get exported(){return exported;},resolveFonts,
    click(key,nested=false){const button=buttons.get(key);assert.ok(button,'visible thickness button '+key);const target=nested?{closest:s=>button.closest(s)}:button;for(const fn of events.click||[])fn({target});},
    clickProduction(key){const button=productionButtons.get(key);assert.ok(button,'production button '+key);for(const fn of events.click||[])fn({target:button});},
    download:()=>downloads.click()};
}

test('compact summary removes duplicated chrome without removing quantity meaning or source bindings',()=>{
  const h=runtime(),input=data(),before=JSON.stringify(input),m=h.api.buildModel(input,calculate),html=h.api.renderHTML(m);
  assert.match(html,/<p class="ss-overview-source" hidden>/);
  assert.match(html,/<p class="ss-sales-summary-source" role="status" hidden>/);
  assert.doesNotMatch(html,/เทียบ 4×8 ใช้ขนาด 1,220 × 2,440/);
  assert.doesNotMatch(html,/ใช้เดือนปัจจุบันตามเวลาไทย และชุดหน้า 09 เดียวกับกล่อง/);
  assert.match(html,/จองรวม = จองมีของ \+ จองต้องผลิตเพิ่ม/);
  assert.match(html,/Physical − จองมีของ = Free/);
  assert.match(html,/ภาพรวมรายการขาย · เลือกเดือน/);
  assert.doesNotMatch(html,/bbeautdb-arch\.github\.io\/ybfjatetsllnibjirzbr\/stock_manager\.html/);
  assert.match(html,/แหล่งข้อมูล: Stock AAF ส่วนกลาง/);
  assert.match(source,/dailySource\.textContent=overviewSourceText\(latest\)/);
  assert.equal(JSON.stringify(input),before);
  assert.equal(m.total.count,input.rows.length);
});

test('grade details reuse exact-spec aggregation, retain zero grades and raw Aging, and never merge raw sheet/strip quantities',()=>{
  const h=runtime(),input=data(),before=JSON.stringify(input),m=h.api.buildModel(input,calculate),groups=new Map(m.thicknessGrades),grades=groups.get('1.6');
  assert.deepEqual(Array.from(grades,([g])=>g),['AV','AAA','A','B','F','REJ','C','UN','CTS','ALPHA','ZETA']);
  assert.deepEqual(Array.from(groups.get('2.5'),([g])=>g),['B'],'do not invent absent grades');
  const aaa=grades.find(([g])=>g==='AAA')[1],a=grades.find(([g])=>g==='A')[1],b=grades.find(([g])=>g==='B')[1];
  assert.equal(aaa.count,2);assert.equal(aaa.byUnit.sheet.qty,30);assert.equal(aaa.byUnit.sheet.committedQty,15);
  assert.equal(aaa.byUnit.sheet.reservedInStockQty,10);assert.equal(aaa.byUnit.sheet.reservedProductionQty,5,'spare different size cannot fill shortage');assert.equal(aaa.byUnit.sheet.freeQty,18,'saved manual Free is untouched');
  assert.equal(a.count,1);assert.equal(a.qty,0);assert.equal(a.aging90,6);assert.equal(a.aging180,3,'zero Physical retains original Aging');
  assert.equal(b.byUnit.sheet.qty,0);assert.equal(b.byUnit.strip.qty,100);assert.equal(b.byUnit.strip.reservedInStockQty,25);assert.equal(b.aging90,100,'derived rows cannot fabricate raw Aging');
  const parent=m.thickness.find(([t])=>t==='1.6')[1];
  for(const field of Object.keys(parent).filter(k=>k!=='byUnit'))near(grades.reduce((n,[,g])=>n+g[field],0),parent[field]);
  for(const unit of ['sheet','strip'])for(const field of Object.keys(parent.byUnit[unit]))near(grades.reduce((n,[,g])=>n+g.byUnit[unit][field],0),parent.byUnit[unit][field]);
  assert.equal(JSON.stringify(input),before);assert.equal(m.total.count,input.rows.length,'children do not enter totals a second time');
});

test('native accessible buttons control immediately following grade rows; parent filter,12 columns and single totals stay unchanged',()=>{
  const h=runtime(),m=h.api.buildModel(data(),calculate),html=table(h.api.renderHTML(m));
  assert.match(html,/<tr data-thickness-parent="1\.6"><th scope="row"><button type="button"/);
  assert.match(html,/data-thickness-toggle="1\.6" aria-expanded="false" aria-controls="ss-thickness-grades-1_6"/);
  assert.match(html,/<\/tr><\/tbody><tbody class="ss-thickness-grades" id="ss-thickness-grades-1_6" hidden>/);
  assert.match(childBody(html,'1.6')[2],/data-grade="A"><th scope="row">1\.6 A<\/th>/);
  assert.equal((html.match(/data-thickness-parent=/g)||[]).length,2);assert.doesNotMatch(html,/data-thickness-parent="6"/,'all-zero thickness top-row filter stays unchanged');
  assert.equal(m.thickness.some(([t])=>t==='6'),true,'filtered thickness is still retained in catalog');
  for(const match of html.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g))for(const row of match[1].matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)){
    if(row[1].includes('data-thickness-production-control')){assert.match(row[2],/^<td colspan="12">/);continue;}
    assert.equal((row[2].match(/<(?:th|td)\b/g)||[]).length,12);
  }
  assert.equal((html.match(/<tfoot>/g)||[]).length,1);assert.equal((html.match(/<th scope="row">รวม<\/th>/g)||[]).length,1);
  assert.match(html,/แถวเกรดเป็นส่วนย่อย ไม่บวกซ้ำกับยอดรวม/);assert.match(html,/พิมพ์\/ดาวน์โหลดตามแถวที่เปิดไว้/);
  assert.doesNotMatch(html,/>130(?: แผ่น)?</,'no raw sheet+strip sum is displayed');
});

test('targeted toggles keep multiple thicknesses open across saved refresh, without resetting editors or rewriting report DOM',()=>{
  const h=runtime(),input=data(),before=JSON.stringify(input);h.api.update(input,calculate);const writes=h.writes;
  h.click('1.6',true);assert.equal(h.buttons.get('1.6').getAttribute('aria-expanded'),'true');assert.equal(h.bodies.get('ss-thickness-grades-1_6').hidden,false);
  assert.equal(h.buttons.get('1.6').querySelector('.ss-thickness-marker').textContent,'▾');
  h.click('2.5');assert.equal(h.bodies.get('ss-thickness-grades-2_5').hidden,false);assert.equal(h.writes,writes,'toggle only changes hidden/ARIA, not root/editor DOM');
  h.click('1.6');assert.equal(h.bodies.get('ss-thickness-grades-1_6').hidden,true);assert.equal(h.bodies.get('ss-thickness-grades-2_5').hidden,false);
  h.click('1.6');const refreshed=clone(input);refreshed.revision++;refreshed.rows.forEach(r=>{if(Number(r.t)===1.6)r.t='1.600';});refreshed.rows.push(row('new-retained-grade',{grade:'NEW',retained:true}));
  h.api.update(refreshed,calculate);assert.equal(h.buttons.get('1.6').getAttribute('aria-expanded'),'true');assert.equal(h.buttons.get('2.5').getAttribute('aria-expanded'),'true');
  assert.equal(h.bodies.get('ss-thickness-grades-1_6').hidden,false);assert.match(h.html,/data-grade="NEW"/);assert.equal(JSON.stringify(input),before);
  assert.equal(h.api.buildModel(refreshed,calculate).total.count,refreshed.rows.length);
});

test('PNG captures expansion at click time; collapsed print/export defaults stay hidden, with labels and totals intact',async()=>{
  const h=runtime(),input=data();h.api.update(input,calculate);
  assert.match(childBody(h.html,'1.6')[1],/hidden/);assert.match(childBody(h.html,'2.5')[1],/hidden/);
  h.click('1.6');const pending=h.download();h.click('2.5');h.resolveFonts();await pending;
  const exported=table(h.exported);assert.doesNotMatch(childBody(exported,'1.6')[1],/hidden/);assert.match(childBody(exported,'2.5')[1],/hidden/,'PNG uses frozen expansion, not later click');
  assert.match(exported,/<span>1\.6<\/span><\/button>/,'thickness label is part of export');
  assert.equal(exported.match(/<tfoot>[\s\S]*?<\/tfoot>/)[0],table(h.html).match(/<tfoot>[\s\S]*?<\/tfoot>/)[0]);
  assert.match(source,/\.ss-thickness-grades\[hidden\]\{display:none!important\}/);assert.match(source,/@media print\{[^}]*\.ss-thickness-marker\{display:none\}/);
  assert.doesNotMatch(exported,/<button[^>]*data-thickness-toggle[^>]*data-html2canvas-ignore/);
});

test('unknown grade order is deterministic and untrusted labels cannot add markup or attributes',()=>{
  const h=runtime(),input=data();input.rows.push(row('synthetic-escaped',{grade:'"><img src=x onerror=bad()>',retained:true}));
  const m=h.api.buildModel(input,calculate),html=table(h.api.renderHTML(m));
  assert.match(html,/&quot;&gt;&lt;img src=x onerror=bad\(\)&gt;/);assert.doesNotMatch(html,/<img src=x/);
  const reversed=h.api.buildModel({...input,rows:[...input.rows].reverse()},calculate);
  assert.deepEqual(Array.from(m.thicknessGrades.find(([t])=>t==='1.6')[1],([g])=>g),Array.from(reversed.thicknessGrades.find(([t])=>t==='1.6')[1],([g])=>g));
});

test('saved production detail uses positive exact-spec shortages, zero Physical rows, fractions and separate units without another allocation',()=>{
  const h=runtime(),input=data();input.rows.push(
    row('synthetic-F-short-large',{grade:'F',w:1200,l:2400,committedQty:8.25}),
    row('synthetic-F-short-small',{grade:'F',w:610,l:1220,committedQty:12}),
    row('synthetic-B-strip-short',{grade:'B',unit:'strip',w:25,l:800,committedQty:7.5}),
    row('synthetic-reversed-alias',{grade:'F',w:2400,l:1200,retained:true})
  );
  const before=JSON.stringify(input),m=h.api.buildModel(input,calculate),result=h.api.buildThicknessProduction(m,'1.6');
  assert.equal(result.status,'saved-plan');assert.deepEqual(Array.from(result.grades,g=>g.grade),['AAA','B','F']);
  assert.equal(result.byUnit.sheet,25.25);assert.equal(result.byUnit.strip,7.5);assert.equal(result.fractional,true);
  const f=result.grades.find(g=>g.grade==='F');assert.equal(f.byUnit.sheet,20.25);assert.deepEqual(Array.from(f.specs,r=>[r.w,r.l,r.qty]),[[610,1220,12],[1200,2400,8.25]]);
  assert.equal(result.grades.find(g=>g.grade==='AAA').byUnit.sheet,5,'different-size spare is not netted against shortage');
  const html=childBody(table(h.api.renderHTML(m,new Set(['1.6']),new Set(['1.6']))),'1.6')[2];
  assert.match(html,/25\.25 แผ่น · 7\.5 ชิ้นไม้แถบ/);assert.match(html,/1,200 × 2,400 มม./);assert.match(html,/8\.25 แผ่น/);assert.match(html,/ยังไม่ปัดเป็นคำสั่งผลิต/);assert.doesNotMatch(html,/data-production-grade="A"/);
  assert.equal(JSON.stringify(input),before);assert.equal(m.total.count,input.rows.length);
});

test('production detail fails visibly pending for unknown or mismatched inputs rather than fabricating zero',()=>{
  const h=runtime(),base=h.api.buildModel(data(),calculate);
  for(const mutate of [m=>m.rows[0].unit='unknown',m=>m.rows[0].reservedProductionQty=null,m=>m.rows[0].reservedProductionQty=NaN,m=>m.rows[0].qty=-1,m=>delete m.rows[0].committedQty,m=>m.rows[0].w=null,m=>m.rows.push({...m.rows[0]}),m=>m.thickness[0][1].byUnit.sheet.reservedProductionQty++,m=>m.thicknessGrades[0][1][1][1].byUnit.sheet.reservedProductionQty++,m=>m.thicknessGrades[0][1][0]=m.thicknessGrades[0][1][1],m=>m.reportDate='unknown']){
    const m=clone(base);mutate(m);const result=h.api.buildThicknessProduction(m,'1.6');assert.equal(result.status,'pending');assert.equal(result.byUnit,null);assert.equal(result.grades.length,0);
    const html=childBody(table(h.api.renderHTML(m,new Set(['1.6']),new Set(['1.6']))),'1.6')[2];assert.match(html,/ยังยืนยันรายการต้องผลิตเพิ่มไม่ได้/);assert.doesNotMatch(html,/data-production-grade=/);
  }
  for(const qty of [0.125,0.004,0.000000001]){
    const input=data();input.rows.push(row('synthetic-finer-than-cent',{grade:'F',committedQty:qty}));const m=h.api.buildModel(input,calculate);
    assert.equal(h.api.buildThicknessProduction(m,'1.6').status,'pending','do not round a finer positive shortage or show it as zero');
    assert.match(childBody(table(h.api.renderHTML(m)),'1.6')[2],/ไม่ปัดยอดหรือใช้ศูนย์แทน/);
  }
});

test('production detail labels saved date/revision/scope and cutoff uncertainty, and distinguishes a verified empty saved plan',()=>{
  const h=runtime(),input=data();input.sellablePlan={checksum:'sha256:'+'a'.repeat(64),source:{capturedAt:'2026-11-01T01:00:00Z'}};
  const m=h.api.buildModel(input,calculate),html=childBody(table(h.api.renderHTML(m,new Set(['1.6','2.5']),new Set(['1.6','2.5']))),'1.6')[2];
  assert.match(html,/รุ่น 8/);assert.match(html,/อ่านต้นทางแผน/);assert.match(html,/รวมภาระทุกเดือนในแผนที่บันทึก/);assert.match(html,/ยังรอยืนยันสต๊อกล่าสุด\/จุดตัดรายงาน/);assert.match(html,/ไม่ใช่ยอดผลิตล่าสุดที่ยืนยันแล้ว/);
  assert.equal(h.api.buildThicknessProduction(m,'2.5').status,'saved-plan');assert.equal(h.api.buildThicknessProduction(m,'2.5').grades.length,0);
  const empty=childBody(table(h.api.renderHTML(m,new Set(['2.5']),new Set(['2.5']))),'2.5')[2];assert.match(empty,/ไม่มีรายการต้องผลิตเพิ่มสำหรับความหนา 2\.5 มม. ตามแผนที่บันทึก/);
  m.reservationPlan={capturedAt:'invalid',checksum:null};assert.match(childBody(table(h.api.renderHTML(m)),'1.6')[2],/หลักฐานระบุชุดแผนยังไม่ครบ/);
});

test('second native production button is inside grade detail, independently toggles without DOM/editor replacement and survives canonical refresh',()=>{
  const h=runtime(),input=data();h.api.update(input,calculate);const writes=h.writes,button=h.productionButtons.get('1.6');
  assert.match(childBody(table(h.html),'1.6')[2],/data-thickness-production-control="1\.6"><td colspan="12">/);
  assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(button.getAttribute('aria-controls'),'ss-thickness-production-1_6');
  h.clickProduction('1.6');assert.equal(h.productionPanels.get('ss-thickness-production-1_6').hidden,true,'cannot open before grade view');
  h.click('1.6');h.clickProduction('1.6');assert.equal(h.productionButtons.get('1.6'),button);assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(h.productionPanels.get('ss-thickness-production-1_6').hidden,false);
  h.click('2.5');h.clickProduction('2.5');assert.equal(h.productionPanels.get('ss-thickness-production-2_5').hidden,false);
  h.click('1.6');assert.equal(h.bodies.get('ss-thickness-grades-1_6').hidden,true);h.click('1.6');assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(h.productionPanels.get('ss-thickness-production-1_6').hidden,false);assert.equal(h.writes,writes);
  const refresh=clone(input);refresh.revision++;refresh.rows.forEach(r=>{if(Number(r.t)===1.6)r.t='1.600';});h.api.update(refresh,calculate);
  assert.equal(h.productionButtons.get('1.6').getAttribute('aria-expanded'),'true');assert.equal(h.productionButtons.get('2.5').getAttribute('aria-expanded'),'true');
  h.clickProduction('1.6');assert.equal(h.productionPanels.get('ss-thickness-production-1_6').hidden,true);assert.equal(h.productionButtons.get('2.5').getAttribute('aria-expanded'),'true');
  assert.doesNotMatch(source,/addEventListener\(['"]keydown/,'native button Enter/Space must not double-toggle');
});

test('print and PNG respect both frozen expansion sets and never add shortage detail into parent totals',async()=>{
  const h=runtime();h.api.update(data(),calculate);h.click('1.6');h.clickProduction('1.6');const before=table(h.html).match(/<tfoot>[\s\S]*?<\/tfoot>/)[0];
  const pending=h.download();h.clickProduction('1.6');h.click('2.5');h.clickProduction('2.5');h.resolveFonts();await pending;
  const html=table(h.exported);assert.match(html,/<div class="ss-thickness-production" id="ss-thickness-production-1_6">/);assert.match(html,/<div class="ss-thickness-production" id="ss-thickness-production-2_5" hidden>/);assert.match(childBody(html,'2.5')[1],/hidden/);
  assert.equal(html.match(/<tfoot>[\s\S]*?<\/tfoot>/)[0],before);assert.match(source,/\.ss-thickness-production\[hidden\]\{display:none!important\}/);assert.match(source,/@media print\{[^}]*\.ss-thickness-production-tools\{display:none\}/);
  assert.match(source,/width:min\(100%,calc\(100cqw - 24px\)\)/,'panel fits viewport of table scroller, not the wide 12-column table');
});
