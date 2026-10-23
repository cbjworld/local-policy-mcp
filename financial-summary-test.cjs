const assert=require('node:assert/strict'),{money,summarize,requestedGaps}=require('./financial-summary');
const make=(text,extra={})=>[{status:'read',source:{sourceId:'s',url:'https://a.go.kr/plan.pdf',scanComplete:true,pages:[{page:5,text}]},...extra}];
const row=(s,key)=>s.rows.find(r=>r.key===key);
assert.equal(money('5,000천원'),5000000);assert.equal(money('1.15억원'),115000000);assert.equal(money('0.5천원'),500);
for(const bad of ['1,,000원','1.5원','-100원','9007199254740992원','1억2천만원','100원×2'])assert.equal(money(bad),null,bad);
for(const heading of ['사업비','총사업비','소요예산','사업예산']){
 const result=summarize(make(heading+': 금5,000천원(청년기금)'));
 assert.equal(row(result,'planBudget').valueKRW,5000000);assert.equal(row(result,'planBudget').label,'계획서 사업비');assert.equal(row(result,'planBudget').observations[0].sourceLabel,heading);
}
const yeongdo='사 업 비 : 금5,000천원(금오백만원)\n면접수당 지원금 : 50천원×100회\n지원내용: 1회 면접수당 5만원 지원';
const y=summarize(make(yeongdo));assert.equal(row(y,'supportBudget').valueKRW,5000000);assert.equal(row(y,'supportBudget').status,'calculated');assert.equal(row(y,'perPayment').valueKRW,50000);assert.equal(row(y,'promotionBudget').status,'not_stated');
const gijang='총사업비: 금10,500,000원(금일천오십만원)\n홍보비: 금500,000원(금오십만원)\n지원금: 금10,000,000원 ▸ 50,000원×100명×2회\n지원내용: 1인당 연 10만원 한도(1회당 5만원, 최대2회)';
const g=summarize(make(gijang));assert.equal(row(g,'planBudget').valueKRW,10500000);assert.equal(row(g,'supportBudget').valueKRW,10000000);assert.equal(row(g,'promotionBudget').valueKRW,500000);assert.equal(row(g,'annualLimit').valueKRW,100000);assert.equal(row(g,'perPayment').valueKRW,50000);
for(const r of [...y.rows,...g.rows])for(const e of r.observations){assert((e.sourceId==='s'));assert((r===row(y,r.key)?yeongdo:gijang).includes(e.quote));}
for(const bad of ['지원금:50천원×100회+40만원','지원금:50천원×100명×2회×12개월','지원금:50천원×100회÷2','지원금:1,,000원×2회'])assert.equal(row(summarize(make(bad)),'supportBudget').status,'not_stated',bad);
assert.equal(row(summarize(make('지원금:50천원×100명×2회')),'supportBudget').valueKRW,10000000);
assert.equal(row(summarize(make('사업비: 1억2천만원')),'planBudget').status,'not_stated');
assert.equal(row(summarize(make('사업비: -100만원')),'planBudget').status,'not_stated');
assert.equal(row(summarize(make('사업비: ***** 시비30천원')),'planBudget').status,'redacted');
assert.equal(row(summarize(make('홍보비:0원')),'promotionBudget').valueKRW,0);
assert.equal(row(summarize(make('지원금:1인당 50만원')),'supportBudget').status,'not_stated');
assert.equal(row(summarize(make('지원금:1인당 50만원')),'benefit').valueKRW,500000);
assert.equal(row(summarize(make('예산액:100만원')),'planBudget').status,'not_stated');
assert.equal(row(summarize(make('예산액:100만원')),'documentBudget').valueKRW,1000000);
assert.equal(row(summarize(make('지원금:50천원×100명(50%)')),'supportBudget').status,'not_stated');
assert.equal(g.checks[0].status,'matched');assert.equal(summarize(make(gijang.replace('10,500,000','10,600,000'))).checks[0].status,'mismatch');
assert.equal(row(summarize(make(yeongdo,{evidenceScope:'attachment_reference'})),'supportBudget').status,'not_stated');
assert.equal(row(summarize(make('타 지자체 참고\n지원금:50천원×100회')),'supportBudget').status,'not_stated');
const partial=make('본문');partial[0].source.scanComplete=false;assert.equal(row(summarize(partial),'promotionBudget').display,'읽은 범위 별도 표기 없음');
const direct=require('./presentation').present('read_open_document',{status:'read',title:'2026년 계획',institution:'테스트시',url:'https://a.go.kr/plan',source:make(gijang)[0].source});assert.equal(row(direct.presentation.financialSummary,'planBudget').valueKRW,10500000);assert(direct.source.pages.length);
const r={status:'read',attempts:make(yeongdo)};assert.deepEqual(requestedGaps(r,'사업비 구성과 홍보비'),['promotionBudget']);
const quote='사업비: 5,000천원',source={sourceId:'budget',url:'https://a.go.kr/plan',checkedAt:'2026-10-23',pages:[{page:1,text:quote}]};
require('./discovery').withSources(new Map([['budget',source]]),()=>{
 const b=require('./discovery').brief({cases:['가시','나시'].map(region=>({region,name:'지원 계획',fields:{budget:{sourceId:'budget',quote,page:1}}}))});
 assert.equal(b.cases[0].financialSummary.scope,'selected_budget_quote_only');assert.equal(row(b.cases[0].financialSummary,'planBudget').valueKRW,5000000);
});
console.log('PASS: normalized headings, exact monetary units, anchored support arithmetic, explicit versus calculated values, redaction, missing versus zero, direct-read integration');
