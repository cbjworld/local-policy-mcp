const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const staging=require('./municipal-stage-download.cjs'),{extract}=require('./discovery');
function candidates(base,links){
 const host=new URL(base).hostname,seen=new Set(),found=[];
 for(const link of links){
  if(!link||typeof link.url!=='string'||typeof link.title!=='string'||!/(정책|지원사업|사업안내|일자리|1인가구|복지|청년|임신|출산|장애인)/.test(link.title))continue;
  let u;try{u=new URL(link.url);}catch{continue;}
  if(u.protocol!=='https:'||u.hostname!==host||u.username||u.password||(u.port&&u.port!=='443')||staging.temporaryUrl(u)||/\.(?:pdf|hwp|hwpx|zip|xls|xlsx)$/i.test(u.pathname))continue;
  u.hash='';if(seen.has(u.href)||u.href===base)continue;seen.add(u.href);
  found.push({title:link.title.slice(0,200),url:u.href,status:'unverified_menu_link'});
 }
 return found;
}
async function discover(url,{fetch=staging.run,save,read=fs.readFile,parse=extract,sleep}={}){
 if(typeof save!=='function')throw Error('원문 보관 경로가 필요합니다.');
 const staged=await fetch([{source:url,parser:'table'}],{save,limit:1,...(sleep?{sleep}:{})});
 if(!staged.manifest.length)return {source:url,status:'not_read',reason:staged.results[0]?.reason||'download_failed',candidates:[]};
 const page=staged.manifest[0],bytes=await read(page.file),parsed=await parse(bytes,{url:page.source,type:'text/html',page:1,discovery:true});
 const links=candidates(page.source,parsed.links||[]);
 return {source:page.source,status:'menu_candidates',candidateCount:links.length,candidates:links,scope:'조회한 첫 페이지의 링크 중 최대 1,000개를 살펴본 미검증 메뉴 후보입니다. 사업 여부와 수집 가능 여부는 각 원문에서 확인해야 합니다.'};
}
async function main(){
 const [url,dir]=process.argv.slice(2);if(!url||!dir)throw Error('사용법: node municipal-discovery.cjs 홈페이지주소 저장폴더');
 const root=path.resolve(process.cwd(),'..'),dest=path.resolve(dir),relative=path.relative(root,dest);if(!relative||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('저장폴더는 작업 폴더 안에 있어야 합니다.');
 await fs.mkdir(dest,{recursive:true});
 const save=async bytes=>{const file=path.join(dest,crypto.randomUUID()+'.html');await fs.writeFile(file,bytes,{flag:'wx'});return file;};
 const result=await discover(url,{save}),file=path.join(dest,'discovery-'+crypto.randomUUID()+'.json');await fs.writeFile(file,JSON.stringify(result,null,2),{flag:'wx'});
 console.log(JSON.stringify({source:result.source,status:result.status,candidates:result.candidateCount||0,reason:result.reason||null,report:path.basename(file)}));
}
module.exports={candidates,discover};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
