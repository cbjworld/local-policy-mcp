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
