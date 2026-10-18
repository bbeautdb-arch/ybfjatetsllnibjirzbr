import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Public Git includes tests and history, not just the Pages upload. Keep every
// fixture synthetic and review new data manually BEFORE pushing. These generic
// structural checks are a safety net, not proof that financial data is absent.
// Never put actual amounts, customers, credentials or private fingerprints here.
const root=fileURLToPath(new URL('../',import.meta.url));
const privateDirectory=/^(?:outputs?|operations|private|evidence|exports?|snapshots?|secrets?|credentials)$/i;
const privateDataFile=/(?:evidence|snapshot|export)[^/]*\.(?:json|jsonl|csv|tsv|xlsx?|sql|zip|tar|gz)$/i;
const retiredPrivatePaths=new Set(['stock_pricing.js','tests/stock-pricing.mjs']);
const datasetNames=new Set(['DB_STATS','CUST_MONTHLY','PORT_DATA','HISTORICAL_IMPORT_2607','HISTORICAL_COST_IMPORT_2607','YUCA_SUPPLIER_NAMES','FUEL_SUPPLIER_NAMES','SEED_SIZE_DATA','STD_PHR_DEFAULT','STD_PHR']);
const secretNames=new Set(['API_SECRET','LOG_SECRET','AAF_PLAN_SECRET']);
const passwordKeys=new Set(['password','pass','pwd']);

function pathIssue(name){
  if(retiredPrivatePaths.has(name))return 'retired-private-policy-path';
  const parts=name.split('/');
  if(parts.slice(0,-1).some(part=>privateDirectory.test(part)))return 'private-data-directory';
  if(privateDataFile.test(parts.at(-1)))return 'private-data-file';
  if(/^\.env(?:\.|$)/i.test(parts.at(-1)))return 'environment-file';
  return null;
}

// Tokenize without executing source. Strings, comments and regexes must not
// become declarations: the checker itself and synthetic negative cases contain
// these marker names as inert text.
function tokens(source){
  const out=[];let i=0;
  while(i<source.length){
    const c=source[i];
    if(/\s/.test(c)){i++;continue;}
    if(source.startsWith('//',i)){i=source.indexOf('\n',i+2);if(i<0)break;continue;}
    if(source.startsWith('/*',i)){const end=source.indexOf('*/',i+2);i=end<0?source.length:end+2;continue;}
    if(c==='"'||c==="'"||c==='`'){
      const quote=c,start=++i;let interpolated=false;
      while(i<source.length&&source[i]!==quote){if(source[i]==='\\'){i+=2;continue;}if(quote==='`'&&source.startsWith('${',i))interpolated=true;i++;}
      out.push({kind:interpolated?'dynamic':'literal',value:source.slice(start,i)});i++;continue;
    }
    const prev=out.at(-1)?.value;
    if(c==='/'&&(prev===undefined||['=','(','[','{',',',':','!','?','return','case','=>'].includes(prev))){
      i++;let bracket=false;
      while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i]==='[')bracket=true;else if(source[i]===']')bracket=false;else if(source[i]==='/'&&!bracket){i++;break;}i++;}
      while(/[a-z]/i.test(source[i]||'')&&i<source.length)i++;
      out.push({kind:'regex',value:'REGEX'});continue;
    }
    const identifier=source.slice(i).match(/^[A-Za-z_$][\w$]*/);
    if(identifier){out.push({kind:'identifier',value:identifier[0]});i+=identifier[0].length;continue;}
    const number=source.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if(number){out.push({kind:'number',value:number[0]});i+=number[0].length;continue;}
    if(source.startsWith('=>',i)){out.push({kind:'punctuation',value:'=>'});i+=2;continue;}
    out.push({kind:'punctuation',value:c});i++;
  }
  return out;
}

function literal(list,start,depth=0){
  if(depth>60)return null;
  const token=list[start];if(!token)return null;
  if(token.kind==='literal'||token.kind==='number'||['true','false','null'].includes(token.value))return {end:start+1,nonempty:token.value!=='',password:false,scalar:true};
  if(token.value==='-'&&list[start+1]?.kind==='number')return {end:start+2,nonempty:true,password:false,scalar:true};
  if(!['[','{'].includes(token.value))return null;
  const object=token.value==='{',close=object?'}':']';let i=start+1,count=0,password=false;
  while(list[i]&&list[i].value!==close){
    let key=null;
    if(object){if(!['identifier','literal','number'].includes(list[i]?.kind)||list[i+1]?.value!==':')return null;key=list[i].value;i+=2;}
    const child=literal(list,i,depth+1);if(!child)return null;
    password ||= child.password||(passwordKeys.has(String(key).toLowerCase())&&child.scalar&&child.nonempty);
    count++;i=child.end;
    if(list[i]?.value===','){i++;continue;}
    if(list[i]?.value!==close)return null;
  }
  return list[i]?.value===close?{end:i+1,nonempty:count>0,password,scalar:false}:null;
}

