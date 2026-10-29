const assert=require('node:assert/strict');
const {links}=require('./program-links');
const doc=(institution,title,url,text,budget)=>({candidate:{institution,title,url,relevance:{kind:'project_candidate'}},result:{status:'read',attempts:[{status:'read',source:{sourceId:url,url,pages:[{page:1,text}]}}],evidence:{fields:{budget:{status:'needs_review',excerpts:[{quote:budget,sourceId:url,url,page:1,status:'evidence_candidate'}]}}}}});
const upper=doc('부산광역시','부산형 산후조리비 지원사업 추진 계획','upper','부산형 산후조리비 지원사업\n사업기간: 2026년\n16개 구·군 보건소 보조금 교부','사업예산 100백만원');
const lower=doc('부산광역시 수영구','부산형 산후조리비 지원사업 사용승인','lower','부산형 산후조리비 지원사업 보조금 교부결정\n사업기간: 2026. 1. ~ 12.\n부산광역시장','총사업비 40백만원');
assert.equal(links([upper,lower]).length,1);
const mutate=(x,fn)=>{const copy=structuredClone(x);fn(copy);return copy;};
for(const bad of [
 mutate(lower,x=>{x.result.status='unreadable';}),
 mutate(lower,x=>{x.result.attempts[0].evidenceScope='attachment_reference';}),
 mutate(lower,x=>{x.result.attempts[0].source.pages[0].text=x.result.attempts[0].source.pages[0].text.replace('2026','2025');}),
 mutate(lower,x=>{x.result.attempts[0].source.pages[0].text='부산형 산후조리비 지원사업\n사업기간: 2026년\n시비 50%, 구비 50%';}),
 mutate(lower,x=>{x.result.attempts[0].source.pages[0].text=x.result.attempts[0].source.pages[0].text.replace('부산광역시장','부산광역시장의 처분에 따른다');}),
 mutate(lower,x=>{x.candidate.title+=' 자체 추가 지원';}),
 mutate(lower,x=>{x.candidate.institution='울산광역시 중구';})
])assert.equal(links([upper,bad]).length,0);
assert.equal(links([mutate(upper,x=>{x.result.attempts[0].source.pages[0].text='부산형 산후조리비 지원사업\n사업기간: 2026년';}),lower]).length,0);
const value={candidates:[upper.candidate,lower.candidate],investigations:[upper,lower],projects:require('./project-bundles').bundle([upper.candidate,lower.candidate],[upper,lower])};
const compact=require('./presentation').present('research_policy',value);
assert.equal(compact.quickBrief.length,1);assert.equal(compact.quickBrief[0].countAsOneCase,true);
assert.equal(compact.quickBrief[0].fields.budget.quote,'사업예산 100백만원');
assert.equal(compact.quickBrief[0].linkedDocuments[0].fields.budget.quote,'총사업비 40백만원');
assert.equal(compact.comparison.length,1);assert.equal(compact.comparison[0].documentIds.length,2);
assert.equal(compact.documents.length,2);assert.equal(compact.confirmedProgramLinks[0].evidence[0].page,1);
assert.equal(compact.summary.projectGroups,1);assert.equal(compact.summary.candidateProjectGroups,2);
const full=require('./presentation').present('research_policy',value,'full');
assert.equal(full.presentation.projects.length,1);assert.equal(full.presentation.projects[0].documents.length,2);
assert.equal(full.presentation.projects[0].linkedProjects[0].institution,'부산광역시 수영구');
const signed=mutate(lower,x=>{x.result.attempts[0].source.pages[0].text=x.result.attempts[0].source.pages[0].text.replace('부산광역시장','**부 산 광 역 시 장**');});
for(const e of links([upper,signed])[0].evidence)assert([...upper.result.attempts,signed.result.attempts[0]].some(a=>a.source.pages.some(p=>p.text.includes(e.quote))));
const reversed=mutate(upper,x=>{x.result.attempts[0].source.pages[0].text='부산형 산후조리비 지원사업\n사업기간: 2026년\n보조 사업자 : 16개 구·군';});
assert.equal(links([reversed,lower]).length,1);
const flattened=mutate(lower,x=>{x.result.attempts[0].source.pages[0].text='수영구 첨부 '+ '공문 본문 '.repeat(120)+'부산형 산후조리비 지원사업 보조금 교부결정 사업기간: 2026. 1. ~ 12. 부산광역시장 수신자 수영구청장 주무관';});
assert.equal(links([upper,flattened]).length,1);
for(const e of links([upper,flattened])[0].evidence)assert([upper,flattened].some(d=>d.result.attempts.some(a=>a.source.pages.some(p=>p.text.includes(e.quote)))));
assert.equal(links([upper,mutate(flattened,x=>{x.result.attempts[0].source.pages[0].text=x.result.attempts[0].source.pages[0].text.replace('부산광역시장 수신자','부산광역시장의 처분에 따른다 수신자');})]).length,0);
// The confirmed 부산시·수영구 relationship requires evidence from the selected subject, not a rejected attachment.
const wrongTarget=mutate(lower,x=>{x.result.attempts[0].assessment='target_mismatch';x.result.attempts.push({status:'read',assessment:'plan_candidate',source:{sourceId:'other',url:'other',pages:[{page:2,text:'관련성이 확인된 문서이나 교부 근거 없음'}]}});});
assert.equal(links([upper,wrongTarget]).length,0,'target-mismatched attachment must not prove a shared program');
const wrongUpper=mutate(upper,x=>{x.result.attempts[0].assessment='target_mismatch';x.result.attempts.push({status:'read',assessment:'plan_candidate',source:{sourceId:'other',url:'other',pages:[{page:2,text:'관련성이 확인된 문서이나 교부 근거 없음'}]}});});
assert.equal(links([wrongUpper,lower]).length,0,'target-mismatched upper document must not prove a shared program');
const extra=mutate(lower,x=>{x.candidate.url='lower2';x.candidate.institution='부산광역시 중구';});
const many=links([upper,lower,extra]);
const kept=require('./program-links').retainedLinks(many,[{url:'upper'},{url:'lower'}]);
assert.equal(kept.length,1);assert.equal(kept[0].documents.length,2);assert.equal(kept[0].omittedDocumentCount,1);
const remaining=require('./program-links').retainedLinks(many,[{url:'lower'},{url:'lower2'}]);
assert.equal(remaining[0].primaryUrl,'lower');assert.equal(require('./program-links').retainedLinks(many,[{url:'lower'}]).length,0);
assert.equal(require('./presentation').present('research_policy',{...value,candidates:[upper.candidate,lower.candidate,extra.candidate],investigations:[upper,lower,extra],projects:require('./project-bundles').bundle([upper.candidate,lower.candidate,extra.candidate],[upper,lower,extra])}).quickBrief.length,1);
const unlinked=require('./presentation').present('research_policy',{...value,investigations:[upper,{candidate:lower.candidate,result:{status:'unreadable'}}]});
assert.equal(unlinked.quickBrief.length,2);assert.equal(unlinked.confirmedProgramLinks.length,0);
const sameUpper=mutate(upper,x=>{x.candidate.url='upper2';x.candidate.title+=' 변경';});
assert.equal(links([upper,sameUpper,lower]).length,1);
assert.equal(links([upper,sameUpper,lower])[0].documents.length,3);
console.log('PASS: one case for body-linked provincial/municipal documents; budgets and citations preserved, title-only/year/sender/region/additional-project false matches excluded');

