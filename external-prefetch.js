const {download}=require('./official-fetch');
const {readResponse,researchNotice}=require('./discovery');

// Overlap public file transfers; parsing and OCR remain sequential and session-scoped.
function createSession(portal,{get=download,extract=readResponse,warm=require('./hangul-reader').warm}={}){
 const controller=new AbortController(),prepared=new Map(),notices=new Map(),reserved=new Set();let fileSlots=2,fileDownloads=0;
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
   if(closed)break;
   if(prepared.has(item.url)){prepareFile(item.url);continue;}
   if(prepared.size>=3)continue;
   let downloading=false,lastRequest,failedRequest;
   const reader=portal.createReader({extract:(response,args)=>downloading?Promise.resolve({format:'deferred',pages:[]}):extract(response,args),post:async(step,params,deadline)=>{
    const body=new URLSearchParams(Object.entries(params).filter(([,v])=>v!==undefined&&v!==null)).toString();
    if(step==='wonmunFileRequest.ajax'&&failedRequest?.body===body)return failedRequest.response;
    const response=await get('https://www.open.go.kr/util/wonmunUtils/'+step,0,deadline,body,controller.signal);
    if(step==='wonmunFileRequest.ajax')lastRequest={body,response};
    return response;
   },get:async url=>{
    const response=await fetch(url);
    if(response.bytes.length>1024*1024)throw Object.assign(Error('Prefetch metadata limit'),{code:'PREFETCH_METADATA_LIMIT'});
    return response;
   }});
   const promise=reader({url:item.url}).then(async metadata=>{
    if(!closed&&(metadata.attachments||[]).some(f=>f.available&&/\.hwpx?$/i.test(f.name)&&!portal.isForm(f.name)&&(!/지\s*침|가이드라인|매뉴얼/.test(f.name)||/지\s*침|가이드라인|매뉴얼/.test(metadata.title))))warm();
    for(const link of (metadata.externalLinks||[]).slice(0,1))prepareNotice(link);
    const file=(metadata.attachments||[]).filter(f=>f.available&&f.bytes>0&&f.bytes<=5*1024*1024&&/\.(?:pdf|hwpx?)$/i.test(f.name)&&!portal.isForm(f.name)).sort((a,b)=>portal.attachmentScore(b,metadata.title)-portal.attachmentScore(a,metadata.title))[0];
    return {reader,prefetchFile:async()=>{if(!closed&&file){downloading=true;try{
     const result=await reader({url:item.url,fileId:file.fileId});
     // Reuse only definitive provider failures within this investigation; transient failures retry normally.
     if(result.phase==='wonmunFileRequest.ajax'&&['PROVIDER_MAINTENANCE','PROVIDER_FILE_MISMATCH'].includes(result.errorCode))failedRequest=lastRequest;
    }catch{}finally{downloading=false;}}}};
   },error=>({error}));
   prepared.set(item.url,promise);
   prepareFile(item.url);
  }
 }
 function prepareFile(url){
  // Reuse two resident-file slots as documents finish; at most six speculative files per request.
  if(fileSlots<=0||fileDownloads>=6||reserved.has(url))return;
  fileSlots--;fileDownloads++;reserved.add(url);
  prepared.set(url,prepared.get(url).then(async result=>{await result.prefetchFile?.();return result;}));
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
  }finally{prepared.delete(args.url);if(reserved.delete(args.url))fileSlots++;}
 }
 return {preload,research,close(){closed=true;controller.abort();prepared.clear();notices.clear();reserved.clear();}};
}
module.exports={createSession};
