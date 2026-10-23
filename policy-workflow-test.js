const assert=require('node:assert/strict'),w=require('./policy-workflow');
const now=new Date('2026-10-13T00:00:00Z');
(async()=>{
 const selected=[],docs=[{title:'어르신 보청기 지원 계획',institution:'테스트시',url:'elder'},{title:'선천성 난청 검사 및 보청기 지원 보조금 교부결정',institution:'테스트시',url:'infant'}];
 const result=await w.research({question:'어르신 보청기',queries:['보청기']},{search:async()=>({total:2,hasMore:false,items:docs,reviewItems:[],relatedDocuments:[]}),research:async a=>{selected.push(a.url);return {status:'read',evidence:{fields:{target:{excerpts:[],status:'unconfirmed'}}}};}});
 assert.deepEqual(selected,['elder']);assert.equal(result.coverage.uniqueDocuments,2);assert.equal(result.relatedDocuments.find(d=>d.url==='infant').targetFit.status,'mismatch');
 console.log('PASS: incompatible age-target finance document retained but not downloaded or used as follow-up');
})().catch(e=>{console.error(e);process.exitCode=1;});
(async()=>{
 let active=0,peak=0;const calls=[];
 const result=await w.research({question:'청년',queries:['청년 지원','청년 사업']},{search:async a=>{
  calls.push(a.q+':'+a.page);active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,a.q==='청년 지원'?15:5));active--;
  return {total:0,hasMore:a.page===1,items:[],reviewItems:[],relatedDocuments:[],url:a.q+':'+a.page};
 }});
 assert.equal(peak,2);assert.deepEqual(result.searches.filter(s=>s.scope==='original').map(s=>s.url),['청년 지원:1','청년 지원:2','청년 사업:1','청년 사업:2']);
 assert.equal(result.coverage.queriedPages,6);assert.equal(result.failures.length,0);assert(result.timings.searchMs>=0);
 console.log('PASS: independent queries overlap, page and merge order remain stable, metadata fallback preserved');
})().catch(e=>{console.error(e);process.exitCode=1;});
async function semanticVariantsTest(){
 const docs=[{title:'2026년 산후조리비 지원사업 추진계획',institution:'A',url:'variant-plan'},{title:'2026년 산후조리비 지원사업 교부결정',institution:'A',url:'variant-grant'},{title:'2026년 반려동물 지원사업 추진계획',institution:'A',url:'unrelated-variant'}];
 const result=await w.research({question:'산후조리비 지원 사업의 계획 예산 교부 집행 자료 찾아줘',queries:['산후조리비 지원','산후조리비 교부']},{search:async()=>({total:3,hasMore:false,items:docs,reviewItems:[],relatedDocuments:[]}),research:async()=>({status:'read'})});
 assert(result.candidates.some(d=>d.url==='variant-plan'));
 assert(!result.candidates.some(d=>d.url==='unrelated-variant'));
 assert(result.evidenceMap.some(g=>g.stages.some(s=>s.role==='allocation_or_deposit')));
 console.log('PASS: question instructions do not become mandatory title keywords; semantic variants retain subject filtering');
}
semanticVariantsTest().catch(e=>{console.error(e);process.exitCode=1});
async function financeFollowupTest(){
 const docs=[{title:'2026년 산후조리비 지원계획',institution:'울산광역시 중구',url:'district-plan'},{title:'2026년 산후조리비 지원계획',institution:'부산광역시',url:'city-plan'},{title:'2026년 산후조리비 보조금 교부',institution:'울산광역시',url:'city-grant'}];
 const r=await w.research({question:'산후조리비 지원',queries:['산후조리비']},{search:async()=>({total:3,hasMore:false,items:docs,reviewItems:[],relatedDocuments:[]}),research:async()=>({status:'read'})});
 assert.equal(r.investigations.length,3);assert.equal(r.investigations[2].purpose,'link_financial_evidence');assert.equal(r.investigations[2].candidate.url,'city-grant');
 assert.equal(r.projects.length,2,'provincial grant is not merged with district project');
 console.log('PASS: financial follow-up after readable plans, province/district remain separate, bounded supplemental slot');
}
financeFollowupTest().catch(e=>{console.error(e);process.exitCode=1});
async function budgetFallbackTest(){
 const r=await w.research({question:'빈집',queries:['빈집']},{search:async()=>{throw Error('portal offline')}});
 assert.equal(r.status,'search_failed');assert.equal(r.candidates.length,0);
 assert(r.budgetCandidates.length>0&&r.budgetCandidates.length<=5);
 assert(r.budgetCandidates.every(x=>x.unit==='천원'&&x.year===2026&&x.source.startsWith('https://')));
 assert.equal(r.budgetEvidenceLinks.length,0,'index hits are not body-confirmed project links');
 assert(r.budgetSearches[0].nextOffset>0);
 console.log('PASS: indexed budget candidates survive portal failure, keep provenance and stay distinct from body matches');
}
budgetFallbackTest().catch(e=>{console.error(e);process.exitCode=1});
assert.equal(w.plan({question:'반려동물 정책 찾아줘'},now).broad,true);
assert.deepEqual(w.plan({question:'청년 AI 구독료 지원 사례 찾아줘'},now).queries,['청년 AI 구독료 지원','청년 AI 구독료']);
assert.deepEqual(w.plan({question:'가정용 음식물처리기 지원 사업 찾아줘'},now).queries,['가정용 음식물처리기 지원 사업','가정용 음식물쓰레기 처리기','가정용 음식물 감량기']);
assert.equal(w.plan({question:'병원 동행'},now).startDate,'20241013');
for(const args of [{question:''},{question:'사업',queries:[]},{question:'청년',startDate:'20260101'}])assert.throws(()=>w.plan(args));
const calls=[],io={search:async({q,page})=>({total:3,hasMore:false,items:[{title:'청년 AI 구독료 지원사업 추진계획',institution:'A',url:'a'},{title:'청년 AI 구독료 지원계획',institution:'B',url:'b'}],reviewItems:[],relatedDocuments:[]}),research:async x=>{calls.push(x);return {status:'read'};}};
async function fallbackTest(){
 const requests=[],empty={total:0,hasMore:false,items:[],reviewItems:[],relatedDocuments:[]};
 const args={question:'산후조리비 지원',queries:['산후조리비 지원'],startDate:'20260101',endDate:'20261014'};
 const result=await w.research(args,{search:async a=>{requests.push(a);return a.scope==='all'?{...empty,total:1,items:[{title:'2026년 산후조리비 지원사업 추진계획',institution:'A',url:'a',disclosure:'비공개'}]}:empty},research:async()=>({status:'no_available_attachment'})});
 assert.equal(requests.length,2);assert.equal(requests[1].scope,'all');assert.equal(requests[1].startDate,args.startDate);
 assert.equal(result.projects[0].existence.status,'title_inferred');assert.equal(result.projects[0].fields.budget.status,'unconfirmed');
 assert.equal(result.searchOutcome.metadataFallback,true);
 const none=await w.research(args,{search:async()=>empty});assert.equal(none.searchOutcome.status,'not_found_in_searched_scope');
 const failed=await w.research(args,{search:async a=>{if(a.scope==='all')throw Error('offline');return empty}});assert.equal(failed.searchOutcome.status,'incomplete');
 const enriched=await w.research(args,{...io,search:async a=>({...empty,items:[{title:'산후조리비 지원사업 계획',url:a.scope==='all'?'private-b':'a',institution:a.scope==='all'?'B':'A',...(a.scope==='all'?{disclosure:'비공개'}:{})}]} )});assert.equal(enriched.searchOutcome.metadataFallback,false);assert.equal(enriched.candidates.length,2);assert(enriched.searches.some(s=>s.scope==='all'));
 console.log('PASS: metadata fallback, dates, private title evidence, empty vs failure, no unnecessary retry');
}
fallbackTest().catch(e=>{console.error(e);process.exitCode=1});
(async()=>{const r=await w.research({question:'청년 AI 구독료 지원 사례 찾아줘'},io);assert.equal(r.candidates.length,2);assert.equal(r.investigations.length,2);assert.equal(calls[0].requestedQuery,'청년 AI 구독료 지원 사례 찾아줘');calls.length=0;assert.equal((await w.research({question:'반려동물 정책 찾아줘'},io)).status,'topic_overview');assert.equal(calls.length,0);const f=await w.research({question:'청년 지원'},{search:async()=>{throw Error('offline')}});assert.equal(f.status,'search_failed');assert.equal(f.investigations.length,0);console.log('PASS: short questions, broad overview, defaults, dedupe, limits, intent propagation, search failure');})().catch(e=>{console.error(e);process.exitCode=1});

