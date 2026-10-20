/* Generic runtime-only stock order review. Business data must come from an authenticated controller. */
(function (global) {
'use strict';
const assetBase = global.document.currentScript && global.document.currentScript.src;
const stylesheetURL = assetBase ? new URL('stock_order_review.css?v=20261020-money-details-r2', assetBase).href : 'stock_order_review.css?v=20261020-money-details-r2';
const STATIC_HTML = "<main>\n<header class=\"top\"><div><h1 id=\"review-title\">ภาพรวมรายการขาย</h1><p class=\"muted\">เรียงกลุ่มและวัน ETD · รายการต้นทางครบ · ตรวจคิวก่อนยืนยันของที่ขาด</p><p class=\"small muted\" id=\"visible-source-date\"></p><span class=\"queue-method-label\" id=\"queue-method\" hidden>คิวตามกติกาในชุดข้อมูล</span></div><span class=\"readonly\">ยอดอ่านอย่างเดียว · หมายเหตุ / ติดตามตามสิทธิ์</span></header>\n<section class=\"changes-toolbar\" aria-label=\"บันทึกการเปลี่ยนแปลง\"><button type=\"button\" class=\"plainbutton changes-save\" id=\"changes-stage\" disabled>บันทึกการเปลี่ยนแปลง</button><span id=\"changes-count\" class=\"small\" role=\"status\" aria-live=\"polite\">ไม่มีการเปลี่ยนแปลง</span><span id=\"changes-permission\" class=\"small muted\"></span></section><section id=\"notes-confirmation\" class=\"notes-confirmation\" hidden></section><section class=\"controls\" aria-label=\"เลือกความหนา\"><label for=\"thickness\">ความหนา</label><select id=\"thickness\"></select><button type=\"button\" class=\"plainbutton\" id=\"back\" hidden>← ภาพรวมทุกความหนา</button><div class=\"facts small muted\" id=\"scope-label\"></div></section>\n<p class=\"callout\" id=\"source-warning\" role=\"note\" hidden></p><section class=\"overview\" id=\"metrics\" aria-label=\"ภาพรวมสินค้าและมูลค่า\"></section>\n<p class=\"money-source-note\" id=\"money-source-note\" hidden></p><section class=\"free-detail-panel\" id=\"free-detail-panel\" aria-label=\"รายละเอียด Free Stock\" hidden></section>\n<details class=\"basis reconciliation\"><summary>ตรวจเทียบกับภาพรวมสต๊อก</summary><div id=\"reconciliation\"></div></details>\n<div class=\"sectionbar\"><h2 id=\"table-title\"></h2><button type=\"button\" id=\"collapse\" class=\"plainbutton\" hidden>ย่อรายละเอียดทั้งหมด</button><span class=\"small muted\" id=\"table-help\"></span></div><div id=\"table-area\"></div>\n<div class=\"help-row\" id=\"allocation-legend\"></div><p class=\"callout\" id=\"unreserved-note\" hidden></p><p class=\"callout\" id=\"pending-note\" hidden></p>\n<details class=\"basis\" id=\"stock-basis\"><summary id=\"stock-title\">ทะเบียนสต๊อกทุกเกรดและขนาด · ติดตามและหมายเหตุ</summary><div class=\"basis-content\">\n<section class=\"stock-notes-tools\" aria-label=\"หมายเหตุร่วมกับ Free Stock\"><strong>หมายเหตุรายสินค้า · ใช้รายการเดียวกับ Free Stock</strong><p class=\"small muted\">จับคู่ความหนา เกรด ขนาดจริง และหน่วย · กรอกได้แม้ Free เป็น 0 · ไม่เปลี่ยนยอดหรือราคา</p>\n<div class=\"stock-notes-actions\"><button type=\"button\" id=\"notes-connect\" hidden></button><button type=\"button\" class=\"plainbutton\" id=\"notes-refresh\">โหลดหมายเหตุล่าสุด</button><button type=\"button\" class=\"plainbutton\" id=\"notes-stage\" disabled>ตรวจและบันทึกการเปลี่ยนแปลง</button></div><details class=\"notes-import\" id=\"notes-import\"><summary>นำเข้าหมายเหตุจาก Excel</summary><p class=\"small muted\">อ่านเฉพาะหมายเหตุ จับคู่สินค้า ไม่เปลี่ยนยอดหรือราคา · ต้องตรวจรายการก่อนบันทึก</p><div class=\"stock-notes-actions\"><label>คอลัมน์ <select id=\"notes-file-column\"><option value=\"AD\">AD · หมายเหตุ</option><option value=\"AE\">AE · เลือกเองหลังตรวจหัวตาราง</option></select></label><label>วิธีเติม <select id=\"notes-file-mode\"><option value=\"append\">ต่อท้ายของเดิม</option><option value=\"replace\">แทนข้อความเดิม · ต้องตรวจทุกแถว</option></select></label><label class=\"plainbutton\">เลือก Excel <input id=\"notes-file\" type=\"file\" accept=\".xlsx,.xls\" aria-label=\"เลือกไฟล์ Excel หมายเหตุ\"></label></div><p class=\"small muted\">AE อาจเป็นคอลัมน์ผู้บันทึกหรือข้อมูลอื่น ต้องตรวจชื่อหัวคอลัมน์ก่อนใช้ · ช่องว่างข้าม ไม่ลบหมายเหตุเดิม</p><div id=\"notes-import-preview\" role=\"status\" aria-live=\"polite\"></div></details><p id=\"notes-status\" class=\"notes-status\" role=\"status\" aria-live=\"polite\"></p><p class=\"notes-draft-warning\">ร่างอยู่ในแท็บนี้จนกว่าจะบันทึกและอ่านกลับ · ช่องว่างไม่ลบหมายเหตุเดิม · การรีโหลดหน้าจะทำให้ร่างที่ยังไม่เซฟหาย</p></section>\n<div id=\"stock-table\"></div><div id=\"stock-legacy\"></div><p class=\"small muted\">ข้อมูลคลังตามวันที่ระบุ แยกจากผลจัดสรรคิวใหม่ · หมายเหตุใช้ขนาดจริง กลับด้านได้ แต่ไม่รวมขนาดใกล้เคียงหรือต่างเกรด/หน่วย</p></div></details>\n<details class=\"basis\"><summary>วันที่ข้อมูล ขอบเขต และวิธีอ่าน</summary><div class=\"basis-content small\"><p id=\"source-sales\"></p><p id=\"source-stock\"></p><p id=\"source-allocation\"></p><p id=\"queue-order-description\"></p><p>โหลดแล้วไม่หักสต๊อกซ้ำ · รายการยังไม่ยืนยันจำนวนไม่ใช่ศูนย์ · คงต้นทางที่ยกเลิกหรือรอเงื่อนไขไว้ตรวจสอบ</p><p>ยอดเงินสินค้าใช้ราคาขายจริงในใบขาย ส่วน Free ใช้ราคาประเมินสต๊อก ไม่สลับกัน · วันที่ ETD ไม่ใช่วันรับเงิน</p><p>หน่วยแผ่นและชิ้นแยกกัน เทียบ 4×8 หนา 2.5 มม. ใช้ปริมาตรตามขนาดจริง ไม่เปลี่ยนจำนวนสต๊อก</p></div></details><footer>ข้อมูลบริษัทจากชุดที่บัญชีนี้มีสิทธิ์อ่าน · หน้านี้ไม่เปลี่ยนยอดสต๊อก ยอดจอง ราคา หรือสถานะต้นทาง</footer><div id=\"announcement\" role=\"status\" aria-live=\"polite\" class=\"small muted\"></div></main>";
function mount(host, review, services = {}) {
  if (!host || typeof host.attachShadow !== 'function') throw new TypeError('A host element is required');
  const shadow = host.shadowRoot || host.attachShadow({mode:'open'});
  const ownerDocument = host.ownerDocument;
  const document = {
    getElementById:id=>shadow.getElementById(id),
    querySelector:selector=>shadow.querySelector(selector),
    querySelectorAll:selector=>shadow.querySelectorAll(selector),
    createElement:tag=>ownerDocument.createElement(tag),
    get activeElement(){return shadow.activeElement;}
  };
  const CSS = global.CSS || {escape:value=>String(value).replace(/[^a-zA-Z0-9_-]/g, character=>'\\'+character)};
  const uiState = {thickness:'all',month:null,freePanelOpen:false};
  const notesState = {connected:false,canSave:false,canEditFollowup:false,loaded:false,liveRows:new Map(),rawRecords:new Map(),notes:new Map(),legacy:new Map(),drafts:new Map(),followupDrafts:new Map(),conflicts:new Map(),followupConflicts:new Map(),pending:null,retryBlocked:false,revision:null,catalogRevision:null,readAt:'',reportDate:'',status:'ยังไม่โหลดหมายเหตุส่วนกลาง · ช่องว่างไม่ใช่หลักฐานว่าไม่มีหมายเหตุ',tone:''};
  let destroyed=false, notesBusy=false, generation=0, queuedReview=null, currentReview=review, instance;
  const hasDirty=()=>!destroyed&&(notesState.drafts.size>0||notesState.followupDrafts.size>0||!!notesState.pending);
  const unloadGuard=event=>{if(hasDirty()){event.preventDefault();event.returnValue='';}};
  if(typeof global.addEventListener==='function')global.addEventListener('beforeunload',unloadGuard);
  function rebuild(data) {
    if (destroyed) return;
    const version=++generation;
    currentReview=data;
    shadow.replaceChildren();
    const link=ownerDocument.createElement('link');link.rel='stylesheet';link.href=stylesheetURL;shadow.append(link);
    const frame=ownerDocument.createElement('div');frame.innerHTML=STATIC_HTML;shadow.append(frame);
    const isCurrent=()=>!destroyed&&version===generation;
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const pools = Array.isArray(data.stockPools) ? data.stockPools : [];
  const keys = ['ordered','loaded','allocated','shortage','unreserved','pendingQty'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fmt = value => num(value).toLocaleString('en-US',{maximumFractionDigits:2});
  const fmtEquivalent = value => Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const thick = value => Number(value).toFixed(1);
  const unitKey = value => /^(strip|strips|ชิ้น|ไม้แถบ)$/i.test(String(value ?? '')) ? 'strip' : /^(sheet|sheets|แผ่น|)$/i.test(String(value ?? '')) ? 'sheet' : String(value);
  const unitLabel = value => unitKey(value)==='sheet' ? 'แผ่น' : unitKey(value)==='strip' ? 'ชิ้นไม้แถบ' : String(value);
  const dimensions = r => `${fmt(r.w)}×${fmt(r.l)}`;
  const gradeLabel = value => String(value).toLowerCase()==='mix' ? 'AAA+B' : value;
  const productStatusLabel = value => ({ready:'พร้อมโหลด',waiting:'รอผลิต',loaded:'โหลดแล้ว'}[String(value)] || String(value || 'ไม่ระบุ'));
  const sourceNotes = value => Array.isArray(value) ? value.filter(Boolean).join('\n') : String(value || '');
  // Financial display is read-only and separate from stock valuation and allocation.
  const finance = data.financial || null;
  const moneyNumber = value => typeof value==='number' && Number.isFinite(value);
  const moneyFmt = value => moneyNumber(value) ? value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : 'ยังไม่ยืนยัน';
  const nativeMoney = (value,currency) => moneyNumber(value) && ['THB','USD'].includes(currency) ? `${currency==='THB'?'฿':'US$'} ${moneyFmt(value)}` : 'ยังไม่ยืนยันราคา/สกุลเงิน';
  const nativeUnitPrice = (value,currency) => moneyNumber(value) && ['THB','USD'].includes(currency) ? `${currency==='THB'?'฿':'US$'} ${value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6})}` : 'ยังไม่ยืนยันราคา/สกุลเงิน';
  const nativeMap = map => map && moneyNumber(map.THB) && moneyNumber(map.USD) ? `฿ ${moneyFmt(map.THB)} · US$ ${moneyFmt(map.USD)}` : 'ยังไม่มีข้อมูลเงินที่ตรวจแล้ว';
  const moneyTHB = map => {
    if(!map || !moneyNumber(map.THB) || !moneyNumber(map.USD))return null;
    const rate=finance?.metadata?.fx?.rate;
    if(map.USD && (!moneyNumber(rate)||rate<=0))return null;
    return map.THB + map.USD * (moneyNumber(rate)?rate:0);
  };
  const hasMoney = map => map && (num(map.THB)>0 || num(map.USD)>0);
  const moneyIssueLabel = issue => ({
    'lc-pending-collection-per-sales-status':'LC ยังรอเก็บตามสถานะฝ่ายขาย',
    'credit-pending-collection-per-sales-status':'เครดิตยังรอเก็บตามสถานะฝ่ายขาย',
    'master-contract-cash-allocation-unconfirmed':'สัญญารวมหลายใบ ยังแยกเงินรับให้ใบนี้ไม่ได้',
    'lc-without-etd-awaiting-condition-not-confirmed-receivable':'LC ยังไม่มี ETD · ยังไม่ถือเป็นยอดลูกหนี้ยืนยันแล้ว',
    'no-verified-installment-and-outstanding-evidence':'ยังไม่มีหลักฐานจำนวนเงินรับและยอดค้างที่ตรวจได้',
    'partial-order-selected-no-installment-proration':'เลือกเพียงบางสินค้าของใบขาย · ไม่เฉลี่ยเงินรับทั้งใบให้แต่ละความหนา',
    'receipt-protected-source-changed':'ข้อมูลต้นทางที่ผูกกับหลักฐานรับเงินเปลี่ยน · ต้องตรวจใหม่ก่อนใช้ยอดเดิม',
    'missing-actual-price':'ยังขาดราคาขายจริงที่ตรงสินค้า',
    'received-date-unconfirmed-not-invented':'รับแล้วตามหลักฐาน แต่ยังไม่ยืนยันวันรับ',
    'old-source-receipt-year-retained':'มีวันรับปีเก่าตามต้นทาง · คงไว้รอตรวจ',
    'source-payment-note-review':'หมายเหตุสถานะเงินต้นทางยังต้องตรวจ',
    'domestic-vat-basis-unconfirmed':'ฐาน VAT ของรายการในประเทศยังไม่ยืนยัน',
    'goods-only-excludes-document-adjustments':'มูลค่าสินค้าไม่รวมค่าธรรมเนียมและใบลดหนี้'
  }[issue]||'มีหลักฐานราคา/เงินที่ยังต้องตรวจเพิ่มเติม');
  const moneyIssuesMarkup = issues => [...new Set(Array.isArray(issues)?issues:[])].map(issue=>`<p class="detail-note">${esc(moneyIssueLabel(issue))}</p>`).join('');
  const financeGroup = id => {
    const group=finance?.views?.[select.value||'all']?.groups?.[String(id)];
    if(group)return group;
    if(finance&&select.value!=='all'&&!rows.some(row=>num(row.t)===num(select.value)))return {sale:{THB:0,USD:0},received:{THB:0,USD:0},pending:{THB:0,USD:0},unconfirmed:{THB:0,USD:0},saleComplete:true,missingPriceLineCount:0,unconfirmedLineCount:0,lineCount:0,orders:[],receiptEvents:[]};
    return null;
  };
  const displayDate = value => {
    if(!value)return 'ยังไม่ระบุวัน';
    const match=String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${Number(match[1])+543}` : String(value);
  };
  const uniqueReceiptEvents = events => {
    const seen=new Map();return (Array.isArray(events)?events:[]).filter(event=>{
      const id=typeof event?.id==='string'?event.id.trim():'';
      if(!id)return true;const signature=JSON.stringify([event.amount,event.currency,event.date,event.month,event.kind]);
      const signatures=seen.get(id)||new Set();if(signatures.has(signature))return false;signatures.add(signature);seen.set(id,signatures);return true;
    });
  };
  const receiptEventMarkup = events => {
    if(!Array.isArray(events)||!events.length)return '<p class="small muted">ยังไม่มีรายการวันและจำนวนรับเงินที่แยกยืนยันได้ · ไม่ใช้ ETD แทนวันรับเงิน</p>';
    const unique=uniqueReceiptEvents(events);
    return `<ul class="receipt-events">${unique.map(event=>{
      const future=event.date && finance?.metadata?.asOf && event.date>finance.metadata.asOf;
      const old=event.date && finance?.metadata?.cashAsOf && event.date.slice(0,4)<finance.metadata.cashAsOf.slice(0,4);
      const date=event.date ? displayDate(event.date) : event.month ? `เดือน ${String(event.month).slice(5)}/${Number(String(event.month).slice(0,4))+543} · ยังไม่ทราบวัน` : 'ยังไม่ยืนยันวันรับ';
      const kind=({deposit:'มัดจำ',balance:'ส่วนที่เหลือ',full:'รับเต็ม', 'owner-confirmed-full':'เจ้าของยืนยันรับเต็ม'})[event.kind]||'รับตามหลักฐาน';
      return `<li><div class="receipt-event-head"><span>${esc(date)}</span><b>${esc(nativeMoney(event.amount,event.currency))}</b></div><span class="receipt-event-source">${esc(kind)}${event.ref?' · '+esc(event.ref):''}${event.customer?' · '+esc(event.customer):''}</span>${future?'<span class="money-unverified">วันที่รับอยู่ในอนาคต · ข้อมูลต้องตรวจ ไม่ใช่เงินคาดว่าจะเข้า</span>':old?'<span class="money-unverified">ปีเก่าตามต้นทาง · ยังไม่แก้วันเอง</span>':''}</li>`;
    }).join('')}</ul>`;
  };
  const nativeComponents = map => map&&moneyNumber(map.THB)&&moneyNumber(map.USD)?nativeMoney(map.THB,'THB')+' + '+nativeMoney(map.USD,'USD'):'ยังไม่มีข้อมูลสกุลเงินที่ตรวจแล้ว';
  const usdComponentMarkup = map => {
    if(!moneyNumber(map?.USD)||map.USD<=0)return '';
    const rate=finance?.metadata?.fx?.rate,converted=moneyNumber(rate)&&rate>0?map.USD*rate:null;
    return '<div class="money-conversion">ส่วน USD → '+(moneyNumber(converted)?'≈ ฿ '+moneyFmt(converted):'รอยืนยันอัตราแลกเปลี่ยน')+' · เฉพาะส่วนดอลลาร์ ไม่ใช่ยอดรวม</div>';
  };
  const partitionLabels = {received:'รับแล้ว · ส่วนยืนยัน',pending:'รอรับ · ส่วนยืนยัน',unconfirmed:'ยังแยกรับ/รอรับไม่ได้'};
  const moneyPartitionOrders = (group,kind,options={}) => {
    const unique=new Map(),blocked=new Set();let missingIdentity=0;
    const included=order=>options.unknownPrices?!hasMoney(order?.[kind])&&order?.saleComplete===false:hasMoney(order?.[kind]);
    for(const order of Array.isArray(group?.orders)?group.orders:[]){
      if(!order||typeof order!=='object')continue;
      const sourceRowIds=[...new Set((order.rowIds||[]).filter(id=>typeof id==='string'&&id.trim()))].sort();
      const identity=typeof order.orderId==='string'&&order.orderId.trim()?'order:'+order.orderId:sourceRowIds.length?'rows:'+JSON.stringify(sourceRowIds):null;
      if(!identity){if(included(order))missingIdentity++;continue;}if(blocked.has(identity))continue;
      const signature=JSON.stringify([order.ref,order.customer,order.term,order.sourcePayment,order.sale,order.received,order.pending,order.unconfirmed,order.saleComplete,!!order.wholeOrderContext]);
      const previous=unique.get(identity);
      if(previous&&previous.signature!==signature){unique.delete(identity);blocked.add(identity);continue;}
      if(previous){
        const events=[...(previous.order.receiptEvents||[]),...(order.receiptEvents||[])],eventIds=new Map();let receiptConflict=!!previous.order.receiptConflict;
        for(const event of events){const id=typeof event?.id==='string'?event.id.trim():'';if(!id)continue;const signature=JSON.stringify([event.amount,event.currency,event.date,event.month,event.kind]);if(eventIds.has(id)&&eventIds.get(id)!==signature)receiptConflict=true;eventIds.set(id,signature);}
        previous.order={...previous.order,rowIds:[...new Set([...(previous.order.rowIds||[]),...(order.rowIds||[])])],receiptEvents:uniqueReceiptEvents(events),receiptConflict};continue;
      }
      unique.set(identity,{signature,order});
    }
    const orders=[...unique.values()].map(value=>value.order).filter(included),totals={THB:0,USD:0};
    let invalid=0;
    for(const order of orders)for(const currency of ['THB','USD']){const value=order[kind]?.[currency];if(!moneyNumber(value)||value<0)invalid++;else totals[currency]+=value;}
    const expected=group?.[kind],matched=!missingIdentity&&!blocked.size&&!invalid&&['THB','USD'].every(currency=>moneyNumber(expected?.[currency])&&Math.abs(expected[currency]-totals[currency])<0.005);
    return {orders,totals,matched,conflictCount:blocked.size,missingIdentity,invalid};
  };
  const partitionOrderStatus = order => {
    const sourceRows=rows.filter(row=>(order.rowIds||[]).includes(row.id));
    const refs=[...new Set([order.ref,...sourceRows.map(row=>row.sourceRefText)].filter(value=>typeof value==='string').flatMap(value=>value.split(/\r?\n/)).map(value=>value.trim()).filter(Boolean))];
    const statuses=[...new Set(sourceRows.map(row=>[row.sourceStatus,productStatusLabel(row.productStatus)].filter(Boolean).join(' / ')).filter(Boolean))];
    return '<p class="partition-order-source">เอกสารต้นทาง: '+esc(refs.join('\n')||'ยังไม่ระบุเอกสาร')+'</p><p class="small">เงื่อนไข '+esc(order.term||'ยังไม่ระบุ')+' · สถานะเงินต้นทาง: '+esc(order.sourcePayment||'ยังไม่ระบุ')+'</p>'+(statuses.length?'<p class="small muted">งานขาย / สินค้า: '+esc(statuses.join(' · '))+'</p>':'');
  };
  const partitionOrderReceipts = (order,kind) => {
    const events=(Array.isArray(order.receiptEvents)?order.receiptEvents:[]).filter(event=>moneyNumber(event.amount)&&event.amount>0&&['THB','USD'].includes(event.currency));
    if(kind==='received'){
      let html=receiptEventMarkup(events);
      if(order.receiptConflict)html+='<p class="money-coverage">รหัสงวดรับซ้ำแต่หลักฐานขัดกัน · วันที่และจำนวนที่แสดงเป็นบริบท ต้องทวนต้นทางก่อนยืนยัน ไม่เติมหรือรวมงวดซ้ำ</p>';
      const totals={THB:0,USD:0};for(const event of uniqueReceiptEvents(events))totals[event.currency]+=event.amount;
      if(events.length&&!['THB','USD'].every(currency=>moneyNumber(order.received?.[currency])&&Math.abs(totals[currency]-order.received[currency])<0.005))html+='<p class="money-coverage">วันรับ / จำนวนงวดยังเทียบยอดรับของใบนี้ไม่ครบ · ไม่เติมส่วนที่ขาดเอง</p>';
      return html;
    }
    return '<p class="small muted">'+(kind==='pending'?'ยังไม่มีวันรับ/กำหนดเก็บที่ยืนยัน · ไม่ใช้ ETD แทนวันรับ':'ยังไม่ยืนยันว่าเป็นเงินรับแล้วหรือยอดรอรับ · ไม่ถือทั้งหมดเป็นหนี้ที่ยืนยันแล้ว')+'</p>'+(order.receiptDateText?'<p class="small muted">ข้อความวันรับต้นทาง (บริบทเท่านั้น ไม่ใช้เติมจำนวนเงิน): '+esc(order.receiptDateText)+'</p>':'');
  };
  const moneyPartitionDetails = (group,kind) => {
    const detail=moneyPartitionOrders(group,kind),label=partitionLabels[kind],equivalent=moneyTHB(detail.totals);
    const list=detail.orders.map(order=>{
      const map=order[kind],value=moneyTHB(map);
      return '<li class="partition-order" data-partition-order="'+esc(order.orderId)+'"><div class="partition-order-heading"><strong>'+esc(order.customer||'ไม่ระบุลูกค้า')+'</strong><b class="num">'+(moneyNumber(value)?'≈ ฿ '+moneyFmt(value):'รอยืนยันอัตราแลกเปลี่ยน')+'</b></div><p class="money-native">'+esc(nativeComponents(map))+' · เฉพาะส่วนนี้</p>'+partitionOrderStatus(order)+partitionOrderReceipts(order,kind)+(order.wholeOrderContext?'<p class="money-coverage">เลือกบางสินค้าของใบขาย · ไม่เฉลี่ยเงินรับหรือยอดค้างทั้งใบให้ความหนานี้ เงินส่วนที่เลือกยังแยกไม่ได้</p>':'')+moneyIssuesMarkup(order.issues)+'</li>';
    }).join('');
    const unknown=kind==='unconfirmed'?moneyPartitionOrders(group,kind,{unknownPrices:true}):null;
    const unknownList=unknown?.orders.length?'<section class="unknown-price-orders"><h4>ยังขาดราคาขายจริง / ไม่ทราบมูลค่า · '+fmt(unknown.orders.length)+' ใบ</h4><p class="small muted">ไม่รวมในยอดเงินที่ทราบด้านบน · ไม่ถือเป็นราคา 0</p><ul class="partition-orders">'+unknown.orders.map(order=>'<li class="partition-order"><strong>'+esc(order.customer||'ไม่ระบุลูกค้า')+'</strong><p class="money-coverage">ไม่ทราบมูลค่า · ยังขาดราคาขายจริง</p>'+partitionOrderStatus(order)+moneyIssuesMarkup(order.issues)+'</li>').join('')+'</ul></section>':'';
    return '<details class="money-partition-details" data-money-partition="'+kind+'"><summary>ดูรายละเอียด '+esc(label)+' · '+fmt(detail.orders.length)+' ใบ'+(unknown?.orders.length?' + รอราคา '+fmt(unknown.orders.length)+' ใบ':'')+'</summary><p class="small muted">แสดงเฉพาะใบที่มีจำนวนเงินมากกว่า 0 ในส่วนนี้ · ใบเดียวไม่นับซ้ำตามจำนวนบรรทัดสินค้า</p>'+(list?'<ul class="partition-orders">'+list+'</ul>':'<p class="small muted">ไม่มีรายการจำนวนเงินบวกที่ตรวจได้ในส่วนนี้ · ไม่ได้แปลว่าทุกรายการรับครบแล้ว</p>')+'<p class="partition-subtotal">รวมรายละเอียด: '+esc(nativeComponents(detail.totals))+(moneyNumber(equivalent)?' = ≈ ฿ '+moneyFmt(equivalent):' · รอยืนยันอัตราแลกเปลี่ยน')+'</p><p class="'+(detail.matched?'small muted':'money-coverage')+'">'+(detail.matched?'ตรงกับยอดสรุปส่วนนี้':'รายละเอียดกับยอดสรุปยังเทียบไม่ครบ · คงยอดต้นทาง ไม่แก้หรือเดาตัวเลข')+'</p>'+unknownList+(detail.conflictCount||detail.missingIdentity||detail.invalid||unknown?.conflictCount||unknown?.missingIdentity?'<p class="money-coverage">ข้อมูลซ้ำขัดกัน / รหัสหรือสกุลเงินไม่ครบ ต้องตรวจต้นทางก่อนสรุป</p>':'')+(num(group.missingPriceLineCount)?'<p class="money-coverage">ยังขาดราคา '+fmt(group.missingPriceLineCount)+' บรรทัด · ไม่รวมเป็นราคา 0 และยังสรุปครบไม่ได้</p>':'')+'</details>';
  };
  const partitionRoundingNote = group => {
    const total=moneyTHB(group.sale),parts=['received','pending','unconfirmed'].map(kind=>moneyTHB(group[kind]));
    if(!moneyNumber(total)||!parts.every(moneyNumber))return '';
    const difference=parts.reduce((sum,value)=>sum+Math.round(value*100),0)-Math.round(total*100);
    if(!difference||Math.abs(parts.reduce((a,b)=>a+b,0)-total)>0.005)return '';
    return '<p class="money-rounding-note">ยอดย่อยที่ปัด 2 ตำแหน่งรวมต่างจากยอดรวม '+moneyFmt(Math.abs(difference)/100)+' บาทจากการปัดเศษ · ไม่ปรับยอดต้นทาง</p>';
  };
  const moneyPartitions = (group,options={}) => {
    if(!group)return '';
    const unresolved=hasMoney(group.unconfirmed)||num(group.unconfirmedLineCount)>0||num(group.missingPriceLineCount)>0;
    const portion=(map,unknown=false)=>{
      if(!hasMoney(map)&&unknown)return 'รอยืนยัน';
      const value=moneyTHB(map);return moneyNumber(value)?'≈ ฿ '+moneyFmt(value):'รอยืนยัน';
    };
    return '<div class="money-partitions">'+['received','pending','unconfirmed'].map(kind=>{
      const unknown=kind==='unconfirmed'?num(group.missingPriceLineCount)>0:unresolved;
      return '<div class="money-partition '+(kind==='unconfirmed'?'unconfirmed':'')+'"><div class="money-partition-heading"><span>'+partitionLabels[kind]+'</span><strong class="num">'+portion(group[kind],unknown)+'</strong></div><p class="money-native">'+esc(nativeComponents(group[kind]))+(unknown?' · เฉพาะส่วนที่ทราบ':'')+'</p>'+usdComponentMarkup(group[kind])+(options.details?moneyPartitionDetails(group,kind):'')+'</div>';
    }).join('')+'</div>'+partitionRoundingNote(group);
  };
  const financeCardMarkup = id => {
    const group=financeGroup(id);
    if(!group)return '<div class="metric-money"><span class="money-coverage">ยังไม่มีข้อมูลมูลค่าที่ตรวจแล้วสำหรับความหนานี้</span></div>';
    const missing=num(group.missingPriceLineCount);const known=moneyTHB(group.sale);
    const label=num(id)===4?'มูลค่าตามราคาต้นทาง · รอเงื่อนไข':num(id)===0?'มูลค่ารายการทั้งหมด · ราคาขายจริง':'มูลค่ากลุ่มนี้ · ราคาขายจริง';
    const cancelledCount=[...new Set((group.orders||[]).flatMap(order=>order.rowIds||[]))].filter(id=>finance?.byRowId?.[id]?.sale?.status==='cancelled-no-demand').length;
    const coverage=missing?`ยอดที่ทราบ · ยังขาดราคา ${fmt(missing)} บรรทัด ไม่ตีเป็น 0`:num(group.lineCount)?`มูลค่าครบ ${fmt(num(group.lineCount)-cancelledCount)} บรรทัดที่มีจำนวน${cancelledCount?` · ยกเลิก ${fmt(cancelledCount)} บรรทัด = 0`:''}`:'ไม่มีรายการขายในกลุ่มนี้';
    const convertedUSD=moneyNumber(group.sale?.USD)&&moneyNumber(finance?.metadata?.fx?.rate)&&finance.metadata.fx.rate>0?group.sale.USD*finance.metadata.fx.rate:null;
    const events=Array.isArray(group.receiptEvents)?group.receiptEvents:[];
    return `<div class="metric-money" data-money-group="${esc(id)}"><div class="money-label">${label}</div><strong class="money-value num">${moneyNumber(known)?`≈ ฿ ${moneyFmt(known)}`:'รอข้อมูลมูลค่า'}</strong><div class="money-native">ต้นทาง: ${esc(nativeComponents(group.sale))}</div>${num(group.sale?.USD)>0?`<div class="money-conversion">ส่วน USD → ${moneyNumber(convertedUSD)?'≈ ฿ '+moneyFmt(convertedUSD):'รอยืนยันอัตราแลกเปลี่ยน'} · เฉพาะส่วนดอลลาร์ ไม่ใช่ยอดรวม</div>`:''}<div class="money-coverage ${missing?'':'complete'}">${coverage}</div>${moneyPartitions(group,{details:num(id)===0})}${num(group.unconfirmedLineCount)?`<p class="money-coverage">${fmt(group.unconfirmedLineCount)} บรรทัดยังแยกรับ/รอรับไม่ได้${num(id)===4?' · ไม่ถือเป็นลูกหนี้ยืนยันแล้ว':''}</p>`:''}${num(id)===0?'<p class="small muted">มูลค่าสินค้าตามหลักฐานฝ่ายขาย ไม่ใช่ยอดเข้าธนาคาร · วันที่หรือจำนวนไม่ครบแสดงรอตรวจ ไม่เดา</p>':`<details class="money-receipts"><summary>รายละเอียดเงิน · วันรับ ${fmt(events.length)} รายการ</summary><p class="small muted">รับแล้ว: ${esc(nativeMap(group.received))}<br>รอรับ: ${esc(nativeMap(group.pending))}<br>ยังแยกไม่ได้: ${esc(nativeMap(group.unconfirmed))}<br>ตัวเลขด้านบนเป็นเฉพาะส่วนที่ยืนยันได้ ไม่ใช้ 0 แทนส่วนที่รอตรวจ</p>${receiptEventMarkup(events)}${moneyIssuesMarkup(group.issues)}<p class="small muted">มูลค่าสินค้าตามหลักฐานฝ่ายขาย ไม่ใช่ยอดเข้าธนาคาร · งวดเดียวไม่นับซ้ำตามบรรทัด</p></details>`}</div>`;
  };
  const orderMoneyMarkup = r => {
    const line=finance?.byRowId?.[r.id];
    if(!line)return '';
    const sale=line.sale||{};const verified=sale.status==='verified'&&moneyNumber(sale.amount);const cancelled=sale.status==='cancelled-no-demand';
    const group=financeGroup(r.queue?.group??line.group);const order=(group?.orders||[]).find(item=>item.orderId===line.orderId);
    const whole=order?.wholeOrderSettlement;
    return `<section class="money-order-detail" aria-label="ราคาขายจริงและหลักฐานเงิน"><h3>ราคาขายจริงของสินค้าบรรทัดนี้ · ไม่ใช้ราคาประเมินสต๊อก</h3><dl class="detail-grid"><div><dt>ราคาต่อ ${esc(unitLabel(r.unit))}</dt><dd>${verified?esc(nativeUnitPrice(sale.unitPrice,sale.currency)):cancelled?'ไม่ใช้ราคา · รายการยกเลิก':'ยังไม่ยืนยัน'}</dd></div><div><dt>มูลค่าสินค้าบรรทัดนี้</dt><dd>${verified?esc(nativeMoney(sale.amount,sale.currency)):cancelled?'ยกเลิกจำนวน 0 · ไม่สร้างมูลค่า':'ยังขาดราคาจริง · ไม่ตีเป็น 0'}</dd></div><div><dt>เงื่อนไขราคา / เอกสารต้นทาง</dt><dd>${esc(sale.commercialTerm||'ไม่ระบุ')} · ${esc(sale.sourceDocument||r.ref)}</dd></div></dl><p class="detail-note">${esc(sale.source||'ยังไม่พบหลักฐานราคาที่ตรงรายการ')}${sale.reason?' · '+esc(moneyIssueLabel(sale.reason)):''}</p>${order?`<h3 style="margin-top:12px">เงินของใบขาย ${esc(order.ref)} · ไม่บวกซ้ำตามบรรทัด</h3>${moneyPartitions({...order,missingPriceLineCount:order.saleComplete?0:1,unconfirmedLineCount:hasMoney(order.unconfirmed)?1:0})}${order.wholeOrderContext?'<p class="detail-note money-unverified">ที่เลือกเป็นเพียงบางสินค้าของใบขาย จึงไม่เฉลี่ยเงินรับทั้งใบมาใส่ความหนานี้ · เงินของส่วนที่เลือกยังแยกไม่ได้</p>':''}${receiptEventMarkup(order.receiptEvents)}${moneyIssuesMarkup(order.issues)}${whole?`<details class="money-receipts"><summary>ดูเงินทั้งใบประกอบ · ไม่รวมในยอดความหนานี้</summary><p>${esc(nativeMap(order.wholeOrderSale))}</p><p class="small">รับแล้ว ${esc(nativeMoney(whole.receivedAmount,whole.currency))} · รอรับ ${esc(nativeMoney(whole.pendingAmount,whole.currency))} · ยังแยกไม่ได้ ${esc(nativeMoney(whole.unconfirmedAmount,whole.currency))}</p>${receiptEventMarkup(whole.receiptEvents)}</details>`:''}`:''}</section>`;
  };
  const freeData = data.freeStock || null;
  const freeView = () => freeData?.views?.[select.value||'all'] || null;
  let freePanelOpen=uiState.freePanelOpen;
  const freeQuantityMarkup = view => ['sheet','strip'].filter(unit=>num(view?.totals?.[unit]?.qty)>0).map(unit=>`<span class="units-block">${fmt(view.totals[unit].qty)}<span class="subqty">${esc(unitLabel(unit))}</span></span>`).join('')||'0<span class="subqty">แผ่น</span>';
  const freeEquivalentMarkup = view => {
    const sheet=view?.totals?.sheet?.eq25;const strip=view?.totals?.strip?.eq25;
    const known=moneyNumber(sheet)&&moneyNumber(strip);
    return `<div class="metric-equivalent"><span>เทียบ 4×8 · หนา 2.5 มม. รวมไม้แถบ</span><span class="equiv-value num">${known?'≈ '+fmtEquivalent(sheet+strip):'รอตรวจขนาด'} <small>แผ่นเทียบ</small></span>${num(strip)>0?`<span class="subqty">ส่วนไม้แถบ ≈ ${fmtEquivalent(strip)} แผ่นเทียบ</span>`:''}</div>`;
  };
  const freeCardMarkup = () => {
    const view=freeView();const value=view?.valuation;const metadata=freeData?.metadata||{};
    if(!view)return '<div class="metric free-card" data-queue-group="5"><div class="label">5 · Free Stock</div><p class="money-coverage">ยังไม่มีฐาน Free ที่ตรวจแล้วสำหรับความหนานี้</p></div>';
    const known=value?.knownValueTHB;
    return `<div class="metric free-card" data-queue-group="5"><div class="label">5 · Free Stock · ฐานเดิม</div><strong class="num">${freeQuantityMarkup(view)}</strong>${freeEquivalentMarkup(view)}<p class="free-basis-tag">ฐาน ${esc(displayDate(metadata.reportDate))} · ไม่ใช่ Free หลังคิวใหม่</p><div class="metric-money"><div class="money-label">มูลค่าประเมิน Free · ราคาสต๊อกที่บันทึกไว้</div><strong class="money-value num">${moneyNumber(known)?`≈ ฿ ${moneyFmt(known)}`:'รอข้อมูลราคา'}</strong><div class="money-coverage ${value?.complete?'complete':''}">${value?.complete?`คำนวณราคาได้ครบ ${fmt(value.valuedSpecCount)} สเปก`:`ส่วนที่ทราบ ${fmt(value?.valuedSpecCount)} / ${fmt(value?.totalSpecCount)} สเปก · ไม่ตีราคาที่ขาดเป็น 0`}</div><p class="small muted">${fmt(view.specCount)} สเปกมี Free${num(view.pendingSpecCount)?` · ${fmt(view.pendingSpecCount)} สเปกรอทวนฐาน`:''}</p></div><button type="button" class="plainbutton free-detail-button" id="free-detail-toggle" aria-controls="free-detail-panel" aria-expanded="${freePanelOpen}">${freePanelOpen?'ย่อ':'ดู'}รายการ Free · ราคาและหมายเหตุ</button></div>`;
  };
  const freeNoteMarkup = row => {
    const key=noteKey(row);
    if(!key||key!==(row.noteKey||row.key))return '<span class="free-note-state">สเปกหมายเหตุไม่ตรงสินค้า · ยังแก้ไขไม่ได้</span>';
    return notesField(row,'free');
  };
  const refreshFreeStockPanel = () => {
    const root=document.getElementById('free-detail-panel');root.hidden=!freePanelOpen;if(!freePanelOpen)return;
    const active=document.activeElement,caret=active?.dataset?.noteSurface==='free'?{key:active.dataset.stockNote,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection}:null;
    const view=freeView();if(!view){root.innerHTML='<p>ยังไม่มีฐาน Free สำหรับความหนานี้</p>';return;}
    const metadata=freeData?.metadata||{};const values=[...(view.rows||[])].sort((a,b)=>num(a.t)-num(b.t)||String(a.grade).localeCompare(String(b.grade))||num(a.w)-num(b.w)||num(a.l)-num(b.l)||String(a.unit).localeCompare(String(b.unit)));
    root.innerHTML=`<div class="panel-heading"><div><h2>Free Stock · ${select.value==='all'?'ทุกความหนา':esc(thick(select.value))+' มม.'}</h2><p class="free-basis-tag">ฐาน ${esc(displayDate(metadata.reportDate))} · ไม่ใช่ยอดคงเหลือหลังคิวใหม่ · ${fmt(values.length)} สเปก</p><p class="small muted">${esc(metadata.sourceLabel||'')} · ${esc(metadata.fxLabel||'')}</p></div><button type="button" class="plainbutton" id="free-detail-close">ย่อรายละเอียด</button></div><div class="stock-notes-actions free-notes-actions"><button type="button" class="plainbutton" id="free-notes-stage" disabled>ตรวจและบันทึกหมายเหตุ</button><span class="small muted">ใช้ชุดเดียวกับปุ่มด้านบน · รวมร่างหมายเหตุและติดตามที่แก้ไว้</span></div><div class="table-scroll"><table class="free-list"><thead><tr><th>หนา / เกรด / ขนาด</th><th class="number">Free ฐานเดิม</th><th class="number">ราคาสต๊อก / หน่วย</th><th class="number">มูลค่าประเมิน</th><th>หมายเหตุสินค้า · แก้ไขตามสิทธิ์</th></tr></thead><tbody>${values.map(row=>`<tr data-free-key="${esc(row.key)}"><td>${esc(thick(row.t))} มม. · ${esc(row.grade)}<span class="subqty">${esc(dimensions(row))} มม.</span>${row.pending?'<span class="pending-free">รอทวนฐานหลังสถานะขายเปลี่ยน</span>':''}</td><td class="number">${fmt(row.free)}<span class="subqty">${esc(unitLabel(row.unit))}</span></td><td class="number">${esc(nativeUnitPrice(row.price,row.currency))}</td><td class="number">${moneyNumber(row.valueTHB)?'≈ ฿ '+moneyFmt(row.valueTHB):'ยังคำนวณไม่ได้'}${row.currency==='USD'&&moneyNumber(row.valueNative)?`<span class="subqty">${esc(nativeMoney(row.valueNative,'USD'))}</span>`:''}</td><td class="free-note">${freeNoteMarkup(row)}</td></tr>`).join('')}</tbody></table></div><p class="detail-note">ใช้ราคาสต๊อกที่บันทึกไว้ ไม่ใช่ราคาขายจริงในใบขาย · แก้หมายเหตุได้ตรงนี้ · ใช้ร่างเดียวกับทะเบียนด้านล่าง แล้วกด “บันทึกการเปลี่ยนแปลง” ด้านบน · ช่องว่างข้าม ไม่ลบหมายเหตุเดิม</p>`;
    bindNoteEditors(root);document.getElementById('free-notes-stage').addEventListener('click',stageNotes);updateNotesControls();
    if(caret){const restored=[...root.querySelectorAll('[data-stock-note]')].find(input=>input.dataset.stockNote===caret.key);if(restored&&!restored.disabled){restored.focus({preventScroll:true});restored.setSelectionRange(caret.start,caret.end,caret.direction);}}
    document.getElementById('free-detail-close').addEventListener('click',()=>{freePanelOpen=false;uiState.freePanelOpen=false;refreshFreeStockPanel();const toggle=document.getElementById('free-detail-toggle');if(toggle){toggle.textContent='ดูรายการ Free · ราคาและหมายเหตุ';toggle.setAttribute('aria-expanded','false');toggle.focus();}});
  };
  const renderMoneySourceNote = () => {
    const root=document.getElementById('money-source-note');const metadata=finance?.metadata;root.hidden=!metadata;if(!metadata)return;
    root.innerHTML=`<strong>ฐานเงิน:</strong> ราคาขายตรวจ ${esc(displayDate(metadata.priceAsOf))} · หลักฐานเงิน ${esc(displayDate(metadata.cashAsOf))} · สถานะขาย ${esc(displayDate(metadata.salesAsOf))} · USD → บาท ${moneyNumber(metadata.fx?.rate)?metadata.fx.rate.toFixed(4):'ยังไม่ยืนยัน'} (อัตราวันที่ ${esc(displayDate(metadata.fx?.date))}) · เป็นข้อมูลชุดที่ตรวจไว้ ไม่ใช่อัปเดตอัตโนมัติ<br>รับแล้ว/รอรับเป็นส่วนมูลค่าสินค้าตามหลักฐานฝ่ายขาย ไม่ใช่ยอดธนาคาร · ${esc(metadata.warning||'ส่วนที่ราคา/เงินไม่ครบแสดงแยก ไม่ใช้ 0 แทน')}`;
  };
  const commercialTag = r => {
    const c=r.commercial;
    if(!c)return '<span class="payment-badge">รอตรวจวิธีชำระ</span>';
    const cls=c.termKind==='LC'?'lc':c.termKind==='TT'&&c.soldByOwnerRule===true?'received':'';
    return `<span class="payment-badge ${cls}">${esc(c.summaryLabel)}</span>`;
  };
  const commercialDetail = r => {
    const c=r.commercial;
    if(!c)return '<p class="detail-note">ยังไม่มีข้อมูลวิธีชำระที่ตรวจแล้ว</p>';
    const notes=Array.isArray(c.notes)?c.notes:[];
    return `<section class="commercial-detail" aria-label="สถานะขายและรับเงิน"><h3>การขายและรับเงิน · แยกจากการจัดสรรสต๊อก</h3><dl class="detail-grid"><div><dt>วิธีชำระตามต้นทาง</dt><dd>${esc(c.termLabel || r.term || 'ไม่ระบุ')}</dd></div><div><dt>สถานะการขายตามเกณฑ์ TT/LC</dt><dd>${esc(c.salesLabel)}</dd></div><div><dt>สถานะเงิน</dt><dd>${esc(c.receiptLabel)}</dd></div><div><dt>วันรับเงิน / วันรอรับ</dt><dd class="receipt-date">${esc(c.receiptDateLabel || 'รอฝ่ายขายระบุ')}</dd></div></dl>${notes.map(note=>`<p class="detail-note">${esc(note)}</p>`).join('')}</section>${orderMoneyMarkup(r)}`;
  };
  const orderKey = r => String(r.orderId ?? r.ref ?? r.id);
  const uniqueOrders = values => new Set(values.map(orderKey)).size;
  const uniqueCustomers = values => new Set(values.map(r=>String(r.customer))).size;
  const sumUnits = values => {
    const result = {};
    values.forEach(r=>{
      const u=unitKey(r.unit); const entry=result[u] || (result[u]=Object.fromEntries(keys.map(k=>[k,0])));
      entry.ordered += num(r.qty); ['loaded','allocated','shortage','unreserved','pendingQty'].forEach(k=>entry[k]+=num(r[k]));
    });
    return result;
  };
  const totalsMarkup = (totals,key,zeroDash=false,labels=false) => Object.entries(totals).map(([u,t])=>`<span class="units-block">${zeroDash&&t[key]===0?'—':fmt(t[key])}${labels?` <span class="subqty">${esc(unitLabel(u))}</span>`:''}</span>`).join('') || '—';
  // Display projection only: exact source dimensions, with unit groups kept separate.
  const equivalentArea = (values,key='ordered') => {
    const result={};
    for(const row of values){
      const unit=unitKey(row.unit),entry=result[unit]||(result[unit]={value:0,missing:0}),quantity=key==='ordered'?row.qty:row[key];
      if(quantity===null||quantity===undefined||!Number.isFinite(Number(quantity))||Number(quantity)<0){entry.missing++;continue;}
      if(Number(quantity)===0)continue;
      if(![row.w,row.l,row.t].every(value=>Number.isFinite(Number(value))&&Number(value)>0)){entry.missing++;continue;}
      entry.value+=Number(quantity)*Number(row.w)*Number(row.l)/(1220*2440);
    }
    return result;
  };
  const areaEquivalentMarkup = (values,key='ordered') => {
    const totals=equivalentArea(values,key);
    return '<div class="metric-equivalent area-equivalent" data-equivalent-kind="area" title="จำนวน × กว้าง × ยาว ÷ (1220 × 2440) · ใช้ขนาดต้นทางจริง ไม่เปลี่ยนความหนา"><span>เทียบ 4×8 · ความหนาเดิม</span>'+Object.entries(totals).map(([unit,total])=>'<span class="equiv-value num" data-area-unit="'+esc(unit)+'">'+(total.missing?'รอตรวจขนาด/จำนวน '+fmt(total.missing)+' รายการ':'≈ '+fmtEquivalent(total.value))+' <small>'+(total.missing?'':'แผ่นเทียบ · ')+(unit==='strip'?'จากไม้แถบ':unit==='sheet'?'จากแผ่น':esc(unitLabel(unit)))+'</small></span>').join('')+'</div>';
  };
  const equivalent25 = (values,key) => {
    const result = {};
    values.forEach(r => {
      const u = unitKey(r.unit);
      const entry = result[u] || (result[u] = {value:0,missing:0});
      const quantity = key==='ordered' ? r.qty : r[key];
      // Unknown allocation belongs to pendingQty, never a fabricated zero allocation.
      if(quantity===null || quantity===undefined) return;
      if(!Number.isFinite(Number(quantity)) || Number(quantity)<0) { entry.missing++; return; }
      if(Number(quantity)===0) return;
      if(![r.w,r.l,r.t].every(n=>Number.isFinite(Number(n))&&Number(n)>0)) { entry.missing++; return; }
      entry.value += Number(quantity)*Number(r.w)*Number(r.l)*Number(r.t)/(1220*2440*2.5);
    });
    return result;
  };
  const equivalentMarkup = (values,key) => `<div class="metric-equivalent" data-equivalent-key="${key}" title="จำนวน × กว้าง × ยาว × หนา ÷ (1220 × 2440 × 2.5) · ใช้ขนาดต้นทางจริง"><span>เทียบ 4×8 · หนา 2.5 มม.</span>${Object.entries(equivalent25(values,key)).map(([u,total])=>`<span class="equiv-value num">${total.missing?'รอตรวจขนาด/จำนวน':'≈ '+fmtEquivalent(total.value)} <small>${total.missing?'':'แผ่นเทียบ'}${u==='strip'?' · จากไม้แถบ':''}</small></span>`).join('')}</div>`;
  const anyUnreserved = values => values.some(r=>num(r.unreserved)>0);
  const anyPending = values => values.some(r=>num(r.pendingQty)>0);
  const counts = values => `${fmt(uniqueOrders(values))} ใบขาย · ${fmt(values.length)} บรรทัดสินค้า · ${fmt(uniqueCustomers(values))} ลูกค้า`;
  const numeric = (value,kind='',unit='sheet') => value===null ? '<td class="number muted small" aria-label="ยังไม่ยืนยันจำนวน">ยังไม่ยืนยัน</td>' : `<td class="number ${kind}${num(value)===0?' zero':''}" aria-label="${fmt(value)} ${esc(unitLabel(unit))}">${num(value)===0?'—':fmt(value)}</td>`;
  const subsetCount = (values,key) => values.filter(r=>num(r[key])>0).length;
  const selectedRows = value => value==='all' ? rows : rows.filter(r=>num(r.t)===num(value));
  const select = document.getElementById('thickness');
  let thicknesses=[];
  const syncThicknessOptions = () => {
    const previous=select.value||'all';
    thicknesses=[...new Set([...rows,...pools,...notesState.liveRows.values()].map(r=>num(r.t)).filter(t=>t>0))].sort((a,b)=>a-b);
    select.replaceChildren();
    const option=document.createElement('option');option.value='all';option.textContent=`ทุกความหนา · ${thicknesses.length} ความหนา`;select.append(option);
    thicknesses.forEach(t=>{const item=document.createElement('option');const group=selectedRows(t);item.value=String(t);item.textContent=`${thick(t)} มม. · ${group.length?group.length+' บรรทัดขาย':'ทะเบียนสต๊อก · ไม่มีขายเดือนนี้'}`;select.append(item);});
    select.value=[...select.options].some(item=>item.value===previous)?previous:'all';
  };
  syncThicknessOptions();
  if ([...select.options].some(option=>option.value===uiState.thickness)) select.value=uiState.thickness;
  const showCounts = (values,key) => `${fmt(subsetCount(values,key))} บรรทัดสินค้า`;
  const renderMetrics = values => {
    const totals=sumUnits(values);const extra=anyUnreserved(values);const pending=anyPending(values);const root=document.getElementById('metrics');root.classList.toggle('has-unreserved',extra||pending);
    const definitions=[['ordered','สั่งทั้งหมด','',counts(values)],['loaded','โหลดแล้ว','loaded',`${showCounts(values,'loaded')} · ไม่หักของซ้ำ`],['allocated','มีของรองรับรอส่ง','ready',`${showCounts(values,'allocated')} · ฐานจัดสรร ฐานเดิม · เฉพาะส่วนไม่กระทบ`],['shortage','ต้องผลิตเพิ่ม','need',`${showCounts(values,'shortage')} · ฐานจัดสรร ฐานเดิม · เฉพาะส่วนไม่กระทบ`]];
    if(extra)definitions.push(['unreserved','ยังไม่จอง','',`${showCounts(values,'unreserved')} · ไม่หักสต๊อก`]);
    if(pending)definitions.push(['pendingQty','รอทวนจัดสรร','',`${showCounts(values,'pendingQty')} · ยังไม่เดายอด`]);
    root.innerHTML=definitions.map(([key,label,cls,description])=>`<div class="metric ${cls}" data-metric-key="${key}"><div class="label">${label}</div><strong class="num">${totalsMarkup(totals,key,false,true)}</strong>${key==='ordered'?areaEquivalentMarkup(values,key):''}${equivalentMarkup(values,key)}<div class="small muted">${esc(description)}</div></div>`).join('');
    document.getElementById('unreserved-note').hidden=!extra;
    document.getElementById('pending-note').hidden=!pending;
    root.classList.toggle('has-pending',pending&&extra);
  };
  const equation = values => {
    const totals=sumUnits(values);const extra=anyUnreserved(values);const pending=anyPending(values);
    return `<div class="checks">${Object.entries(totals).map(([u,t])=>`<span>${fmt(t.ordered)} = ${fmt(t.loaded)} โหลดแล้ว + ${fmt(t.allocated)} มีของ + ${fmt(t.shortage)} ต้องผลิต${extra?` + ${fmt(t.unreserved)} ยังไม่จอง`:''}${pending?` + ${fmt(t.pendingQty)} รอทวน`:''} ${esc(unitLabel(u))}</span>`).join('')}</div>`;
  };
  const totalsCells = (values,extra,pending=anyPending(values)) => {const totals=sumUnits(values);return ['ordered','loaded','allocated','shortage',...(extra?['unreserved']:[]),...(pending?['pendingQty']:[])].map(key=>`<td class="number">${totalsMarkup(totals,key,false,Object.keys(totals).length>1)}</td>`).join('');};
  const stateLabel = r => r.cancelled ? 'ยกเลิกตามต้นทาง · จำนวน 0 · คงรายการไว้เพื่อตรวจสอบ' : num(r.pendingQty)>0||r.state==='pending' ? 'รอทวนจัดสรร · ไม่ใช้ยอดเดิมแทนยอดล่าสุด' : num(r.loaded)>0 ? 'โหลดแล้ว · ไม่หักสต๊อกซ้ำ' : num(r.unreserved)>0 ? 'ยังไม่จอง · ไม่หักสต๊อกและไม่รวมต้องผลิต' : num(r.allocated)>0&&num(r.shortage)>0 ? 'มีของบางส่วน · ต้องผลิตส่วนที่ขาด' : num(r.allocated)>0 ? 'มีของครบตามแผน' : num(r.shortage)>0 ? 'ยังไม่มีของตรงสเปก · ต้องผลิตทั้งหมด' : 'ดูสถานะต้นทางในรายละเอียด';
  const partTable = r => {
    const parts=Array.isArray(r.parts)?r.parts:[];
    if(r.cancelled)return '<p class="small muted">ต้นทางระบุยกเลิกและจำนวน 0 คงบรรทัดไว้ตรวจสอบโดยไม่เพิ่มยอดสั่ง จอง หรือผลิต</p>';
    if(num(r.pendingQty)>0||r.state==='pending')return '<p class="small muted">ยังไม่คำนวณการจัดสรรล่าสุด: ต้องทวนรายการที่เปลี่ยนและฐาน Physical ก่อน ช่อง “มีของ / ต้องผลิต” จึงแสดงว่ารอทวน ไม่ใช่ศูนย์</p>'+priorPartTable(r);
    if(num(r.loaded)>0)return '<p class="small muted">ไม่นำรายการโหลดแล้วมาจัดสรรจากสต๊อกอีกครั้ง</p>'+priorPartTable(r);
    if(num(r.unreserved)>0)return '<p class="small muted">คงรายการต้นทางไว้ แต่ไม่นำไปจองสต๊อกหรือคำนวณเป็นงานผลิตตามกติกา Forecast / เจรจา</p>'+priorPartTable(r);
    if(!parts.length)return '<p class="small muted">ไม่มีรายละเอียดกองสต๊อกในข้อมูลชุดนี้</p>';
    return `<div class="table-scroll"><table class="pool-table"><thead><tr><th>กองสต๊อก / เกรด</th><th class="number">ต้องการ</th><th class="number">ก่อนจัดสรร</th><th class="number">จัดให้บรรทัดนี้</th><th class="number">ต้องผลิต</th><th class="number">คงเหลือหลังบรรทัดนี้</th></tr></thead><tbody>${parts.map(p=>`<tr><td>${esc(dimensions(p))} · ${esc(p.grade)}<span class="subqty">หนา ${esc(thick(p.t))} มม. · ${esc(unitLabel(p.unit ?? r.unit))}</span></td>${numeric(p.requested,'',p.unit??r.unit)}${numeric(p.availableBefore,'',p.unit??r.unit)}${numeric(p.allocated,'ready-val',p.unit??r.unit)}${numeric(p.shortage,'need-val',p.unit??r.unit)}${numeric(p.remaining,'',p.unit??r.unit)}</tr>`).join('')}</tbody></table></div><p class="detail-note">“คงเหลือหลังบรรทัดนี้” คือจุดนั้นในคิวจัดสรรเดิม ไม่ใช่ Free สุดท้ายของทั้งแผน · ดู Free สุดท้ายในหัวข้อฐานสต๊อกด้านล่าง</p>`;
  };
  const priorPartTable = r => {
    const parts=Array.isArray(r.priorParts)?r.priorParts:[];
    if(!parts.length)return '';
    return `<details class="basis"><summary class="small">ดูแผนเดิม ฐานเดิม · ไม่ใช่ยอดล่าสุด</summary><div class="table-scroll"><table class="pool-table"><thead><tr><th>กองสต๊อก / เกรดเดิม</th><th class="number">ก่อนจัดสรรเดิม</th><th class="number">มีของเดิม</th><th class="number">ต้องผลิตเดิม</th><th class="number">คงเหลือเดิม</th></tr></thead><tbody>${parts.map(p=>`<tr><td>${esc(dimensions(p))} · ${esc(p.grade)}<span class="subqty">${esc(thick(p.t))} มม. · ${esc(unitLabel(p.unit??r.unit))}</span></td>${numeric(p.availableBefore,'',p.unit??r.unit)}${numeric(p.allocated,'',p.unit??r.unit)}${numeric(p.shortage,'',p.unit??r.unit)}${numeric(p.remaining,'',p.unit??r.unit)}</tr>`).join('')}</tbody></table></div><p class="detail-note">ใช้เทียบความเปลี่ยนแปลงเท่านั้น ไม่ได้นำยอดเดิมนี้ไปรวมเป็นยอดมีของหรือต้องผลิตล่าสุด</p></details>`;
  };
  const renderAll = values => {
    const extra=anyUnreserved(values);const pending=anyPending(values);const mixedUnits=new Set(values.map(r=>unitKey(r.unit))).size>1;
    const headers=`<tr><th>ความหนา</th><th>ใบขาย / บรรทัด</th><th class="number">สั่งทั้งหมด</th><th class="number">โหลดแล้ว</th><th class="number">มีของ</th><th class="number">ต้องผลิต</th>${extra?'<th class="number">ยังไม่จอง</th>':''}${pending?'<th class="number">รอทวนจัดสรร</th>':''}<th>รายการ</th></tr>`;
    document.getElementById('table-area').innerHTML=`<div class="table-shell"><div class="table-scroll" role="region" aria-label="ภาพรวมทุกความหนา"><table class="thickness-table"><thead>${headers}</thead><tbody>${thicknesses.map(t=>{const group=selectedRows(t);const totals=sumUnits(group);return `<tr><td class="thickness-cell">${esc(thick(t))} <span class="small muted">มม.</span></td><td>${fmt(uniqueOrders(group))} ใบ<span class="subqty">${fmt(group.length)} บรรทัดสินค้า</span></td>${['ordered','loaded','allocated','shortage',...(extra?['unreserved']:[]),...(pending?['pendingQty']:[])].map((key,i)=>`<td class="number ${['','loaded-val','ready-val','need-val','',''][i]}">${totalsMarkup(totals,key,true,mixedUnits)}</td>`).join('')}<td><button type="button" class="expand thickness-link" data-thickness="${t}" aria-label="ดูรายการหนา ${esc(thick(t))} มิลลิเมตร">ดู ▸</button></td></tr>`;}).join('')}</tbody><tfoot><tr><th>รวมทุกความหนา</th><td>${fmt(uniqueOrders(values))} ใบไม่ซ้ำ<span class="subqty">${fmt(values.length)} บรรทัดสินค้า</span></td>${totalsCells(values,extra)}<td></td></tr></tfoot></table></div><div class="sum-note">${equation(values)}</div></div>`;
    document.querySelectorAll('.thickness-link').forEach(button=>button.addEventListener('click',()=>{select.value=button.dataset.thickness;render();document.getElementById('table-title').scrollIntoView({block:'nearest'});}));
  };
  const renderRows = values => {
    const extra=anyUnreserved(values);const pending=anyPending(values);const cols=8+(extra?1:0)+(pending?1:0);const body=document.createElement('tbody');body.id='orders';
    values.forEach((r,i)=>{
      const tr=document.createElement('tr');tr.className='order-main'+(i>0&&num(values[i-1].loaded)>0&&num(r.loaded)===0?' group-start':'');tr.dataset.ref=String(r.ref);
      tr.innerHTML=`<td class="n num">${i+1}</td><td class="customer"><strong>${esc(r.customer)}</strong><span class="ref">${esc(r.ref)}</span>${commercialTag(r)}${r.cancelled?'<span class="subqty">ยกเลิกตามต้นทาง · จำนวน 0</span>':''}</td><td class="spec">${esc(dimensions(r))}<span class="grade">${esc(gradeLabel(r.grade))} · ${esc(unitLabel(r.unit))}</span></td>${numeric(r.qty,'',r.unit)}${numeric(r.loaded,'loaded-val',r.unit)}${numeric(r.allocated,'ready-val',r.unit)}${numeric(r.shortage,'need-val',r.unit)}${extra?numeric(r.unreserved,'',r.unit):''}${pending?numeric(r.pendingQty,'',r.unit):''}<td><button type="button" class="expand" aria-expanded="false" aria-controls="detail-${i}" aria-label="ดูรายละเอียดรายการ ${i+1} ${esc(r.customer)}">ดู ▾</button></td>`;
      const details=document.createElement('tr');details.className='order-detail';details.id=`detail-${i}`;details.hidden=true;
      details.innerHTML=`<td colspan="${cols}"><div class="detail-inner"><div class="detail-heading"><span class="status">${esc(stateLabel(r))}</span><span class="small muted">บรรทัด ${i+1} · ${esc(r.ref)}</span></div>${commercialDetail(r)}<dl class="detail-grid"><div><dt>งานขาย / สินค้า ตามหน้า 09</dt><dd>${esc(r.sourceStatus || 'ไม่ระบุ')} / ${esc(productStatusLabel(r.productStatus))}</dd></div><div><dt>ข้อความสถานะเงินต้นทาง · เก็บไว้ตรวจสอบ</dt><dd class="source-ref">${esc(r.payment || 'ไม่ระบุ')}</dd></div><div><dt>ETD ตามหน้า 09 · ไม่ใช่วันรับเงิน</dt><dd>${esc(r.etd || 'ไม่ระบุ')}</dd></div><div><dt>ช่องวันรับเงินต้นทาง · เก็บข้อความเดิม</dt><dd class="source-ref">${esc(r.receiptDateText || '—')}</dd></div>${r.sourceRefText&&String(r.sourceRefText)!==String(r.ref)?`<div><dt>ชื่อเอกสาร / Invoice ตามต้นทาง</dt><dd class="source-ref">${esc(r.sourceRefText)}</dd></div>`:''}</dl>${r.statusBasis?`<p class="detail-note">หลักฐานการจัดสถานะ: ${esc(r.statusBasis)}</p>`:''}${partTable(r)}${sourceNotes(r.notes)?`<p class="detail-note">หมายเหตุต้นทาง: ${esc(sourceNotes(r.notes))}</p>`:''}</div></td>`;
      const button=tr.querySelector('button');button.addEventListener('click',()=>{const open=details.hidden;details.hidden=!open;button.setAttribute('aria-expanded',String(open));button.textContent=open?'ย่อ ▴':'ดู ▾';button.setAttribute('aria-label',`${open?'ย่อ':'ดู'}รายละเอียดรายการ ${i+1} ${r.customer}`);tr.classList.toggle('selected',open);});body.append(tr,details);
    });
    const root=document.getElementById('table-area');root.innerHTML=`<div class="table-shell"><div class="table-scroll" role="region" aria-label="รายการสินค้าแยกความหนา"><table class="orders ${extra||pending?'with-unreserved':''}"><thead><tr><th class="n">#</th><th>ลูกค้า / ใบขาย</th><th>ขนาด (มม.) / เกรด</th><th class="number">สั่งทั้งหมด</th><th class="number">โหลดแล้ว</th><th class="number">มีของ</th><th class="number">ต้องผลิต</th>${extra?'<th class="number">ยังไม่จอง</th>':''}${pending?'<th class="number">รอทวนจัดสรร</th>':''}<th>รายละเอียด</th></tr></thead><tfoot><tr><th colspan="3">รวม ${values.length} บรรทัด · ${uniqueOrders(values)} ใบขาย</th>${totalsCells(values,extra)}<td></td></tr></tfoot></table></div><div class="sum-note">${equation(values)}</div></div>`;root.querySelector('table').insertBefore(body,root.querySelector('tfoot'));
  };
  const noteKey = r => {
    if(!r||![r.t,r.w,r.l].every(v=>Number.isFinite(Number(v))&&Number(v)>0)||!['sheet','strip'].includes(r.unit)||typeof r.grade!=='string'||!/^[A-Z]+$/.test(r.grade))return null;
    return [Number(r.t),r.grade,...[Number(r.w),Number(r.l)].sort((a,b)=>a-b),r.unit].join('|');
  };
  const stockRowsForNotes = () => {
    const result=new Map(pools.map(p=>[noteKey(p),p]));
    for(const [key,row] of notesState.liveRows)if(!result.has(key))result.set(key,{...row,key,historicalMissing:true,physical:null,allocatedOctober:null,allocatedOther:null,free:null});
    return [...result.values()].sort((a,b)=>num(a.t)-num(b.t)||num(a.w)-num(b.w)||num(a.l)-num(b.l)||String(a.grade).localeCompare(String(b.grade))||String(a.unit).localeCompare(String(b.unit)));
  };
  const workbookTracking = typeof data==='object'&&data.trackingImport ? data.trackingImport : {items:[]};
  const workbookBySpec = new Map((workbookTracking.items||[]).map(r=>[r.key,r]));
  const trackingDate = value => {
    if(!value)return '—';
    if(!/^\d{4}-\d{2}-\d{2}T/.test(value)||!Number.isFinite(Date.parse(value)))return String(value);
    return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  };
  const workbookTrackingRecords = p => {
    const item=workbookBySpec.get(noteKey(p));if(!item)return [];
    const groups=new Map();
    for(const record of item.records){const identity=JSON.stringify([record.followup,record.followupBy,record.followupAt]);if(!groups.has(identity))groups.set(identity,{...record,sourceRows:[]});groups.get(identity).sourceRows.push(record.excelRow);}
    return [...groups.values()];
  };
  const trackingFields = p => {
    const key=noteKey(p),records=workbookTrackingRecords(p),live=notesState.liveRows.get(key)?.records||[];
    const editable=notesState.loaded&&notesState.canEditFollowup&&!notesBusy&&!notesState.pending;
    const suggestion=live.length===1&&records.length===1?String(records[0].followup||''):'';
    const history=records.length?'<details class="tracking-history"><summary>ข้อมูลจาก Excel เดิม · ไม่ใช่ข้อมูลส่วนกลางล่าสุด</summary>'+records.map(record=>'<p>'+esc(record.followup||'(ไม่มีข้อความ)')+'<small class="tracking-source">'+esc(record.followupBy||'ไม่ระบุผู้ติดตาม')+' · '+esc(trackingDate(record.followupAt))+'</small></p>').join('')+'</details>':'';
    const fields=live.map(record=>{
      const draft=notesState.followupDrafts.get(record.rawKey),conflict=notesState.followupConflicts.get(record.rawKey),value=draft?draft.after:record.followup;
      const status=conflict?'ส่วนกลางเปลี่ยน ต้องทวนก่อนบันทึก':draft?draft.after===''?'ร่างล้างข้อความ · ต้องยืนยัน':'ร่างยังไม่เซฟ':notesState.canEditFollowup?'อ่านจากส่วนกลาง · บันทึกเมื่อกดปุ่มด้านบน':'ดูอย่างเดียว · ต้องเข้าสู่ระบบบัญชีที่มีสิทธิ์ติดตาม';
      return '<div class="tracking-record"><small class="tracking-source">ส่วนกลาง'+(live.length>1?' · รหัส '+esc(record.rawKey):'')+'</small><textarea data-followup-edit="'+esc(record.rawKey)+'" maxlength="4000" rows="3" aria-label="ติดตามการขาย '+esc(key)+' '+esc(record.rawKey)+'" '+(editable?'':'disabled')+'>'+esc(value)+'</textarea><div class="note-row-status '+(conflict?'conflict':'')+'" data-followup-status="'+esc(record.rawKey)+'">'+esc(status)+'</div>'+(suggestion&&suggestion!==value&&editable?'<button type="button" class="plainbutton" data-followup-suggest="'+esc(record.rawKey)+'" data-followup-spec="'+esc(key)+'">ใช้ข้อความจากไฟล์เป็นร่าง</button>':'')+(conflict?'<div class="note-conflict"><strong>ส่วนกลางล่าสุด</strong><pre>'+esc(conflict.remote||'(ว่าง)')+'</pre><button type="button" class="plainbutton" data-followup-use-remote="'+esc(record.rawKey)+'">ใช้ส่วนกลาง</button>'+(notesState.rawRecords.has(record.rawKey)&&notesState.canEditFollowup?'<button type="button" class="plainbutton" data-followup-keep-draft="'+esc(record.rawKey)+'">ใช้ร่างนี้ · รอยืนยัน</button>':'')+'</div>':'')+'</div>';
    }).join('');
    const noLive=!notesState.loaded?'ยังไม่โหลดข้อมูลส่วนกลาง · ข้อความจากไฟล์เป็นหลักฐานเดิมเท่านั้น':'ไม่พบแถวส่วนกลางที่แก้ไขได้ · ไม่เลือกหรือสร้างรหัสแทน';
    const meta=field=>live.length?live.map(record=>'<div class="tracking-record">'+esc(field==='followupAt'?trackingDate(record[field]):record[field]||'—')+(live.length>1?'<small class="tracking-source">'+esc(record.rawKey)+'</small>':'')+'</div>').join(''):'<span class="muted">—</span>';
    return '<td class="tracking-cell" data-followup-key="'+esc(key)+'">'+(live.length>1?'<p class="tracking-conflict">มีหลายแถวจริง · แก้แยกตามรหัส ไม่รวมข้อความ</p>':'')+(fields||'<p class="small muted">'+esc(noLive)+'</p>')+history+'</td><td class="tracking-meta" data-followup-by-key="'+esc(key)+'">'+meta('followupBy')+'<small class="tracking-source">ระบบบันทึกผู้แก้ ไม่ให้กรอกแทน</small></td><td class="tracking-meta" data-followup-at-key="'+esc(key)+'">'+meta('followupAt')+'<small class="tracking-source">เวลาส่วนกลาง · ไม่ใช้เวลาจากไฟล์แทน</small></td>';
  };
  const setNotesStatus = (text,tone='') => {notesState.status=text;notesState.tone=tone;updateNotesControls();};
  const updateNotesControls = () => {
    const payload=currentChanges(),total=payload.notesChanges.length+payload.followupChanges.length;
    const transport=typeof services.saveChanges==='function'||(!payload.followupChanges.length&&typeof services.saveNotes==='function');
    const denied=payload.notesChanges.length&&!notesState.canSave||payload.followupChanges.length&&!notesState.canEditFollowup;
    const blocked=notesBusy||!notesState.loaded||notesState.retryBlocked||notesState.conflicts.size>0||notesState.followupConflicts.size>0||!total||!transport||!!denied;
    document.getElementById('notes-connect').hidden=true;
    document.getElementById('notes-refresh').disabled=notesBusy||typeof services.readNotes!=='function';
    document.getElementById('notes-stage').disabled=blocked;
    document.getElementById('changes-stage').disabled=blocked;
    document.getElementById('changes-count').textContent='ยังไม่บันทึก: หมายเหตุ '+notesState.drafts.size+' สเปก · ติดตาม '+notesState.followupDrafts.size+' แถว'+(notesBusy?' · กำลังทำรายการ':'');
    document.getElementById('changes-permission').textContent=notesState.loaded&&!notesState.canEditFollowup?'การติดตามดูอย่างเดียว · เข้าสู่ระบบบัญชีที่มีสิทธิ์เพื่อแก้ไข':'ผู้ติดตามและเวลาให้ระบบบันทึกหลังเซฟ';
    for(const id of ['notes-file','notes-file-column','notes-file-mode'])document.getElementById(id).disabled=notesBusy||!notesState.canSave||notesState.retryBlocked||!!notesState.drafts.size||!!notesState.followupDrafts.size||typeof services.prepareNotesFile!=='function';
    const freeSave=document.getElementById('free-notes-stage');if(freeSave)freeSave.disabled=blocked;
    syncNoteEditorPermissions();
    const status=document.getElementById('notes-status');status.className='notes-status '+notesState.tone;
    status.textContent=notesState.status+(notesState.drafts.size||notesState.followupDrafts.size?' · ยังมีร่างที่ไม่เซฟ':'')+(notesState.conflicts.size+notesState.followupConflicts.size?' · ต้องทวนข้อความ '+(notesState.conflicts.size+notesState.followupConflicts.size)+' รายการ':'');
  };
  const notesField = (p,surface='stock') => {
    const key=noteKey(p);const draft=notesState.drafts.get(key);const file=workbookBySpec.get(key);const fileNote=(file?.legacyNotes||[]).join('\n');const value=draft?draft.after:notesState.loaded?(notesState.notes.get(key)||''):fileNote;
    const conflict=notesState.conflicts.get(key);const connected=notesState.loaded&&notesState.liveRows.has(key);
    const label=`หมายเหตุ ${thick(p.t)} มม. ${p.grade} ${dimensions(p)} ${unitLabel(p.unit)} · ${surface==='free'?'Free Stock':'ทะเบียน'}`;
    const status=conflict?'ข้อความส่วนกลางเปลี่ยน / ต้องตรวจสเปกก่อนส่ง':draft?'ร่างในแท็บนี้ · ยังไม่เซฟ':!notesState.loaded?fileNote?'สำเนาหมายเหตุเดิมจาก Excel · เชื่อมเพื่ออ่านส่วนกลางล่าสุด':'ยังไม่โหลดหมายเหตุส่วนกลาง':!connected?'ไม่พบสเปกนี้ในทะเบียนส่วนกลางที่เพิ่งอ่าน':value?'หมายเหตุร่วมกับ Free Stock · อ่านจากส่วนกลาง':'อ่านแล้ว · ยังไม่มีหมายเหตุเฉพาะสเปก';
    const content=`<textarea data-stock-note="${esc(key)}" data-note-surface="${esc(surface)}" maxlength="4000" rows="3" aria-label="${esc(label)}" placeholder="${notesState.loaded?'พิมพ์หมายเหตุจัดการสินค้านี้':'กรอกร่างได้ · เชื่อม Free Stock ก่อนตรวจและเซฟ'}" ${notesBusy||notesState.pending||notesState.loaded&&(!notesState.canSave||!connected)?'disabled':''}>${esc(value)}</textarea><div class="note-row-status ${conflict?'conflict':''}" data-note-status="${esc(key)}">${esc(status)}</div>${conflict?`<div class="note-conflict"><strong>ข้อความส่วนกลางล่าสุด</strong><pre>${esc(conflict.remote||'(ไม่มีข้อความเฉพาะสเปก)')}</pre><button type="button" class="plainbutton" data-note-use-remote="${esc(key)}">ใช้ข้อความส่วนกลาง</button>${notesState.liveRows.has(key)?`<button type="button" class="plainbutton" data-note-keep-draft="${esc(key)}">ใช้ร่างนี้แทน · รอยืนยันอีกครั้ง</button>`:'<p>สเปกไม่อยู่ในทะเบียนล่าสุด ยังส่งบันทึกไม่ได้</p>'}</div>`:''}${file?.stockNotes?.length?`<div class="file-stock-note"><strong>หมายเหตุสต๊อกในไฟล์</strong><br>${file.stockNotes.map(esc).join('<br>')}</div>`:''}`;
    return surface==='free'?content:'<td class="stock-note-cell">'+content+'</td>';
  };
  function noteEditorContainers(){return [document.getElementById('stock-table'),document.getElementById('free-detail-panel')].filter(Boolean);}
  function syncNoteEditorPermissions(){
    for(const root of noteEditorContainers())for(const input of root.querySelectorAll('[data-stock-note]')){
      input.disabled=notesBusy||!!notesState.pending||notesState.loaded&&(!notesState.canSave||!notesState.liveRows.has(input.dataset.stockNote));
    }
  }
  function syncNoteEditors(key,sourceInput){
    const value=notesState.drafts.has(key)?notesState.drafts.get(key).after:notesState.notes.get(key)||'';
    const status=notesState.conflicts.has(key)?'มีข้อความส่วนกลางเปลี่ยน · เลือกวิธีจัดการก่อนเซฟ':notesState.drafts.has(key)?value.trim()?'ร่างร่วมกัน · ยังไม่เซฟ':'เว้นว่างจะข้าม ไม่ลบหมายเหตุเดิม':value?'หมายเหตุส่วนกลาง · ใช้ร่วมกันทั้งสองจุด':'อ่านแล้ว · ยังไม่มีหมายเหตุเฉพาะสเปก';
    for(const root of noteEditorContainers()){
      for(const input of root.querySelectorAll('[data-stock-note]'))if(input.dataset.stockNote===key&&input!==sourceInput&&input.value!==value)input.value=value;
      for(const label of root.querySelectorAll('[data-note-status]'))if(label.dataset.noteStatus===key)label.textContent=status;
    }
  }
  function editNote(input){
    const key=input.dataset.stockNote;
    if(input.disabled||notesBusy||notesState.pending||notesState.loaded&&(!notesState.canSave||!notesState.liveRows.has(key)))return;
    const existing=notesState.drafts.get(key),before=existing?existing.before:notesState.loaded?(notesState.notes.get(key)||''):null;
    if(notesState.loaded&&input.value===(notesState.notes.get(key)||'')){notesState.drafts.delete(key);notesState.conflicts.delete(key);}
    else notesState.drafts.set(key,{before,after:input.value});
    syncNoteEditors(key,input);updateNotesControls();
  }
  function bindNoteEditors(root){
    root.querySelectorAll('[data-stock-note]').forEach(input=>input.addEventListener('input',()=>editNote(input)));
    root.querySelectorAll('[data-note-use-remote]').forEach(button=>button.addEventListener('click',()=>{
      const key=button.dataset.noteUseRemote;notesState.drafts.delete(key);notesState.conflicts.delete(key);renderStock(select.value);refreshFreeStockPanel();
    }));
    root.querySelectorAll('[data-note-keep-draft]').forEach(button=>button.addEventListener('click',()=>{
      const key=button.dataset.noteKeepDraft,draft=notesState.drafts.get(key);if(!draft||!notesState.canSave||!notesState.liveRows.has(key)||notesState.pending)return;
      draft.before=notesState.notes.get(key)||'';notesState.conflicts.delete(key);renderStock(select.value);refreshFreeStockPanel();
    }));
  }
  const renderStock = value => {
    const active=document.activeElement;const caret=active&&active.dataset&&active.dataset.noteSurface!=='free'&&(active.dataset.stockNote||active.dataset.followupEdit)?{key:active.dataset.stockNote||active.dataset.followupEdit,kind:active.dataset.stockNote?'stockNote':'followupEdit',start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection}:null;
    const allStock=stockRowsForNotes();const selected=value==='all'?allStock:allStock.filter(p=>num(p.t)===num(value));
    const totals={};selected.filter(p=>!p.historicalMissing).forEach(p=>{const u=unitKey(p.unit);const t=totals[u]||(totals[u]={physical:0,allocatedOctober:0,allocatedOther:0,free:0});Object.keys(t).forEach(k=>{t[k]=t[k]===null||typeof p[k]!=='number'||!Number.isFinite(p[k])?null:t[k]+p[k];});});
    const currentStock=metadata.stockPoolBasis==='current-central-stock-saved-ledger';
    const stockLabels=currentStock?{physical:'ส่วนกลาง · '+esc(metadata.stockReportDate||'วันที่ยังไม่ยืนยัน'),month:'จัดให้เดือนที่เลือก · รอทวนคิวใหม่',other:'จัดให้เดือนอื่น · รอทวนคิวใหม่',free:'Free ส่วนกลาง · แผนที่บันทึก',total:'รวมส่วนกลาง',pending:'รอทวนคิวใหม่ · ยังไม่จัดสรร'}:{physical:'ฐานเดิม',month:'จัดให้เดือนที่เลือกเดิม',other:'จัดให้เดือนอื่นเดิม',free:'Free แผน ฐานเดิม',total:'รวมฐานเดิม',pending:'คิวเดิมเปลี่ยนแล้ว · รอทวน'};
    document.getElementById('stock-title').textContent=`ทะเบียนทุกเกรด / ทุกขนาด · ${value==='all'?'ทุกความหนา':thick(value)+' มม.'} · ${selected.length} สเปก · ติดตามการขายและหมายเหตุ`;
    const stock=document.getElementById('stock-table');
    const quantity=(p,key,kind='')=>p.historicalMissing?'<td class="number small muted">ไม่มีฐานเดิม</td>':typeof p[key]!=='number'||!Number.isFinite(p[key])?'<td class="number small muted">ยังไม่ยืนยัน</td>':`<td class="number ${kind}">${fmt(p[key])}</td>`;
    if(!selected.length){stock.innerHTML='<p class="no-data">ไม่มีทะเบียนสต๊อกสำหรับความหนานี้ในข้อมูลที่ตรวจแล้ว</p>';return;}
    stock.innerHTML=`<p class="stock-basis-warning">${esc(metadata.stockPoolWarning || 'ตัวเลขจัดสรร / Free เป็นฐานเดิม ไม่ใช่ยอดว่างล่าสุด และไม่ได้คืนจองหรือจัดสรรใหม่')}</p><p class="stock-catalog-count">แสดงครบ ${selected.length} สเปก รวม Physical = 0 และ Free = 0 · กลับด้านกว้าง×ยาวใช้หมายเหตุเดียวกัน · ไม่เพิ่มรายการขาย</p><p class="tracking-import-note">${esc(workbookTracking.description||'ข้อมูลติดตามตามสเปกที่ตรงกัน · ไม่ใช้ยอดหรือราคาในไฟล์ · ไม่เติมชื่อหรือเวลาแทนช่องว่าง')}</p><div class="table-scroll" role="region" aria-label="ทะเบียนสต๊อกครบทุกเกรดขนาดและหมายเหตุ"><table class="basis-table with-notes with-tracking"><thead><tr><th>หนา / ขนาด / เกรด</th><th class="number">Physical<br>${stockLabels.physical}</th><th class="number">${stockLabels.month}</th><th class="number">${stockLabels.other}</th><th class="number">${stockLabels.free}</th><th>ติดตามการขาย<small class="tracking-source">ส่วนกลาง · แก้ไขตามสิทธิ์</small></th><th>ผู้ติดตาม<small class="tracking-source">ระบบบันทึก</small></th><th>เวลาติดตาม<small class="tracking-source">เวลาไทย · ระบบบันทึก</small></th><th>หมายเหตุเดิม · ร่วมกับ Free Stock</th></tr></thead><tbody>${selected.map(p=>`<tr data-stock-key="${esc(noteKey(p))}"><td>${esc(thick(p.t))} มม. · ${esc(dimensions(p))} · ${esc(p.grade)}<span class="subqty">${esc(unitLabel(p.unit))}</span>${p.pending?`<span class="pool-pending">${stockLabels.pending}</span>`:''}${p.historicalMissing?'<span class="stock-external-label">ทะเบียนส่วนกลางที่เพิ่มภายหลัง · ไม่เติม 0 ลงฐานเก่า</span>':''}</td>${quantity(p,'physical')}${quantity(p,'allocatedOctober','ready-val')}${quantity(p,'allocatedOther')}${quantity(p,'free')}${trackingFields(p)}${notesField(p)}</tr>`).join('')}</tbody><tfoot>${Object.entries(totals).map(([u,t])=>`<tr><th>${stockLabels.total} · ${esc(unitLabel(u))}</th>${['physical','allocatedOctober','allocatedOther','free'].map(k=>quantity(t,k)).join('')}<td colspan="4">ข้อมูลติดตามและหมายเหตุไม่เปลี่ยนยอด</td></tr>`).join('')}</tfoot></table></div>`;
    bindNoteEditors(stock);
    stock.querySelectorAll('[data-followup-edit]').forEach(input=>input.addEventListener('input',()=>{
      editFollowup(input.dataset.followupEdit,input.value);
      const status=stock.querySelector('[data-followup-status="'+CSS.escape(input.dataset.followupEdit)+'"]');
      if(status)status.textContent=notesState.followupConflicts.has(input.dataset.followupEdit)?'ส่วนกลางเปลี่ยน · ต้องเลือกวิธีจัดการ':input.value===''?'ร่างล้างข้อความ · ต้องยืนยันก่อนเซฟ':'ร่างยังไม่เซฟ';
    }));
    stock.querySelectorAll('[data-followup-suggest]').forEach(button=>button.addEventListener('click',()=>{
      const row=stockRowsForNotes().find(row=>noteKey(row)===button.dataset.followupSpec),live=notesState.liveRows.get(button.dataset.followupSpec)?.records||[],records=row?workbookTrackingRecords(row):[];
      if(live.length!==1||records.length!==1||live[0].rawKey!==button.dataset.followupSuggest)return;
      editFollowup(button.dataset.followupSuggest,String(records[0].followup||''));renderStock(select.value);
    }));
    stock.querySelectorAll('[data-followup-use-remote]').forEach(button=>button.addEventListener('click',()=>{notesState.followupDrafts.delete(button.dataset.followupUseRemote);notesState.followupConflicts.delete(button.dataset.followupUseRemote);renderStock(select.value);}));
    stock.querySelectorAll('[data-followup-keep-draft]').forEach(button=>button.addEventListener('click',()=>{const rawKey=button.dataset.followupKeepDraft,draft=notesState.followupDrafts.get(rawKey),record=notesState.rawRecords.get(rawKey);if(draft&&record&&notesState.canEditFollowup){draft.before=record.followup;notesState.followupConflicts.delete(rawKey);renderStock(select.value);}}));
    const legacy=[...notesState.legacy].filter(([t,note])=>(value==='all'||Number(t)===Number(value))&&note);
    document.getElementById('stock-legacy').innerHTML=legacy.length?`<details class="stock-legacy"><summary>หมายเหตุความหนาเดิม · อ่านอย่างเดียว ไม่กระจายใส่สินค้า (${legacy.length})</summary>${legacy.map(([t,note])=>`<p class="small"><strong>${esc(thick(t))} มม.</strong></p><p class="legacy-note small">${esc(note)}</p>`).join('')}</details>`:'';
    updateNotesControls();
    if(caret){const restored=[...stock.querySelectorAll(caret.kind==='stockNote'?'[data-stock-note]':'[data-followup-edit]')].find(input=>input.dataset[caret.kind]===caret.key);if(restored&&!restored.disabled){restored.focus({preventScroll:true});restored.setSelectionRange(caret.start,caret.end,caret.direction);}}
  };
  function editFollowup(rawKey,after){
    const record=notesState.rawRecords.get(rawKey);if(!record||!notesState.canEditFollowup||notesBusy||notesState.pending)return;
    if(after===record.followup){notesState.followupDrafts.delete(rawKey);notesState.followupConflicts.delete(rawKey);}
    else notesState.followupDrafts.set(rawKey,{before:notesState.followupDrafts.get(rawKey)?.before??record.followup,after});
    updateNotesControls();
  }
  const parseNotesSnapshot = snapshot => {
    if(!snapshot||!Array.isArray(snapshot.rows)||snapshot.rows.length>2000||!snapshot.notesBySpec||typeof snapshot.notesBySpec!=='object'||Array.isArray(snapshot.notesBySpec)||!Number.isSafeInteger(snapshot.revision)||!Number.isSafeInteger(snapshot.catalogRevision)||typeof snapshot.canSave!=='boolean'||typeof snapshot.readAt!=='string'||typeof snapshot.reportDate!=='string'||snapshot.canEditFollowup!==undefined&&typeof snapshot.canEditFollowup!=='boolean')throw Error('รูปแบบข้อมูลหมายเหตุ/ติดตามไม่ครบ จึงยังไม่ใช้ข้อมูลชุดนี้');
    const liveRows=new Map(),rawRecords=new Map();
    for(const row of snapshot.rows){
      const key=noteKey(row);if(!key||row.key!==key||liveRows.has(key))throw Error('สเปกหมายเหตุซ้ำหรือไม่ตรงขนาด เกรด หรือหน่วย');
      const records=Array.isArray(row.records)?row.records.map(record=>{
        const clean={};for(const field of ['rawKey','note','noteBy','noteAt','followup','followupBy','followupAt']){if(typeof record[field]!=='string'||record[field].length>4000)throw Error('ข้อมูลติดตามไม่ผ่านการตรวจรูปแบบ');clean[field]=record[field];}
        if(!clean.rawKey||rawRecords.has(clean.rawKey))throw Error('รหัสแถวติดตามซ้ำหรือไม่ครบ · ไม่รวม/เลือกแถวแทน');
        rawRecords.set(clean.rawKey,{...clean,specKey:key});return clean;
      }):[];
      liveRows.set(key,{key,w:Number(row.w),l:Number(row.l),t:Number(row.t),grade:row.grade,unit:row.unit,records});
    }
    const notes=new Map();for(const [key,note] of Object.entries(snapshot.notesBySpec)){if(typeof note!=='string'||note.length>4000)throw Error('หมายเหตุไม่ผ่านการตรวจรูปแบบ');notes.set(key,note);}
    const legacy=new Map();for(const [t,note] of Object.entries(snapshot.legacyNotesByThickness||{})){if(Number(t)>0&&typeof note==='string'&&note.length<=4000)legacy.set(String(Number(t)),note);}
    return {snapshot,liveRows,rawRecords,notes,legacy};
  };
  const applyNotesSnapshot = snapshot => {
    const parsed=parseNotesSnapshot(snapshot),conflicts=new Map(),followupConflicts=new Map();
    const signature=JSON.stringify({rows:[...parsed.liveRows].sort(),notes:[...parsed.notes].sort(),legacy:[...parsed.legacy].sort(),canSave:snapshot.canSave,canEditFollowup:snapshot.canEditFollowup===true});
    const unchanged=notesState.loaded&&notesState.snapshotSignature===signature;
    for(const [key,draft] of notesState.drafts){const remote=parsed.notes.get(key)||'';
      if(!parsed.liveRows.has(key)){conflicts.set(key,{remote});continue;}
      if(draft.after===remote){if(!snapshot.saveUnresolved)notesState.drafts.delete(key);continue;}
      if((draft.before===null&&remote!=='')||(draft.before!==null&&draft.before!==remote))conflicts.set(key,{remote});
      else if(draft.before===null)draft.before=remote;
    }
    for(const [rawKey,draft] of notesState.followupDrafts){const record=parsed.rawRecords.get(rawKey),remote=record?.followup||'';
      if(!record){followupConflicts.set(rawKey,{remote});continue;}
      if(draft.after===remote){if(!snapshot.saveUnresolved)notesState.followupDrafts.delete(rawKey);continue;}
      if(draft.before!==remote)followupConflicts.set(rawKey,{remote});
    }
    Object.assign(notesState,{connected:true,loaded:true,canSave:snapshot.canSave,canEditFollowup:snapshot.canEditFollowup===true,liveRows:parsed.liveRows,rawRecords:parsed.rawRecords,notes:parsed.notes,legacy:parsed.legacy,conflicts,followupConflicts,revision:snapshot.revision,catalogRevision:snapshot.catalogRevision,readAt:snapshot.readAt,reportDate:snapshot.reportDate,retryBlocked:snapshot.saveUnresolved===true,snapshotSignature:signature});
    if(snapshot.saveUnresolved)setNotesStatus('ผลบันทึกก่อนหน้ายังตรวจไม่ครบ แม้ข้อความตรงแล้ว · เก็บร่างและระงับส่งซ้ำ รอตรวจยอด/ราคาที่ต้องคงเดิม','error');
    if(!unchanged){syncThicknessOptions();renderStock(select.value);if(typeof refreshFreeStockPanel==='function')refreshFreeStockPanel();}else updateNotesControls();
  };
  const queueReview = data.queueReview || {};
  const queueGroups = [1,2,3,4].map(id => (queueReview?.groups || []).find(g => num(g.id) === id) || {id,label:({1:'โหลดแล้ว',2:'รับเงินแล้ว · ยังไม่โหลด',3:'จอง · รอส่ง',4:'รอเงื่อนไข'})[id],description:''});
  const queueRows = queueReview && Array.isArray(queueReview.rows) ? queueReview.rows : rows.filter(r=>r.queue);
  const poolQueues = queueReview && Array.isArray(queueReview.poolQueues) ? queueReview.poolQueues : [];
  const poolRowFor = r => {
    for(const pool of poolQueues){const line=(pool.rows||[]).find(p=>p.rowId===r.id);if(line)return {pool,line};}
    return null;
  };
  const poolOnlyPart = r => {const entry=poolRowFor(r);return entry&&num(entry.line.requested)!==num(r.qty);};
  const queueSelected = value => value==='all' ? queueRows : queueRows.filter(r=>num(r.t)===num(value));
  const queueGroupRows = (values,id) => values.filter(r=>num(r.queue && r.queue.group)===num(id));
  const queueQty = (values,labels=false) => totalsMarkup(sumUnits(values),'ordered',false,labels);
  const queueZeroQty = (values,labels=false) => values.length ? queueQty(values,labels) : `0${labels?'<span class="subqty">แผ่น</span>':''}`;
  const queueEquivalent = values => values.length ? equivalentMarkup(values,'ordered') : '<div class="metric-equivalent" data-equivalent-key="ordered"><span>เทียบ 4×8 · หนา 2.5 มม.</span><span class="equiv-value num">≈ 0.00 <small>แผ่นเทียบ</small></span></div>';
  const queueDate = r => r.queue && r.queue.etdISO ? String(r.queue.etdISO).split('-').reverse().join('/') : 'ยังไม่มี ETD';
  const queueKnown = r => r.queue.eligible && Number.isFinite(r.queue.allocated) && Number.isFinite(r.queue.shortage);
  const queueAllocationLabel = r => r.cancelled ? 'ยกเลิก · คงรายการไว้' : num(r.queue.group)===1 ? 'โหลดแล้ว · ไม่หักซ้ำ' : r.queue.eligible ? 'ยังไม่ยืนยันของที่เหลือให้สเปกนี้' : 'ยังไม่เข้าคิวใหม่นี้';
  const queueAllocationMarkup = r => {
    const entry=poolRowFor(r);
    if(entry){const {pool,line}=entry;return `<div class="queue-confirmed" data-allocation-grade="${esc(pool.grade)}"><span class="subqty">${poolOnlyPart(r)?'เฉพาะส่วน ':''}${esc(pool.grade)} · ก่อนตัด ${fmt(line.availableBefore)}</span><strong class="ready-val">มีของให้ ${fmt(line.allocated)}</strong><br><strong class="need-val">ต้องผลิต ${fmt(line.shortage)}</strong><span class="subqty">เหลือ ${fmt(line.remaining)} ${esc(unitLabel(pool.unit))}${line.etdISO?'':' · ไม่มี ETD จัดท้าย'}</span>${poolOnlyPart(r)?'<div class="queue-partial">ส่วนเกรดอื่นยังไม่ยืนยัน · ไม่ใช่มีของครบทั้งใบ</div>':''}</div>`;}
    return queueKnown(r)
      ? `<div class="queue-confirmed"><strong class="ready-val">มีของแล้ว ${fmt(r.queue.allocated)}</strong><br><strong class="need-val">ต้องผลิตเพิ่ม ${fmt(r.queue.shortage)}</strong><span class="subqty">${esc(unitLabel(r.unit))} · ตัวอย่างจัดสรร เดิม ยังรอตรวจการตัดคลัง</span></div>`
      : `<span class="queue-status ${r.queue.eligible?'':'excluded'}">${esc(queueAllocationLabel(r))}</span>`;
  };
  // Display-only partition of the CURRENT review queue, never the old ledger.
  // Known B parts and provisional AAA examples stay separate from unknown demand.
  const queueShortageSummary = values => {
    const units=new Map();
    for(const r of values){
      if(num(r.queue.group)===1||r.cancelled||num(r.qty)<=0)continue;
      const unit=unitKey(r.unit);
      if(!units.has(unit))units.set(unit,{unit,total:0,knownQty:0,knownAllocated:0,knownShortage:0,provisionalQty:0,provisionalAllocated:0,provisionalShortage:0,pendingQty:0,unallocatedQty:0});
      const s=units.get(unit);const qty=num(r.qty);s.total+=qty;let covered=0;
      const entry=poolRowFor(r);
      if(entry&&Number.isFinite(entry.line.requested)&&Number.isFinite(entry.line.allocated)&&Number.isFinite(entry.line.shortage)&&entry.line.requested>0&&entry.line.requested<=qty&&Math.abs(entry.line.allocated+entry.line.shortage-entry.line.requested)<1e-6&&unitKey(entry.pool.unit)===unit){
        covered=entry.line.requested;s.knownQty+=covered;s.knownAllocated+=entry.line.allocated;s.knownShortage+=entry.line.shortage;
      }else if(!entry&&queueKnown(r)&&Math.abs(r.queue.allocated+r.queue.shortage-qty)<1e-6){
        covered=qty;s.provisionalQty+=qty;s.provisionalAllocated+=r.queue.allocated;s.provisionalShortage+=r.queue.shortage;
      }
      // A B-only result cannot imply availability/shortage for the AAA remainder.
      s[r.queue.eligible?'pendingQty':'unallocatedQty']+=qty-covered;
    }
    return [...units.values()];
  };
  const queueShortageMarkup = values => {
    const summaries=queueShortageSummary(values);
    if(!summaries.length)return '<span class="shortage-subset empty">↳ ต้องผลิตเพิ่ม: ไม่มีรายการ</span>';
    return summaries.map(s=>{
      const label=esc(unitLabel(s.unit));const unresolved=s.pendingQty+s.unallocatedQty;
      let status,caption='',kind='';
      if(s.knownQty===s.total){status=`${fmt(s.knownShortage)} ${label}`;caption='ตามคิวที่จัดแล้วในหน้านี้';kind='complete';}
      else if(s.provisionalQty===s.total){status=`${fmt(s.provisionalShortage)} ${label}*`;caption='* ตัวอย่างจัดสรร · รอตรวจฐาน';kind='provisional';}
      else if(s.knownQty||s.provisionalQty){
        status='ยังสรุปไม่ครบ';kind='partial';const parts=[];
        if(s.knownQty)parts.push(`ส่วนที่จัดแล้ว: ${fmt(s.knownShortage)} ${label}`);
        if(s.provisionalQty)parts.push(`ตัวอย่างจัดสรร: ${fmt(s.provisionalShortage)} ${label}*`);
        if(s.pendingQty)parts.push(`ยอดสั่ง ${fmt(s.pendingQty)} ${label} รอตรวจฐาน`);
        if(s.unallocatedQty)parts.push(`ยอดสั่ง ${fmt(s.unallocatedQty)} ${label} ยังไม่จัดสรร`);
        caption=parts.join('<br>');
      }else{status=s.pendingQty?'รอตรวจฐาน':'ยังไม่จัดสรร';kind='unknown';}
      return `<span class="shortage-subset ${kind}" data-shortage-unit="${esc(s.unit)}" data-known-shortage="${s.knownShortage}" data-provisional-shortage="${s.provisionalShortage}" data-unresolved-demand="${unresolved}">↳ ต้องผลิตเพิ่ม: <span class="shortage-value">${status}</span>${caption?`<span class="shortage-caption">${caption}</span>`:''}</span>`;
    }).join('');
  };
  const queueNumber = (value,kind='',unit='sheet') => typeof value!=='number'||!Number.isFinite(value) ? numeric(null,kind,unit) : `<td class="number ${kind}">${fmt(value)}</td>`;
  const queueKnownSummary = values => {
    const localB=values.map(poolRowFor).filter(Boolean);const known=values.filter(r=>queueKnown(r)&&!poolRowFor(r));
    const parts=[];
    if(localB.length)parts.push(`ส่วนกองที่จัดแล้ว: มีของ ${fmt(localB.reduce((s,e)=>s+e.line.allocated,0))} / ต้องผลิต ${fmt(localB.reduce((s,e)=>s+e.line.shortage,0))} แผ่น${values.some(poolOnlyPart)?' · ยังไม่รวมส่วนอื่นของใบผสม':''}`);
    if(known.length)parts.push(`ตัวอย่างจัดสรร ${known.length} บรรทัด: มีของ ${fmt(known.reduce((s,r)=>s+r.queue.allocated,0))} / ต้องผลิต ${fmt(known.reduce((s,r)=>s+r.queue.shortage,0))} แผ่น · รอตรวจการตัดคลัง`);
    return parts.join(' | ')||'จำนวนมีของ / ต้องผลิตของกลุ่มจองยังไม่ยืนยัน';
  };
  const queueEquation = values => {
    const units=[...new Set(values.map(r=>unitKey(r.unit)))];
    return `<div class="checks">${units.map(u=>{const subset=values.filter(r=>unitKey(r.unit)===u);const total=subset.reduce((n,r)=>n+num(r.qty),0);return `<span>${fmt(total)} = ${queueGroups.map(g=>`${fmt(queueGroupRows(subset,g.id).reduce((n,r)=>n+num(r.qty),0))} กลุ่ม ${esc(g.id)}`).join(' + ')} ${esc(unitLabel(u))}</span>`;}).join('')}</div>`;
  };
  const renderQueueMetrics = values => {
    const root=document.getElementById('metrics');root.className='overview queue-metrics';
    const groups=[{id:0,label:'สั่งทั้งหมด',description:counts(values)},...queueGroups];
    root.innerHTML=groups.map(g=>{const subset=num(g.id)===0?values:queueGroupRows(values,g.id);const cls=({1:'loaded',2:'ready',3:'need'})[num(g.id)]||'';return `<div class="metric ${cls}" data-queue-group="${esc(g.id)}"><div class="label">${num(g.id)?`${esc(g.id)} · `:''}${esc(g.label)}</div><strong class="num">${queueZeroQty(subset,true)}</strong>${num(g.id)===0?areaEquivalentMarkup(subset):''}${queueEquivalent(subset)}<div class="small muted">${num(g.id)?`${fmt(subset.length)} บรรทัด · `:''}${esc(g.description||'')}</div>${num(g.id)>0&&subset.some(r=>queueKnown(r)||poolRowFor(r))?`<p class="small">${esc(queueKnownSummary(subset))}</p>`:''}${financeCardMarkup(g.id)}</div>`;}).join('')+freeCardMarkup();
    renderMoneySourceNote();refreshFreeStockPanel();
    const freeToggle=document.getElementById('free-detail-toggle');if(freeToggle)freeToggle.addEventListener('click',()=>{freePanelOpen=!freePanelOpen;uiState.freePanelOpen=freePanelOpen;freeToggle.setAttribute('aria-expanded',String(freePanelOpen));freeToggle.textContent=(freePanelOpen?'ย่อ':'ดู')+'รายการ Free · ราคาและหมายเหตุ';refreshFreeStockPanel();if(freePanelOpen)document.getElementById('free-detail-panel').scrollIntoView({block:'nearest'});});
    document.getElementById('unreserved-note').hidden=true;document.getElementById('pending-note').hidden=true;
  };
  const queueParts = r => {
    const q=r.queue;const parts=Array.isArray(q.parts)?q.parts:[];
    const poolEntry=poolRowFor(r);
    if(poolEntry){
      const {pool,line}=poolEntry;const mixed=poolOnlyPart(r);const sourceParts=parts.length?parts:(Array.isArray(r.parts)?r.parts:[]);const otherParts=sourceParts.filter(p=>String(p.grade)!==String(pool.grade));
      if(mixed&&!otherParts.length&&num(line.sourceQty||r.qty)>num(line.requested))otherParts.push({w:r.w,l:r.l,t:r.t,grade:'ส่วนที่เหลือ',unit:r.unit,requested:num(line.sourceQty||r.qty)-num(line.requested)});
      return `<p class="queue-provisional">คิว ${esc(pool.grade)} ใหม่ตามคำสั่งเจ้าของ: ${fmt(line.availableBefore)} − ${fmt(line.allocated)} = เหลือ ${fmt(line.remaining)} แผ่น · มีของ ${fmt(line.allocated)} + ต้องผลิต ${fmt(line.shortage)} = สั่งเฉพาะ ${esc(pool.grade)} ${fmt(line.requested)} แผ่น · ${line.etdISO?'มี ETD จัดก่อนคิวไม่มีวัน':'ไม่มี ETD จึงจัดท้ายคิวกองนี้'} · ไม่แก้ Physical ส่วนกลาง</p><div class="table-scroll"><table class="pool-table"><thead><tr><th>สเปกที่ต้องใช้</th><th class="number">สั่ง</th><th class="number">ของก่อนถึงคิวนี้</th><th class="number">มีของให้</th><th class="number">ต้องผลิตเพิ่ม</th><th class="number">ของเหลือหลังคิวนี้</th></tr></thead><tbody><tr><td>${esc(dimensions(pool))} · ${esc(pool.grade)}<span class="subqty">หนา ${esc(thick(pool.t))} มม. · ${esc(unitLabel(pool.unit))}</span></td>${queueNumber(line.requested)}${queueNumber(line.availableBefore)}${queueNumber(line.allocated,'ready-val')}${queueNumber(line.shortage,'need-val')}${queueNumber(line.remaining)}</tr>${mixed?otherParts.map(p=>`<tr><td>${esc(dimensions(p))} · ${esc(gradeLabel(p.grade))}<span class="subqty">ส่วนนี้ยังไม่ยืนยัน</span></td>${queueNumber(p.requested)}${queueNumber(null)}${queueNumber(null)}${queueNumber(null)}${queueNumber(null)}</tr>`).join(''):''}</tbody></table></div><p class="detail-note">${mixed?`ใบนี้สั่งรวม ${fmt(r.qty)} ${esc(unitLabel(r.unit))} ${esc(gradeLabel(r.grade))}; แสดงผลตัดเฉพาะ ${esc(pool.grade)} ${fmt(line.requested)} แผ่น ไม่ได้ยืนยันว่ามีของครบ ${fmt(r.qty)} แผ่น ส่วนเกรดอื่น ยังไม่ทราบจำนวนมีของ/ต้องผลิต ไม่ใช้ 0 แทน`:'จัดสรรเฉพาะกองนี้ ไม่มีการใช้ของต่างเกรด/ความหนาแทน'} · ${esc(pool.basisLabel||'ฐานเริ่มต้นกองนี้ ตามที่เจ้าของให้ใช้ในหน้าตรวจคิว')} · สถานะ TT/LC และวันรับเงินคงต้นทางเดิม</p>${priorPartTable(r)}`;
    }
    const explanation=queueKnown(r)?`ตัวอย่างจัดสรร เดิม ยังรอตรวจว่าฐาน Physical หัก รายการที่โหลดแล้ว แล้วหรือยัง ไม่ใช่ยอดพร้อมส่งที่ยืนยันล่าสุด · ${q.basisLabel} · มีของ ${fmt(q.allocated)} + ต้องผลิต ${fmt(q.shortage)} = ${fmt(r.qty)} ${unitLabel(r.unit)} · ไม่แก้ Physical ส่วนกลาง`:r.cancelled?'รายการยกเลิกจำนวน 0 ไม่เพิ่มยอดจองหรือยอดผลิต':num(q.group)===1?'รายการโหลดแล้วไม่หักสต๊อกซ้ำ · ETD ต้นทางไม่ใช่วันโหลดจริง':!q.eligible?'รายการนี้ยังไม่ได้จัดสรรใหม่ตามกติกาที่กำลังตรวจ · ข้อยกเว้นล่าสุดใช้เฉพาะส่วนที่ได้รับอนุมัติ ที่ระบุในรายละเอียดรายการ · คงยอดจองเดิมในระบบไว้ ยังไม่ปล่อยคืน':'รายการนี้เข้าคิวจองแล้ว แต่ยังไม่มีจำนวนของคงเหลือที่ยืนยันสำหรับสเปกนี้ หลังหักคิวก่อนหน้าและภาระเดือนอื่น จึงยังบอกไม่ได้ว่ามีของให้กี่แผ่น/ต้องผลิตกี่แผ่น ไม่ได้แปลว่าไม่มีของหรือเป็นสถานะขายอีกกลุ่ม';
    let result=`<p class="queue-provisional">${esc(explanation)}</p>`;
    if(q.eligible&&parts.length){result+=`<div class="table-scroll"><table class="pool-table"><thead><tr><th>สเปกที่ต้องใช้</th><th class="number">สั่ง</th><th class="number">ของก่อนถึงคิวนี้</th><th class="number">มีของให้</th><th class="number">ต้องผลิตเพิ่ม</th><th class="number">ของเหลือหลังคิวนี้</th></tr></thead><tbody>${parts.map(p=>`<tr><td>${esc(dimensions(p))} · ${esc(gradeLabel(p.grade))}<span class="subqty">หนา ${esc(thick(p.t))} มม. · ${esc(unitLabel(p.unit??r.unit))}</span></td>${queueNumber(p.requested,'',p.unit??r.unit)}${queueNumber(p.availableBefore,'',p.unit??r.unit)}${queueNumber(p.allocated,'ready-val',p.unit??r.unit)}${queueNumber(p.shortage,'need-val',p.unit??r.unit)}${queueNumber(p.remaining,'',p.unit??r.unit)}</tr>`).join('')}</tbody></table></div><p class="detail-note">${queueKnown(r)?'ฐานคิวตัวอย่างจัดสรร เดิมของ รายการตัวอย่าง ยังคงไว้เทียบเท่านั้น ต้องตรวจว่าฐาน Physical หัก รายการที่โหลดแล้ว แล้วหรือยังก่อนยืนยันยอดมีของ/ขาดผลิตจริง':'ยังไม่ยืนยัน = ยังขาดจำนวนของคงเหลือที่ใช้จัดให้รายการนี้ ไม่ใช่ 0 และไม่ใช่ยอดต้องผลิต'} · ไม่เอาของต่างเกรด/ความหนามาหักแทน</p>`;}
    return result+priorPartTable(r);
  };
  const queueDetail = r => `${commercialDetail(r)}<dl class="detail-grid"><div><dt>เหตุผลที่อยู่กลุ่มนี้</dt><dd>${esc(r.queue.reason||'รอตรวจเหตุผล')}${poolRowFor(r)&&num(r.queue.group)===4?'<br><strong>แต่ส่วนที่อนุมัติเข้าคิวท้ายตามอนุมัติล่าสุด · ไม่เปลี่ยนสถานะรับเงิน</strong>':''}</dd></div><div><dt>งานขาย / สินค้า ตามหน้า 09</dt><dd>${esc(r.sourceStatus||'ไม่ระบุ')} / ${esc(productStatusLabel(r.productStatus))}</dd></div><div><dt>ข้อความสถานะเงินต้นทาง</dt><dd class="source-ref">${esc(r.payment||'ไม่ระบุ')}</dd></div><div><dt>ETD ต้นทาง · ไม่ใช่วันรับเงิน</dt><dd>${esc(r.etd||'ไม่ระบุ')}</dd></div><div><dt>ช่องวันรับเงินต้นทาง</dt><dd class="source-ref">${esc(r.receiptDateText||'—')}</dd></div>${r.sourceRefText&&String(r.sourceRefText)!==String(r.ref)?`<div><dt>เอกสาร / Invoice ตามต้นทาง</dt><dd class="source-ref">${esc(r.sourceRefText)}</dd></div>`:''}</dl>${queueParts(r)}${sourceNotes(r.notes)?`<p class="detail-note">หมายเหตุต้นทาง: ${esc(sourceNotes(r.notes))}</p>`:''}`;
  const renderQueueRows = values => {
    const body=document.createElement('tbody');body.id='orders';let previousGroup=null;
    values.forEach((r,i)=>{
      const groupId=num(r.queue.group);const group=queueGroups.find(g=>num(g.id)===groupId)||{id:groupId,label:'รอตรวจกลุ่ม',description:''};
      if(previousGroup!==groupId){const subset=queueGroupRows(values,groupId);const heading=document.createElement('tr');heading.className='queue-group';heading.dataset.group=String(groupId);heading.innerHTML=`<th colspan="8"><div class="queue-group-heading"><span>${esc(groupId)} · ${esc(group.label)}<br><small>${esc(group.description||'')}</small></span><span class="number">${queueZeroQty(subset,true)}<small>${fmt(subset.length)} บรรทัด</small></span></div></th>`;body.append(heading);previousGroup=groupId;}
      const tr=document.createElement('tr');tr.className='order-main';tr.dataset.ref=String(r.ref);tr.dataset.queueGroup=String(groupId);tr.dataset.etd=r.queue.etdISO||'';
      tr.innerHTML=`<td class="n num">${i+1}</td><td class="customer"><strong>${esc(r.customer)}</strong><span class="ref">${esc(r.ref)}</span>${r.cancelled?'<span class="subqty">ยกเลิกตามต้นทาง · จำนวน 0</span>':''}</td><td class="spec">${esc(dimensions(r))}<span class="grade">${esc(gradeLabel(r.grade))} · ${esc(unitLabel(r.unit))}</span></td>${numeric(r.qty,'',r.unit)}<td class="payment-column">${commercialTag(r)}</td><td class="etd-cell">${esc(queueDate(r))}</td><td>${queueAllocationMarkup(r)}</td><td><button type="button" class="expand" aria-expanded="false" aria-controls="detail-${i}" aria-label="ดูรายละเอียดรายการ ${i+1} ${esc(r.customer)}">ดู ▾</button></td>`;
      const detail=document.createElement('tr');detail.className='order-detail';detail.id=`detail-${i}`;detail.hidden=true;detail.innerHTML=`<td colspan="8"><div class="detail-inner"><div class="detail-heading"><span class="status">กลุ่ม ${esc(groupId)} · ${esc(group.label)}</span><span class="small muted">รายการ ${i+1} · ${esc(r.ref)}</span></div>${queueDetail(r)}</div></td>`;
      const button=tr.querySelector('button');button.addEventListener('click',()=>{const open=detail.hidden;detail.hidden=!open;button.setAttribute('aria-expanded',String(open));button.textContent=open?'ย่อ ▴':'ดู ▾';button.setAttribute('aria-label',`${open?'ย่อ':'ดู'}รายละเอียดรายการ ${i+1} ${r.customer}`);tr.classList.toggle('selected',open);});body.append(tr,detail);
    });
    const root=document.getElementById('table-area');root.innerHTML=`<div class="table-shell"><div class="table-scroll" role="region" aria-label="คิวรายการตามกลุ่มและวัน ETD"><table class="orders queue-orders"><thead><tr><th class="n">#</th><th>ลูกค้า / ใบขาย</th><th>ขนาด (มม.) / เกรด</th><th class="number">จำนวน</th><th>TT / LC · สถานะเงิน</th><th>ETD</th><th>มีของ / ต้องผลิตเพิ่ม</th><th>รายละเอียด</th></tr></thead><tfoot><tr><th colspan="3">รวม ${fmt(values.length)} บรรทัด · ${fmt(uniqueOrders(values))} ใบขาย</th><td class="number">${queueQty(values,true)}</td><td colspan="4">${esc(queueKnownSummary(values))}</td></tr></tfoot></table></div><div class="sum-note">${queueEquation(values)}</div></div>`;root.querySelector('table').insertBefore(body,root.querySelector('tfoot'));
  };
  const renderQueueAll = values => {
    const groupCells=(subset,labels=false)=>queueGroups.map(g=>{const members=queueGroupRows(subset,g.id);return `<td class="number" data-summary-group="${esc(g.id)}"><span class="queue-demand">${queueZeroQty(members,labels)}</span>${num(g.id)>1?queueShortageMarkup(members):''}</td>`;}).join('');
    const root=document.getElementById('table-area');root.innerHTML=`<div class="table-shell"><div class="table-scroll" role="region" aria-label="ภาพรวมคิวใหม่ทุกความหนา"><table class="thickness-table queue-overview"><thead><tr><th>ความหนา</th><th>ใบขาย / บรรทัด</th><th class="number">สั่งทั้งหมด</th>${queueGroups.map(g=>`<th class="number">${esc(g.id)} · ${esc(g.label)}</th>`).join('')}<th>รายการ</th></tr></thead><tbody>${thicknesses.map(t=>{const subset=queueSelected(t);return `<tr data-summary-thickness="${esc(t)}"><td class="thickness-cell">${esc(thick(t))} <span class="small muted">มม.</span></td><td>${fmt(uniqueOrders(subset))} ใบ<span class="subqty">${fmt(subset.length)} บรรทัดสินค้า</span></td><td class="number">${queueQty(subset)}</td>${groupCells(subset)}<td><button type="button" class="expand thickness-link" data-thickness="${t}" aria-label="ดูรายการหนา ${esc(thick(t))} มิลลิเมตร">ดู ▸</button></td></tr>`;}).join('')}</tbody><tfoot><tr><th>รวมทุกความหนา</th><td>${fmt(uniqueOrders(values))} ใบไม่ซ้ำ<span class="subqty">${fmt(values.length)} บรรทัดสินค้า</span></td><td class="number">${queueQty(values,true)}</td>${groupCells(values,true)}<td></td></tr></tfoot></table></div><div class="sum-note">${queueEquation(values)}<p class="shortage-note"><strong>↳ ต้องผลิตเพิ่ม เป็นส่วนหนึ่งของยอดสั่งในช่องเดียวกัน ไม่บวกซ้ำ</strong> · ยอดสั่งที่รอตรวจ/ยังไม่จัดสรร ไม่ใช่ยอดต้องผลิต</p><p>* ตัวอย่างจัดสรร ยังรอตรวจว่าฐาน Physical หัก รายการที่โหลดแล้ว แล้วหรือยัง · กลุ่มรอเงื่อนไขยังไม่หักสต๊อก ยกเว้นส่วนที่ได้รับอนุมัติ ที่อนุมัติให้จัดท้ายคิว · ไม่ใช้ยอดขาดจากแผนเก่ามาแทนคิวใหม่</p></div></div>`;
    root.querySelectorAll('.thickness-link').forEach(button=>button.addEventListener('click',()=>{select.value=button.dataset.thickness;render();document.getElementById('table-title').scrollIntoView({block:'nearest'});}));
  };
  const renderQueue = () => {
    const value=select.value;const values=queueSelected(value);const all=value==='all';const basis=queueReview.stockBasis||{};
    document.getElementById('queue-method').hidden=false;
    document.getElementById('scope-label').textContent=counts(values);
    document.getElementById('table-title').textContent=all?`${thicknesses.length} ความหนา · รายการขายและทะเบียนสต๊อก`:`${thick(value)} มม. · ${values.length?'รายการ 1–'+values.length:'ไม่มีรายการขายเดือนนี้'}`;
    document.getElementById('table-help').textContent='เรียงกลุ่ม 1 → 4 · ภายในกลุ่มเรียง ETD ก่อน–หลัง · ไม่มีวันไว้ท้าย';
    document.getElementById('back').hidden=all;document.getElementById('collapse').hidden=all||!values.length;
    const warning=document.getElementById('source-warning');warning.hidden=false;warning.textContent=[data.readModel?.stale?'ต้องตรวจเทียบ: ฐานย้อนหลังต่างจากส่วนกลางหรือยังยืนยันไม่ได้':'',data.readModel?.warning,metadata.warning,basis.otherMonthWarning,basis.readbackLabel,'หน้านี้ไม่เปลี่ยนยอดสต๊อกหรือสถานะเงินส่วนกลาง · รายการโหลดแล้วไม่หักซ้ำ'].filter(Boolean).join(' · ');
    document.getElementById('allocation-legend').innerHTML='<span><i class="dot"></i>1 โหลดแล้ว ไม่หักซ้ำ</span><span><i class="dot green"></i>2 รับเงินแล้ว จัดก่อน · มัดจำแยกไว้</span><span><i class="dot orange"></i>3 จอง จัดต่อจากกลุ่ม 2</span><span>4 ไม่มี ETD / รอเงื่อนไข · เฉพาะส่วนที่ได้รับอนุมัติ ที่อนุมัติ จัดท้ายคิวกองนี้</span><span>ยังไม่ยืนยันจำนวน ≠ ไม่มีของ</span>';
    document.getElementById('queue-order-description').textContent=queueReview.description||'เรียงกลุ่มก่อน แล้ว ETD ก่อน–หลัง ไม่มีวันที่ไว้ท้าย คงข้อยกเว้นเฉพาะรายการที่ชุดข้อมูลอนุมัติ ไม่เปลี่ยนสถานะต้นทาง';
    document.getElementById('source-allocation').textContent=metadata.allocationLabel||'ผลคิวตามชุดข้อมูลที่ตรวจไว้ ไม่เขียนยอดจองส่วนกลาง';
    renderQueueMetrics(values);if(all)renderQueueAll(values);else if(values.length)renderQueueRows(values);else document.getElementById('table-area').innerHTML='<div class="no-orders-stock">ไม่มีรายการขายเดือนที่เลือกสำหรับความหนานี้ · ไม่สร้างรายการขายเพิ่ม<br>ดูทะเบียนทุกเกรด ทุกขนาด และกรอกหมายเหตุสินค้าได้ด้านล่าง</div>';renderStock(value);
    document.getElementById('announcement').textContent=all?`แสดงคิวใหม่ ${thicknesses.length} ความหนา`:`แสดงคิวหนา ${thick(value)} มิลลิเมตร ${values.length} บรรทัดสินค้า`;
  };
  const render = () => {
    renderQueue();
    renderReconciliation();
    const viewChanged=uiState.thickness!==select.value||uiState.month!==data.metadata?.month;
    uiState.thickness=select.value;uiState.month=data.metadata?.month||null;
    uiState.freePanelOpen=freePanelOpen;
    if(viewChanged&&typeof services.onViewChange==='function')services.onViewChange({month:uiState.month,thickness:select.value});
  };
  const metadata=data.metadata || {};
  if(metadata.warning){const warning=document.getElementById('source-warning');warning.hidden=false;warning.textContent=String(metadata.warning);}
  document.getElementById('source-sales').textContent=metadata.sourceSalesReadLabel || 'ข้อมูลรายการขาย: ดูวันที่ตรวจในบันทึกประกอบ';
  document.getElementById('visible-source-date').textContent=(metadata.sourceSalesReadLabel || 'ดูวันที่ข้อมูลในรายละเอียด')+' · ไม่ใช่ข้อมูลสดอัตโนมัติ';
  document.getElementById('source-stock').textContent=metadata.stockLabel || 'ข้อมูลสต๊อก: ใช้ฐานที่บันทึกไว้ ไม่ใช่การโหลดส่วนกลางอัตโนมัติ';
  document.getElementById('source-allocation').textContent=metadata.allocationLabel || 'ใช้ผลจากแผนจัดสรรเดิม หน้านี้ไม่จัดสรรหรือแก้ยอดส่วนกลาง';

  function eligibleChanges() {
    return [...notesState.drafts].filter(([key,draft])=>notesState.liveRows.has(key)&&typeof draft.before==='string'&&draft.after.trim()&&draft.after.length<=4000&&draft.after!==draft.before).map(([key,draft])=>({key,before:draft.before,after:draft.after}));
  }
  function eligibleFollowupChanges() {
    return [...notesState.followupDrafts].filter(([rawKey,draft])=>notesState.rawRecords.has(rawKey)&&typeof draft.before==='string'&&typeof draft.after==='string'&&draft.after.length<=4000&&draft.after!==draft.before).map(([rawKey,draft])=>({rawKey,before:draft.before,after:draft.after}));
  }
  function currentChanges(){return {notesChanges:eligibleChanges(),followupChanges:eligibleFollowupChanges()};}
  function renderReconciliation() {
    const root=document.getElementById('reconciliation'), comparison=data.reconciliation;
    const values=Array.isArray(comparison?.rows)?comparison.rows:[];
    const columns=Array.isArray(comparison?.columns)&&comparison.columns.length?comparison.columns:[{key:'label',label:'รายการ'},{key:'unit',label:'หน่วย'},{key:'previous',label:'ภาพรวมเดิม'},{key:'current',label:'ชุดตรวจรายการ'},{key:'difference',label:'ผลต่าง'},{key:'status',label:'สถานะ'},{key:'note',label:'รายละเอียด'}];
    const model=data.readModel, state=value=>value===true?'ตรงกัน':value===false?'ไม่ตรง / ยังไม่ครบ':'ยังไม่ยืนยัน';
    let html='<p class="small muted">'+esc(comparison?.summary||'รอผลเทียบรายสเปก/หน่วย · การแสดงหน้าได้ไม่ใช่หลักฐานว่าตรงครบ')+'</p>';
    if(model){
      html+='<p class="stock-basis-warning">'+esc(model.warning||'เป็นชุดตรวจย้อนหลัง ไม่ใช่ฟีดขายสด และคิวใหม่ยังไม่เปลี่ยนสต๊อกจริง')+'</p><div class="checks">'+[['วันรายงาน',model.reportDateMatches],['Physical รายสเปก',model.physicalMatches],['Free รายสเปก',model.freeMatches],['ราคาประเมิน',model.pricesMatch],['อัตราแลกเปลี่ยน',model.fxMatches]].map(([label,value])=>'<span>'+esc(label)+': '+state(value)+'</span>').join('')+'</div><p class="small muted">ฐานตรวจ '+esc(model.reviewStockReportDate||'ยังไม่ยืนยัน')+' · ส่วนกลาง '+esc(model.currentStockReportDate||'ยังไม่ยืนยัน')+'</p>';
      const mismatch=Array.isArray(model.mismatches)?model.mismatches:[];
      const amount=value=>typeof value==='number'&&Number.isFinite(value)?fmt(value):'ยังไม่ยืนยัน';
      if(mismatch.length)html+='<div class="table-scroll"><table><thead><tr><th>สเปก / หน่วย</th><th>Physical ฐานตรวจ</th><th>Physical ส่วนกลาง</th><th>Free ฐานตรวจ</th><th>Free ส่วนกลาง</th></tr></thead><tbody>'+mismatch.map(row=>'<tr><td>'+esc(row.key||[row.t,row.grade,row.w,row.l,row.unit].join(' · '))+'</td>'+['reviewPhysical','currentPhysical','reviewFree','currentFree'].map(key=>'<td class="number">'+amount(row[key])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
      const prices=Array.isArray(model.priceMismatches)?model.priceMismatches:[];
      if(prices.length)html+='<details class="basis"><summary>ราคาที่ต่าง / ยังยืนยันไม่ได้ '+fmt(prices.length)+' สเปก</summary><div class="table-scroll"><table><thead><tr><th>สเปก</th><th>ราคาฐานตรวจ</th><th>ราคาส่วนกลาง</th></tr></thead><tbody>'+prices.map(row=>'<tr><td>'+esc(row.key)+'</td><td>'+esc(nativeUnitPrice(row.reviewPrice,row.reviewCurrency))+'</td><td>'+esc(nativeUnitPrice(row.currentPrice,row.currentCurrency))+'</td></tr>').join('')+'</tbody></table></div></details>';
    }
    root.innerHTML=html+(values.length?'<div class="table-scroll"><table><thead><tr>'+columns.map(c=>'<th>'+esc(c.label)+'</th>').join('')+'</tr></thead><tbody>'+values.map(row=>'<tr>'+columns.map(c=>'<td>'+esc(row[c.key]===null||row[c.key]===undefined?'ยังไม่ยืนยัน':typeof row[c.key]==='number'?fmt(row[c.key]):row[c.key])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'');
  }
  async function refreshNotes() {
    if(notesBusy||!isCurrent())return;
    if(typeof services.readNotes!=='function'){setNotesStatus('ยังไม่มีช่องทางอ่านหมายเหตุที่ยืนยันสิทธิ์ · เก็บร่างไว้ได้ แต่ยังเซฟไม่ได้','error');return;}
    notesBusy=true;updateNotesControls();setNotesStatus('กำลังอ่านหมายเหตุส่วนกลางใหม่ · เก็บร่างไว้และตรวจข้อความเปลี่ยน');
    try {
      const result=await services.readNotes();if(!isCurrent())return;
      const snapshot=result?.snapshot||result;applyNotesSnapshot(snapshot);
      if(!snapshot.saveUnresolved){notesState.pending=null;notesState.retryBlocked=false;
      setNotesStatus('อ่านหมายเหตุ/ติดตามส่วนกลางแล้ว '+notesState.readAt+(!notesState.canSave&&!notesState.canEditFollowup?' · บัญชีนี้อ่านอย่างเดียว':''),'ready');}
    } catch(error) {
      if(!isCurrent())return;notesState.canSave=false;notesState.canEditFollowup=false;setNotesStatus(error?.message||'อ่านข้อมูลไม่สำเร็จ · ไม่ถือว่าสำเนาเดิมเป็นข้อมูลล่าสุด','error');
    } finally {notesBusy=false;if(isCurrent())renderStock(select.value);flushQueued();}
  }
  function stageNotes() {
    const payload=currentChanges(),count=payload.notesChanges.length+payload.followupChanges.length;
    if(notesBusy||notesState.retryBlocked||notesState.conflicts.size||notesState.followupConflicts.size||!count||payload.notesChanges.length&&!notesState.canSave||payload.followupChanges.length&&!notesState.canEditFollowup)return;
    const root=document.getElementById('notes-confirmation');root.hidden=false;
    const previewRows=[...payload.notesChanges.map(change=>({...change,identity:change.key,label:'หมายเหตุสินค้า'})),...payload.followupChanges.map(change=>({...change,identity:change.rawKey,label:'ติดตามการขาย'}))];
    root.innerHTML='<h3>ตรวจการเปลี่ยนแปลงก่อนบันทึก</h3><p>หมายเหตุ '+payload.notesChanges.length+' สเปก · ติดตาม '+payload.followupChanges.length+' แถว</p><p class="small">เปลี่ยนเฉพาะข้อความที่แสดง ไม่แตะยอดสต๊อก ยอดจอง หรือราคา · ผู้ติดตามและเวลาให้ระบบบันทึก</p><div class="table-scroll"><table><thead><tr><th>ข้อมูล / สินค้า</th><th>ข้อความเดิม</th><th>ข้อความใหม่</th></tr></thead><tbody>'+previewRows.map(change=>'<tr><td>'+esc(change.label)+'<small class="tracking-source">'+esc(change.identity)+'</small></td><td><pre>'+esc(change.before||'(ว่าง)')+'</pre></td><td><pre>'+esc(change.after||'ล้างข้อความเดิม · ยืนยันให้ว่าง')+'</pre></td></tr>').join('')+'</tbody></table></div><div class="stock-notes-actions"><button class="plainbutton" type="button" id="notes-confirm">ยืนยันบันทึกการเปลี่ยนแปลง</button><button class="plainbutton" type="button" id="notes-cancel">กลับไปแก้</button></div>';
    document.getElementById('notes-confirm').addEventListener('click',()=>saveChanges(payload));
    document.getElementById('notes-cancel').addEventListener('click',()=>{root.hidden=true;});
    if(typeof root.scrollIntoView==='function')root.scrollIntoView({block:'nearest'});
  }
  async function prepareNotesFile(file) {
    if(!file||notesBusy||!isCurrent())return;
    if(notesState.drafts.size||notesState.followupDrafts.size||notesState.conflicts.size||notesState.followupConflicts.size||notesState.retryBlocked){setNotesStatus('มีร่างหรือผลบันทึกค้าง · กรุณาตรวจให้จบก่อนนำเข้าไฟล์','error');return;}
    if(typeof services.prepareNotesFile!=='function'||typeof services.readNotes!=='function'){setNotesStatus('ยังไม่มีช่องทางนำเข้าหมายเหตุที่ยืนยันสิทธิ์','error');return;}
    const options={column:document.getElementById('notes-file-column').value,mode:document.getElementById('notes-file-mode').value};
    if(!['AD','AE'].includes(options.column)||!['append','replace'].includes(options.mode))return;
    const preview=document.getElementById('notes-import-preview');preview.textContent='กำลังอ่านไฟล์และตรวจเทียบหมายเหตุส่วนกลาง · ยังไม่บันทึก';notesBusy=true;updateNotesControls();
    try{
      const fresh=await services.readNotes();if(!isCurrent())return;applyNotesSnapshot(fresh?.snapshot||fresh);
      if(!notesState.canSave)throw Error('บัญชีนี้ยังไม่มีสิทธิ์บันทึกหมายเหตุ');
      const plan=await services.prepareNotesFile(file,options);if(!isCurrent())return;
      const changes=Array.isArray(plan?.changes)?plan.changes:[],issues=Array.isArray(plan?.issues)?plan.issues:[];
      const unique=new Set(),valid=changes.length<=5000&&changes.every(change=>{if(!change||!notesState.liveRows.has(change.key)||unique.has(change.key)||typeof change.before!=='string'||typeof change.after!=='string'||!change.after.trim()||change.after.length>4000||change.before===(change.after)||change.before!==(notesState.notes.get(change.key)||''))return false;unique.add(change.key);return true;});
      const ready=plan?.canApply===true&&valid&&changes.length>0&&!notesState.drafts.size;
      preview.innerHTML='<p><strong>ร่างจากไฟล์ '+fmt(changes.length)+' สเปก · ยังไม่บันทึก</strong></p>'+issues.map(issue=>'<p class="small money-unverified">'+esc(typeof issue==='string'?issue:issue.message||issue.label||issue.code||'มีประเด็นที่ต้องตรวจในไฟล์')+'</p>').join('')+(ready?'<button type="button" class="plainbutton" id="notes-file-stage">ตรวจข้อความเดิม / ใหม่ก่อนบันทึก</button>':'<p class="money-unverified">ยังนำร่างเข้าบันทึกไม่ได้ · ไม่มีรายการที่พร้อม หรือผลเทียบไม่ตรงส่วนกลาง กรุณาตรวจไฟล์</p>');
      if(ready)document.getElementById('notes-file-stage').addEventListener('click',()=>{
        if(notesBusy||notesState.drafts.size||notesState.retryBlocked)return;
        for(const change of changes)notesState.drafts.set(change.key,{before:change.before,after:change.after});
        preview.textContent='นำเข้าร่างแล้ว · ตรวจข้อความเดิม/ใหม่และกดยืนยันด้านล่างก่อนจึงจะบันทึก';renderStock(select.value);stageNotes();
      });
    }catch(error){if(isCurrent()){preview.textContent=error?.message||'อ่านหรือตรวจไฟล์ไม่สำเร็จ';setNotesStatus('ยังไม่บันทึกหมายเหตุจากไฟล์ · ตรวจข้อผิดพลาดก่อนลองใหม่','error');}}
    finally{notesBusy=false;if(isCurrent()){document.getElementById('notes-file').value='';updateNotesControls();}flushQueued();}
  }
  async function saveChanges(payload) {
    const transport=typeof services.saveChanges==='function'?services.saveChanges:!payload.followupChanges.length&&typeof services.saveNotes==='function'?value=>services.saveNotes(value.notesChanges):null;
    if(notesBusy||!isCurrent()||!transport||notesState.retryBlocked||notesState.conflicts.size||notesState.followupConflicts.size||payload.notesChanges.length&&!notesState.canSave||payload.followupChanges.length&&!notesState.canEditFollowup)return;
    if(JSON.stringify(payload)!==JSON.stringify(currentChanges())){document.getElementById('notes-confirmation').hidden=true;setNotesStatus('ร่างเปลี่ยนจากชุดที่ตรวจ กรุณากดตรวจอีกครั้ง','error');return;}
    notesBusy=true;notesState.pending={...payload};document.getElementById('notes-confirmation').hidden=true;renderStock(select.value);
    setNotesStatus('กำลังบันทึกเฉพาะหมายเหตุ/ติดตาม และรออ่านกลับส่วนกลาง');
    try {
      const result=await transport(payload);if(!isCurrent())return;
      const snapshot=result?.snapshot||result,parsed=parseNotesSnapshot(snapshot);
      const noteMatch=change=>parsed.liveRows.has(change.key)&&(parsed.notes.get(change.key)||'')===change.after;
      const followupMatch=change=>parsed.rawRecords.get(change.rawKey)?.followup===change.after;
      const matched=!snapshot.saveUnresolved&&payload.notesChanges.every(noteMatch)&&payload.followupChanges.every(followupMatch);
      applyNotesSnapshot(snapshot);notesState.pending=null;
      if(!matched){
        notesState.retryBlocked=true;
        for(const change of payload.notesChanges)if(snapshot.saveUnresolved||!noteMatch(change))notesState.drafts.set(change.key,{before:change.before,after:change.after});
        for(const change of payload.followupChanges)if(snapshot.saveUnresolved||!followupMatch(change))notesState.followupDrafts.set(change.rawKey,{before:change.before,after:change.after});
        setNotesStatus('ผลอ่านกลับยังไม่ตรงครบ · เก็บร่างไว้ ต้องโหลดล่าสุดก่อนตรวจส่งใหม่ ไม่ส่งซ้ำอัตโนมัติ','error');
      }else setNotesStatus('บันทึกและอ่านกลับส่วนกลางตรงครบ · หมายเหตุ '+payload.notesChanges.length+' สเปก / ติดตาม '+payload.followupChanges.length+' แถว · '+notesState.readAt,'ready');
    }catch(error){
      if(!isCurrent())return;notesState.pending=null;notesState.retryBlocked=true;
      setNotesStatus((error?.message||'ยังยืนยันผลบันทึกไม่ได้')+' · เก็บร่างไว้และโหลดล่าสุดก่อนส่งใหม่ ห้ามส่งซ้ำทั้งชุดอัตโนมัติ','error');
    }finally{notesBusy=false;if(isCurrent()){renderStock(select.value);refreshFreeStockPanel();}flushQueued();}
  }
  document.getElementById('review-title').textContent=metadata.title||('ภาพรวมรายการขาย'+(metadata.monthLabel||metadata.month?' · '+(metadata.monthLabel||metadata.month):''));
  select.addEventListener('change',render);
  document.getElementById('back').addEventListener('click',()=>{select.value='all';render();});
  document.getElementById('collapse').addEventListener('click',()=>document.querySelectorAll('.order-main button[aria-expanded="true"]').forEach(button=>button.click()));
  document.getElementById('notes-refresh').addEventListener('click',refreshNotes);
  document.getElementById('notes-stage').addEventListener('click',stageNotes);
  document.getElementById('changes-stage').addEventListener('click',stageNotes);
  document.getElementById('notes-file').addEventListener('change',event=>prepareNotesFile(event.target.files?.[0]));
  render();
  instance={refreshNotes,stageNotes,render,select,setView(value){if([...select.options].some(option=>option.value===String(value))){select.value=String(value);render();}},applyNotesSnapshot,suspendEditing(message){notesState.canSave=false;notesState.canEditFollowup=false;document.getElementById('notes-confirmation').hidden=true;setNotesStatus(message||'สิทธิ์ยังไม่ยืนยัน · เก็บร่างไว้ กรุณาเข้าสู่ระบบบัญชีเดิมแล้วโหลดล่าสุด','error');renderStock(select.value);}};
  return instance;
  }
  function flushQueued(){if(!destroyed&&!notesBusy&&queuedReview){const value=queuedReview;queuedReview=null;rebuild(value);}}
  rebuild(review||{});
  // The controller is the only reader/writer. No credentials or persistence live here.
  if(typeof services.readNotes==='function')instance.refreshNotes();
  return {
    update(value){if(destroyed)return;if(notesBusy){queuedReview=value;return;}rebuild(value||{});},
    destroy(){if(destroyed)return;destroyed=true;generation++;if(typeof global.removeEventListener==='function')global.removeEventListener('beforeunload',unloadGuard);shadow.replaceChildren();notesState.drafts.clear();notesState.followupDrafts.clear();notesState.notes.clear();notesState.liveRows.clear();notesState.rawRecords.clear();notesState.legacy.clear();notesState.conflicts.clear();notesState.followupConflicts.clear();notesState.pending=null;queuedReview=null;currentReview=null;instance=null;},
    hasDirty,
    refreshNotes(){return !destroyed?instance.refreshNotes():Promise.resolve();},
    setView(value){if(!destroyed)instance.setView(value?.thickness??value);},
    getView(){return {month:uiState.month,thickness:uiState.thickness};},
    applyNotesSnapshot(snapshot){if(!destroyed)instance.applyNotesSnapshot(snapshot);},
    suspendEditing(message){if(!destroyed)instance.suspendEditing(message);}
  };
}
global.AAFOrderReviewUI=Object.freeze({mount});
})(window);