const {catalogLinks}=require('./program-links');
const revisionCandidates=[{title:'2026년 AI 서비스 운영계획',institution:'서울특별시 강동구',url:'https://www.open.go.kr/a'},{title:'2026년 AI 서비스 운영계획 수정',institution:'서울특별시 강동구',url:'https://www.open.go.kr/b'}];
const catalog={items:[{projectId:'one',budgetRecords:[],budgetVariants:[],documentCandidates:[],name:'AI 업무지원',institution:'강동구',parent:'서울특별시',year:2026,documents:revisionCandidates.map(d=>({status:'body_supported',relationship:'same_named_budget_program',document:d,evidence:[{quote:'2026년 AI 서비스',page:1,sourceUrl:d.url}]}))}]};
assert.equal(catalogLinks(catalog,revisionCandidates).length,1);
assert.equal(catalogLinks(catalog,revisionCandidates,[],[{documents:[revisionCandidates[0]]}]).length,1);
for(const status of ['title_candidate','not_read']){const c=structuredClone(catalog);c.items[0].documents[1].status=status;assert.equal(catalogLinks(c,revisionCandidates).length,0);}
const referenceCatalog=structuredClone(catalog);referenceCatalog.items[0].documents[1].relationship='explicit_budget_line_reference';assert.equal(catalogLinks(referenceCatalog,revisionCandidates).length,0);
assert.equal(catalogLinks(catalog,[revisionCandidates[0],{...revisionCandidates[1],institution:'서울특별시 중구'}]).length,0);
const futureRevision={candidate:revisionCandidates[1],result:{status:'read',attempts:[{status:'read',source:{pages:[{page:1,text:'사업기간: 2027년'}]}}]}};assert.equal(catalogLinks(catalog,revisionCandidates,[futureRevision]).length,0);
const revisionValue={catalogEvidence:catalog,candidates:revisionCandidates.map(d=>({...d,relevance:{kind:'project_candidate'},documentRole:'plan'})),investigations:[],projects:revisionCandidates.map(d=>({institution:d.institution,name:d.title,documents:[d],fields:{}}))};
const revisionOutput=require('./presentation').present('research_policy',revisionValue);assert.equal(revisionOutput.summary.projectGroups,1);assert.equal(revisionOutput.summary.textReadDocuments,0);assert.equal(revisionOutput.quickBrief.length,1);assert.equal(revisionOutput.caseComparison.length,1);assert.equal(revisionOutput.caseComparison[0].documents.length,2);assert.equal(require('./presentation').present('research_policy',revisionValue,'full').presentation.projects.length,1);
const collision=structuredClone(catalog);collision.items[0].budgetRowCount=2;assert.equal(catalogLinks(collision,revisionCandidates).length,0,'same-name budget rows cannot automatically bind both documents');