for(const prefix of ['다른 지자체','다른 지역','전국 지자체'])assert.deepEqual(w.plan({question:prefix+' 산후조리비 지원 사업 찾아줘'},now).queries,['산후조리비 지원 사업','산후조리비']);
assert.equal(w.plan({question:'서울 산후조리비 지원 사업 찾아줘'},now).topic,'서울 산후조리비 지원 사업');

(async()=>{
 const empty={total:100,hasMore:true,items:[],reviewItems:[],relatedDocuments:[]};
 const r=await w.research({question:'산후조리비',queries:['산후조리비']},{search:async()=>empty});
 assert.deepEqual(r.coverage.nextSearches.map(x=>[x.arguments.scope,x.arguments.page]),[['original',5],['all',2]]);
 assert.equal(r.coverage.queriedPages,5);assert.equal(r.coverage.hasMore,true);
 const f=await w.research({question:'산후조리비',queries:['산후조리비']},{search:async()=>{throw Error('offline')}});
 assert.equal(f.coverage.nextSearches[0].arguments.page,1);assert.equal(f.coverage.nextSearches[0].reason,'실패한 페이지 재시도');
 const done=await w.research({question:'산후조리비',queries:['산후조리비']},{search:async()=>({...empty,hasMore:false})});
 assert.equal(done.coverage.hasMore,false);
 console.log('PASS: continuation pages, exhausted results and retry after search failure');
})().catch(e=>{console.error(e);process.exitCode=1});

