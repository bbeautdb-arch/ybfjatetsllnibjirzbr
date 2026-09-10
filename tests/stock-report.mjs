import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../stock_report.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../stock_report.html',import.meta.url),'utf8');
assert(!html.includes('stock_shared.js'),'standalone must not load import/edit code');
assert(!html.includes('http-equiv="refresh"'));assert(html.includes('stock_manager.html#report'));
assert(!/localStorage|sessionStorage\.(?:setItem|removeItem|clear)|method:\s*['"]POST/.test(source));
async function setup(session,responses){
  const nodes=Object.fromEntries(['report-status','report-refresh','report-signin'].map(id=>[id,{textContent:'',dataset:{},hidden:true,disabled:false,events:{},addEventListener(event,fn){this.events[event]=fn;}}]));
  const updates=[],errors=[],requests=[],polls=[],events={};let storage=JSON.stringify(session);
  const document={hidden:false,title:'',getElementById:id=>nodes[id],addEventListener:(name,fn)=>events[name]=fn};
  const window={AAFStockSummary:{update:(data,calc)=>updates.push({data,calculated:calc(data.rows[0])}),showError:message=>errors.push(message)},addEventListener:(name,fn)=>events[name]=fn};
  const fetch=async(url,options)=>{requests.push({url,options});const next=responses.shift();if(next instanceof Error)throw next;return{status:next.status||200,ok:(next.status||200)<400,json:async()=>next.data};};
  vm.runInNewContext(source,{document,window,fetch,sessionStorage:{getItem:()=>storage},AbortController,setTimeout:()=>1,clearTimeout:()=>{},setInterval:fn=>polls.push(fn),console});
  const tick=()=>new Promise(resolve=>setImmediate(resolve));await tick();
  return{nodes,updates,errors,requests,polls,events,document,tick,setSession:x=>storage=JSON.stringify(x)};
}
const data={ok:true,revision:1,report:{reportDate:'2026-09-08'},rows:[{qty:100,freeQty:85,w:'1220',l:'2440',t:'2.5',priceObj:{price:2.352,currency:'USD'}}],exchangeRate:34};
const missing=await setup(null,[]);assert.equal(missing.requests.length,0);assert.equal(missing.nodes['report-signin'].hidden,false);
const bad=await setup({role:'admin'},[]);assert.equal(bad.requests.length,0,'role alone never grants stock access');
const s=await setup({stockSessionToken:'test-only-token'},[{data},{data},{data:{...data,revision:2}},{status:401}]);
assert.equal(s.requests[0].options.method,'GET');assert.equal(s.requests[0].options.cache,'no-store');assert.equal(s.requests[0].options.headers.Authorization,'Bearer test-only-token');assert(!('body' in s.requests[0].options));
assert.equal(s.updates.length,1);assert.equal(s.updates[0].calculated.eq,100);assert.equal(s.updates[0].calculated.freeValue,85*(2.352*34));
s.polls[0]();await s.tick();assert.equal(s.updates.length,1,'same revision does not reflow report');
s.polls[0]();await s.tick();assert.equal(s.updates.length,2,'new saved revision updates report');
s.polls[0]();await s.tick();assert.equal(s.errors.length,1);assert.equal(s.nodes['report-signin'].hidden,false,'expired credentials clear report and show sign in');
s.polls[0]();await s.tick();assert.equal(s.requests.length,4,'pause auto loads after auth failure');
for(const name of ['gradeBridgeSessionToken','bridgeSessionToken']){const x=await setup({[name]:'bridge-test'},[{data}]);assert.equal(x.updates.length,1);}
const offline=await setup({stockSessionToken:'test'},[new Error('offline')]);assert.equal(offline.updates.length,0);assert.equal(offline.errors.length,1);assert.equal(offline.nodes['report-refresh'].disabled,false);
const hidden=await setup({stockSessionToken:'test'},[{data}]);hidden.document.hidden=true;hidden.polls[0]();await hidden.tick();assert.equal(hidden.requests.length,1);
console.log('Standalone report checks passed: GET-only, existing token fallbacks, server auth, revision refresh, expired/offline/hidden states.');
