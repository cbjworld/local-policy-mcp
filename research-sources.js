const {randomUUID,randomBytes}=require('node:crypto');
const {documentKey}=require('./project-bundles');
function createStore({archive=null,background=null}={}){
 const snapshots=new Map();
 async function save(value){
  const read=new Map((value.investigations||[]).map(x=>[documentKey(x.candidate.url),x.result.status])),unique=new Map();
  for(const d of [...(value.candidates||[]),...(value.reviewItems||[]),...(value.relatedDocuments||[]),...(value.financialDocuments||[])]){
   if(!d.url)continue;const key=documentKey(d.url);if(unique.has(key))continue;
   unique.set(key,{institution:d.institution||null,title:d.title||'',url:d.url,disclosure:d.disclosure||null,classification:d.relevance?.kind||'unclassified',role:d.documentRole||'other',readingStatus:read.get(key)||'not_attempted'});
  }
  const researchId=archive?randomBytes(32).toString('hex'):randomUUID(),items=[...unique.values()],snapshot={items,createdAt:Date.now(),question:value.request?.question||null};
  const cursors=(value.coverage?.nextSearches||[]).map(x=>x.arguments);
  const backgroundPending=cursors.length&&background&&researchId.length===64?(async()=>{
   try{const result=await background.start(researchId,cursors,{deferForRateLimit:value.coverage?.portalRateLimited===true});return {status:result?.status==='waiting_admission'?'waiting_admission':'running',tool:'list_background_sources',arguments:{researchId}};}
   catch(e){
    try{const state=await background.status(researchId);return {status:state.status,tool:'list_background_sources',arguments:{researchId}};}
    catch{return {status:'not_started',reason:e.message};}
   }
  })():Promise.resolve(undefined);
  let storage=archive?'archived':'temporary',warning;
  if(archive)try{await archive.put(researchId,snapshot)}catch{storage='temporary';warning='출처 저장 실패: 이 목록은 임시 보관되며 서버 재시작 시 사라질 수 있습니다.';}
  snapshots.set(researchId,{...snapshot,storage});while(snapshots.size>128)snapshots.delete(snapshots.keys().next().value);
  const backgroundSearch=await backgroundPending;
  return {researchId,total:items.length,storage,warning,backgroundSearch,tool:'list_research_sources',arguments:{researchId,offset:0,limit:30},note:storage==='archived'?'암호화해 보관했습니다. 검색 ID를 가진 사람은 목록을 볼 수 있으므로 안전하게 보관하세요.':'임시 보관입니다. 서버 재시작이나 보관 한도에 따라 목록이 사라질 수 있습니다.'};
 }
 async function list({researchId,offset=0,limit=30}={}){
  if(typeof researchId!=='string'||!(/^[a-f0-9]{64}$/.test(researchId)||/^[0-9a-f-]{36}$/.test(researchId))||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>30)throw Error('검색 ID와 목록 위치·개수(1~30)를 확인하세요.');
  let saved=snapshots.get(researchId);
  if(saved?.storage==='temporary'&&Date.now()-saved.createdAt>24*60*60*1000){snapshots.delete(researchId);saved=null;}
  if(!saved&&archive&&researchId.length===64)saved=await archive.get(researchId);
  if(!saved)throw Error('임시 검색 목록이 만료됐거나 서버가 재시작됐습니다. 다시 검색하세요.');
  return {researchId,question:saved.question,total:saved.items.length,offset,items:saved.items.slice(offset,offset+limit),nextOffset:offset+limit<saved.items.length?offset+limit:null,note:'제목 후보와 보조자료를 구분하세요. 문서 수는 사업 수가 아닙니다.'};
 }
 async function backgroundList({researchId,cursor}={}){
  if(!background)throw Error('백그라운드 검색이 연결되지 않았습니다.');
  if(typeof researchId!=='string'||!/^[a-f0-9]{64}$/.test(researchId)||cursor!==undefined&&!/^page:\d{8}$/.test(cursor))throw Error('검색 ID와 목록 위치를 확인하세요.');
  const [status,result]=await Promise.all([background.status(researchId),background.pages(researchId,cursor)]);
  const keys=['activeJobs','waitingJobs','eligibleWaitingJobs','pagesToday','attemptsToday'],s=status.gateSummary;
  const gateSummary=s&&keys.every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)?Object.fromEntries(keys.map(k=>[k,s[k]])):undefined;
  return {researchId,status:status.status,pagesRead:status.pages,remainingSearches:status.cursors,waitingUntil:status.waitingUntil||null,lastError:status.lastError||null,...(gateSummary?{gateSummary}:status.gateSummaryStatus==='unavailable'?{gateSummaryStatus:'unavailable'}:{}),pages:result.pages,nextCursor:result.nextCursor,note:'문서 제목 검색 결과입니다. 검색 표현·페이지의 중복을 제거하고 원문 확인 여부를 구분하세요.'};
 }
 return {save,list,backgroundList};
}
module.exports={createStore,sharedStore:createStore({archive:require('./source-archive').configured(),background:require('./background-search-client').configured()})};
