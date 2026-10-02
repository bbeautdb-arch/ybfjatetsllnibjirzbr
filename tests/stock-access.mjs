import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../stock_access.js',import.meta.url),'utf8');
const token='aafsl.'+'a'.repeat(32)+'.'+'B'.repeat(43);
function run(hash='',saved={},blocked=false){
  const values=new Map(Object.entries(saved)),events=[];
  const location={hash,pathname:'/stock_manager.html',search:'',replace:url=>events.push(['navigate',url]),reload:()=>events.push(['reload'])};
  const sessionStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(blocked)throw Error('blocked');values.set(k,v);},removeItem:k=>values.delete(k)};
  const history={replaceState:(_a,_b,url)=>{location.hash='';events.push(['scrub',url]);}};
  const listeners={};const window={addEventListener:(name,fn)=>listeners[name]=fn};vm.runInNewContext(source,{window,sessionStorage,location,history,Object,JSON});return{api:window.AAFStockAccess,values,events,location,listeners};
}
const owner=JSON.stringify({stockSessionToken:'owner-private',role:'admin'});
for(const blocked of [false,true]){
  const r=run('#stock-link='+token,{aaf_user:owner},blocked);
  assert.equal(r.api.isShared(),true);assert.equal(r.api.token(),token);assert.equal(r.location.hash,'');assert.equal(r.values.get('aaf_user'),owner);
  assert.equal(r.events[0][0],'scrub');assert(!JSON.stringify(r.events).includes(token));
  r.api.exit();assert.equal(r.values.get('aaf_user'),owner);assert(!r.values.has('aaf_stock_sales_link_v1'));
}
for(const hash of ['#stock-link=bad','#stock-link=','#stock-link='+token+'&bad=1']){
  const r=run(hash,{aaf_user:owner});assert(r.api.isShared());assert.equal(r.api.token(),'aafsl.invalid');assert.equal(r.location.hash,'');
}
const resumed=run('',{aaf_stock_sales_link_v1:token,aaf_user:owner});assert.equal(resumed.api.token(),token);
const invalid=run('',{aaf_stock_sales_link_v1:'invalid',aaf_user:owner});assert.equal(invalid.api.token(),'aafsl.invalid');
assert.equal(run('',{aaf_user:owner}).api.token(),'owner-private');assert.equal(run().api.token(),'');
for(const old of [token,'invalid']){const r=run('',{aaf_stock_sales_link_v1:old,aaf_user:owner}),fresh=token.replace(/B/g,'C');r.location.hash='#stock-link='+fresh;r.listeners.hashchange();assert.equal(r.api.token(),fresh);assert.equal(r.location.hash,'');assert.equal(r.events.at(-1)[0],'reload');assert.equal(r.values.get('aaf_user'),owner);}
const html=fs.readFileSync(new URL('../stock_manager.html',import.meta.url),'utf8');
assert(html.indexOf('stock_access.js')<html.indexOf('https://cdn.tailwindcss.com'));assert(html.includes('name="referrer" content="no-referrer"'));
console.log('PASS stock capability bootstrap: URL scrub, isolated session, no owner fallback, reload, explicit exit');
