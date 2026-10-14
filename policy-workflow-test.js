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
