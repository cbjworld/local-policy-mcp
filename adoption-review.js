const labels={target:'지원 대상',activity:'지원 내용·방식',budget:'예산·재원',period:'사업 기간'};
function build(research,{institution,localBudgetCheck}={}){
 const cases=(research.quickBrief||[]).slice(0,4);
 const documents=cases.flatMap(c=>[c,...(c.linkedDocuments||[])]);
 const decisions=Object.entries(labels).map(([key,label])=>({key,label,localDecision:'결정 전',referenceStatus:documents.some(c=>c.fields[key]?.quote)?'참고할 원문 근거 있음':'참고 근거 미확인',sourceReferences:documents.filter(d=>d.fields[key]?.quote).slice(0,3).map(d=>({documentId:d.documentId,url:d.fields[key].url||d.url,sourceId:d.fields[key].sourceId,page:d.fields[key].page})),decisionQuestion:{target:'우리 지역의 대상·거주 요건·규모를 어떻게 정할까요?',activity:'지원 범위·지급 방식·신청 절차를 어떻게 정할까요?',budget:'필요 비용과 확보할 재원을 어떻게 정할까요?',period:'언제부터 얼마 동안 추진할까요?'}[key]}));
 return {status:research.status==='search_failed'||research.responseSize?.metadataOmitted?'research_incomplete':cases.length?'adoption_review_draft':'no_cases_in_searched_scope',question:research.request?.question,institution:institution||null,caseRowsDisplayed:cases.length,omittedCaseRows:Math.max(0,(research.quickBrief||[]).length-cases.length),cases,linkedPrograms:research.confirmedProgramLinks||[],decisionTable:decisions,localBudgetCheck:localBudgetCheck||{status:'institution_not_specified',note:'검토할 지자체를 지정하면 수록 예산에서 관련 사업명 후보를 함께 조회합니다.'},checksToComplete:[{item:'현행 시행 여부',status:'별도 확인',reason:'과거 계획·교부 문서만으로 현재 시행을 확정하지 않습니다.'},{item:'우리 지역의 추진 근거·승인 절차',status:'별도 확인',reason:'다른 지역의 계획을 우리 지역의 승인 근거로 사용하지 않습니다.'}],scenarioNextStep:{tool:'calculate_policy_budget',inputs:['지원 인원','1회 지원액(원)','연간 지급 횟수'],optional:['기타 비용(원)','가정한 지방비 비율(%)','모형 전체 비용 상한(원)'],rule:'사용자가 정한 가정만 사용하세요. 확인 없이 다른 지역 예산을 지원 단가로 바꾸거나 실제 보조율을 가정하지 마세요.'},coverage:research.coverage,searchFailures:research.searchFailures||[],answerGuide:'먼저 독립 사업별 사례 비교, 다음에 우리 지역의 결정 항목과 빠진 근거를 제시하세요. 연결된 광역·기초는 한 사례입니다. 원문 인용은 사실 후보, localDecision은 우리 지역의 미정 사항, 시나리오는 사용자 가정에 따른 계산입니다. 서로 대체하지 마세요. 자료 미발견을 사업 부재로 표현하지 마세요.'};
}
async function review({question,institution,queries,startDate,endDate}={},io={}){
 if(institution!==undefined&&(typeof institution!=='string'||!institution.trim()||institution.length>80))throw Error('검토 지자체는 1~80자여야 합니다.');
 const args={question,queries,startDate,endDate};
 const raw=await (io.research||require('./policy-workflow').research)(args);
 const research=require('./presentation').present('research_policy',raw);
 let localBudgetCheck;
 if(institution){
  const searches=[],rows=new Map();let scope=null;
  const plan=raw.request||require('./policy-workflow').plan(args);
  for(const q of plan.queries){
   try{
   const result=(io.searchBudget||require('./budget-search').search)({q,institution:institution.trim(),limit:5});
   scope={year:result.scope.year,account:result.scope.account,nationwideComplete:result.scope.nationwideComplete};
   searches.push({q,totalCandidateRows:result.totalCandidateRows,nextOffset:result.nextOffset});
   for(const row of result.items)rows.set(JSON.stringify([row.institutionId,row.source,row.page,row.table,row.tableRow,row.name]),row);
   }catch(e){searches.push({q,status:'failed',message:e.message});}
  }
  localBudgetCheck={status:rows.size?'budget_name_candidates_found':searches.some(s=>s.status==='failed')?'lookup_incomplete':'no_match_in_index',institution:institution.trim(),scope,searches,items:[...rows.values()].slice(0,5),note:'수록 예산의 사업명 후보입니다. 같은 사업인지 대조해야 하며 검색 결과가 없다고 우리 지역에 해당 사업이 없다는 뜻은 아닙니다. 편성액은 천원, 시나리오 계산 입력은 원입니다.'};
 }
 return build(research,{institution:institution?.trim(),localBudgetCheck});
}
module.exports={review,build};