const splitCatalog={items:catalog.items[0].documents.map((d,i)=>({...catalog.items[0],projectId:"separate"+i,documents:[d]}))};assert.equal(catalogLinks(splitCatalog,revisionCandidates).length,0);
const spacedUpper=mutate(upper,x=>{x.result.attempts[0].source.pages[0].text=x.result.attempts[0].source.pages[0].text.replace('구·군 보건소 보조금 교부','구 ·군 보 건 소 보 조 금 교 부');});
assert.equal(links([spacedUpper,lower]).length,1);
assert.equal(links([spacedUpper,mutate(lower,x=>{x.result.attempts[0].source.pages[0].text=x.result.attempts[0].source.pages[0].text.replace('부산광역시장','울산광역시장');})]).length,0);
const pressure=Array.from({length:250},(_,i)=>({url:'https://www.open.go.kr/noise/'+i,institution:'기관'+i,title:'검토 문서 '.repeat(4)+i,relevance:{kind:'project_candidate'}}));
const crowded=require('./presentation').present('research_policy',{...value,candidates:[upper.candidate,lower.candidate,...pressure],projects:[...value.projects,...pressure.map(d=>({institution:d.institution,name:d.title,documents:[d],fields:{}}))]});
assert.equal(crowded.confirmedProgramSummaries.length,1);assert.equal(crowded.confirmedProgramSummaries[0].documents.length,2);assert.equal(crowded.confirmedProgramSummaries[0].countAsOneCase,true);assert(JSON.stringify(crowded).length<=24000);assert(crowded.responseSize.omittedDocuments>0);
console.log('PASS: spaced grant text and confirmed grouping survive large compact outputs');

// Real 부산시 plan, 수영구 approval and two 부산시 grant documents; excerpts are from saved originals.
const stored=require('./project-document-links.json').links.filter(x=>x.projectId==='bp-fe3fc82227fc0633cfb027c6');
const city=doc('부산광역시','부산형 산후조리비 지원사업 추진 계획',stored.find(x=>x.document.role==='plan').document.url,'부산형 산후조리비 지원사업\n구·군 보건소 보조금 교부\n(사업기간) 2026년','');
const suyeong=doc('부산광역시 수영구','추가경정예산의 성립 전 사용승인 건의[부산형 산후조리비 지원사업]','https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=DCT9689C047EDFA6DB10AAE984CF459D499&prdnDt=20260921090634&nstSeCd=B','1.「부산형 산후조리비 지원사업」보조금을 다음과 같이 교부결정 하오니 붙임 교부조건을 준수하여 보조사업 수행에 만전을 기하여 주시기 바랍니다.\n사업기간 : 2026. 1. ~ 2026. 12.\n부산광역시장','');
const realCatalog={items:[{projectId:'bp-fe3fc82227fc0633cfb027c6',name:'부산형 산후조리비 지원사업',institution:'부산광역시',year:2026,documents:stored}]};
const realCandidates=[city.candidate,suyeong.candidate,...stored.map(x=>x.document)].filter((d,i,a)=>a.findIndex(v=>v.url===d.url)===i);
const body=links([city,suyeong]),catalogGroups=catalogLinks(realCatalog,realCandidates,[city,suyeong],body);
const merged=require('./program-links').combineLinks([...body,...catalogGroups]);
assert.equal(merged.length,1);assert.equal(merged[0].documents.length,4);
const result=require('./presentation').present('research_policy',{candidates:realCandidates,investigations:[city,suyeong],catalogEvidence:realCatalog,projects:realCandidates.map(d=>({institution:d.institution,name:d.title,documents:[d],fields:{}}))},'full');
assert.equal(result.summary.projectGroups,1);assert.equal(result.presentation.projects.length,1);assert.equal(result.presentation.projects[0].documents.length,4);
assert.equal(require('./program-links').combineLinks([body[0],{...catalogGroups[0],year:'2027'}]).length,2,'different years never bridge');
const unrelated={...catalogGroups[0],documents:catalogGroups[0].documents.map((d,i)=>({...d,url:'https://www.open.go.kr/other/'+i}))};
assert.equal(require('./program-links').combineLinks([body[0],unrelated]).length,2,'similar names without a shared source do not bridge');
console.log('PASS: actual 부산 plan and 수영구 grant linked with both saved 부산 grant documents; different years and unrelated documents remain separate');

