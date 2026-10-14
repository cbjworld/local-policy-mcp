const assert=require('node:assert/strict'),w=require('./policy-workflow');
const now=new Date('2026-10-13T00:00:00Z');
assert.equal(w.plan({question:'반려동물 정책 찾아줘'},now).broad,true);
assert.deepEqual(w.plan({question:'청년 AI 구독료 지원 사례 찾아줘'},now).queries,['청년 AI 구독료 지원','청년 AI 구독료']);
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
 const noFallback=await w.research(args,{...io,search:async a=>{assert.notEqual(a.scope,'all');return {...empty,items:[{title:'산후조리비 지원사업 계획',url:'a',institution:'A'}]}}});assert.equal(noFallback.searchOutcome.metadataFallback,false);
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
 const r=await w.research({question:'산후조리비 지원',queries:['산후조리비']},{search:async()=>({total:8,hasMore:false,items:docs,reviewItems:[],relatedDocuments:[]}),research:async()=>({status:++attempts<=3?'unreadable':'read'})});
 assert.equal(attempts,5);assert.equal(r.investigations.filter(x=>x.result.status==='read').length,2);
})().catch(e=>{console.error(e);process.exitCode=1});
