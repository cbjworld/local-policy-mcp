const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {check}=require('./municipal-refresh-check.cjs');
const {writeAtomic}=require('./municipal-discovery-batch.cjs');
async function cycle(sources,state,{probe=check,checkpoint=async()=>{},batchSize=4,maxBatches=1}={}){
 if(!Array.isArray(sources)||!state||!Array.isArray(state.results)||!Number.isInteger(state.nextOffset)||state.nextOffset<0||state.nextOffset>sources.length||!Number.isInteger(batchSize)||batchSize<1||batchSize>10||!Number.isInteger(maxBatches)||maxBatches<1)throw Error('점검 위치 또는 범위를 확인하세요.');
 let batches=0;
 while(state.nextOffset<sources.length&&batches<maxBatches){
  const offset=state.nextOffset,result=await probe(sources,{offset,limit:batchSize});
  const expected=Math.min(batchSize,sources.length-offset);
  if(!Array.isArray(result.results)||result.results.length!==expected||result.results.some((r,i)=>r.source!==sources[offset+i].source)||result.nextOffset!==(offset+expected<sources.length?offset+expected:null))throw Error('점검 결과가 요청한 범위와 일치하지 않아 진행 위치를 보존했습니다.');
  state.results.push(...result.results);state.nextOffset=offset+expected;state.updatedAt=result.checkedAt;await checkpoint(state);batches++;
 }
 return {processed:state.nextOffset,total:sources.length,complete:state.nextOffset===sources.length,batches};
}
async function main(){
 const [catalogFile,stateFile,batchArg]=process.argv.slice(2);if(!catalogFile||!stateFile)throw Error('사용법: node municipal-refresh-cycle.cjs 자료.json 진행상태.json [한 번에 처리할 묶음 수]');
 const root=path.resolve(process.cwd(),'..'),dest=path.resolve(stateFile),relative=path.relative(root,dest);if(!relative||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('진행상태 파일은 작업 폴더 안에 있어야 합니다.');
 const bytes=await fs.readFile(catalogFile),data=JSON.parse(bytes.toString('utf8')),fingerprint=crypto.createHash('sha256').update(bytes).digest('hex');
 let state;try{state=JSON.parse(await fs.readFile(dest,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={fingerprint,nextOffset:0,results:[]};}
 if(state.fingerprint!==fingerprint||state.results?.length!==state.nextOffset)throw Error('자료 또는 기존 점검 기록이 변경되어 이어갈 수 없습니다. 새 진행상태 파일로 시작하세요.');
 await fs.mkdir(path.dirname(dest),{recursive:true});const result=await cycle(data.sources,state,{maxBatches:batchArg?Number(batchArg):1,checkpoint:s=>writeAtomic(dest,s)});console.log(JSON.stringify(result));
}
module.exports={cycle};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
