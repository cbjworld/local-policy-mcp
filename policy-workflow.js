const portal=require('./open-portal');
const {documentKey}=require('./project-bundles');
const {missingFields,sameProject}=require('./policy-followup');
function plan({question,queries,startDate,endDate}={},now=new Date()){
 if(typeof question!=='string'||!question.trim()||question.length>300)throw Error('질문은 1~300자여야 합니다.');
 const topic=question.trim().replace(/^우리\s*(?:지자체|지역|시|군|구)(?:도|에서|에)?\s*/, '').replace(/^(?:다른\s*(?:지자체|지역|지방자치단체)|전국(?:의)?\s*(?:지자체|지방자치단체))(?:에서|의)?\s+/, '').replace(/[?？!.。]+$/,'').replace(/\s*(?:을|를)?\s*(?:새로\s*)?(?:도입\s*검토해\s*줘|도입하고\s*싶어|도입하려는데|추진하려는데|시작하려는데|하려는데)\s*$/,'').replace(/\s*(?:찾아\s*주세요|찾아\s*줘|알려\s*주세요|알려\s*줘|검색해\s*줘|검색해줘|비교해\s*줘|비교해\s*주세요)\s*$/,'').replace(/\s+(?:계획과\s*예산|예산과\s*계획|예산|계획)(?:을|를)?\s*$/,'').replace(/\s*(?:정책|사례)(?:를|을)?\s*$/,'').trim().replace(/\s지원사업$/,' 지원 사업');
 if(!topic)throw Error('찾을 주제가 필요합니다.');
 const region=require('./catalog-context').regionScope(topic);
 const searchTopic=topic.split(/\s+/).slice(region.regionTokens.length).join(' ')||topic;
 const words=searchTopic.split(/\s+/);
 // shortcut: mechanical fallback only; the host AI supplies semantic query variants without asking the user.
 const derived=[searchTopic];if(words.length>2)derived.push(words.filter(w=>!['지원','사업','정책'].includes(w)).join(' '));
 if(/음식물\s*처리기/.test(searchTopic)){
  const subject=words.filter(w=>!['지원','사업','정책'].includes(w)).join(' ');
  derived.splice(1,derived.length,subject.replace(/음식물\s*처리기/,'음식물쓰레기 처리기'),subject.replace(/음식물\s*처리기/,'음식물 감량기'));
 }
 const terms=queries===undefined?[...new Set(derived)]:queries;
 if(!Array.isArray(terms)||terms.length<1||terms.length>3||terms.some(q=>typeof q!=='string'||!q.trim()||q.length>150))throw Error('검색 표현은 1~3개의 150자 이하 문자열이어야 합니다.');
 if((startDate===undefined)!==(endDate===undefined))throw Error('기간을 지정하려면 시작일과 종료일을 함께 입력하세요.');
 if(startDate!==undefined){
  const valid=d=>typeof d==='string'&&/^\d{8}$/.test(d)&&!isNaN(new Date(d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6)))&&new Date(d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6)).toISOString().slice(0,10).replaceAll('-','')===d;
  if(!valid(startDate)||!valid(endDate)||startDate>endDate)throw Error('검색 기간이 올바르지 않습니다.');
 }
 const date=now.toISOString().slice(0,10).replaceAll('-','');
 const from=new Date(now);from.setUTCFullYear(from.getUTCFullYear()-2);
 return {question,topic,queries:[...new Set(terms.map(x=>x.trim()))],startDate:startDate||from.toISOString().slice(0,10).replaceAll('-',''),endDate:endDate||date,periodDefaulted:startDate===undefined,broad:['청년','노인','아동','복지','문화','환경','교육','반려동물','교통','주거'].includes(topic)};
}
async function runResearch(args={},io=portal){
 const started=Date.now(),timings={},request=plan(args),searches=[],failures=[],byUrl=new Map();
 const catalogEvidence=require('./catalog-context').lookup(request,io.searchCatalog);
 timings.catalogMs=Date.now()-started;
 const budgetSearches=[],budgetRows=new Map();
 let budgetScope=null;
 for(const q of request.queries){
  try{const b=require('./budget-search').search({q,...(catalogEvidence.institution?{institution:catalogEvidence.institution}:{}),limit:5});
   budgetScope={year:b.scope.year,account:b.scope.account,collectedDate:b.scope.collectedDate,nationwideComplete:b.scope.nationwideComplete,excluded:b.scope.excluded};
   budgetSearches.push({q,year:b.scope.year,account:'일반회계',unit:'천원',totalCandidateRows:b.totalCandidateRows,nextOffset:b.nextOffset});
   for(const row of b.items){const key=JSON.stringify([row.institutionId,row.source,row.page,row.table,row.tableRow,row.name]);if(!budgetRows.has(key))budgetRows.set(key,row);}
  }catch(e){budgetSearches.push({q,status:'failed',message:e.message});}
 }
 const budgetCandidates=[...budgetRows.values()].slice(0,5);
 const screen=()=>{
  const regionalTerms=catalogEvidence.institution?.split(/\s+/).map(t=>require('./catalog-evidence').institutionKey(t))||[];
  const scoped=[...byUrl.values()].filter(d=>regionalTerms.every(t=>require('./catalog-evidence').institutionKey(d.institution).includes(t)));
  const batches=request.queries.map(q=>require('./relevance').screen({q,items:scoped}));
  const best=new Map();
  const rank={project_candidate:3,legal:2,ceremony:2,administration:2,unclassified:1};
  for(const b of batches)for(const d of [...b.items,...b.reviewItems,...b.relatedDocuments])if(!best.has(d.url)||rank[d.relevance.kind]>rank[best.get(d.url).relevance.kind])best.set(d.url,d);
  const docs=[...best.values()].map(d=>{const targetFit=require('./relevance').targetFit(d.title,request.question);return {...d,targetFit,...(targetFit.status==='mismatch'?{relevance:{kind:'administration',score:-10,reason:targetFit.reason}}:{})};});
  return {items:docs.filter(d=>d.relevance.kind==='project_candidate'),reviewItems:docs.filter(d=>d.relevance.kind==='unclassified'),relatedDocuments:docs.filter(d=>['legal','ceremony','administration'].includes(d.relevance.kind))};
 };
 timings.budgetMs=Date.now()-started;const searchStart=Date.now();
 // Query expressions are independent; retain page order and merge results in request order.
 const batches=await Promise.all(request.queries.map(async q=>{
  const pages=[],errors=[];
  for(let page=1;page<=4;page++){
   try{const r=await io.search({q,startDate:request.startDate,endDate:request.endDate,page});pages.push({q,page,r});if(!r.hasMore)break;}
   catch(e){errors.push({q,page,scope:'original',message:e.message});break;}
  }
  return {pages,errors};
 }));
 for(const batch of batches){
  failures.push(...batch.errors);
  for(const {q,page,r} of batch.pages){
   searches.push({q,page,scope:'original',total:r.total,url:r.url,hasMore:r.hasMore});
   for(const item of [...r.items,...r.reviewItems,...r.relatedDocuments])if(!byUrl.has(documentKey(item.url)))byUrl.set(documentKey(item.url),item);
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
 const liveSearchDocuments=byUrl.size;
 for(const doc of catalogEvidence.seedDocuments){const key=documentKey(doc.url);if(!byUrl.has(key))byUrl.set(key,doc);}
 if(catalogEvidence.seedDocuments.length)screened=screen();
 timings.searchMs=Date.now()-searchStart;const readStart=Date.now();
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
 for(const d of allDocuments)if(d.discovery!=='saved_catalog'&&d.institution&&!/^서울/.test(d.institution)&&['비공개','열람제한'].includes(d.disclosure))d.readingDecision={status:'listed_nonpublic',reason:'목록상 비공개·열람제한: 자동 첨부 조회는 생략하고 제목과 출처를 보존합니다.'};
 const anchorSets=request.queries.map(q=>q.split(/\s+/).filter(w=>!['지원','사업','정책','사례'].includes(w)));
 const stageDocuments=allDocuments.filter(d=>d.targetFit?.status!=='mismatch'&&anchorSets.some(anchors=>anchors.length&&anchors.every(w=>String((d.title||'')+(d.institution||'')).replace(/\s+/g,'').toLowerCase().includes(w.toLowerCase())))&&(d.relevance.kind==='project_candidate'||['allocation_or_deposit','execution_or_settlement','budget'].includes(d.documentRole)));
 const investigations=[];
 // Broad topics present real candidate titles first; choosing a single sub-topic would invent user intent.
 if(!request.broad){
  const institutions=new Set();
  const savedKeys=new Set(catalogEvidence.seedDocuments.map(d=>documentKey(d.url)));
  const ordered=candidates.filter(d=>!d.readingDecision).sort((a,b)=>Number(savedKeys.has(documentKey(b.url)))-Number(savedKeys.has(documentKey(a.url)))||Number(b.targetFit?.status==='match')-Number(a.targetFit?.status==='match')||b.relevance.score-a.relevance.score||Number(b.disclosure==='공개')-Number(a.disclosure==='공개'));
  io.preload?.(ordered.slice(0,6));
  const tried=new Set();
  for(let index=0;index<ordered.length;index++){
   if(investigations.length>=6||institutions.size>=2)break;
   // Give another institution a turn after two reads; keep every deferred candidate available.
   const attempts=d=>investigations.filter(x=>d.institution&&x.candidate.institution===d.institution).length;
   if(attempts(ordered[index])>=2){
    const nextIndex=ordered.findIndex((d,i)=>i>index&&!institutions.has(d.institution)&&!tried.has(documentKey(d.url))&&attempts(d)<2);
    if(nextIndex>index){const [next]=ordered.splice(nextIndex,1);ordered.splice(index,0,next);}
   }
   const item=ordered[index];
   if(institutions.has(item.institution)||tried.has(documentKey(item.url)))continue;
   tried.add(documentKey(item.url));
   io.preload?.(ordered.slice(index,index+3).filter(d=>!tried.has(documentKey(d.url))||d===item));
   try{const result=await io.research({url:item.url,requestedQuery:request.question});investigations.push({candidate:item,result});if(!missingFields(result).length)institutions.add(item.institution);}
   catch(e){investigations.push({candidate:item,result:{status:'failed',message:e.message}});}
   const missing=missingFields(investigations.at(-1).result);
   if(missing.length){
    const nextIndex=ordered.findIndex((d,i)=>i>index&&!tried.has(documentKey(d.url))&&sameProject(item,d));
    if(nextIndex>index){
     const [next]=ordered.splice(nextIndex,1);ordered.splice(index+1,0,next);
     next.followup={fromUrl:item.url,missingFields:missing,reason:'same_project_candidate_after_missing_evidence'};
    }
   }
  }
 }
 let projects=require('./project-bundles').bundle(candidates,investigations);
 // shortcut: one supplemental document per request; retain other gaps for host-directed follow-up.
 if(!request.broad){
  const project=projects.find(p=>p.missingFields.length&&p.nextDocuments.some(d=>!d.readingDecision)&&investigations.some(x=>p.documents.some(d=>documentKey(d.url)===documentKey(x.candidate.url))));
  const readable=investigations.filter(x=>x.result.status==='read');
  const finance=financialDocuments.find(d=>!d.readingDecision&&stageDocuments.some(s=>s.url===d.url)&&!investigations.some(x=>documentKey(x.candidate.url)===documentKey(d.url))&&investigations.some(x=>{
   const a=x.candidate,identity=require('./project-bundles').identity,year=identity(d).year,otherYear=identity(a).year;
   if(!d.institution||!a.institution||year&&otherYear&&year!==otherYear||d.department&&a.department&&d.department!==a.department)return false;
   return d.institution===a.institution||readable.includes(x)&&(a.institution.startsWith(d.institution+' ')||d.institution.startsWith(a.institution+' '));
  }));
  const item=project?.nextDocuments.find(d=>!d.readingDecision)||finance;
  if(item){const purpose=project?'fill_missing_evidence':'link_financial_evidence';try{investigations.push({candidate:item,purpose,...(project?{missingFields:project.missingFields}:{}),result:await io.research({url:item.url,requestedQuery:request.question})});}catch(e){investigations.push({candidate:item,purpose,result:{status:'failed',message:e.message}});}projects=require('./project-bundles').bundle(candidates,investigations);}
 }
 const evidenceMap=require('./project-bundles').evidenceMap(stageDocuments,investigations);
 const budgetEvidenceLinks=require('./budget-evidence-links').links(investigations,args=>require('./budget-search').search(args));
 const lastSearches=new Map();
 for(const search of searches)lastSearches.set(search.scope+'\n'+search.q,search);
 const nextSearches=[...lastSearches.values()].filter(s=>s.hasMore&&s.page<100&&!failures.some(f=>f.q===s.q&&f.scope===s.scope)).map(s=>({tool:'search_open_documents',arguments:{q:s.q,startDate:request.startDate,endDate:request.endDate,scope:s.scope,page:s.page+1},reason:'다음 페이지 미조회'}));
 for(const f of failures)nextSearches.push({tool:'search_open_documents',arguments:{q:f.q,startDate:request.startDate,endDate:request.endDate,scope:f.scope,page:f.page},reason:'실패한 페이지 재시도'});
 const coverage={queriedPages:searches.length,uniqueDocuments:byUrl.size,hasMore:nextSearches.length>0,pageLimitReached:[...lastSearches.values()].some(s=>s.hasMore&&s.page>=100),nextSearches,note:'전국 지자체를 검색 대상으로 하지만 일부 페이지의 결과입니다. 검색어별 총건수는 중복될 수 있어 합산하지 마세요. 후속 검색은 순서대로 실행하고 URL 중복을 제거하세요. 전국 전체 사업 수나 검색 완전성을 뜻하지 않습니다.'};
 coverage.liveSearchDocuments=liveSearchDocuments;
 coverage.savedSeedDocuments=byUrl.size-liveSearchDocuments;
 timings.readingMs=Date.now()-readStart;timings.totalMs=Date.now()-started;
 return {catalogEvidence:{...catalogEvidence,liveSearchDocuments},timings,budgetScope,budgetCandidates,budgetSearches,budgetEvidenceLinks,evidenceMap,financialDocuments,possibleProjectLinks,coverage,request,projects,status:searches.length?(request.broad?'topic_overview':'research_draft'):'search_failed',searches,failures,candidates,reviewItems:screened.reviewItems,relatedDocuments:screened.relatedDocuments,investigations,
 searchOutcome:{metadataFallback,status:candidates.length?'candidates_found':failures.length?'incomplete':'not_found_in_searched_scope',note:'후보가 없어도 사업 부존재를 뜻하지 않습니다. 검색 기간·조회 페이지·실패 내역을 함께 확인하세요.'},
 limits:{maxQueries:3,maxPagesPerQuery:4,maxMetadataFallbackPagesPerQuery:1,maxSearchRequests:15,maxDocuments:7,maxSupplementalDocuments:1,targetReadableInstitutions:2,readableCriterion:'core_field_quotes_required_not_text_only',examinedDocuments:byUrl.size,complete:false},
 instruction:request.broad?'후보 제목에 실제로 나타난 사업 종류를 출처와 함께 먼저 제시하세요. 임의로 한 사업을 선택하지 마세요. 필요할 때만 관심 사업을 물으세요.':'제목이 요청 사업의 존재를 뒷받침하면 비공개·읽기 실패여도 사업 존재 추정 사례로 포함하고 제목과 출처를 제시하세요. 존재 추정과 본문 근거 확인을 별도로 구분하세요. 계획안은 현재 시행이나 예산 확정을 뜻하지 않습니다. 요청과 실제 본문이 같은 사업인지 먼저 판단하세요. 적합한 문서의 대상·내용·예산·기간을 근거와 함께 정리하고 미확인 항목은 명시하세요. 실패하거나 다른 사업이면 반환된 다음 후보를 research_open_document로 조사하세요. 부족한 사례를 만들어 채우지 마세요. 단계별 성공과 최종 관련성은 다릅니다.'};
}
async function research(args={},io=portal){
 if(io!==portal)return runResearch(args,{searchCatalog:()=>({coverage:null,total:0,items:[],nextOffset:null}),...io});
 const session=require('./external-prefetch').createSession(portal);
 try{return await runResearch(args,{...portal,research:session.research,preload:session.preload});}
 finally{session.close();}
}
module.exports={plan,research};
