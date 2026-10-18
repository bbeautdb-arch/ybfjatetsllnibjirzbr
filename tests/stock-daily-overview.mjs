import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Entirely synthetic examples. Never paste live stock, financial totals,
// customer identifiers, order references or source evidence into public tests.
const source=fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8');
const window={};
vm.runInNewContext(source,{window,document:{getElementById:()=>null,createElement:()=>({}),head:{append(){}}}});
const api=window.AAFStockSummary;
const ids=['physical','sold','reserved','free'];
const clone=value=>JSON.parse(JSON.stringify(value));
const visibleText=html=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const bucket=(sheet,strip=0,valueTHB=sheet*80+strip/4)=>({
  byUnit:{sheet,strip},eq4x8:sheet,eq2_5:sheet,valueTHB,knownValueTHB:valueTHB,
  coverage:{complete:true,valuedSpecCount:1,knownRowCount:1,unknownRowCount:0,missingFxRowCount:0}
});
function summary(){
  return {
    version:2,catalog:{hasSavedCatalog:true},physical:bucket(320,1200,40000),free:bucket(200,600,22000),
    sold:{...bucket(96,300,8640),byCurrency:{THB:8640},loaded:bucket(24,100,2160),paidUnloaded:bucket(72,200,6480),
      settlement:{byCurrency:{THB:{sales:8640,received:2400,outstanding:6240,unallocated:0}},knownReceivedTHB:2400,knownOutstandingTHB:6240,unallocatedTHB:0,complete:true,coverage:{receivedOrderCount:1,outstandingOrderCount:1}}
    },
    partition:{status:'verified',reservationPolicy:'aaf-firm-only-20261003-v1',
      sold:{inStock:bucket(50,200,7000),toProduce:bucket(22)},
      reserved:{inStock:bucket(70,400,11000),toProduce:bucket(18,0,1440),demand:bucket(88,400,12440),
        byStatus:{pi:{inStock:bucket(30,100)},vessel:{inStock:bucket(40,300)}}}
    }
  };
}
function model(){
  const row=(key,extra={})=>({key,sku:'SYNTHETIC',desc:'Invented test only',size:'Normal',w:1220,l:2440,t:2.5,grade:'B',unit:'sheet',qty:320,baseQty:320,committedQty:120,freeQty:200,d90:320,d180:0,d270:0,d360:0,dOver:0,...extra});
  const data={report:{reportDate:'2026-06-15',sourceRowCount:2},revision:7,updatedAt:'2026-06-15T04:00:00Z',rows:[row('SYNTHETIC-SHEET'),row('SYNTHETIC-STRIP',{w:20,l:1000,t:3.2,unit:'strip',qty:1200,baseQty:1200,committedQty:600,freeQty:600,d90:1200})]};
  return api.buildModel(data,r=>({eq:r.qty*r.w*r.l/(1220*2440)*r.t/2.5,value:r.qty*80,freeValue:r.freeQty*80,price:80,curr:'THB'}));
}

// Small balanced-tag extractor keeps assertions about the visible overview
// separate from the full, intentionally hidden original content.
function element(html,attribute){
  const position=html.indexOf(attribute);
  assert.ok(position>=0,`missing ${attribute}`);
  const start=html.lastIndexOf('<',position),open=html.slice(start).match(/^<([a-z][\w-]*)\b[^>]*>/i);
  assert.ok(open,`invalid element for ${attribute}`);
  const tag=open[1],tokens=new RegExp(`<\\/?${tag}\\b[^>]*>`,'gi');
  tokens.lastIndex=start;
  let depth=0,match;
  while((match=tokens.exec(html))){
    depth+=match[0].startsWith('</')?-1:1;
    if(depth===0)return html.slice(start,tokens.lastIndex);
  }
  assert.fail(`unclosed element for ${attribute}`);
}
const card=(html,id)=>element(html,`data-stock-card="${id}"`);
const overview=(html,id)=>element(card(html,id),'class="ss-card-overview"');
const details=(html,id)=>element(card(html,id),`id="ss-card-details-${id}"`);

