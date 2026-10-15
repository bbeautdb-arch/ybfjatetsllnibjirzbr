import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../stock_report_export.js',import.meta.url),'utf8');
const context={window:{}};vm.runInNewContext(source,context);
const {build,createWorkbook,download}=context.window.AAFStockReportExport;
const row=(overrides={})=>({key:'1220|2440|2|F',sku:'F0012202440020',w:'1220',l:'2440',t:'2.0',grade:'F',unit:'sheet',qty:10.5,baseQty:12,committedQty:4.5,freeQty:6,d90:12,d180:0,d270:0,d360:0,dOver:0,note:'=HYPERLINK("https://bad.example")',followup:'+keep literal',...overrides});
const stock=()=>({ok:true,revision:56,report:{reportDate:'2026-10-13',checksum:'sha256:test'},updatedAt:'2026-10-13T05:00:00Z',actor:{password:'NEVER_EXPORT'},permissions:{adjust:true},exchangeRate:999,rows:[row(),row({key:'25|2052|3.2|B',sku:'CTSB0000252052032',w:25,l:2052,t:3.2,grade:'B',unit:'strip',qty:100,baseQty:100,committedQty:120,freeQty:0,d90:100}),row({key:'1220|2440|5.5|F',sku:'',t:5.5,qty:0,baseQty:0,committedQty:3,freeQty:0,d90:0,retained:true,rawSource:false})]});
const catalog=()=>({ok:true,revision:56,catalogRevision:7,stockReportDate:'2026-10-13',widgetState:{privateContent:{version:3,context:'aaf-sales-stock-preview|free-price-catalog',fx:32,savedAt:'2026-10-13T04:00:00Z',prices:{'2|F|1220|2440|sheet':35,'3.2|B|25|2052|strip':0.1},currencies:{'2|F|1220|2440|sheet':'THB','3.2|B|25|2052|strip':'USD'},notesBySpec:{'2|F|1220|2440|sheet':'@catalog note'},notesByThickness:{'2':'legacy note'}}}});
const options=()=>({catalog:catalog(),exportedAt:'2026-10-15T05:00:00Z'});
test('keeps every saved catalog row, fractional quantities, and unit-specific totals',()=>{
  const data=stock(),opts=options(),before=JSON.stringify({data,opts}),m=build(data,opts);
  assert.equal(JSON.stringify({data,opts}),before);assert.equal(m.rows.length,3);assert.equal(m.rows[2].physical,0);assert.equal(m.rows[2].reserved,3);
  assert.equal(m.totals.sheet.physical,10.5);assert.equal(m.totals.sheet.reserved,7.5);assert.equal(m.totals.sheet.free,6);
  assert.equal(m.totals.strip.physical,100);assert.equal(m.totals.strip.reserved,120);assert.equal(m.totals.strip.free,0);
  assert.equal(m.rows[0].w,'1220');assert.equal(m.rows[0].t,'2.0');assert.equal(m.rows[0].physicalValueTHB,367.5);assert.equal(m.rows[1].physicalValueTHB,320);
  assert.equal(m.fileName,'AAF_Stock_Report_2026-10-13_r56.xlsx');assert.equal(m.rows[0].specNote,'@catalog note');
  assert.ok(!JSON.stringify(m).includes('NEVER_EXPORT'));assert.ok(!JSON.stringify(m).includes('permissions'));assert.equal(m.sheets[1].data[0].length,35);
});
test('missing prices stay blank and known subtotals are not falsely complete',()=>{
  const data=stock(),opts=options();delete opts.catalog.widgetState.privateContent.prices['2|F|1220|2440|sheet'];
  data.rows[0].priceObj={price:888,currency:'THB'};
  const m=build(data,opts);assert.equal(m.rows[0].price,null);assert.equal(m.rows[0].physicalValueTHB,null);assert.equal(m.rows[2].price,null);
  assert.equal(m.totals.sheet.physicalValueTHB,null);assert.equal(m.totals.sheet.knownPhysicalValueTHB,0);assert.equal(m.totals.sheet.unpricedPhysical,10.5);
  assert.ok(m.warnings.some(s=>s.includes('ไม่ตีเป็นศูนย์')));
  const summary=m.summary.find(r=>r[0]==='แผ่น');assert.equal(summary[5],null);assert.equal(summary[6],null);assert.match(summary[9],/ยังไม่มีมูลค่าที่ทราบ/);
});
test('catalog unavailable exports truthful quantities without base-price fallback',()=>{
  const m=build(stock(),{catalog:null,exportedAt:'2026-10-15T05:00:00Z'});
  assert.equal(m.rows.length,3);assert.ok(m.rows.every(r=>r.price===null&&r.physicalValueTHB===null));assert.ok(m.warnings.some(s=>s.includes('ยังไม่มีชุดราคา')));
});
test('reservation metadata warns when saved plan is stale, missing or not confirmed',()=>{
  const data=stock();data.sellablePlan={reportDate:'2026-10-12',month:'2026-10',appliedAt:'2026-10-12T07:00:00Z',needsSalesRefresh:true};const before=JSON.stringify(data),m=build(data,options());
  assert.equal(JSON.stringify(data),before);assert.equal(m.reservationCurrent,false);assert.ok(m.warnings.some(s=>s.includes('2026-10-12')&&s.includes('ยังไม่ยืนยัน')));assert.equal(m.summary.find(r=>r[0]==='วันที่แผนจองอ้างอิง')[1],'2026-10-12');
  data.sellablePlan={...data.sellablePlan,reportDate:'2026-10-13',needsSalesRefresh:false};assert.equal(build(data,options()).reservationCurrent,true);
  delete data.sellablePlan.needsSalesRefresh;assert.equal(build(data,options()).reservationCurrent,false);
  delete data.sellablePlan;assert.ok(build(data,options()).warnings.some(s=>s.includes('ไม่มีวันที่แผนจอง')));
});
test('missing provenance stays unknown, not fabricated as mail evidence',()=>{
  const data=stock();delete data.rows[0].rawSource;const m=build(data,options());assert.equal(m.rows[0].rawSource,null);assert.equal(m.sheets[1].data[1][32],'ยังไม่มีข้อมูลแหล่งแถว');
});
test('exact-spec and reverse axes only, never allocation-only 1200/1220 equivalence',()=>{
  const data=stock(),opts=options(),p=opts.catalog.widgetState.privateContent;
  delete p.prices['2|F|1220|2440|sheet'];delete p.currencies['2|F|1220|2440|sheet'];p.prices['2|F|2440|1220|sheet']=40;p.currencies['2|F|2440|1220|sheet']='THB';
  assert.equal(build(data,opts).rows[0].price,40);
  p.currencies['2|F|1220|2440|sheet']='THB';assert.equal(build(data,opts).rows[0].price,null,'cleared exact price owns its key');
  delete p.currencies['2|F|1220|2440|sheet'];delete p.prices['2|F|2440|1220|sheet'];delete p.currencies['2|F|2440|1220|sheet'];p.prices['2|F|1200|2400|sheet']=99;
  assert.equal(build(data,opts).rows[0].price,null);
});
test('explicit unavailable FX does not fall back to a saved or stock rate',()=>{
  const m=build(stock(),{...options(),fx:null});assert.equal(m.rows[1].price,0.1);assert.equal(m.rows[1].physicalValueTHB,null);assert.equal(m.totals.strip.missingFxPhysical,100);
  const good=build(stock(),{...options(),fx:{status:'ok',rate:33,date:'2026-10-15'}});assert.equal(good.rows[1].physicalValueTHB,330);
});
test('invalid prices and currencies remain unavailable without inventing correction',()=>{
  for(const bad of [0,-1,NaN,Infinity,'35']){const opts=options();opts.catalog.widgetState.privateContent.prices['2|F|1220|2440|sheet']=bad;assert.equal(build(stock(),opts).rows[0].price,null);}
  const opts=options();opts.catalog.widgetState.privateContent.currencies['2|F|1220|2440|sheet']='EUR';const m=build(stock(),opts);assert.equal(m.rows[0].currency,'EUR');assert.equal(m.rows[0].physicalValueTHB,null);
});
test('mismatched catalog revisions/dates fail before download; malformed stock fails closed',()=>{
  for(const mutation of [s=>s.rows[0].qty=-1,s=>s.rows[0].committedQty=NaN,s=>s.rows[0].unit='',s=>s.rows.push({...s.rows[0]}),s=>s.rows[0].w='']){const data=stock();mutation(data);assert.throws(()=>build(data,options()));}
  const opts=options();opts.catalog.revision=57;assert.throws(()=>build(stock(),opts),/คนละรุ่น/);opts.catalog.revision=56;opts.catalog.stockReportDate='2026-10-14';assert.throws(()=>build(stock(),opts),/คนละวัน/);
  assert.throws(()=>build(stock(),{...options(),exportedAt:'invalid'}));
  const invalidDay=stock();invalidDay.report.reportDate='2026-02-31';assert.throws(()=>build(invalidDay,options()));
});
test('saved free override and notes remain untouched; source alias metadata is scalar',()=>{
  const data=stock();data.rows[0].freeQty=9;data.rows[0].freeOverride={at:'2026-10-13T06:00:00Z'};data.rows[0].aliases=['F1','F2'];data.rows[0].rawSku='F2';data.rows[0].followupBy='Sales';data.rows[0].noteBy='Owner';
  const m=build(data,options());assert.equal(m.rows[0].free,9);assert.equal(m.rows[0].aliases,'F1, F2');assert.equal(m.rows[0].note,'=HYPERLINK("https://bad.example")');assert.equal(m.rows[0].freeAt,'2026-10-13T06:00:00Z');
  assert.equal(m.sheets[1].data[1][3],'F2');
});
function fakeXlsx(){
  const writes=[];
  const column=index=>{let out='';do{out=String.fromCharCode(65+index%26)+out;index=Math.floor(index/26)-1;}while(index>=0);return out;};
  return {writes,utils:{book_new:()=>({SheetNames:[],Sheets:{}}),aoa_to_sheet:rows=>{const ws={};rows.forEach((row,r)=>row.forEach((v,c)=>{if(v!==null&&v!==undefined)ws[column(c)+(r+1)]={v,t:typeof v==='number'?'n':'s',...(typeof v==='string'?{f:'UNSAFE',l:{Target:'https://bad.example'}}:{})};}));return ws;},book_append_sheet:(wb,ws,name)=>{wb.SheetNames.push(name);wb.Sheets[name]=ws;}},writeFile:(...args)=>writes.push(args)};
}
test('workbook writes string cells as text, strips formulas/links, numbers stay numeric',()=>{
  const XLSX=fakeXlsx(),m=build(stock(),options()),wb=createWorkbook(m,XLSX),ws=wb.Sheets['สต๊อกทุกสเปก'];
  assert.deepEqual(wb.SheetNames,['สรุปสต๊อก','สต๊อกทุกสเปก']);assert.equal(ws.X2.v,'=HYPERLINK("https://bad.example")');assert.equal(ws.X2.t,'s');assert.equal(ws.X2.f,undefined);assert.equal(ws.X2.l,undefined);
  assert.equal(ws.K2.v,10.5);assert.equal(ws.K2.t,'n');assert.equal(ws['!autofilter'].ref,'A1:AI4');assert.equal(ws.N4,undefined);
  download(stock(),options(),XLSX);assert.equal(XLSX.writes.length,1);assert.equal(XLSX.writes[0][1],m.fileName);
});
test('no network, persistence, browser credentials, or stock mutation actions in exporter',()=>{
  assert.doesNotMatch(source,/\bfetch\s*\(|localStorage|sessionStorage|Authorization|action\s*:/);
  assert.throws(()=>download(stock(),options(),{}),/Excel/);
});
