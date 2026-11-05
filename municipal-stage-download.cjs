const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {download,validateUrl}=require('./official-fetch');
const registry=require('./catalog-institutions.json').records;
const hosts=new Set(registry.flatMap(r=>{try{return [new URL(r.url).hostname]}catch{return []}}));
const userAgent='PolicyResearchPrototype/0.2';
function robotsRule(text,url,python=process.env.POLICY_PYTHON||(process.platform==='win32'?'python':'python3')){
 const code='import json,sys,urllib.robotparser\np=urllib.robotparser.RobotFileParser();p.parse(sys.stdin.read().splitlines());u=sys.argv[1];a=sys.argv[2];r=p.request_rate(a);print(json.dumps({"allowed":p.can_fetch(a,u),"delay":max(p.crawl_delay(a) or 0,(r.seconds/r.requests) if r and r.requests else 0)}))';
 const child=spawnSync(python,['-c',code,url,userAgent],{input:text,encoding:'utf8',timeout:5000,maxBuffer:100000,windowsHide:true});
 if(child.status!==0)throw Error('robots_rules_unavailable');
 const v=JSON.parse(child.stdout);if(typeof v.allowed!=='boolean'||!Number.isFinite(v.delay)||v.delay<0)throw Error('robots_rules_invalid');return v;
}
async function run(items,{fetcher=download,rule=robotsRule,save,sleep=ms=>new Promise(r=>setTimeout(r,ms)),limit=4,offset=0}={}){
 if(!Array.isArray(items)||!Number.isInteger(limit)||limit<1||limit>10||!Number.isInteger(offset)||offset<0||offset>items.length||typeof save!=='function')throw Error('수집 목록 또는 개수를 확인하세요.');
 const selected=items.slice(offset,offset+limit),results=[],manifest=[],cache=new Map();let first=true;
 for(const item of selected){
  try{
   if(!item||typeof item.source!=='string'||!['table','section','detail'].includes(item.parser)||(item.parser==='detail'&&(typeof item.title!=='string'||!item.title.trim()||item.title.length>200)))throw Error('invalid_entry');
   const url=validateUrl(item.source);if(!hosts.has(url.hostname))throw Error('unregistered_host');
   if(!cache.has(url.origin)){
    if(!first)await sleep(3000);first=false;
    try{const r=await fetcher(url.origin+'/robots.txt',0,Date.now()+25000,undefined,undefined,true);if(r.bytes.length>1000000||/text\/html/i.test(r.type))throw Error('robots_invalid');cache.set(url.origin,r.bytes.toString('utf8'));}
    catch(e){if(e.code==='HTTP_404')cache.set(url.origin,'');else throw Error('robots_unavailable');}
   }
   const permission=rule(cache.get(url.origin),url.href);if(!permission.allowed)throw Error('robots_disallowed');
   const delay=Math.max(3000,Math.ceil(permission.delay*1000));if(delay>60000)throw Error('crawl_delay_exceeds_batch_limit');
   await sleep(delay);first=false;
   const response=await fetcher(url.href,0,Date.now()+25000,undefined,undefined,true);
   if(new URL(response.url).hostname!==url.hostname||!/text\/html/i.test(response.type)||response.bytes.length<500)throw Error('unexpected_page');
   const file=await save(response.bytes,url.href);manifest.push({source:response.url,file,parser:item.parser,...(item.parser==='detail'?{title:item.title}:{})});results.push({source:url.href,status:'downloaded',bytes:response.bytes.length});
  }catch(e){results.push({source:typeof item?.source==='string'?item.source:null,status:'failed',reason:String(e.code||e.message||'unknown').slice(0,100)});}
 }
 const nextOffset=offset+selected.length<items.length?offset+selected.length:null;
 return {attempted:selected.length,nextOffset,remaining:Math.max(0,items.length-offset-selected.length),manifest,results};
}
async function main(){
 const [input,dir,limitArg,offsetArg]=process.argv.slice(2),limit=limitArg?Number(limitArg):4,offset=offsetArg?Number(offsetArg):0;if(!input||!dir)throw Error('사용법: node municipal-stage-download.cjs 목록.json 저장폴더 [개수] [시작위치]');
 const root=path.resolve(process.cwd(),'..'),dest=path.resolve(dir),relative=path.relative(root,dest);
 if(!relative||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('저장폴더는 작업 폴더 안에 있어야 합니다.');
 const items=JSON.parse(await fs.readFile(input,'utf8'));await fs.mkdir(dest,{recursive:true});
 const save=async(bytes)=>{const name=crypto.randomUUID()+'.html',target=path.join(dest,name);await fs.writeFile(target,bytes,{flag:'wx'});return target;};
 const result=await run(items,{save,limit,offset});const id=crypto.randomUUID();
 await fs.writeFile(path.join(dest,'manifest-'+id+'.json'),JSON.stringify(result.manifest,null,2),{flag:'wx'});
 await fs.writeFile(path.join(dest,'report-'+id+'.json'),JSON.stringify({attempted:result.attempted,nextOffset:result.nextOffset,remaining:result.remaining,results:result.results},null,2),{flag:'wx'});
 console.log(JSON.stringify({attempted:result.attempted,downloaded:result.manifest.length,nextOffset:result.nextOffset,remaining:result.remaining,report:'report-'+id+'.json',manifest:'manifest-'+id+'.json'}));
}
module.exports={run,robotsRule};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
