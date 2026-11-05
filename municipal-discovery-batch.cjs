const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {discover}=require('./municipal-discovery.cjs');
const registry=require('./catalog-institutions.json').records.filter(r=>!r.institution.includes('(편성 당시)'));
const registryHash=crypto.createHash('sha256').update(JSON.stringify(registry)).digest('hex');
async function writeAtomic(file,value){const temp=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(value,null,2),{flag:'wx'});await fs.rename(temp,file);}catch(e){await fs.unlink(temp).catch(()=>{});throw e;}}
async function processEntries(entries,state,{probe,checkpoint,limit=entries.length}={}){
 if(!Array.isArray(entries)||!state||!Array.isArray(state.entries)||typeof probe!=='function'||typeof checkpoint!=='function'||!Number.isInteger(limit)||limit<1)throw Error('탐색 목록을 확인하세요.');
 const done=new Set(state.entries.map(e=>e.source));let count=0;
 for(const entry of entries){
  if(done.has(entry.url))continue;if(count>=limit)break;
  let result;try{result=await probe(entry.url);}catch(e){result={source:entry.url,status:'not_read',reason:'discovery_failed',candidates:[]};}
  state.entries.push({institution:entry.institution,parent:entry.parent,source:entry.url,checkedAt:new Date().toISOString(),status:result.status,reason:result.reason||null,returnedSource:result.source||null,candidates:result.candidates||[]});
  await checkpoint(state);done.add(entry.url);count++;
 }
 return {attempted:state.entries.length,remaining:entries.filter(e=>!done.has(e.url)).length,processed:count};
}
async function main(){
 const [dir,limitArg]=process.argv.slice(2),limit=limitArg?Number(limitArg):registry.length;if(!dir)throw Error('사용법: node municipal-discovery-batch.cjs 저장폴더 [개수]');
 const root=path.resolve(process.cwd(),'..'),dest=path.resolve(dir),relative=path.relative(root,dest);if(!relative||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('저장폴더는 작업 폴더 안에 있어야 합니다.');
 await fs.mkdir(dest,{recursive:true});const stateFile=path.join(dest,'state.json');let state;
 try{state=JSON.parse(await fs.readFile(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('기존 탐색 현황을 읽을 수 없습니다.');state={registryHash,entries:[]};}
 if(state.registryHash!==registryHash||!Array.isArray(state.entries))throw Error('지자체 명단이 변경되어 기존 탐색 현황을 검토해야 합니다.');
 const save=async bytes=>{const file=path.join(dest,crypto.randomUUID()+'.html');await fs.writeFile(file,bytes,{flag:'wx'});return file;};
 const result=await processEntries(registry,state,{probe:url=>discover(url,{save}),checkpoint:value=>writeAtomic(stateFile,value),limit});
 console.log(JSON.stringify(result));
}
module.exports={processEntries,writeAtomic};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
