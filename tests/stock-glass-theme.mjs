import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Structural presentation-only checks. No API, browser, company rows or credentials.
const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
const clean=text=>text.replace(/\/\*[\s\S]*?\*\//g,'').trim();
const outer=read('../stock_premium.css'),review=read('../stock_order_review.css');
const marker='/* AAF calm premium screen theme.';
assert.ok(review.includes(marker),'the retained shadow theme boundary exists');
// Receipt and annotation modules can follow the theme. Only the balanced screen
// block is the theme; do not mistake later functional/print CSS for theme paint.
const themeTail=review.slice(review.indexOf(marker));
const themeOpen=themeTail.indexOf('{',themeTail.indexOf('@media screen'));
let themeDepth=1,themeEnd=themeOpen+1;
for(;themeEnd<themeTail.length&&themeDepth;themeEnd++){
  if(themeTail[themeEnd]==='{')themeDepth++;
  else if(themeTail[themeEnd]==='}')themeDepth--;
}
assert.equal(themeDepth,0,'the screen theme closes before later module rules');
const shadow=themeTail.slice(0,themeEnd);

// Small balanced-block reader: nested screen/support/accessibility conditions are
// retained instead of inferring their scope from a single startsWith assertion.
function rules(css){
  const text=clean(css),out=[];let pos=0;
  function walk(ancestors=[]){
    while(pos<text.length){
      while(/\s/.test(text[pos]||'')&&pos<text.length)pos++;
      if(text[pos]==='}'){pos++;return;}
      if(pos>=text.length)return;
      const start=pos;let quote='',parentheses=0;
      for(;pos<text.length;pos++){
        const c=text[pos];
        if(quote){if(c==='\\')pos++;else if(c===quote)quote='';continue;}
        if(c==='"'||c==="'"){quote=c;continue;}
        if(c==='(')parentheses++;else if(c===')')parentheses--;
        if(!parentheses&&(c==='{'||c===';'))break;
      }
      assert.equal(text[pos],'{','only block rules, not imports or malformed declarations');
      const selector=text.slice(start,pos++).trim();
      if(selector.startsWith('@')){assert.match(selector,/^@(media|supports)\b/);walk([...ancestors,selector]);continue;}
      const bodyStart=pos;quote='';parentheses=0;
      for(;pos<text.length;pos++){
        const c=text[pos];
        if(quote){if(c==='\\')pos++;else if(c===quote)quote='';continue;}
        if(c==='"'||c==="'"){quote=c;continue;}
        if(c==='(')parentheses++;else if(c===')')parentheses--;
        if(!parentheses&&c==='}')break;
        assert.notEqual(c,'{','style declarations do not contain nested selectors');
      }
      assert.equal(text[pos],'}','style rule terminates');
      const declarations=Object.fromEntries(text.slice(bodyStart,pos++).split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const colon=v.indexOf(':');assert.ok(colon>0);return [v.slice(0,colon).trim(),v.slice(colon+1).trim()];}));
      out.push({selector,ancestors,declarations});
    }
  }
  walk();return out;
}
const outerRules=rules(outer),shadowRules=rules(shadow),both=[...outerRules,...shadowRules];
const hasCondition=(rule,pattern)=>rule.ancestors.some(a=>pattern.test(a));
const backgrounds=rule=>Object.entries(rule.declarations).filter(([p])=>['background','background-color'].includes(p));
const opaque=value=>/^(?:#[0-9a-f]{3}(?:[0-9a-f]{3})?|Canvas|var\(--(?:surface|bg|aaf-paper)\))\s*(?:!important)?$/i.test(value);
const annotationDisplay=new Map([
  ['.annotation-unlock-form > label','block'],
  ['.annotation-tools #notes-import-preview:empty','none'],
  ['.annotation-tools #notes-import-preview td small','block'],
  ['[data-managed-annotations="true"] .notes-draft-warning','none']
]);

test('Pages publishes only the named decorative factory asset, not a broad data directory',()=>{
  const workflow=read('../.github/workflows/static.yml');
  assert.match(workflow,/mkdir -p _site\/assets/);
  assert.match(workflow,/cp \.\/assets\/aaf-factory-background\.webp _site\/assets\//);
  assert.doesNotMatch(workflow,/cp\s+-[a-z]*r|cp\s+\.\/assets\/\*|cp\s+\.\/(?:operations|outputs|work)\b/);
  assert.ok(fs.statSync(new URL('../assets/aaf-factory-background.webp',import.meta.url)).size>1000);
});

test('factory image is one local body background within screen-only theme rules',()=>{
  for(const rule of both)assert.equal(rule.ancestors[0],'@media screen',rule.selector+' must not affect print');
  assert.equal((clean(outer).match(/url\s*\(/gi)||[]).length,1);
  assert.deepEqual([...clean(outer).matchAll(/url\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m=>m[1]),['./assets/aaf-factory-background.webp']);
  assert.doesNotMatch(clean(shadow),/url\s*\(/i);
  for(const text of [outer,shadow])assert.doesNotMatch(clean(text),/@import|@font-face|https?:|data:|javascript:|\/\//i);
  const imageRules=outerRules.filter(r=>Object.values(r.declarations).some(v=>/url\s*\(/i.test(v)));
  assert.equal(imageRules.length,1);assert.equal(imageRules[0].selector,'body[data-aaf-premium="ivory"]');
  assert.equal(imageRules[0].declarations['background-size'],'cover');
  assert.doesNotMatch(clean(outer),/::?before|::?after|content\s*:/,'no decorative overlay can intercept controls');
  for(const r of outerRules){assert.match(r.selector,/^body\[data-aaf-premium/);if(/\.ss-/.test(r.selector))assert.match(r.selector,/#stock-summary/);}
});

test('glass changes background paint, never whole-content opacity, hidden state or control interception',()=>{
  for(const r of both)for(const[p,v]of Object.entries(r.declarations)){
    assert.ok(!['visibility','pointer-events','touch-action','overflow','overflow-x','overflow-y','contain','transform','animation','order'].includes(p),p+' is not a paint-only change');
    if(p==='filter'){assert.equal(r.selector,'body[data-aaf-premium] #stock-summary button:not(:disabled):hover');assert.equal(v,'brightness(.97)','only the retained button hover paint can use a content filter');}
    if(p==='opacity'&&v!=='1'){
      const allowed=r.selector==='.annotation-tools #notes-import-preview td small'?'.7':'.55';
      assert.ok(['.annotation-tools #notes-import-preview td small','body[data-aaf-premium] #stock-summary button:disabled'].includes(r.selector),'only retained disabled controls or import-preview metadata may fade');
      assert.equal(v,allowed,'stock quantities and content containers never fade');
    }
    if(p==='display')assert.equal(v,annotationDisplay.get(r.selector)||'none !important');
    if(p==='position')assert.equal(v,'relative','no new fixed/absolute interactive overlay');
    assert.ok(!/^z-index$/.test(p),'theme does not change control stacking');
  }
  assert.equal(outerRules.filter(r=>Object.hasOwn(r.declarations,'display')).length,1);
  assert.equal(shadowRules.filter(r=>Object.hasOwn(r.declarations,'display')).length,annotationDisplay.size);
  const hidden=outerRules.find(r=>r.selector==='body[data-aaf-premium] [hidden]');
  assert.equal(hidden?.declarations.display,'none !important');
  assert.match(review,/\[hidden\]\{display:none!important\}/);
  assert.match(review,/\.changes-toolbar button:disabled\{opacity:\.55;cursor:not-allowed\}/,'original button disabled semantics are unchanged');
  assert.match(clean(outer),/backdrop-filter\s*:\s*blur\(/);
  assert.match(clean(shadow),/backdrop-filter\s*:\s*blur\(/);
});

test('table cells, sticky registry cells and text editors retain opaque readable paint',()=>{
  const dataRules=both.filter(r=>/(?:thead|tbody|tfoot|textarea|\.with-tracking)/.test(r.selector));
  let checked=0;
  for(const r of dataRules)for(const[p,v]of backgrounds(r)){assert.ok(opaque(v),r.selector+' '+p+' must remain opaque: '+v);checked++;}
  assert.ok(checked>=10,'both summary and shadow data surfaces are checked');
  for(const selector of ['.ss-group thead','.ss-group tfoot'])assert.ok(outerRules.some(r=>r.selector.includes(selector)&&backgrounds(r).some(([,v])=>opaque(v))),selector);
  for(const selector of ['.with-tracking th:first-child','.with-tracking td:first-child','.tracking-cell textarea','.stock-note-cell textarea'])assert.ok(shadowRules.some(r=>r.selector.includes(selector)&&backgrounds(r).some(([,v])=>opaque(v))),selector);
  assert.ok(shadowRules.some(r=>r.selector.includes('textarea:disabled')&&r.declarations.cursor==='not-allowed'));
  for(const rs of [outerRules,shadowRules])assert.ok(rs.some(r=>r.selector.includes(':focus-visible')&&/^3px solid /.test(r.declarations.outline||'')),'strong visible keyboard focus remains');
});

test('no-blur, reduced-transparency, forced-colors and mobile fallbacks remain within screen scope',()=>{
  for(const rs of [outerRules,shadowRules]){
    const noBlur=rs.filter(r=>hasCondition(r,/^@supports.*not.*backdrop-filter/));
    assert.ok(noBlur.some(r=>backgrounds(r).some(([,v])=>opaque(v))),'unsupported backdrop filter has opaque fallback');
    const reduced=rs.filter(r=>hasCondition(r,/prefers-reduced-transparency:\s*reduce/));
    assert.ok(reduced.some(r=>backgrounds(r).some(([,v])=>opaque(v))),'reduced transparency restores opaque surfaces');
    assert.ok(reduced.some(r=>Object.entries(r.declarations).some(([p,v])=>p.includes('backdrop-filter')&&v==='none')),'reduced transparency disables blur');
    assert.ok(rs.some(r=>hasCondition(r,/forced-colors:\s*active/)&&r.declarations['outline-color']==='Highlight'),'forced color focus is retained');
  }
  assert.ok(outerRules.some(r=>hasCondition(r,/max-width:/)&&r.selector.includes('body[data-aaf-premium')&&r.declarations['background-attachment']==='scroll'),'mobile avoids a fixed photo backdrop');
  assert.ok(shadowRules.some(r=>hasCondition(r,/max-width:\s*520px/)&&r.selector.includes('.plainbutton')&&r.declarations['min-height']==='42px'),'small-screen controls retain touch size');
});

test('theme cannot paint the PNG clone or introduce business text and preserves clean image fallback',()=>{
  const summary=read('../stock_summary.js');
  assert.doesNotMatch(clean(outer),/\.ss-export|@media\s+print|content\s*:/);
  const clone=summary.slice(summary.indexOf("box=document.createElement('div')"),summary.indexOf('document.body.append(box)'));
  assert.match(clone,/box\.className='ss-export'/);assert.match(clone,/background:white/);assert.doesNotMatch(clone,/box\.id\s*=/);
  const imageRule=outerRules.find(r=>Object.values(r.declarations).some(v=>/url\s*\(/i.test(v)));
  assert.ok(imageRule.declarations['background-color']||/(?:#[0-9a-f]{3,8}|rgb\()/i.test(imageRule.declarations.background||''),'missing image retains a painted base');
  assert.match(clean(outer),/linear-gradient\(/,'photo is tinted independently of content opacity');
  assert.ok(outerRules.some(r=>hasCondition(r,/forced-colors:\s*active/)&&Object.entries(r.declarations).some(([p,v])=>p.startsWith('background')&&/Canvas|none/.test(v))),'high contrast never relies on a photo');
});
