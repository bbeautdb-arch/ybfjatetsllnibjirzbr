// Synthetic login responses only. A named server login must not leave the same
// tab pinned to an older read-only capability, or turn failed auth into access.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../login.html',import.meta.url),'utf8');
const source=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const capabilityKey='aaf_stock_sales_link_v1';
const capability='aafsl.'+'a'.repeat(32)+'.'+'B'.repeat(43);
const validReply=(username='admin',role='admin')=>({ok:true,user:{username,role,name:'Synthetic account'},bridgeSessionToken:'SYNTHETIC-NAMED-SESSION'});
function harness({search='?next=stock-sales',saved={},reply=validReply(),httpOk=true,fetchError=null,failWrite=false,pending=null}={}){
  const values=new Map([[capabilityKey,capability],['unrelated','keep'],...Object.entries(saved)]),events=[],fetches=[],timers=[];
  const nodes=new Map(['username','password','btn-login','error-msg'].map(id=>[id,{value:'',disabled:false,textContent:'',style:{},focus(){}}]));
  const location={search,href:''};
  const sessionStorage={getItem:key=>values.get(key)??null,setItem(key,value){events.push(['write',key]);if(failWrite)throw Error('synthetic storage write failure');values.set(key,value);},removeItem(key){events.push(['remove',key]);values.delete(key);}};
  const context={location,sessionStorage,URLSearchParams,AbortSignal:{timeout:()=>({})},navigator:{userAgent:'Synthetic browser'},document:{getElementById:id=>nodes.get(id),querySelector:()=>({textContent:''})},setTimeout:fn=>timers.push(fn),fetch:async(url,options)=>{fetches.push({url,options});if(fetchError)throw fetchError;if(pending)return pending;return {ok:httpOk,json:async()=>reply};}};
  context.window={location};vm.runInNewContext(source,context);
  const login=async(username='admin',password='synthetic-password')=>{nodes.get('username').value=username;nodes.get('password').value=password;return context.doLogin();};
  return {values,events,fetches,timers,nodes,location,login,context};
}

test('verified named server login clears only the stale capability after the session write',async()=>{
  for(const [username,role] of [['admin','admin'],['nok','stock_viewer']]){
    const r=harness({reply:validReply(username,role)});await r.login(username);
    assert.equal(r.values.has(capabilityKey),false);
    assert.equal(r.values.get('unrelated'),'keep');
    const user=JSON.parse(r.values.get('aaf_user'));assert.equal(user.username,username);assert.equal(user.bridgeSessionToken,'SYNTHETIC-NAMED-SESSION');
    assert.deepEqual(r.events,[['write','aaf_user'],['remove',capabilityKey]]);
    assert.equal(r.fetches.length,1);assert.equal(r.fetches[0].options.method,'POST');
    r.timers.forEach(fn=>fn());assert.equal(r.location.href,'stock_manager.html?view=sales');
    assert.equal(r.location.href.includes('SESSION'),false,'no session in destination');
  }
});

test('failed, mismatched and malformed server authentication retain the read-only capability',async()=>{
  const invalid=[
    {httpOk:false},{reply:{...validReply(),ok:false}},{reply:{...validReply(),ok:'true'}},{reply:{...validReply(),user:null}},
    {reply:validReply('other-user')},{reply:validReply('admin','stock_viewer')},
    ...[null,undefined,'','   ',{},[],123].map(token=>({reply:{...validReply(),bridgeSessionToken:token}})),
    {fetchError:Error('synthetic offline')}
  ];
  for(const options of invalid){const r=harness(options);await r.login();assert.equal(r.values.get(capabilityKey),capability);assert.equal(r.values.has('aaf_user'),false);assert.equal(r.events.some(event=>event[0]==='remove'),false);assert.equal(r.nodes.get('error-msg').style.display,'block');}
});

test('page load, reauth, cached profile and absent credentials do not clear capability',async()=>{
  for(const search of ['', '?next=stock-sales','?reauth=1&next=stock-sales']){
    const r=harness({search,saved:{aaf_user:JSON.stringify({username:'admin',role:'admin'})}});
    assert.equal(r.values.get(capabilityKey),capability);assert.equal(r.fetches.length,0);
    assert.equal(r.events.some(event=>event[1]===capabilityKey),false);
  }
  for(const [username,password] of [['','x'],['admin',''],['unknown','synthetic-password']]){
    const r=harness();await r.login(username,password);assert.equal(r.values.get(capabilityKey),capability);assert.equal(r.fetches.length,0);assert.equal(r.values.has('aaf_user'),false);
  }
});

test('capability remains until authentication completes and a failed session write never clears it',async()=>{
  let resolve;const pending=new Promise(done=>resolve=done),r=harness({pending});
  const login=r.login();assert.equal(r.values.get(capabilityKey),capability);assert.equal(r.values.has('aaf_user'),false);
  resolve({ok:true,json:async()=>validReply()});await login;assert.equal(r.values.has(capabilityKey),false);
  const blocked=harness({failWrite:true});await assert.rejects(blocked.login(),/storage write failure/);
  assert.equal(blocked.values.get(capabilityKey),capability);assert.equal(blocked.values.has('aaf_user'),false);assert.deepEqual(blocked.events,[['write','aaf_user']]);
});

test('fixed existing return routes are unchanged and never accept an external destination',()=>{
  const route=html.slice(html.indexOf('const stockSalesDestination'),html.indexOf('async function doLogin'))+'\nresult=loginDestination(role);';
  for(const [role,ordinary] of [['admin','dashboard_home.html'],['sales','dashboard_home.html'],['stock_viewer','stock_manager.html'],['stock_sales','dashboard_home.html'],['purchase_material','production_plan.html'],['hr','dashboard_home.html']]){
    for(const search of ['', '?next=https://invalid.example/', '?next=//invalid.example/']){const c={location:{search},URLSearchParams,role};vm.runInNewContext(route,c);assert.equal(c.result,ordinary);}
    const c={location:{search:'?next=stock-sales'},URLSearchParams,role};vm.runInNewContext(route,c);assert.equal(c.result,['admin','sales','stock_viewer','stock_sales'].includes(role)?'stock_manager.html?view=sales':ordinary);
  }
});
