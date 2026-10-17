const assert=require('node:assert/strict');
const {plan,research}=require('./policy-workflow');
const compact=require('./compact-research');
const cases=[['산후조리비','산후조리비'],['산후조리비 비교해줘','산후조리비'],['산후조리비 지원 사업 비교해줘','산후조리비 지원 사업'],['빈집 예산 알려줘','빈집'],['청년 AI 구독료 지원 사업 찾아줘','청년 AI 구독료 지원 사업'],['병원동행 계획과 예산을 비교해줘','병원동행'],['다른 지자체 산후조리비 지원 사례 찾아줘','산후조리비 지원'],['전국 지자체 빈집 정책 찾아줘','빈집'],['노인 일자리 찾아주세요','노인 일자리'],['청년 월세 지원 비교해주세요','청년 월세 지원'],['출산지원금','출산지원금'],['반려동물 정책 찾아줘','반려동물'],['청년 정책 알려줘','청년'],['문화 사례 찾아줘','문화'],['교통 정책 알려줘','교통'],['출산 지원 예산과 계획을 비교해줘','출산 지원'],['주거 정책 검색해줘','주거'],['교육 정책 알려 주세요','교육'],['환경 사례 알려줘','환경'],['아동 정책 찾아 줘','아동']];
for(const [q,topic] of cases)assert.equal(plan({question:q}).topic,topic,q);
assert.equal(plan({question:'산후조리비'}).broad,false);assert.equal(plan({question:'반려동물'}).broad,true);
(async()=>{
 let reads=0;const doc={title:'2026년 산후조리비 지원 사업 추진계획',institution:'시험시',url:'https://www.open.go.kr/test'};
 const r=await research({question:'산후조리비'},{search:async()=>({items:[doc],reviewItems:[],relatedDocuments:[],total:1,hasMore:false}),research:async()=>{reads++;return {status:'read',evidence:{fields:{}}};}});
 assert.ok(reads>0,'specific single-word topic must read');
 const c=compact(r);assert.ok(c.comparison.length);assert.equal(c.comparison[0].existence,'title_inferred');assert.equal(c.comparison[0].fields.budget,'unconfirmed');assert.ok(JSON.stringify(c).length<=24000);
 for(const p of c.comparison)for(const id of p.documentIds)assert.ok(c.documents.some(d=>d.id===id));
 console.log('PASS: 20 short questions, focused single-word reading, compact comparison references and unknown amounts');
})().catch(e=>{console.error(e);process.exitCode=1;});