function codeIssues(source){
  const list=tokens(source),issues=new Set();
  for(let i=0;i<list.length;i++){
    const name=list[i];if(!['identifier','literal'].includes(name.kind)||!['=',':'].includes(list[i+1]?.value))continue;
    const value=literal(list,i+2);
    if(datasetNames.has(name.value)&&value&&!value.scalar&&value.nonempty)issues.add('embedded-dataset');
    if(datasetNames.has(name.value)&&list[i+2]?.value==='JSON'&&list[i+3]?.value==='.'&&list[i+4]?.value==='parse'&&list[i+5]?.value==='('&&list[i+6]?.kind==='literal'){
      try{const parsed=JSON.parse(list[i+6].value);if(parsed&&typeof parsed==='object'&&Object.keys(parsed).length)issues.add('embedded-dataset');}catch{/* Dynamic or non-JSON text still requires manual review. */}
    }
    if(secretNames.has(name.value)&&value?.scalar&&value.nonempty)issues.add('literal-legacy-secret');
    if(name.value==='USERS'&&value?.password)issues.add('literal-users-password');
  }
  return [...issues];
}

function inspect(name,source){
  const denied=pathIssue(name);if(denied)return [denied];
  const code=/\.html?$/i.test(name)?[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(match=>match[1]).join('\n'):source;
  return codeIssues(code);
}

// Self-tests use visibly invented values, never copies of private source data.
const cases=[
  ['demo.js','const DB_STATS = {synthetic: 1};',true],
  ['demo.js','const CUST_MONTHLY = [{sample: 2}];',true],
  ['demo.js','window.PORT_DATA = {example: [3]};',true],
  ['demo.js','const HISTORICAL_IMPORT_2607 = [{example: "SYNTHETIC"}];',true],
  ...['HISTORICAL_COST_IMPORT_2607','YUCA_SUPPLIER_NAMES','FUEL_SUPPLIER_NAMES','SEED_SIZE_DATA','STD_PHR_DEFAULT','STD_PHR'].map(name=>['demo.js',`const ${name} = [{example: "SYNTHETIC-ONLY"}];`,true]),
  ['demo.json','{"PORT_DATA":{"synthetic":1}}',true],
  ['demo.json','{"PORT_DATA":{}}',false],
  ['demo.js',`const PORT_DATA = JSON.parse('{"synthetic":1}');`,true],
  ['demo.js',`const PORT_DATA = JSON.parse('{}');`,false],
  ['demo.js','const API_SECRET = "SYNTHETIC-NOT-A-CREDENTIAL";',true],
  ['demo.js','const USERS = [{name: "SYNTHETIC", password: "NOT-A-CREDENTIAL"}];',true],
  ['demo.js','const USERS = {sample: {pass: "SYNTHETIC-ONLY"}};',true],
  ['demo.js','const DB_STATS = {}; const PORT_DATA = [];',false],
  ['demo.js','const PORT_DATA = {load: () => fetch("/api/example")};',false],
  ['demo.js','const DB_STATS = loadProtectedData(); const USERS = getUsers();',false],
  ['demo.js','const API_SECRET = env.API_SECRET; const USERS = {sample: {password: ""}};',false],
  ['demo.js','// const DB_STATS = {synthetic: 1};\n/* USERS = [{password: "EXAMPLE"}]; */',false],
  ['demo.js','const example = "const DB_STATS = {synthetic: 1};";',false],
  ['demo.js','const pattern = /DB_STATS = [{]/; const value = /[\x27\x22]/;',false],
  ['demo.html','<p>DB_STATS = {example: 1}</p><script>const PORT_DATA = [];</script>',false],
  ['demo.html','<script>const PORT_DATA = {example: 1};</script>',true],
  ['evidence/synthetic.json','{}',true],
  ['tests/snapshots/synthetic.json','{}',true],
  ['exports/synthetic.csv','example',true],
  ['app/stock-evidence-data.json','{}',true],
  ['.env.example','EXAMPLE_ONLY=',true],
  ['tests/stock-report-export.mjs','const example = 1;',false],
  ['stock_pricing.js','// SYNTHETIC PLACEHOLDER ONLY',true],
  ['tests/stock-pricing.mjs','// SYNTHETIC PLACEHOLDER ONLY',true],
];
for(const [name,source,blocked] of cases)assert.equal(inspect(name,source).length>0,blocked,'Synthetic confidentiality self-test failed');

const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
// Include this new check before it is tracked, so local pre-publication runs
// exercise the same file as CI. Other proposed files still need manual review.
const files=[...new Set([...tracked,path.relative(root,fileURLToPath(import.meta.url))])];
const failures=[];
for(const name of files){
  const denied=pathIssue(name);if(denied){failures.push({path:name,reason:denied});continue;}
  const absolute=path.resolve(root,name);
  if(!absolute.startsWith(root)){failures.push({path:name,reason:'outside-repository'});continue;}
  const stat=lstatSync(absolute);
  if(stat.isSymbolicLink()){failures.push({path:name,reason:'unreviewed-symlink'});continue;}
  if(stat.size>5_000_000){failures.push({path:name,reason:'oversized-file-needs-private-data-review'});continue;}
  const buffer=readFileSync(absolute);if(buffer.includes(0))continue;
  for(const reason of inspect(name,buffer.toString('utf8')))failures.push({path:name,reason});
}
if(failures.length){
  // Report only path + generic reason; never echo confidential matched content.
  console.error('Public confidentiality check failed:');
  for(const failure of failures)console.error(`${failure.path}: ${failure.reason}`);
  process.exitCode=1;
}else console.log(`Public confidentiality checks passed: ${cases.length} synthetic cases; ${files.length} tracked/check files. Manual synthetic-fixture review remains required.`);
