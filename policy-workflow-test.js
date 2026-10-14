const assert=require('node:assert/strict'),w=require('./policy-workflow');
const now=new Date('2026-10-13T00:00:00Z');
assert.equal(w.plan({question:'반려동물 정책 찾아줘'},now).broad,true);
assert.deepEqual(w.plan({question:'청년 AI 구독료 지원 사례 찾아줘'},now).queries,['청년 AI 구독료 지원','청년 AI 구독료']);
assert.equal(w.plan({question:'병원 동행'},now).startDate,'20241013');
for(const args of [{question:''},{question:'사업',queries:[]},{question:'청년',startDate:'20260101'}])assert.throws(()=>w.plan(args));
const calls=[],io={search:async({q,page})=>({total:3,hasMore:false,items:[{title:'청년 AI 구독료 지원사업 추진계획',institution:'A',url:'a'},{title:'청년 AI 구독료 지원계획',institution:'B',url:'b'}],reviewItems:[],relatedDocuments:[]}),research:async x=>{calls.push(x);return {status:'read'};}};
(async()=>{const r=await w.research({question:'청년 AI 구독료 지원 사례 찾아줘'},io);assert.equal(r.candidates.length,2);assert.equal(r.investigations.length,2);assert.equal(calls[0].requestedQuery,'청년 AI 구독료 지원 사례 찾아줘');calls.length=0;assert.equal((await w.research({question:'반려동물 정책 찾아줘'},io)).status,'topic_overview');assert.equal(calls.length,0);const f=await w.research({question:'청년 지원'},{search:async()=>{throw Error('offline')}});assert.equal(f.status,'search_failed');assert.equal(f.investigations.length,0);console.log('PASS: short questions, broad overview, defaults, dedupe, limits, intent propagation, search failure');})().catch(e=>{console.error(e);process.exitCode=1});
