const reviewGuidance='예산 합계와 재원별 금액을 같은 단위로 재계산하세요. 불일치는 원문 표를 다시 읽고, 확인 전 숫자를 수정하거나 확정값으로 제시하지 마세요. 서로 다른 금액은 회계연도·작성일·본예산/추경·분담금/총사업비를 대조한 뒤 비교하세요. 과거 문서는 문서 작성 당시 상태로 표현하고 현재 시행은 별도 확인하세요.';
const names={target:'대상',activity:'사업 내용',budget:'예산 근거',period:'기간'};
function institutionGroups(value){
 const groups=new Map(),seen=new Set(),states=new Map((value.investigations||[]).map(x=>[x.candidate.url,x.result.status]));
 for(const d of value.candidates||[]){
  if(seen.has(d.url))continue;
  seen.add(d.url);
  const institution=d.institution?.trim()||null;
  if(!groups.has(institution))groups.set(institution,{institution,documents:[]});
  groups.get(institution).documents.push({title:d.title,url:d.url,readingStatus:states.get(d.url)||'not_attempted'});
 }
 return [...groups.values()].map(g=>({...g,documentCount:g.documents.length,textReadDocuments:g.documents.filter(d=>d.readingStatus==='read').length,notAttemptedDocuments:g.documents.filter(d=>d.readingStatus==='not_attempted').length}));
}
function researchSummary(value){
 const projects=value.projects||[],investigations=[...new Map((value.investigations||[]).map(x=>[x.candidate.url,x])).values()];
 return {candidateDocuments:new Set((value.candidates||[]).map(d=>d.url)).size,listedNonpublicDocuments:(value.candidates||[]).filter(d=>d.readingDecision?.status==='listed_nonpublic').length,...require('./program-links').caseCounts(projects,value.confirmedProgramLinks),attemptedDocuments:investigations.length,textReadDocuments:investigations.filter(x=>x.result.status==='read').length,unreadableDocuments:investigations.filter(x=>x.result.status!=='read').length,projectsWithUnknownFields:require('./program-links').caseCounts(projects.filter(p=>Object.values(p.fields||{}).some(f=>f.status==='unconfirmed')),value.confirmedProgramLinks).projectGroups,projectsWithRedactedFields:require('./program-links').caseCounts(projects.filter(p=>Object.values(p.fields||{}).some(f=>f.status==='redacted')),value.confirmedProgramLinks).projectGroups,searchOutcome:value.searchOutcome||null,note:'사업 묶음은 제목 기준 후보이며 확정된 사업 수가 아닙니다. 읽은 문서 수는 텍스트 추출 성공 수로, 본문 전체 이해·관련성 확인·정확도를 뜻하지 않습니다. 가림 처리와 미확인은 별개입니다.'};
}
function documentView(result){
 const fundingTables=(result.evidence?.fields?.budget?.tables||[]).slice(0,2);
 const allAmounts=result.evidence?.fields?.budget?.amounts||[];
 const financialAmounts=allAmounts.filter(x=>x.attribution!=='reference_context');
 const financialReferenceAmounts=allAmounts.filter(x=>x.attribution==='reference_context');
 const deliveryQualifications=(result.evidence?.deliveryQualifications||[]).slice(0,2).map(x=>({label:'사업 수행기관 자격',quote:x.quote,sourceId:x.sourceId,page:x.page,url:x.url}));
 const m=result.metadata||{},e=result.evidence||{},originals=[{label:'공식 문서 · 첨부파일 확인',url:m.url}];
 for(const a of result.attempts||[])if(a.source?.url&&!originals.some(x=>x.url===a.source.url))originals.push({label:a.fileName||'읽은 원문',url:a.source.url,format:a.source.format});
 const fields=Object.entries(names).map(([key,label])=>{const f=e.fields?.[key];return {key,label,state:f?.status==='redacted'?'가림 처리':f?.excerpts?.length?'원문 근거 후보 · 문맥 확인 필요':'미확인',...(key==='target'&&deliveryQualifications.length?{deliveryQualifications}:{}),...(key==='budget'?{fundingTables,financialAmounts,financialReferenceAmounts}:{}),evidence:(f?.excerpts||[]).slice(0,2).map(x=>({quote:x.quote,sourceId:x.sourceId,page:x.page,location:x.page==null?'문서 내 인용문 · 쪽 번호 없음':x.page+'쪽',url:x.url}))};});
 return {attachmentAvailability:m.attachmentAvailability,targetFit:result.targetFit,selectionNotes:result.selectionNotes,reviewGuidance,readingCoverage:(result.attempts||[]).filter(a=>a.source).map(a=>({fileName:a.fileName,format:a.source.format,returnedPages:a.source.pages.map(p=>p.page),totalPages:a.source.totalPages??null,scanComplete:a.source.scanComplete??null,textTruncated:a.source.pages.some(p=>p.truncated),status:a.status})),title:m.title||'문서',producingInstitution:m.institution||'미확인',fields,originals:originals.filter(x=>x.url),remainingAttachments:(result.remaining||[]).map(x=>({name:x.name,fileId:x.fileId})),note:'핵심 근거를 먼저 보여주고 각 항목의 정확한 인용문과 원문 링크를 함께 제시하세요. 가린 금액은 추정하지 마세요. 원문 링크는 양식 미리보기나 직접 다운로드를 보장하지 않습니다. PDF 쪽은 파일 기준이며 HWP 쪽 번호는 제공하지 않습니다.'};
}
function present(name,value,detail='compact'){
 if(name==='research_policy'){
  const programLinks=require('./program-links'),bodyLinks=programLinks.links(value.investigations);
  value={...value,confirmedProgramLinks:[...bodyLinks,...programLinks.catalogLinks(value.catalogEvidence,value.candidates,value.investigations,bodyLinks)]};
  const institutions=institutionGroups(value);
  value={...value,institutions,summary:{...researchSummary(value),producingInstitutions:institutions.filter(g=>g.institution).length,unknownInstitutionDocuments:institutions.find(g=>!g.institution)?.documentCount||0,institutionNote:'기관별 문서 묶음이며 사업 수나 시행 지자체 수가 아닙니다. 동일 기관의 서로 다른 사업을 합치지 마세요.'}};
 }
 if(name==='research_open_document')return {...value,budgetEvidenceLinks:require('./budget-evidence-links').links([{candidate:value.metadata||{},result:value}],args=>require('./budget-search').search(args)),presentation:documentView(value)};
 if(name==='research_policy'){const output={...value,presentation:{projects:(value.projects||[]).map(p=>({institution:p.institution,name:p.name,year:p.titleYear,existence:p.existence,reviewFlags:p.reviewFlags,missingFields:p.missingFields,documents:p.documents.map(d=>({title:d.title,url:d.url,role:d.role,readingStatus:(value.investigations||[]).find(x=>x.candidate.url===d.url)?.result.status||'not_attempted'}))})),documents:(value.investigations||[]).map(x=>documentView({...x.result,metadata:{...x.candidate,...x.result.metadata}})),note:'제목만으로 존재가 추정되는 사업도 포함하되 제목 근거와 본문 근거를 구분하세요. 미확인 세부정보는 추정하지 마세요. 문서별 근거를 짧게 비교하되 사업 귀속·연도·단위를 확인한 뒤 요약하세요. 본문 확보만으로 검증된 사례라고 표시하지 마세요. 원문을 확인할 수 있도록 링크와 인용 위치를 유지하세요.'}};
 for(const link of output.confirmedProgramLinks){
  const primary=output.presentation.projects.find(p=>p.documents.some(d=>d.url===link.primaryUrl));
  if(!primary)continue;
  const members=output.presentation.projects.filter(p=>p!==primary&&p.documents.some(d=>link.documents.some(m=>m.url===d.url)));
  primary.linkedProjects=members;primary.countAsOneCase=true;primary.programName=link.name;
  primary.participatingInstitutions=[...new Set(link.documents.map(d=>d.institution))];
  primary.documents=[...new Map([primary,...members].flatMap(p=>p.documents).map(d=>[d.url,d])).values()];
  output.presentation.projects=output.presentation.projects.filter(p=>!members.includes(p));
 }
 if(detail==='full')return output;
 return require('./compact-research')(output);
 }
 return value;
}
module.exports={documentView,present};
