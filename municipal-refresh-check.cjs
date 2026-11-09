const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const staging=require('./municipal-stage-download.cjs');

async function check(sources,{offset=0,limit=4,run=staging.run,...options}={}){
 if(!Array.isArray(sources)||sources.some(x=>typeof x.source!=='string'||!/^[a-f0-9]{64}$/.test(x.sha256||'')))throw Error('기존 출처 목록을 확인하세요.');
 const hashes=new Map();
 const items=sources.map(x=>({source:x.source,parser:'table'}));
 const result=await run(items,{...options,offset,limit,save:async(bytes,url)=>{hashes.set(url,crypto.createHash('sha256').update(bytes).digest('hex'));return 'checked';}});
 return {checkedAt:new Date().toISOString(),nextOffset:result.nextOffset,remaining:result.remaining,results:result.results.map((r,i)=>{
  const source=sources[offset+i],hash=hashes.get(source.source);
  return {source:source.source,previouslyExtractedAt:source.extractedAt||null,status:r.status==='failed'?'failed':hash===source.sha256?'unchanged':'changed',...(r.status==='failed'?{reason:r.reason}:{}),...(hash?{observedSha256:hash}:{})};
 }),note:'원본 페이지의 바이트 변경 여부만 확인합니다. 변경된 자료는 이용 조건과 본문을 다시 확인한 후 반영하며, 확인 실패 시 기존 자료를 보존합니다.'};
}
async function main(){
 const [file,dir,limitArg,offsetArg]=process.argv.slice(2);if(!file||!dir)throw Error('사용법: node municipal-refresh-check.cjs 자료.json 보고서폴더 [개수] [시작위치]');
 const root=path.resolve(process.cwd(),'..'),dest=path.resolve(dir),relative=path.relative(root,dest);if(!relative||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('보고서 폴더는 작업 폴더 안에 있어야 합니다.');
 const data=JSON.parse(await fs.readFile(file,'utf8'));const result=await check(data.sources,{limit:limitArg?Number(limitArg):4,offset:offsetArg?Number(offsetArg):0});
 await fs.mkdir(dest,{recursive:true});const output=path.join(dest,'refresh-'+crypto.randomUUID()+'.json');await fs.writeFile(output,JSON.stringify(result,null,2),{flag:'wx'});
 console.log(JSON.stringify({report:output,checked:result.results.length,nextOffset:result.nextOffset,counts:Object.fromEntries(['unchanged','changed','failed'].map(x=>[x,result.results.filter(r=>r.status===x).length]))}));
}
module.exports={check};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
