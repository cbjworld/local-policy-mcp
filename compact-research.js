module.exports=function compactResearch(value){
 const reads=new Map((value.investigations||[]).map(x=>[x.candidate.url,x.result]));
 const rows=new Map();
 for(const d of [...(value.candidates||[]),...(value.financialDocuments||[]),...(value.reviewItems||[]),...(value.relatedDocuments||[])])if(!rows.has(d.url))rows.set(d.url,d);
 const documents=[...rows.values()].sort((a,b)=>Number(reads.has(b.url))-Number(reads.has(a.url))).map((d,i)=>{
  const r=reads.get(d.url);
  const reading=r&&require('./presentation').documentView({...r,metadata:{...d,...r.metadata}});
  if(reading){delete reading.reviewGuidance;delete reading.note;}
  return {id:'d'+(i+1),title:d.title,url:d.url,institution:d.institution,role:d.documentRole||'other',classification:d.relevance?.kind,readingStatus:r?.status||'not_attempted',...(r?{reading,failures:(r.attempts||[]).filter(a=>a.status!=='read').map(a=>({fileName:a.fileName,status:a.status,message:a.message})),message:r.message}: {})};
 });
 const ids=new Map(documents.map(d=>[d.url,d.id]));
 const output={responseMode:'compact',request:value.request,status:value.status,summary:value.summary,coverage:value.coverage,limits:value.limits,searchFailures:value.failures||[],documents,possibleProjectLinks:(value.possibleProjectLinks||[]).map(x=>({name:x.name,status:x.status,documentIds:x.documents.map(d=>ids.get(d.url)).filter(Boolean)})),responseSize:{maxCharacters:24000,omittedDocuments:0,omittedReadingDetails:0,omittedLinks:0},detailHint:'생략 자료는 동일 인수의 detail=full 또는 문서 URL의 research_open_document로 재조회하세요. 재조회 결과는 달라질 수 있습니다.',reviewGuidance:'예산 합계와 재원별 금액을 같은 단위로 재계산하세요. 불일치는 원문 표를 다시 읽고, 확인 전 숫자를 수정하거나 확정값으로 제시하지 마세요.',note:'교부·예탁은 집행 확정이 아니며 연관 후보를 같은 사업으로 합치지 마세요. 제목 근거와 본문 근거를 구분하세요.'};
 output.evidenceMap=(value.evidenceMap||[]).map(g=>({...g,stages:g.stages.map(s=>({role:s.role,label:s.label,documentIds:s.documents.map(d=>ids.get(d.url)).filter(Boolean)}))}));
 output.budgetEvidenceLinks=value.budgetEvidenceLinks||[];
 output.budgetCandidates=value.budgetCandidates||[];
 output.budgetSearches=value.budgetSearches||[];
 output.budgetCandidateNote='2026년 본예산 일반회계 세출의 사업명 검색 초기 후보 최대 5행입니다. budgetSearches의 q·nextOffset으로 search_budget_projects를 이어 조회하세요. 문서의 사업과 같은지, 시비인지 총사업비인지 확인한 뒤 사용하세요. 교부·집행액과 합산하지 마세요.';
 output.responseSize.omittedBudgetCandidates=0;
 output.responseSize.omittedBudgetLinks=0;
 output.responseSize.omittedEvidenceGroups=0;
 const oversized=()=>JSON.stringify(output).length>24000;
 const pruneReferences=()=>{
  const kept=new Set(documents.map(d=>d.id));
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
 // Preserve whole quotations rather than cutting evidence mid-sentence.
 for(let i=documents.length-1;i>=0&&oversized();i--)if(documents[i].reading){delete documents[i].reading;documents[i].readingDetailsOmitted=true;output.responseSize.omittedReadingDetails++;}
 while(oversized()&&output.possibleProjectLinks.length){output.possibleProjectLinks.pop();output.responseSize.omittedLinks++;}
 while(oversized()&&output.evidenceMap.length){output.evidenceMap.pop();output.responseSize.omittedEvidenceGroups++;}
 while(oversized()&&output.budgetEvidenceLinks.length){output.budgetEvidenceLinks.pop();output.responseSize.omittedBudgetLinks++;}
 while(oversized()&&documents.length){documents.pop();output.responseSize.omittedDocuments++;}
 pruneReferences();
 if(oversized())return {responseMode:'compact',responseSize:{maxCharacters:24000,metadataOmitted:true,omittedDocuments:rows.size},detailHint:output.detailHint,note:'메타데이터가 응답 한도를 초과했습니다. detail=full로 조회하세요.'};
 return output;
};
