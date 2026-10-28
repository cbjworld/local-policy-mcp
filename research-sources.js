const {randomUUID}=require('node:crypto');
const {documentKey}=require('./project-bundles');
function createStore(){
 const snapshots=new Map();
 function save(value){
  const read=new Map((value.investigations||[]).map(x=>[documentKey(x.candidate.url),x.result.status]));
  const unique=new Map();
  for(const d of [...(value.candidates||[]),...(value.reviewItems||[]),...(value.relatedDocuments||[]),...(value.financialDocuments||[])]){
   if(!d.url)continue;const key=documentKey(d.url);if(unique.has(key))continue;
   unique.set(key,{institution:d.institution||null,title:d.title||'',url:d.url,disclosure:d.disclosure||null,classification:d.relevance?.kind||'unclassified',role:d.documentRole||'other',readingStatus:read.get(key)||'not_attempted'});
  }
  const researchId=randomUUID(),items=[...unique.values()];snapshots.set(researchId,{items,createdAt:Date.now(),question:value.request?.question||null});
  while(snapshots.size>2)snapshots.delete(snapshots.keys().next().value);
  return {researchId,total:items.length,tool:'list_research_sources',arguments:{researchId,offset:0,limit:30},note:'같은 연결에서 목록을 나눠 조회합니다. 목록은 사업 확정이 아닌 문서 후보입니다.'};
 }
 function list({researchId,offset=0,limit=30}={}){
  if(typeof researchId!=='string'||!/^[0-9a-f-]{36}$/.test(researchId)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>30)throw Error('검색 ID와 목록 위치·개수(1~30)를 확인하세요.');
  const saved=snapshots.get(researchId);if(!saved||Date.now()-saved.createdAt>10*60*1000){snapshots.delete(researchId);throw Error('검색 목록이 만료됐습니다. 같은 연결에서 다시 검색하세요.');}
  return {researchId,question:saved.question,total:saved.items.length,offset,items:saved.items.slice(offset,offset+limit),nextOffset:offset+limit<saved.items.length?offset+limit:null,note:'제목 후보와 보조자료를 구분하세요. 문서 수는 사업 수가 아닙니다.'};
 }
 return {save,list};
}
module.exports={createStore};
