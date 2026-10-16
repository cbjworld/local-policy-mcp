const portal=require('./open-portal');
const {documentKey}=require('./project-bundles');
function plan({question,queries,startDate,endDate}={},now=new Date()){
 if(typeof question!=='string'||!question.trim()||question.length>300)throw Error('질문은 1~300자여야 합니다.');
 const topic=question.trim().replace(/^(?:다른\s*(?:지자체|지역|지방자치단체)|전국(?:의)?\s*(?:지자체|지방자치단체))(?:에서|의)?\s+/, '').replace(/[?？!.。]+$/,'').replace(/\s*(?:찾아\s*주세요|찾아\s*줘|알려\s*주세요|알려\s*줘|검색해\s*줘|검색해줘)\s*$/,'').replace(/\s*(?:정책|사례)(?:를|을)?\s*$/,'').trim();
 if(!topic)throw Error('찾을 주제가 필요합니다.');
 const words=topic.split(/\s+/);
 // shortcut: mechanical fallback only; the host AI supplies semantic query variants without asking the user.
 const derived=[topic];if(words.length>2)derived.push(words.filter(w=>!['지원','사업','정책'].includes(w)).join(' '));
 const terms=queries===undefined?[...new Set(derived)]:queries;
 if(!Array.isArray(terms)||terms.length<1||terms.length>3||terms.some(q=>typeof q!=='string'||!q.trim()||q.length>150))throw Error('검색 표현은 1~3개의 150자 이하 문자열이어야 합니다.');
 if((startDate===undefined)!==(endDate===undefined))throw Error('기간을 지정하려면 시작일과 종료일을 함께 입력하세요.');
 if(startDate!==undefined){
  const valid=d=>typeof d==='string'&&/^\d{8}$/.test(d)&&!isNaN(new Date(d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6)))&&new Date(d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6)).toISOString().slice(0,10).replaceAll('-','')===d;
  if(!valid(startDate)||!valid(endDate)||startDate>endDate)throw Error('검색 기간이 올바르지 않습니다.');
 }
 const date=now.toISOString().slice(0,10).replaceAll('-','');
 const from=new Date(now);from.setUTCFullYear(from.getUTCFullYear()-2);
 return {question,topic,queries:[...new Set(terms.map(x=>x.trim()))],startDate:startDate||from.toISOString().slice(0,10).replaceAll('-',''),endDate:endDate||date,periodDefaulted:startDate===undefined,broad:words.length===1};
}
async function research(args={},io=portal){
 const request=plan(args),searches=[],failures=[],byUrl=new Map();
 const screen=()=>{
  const batches=request.queries.map(q=>require('./relevance').screen({q,items:[...byUrl.values()]}));
  const best=new Map();
  const rank={project_candidate:3,legal:2,ceremony:2,administration:2,unclassified:1};
  for(const b of batches)for(const d of [...b.items,...b.reviewItems,...b.relatedDocuments])if(!best.has(d.url)||rank[d.relevance.kind]>rank[best.get(d.url).relevance.kind])best.set(d.url,d);
  const docs=[...best.values()];
  return {items:docs.filter(d=>d.relevance.kind==='project_candidate'),reviewItems:docs.filter(d=>d.relevance.kind==='unclassified'),relatedDocuments:docs.filter(d=>['legal','ceremony','administration'].includes(d.relevance.kind))};
 };
 for(const q of request.queries){
  for(let page=1;page<=4;page++){
   try{const r=await io.search({q,startDate:request.startDate,endDate:request.endDate,page});
    searches.push({q,page,scope:'original',total:r.total,url:r.url,hasMore:r.hasMore});
    for(const item of [...r.items,...r.reviewItems,...r.relatedDocuments])if(!byUrl.has(documentKey(item.url)))byUrl.set(documentKey(item.url),item);
    if(!r.hasMore)break;
   }catch(e){failures.push({q,page,scope:'original',message:e.message});break;}
  }
 }
 let screened=screen();
 // shortcut: one metadata page per expression only when the original search has no candidates.
 const metadataFallback=searches.length>0&&screened.items.length===0;
 if(metadataFallback){
  for(const q of request.queries){
   try{
    const r=await io.search({q,startDate:request.startDate,endDate:request.endDate,page:1,scope:'all'});
    searches.push({q,page:1,scope:'all',total:r.total,url:r.url,hasMore:r.hasMore});
    for(const item of [...r.items,...r.reviewItems,...r.relatedDocuments])if(!byUrl.has(documentKey(item.url)))byUrl.set(documentKey(item.url),item);
   }catch(e){failures.push({q,page:1,scope:'all',message:e.message});}
  }
  screened=screen();
 }
 const allDocuments=[...screened.items,...screened.reviewItems,...screened.relatedDocuments];
 const financialDocuments=allDocuments.filter(d=>['allocation_or_deposit','execution_or_settlement','budget'].includes(d.documentRole));
 // shortcut: link only explicit regional business names with the same explicit year; never merge institutions.
 const named=new Map();
 for(const d of allDocuments){
  const match=d.title?.match(/((?:부산형|서울형|경기도|울산형|인천형)\s*[^「」()\[\]]*?지원사업)/);
  const years=[...new Set(d.title?.match(/20\d{2}/g)||[])];
  if(!match||years.length!==1)continue;
  const key=years[0]+':'+match[1].replace(/\s+/g,'');
  if(!named.has(key))named.set(key,[]);
  named.get(key).push({institution:d.institution,title:d.title,url:d.url});
 }
 const possibleProjectLinks=[...named].filter(([,docs])=>new Set(docs.map(d=>d.institution).filter(Boolean)).size>1).map(([name,documents])=>({name,status:'possible_same_program_not_merged',documents,note:'제목의 지역 사업명과 연도가 같은 문서입니다. 광역·기초 역할과 동일 사업 여부는 본문 확인이 필요합니다.'}));
 const candidates=screened.items;
 const anchorSets=request.queries.map(q=>q.split(/\s+/).filter(w=>!['지원','사업','정책','사례'].includes(w)));
 const stageDocuments=allDocuments.filter(d=>anchorSets.some(anchors=>anchors.length&&anchors.every(w=>String((d.title||'')+(d.institution||'')).replace(/\s+/g,'').toLowerCase().includes(w.toLowerCase())))&&(d.relevance.kind==='project_candidate'||['allocation_or_deposit','execution_or_settlement','budget'].includes(d.documentRole)));
 const investigations=[];
 // Broad topics present real candidate titles first; choosing a single sub-topic would invent user intent.
 if(!request.broad){
  const institutions=new Set();
  const ordered=[...candidates].sort((a,b)=>b.relevance.score-a.relevance.score);
  for(const item of ordered){
   if(investigations.length>=6||institutions.size>=2)break;
   if(institutions.has(item.institution))continue;
   try{const result=await io.research({url:item.url,requestedQuery:request.question});investigations.push({candidate:item,result});if(result.status==='read'&&result.relevanceStatus!=='supporting_document')institutions.add(item.institution);}
   catch(e){investigations.push({candidate:item,result:{status:'failed',message:e.message}});}
  }
 }
 let projects=require('./project-bundles').bundle(candidates,investigations);
 // shortcut: one supplemental document per request; retain other gaps for host-directed follow-up.
 if(!request.broad){
  const project=projects.find(p=>p.missingFields.length&&p.nextDocuments.length&&investigations.some(x=>x.result.status==='read'&&p.documents.some(d=>d.url===x.candidate.url)));
  const readable=investigations.filter(x=>x.result.status==='read');
  const finance=financialDocuments.find(d=>stageDocuments.some(s=>s.url===d.url)&&!investigations.some(x=>x.candidate.url===d.url)&&readable.some(x=>d.institution&&x.candidate.institution&&(d.institution===x.candidate.institution||x.candidate.institution.startsWith(d.institution+' ')||d.institution.startsWith(x.candidate.institution+' '))));
  const item=project?.nextDocuments[0]||finance;
  if(item){const purpose=project?'fill_missing_evidence':'link_financial_evidence';try{investigations.push({candidate:item,purpose,...(project?{missingFields:project.missingFields}:{}),result:await io.research({url:item.url,requestedQuery:request.question})});}catch(e){investigations.push({candidate:item,purpose,result:{status:'failed',message:e.message}});}projects=require('./project-bundles').bundle(candidates,investigations);}
 }
 const evidenceMap=require('./project-bundles').evidenceMap(stageDocuments,investigations);
 const budgetEvidenceLinks=require('./budget-evidence-links').links(investigations,args=>require('./budget-search').search(args));
 const budgetSearches=[],budgetRows=new Map();
 for(const q of request.queries){
  try{const b=require('./budget-search').search({q,limit:5});
   budgetSearches.push({q,year:2026,account:'일반회계',unit:'천원',totalCandidateRows:b.totalCandidateRows,nextOffset:b.nextOffset});
   for(const row of b.items){const key=JSON.stringify([row.institutionId,row.source,row.page,row.table,row.tableRow,row.name]);if(!budgetRows.has(key))budgetRows.set(key,row);}
  }catch(e){budgetSearches.push({q,status:'failed',message:e.message});}
 }
 const budgetCandidates=[...budgetRows.values()].slice(0,5);
 const lastSearches=new Map();
 for(const search of searches)lastSearches.set(search.scope+'\n'+search.q,search);
 const nextSearches=[...lastSearches.values()].filter(s=>s.hasMore&&s.page<100&&!failures.some(f=>f.q===s.q&&f.scope===s.scope)).map(s=>({tool:'search_open_documents',arguments:{q:s.q,startDate:request.startDate,endDate:request.endDate,scope:s.scope,page:s.page+1},reason:'다음 페이지 미조회'}));
 for(const f of failures)nextSearches.push({tool:'search_open_documents',arguments:{q:f.q,startDate:request.startDate,endDate:request.endDate,scope:f.scope,page:f.page},reason:'실패한 페이지 재시도'});
 const coverage={queriedPages:searches.length,uniqueDocuments:byUrl.size,hasMore:nextSearches.length>0,pageLimitReached:[...lastSearches.values()].some(s=>s.hasMore&&s.page>=100),nextSearches,note:'전국 지자체를 검색 대상으로 하지만 일부 페이지의 결과입니다. 검색어별 총건수는 중복될 수 있어 합산하지 마세요. 후속 검색은 순서대로 실행하고 URL 중복을 제거하세요. 전국 전체 사업 수나 검색 완전성을 뜻하지 않습니다.'};
 return {budgetCandidates,budgetSearches,budgetEvidenceLinks,evidenceMap,financialDocuments,possibleProjectLinks,coverage,request,projects,status:searches.length?(request.broad?'topic_overview':'research_draft'):'search_failed',searches,failures,candidates,reviewItems:screened.reviewItems,relatedDocuments:screened.relatedDocuments,investigations,
 searchOutcome:{metadataFallback,status:candidates.length?'candidates_found':failures.length?'incomplete':'not_found_in_searched_scope',note:'후보가 없어도 사업 부존재를 뜻하지 않습니다. 검색 기간·조회 페이지·실패 내역을 함께 확인하세요.'},
 limits:{maxQueries:3,maxPagesPerQuery:4,maxMetadataFallbackPagesPerQuery:1,maxSearchRequests:15,maxDocuments:7,maxSupplementalDocuments:1,targetReadableInstitutions:2,examinedDocuments:byUrl.size,complete:false},
 instruction:request.broad?'후보 제목에 실제로 나타난 사업 종류를 출처와 함께 먼저 제시하세요. 임의로 한 사업을 선택하지 마세요. 필요할 때만 관심 사업을 물으세요.':'제목이 요청 사업의 존재를 뒷받침하면 비공개·읽기 실패여도 사업 존재 추정 사례로 포함하고 제목과 출처를 제시하세요. 존재 추정과 본문 근거 확인을 별도로 구분하세요. 계획안은 현재 시행이나 예산 확정을 뜻하지 않습니다. 요청과 실제 본문이 같은 사업인지 먼저 판단하세요. 적합한 문서의 대상·내용·예산·기간을 근거와 함께 정리하고 미확인 항목은 명시하세요. 실패하거나 다른 사업이면 반환된 다음 후보를 research_open_document로 조사하세요. 부족한 사례를 만들어 채우지 마세요. 단계별 성공과 최종 관련성은 다릅니다.'};
}
module.exports={plan,research};
