const {download}=require('./official-fetch');
const {readResponse,researchNotice}=require('./discovery');

// Overlap only network waits. Parsing and attachment downloads stay sequential.
function createSession(portal,{get=download,extract=readResponse}={}){
 const controller=new AbortController(),prepared=new Map(),notices=new Map();
 let closed=false;
 const fetch=url=>get(url,0,Date.now()+25000,undefined,controller.signal);
 function prepareNotice(url){
  if(closed||notices.has(url)||notices.size>=3)return;
  const start=Date.now();
  const promise=fetch(url).then(response=>({response}),error=>({error:Object.assign(error,{networkMs:Date.now()-start,phase:error.phase||'external_notice'})}));
  notices.set(url,promise);
 }
 function preload(items){
  for(const item of items.slice(0,3)){
   if(closed||prepared.has(item.url))continue;
   if(prepared.size>=3)break;
   const reader=portal.createReader({get:async url=>{
    const response=await fetch(url);
    if(response.bytes.length>1024*1024)throw Object.assign(Error('Prefetch metadata limit'),{code:'PREFETCH_METADATA_LIMIT'});
    return response;
   }});
   const promise=reader({url:item.url}).then(metadata=>{
    for(const link of (metadata.externalLinks||[]).slice(0,1))prepareNotice(link);
    return {reader};
   },error=>({error}));
   prepared.set(item.url,promise);
  }
 }
 async function externalReader(args){
  return researchNotice(args,async sourceArgs=>{
   const cached=notices.get(sourceArgs.url);
   if(cached){
    const result=await cached;
    if(result.error)throw result.error;
    return extract(result.response,sourceArgs);
   }
   return extract(await fetch(sourceArgs.url),sourceArgs);
  });
 }
 async function research(args,options){
  const entry=prepared.get(args.url);
  try{
   const result=entry?await entry:{};
   if(result.error&&result.error.code!=='PREFETCH_METADATA_LIMIT'&&!result.error.retryable)throw result.error;
   const investigation=await portal.research(args,result.reader||portal.createReader({get}),externalReader,options);
   if(result.error)investigation.metadataPrefetchFailure={code:result.error.code,message:result.error.message};
   return investigation;
  }finally{prepared.delete(args.url);}
 }
 return {preload,research,close(){closed=true;controller.abort();prepared.clear();notices.clear();}};
}
module.exports={createSession};
