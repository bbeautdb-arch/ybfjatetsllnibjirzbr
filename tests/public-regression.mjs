import {readFileSync,readdirSync} from 'node:fs';
import {Script} from 'node:vm';
import assert from 'node:assert/strict';
const files=readdirSync(new URL('../',import.meta.url)).filter(f=>/\.(html|js)$/.test(f));
const workflow=readFileSync(new URL('../.github/workflows/static.yml',import.meta.url),'utf8');
assert(readFileSync(new URL('../login-bg.png',import.meta.url)).length>0,'Missing login background');
assert(workflow.includes('cp ./login-bg.png _site/'),'Login background excluded from deployment');
for(const file of files){
 const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
 assert(!/AAF_PLAN_SECRET|const API_SECRET|const LOG_SECRET|password\s*:\s*['"][^'"]+/.test(source),'Public secret in '+file);
 if(file.endsWith('.js'))new Script(source,{filename:file});
 else for(const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!/\bsrc=|application\/(ld\+)?json/.test(match[1])&&match[2].trim())new Script(match[2],{filename:file});}
 for(const match of source.matchAll(/(?:href|src)=["']([\w.-]+\.(?:html|js))["']/g))assert(files.includes(match[1]),'Broken local link '+file+' -> '+match[1]);
}
for(const name of ['history_database','sales_analytics','production_plan']){
 const source=readFileSync(new URL('../'+name+'.html',import.meta.url),'utf8');
 assert(source.length<3000&&source.includes('portal-loader.js'),'Protected page is not a loader: '+name);
 assert(!/DB_STATS|CUST_MONTHLY|HISTORICAL_IMPORT/.test(source),'Private data in public '+name);
}
console.log(`Public checks passed: ${files.length} files, syntax, local links, protected loaders and secrets.`);