test('all four daily-report cards initially show an overview with accessible, individually collapsed detail controls',()=>{
  const report=summary(),m=model(),before=JSON.stringify({report,m});
  const html=api.renderKpis(report,m);
  assert.equal((html.match(/data-stock-card="/g)||[]).length,4);
  assert.equal((html.match(/data-stock-card-toggle="/g)||[]).length,4);
  for(const id of ids){
    const c=card(html,id),toggle=element(c,`data-stock-card-toggle="${id}"`),body=details(html,id),headline=overview(html,id);
    assert.match(toggle,/<button\b[^>]*type="button"/);
    assert.match(toggle,/aria-expanded="false"/);
    assert.match(toggle,new RegExp(`aria-controls="ss-card-details-${id}"`));
    assert.match(body,/^<[^>]*\bhidden(?:\s|>|=)/);
    assert.match(body,/class="ss-card-detail-content"/);
    assert.doesNotMatch(headline,/^<[^>]*\bhidden(?:\s|>|=)/);
    assert.ok(headline.length>80,'collapsed cards are a useful summary, not only a title');
  }
  assert.equal(JSON.stringify({report,m}),before,'presentation never writes quantities, prices or settlement evidence');
});

test('compact overview keeps sheet/strip units distinct and actual sales value separate from inventory valuation',()=>{
  const report=summary(),html=api.renderKpis(report,model()),sold=visibleText(overview(html,'sold'));
  assert.match(visibleText(overview(html,'physical')),/320/);
  assert.match(visibleText(overview(html,'physical')),/ไม้แถบ.*1,200.*ชิ้น/);
  assert.doesNotMatch(visibleText(overview(html,'physical')),/1,520/,'raw sheets and strip pieces cannot become one count');
  assert.match(sold,/96/);assert.match(sold,/มูลค่าการขาย/);assert.match(sold,/8,640/);
  assert.match(sold,/รับ(?:เงิน)?แล้ว/);assert.match(sold,/2,400/);assert.match(sold,/รอรับ/);assert.match(sold,/6,240/);
  assert.match(sold,/โหลด/);assert.match(sold,/24/);assert.match(sold,/72/);
  assert.doesNotMatch(sold,/40,000|22,000|11,000/);
  const changed=clone(report);changed.physical.valueTHB=123456;changed.free.valueTHB=234567;changed.catalog={prices:{synthetic:909}};
  assert.equal(overview(api.renderKpis(changed,model()),'sold'),overview(html,'sold'),'stock pricing must not change the actual-sales overview');
});

test('other reservations show the whole demand with physical-backed and outside-stock subsets, never as all real inventory',()=>{
  const html=api.renderKpis(summary(),model()),reserved=visibleText(overview(html,'reserved'));
  assert.match(reserved,/ยอดจองอื่นทั้งหมด/);assert.match(reserved,/88/);assert.match(reserved,/12,440/);
  assert.match(reserved,/70/);assert.match(reserved,/11,000/);
  assert.match(reserved,/ต้องผลิต/);assert.match(reserved,/18/);assert.match(reserved,/1,440/);
  assert.match(reserved,/นอกสต๊อก|ไม่ใช่.*สต๊อก|รวม.*ต้องผลิต/,'the whole demand is not passed off as on-hand stock');
  assert.match(visibleText(details(html,'reserved')),/นอกสต๊อกจริง/);
  assert.match(visibleText(details(html,'reserved')),/1,440/);
  const missing=summary();delete missing.partition.reserved.demand;
  const uncertain=visibleText(api.renderCardOverview('reserved','ยอดจองอื่น · มีของรองรับ','PI / มีเรือ',missing.partition.reserved.inStock,missing,model()));
  assert.doesNotMatch(uncertain,/12,440/,'missing demand must not be invented by summing two possibly mismatched or partial buckets');
  assert.match(uncertain,/ยังระบุ|ยังยืนยัน|รอ|—/);
});

test('unknown or partial commercial money is visibly qualified in the collapsed report, never fabricated as zero',()=>{
  const report=summary();
  report.sold.valueTHB=null;report.sold.knownValueTHB=3200;
  report.sold.coverage={complete:false,knownRowCount:2,unknownRowCount:3,missingFxRowCount:1};
  delete report.sold.settlement;
  const html=api.renderKpis(report,model()),sold=visibleText(overview(html,'sold'));
  assert.match(sold,/3,200/);assert.match(sold,/บางส่วน|ไม่ครบ|เฉพาะ/);
  assert.match(sold,/ราคาขาย|ราคา|สกุลเงิน/);assert.match(sold,/รอ|ยืนยันไม่ได้/);
  assert.doesNotMatch(sold,/฿\s*0(?:\D|$)/);
  assert.match(visibleText(details(html,'sold')),/รอราคาขายหรือสกุลเงิน 3 รายการ/);
  assert.match(visibleText(details(html,'sold')),/รออัตราแลกเปลี่ยน 1 รายการ/);
  report.sold.coverage.knownRowCount=0;report.sold.knownValueTHB=0;
  const unknown=visibleText(overview(api.renderKpis(report,model()),'sold'));
  assert.match(unknown,/ยังระบุ|ยังยืนยัน|รอข้อมูล|—/);
  assert.doesNotMatch(unknown,/฿\s*0(?:\D|$)/);
});

test('stock price gaps remain visible in a compact summary while editors and production rows stay available in detail',()=>{
  const report=summary(),spec={key:'2.5|F|610|1220|sheet',t:2.5,grade:'F',w:610,l:1220,unit:'sheet',qty:11};
  report.free={...report.free,valueTHB:null,knownValueTHB:560,unpricedSpecs:[spec],coverage:{complete:false,valuedSpecCount:1,unpricedSpecCount:1}};
  report.partition.sold.toProduce={...report.partition.sold.toProduce,productionSpecs:[{...spec,qty:22}]};
  const html=api.renderKpis(report,model()),compact=overview(html,'free'),full=details(html,'free');
  assert.match(visibleText(compact),/ไม่ครบ|เฉพาะ|ไม่มีราคา|รอราคา/);
  assert.doesNotMatch(compact,/data-stock-gap-price|data-stock-gap-save/,'inline editing belongs in expanded details');
  assert.match(full,/data-stock-gap-price="2\.5\|F\|610\|1220\|sheet"/);
  assert.match(full,/data-stock-gap-save/);
  assert.match(details(html,'sold'),/ss-production-details/);
  assert.match(visibleText(details(html,'sold')),/22 แผ่น/);
});

test('invalid commercial money cannot become a plausible compact amount when the detailed card rejects it',()=>{
  for(const invalid of [NaN,Infinity,-1,'54321']){
    const report=summary();report.sold.valueTHB=invalid;report.sold.knownValueTHB=1200;
    report.sold.coverage={complete:false,knownRowCount:1,unknownRowCount:1};
    const compact=visibleText(overview(api.renderKpis(report,model()),'sold'));
    assert.match(compact,/฿ 1,200/);assert.doesNotMatch(compact,/NaN|Infinity|฿\s*-1|54,321/);
    report.sold.coverage.knownRowCount=0;report.sold.knownValueTHB=0;
    const unknown=visibleText(overview(api.renderKpis(report,model()),'sold'));
    assert.match(unknown,/ยังระบุ|ยังยืนยัน|—/);assert.doesNotMatch(unknown,/฿\s*0(?:\D|$)|NaN|Infinity|54,321/);
  }
});

test('pending basic stock has four safe compact cards without inventing commercial totals or allocation confirmation',()=>{
  const m=model(),html=api.renderKpis(null,m);
  for(const id of ids){assert.ok(overview(html,id));assert.ok(details(html,id));}
  assert.match(visibleText(overview(html,'physical')),/320/);
  const sold=visibleText(overview(html,'sold'));
  assert.match(sold,/—|รอ/);assert.doesNotMatch(sold,/฿\s*0(?:\D|$)/);
  for(const id of ['reserved','free'])assert.match(visibleText(overview(html,id)),/บันทึก|ยังไม่ยืนยัน|รอ/);
  assert.doesNotMatch(html,/NaN|Infinity|undefined/);
  const noModel=api.renderKpis(null);
  for(const id of ids){assert.ok(overview(noModel,id));assert.ok(details(noModel,id));}
});

test('unverified partition and receipt evidence keep the caution visible after collapsing',()=>{
  const report=summary();report.partition.status='pending';report.partition.reason='SYNTHETIC allocation verification pending';
  const html=api.renderKpis(report,model());
  assert.match(html,/ss-partition-error/);
  assert.match(visibleText(overview(html,'reserved')),/รอ|ยังไม่|—/);
  assert.doesNotMatch(visibleText(overview(html,'reserved')),/11,000/,'a pending partition must not present the reserved bucket as verified');
  const incomplete=summary();delete incomplete.sold.settlement;
  assert.match(visibleText(overview(api.renderKpis(incomplete,model()),'sold')),/ยังยืนยัน|ยังไม่มี|รอหลักฐาน/);
});

test('report provides explicit overview/full-detail controls without removing the detailed stock report',()=>{
  const m=model();m.salesSummary=summary();
  const html=api.renderHTML(m);
  for(const action of ['collapse','expand'])assert.match(element(html,`data-stock-overview-action="${action}"`),/<button\b[^>]*type="button"/);
  assert.match(html,/ภาพรวมแยกเกรดและความหนา/);assert.match(html,/รายละเอียดครบทุกสเปก/);
  assert.match(source,/\[hidden\]/,'CSS must honor hidden rather than grid/display overriding it');
});

test('per-card and all-card controls change only presentation and preserve expansion across a refreshed render',async()=>{
  const listeners=new Map(),cards=[],draft={value:'23.50',currency:'THB'};
  let writes=0;
  for(const id of ids){
    const c={dataset:{stockCard:id}},content={hidden:true,draft},compact={hidden:false};
    const toggle={dataset:{stockCardToggle:id},textContent:'ดูรายละเอียด · '+id,attributes:{'aria-expanded':'false'},
      setAttribute(key,value){this.attributes[key]=value;},
      closest(selector){return selector==='[data-stock-card-toggle]'?this:selector==='[data-stock-card]'?c:null;}
    };
    c.querySelector=selector=>selector==='[data-stock-card-toggle]'?toggle:selector==='.ss-card-detail-content'?content:selector==='.ss-card-overview-wrap'?compact:null;
    cards.push({c,content,compact,toggle});
  }
  const root={addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},querySelector:()=>null,
    querySelectorAll:selector=>selector==='[data-stock-card]'?cards.map(row=>row.c):[]};
  const isolatedWindow={AAFSalesPreview:{savePrices(){writes++;},setDraftPrice(){writes++;}}};
  vm.runInNewContext(source,{window:isolatedWindow,document:{getElementById:()=>root,createElement:()=>({}),head:{append(){}}},fetch(){writes++;throw new Error('presentation cannot call a write endpoint');}});
  const click=async target=>{for(const fn of listeners.get('click')||[])await fn({target});};
  const action=value=>({dataset:{stockOverviewAction:value},closest(selector){return selector==='[data-stock-overview-action]'?this:null;}});
  const sold=cards.find(row=>row.c.dataset.stockCard==='sold');
  await click(sold.toggle);
  assert.equal(sold.toggle.attributes['aria-expanded'],'true');assert.equal(sold.content.hidden,false);assert.equal(sold.compact.hidden,true);
  for(const c of cards.filter(row=>row!==sold))assert.equal(c.content.hidden,true,'opening one card leaves the others compact');
  let html=isolatedWindow.AAFStockSummary.renderKpis(summary(),model());
  assert.match(element(card(html,'sold'),'data-stock-card-toggle="sold"'),/aria-expanded="true"/);
  assert.doesNotMatch(details(html,'sold'),/^<[^>]*\bhidden(?:\s|>|=)/,'a new projection does not collapse the selected card');
  await click(action('expand'));
  for(const c of cards){assert.equal(c.content.hidden,false);assert.equal(c.compact.hidden,true);assert.equal(c.toggle.attributes['aria-expanded'],'true');}
  await click(action('collapse'));
  for(const c of cards){assert.equal(c.content.hidden,true);assert.equal(c.compact.hidden,false);assert.equal(c.toggle.attributes['aria-expanded'],'false');assert.equal(c.content.draft,draft);}
  html=isolatedWindow.AAFStockSummary.renderKpis(summary(),model());
  for(const id of ids)assert.match(details(html,id),/^<[^>]*\bhidden(?:\s|>|=)/);
  assert.equal(draft.value,'23.50','collapsing does not reset a price draft');assert.equal(writes,0);
});

test('independent catalog and FX repaint refresh the basic compact Physical value without a sales allocation or stale money',()=>{
  const compact={innerHTML:''},full={innerHTML:''},root={innerHTML:'',classList:{remove(){}},addEventListener(){},querySelectorAll:()=>[],
    querySelector(selector){
      if(selector==='[data-basic-stock="physical"] .ss-card-overview-wrap')return compact;
      if(selector==='[data-basic-stock="physical"] .ss-kpi-value')return full;
      if(selector==='.ss-download')return {addEventListener(){}};
      return null;
    }};
  const isolatedWindow={};
  vm.runInNewContext(source,{window:isolatedWindow,document:{getElementById:()=>root,createElement:()=>({}),head:{append(){}}},location:{hash:''}});
  const live=isolatedWindow.AAFStockSummary,m=model(),data={report:{reportDate:m.reportDate,sourceRowCount:m.rows.length},revision:7,updatedAt:m.updatedAt,rows:clone(m.rows)};
  live.update(data,r=>({eq:r.qty*r.w*r.l/(1220*2440)*r.t/2.5,value:r.qty*80,freeValue:r.freeQty*80,price:80,curr:'THB'}));
  const catalog={revision:7,reportDate:m.reportDate,catalogRevision:3,rows:m.rows.map(r=>({...r,price:r.unit==='sheet'?2:0.25,currency:r.unit==='sheet'?'USD':'THB'}))};
  const before=JSON.stringify({data,catalog});
  live.setSavedStockCatalog(catalog);
  assert.match(visibleText(compact.innerHTML),/฿ 300/);
  assert.match(visibleText(compact.innerHTML),/เฉพาะ|รอราคา\/เรท/,'missing FX must remain an incomplete inventory valuation');
  live.setExchangeRate({rate:30,date:'2026-06-15',status:'current',basis:'BOT_USD_THB_BUYING_TRANSFER'});
  assert.match(visibleText(compact.innerHTML),/฿ 19,500/);
  assert.match(visibleText(full.innerHTML),/฿ 19,200/);
  assert.match(visibleText(full.innerHTML),/฿ 300/);
  live.setExchangeRate({rate:31,date:'2026-06-15',status:'current',basis:'BOT_USD_THB_BUYING_TRANSFER'});
  assert.match(visibleText(compact.innerHTML),/฿ 20,140/);
  assert.doesNotMatch(visibleText(compact.innerHTML),/19,500/);
  live.setSavedStockCatalog(null);
  assert.match(visibleText(compact.innerHTML),/ยังระบุมูลค่าไม่ได้|รอยืนยัน/);
  assert.doesNotMatch(visibleText(compact.innerHTML),/20,140|฿\s*0(?:\D|$)/);
  assert.equal(JSON.stringify({data,catalog}),before,'repaint must not alter the stock/catalog inputs');
});

test('overview export fits the fixed canvas and only collapses the detached capture, leaving normal full-report export complete',()=>{
  const download=source.slice(source.indexOf("async function download(which='stock')"),source.indexOf('window.AAFStockSummary={update'));
  assert.match(download,/width:1440px;box-sizing:border-box/,'export padding must not widen the capture beyond the canvas and crop the right edge');
  assert.match(download,/which==='overview'\?dailyOverviewHTML\(captured\):html\(captured\)/);
  assert.match(download,/box\.querySelectorAll\('\[data-stock-card\]'\)\)setCardView\(card,which!=='overview'\)/,'collapse only the detached overview; full-report capture expands details');
  assert.doesNotMatch(download,/expandedCards\.(?:add|delete|clear)/,'export must not change on-screen expansion choices');
  assert.match(download,/AAF_Daily_Overview_/);assert.match(download,/AAF_Stock_Summary_/);
});
