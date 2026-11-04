/* Read-only Aging display on the saved post-transfer Physical basis.
   Follow the central DTO's movedTo graph; never repeat transfer rules, rewrite
   raw mail, allocate reservations, scale age buckets or save warehouse data. */
(() => {
  'use strict';
  const keys=Object.freeze(['d90','d180','d270','d360','dOver']);
  const units=Object.freeze(['sheet','strip']);
  const area=1220*2440;
  const zero=()=>keys.map(()=>0);
  const unitTotal=()=>({qty:0,eq4x8:0});
  const totals=()=>({sheet:unitTotal(),strip:unitTotal(),eq4x8:0});
  const nonnegative=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;
  const equal=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-7;
  const positiveDimension=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))&&Number(v)>0;
  const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  const add=(target,unit,qty,factor)=>{target[unit].qty+=qty;target[unit].eq4x8+=qty*factor;target.eq4x8+=qty*factor;};
  const finiteTotals=value=>[value.eq4x8,...units.flatMap(u=>[value[u].qty,value[u].eq4x8])].every(n=>Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER);
  const fail=reason=>{throw new Error(reason);};

  function build(data){
    const identity={version:1,reportDate:typeof data?.report?.reportDate==='string'?data.report.reportDate:null,revision:Number.isSafeInteger(data?.revision)?data.revision:null,keys:[...keys]};
    const pending=reason=>({...identity,status:'pending',reason,buckets:[],byThickness:[],rows:[],source:null,projected:null,physical:null,unagedAdjustment:null,checks:null});
    try{
      if(!validDate(identity.reportDate)||identity.revision===null||identity.revision<0||!Array.isArray(data?.rows)||!data.rows.length)fail('รอชุดสต๊อกส่วนกลางและวันที่รายงานที่ครบถ้วน');
      const catalog=new Map();
      for(const input of data.rows){
        if(!input||typeof input!=='object'||typeof input.key!=='string'||!input.key||catalog.has(input.key)||!units.includes(input.unit)||typeof input.rawSource!=='boolean'||typeof input.grade!=='string'||!/^[A-Z]+$/.test(input.grade)||!['w','l','t'].every(k=>positiveDimension(input[k])))fail('สเปก หน่วย หรือแหล่งแถวไม่ครบ/ซ้ำ · รอตรวจ Aging');
        const w=Number(input.w),l=Number(input.l),t=Number(input.t),factor=w*l/area;
        if(input.key!==`w${w}_l${l}_t${t}_g${input.grade}`||!Number.isFinite(factor)||factor<=0)fail('รหัสสเปกไม่ตรงขนาดหรือเกรด · รอตรวจ Aging');
        if(!nonnegative(input.qty)||!nonnegative(input.baseQty)||!Object.hasOwn(input,'movedTo')||!(input.movedTo===null||typeof input.movedTo==='string'&&input.movedTo.trim()!==''))fail('ยอด Physical หรือหลักฐานปลายทางหลังโยกไม่ครบ · รอตรวจ Aging');
        if(!Object.hasOwn(input,'sellableBaseQty')||!nonnegative(input.sellableBaseQty))fail('ฐานจำนวนหลังโยกไม่ครบหรือไม่ถูกต้อง · รอตรวจ Aging');
        // Derived/catalog-only rows have no original mail ages. Never count
        // stale copied bucket fields from a derived row as a second source.
        const aging=input.rawSource?keys.map(k=>input[k]):zero();
        if(input.rawSource){
          if(!aging.every(nonnegative)||!equal(aging.reduce((a,b)=>a+b,0),input.baseQty))fail('Aging ต้นฉบับไม่ครบหรือรวมไม่ตรงยอดเมล · รอตรวจ');
        }else if(input.baseQty!==0)fail('แถวที่ไม่ได้มาจากเมลมียอดต้นฉบับไม่เป็นศูนย์ · รอตรวจ');
        catalog.set(input.key,{key:input.key,w,l,t,grade:input.grade,unit:input.unit,factor,rawSource:input.rawSource,baseQty:input.baseQty,physicalQty:input.qty,movedTo:input.movedTo,hasBase:Object.hasOwn(input,'sellableBaseQty'),sellableBaseQty:input.sellableBaseQty,physicalOverride:input.physicalOverride,sourceAging:aging,aging:zero(),sourceKeys:[]});
      }
      if(![...catalog.values()].some(row=>row.rawSource))fail('ไม่พบแถว Aging ต้นฉบับจากเมล · รอตรวจ');
      const destinations=new Map();
      const destination=source=>{
        if(destinations.has(source.key))return destinations.get(source.key);
        const seen=new Set(),path=[];let row=source;
        for(;;){
          if(seen.has(row.key))fail('พบเส้นทางโยกวนซ้ำ · ไม่คำนวณ Aging ซ้ำ');
          seen.add(row.key);path.push(row.key);
          if(row.unit!==source.unit)fail('หน่วยต้นทางและปลายทางโยกไม่ตรงกัน · ไม่รวมแผ่นกับชิ้น');
          if(row.movedTo===null)break;
          row=catalog.get(row.movedTo);
          if(!row)fail('ไม่พบสเปกปลายทางหลังโยก · รอตรวจ Aging');
        }
        for(const key of path)destinations.set(key,row);
        return row;
      };
      // Validate the entire graph, including retained zero rows, before using
      // any source ages. No partial/old fallback is labelled as reconciled.
      for(const row of catalog.values())destination(row);
      const source=totals();
      for(const row of catalog.values()){
        if(!row.rawSource)continue;
        const target=destination(row);
        row.sourceAging.forEach((n,i)=>target.aging[i]+=n);
        if(row.baseQty>0)target.sourceKeys.push(row.key);
        add(source,row.unit,row.baseQty,row.factor);
      }
      const projected=totals(),physical=totals(),unagedAdjustment=totals();
      const buckets=keys.map(key=>({key,...totals()})),byThickness=new Map(),rows=[];
      let baseChecked=0,adjustmentCount=0;
      for(const row of [...catalog.values()].sort((a,b)=>a.t-b.t||a.w-b.w||a.l-b.l||a.grade.localeCompare(b.grade))){
        const projectedQty=row.aging.reduce((a,b)=>a+b,0);
        if(!Number.isFinite(projectedQty))fail('ยอด Aging หลังโยกเกินช่วงที่คำนวณได้');
        if(row.hasBase){
          if(!equal(projectedQty,row.sellableBaseQty))fail('Aging หลังโยกไม่ตรงฐานสต๊อกรายสเปก · รอตรวจ');
          baseChecked++;
        }
        const delta=row.physicalQty-projectedQty,unagedQty=equal(delta,0)?0:delta;
        if(unagedQty!==0){
          const override=row.physicalOverride;
          if(!override||typeof override!=='object'||override.reportDate!==identity.reportDate||!nonnegative(override.value)||!equal(override.value,row.physicalQty))fail('Physical ไม่ตรง Aging หลังโยกและไม่มีหลักฐานปรับยอดของรายงานนี้ · รอตรวจ');
          adjustmentCount++;
        }
        add(projected,row.unit,projectedQty,row.factor);add(physical,row.unit,row.physicalQty,row.factor);add(unagedAdjustment,row.unit,unagedQty,row.factor);
        if(projectedQty>0){
          const tKey=String(row.t);
          if(!byThickness.has(tKey))byThickness.set(tKey,{t:row.t,sheet:zero(),strip:zero(),values:zero(),sheetQty:zero(),stripQty:zero()});
          const thickness=byThickness.get(tKey);
          row.aging.forEach((qty,i)=>{
            add(buckets[i],row.unit,qty,row.factor);
            const equivalent=qty*row.factor;
            thickness[row.unit][i]+=equivalent;thickness.values[i]+=equivalent;thickness[row.unit+'Qty'][i]+=qty;
          });
        }
        rows.push({key:row.key,w:row.w,l:row.l,t:row.t,grade:row.grade,unit:row.unit,aging:[...row.aging],projectedQty,physicalQty:row.physicalQty,unagedQty,projectedEq4x8:projectedQty*row.factor,physicalEq4x8:row.physicalQty*row.factor,unagedEq4x8:unagedQty*row.factor,sourceKeys:[...row.sourceKeys].sort()});
      }
      if(![source,projected,physical,unagedAdjustment,...buckets].every(finiteTotals)||units.some(u=>!equal(source[u].qty,projected[u].qty)))fail('ยอดรวม Aging หรือหน่วยหลังโยกไม่ตรงต้นฉบับ · รอตรวจ');
      return {...identity,status:adjustmentCount?'adjusted':'verified',reason:adjustmentCount?'มียอดปรับ Physical ที่ยังไม่ทราบอายุ แสดงแยกจากช่วง Aging':'',buckets,byThickness:[...byThickness.values()].sort((a,b)=>a.t-b.t),rows,source,projected,physical,unagedAdjustment,checks:{sourceRows:data.rows.filter(r=>r.rawSource).length,catalogRows:rows.length,baseCheckedRows:baseChecked,adjustmentRows:adjustmentCount,perUnitSourceConserved:true,physicalMatched:adjustmentCount===0}};
    }catch(error){return pending(error instanceof Error?error.message:'ยังตรวจฐาน Aging หลังโยกไม่สำเร็จ');}
  }
  const api=Object.freeze({build,keys,standardArea:area});
  if(typeof window!=='undefined')window.AAFStockAgingProjection=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})();
