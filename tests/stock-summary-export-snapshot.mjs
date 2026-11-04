import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Synthetic async rendering only. No transport, company records or credentials.
const source=readFileSync(new URL('../stock_summary.js',import.meta.url),'utf8');
const start=source.indexOf("  async function download(which='stock'){");
const end=source.indexOf('  window.AAFStockSummary={update',start);
assert(start>=0&&end>start);
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

function runtime(){
  const canvasGate=deferred(),fontGate=deferred(),captured=[],links=[],status={textContent:''},buttons=[{disabled:false}];
  const state={groups:'initial confirmed / negotiation',price:'initial saved price'};
  const boxes=[];
  const root={querySelector:()=>status,querySelectorAll:()=>buttons};
  const document={fonts:{ready:fontGate.promise},body:{append(){}},createElement(type){
    if(type==='a'){const link={click(){links.push({...this});}};return link;}
    const box={dataset:{},style:{},innerHTML:'',querySelectorAll:()=>[],querySelector(){return this;},getBoundingClientRect(){return {width:1440,height:800};},remove(){this.removed=true;}};
    boxes.push(box);return box;
  }};
  const render=model=>JSON.stringify({revision:model.revision,groups:state.groups,price:state.price});
  const context={root,document,Set,Math,JSON,Date,URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL(){}},setTimeout(){},
    latest:{revision:1,reportDate:'2030-11-04',updatedAt:'2030-11-04T01:00:00Z',rows:[{}],cash:{label:'initial receipt'},productionLoading:{source:'initial'}},
    exporting:false,expandedThickness:new Set(['2.5']),expandedThicknessProduction:new Set(['2.5']),expandedPhysicalGrades:new Set(),
    productionSettings:{woodPricePerTonne:'1550'},
    loadCanvas:()=>canvasGate.promise,when:String,setCardView(){},restorePhysicalGrades(){},
    dailyOverviewHTML:render,html:(model,thickness,production,options)=>JSON.stringify({...JSON.parse(render(model)),thickness:[...thickness],production:[...production],settings:options.settings,loading:options.productionLoading}),
    window:{AAFStockCash:{render:cash=>cash.label}}};
  const api=vm.runInNewContext(source.slice(start,end)+'\n({download,refresh(){latest={...latest,revision:2,cash:{label:"new receipt"}};productionSettings.woodPricePerTonne="9999";expandedThickness.add("6");},isExporting(){return exporting;}})',context);
  return {api,state,buttons,status,boxes,links,captured,
    async start(which){const running=api.download(which);await Promise.resolve();return {running};},
    canvasReady(){canvasGate.resolve(async box=>{captured.push(box.innerHTML);return {toBlob:done=>done({synthetic:true})};});},
    fontsReady(){fontGate.resolve();}};
}

for(const which of ['overview','stock']){
  test(`${which} PNG freezes stock, current sales groups and valuation together before canvas/font awaits`,async()=>{
    const h=runtime(),{running}=await h.start(which);
    assert.equal(h.api.isExporting(),true);assert.equal(h.buttons[0].disabled,true);
    h.state.groups='new confirmed / negotiation';h.state.price='new saved price';h.api.refresh();
    h.canvasReady();await Promise.resolve();
    h.state.groups='even newer receipt evidence';h.fontsReady();await running;
    assert.equal(h.captured.length,1);const image=JSON.parse(h.captured[0]);
    assert.equal(image.revision,1);assert.equal(image.groups,'initial confirmed / negotiation');assert.equal(image.price,'initial saved price');
    if(which==='stock'){
      assert.deepEqual(image.thickness,['2.5']);assert.deepEqual(image.production,['2.5']);
      assert.equal(image.settings.woodPricePerTonne,'1550');assert.equal(image.loading.source,'initial');
    }
    assert.equal(h.links.length,1);assert.match(h.links[0].download,/2030-11-04\.png$/);
    assert.equal(h.api.isExporting(),false);assert.equal(h.buttons[0].disabled,false);assert(h.boxes[0].removed);
    assert.match(h.status.textContent,/มีข้อมูลใหม่/);
  });
}

test('cash export retains the same captured cash and never reruns a stock or sales write',async()=>{
  const h=runtime(),{running}=await h.start('cash');h.api.refresh();h.canvasReady();h.fontsReady();await running;
  assert.deepEqual(h.captured,['initial receipt']);assert.equal(h.links.length,1);assert.match(h.links[0].download,/AAF_Stock_Cash_/);
});

test('capture rendering failure exits cleanly before asynchronous work without a stale download',async()=>{
  const h=runtime();h.state.groups={toJSON(){throw Error('synthetic projection failure');}};
  const {running}=await h.start('overview');h.canvasReady();h.fontsReady();await running;
  assert.equal(h.links.length,0);assert.equal(h.api.isExporting(),false);assert.equal(h.buttons[0].disabled,false);
  assert.match(h.status.textContent,/synthetic projection failure/);
});
