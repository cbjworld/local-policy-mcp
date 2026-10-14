const portal=require('./open-portal');
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
 for(const q of request.queries){
  for(let page=1;page<=2;page++){
   try{const r=await io.search({q,startDate:request.startDate,endDate:request.endDate,page});
    searches.push({q,page,scope:'original',total:r.total,url:r.url,hasMore:r.hasMore});
    for(const item of [...r.items,...r.reviewItems,...r.relatedDocuments])if(!byUrl.has(item.url))byUrl.set(item.url,item);
    if(!r.hasMore)break;
   }catch(e){failures.push({q,page,scope:'original',message:e.message});break;}
  }
 }
 let screened=require('./relevance').screen({q:request.topic,items:[...byUrl.values()]});
 // shortcut: one metadata page per expression only when the original search has no candidates.
 const metadataFallback=searches.length>0&&screened.items.length===0;
 if(metadataFallback){
  for(const q of request.queries){
   try{
    const r=await io.search({q,startDate:request.startDate,endDate:request.endDate,page:1,scope:'all'});
    searches.push({q,page:1,scope:'all',total:r.total,url:r.url,hasMore:r.hasMore});
    for(const item of [...r.items,...r.reviewItems,...r.relatedDocuments])if(!byUrl.has(item.url))byUrl.set(item.url,item);
   }catch(e){failures.push({q,page:1,scope:'all',message:e.message});}
  }
  screened=require('./relevance').screen({q:request.topic,items:[...byUrl.values()]});
 }
 const candidates=screened.items;
 const investigations=[];
 // Broad topics present real candidate titles first; choosing a single sub-topic would invent user intent.
 if(!request.broad){
  const institutions=new Set();
  const ordered=[...candidates].sort((a,b)=>b.relevance.score-a.relevance.score);
  for(const item of ordered){
   if(investigations.length>=3||institutions.size>=2)break;
   if(institutions.has(item.institution))continue;
   try{const result=await io.research({url:item.url,requestedQuery:request.question});investigations.push({candidate:item,result});if(result.status==='read'&&result.relevanceStatus!=='supporting_document')institutions.add(item.institution);}
   catch(e){investigations.push({candidate:item,result:{status:'failed',message:e.message}});}
  }
 }
 let projects=require('./project-bundles').bundle(candidates,investigations);
 // shortcut: one supplemental document per request; retain other gaps for host-directed follow-up.
 if(!request.broad){
  const project=projects.find(p=>p.missingFields.length&&p.nextDocuments.length&&investigations.some(x=>x.result.status==='read'&&p.documents.some(d=>d.url===x.candidate.url)));
  if(project){const item=project.nextDocuments[0];try{investigations.push({candidate:item,purpose:'fill_missing_evidence',missingFields:project.missingFields,result:await io.research({url:item.url,requestedQuery:request.question})});}catch(e){investigations.push({candidate:item,purpose:'fill_missing_evidence',result:{status:'failed',message:e.message}});}projects=require('./project-bundles').bundle(candidates,investigations);}
 }
 return {request,projects,status:searches.length?(request.broad?'topic_overview':'research_draft'):'search_failed',searches,failures,candidates,reviewItems:screened.reviewItems,relatedDocuments:screened.relatedDocuments,investigations,
 searchOutcome:{metadataFallback,status:candidates.length?'candidates_found':failures.length?'incomplete':'not_found_in_searched_scope',note:'후보가 없어도 사업 부존재를 뜻하지 않습니다. 검색 기간·조회 페이지·실패 내역을 함께 확인하세요.'},
 limits:{maxQueries:3,maxPagesPerQuery:2,maxMetadataFallbackPagesPerQuery:1,maxSearchRequests:9,maxDocuments:4,maxSupplementalDocuments:1,targetReadableInstitutions:2,examinedDocuments:byUrl.size,complete:false},
 instruction:request.broad?'후보 제목에 실제로 나타난 사업 종류를 출처와 함께 먼저 제시하세요. 임의로 한 사업을 선택하지 마세요. 필요할 때만 관심 사업을 물으세요.':'제목이 요청 사업의 존재를 뒷받침하면 비공개·읽기 실패여도 사업 존재 추정 사례로 포함하고 제목과 출처를 제시하세요. 존재 추정과 본문 근거 확인을 별도로 구분하세요. 계획안은 현재 시행이나 예산 확정을 뜻하지 않습니다. 요청과 실제 본문이 같은 사업인지 먼저 판단하세요. 적합한 문서의 대상·내용·예산·기간을 근거와 함께 정리하고 미확인 항목은 명시하세요. 실패하거나 다른 사업이면 반환된 다음 후보를 research_open_document로 조사하세요. 부족한 사례를 만들어 채우지 마세요. 단계별 성공과 최종 관련성은 다릅니다.'};
}
module.exports={plan,research};