(async()=>{
 const docs=[{title:'2026년 경기도 산후조리비 지원사업 계획',institution:'경기도',url:'a'},{title:'2026년 경기도 산후조리비 지원사업 예탁 건의',institution:'군포시',url:'b'},{title:'2025년 경기도 산후조리비 지원사업 계획',institution:'다른시',url:'c'}];
 const r=await w.research({question:'산후조리비'},{search:async()=>({total:3,hasMore:false,items:docs,reviewItems:[],relatedDocuments:[]})});
 assert.equal(r.possibleProjectLinks.length,1);assert.equal(r.possibleProjectLinks[0].documents.length,2);
 assert.equal(r.financialDocuments.length,1);assert.equal(r.financialDocuments[0].documentRole,'allocation_or_deposit');
 assert.equal(r.projects.length,3);
})().catch(e=>{console.error(e);process.exitCode=1});

(async()=>{
 let attempts=0;
 const docs=Array.from({length:8},(_,i)=>({title:'산후조리비 지원사업 계획',institution:'기관'+i,url:'u'+i}));
 const r=await w.research({question:'산후조리비 지원',queries:['산후조리비']},{search:async()=>({total:8,hasMore:false,items:docs,reviewItems:[],relatedDocuments:[]}),research:async()=>({status:++attempts<=3?'unreadable':'read',evidence:{fields:Object.fromEntries(['target','activity','budget','period'].map(k=>[k,{excerpts:[{status:'evidence_candidate',quote:'근거 '+k}]}]))}})});
 assert.equal(attempts,5);assert.equal(r.investigations.filter(x=>x.result.status==='read').length,2);
})().catch(e=>{console.error(e);process.exitCode=1});

async function privateListingTest(){
 const full=()=>({status:'read',evidence:{fields:Object.fromEntries(['target','activity','budget','period'].map(k=>[k,{status:'needs_review',excerpts:[{status:'evidence_candidate',quote:'실제 근거 후보 '+k}]}]))}});
 const title='2026년 청년 주거 지원 추진계획',privateDocs=Array.from({length:5},(_,i)=>({title,institution:'기관A',url:'private'+i,disclosure:'비공개'})),publicDoc={title,institution:'기관A',url:'public',disclosure:'공개'},partial={title,institution:'기관B',url:'partial',disclosure:'부분공개'};
 const called=[],r=await w.research({question:'청년 주거 지원',queries:['청년 주거']},{search:async()=>({items:[...privateDocs,partial,publicDoc],reviewItems:[],relatedDocuments:[],total:7,hasMore:false}),research:async a=>{called.push(a.url);return full();}});
 assert.deepEqual(called,['public','partial']);assert.equal(r.candidates.length,7);assert.equal(r.investigations.length,2);
 const view=require('./presentation').present('research_policy',r);assert.equal(view.summary.listedNonpublicDocuments,5);assert.equal(view.summary.attemptedDocuments,2);assert(view.documents.filter(d=>d.readingDecision).every(d=>d.readingStatus==='not_attempted'));
 const seoul={...privateDocs[0],institution:'서울특별시 시험구',url:'seoul'},unknown={...privateDocs[0],institution:undefined,url:'unknown'};const exceptions=[];
 const e=await w.research({question:'청년 주거 지원',queries:['청년 주거']},{search:async()=>({items:[seoul,unknown],reviewItems:[],relatedDocuments:[],total:2,hasMore:false}),research:async a=>{exceptions.push(a.url);return full();}});assert.equal(e.candidates.filter(d=>d.readingDecision).length,0);assert(exceptions.includes('seoul'));assert(exceptions.includes('unknown'));
 console.log('PASS: nonpublic listing retained without downloads, partial disclosures read, public ties prioritized, Seoul and unknown exceptions preserved');
}
privateListingTest().catch(e=>{console.error(e);process.exitCode=1;});
