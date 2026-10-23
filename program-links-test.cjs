const assert=require('node:assert/strict');
const {links}=require('./program-links');
const doc=(institution,title,url,text,budget)=>({candidate:{institution,title,url,relevance:{kind:'project_candidate'}},result:{status:'read',attempts:[{status:'read',source:{sourceId:url,url,pages:[{page:1,text}]}}],evidence:{fields:{budget:{status:'needs_review',excerpts:[{quote:budget,sourceId:url,url,page:1,status:'evidence_candidate'}]}}}}});
const upper=doc('부산광역시','부산형 산후조리비 지원사업 추진 계획','upper','부산형 산후조리비 지원사업\n사업기간: 2026년\n16개 구·군 보건소 보조금 교부','사업예산 100백만원');
const lower=doc('부산광역시 수영구','부산형 산후조리비 지원사업 사용승인','lower','부산형 산후조리비 지원사업 보조금 교부결정\n사업기간: 2026. 1. ~ 12.\n부산광역시장','총사업비 40백만원');
assert.equal(links([upper,lower]).length,1);
const mutate=(x,fn)=>{const copy=structuredClone(x);fn(copy);return copy;};
for(const bad of [
 mutate(lower,x=>{x.result.status='unreadable';}),
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
assert.equal(catalogLinks(catalog,revisionCandidates,[],[{documents:[revisionCandidates[0]]}]).length,0);
for(const status of ['title_candidate','not_read']){const c=structuredClone(catalog);c.items[0].documents[1].status=status;assert.equal(catalogLinks(c,revisionCandidates).length,0);}
const referenceCatalog=structuredClone(catalog);referenceCatalog.items[0].documents[1].relationship='explicit_budget_line_reference';assert.equal(catalogLinks(referenceCatalog,revisionCandidates).length,0);
assert.equal(catalogLinks(catalog,[revisionCandidates[0],{...revisionCandidates[1],institution:'서울특별시 중구'}]).length,0);
const futureRevision={candidate:revisionCandidates[1],result:{status:'read',attempts:[{status:'read',source:{pages:[{page:1,text:'사업기간: 2027년'}]}}]}};assert.equal(catalogLinks(catalog,revisionCandidates,[futureRevision]).length,0);
const revisionValue={catalogEvidence:catalog,candidates:revisionCandidates.map(d=>({...d,relevance:{kind:'project_candidate'},documentRole:'plan'})),investigations:[],projects:revisionCandidates.map(d=>({institution:d.institution,name:d.title,documents:[d],fields:{}}))};
const revisionOutput=require('./presentation').present('research_policy',revisionValue);assert.equal(revisionOutput.summary.projectGroups,1);assert.equal(revisionOutput.summary.textReadDocuments,0);assert.equal(revisionOutput.quickBrief.length,1);assert.equal(revisionOutput.caseComparison.length,1);assert.equal(revisionOutput.caseComparison[0].documents.length,2);assert.equal(require('./presentation').present('research_policy',revisionValue,'full').presentation.projects.length,1);

const splitCatalog={items:catalog.items[0].documents.map((d,i)=>({...catalog.items[0],projectId:"separate"+i,documents:[d]}))};assert.equal(catalogLinks(splitCatalog,revisionCandidates).length,0);
