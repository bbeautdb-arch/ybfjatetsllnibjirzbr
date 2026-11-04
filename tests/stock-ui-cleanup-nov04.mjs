import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),header=require('../stock_order_header.js'),readiness=require('../stock_readiness.js');
const source=fs.readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8'),window={AAFOrderHeader:header,AAFStockReadiness:readiness};
vm.runInNewContext(source,{window,document:{getElementById:()=>null,createElement:()=>({}),head:{append(){}}}});
const summary=window.AAFStockSummary,copy=value=>JSON.parse(JSON.stringify(value)),units=(sheet,strip=0)=>({sheet,strip});

// Tiny inert HTML inspector. No code execution, networking or real company data.
// Unlike stripping tags with a regex, it also honors hidden ancestor wrappers.
function inspect(markup){
  const root={tag:'root',attrs:{},children:[],hidden:false},stack=[root],nodes=[];
  const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for(const match of markup.matchAll(/<(?:[^"'<>]|"[^"]*"|'[^']*')*>|[^<]+/g)){
    const token=match[0];
    if(token.startsWith('</')){const tag=token.match(/^<\/([\w-]+)/)?.[1];while(stack.length>1){if(stack.pop().tag===tag)break;}continue;}
    if(token.startsWith('<')){
      const tag=token.match(/^<([\w-]+)/)?.[1];if(!tag)continue;
      const attrs=Object.fromEntries([...token.slice(tag.length+1,-1).matchAll(/\s+([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(m=>[m[1],m[2]??m[3]??m[4]??'']));
      const node={tag,attrs,children:[],hidden:stack.at(-1).hidden||Object.hasOwn(attrs,'hidden')};
      stack.at(-1).children.push(node);nodes.push(node);if(!voidTags.has(tag)&&!token.endsWith('/>'))stack.push(node);
    }else stack.at(-1).children.push({text:token,hidden:stack.at(-1).hidden});
  }
  const text=(node=root,visible=false)=>visible&&node.hidden?'':node.text!==undefined?node.text:node.children.map(n=>text(n,visible)).join(' ');
  const decode=value=>value.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
  return {nodes,text:node=>decode(text(node)),visible:node=>decode(text(node,true))};
}

function fixture({pending=false,unpriced=false}={}){
  const month=header.currentBangkokMonth(),capturedAt=new Date().toISOString(),checksum='sha256:'+'a'.repeat(64),planChecksum='sha256:'+'b'.repeat(64),reportDate=month+'-01';
  const sold={version:1,status:'verified-quantities',month,source:{page:9,capturedAt,sourceIsLive:false,checksum,orderCount:4,lineCount:4},quantity:units(10,4),loaded:units(4,1),paidOrDeposit:units(6,3),lcETD:units(0),orderCount:2,lineCount:2};
  const allocation={version:1,status:'verified-allocation',month,source:{page:9,capturedAt,sourceIsLive:false,checksum},stock:{revision:8,reportDate,planChecksum,planCapturedAt:capturedAt},
    current:{soldUnloaded:{demand:units(6,3),allocated:units(6,3),shortage:units(0)},other:{demand:units(5,2),allocated:units(3,2),shortage:units(2)}},carry:{demand:units(4,4),allocated:units(1,4),shortage:units(3)},
    totals:{physical:units(100,20),demand:units(15,9),allocated:units(10,9),shortage:units(5),formulaFree:units(90,11),savedFree:units(88,11),manualFreeDelta:units(-2)},manualFreeOverrideCount:1};
  const make=(w,l,t,grade,qty,committedQty,freeQty,unit='sheet',manual=false)=>({key:`w${w}_l${l}_t${t}_g${grade}`,sku:'SYNTHETIC',desc:'Invented cleanup test only',w,l,t,grade,unit,qty,committedQty,freeQty,baseQty:qty,d90:qty*.5,d180:qty*.25,d270:qty*.125,d360:0,dOver:qty*.125,note:'Synthetic saved note',followup:'Synthetic followup',...(manual?{freeOverride:{value:freeQty,reportDate,at:capturedAt}}:{})});
  const rows=[make(1220,2440,2.5,'B',10,15,0),make(1220,2440,3.2,'F',90,0,88,'sheet',true),make(25,1000,3.2,'B',20,9,11,'strip')];
  const stock={revision:8,reportDate,report:{reportDate,sourceRowCount:3},updatedAt:capturedAt,exchangeRate:30,rows,sellablePlan:{checksum:planChecksum,source:{capturedAt}},currentMonthSold:sold,currentAllocation:pending?{version:1,status:'pending',month,reason:'Synthetic cutoff pending'}:allocation};
  const fx={rate:30,date:'2000-06-01',status:'stale',basis:'BOT_USD_THB_BUYING_TRANSFER'},prices=[{price:2,currency:'THB'},{price:unpriced?null:3,currency:'USD'},{price:1,currency:'THB'}];
  const catalog={revision:8,reportDate,catalogRevision:9,savedAt:capturedAt,rows:rows.map((r,i)=>({...r,...prices[i]}))};
  const calculate=r=>{const index=rows.findIndex(v=>v.key===r.key),p=prices[index],price=p.price??0,factor=p.currency==='USD'?30:1;return {eq:r.qty*r.w*r.l/(1220*2440)*r.t/2.5,value:r.qty*price*factor,freeValue:r.freeQty*price*factor,price,curr:p.currency};};
  const model=summary.withSavedCatalog({...summary.buildModel(stock,calculate),headerExchangeRate:fx},catalog,fx),warehouse=header.warehouseProjection(model);
  return {stock,model,catalog,fx,sold,allocation:stock.currentAllocation,warehouse};
}
const cards=f=>header.render(null,new Set(),f.warehouse,'',f.sold,f.allocation);

test('requested inventory captions remain hidden metadata in compact and expanded cards',()=>{
  const f=fixture(),before=JSON.stringify(f);
  for(const expanded of [new Set(),new Set(['physical','free'])]){
    const html=header.render(null,expanded,f.warehouse,'',f.sold,f.allocation),doc=inspect(html);
    const targets=[['small',/^ชุดราคาส่วนกลาง 9 · ไม่ใช่ราคาขายจริง$/],['small',/^USD\/THB 30 · 2000-06-01/],['div',/^ฐานข้อมูล /],['small',/^Physical ทั้งคลัง ไม่ใช่ยอดเฉพาะเดือนขาย$/]];
    for(const [tag,pattern] of targets){
      const matching=doc.nodes.filter(n=>n.tag===tag&&pattern.test(doc.text(n))&&(tag!=='div'||Object.hasOwn(n.attrs,'data-internal-metadata')));
      assert.ok(matching.length>=2,'metadata remains in both duplicated card surfaces: '+pattern);
      for(const node of matching){assert.ok(Object.hasOwn(node.attrs,'data-internal-metadata'));assert.ok(Object.hasOwn(node.attrs,'hidden'));assert.equal(doc.visible(node),'');}
      assert.doesNotMatch(doc.visible(),pattern);
    }
    assert.doesNotMatch(doc.visible(),/ชุดราคาส่วนกลาง 9|USD\/THB 30 · 2000-06-01|ฐานข้อมูล |Physical ทั้งคลัง ไม่ใช่ยอดเฉพาะเดือนขาย/);
    assert.match(doc.visible(),/สต๊อกจริง · ทั้งคลัง/);assert.match(doc.visible(),/มูลค่า Free · ราคาประเมินที่บันทึก/);
  }
  assert.equal(JSON.stringify(f),before);
});

test('summary context and both Aging heading explanations are hidden while original Aging headers and data remain',()=>{
  const f=fixture(),before=JSON.stringify(f.model),html=summary.renderHTML(f.model),doc=inspect(html);
  for(const phrase of ['เวลาไทย (UTC+7) · ภาพรวมทั้งชุด ไม่ใช้ตัวกรองในหน้าสต๊อก','Aging เมล = ยอดต้นฉบับก่อนโยก']){
    const nodes=doc.nodes.filter(n=>['span','small'].includes(n.tag)&&doc.text(n)===phrase);
    assert.equal(nodes.length,phrase.startsWith('Aging')?2:1);
    for(const node of nodes){assert.ok(Object.hasOwn(node.attrs,'hidden'));assert.ok(Object.hasOwn(node.attrs,'data-internal-metadata'));}
    assert.ok(!doc.visible().includes(phrase));
  }
  assert.match(doc.visible(),/ข้อมูลส่วนกลางล่าสุด/);assert.match(doc.visible(),/0–90/);assert.match(doc.visible(),/91–180/);assert.match(doc.visible(),/>180 วัน/);
  assert.equal(JSON.stringify(f.model),before);assert.deepEqual(Array.from(f.model.aging),[60,30,15,0,15]);
});

test('readiness is hidden as a whole for verified and pending states; pure readiness evidence is not deleted or changed',()=>{
  for(const pending of [false,true]){
    const f=fixture({pending}),view=readiness.build(f.model),before=JSON.stringify(view),html=summary.renderHTML(f.model),doc=inspect(html);
    assert.equal(view.status,pending?'pending':'verified');
    const slots=doc.nodes.filter(n=>Object.hasOwn(n.attrs,'data-stock-readiness-slot'));assert.equal(slots.length,1);assert.ok(Object.hasOwn(slots[0].attrs,'hidden'));
    assert.match(doc.text(slots[0]),/ตรวจของก่อนวางแผนผลิต/);assert.match(doc.text(slots[0]),/สต๊อกจริง → จัดสรรจากคลัง → ต้องผลิตเพิ่ม/);assert.equal(doc.visible(slots[0]),'');
    assert.doesNotMatch(doc.visible(),/ตรวจของก่อนวางแผนผลิต|สต๊อกจริง → จัดสรรจากคลัง → ต้องผลิตเพิ่ม/);
    assert.match(readiness.render(view),/ตรวจของก่อนวางแผนผลิต/);assert.equal(JSON.stringify(view),before);
    if(!pending){assert.deepEqual(view.totals.physical,units(100,20));assert.deepEqual(view.totals.shortage,units(5));assert.deepEqual(view.totals.savedFree,units(88,11));}
  }
});

test('incomplete valuation and pending current-allocation warnings outside the removed panel remain visible',()=>{
  const f=fixture({pending:true,unpriced:true}),html=cards(f),doc=inspect(html),visible=doc.visible();
  assert.match(visible,/Synthetic cutoff pending/);assert.match(visible,/Free นี้ยังเป็นยอดที่บันทึกไว้/);assert.match(visible,/ยังรอยืนยันกับยอดขายล่าสุด/);
  assert.match(visible,/รอราคา\/เรท 1 สเปก/);assert.match(visible,/ไม่ใช้ 0 หรือราคาชุดเก่าแทน/);assert.match(visible,/ยังไม่มีหลักฐานราคาขาย\/รับเงินตรงชุดนี้/);
  const warnings=doc.nodes.filter(n=>n.attrs.class?.split(' ').includes('ss-overview-warning')&&!n.hidden);assert.ok(warnings.length>=3);
  assert.match(visible,/88 แผ่น/);assert.match(visible,/11 ชิ้น/);assert.equal(f.warehouse.free.complete,false);assert.equal(f.warehouse.free.knownValueTHB,11);
});

test('cleanup preserves exact units, amounts, per-spec shortage, manual Free and source objects',()=>{
  const f=fixture(),before=JSON.stringify(f),visible=inspect(cards(f)).visible();
  assert.deepEqual(f.warehouse.physical.quantity,units(100,20));assert.deepEqual(f.warehouse.free.quantity,units(88,11));
  assert.equal(f.warehouse.physical.knownValueTHB,8140);assert.equal(f.warehouse.free.knownValueTHB,7931);
  assert.equal(f.model.rows.find(r=>r.grade==='F').freeQty,88);assert.equal(f.model.rows.find(r=>r.t===2.5).reservedProductionQty,5);
  assert.match(visible,/≈ ฿ 8,140/);assert.match(visible,/≈ ฿ 7,931/);assert.match(visible,/ปรับ Free ด้วยมือ 1 สเปก/);
  assert.match(visible,/ขายแล้วเดือนนี้/);assert.match(visible,/10 แผ่น/);assert.match(visible,/จองอื่นๆ · ไม่ซ้ำขายแล้ว/);
  summary.renderHTML(f.model);header.render(null,new Set(['physical','free']),f.warehouse,'',f.sold,f.allocation);
  assert.equal(JSON.stringify(f),before,'display cleanup never mutates saved values, pricing or source evidence');
});

test('explicit hidden guards apply outside media rules, including report export clones',()=>{
  for(const attr of ['data-internal-metadata','data-stock-readiness-slot'])assert.match(source,new RegExp('\\[data-aaf-stock-summary\\] \\['+attr+'\\]\\[hidden\\][^{]*\\{[^}]*display\\s*:\\s*none\\s*!important'),'base report CSS protects '+attr);
  const refresh=source.slice(source.indexOf('function repaintReadiness()'),source.indexOf('function repaintThicknessProductionWarnings()'));
  assert.doesNotMatch(refresh,/\.hidden\s*=\s*false|removeAttribute\(['"]hidden/,'same-revision refresh cannot reopen hidden readiness');
  assert.match(source,/box\.dataset\.aafStockSummary=''/,'PNG clone remains covered by the same scoped hidden rules');
});
