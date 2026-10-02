import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../stock_shared.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../stock_manager.html',import.meta.url),'utf8');
const open=source.slice(source.indexOf('  window.openAutoMailImport='),source.indexOf('\n  window.applyAutoStockSnapshot='));
const refresh=source.slice(source.indexOf('  async function refresh(){'),source.indexOf('\n  window.onload='));
function context(overrides={}) {
  const nodes=new Map(),messages=[],accepted=[];
  const c={window:{},busy:false,dirty:false,drafts:new Map(),can:()=>true,previewPending:()=>false,
    $:id=>{if(!nodes.has(id))nodes.set(id,{value:'keep',classList:{remove:()=>{c.opened=true;}}});return nodes.get(id);},
    banner:(m,e)=>messages.push({m,e}),confirm:()=>true,
    request:async()=>({revision:42}),accept:d=>accepted.push(d),JSON,opened:false,...overrides};
  vm.createContext(c);vm.runInContext(open+'\n'+refresh,c);return {c,nodes,messages,accepted};
}
test('compact owner controls keep report-first layout and existing importer',()=>{
  assert.match(html,/id="stock-management-workbench" hidden aria-hidden="true"/);
  assert.match(source,/ownerTools.hidden=true/);
  assert.match(source,/\$\('stock-report-access'\).before\(ownerTools\)/);
  assert.match(source,/ownerTools.insertBefore\(\$\('btn-open-auto-mail-import'\)/);
  assert.match(source,/\$\('stock-owner-tools'\).hidden=!\(isOwner\(\)&&can\('import'\)\)/);
  assert.match(source,/const can=k=>!salesLink&&!!shared\?\.permissions\?\.\[k\]/);
  assert.match(source,/res.status===401\|\|res.status===403/);
  assert.match(source,/body.action==='import'&&previewPending\(\)/);
});
test('existing import opener refuses unauthorized, busy and both draft surfaces',()=>{
  for(const opts of [{can:()=>false},{busy:true},{dirty:true},{previewPending:()=>true}]){
    const {c}=context(opts);c.window.openAutoMailImport();assert.equal(c.opened,false);
  }
  const {c,nodes}=context();c.window.openAutoMailImport();assert.equal(c.opened,true);assert.equal(nodes.get('auto-mail-json-input').value,'');
});
test('refresh refuses pending Section02 changes without reading or clearing drafts',async()=>{
  let reads=0;const {c}=context({previewPending:()=>true,request:async()=>{reads++;}});c.drafts.set('price','9');await c.refresh();assert.equal(reads,0);assert.equal(c.drafts.size,1);
});
test('refresh preserves changes made while request is in flight',async()=>{
  let finish;const {c,accepted}=context({request:()=>new Promise(r=>{finish=r;})});
  const pending=c.refresh();assert.equal(c.busy,true);c.drafts.set('note','new');finish({revision:42});await pending;
  assert.equal(accepted.length,0);assert.equal(c.drafts.get('note'),'new');assert.equal(c.busy,false);
});
test('normal refresh accepts one response; polling cannot roll back revisions',async()=>{
  const {c,accepted}=context();await c.refresh();assert.equal(accepted.length,1);assert.equal(c.busy,false);
  assert.match(source,/!busy&&!dirty&&!previewPending\(\)&&fresh.revision>shared.revision/);
});