// The actual 광명 plan discusses both low-income and universal programs in one document.
const shared='https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=DCT030C337F241515A943F70B2303D4B4B6&prdnDt=20260306174447&nstSeCd=B';
const sharedDoc={url:shared,institution:'경기도 광명시',title:'2026년 여성청소년 생리용품 지원 사업 추진계획(안)',relevance:{kind:'project_candidate'}};
const low={url:'https://www.open.go.kr/low',institution:'경기도 광명시',title:'2026년 생리용품 저소득층 지원 계획',relevance:{kind:'project_candidate'}};
const universal={url:'https://www.open.go.kr/universal',institution:'경기도 광명시',title:'2026년 생리용품 보편지원 계획',relevance:{kind:'project_candidate'}};
const direct=d=>({status:'body_supported',relationship:'same_named_budget_program',document:d,evidence:[{quote:'2026년 사업',url:d.url}]});
const multiple={items:[
 {projectId:'low',name:'여성청소년 생리용품 지원(저소득층)',institution:'광명시',parent:'경기도',year:2026,account:'일반회계',budgetVariants:[{amount:122152,unit:'천원'}],budgetRecords:[],documentCandidates:[],documents:[direct(sharedDoc),direct(low)]},
 {projectId:'universal',name:'여성청소년 생리용품 보편지원',institution:'광명시',parent:'경기도',year:2026,account:'일반회계',budgetVariants:[{amount:1186248,unit:'천원'}],budgetRecords:[],documentCandidates:[],documents:[direct(sharedDoc),direct(universal)]}
]};
const competing=catalogLinks(multiple,[sharedDoc,low,universal]);
assert.equal(competing.length,2);
assert.equal(require('./program-links').combineLinks(competing).length,2,'one document is not evidence the programs are identical');
const differentId={...competing[1],name:competing[0].name};
assert.equal(require('./program-links').combineLinks([competing[0],differentId]).length,2,'different budget project IDs must remain separate');
const multipleValue={catalogEvidence:multiple,candidates:[sharedDoc,low,universal],investigations:[],projects:[sharedDoc,low,universal].map(d=>({institution:d.institution,name:d.title,documents:[d],fields:{}}))};
const mFull=require('./presentation').present('research_policy',multipleValue,'full');
assert.equal(mFull.confirmedProgramLinks.length,0,'ambiguous shared source cannot establish one case');
assert.equal(mFull.summary.projectGroups,3);assert.equal(mFull.presentation.projects.length,3);
const mCompact=require('./presentation').present('research_policy',multipleValue);
assert.equal(mCompact.confirmedProgramLinks.length,0);assert.equal(mCompact.comparison.length,3);assert.equal(mCompact.quickBrief.length,3);
const sharedComparison=mCompact.caseComparison.find(x=>x.documents.some(d=>d.url===shared));
assert.equal(sharedComparison.documents[0].appropriations.length,0);assert.equal(sharedComparison.documents[0].appropriationStatus,'multiple_budget_projects_document_attribution_unresolved');
const duplicateProjects=[{name:'저소득층',documents:[sharedDoc]},{name:'보편지원',documents:[sharedDoc]},{name:'다른 문서',documents:[low]}];
assert.equal(require('./program-links').caseCounts(duplicateProjects,[competing[0]]).projectGroups,3,'shared source in two project rows remains separate');
const saved=require('./project-document-links.json').links;
try{
 saved.push({...direct(sharedDoc),projectId:'low'},{...direct(sharedDoc),projectId:'universal'});
 const partial={...multipleValue,catalogEvidence:{items:[multiple.items[0]]},candidates:[sharedDoc,low],projects:multipleValue.projects.slice(0,2)};
 const p=require('./presentation').present('research_policy',partial);
 assert.equal(p.confirmedProgramLinks.length,0,'conflict omitted from a partial catalog must still block merging');
 const doc=p.caseComparison.find(x=>x.documents.some(d=>d.url===shared)).documents[0];
 assert.equal(doc.appropriations.length,0);assert.equal(doc.appropriationStatus,'multiple_budget_projects_document_attribution_unresolved');
}finally{saved.splice(-2);}
console.log('PASS: actual multi-program 광명 source does not merge programs or assign both budgets to one document');
