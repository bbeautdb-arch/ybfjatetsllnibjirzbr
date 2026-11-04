/* Read-only manufacturing estimate for the all-production panel only.
   No reservations, warehouse values, source statuses, prices or storage writes.
   All quantities and dates are supplied by the verified report integration. */
(() => {
  'use strict';
  const defaults=Object.freeze({woodPricePerTonne:1550,dailyCapacitySheets:17500,fuelPricePerTonne:1050,fuelTonnesPerDay:80});
  const constants=Object.freeze({standardWidth:1220,standardLength:2440,standardThickness:2.5,kgPerSheet:7.29,woodFactor:2.45});
  const metricFields=Object.freeze(['eq2_5','productTonnes','woodTonnes','woodCost','productionDays','fuelTonnes','fuelCost','totalCost']);
  const unitBlank=()=>({sheet:0,strip:0});
  const metricsBlank=()=>Object.fromEntries(metricFields.map(k=>[k,0]));
  const nonnegative=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
  const equal=(a,b)=>nonnegative(a)&&nonnegative(b)&&Math.abs(a-b)<=Math.max(1,Math.abs(a),Math.abs(b))*1e-10;
  const clone=v=>v===undefined?null:JSON.parse(JSON.stringify(v));

  function readSettings(input={}){
    if(!input||typeof input!=='object'||Array.isArray(input))return {status:'pending',reason:'ค่าประมาณการไม่ครบ'};
    const settings={};
    const labels={woodPricePerTonne:'ราคาไม้ยูคาต่อตัน',dailyCapacitySheets:'กำลังผลิตต่อวัน',fuelPricePerTonne:'ราคาเชื้อเพลิงต่อตัน',fuelTonnesPerDay:'การใช้เชื้อเพลิงต่อวัน'};
    for(const key of Object.keys(defaults)){
      const raw=Object.hasOwn(input,key)?input[key]:defaults[key];
      // Empty/invalid edits stay pending; never silently revert to a default or 0.
      const validType=typeof raw==='number'||typeof raw==='string'&&raw.trim()!=='';
      const n=validType?Number(raw):NaN;
      if(!(key==='dailyCapacitySheets'?positive(n):nonnegative(n)))return {status:'pending',reason:'กรุณาระบุ'+labels[key]+(key==='dailyCapacitySheets'?'มากกว่า 0':'ตั้งแต่ 0 ขึ้นไป'),invalidField:key};
      settings[key]=n;
    }
    return {status:'valid',settings};
  }

  function estimateSheet(row,settings){
    // Use the exact original dimensions even when allocation allows a narrow
    // 1200×2400/1220×2440 exception. No equivalent is fed back into real stock.
    const eq2_5=row.shortage*row.w*row.l/(constants.standardWidth*constants.standardLength)*row.t/constants.standardThickness;
    const productTonnes=eq2_5*constants.kgPerSheet/1000;
    const woodTonnes=productTonnes*constants.woodFactor;
    const woodCost=woodTonnes*settings.woodPricePerTonne;
    const productionDays=eq2_5/settings.dailyCapacitySheets;
    const fuelTonnes=productionDays*settings.fuelTonnesPerDay;
    const fuelCost=fuelTonnes*settings.fuelPricePerTonne;
    const totalCost=woodCost+fuelCost;
    const values={eq2_5,productTonnes,woodTonnes,woodCost,productionDays,fuelTonnes,fuelCost,totalCost};
    return Object.values(values).every(nonnegative)?values:null;
  }

  function build(view,inputSettings={},deadlines=null){
    const pending=(reason,more={})=>({status:'pending',reason,rows:[],thickness:[],byUnit:null,totals:null,sheetTotals:null,excluded:null,...more});
    if(view?.status!=='saved-plan'||!Array.isArray(view.rows)||!view.byUnit)return pending(view?.reason||'ยังไม่ยืนยันยอดต้องผลิตตามแผนที่บันทึก');
    const parsed=readSettings(inputSettings);
    if(parsed.status!=='valid')return pending(parsed.reason,{invalidField:parsed.invalidField||null});
    const settings=parsed.settings,keys=new Set(),sourceTotals=unitBlank();
    // Check the full input before filtering. A malformed excluded row must not
    // hide a source mismatch or turn an incomplete plan into a verified total.
    for(const row of view.rows){
      if(!row||typeof row.key!=='string'||!row.key||keys.has(row.key)||!['sheet','strip'].includes(row.unit)||typeof row.grade!=='string'||!row.grade.trim()||!['w','l','t'].every(k=>positive(row[k]))||!positive(row.shortage)||!nonnegative(row.demand)||!nonnegative(row.allocated)||!equal(row.demand,row.allocated+row.shortage))return pending('รายละเอียดสเปก จำนวน หรือหน่วยไม่ครบ/ไม่ตรงกัน · รอตรวจ');
      keys.add(row.key);sourceTotals[row.unit]+=row.shortage;
    }
    if(['sheet','strip'].some(u=>!equal(sourceTotals[u],view.byUnit[u])))return pending('ยอดรวมไม่ตรงกับรายการต้องผลิตทั้งชุด · รอตรวจ');
    const rows=[],excluded={grades:['B','F'],rows:[],count:0,byUnit:unitBlank()},byUnit=unitBlank(),sheetTotals=metricsBlank(),groups=new Map();
    const deadlineFor=t=>{
      // This module does not assert freshness, reservation eligibility or ETD.
      // The source integration owns these decisions and supplies an explicit
      // per-thickness result; missing evidence remains null rather than today.
      const value=deadlines?.byThickness?.[String(t)];
      return value&&typeof value==='object'?clone(value):null;
    };
    for(const source of view.rows){
      const row={key:source.key,w:source.w,l:source.l,t:source.t,grade:source.grade,unit:source.unit,demand:source.demand,allocated:source.allocated,shortage:source.shortage};
      if(excluded.grades.includes(row.grade.trim().toUpperCase())){
        excluded.rows.push(row);excluded.count++;excluded.byUnit[row.unit]+=row.shortage;continue;
      }
      const metrics=row.unit==='sheet'?estimateSheet(row,settings):null;
      if(row.unit==='sheet'&&!metrics)return pending('ค่าประมาณการเกินช่วงที่คำนวณได้ · ตรวจจำนวนและค่าที่กรอก');
      const result={...row,deadline:deadlineFor(row.t),metrics,estimateStatus:metrics?'estimated':'pending-strip-basis'};
      rows.push(result);byUnit[row.unit]+=row.shortage;
      const key=String(row.t);
      if(!groups.has(key))groups.set(key,{t:row.t,byUnit:unitBlank(),rows:[],sheetTotals:metricsBlank(),deadline:deadlineFor(row.t),pendingStripCount:0});
      const group=groups.get(key);group.byUnit[row.unit]+=row.shortage;group.rows.push(result);
      if(metrics){for(const field of metricFields){sheetTotals[field]+=metrics[field];group.sheetTotals[field]+=metrics[field];}}
      else group.pendingStripCount++;
    }
    if(!Object.values(sheetTotals).every(nonnegative)||!Object.values(byUnit).every(nonnegative)||!Object.values(excluded.byUnit).every(nonnegative))return pending('ยอดรวมประมาณการเกินช่วงที่คำนวณได้');
    const thickness=[...groups.values()].sort((a,b)=>a.t-b.t).map(group=>({...group,status:group.pendingStripCount?'partial':'estimated',totals:group.pendingStripCount?null:{...group.sheetTotals}}));
    const pendingStripCount=rows.filter(r=>r.unit==='strip').length;
    return {status:pendingStripCount?'partial':'estimated',reason:pendingStripCount?'ไม้แถบแยกหน่วย · ยังไม่มีฐานแปลงสำหรับประมาณการผลิต':null,settings:{...settings},constants:{...constants},rows,thickness,byUnit,excluded,sourceByUnit:{...sourceTotals},sheetTotals,totals:pendingStripCount?null:{...sheetTotals},pendingStripCount,fractional:rows.some(r=>!Number.isInteger(r.shortage))};
  }

  window.AAFProductionPlanner=Object.freeze({defaults,constants,metricFields,readSettings,build});
})();
