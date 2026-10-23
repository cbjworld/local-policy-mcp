module.exports=function compactResearch(value){
 const reads=new Map((value.investigations||[]).map(x=>[x.candidate.url,{...x.result,followup:x.candidate.followup||(x.purpose?{purpose:x.purpose,missingFields:x.missingFields}:undefined)}]));
 const rows=new Map();
 for(const d of [...(value.candidates||[]),...(value.financialDocuments||[]),...(value.reviewItems||[]),...(value.relatedDocuments||[])])if(!rows.has(d.url))rows.set(d.url,d);
 const priority=d=>{const r=reads.get(d.url);return r?.status==='read'?(r.relevanceStatus==='supporting_document'||r.targetFit?.status==='mismatch'?2:3):r?1:0;};
 const documents=[...rows.values()].sort((a,b)=>priority(b)-priority(a)).map((d,i)=>{
  const r=reads.get(d.url);
  const reading=r&&require('./presentation').documentView({...r,metadata:{...d,...r.metadata}});
  if(reading){delete reading.reviewGuidance;delete reading.note;}
  return {id:'d'+(i+1),title:d.title,url:d.url,institution:d.institution,role:d.documentRole||'other',readingDecision:d.readingDecision,followup:d.followup||reads.get(d.url)?.followup,classification:d.relevance?.kind,targetFit:r?.targetFit||d.targetFit,readingStatus:r?.status||'not_attempted',supportingOnly:r?.relevanceStatus==='supporting_document',...(r?{reading,selectionNotes:r.selectionNotes?.slice(0,8),failures:(r.attempts||[]).filter(a=>a.status!=='read').map(a=>({fileName:a.fileName,status:a.status,message:a.message,phase:a.phase,errorCode:a.errorCode,retryCount:a.retryCount,networkMs:a.networkMs})),message:r.message}: {})};
 });
 const ids=new Map(documents.map(d=>[d.url,d.id]));
 const briefInputs=documents.map(d=>({...d}));
 const institutionMap=new Map();
 for(const d of value.candidates||[]){
  if(!d.institution)continue;
  if(!institutionMap.has(d.institution))institutionMap.set(d.institution,new Map());
  institutionMap.get(d.institution).set(d.url,reads.get(d.url)?.status==='read');
 }
 // Preserve every producer name even when document details are omitted for size.
 const institutionDirectory={columns:['institution','documentCount','textReadDocuments'],rows:[...institutionMap].map(([name,docs])=>[name,docs.size,[...docs.values()].filter(Boolean).length]),note:'검색된 사업 후보 문서의 생산기관 전체입니다. 시행 지자체 전체 수나 독립 사업 수가 아닙니다. 타 지역 사업의 홍보·이송 문서를 자체 사업으로 세지 마세요. 생략된 근거 상세는 detail=full로 확인하세요.'};
 const output={responseMode:'compact',request:value.request,status:value.status,summary:value.summary,coverage:value.coverage,timings:value.timings,limits:value.limits,searchFailures:value.failures||[],documents,possibleProjectLinks:(value.possibleProjectLinks||[]).map(x=>({name:x.name,status:x.status,documentIds:x.documents.map(d=>ids.get(d.url)).filter(Boolean)})),responseSize:{maxCharacters:24000,omittedDocuments:0,omittedReadingDetails:0,omittedLinks:0},detailHint:'생략 자료는 동일 인수의 detail=full 또는 문서 URL의 research_open_document로 재조회하세요. 재조회 결과는 달라질 수 있습니다.',reviewGuidance:'예산 합계와 재원별 금액을 같은 단위로 재계산하세요. 불일치는 원문 표를 다시 읽고, 확인 전 숫자를 수정하거나 확정값으로 제시하지 마세요.',note:'confirmedProgramLinks로 연결된 광역·기초 문서는 한 사업으로 비교하고 예산은 문서별로 유지하세요. 제목만 비슷한 후보는 합치지 마세요. 교부·예탁과 실제 집행을 구분하세요.'};
 output.comparison=[...(value.projects||[])].sort((a,b)=>Number(b.documents.some(d=>reads.get(d.url)?.status==='read'))-Number(a.documents.some(d=>reads.get(d.url)?.status==='read'))).map(p=>({institution:p.institution,name:p.name,year:p.titleYear,existence:p.existence?.status,fields:Object.fromEntries(Object.entries(p.fields||{}).map(([k,v])=>[k,v.status])),documentIds:p.documents.map(d=>ids.get(d.url)).filter(Boolean),reviewFlags:p.reviewFlags||[]}));
 output.answerGuide='financialSummary.rows의 label·display·observations를 우선 사용하세요. 계획서 사업비는 원문 표제 사업비·소요예산·총사업비를 묶은 비교 항목입니다. 산식 계산값과 표기 금액을 구분하고, 별도 표기 없음은 0원으로 바꾸지 마세요. evidenceFollowups의 다른 문서 값은 출처와 문서 역할을 유지한 채 보완하세요. 확인해야 한다는 문구를 반복하기보다 확보한 금액·쪽수·근거를 짧게 제시하세요. '+'quickBrief의 한 행을 한 사례로 비교하세요. countAsOneCase가 있는 사업은 linkedDocuments의 광역·기초 문서를 독립 사례로 다시 세지 말고 참여기관·역할·문서별 예산을 같은 행 안에 표시하세요. 광역 전체액·기초 사업비·교부액을 합산하지 마세요. 연결 후보만 있는 자료는 원문 확인 전 합치지 마세요. quote는 추출 인용문이며 편성액·지원액·교부액을 구분하고, 원문 검토 없이 확정 금액으로 바꾸지 마세요. 본문을 읽은 자료와 제목으로 존재를 추정한 자료를 구분하고, 미확인 값은 채우지 마세요. 자세한 인용은 documents의 reading에서 확인하세요. 예산 후보는 같은 사업임을 대조한 뒤 연결하세요.';
 output.evidenceMap=(value.evidenceMap||[]).map(g=>({...g,stages:g.stages.map(s=>({role:s.role,label:s.label,documentIds:s.documents.map(d=>ids.get(d.url)).filter(Boolean)}))}));
 output.budgetEvidenceLinks=value.budgetEvidenceLinks||[];
 output.evidenceFollowups=value.evidenceFollowups||[];
 output.budgetCandidates=value.budgetCandidates||[];
 output.budgetSearches=value.budgetSearches||[];
 output.budgetScope=value.budgetScope||null;
 output.catalogEvidence=require('./catalog-context').compact(value.catalogEvidence);
 output.responseSize.omittedCatalogItems=0;
 output.budgetCandidateNote='2026년 본예산 일반회계 세출의 사업명 검색 초기 후보 최대 5행입니다. budgetSearches의 q·nextOffset으로 search_budget_projects를 이어 조회하세요. 문서의 사업과 같은지, 시비인지 총사업비인지 확인한 뒤 사용하세요. 교부·집행액과 합산하지 마세요.';
 output.confirmedProgramLinks=require('./program-links').retainedLinks(value.confirmedProgramLinks||[],documents);
 for(const l of output.confirmedProgramLinks){const main=output.comparison.find(p=>p.documentIds.includes(ids.get(l.primaryUrl)));if(main){const memberIds=l.documents.map(d=>ids.get(d.url));output.comparison=output.comparison.filter(p=>p===main||!p.documentIds.some(id=>memberIds.includes(id)));main.documentIds=[...new Set([...main.documentIds,...memberIds])];main.participatingInstitutions=l.documents.map(d=>d.institution);main.countAsOneCase=true;main.name=l.name;}}
 output.comparison=output.comparison.slice(0,6);
 output.responseSize.omittedBudgetCandidates=0;
 output.institutionDirectory=institutionDirectory;
 output.responseSize.omittedBudgetLinks=0;
 output.responseSize.omittedEvidenceGroups=0;
 output.quickBrief=require('./research-brief')(briefInputs.filter(d=>documents.some(k=>k.id===d.id)),output.confirmedProgramLinks);
 const refreshComparison=()=>{output.caseComparison=require('./case-comparison')(output.quickBrief,output.catalogEvidence);};
 refreshComparison();
 const oversized=()=>JSON.stringify(output).length>24000;
 const pruneReferences=()=>{
  const kept=new Set(documents.map(d=>d.id));
  output.confirmedProgramLinks=require('./program-links').retainedLinks(output.confirmedProgramLinks,documents);
  output.quickBrief=require('./research-brief')(briefInputs.filter(d=>documents.some(k=>k.id===d.id)),output.confirmedProgramLinks);
  refreshComparison();
  output.comparison=output.comparison.filter(p=>p.documentIds.length&&p.documentIds.every(id=>kept.has(id)));
  const links=output.possibleProjectLinks.filter(x=>x.documentIds.every(id=>kept.has(id)));
  output.responseSize.omittedLinks+=output.possibleProjectLinks.length-links.length;output.possibleProjectLinks=links;
  const groups=output.evidenceMap.filter(g=>g.stages.every(s=>s.documentIds.every(id=>kept.has(id))));
  output.responseSize.omittedEvidenceGroups+=output.evidenceMap.length-groups.length;output.evidenceMap=groups;
 };
 // Keep retrieved evidence before spending the response budget on unread candidate titles.
 while(oversized()){
  const index=documents.findLastIndex(d=>d.readingStatus==='not_attempted');
  if(index<0)break;
  documents.splice(index,1);output.responseSize.omittedDocuments++;pruneReferences();
 }
 while(oversized()&&output.possibleProjectLinks.length){output.possibleProjectLinks.pop();output.responseSize.omittedLinks++;}
 while(oversized()&&output.evidenceMap.length){output.evidenceMap.pop();output.responseSize.omittedEvidenceGroups++;}
 while(oversized()&&output.budgetCandidates.length){output.budgetCandidates.pop();output.responseSize.omittedBudgetCandidates++;}
 while(oversized()&&output.catalogEvidence?.items.length>1){output.catalogEvidence.items.pop();output.responseSize.omittedCatalogItems++;refreshComparison();}
 // Preserve whole quotations rather than cutting evidence mid-sentence.
 for(let i=documents.length-1;i>=0&&oversized();i--)if(documents[i].reading){delete documents[i].reading;documents[i].readingDetailsOmitted=true;output.responseSize.omittedReadingDetails++;}
 while(oversized()&&output.possibleProjectLinks.length){output.possibleProjectLinks.pop();output.responseSize.omittedLinks++;}
 while(oversized()&&output.evidenceMap.length){output.evidenceMap.pop();output.responseSize.omittedEvidenceGroups++;}
 while(oversized()&&output.budgetEvidenceLinks.length){output.budgetEvidenceLinks.pop();output.responseSize.omittedBudgetLinks++;}
 while(oversized()&&documents.length){documents.pop();output.responseSize.omittedDocuments++;pruneReferences();}
 pruneReferences();
 while(oversized()&&output.catalogEvidence?.items.length){output.catalogEvidence.items.pop();output.responseSize.omittedCatalogItems++;refreshComparison();}
 if(oversized())return {responseMode:'compact',responseSize:{maxCharacters:24000,metadataOmitted:true,omittedDocuments:rows.size},detailHint:output.detailHint,note:'메타데이터가 응답 한도를 초과했습니다. detail=full로 조회하세요.'};
 return {answerGuide:output.answerGuide,quickBrief:output.quickBrief,...output};
};
