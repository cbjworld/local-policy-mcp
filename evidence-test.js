const assert=require('node:assert/strict'),{evidence}=require('./evidence'),{research}=require('./open-portal');
const make=text=>[{status:'read',source:{sourceId:'s',url:'https://example.go.kr/a',pages:[{page:1,text}]}}];
for(const [text,key,expected] of [
 ['지원내용\n․ 생백신 1회 (3.5만원 지원 / 본인부담금 5만원)\n․ 사백신 2회 (10만원 지원 / 본인부담금 26만원)\n❍ 소요예산: 102,350천원','activity','사백신 2회'],
 ['접종대상 및 비용: 완도군에 주민등록을 두고 1년 이상 거주 65세 이상 군민\n구 분 약독화 생백신 재조합 백신\n비 용 무료 본인부담금 280천원\n소요예산: 47,000천원','target','65세 이상'],
 ['접종대상 및 비용: 완도군에 주민등록을 두고 1년 이상 거주 65세 이상 군민\n구 분 약독화 생백신 재조합 백신\n비 용 무료 본인부담금 280천원\n소요예산: 47,000천원','activity','280천원'],
 ['지원방법 : 신청인이 기 납부한 보증료의 전부 또는 일부(최대 40만원)를\n신청인 본인 계좌로 이체\n신청기간 : 연중(사업비 소진 시까지)','activity','본인 계좌로 이체'],
 ['신청기간 : 연중(사업비 소진 시까지)','period','연중']
]){
 const entries=evidence(make(text)).fields[key].excerpts;
 assert(entries.some(x=>x.quote.includes(expected)),key+': '+expected);
 for(const x of entries){assert(text.includes(x.quote));if(key==='activity')assert(!x.quote.includes('소요예산:'));}
}
assert.equal(evidence(make('지원내용을 검토할 예정')).fields.activity.status,'unconfirmed');
const a=make('사업기간: 2027. 3.~11.\n지원대상: 미취업 청년\n지원내용: 구독료 지원\n소요예산: 30,000천원(구비)');
const e=evidence(a);assert.equal(e.fields.budget.status,'needs_review');assert.equal(e.fields.target.status,'needs_review');
const grant=evidence(make('금회 교부결정내역 : 940,500,000**원(금구억사천오십만원)**'));
assert.equal(grant.fields.budget.status,'needs_review');
assert.match(grant.fields.budget.excerpts[0].quote,/금회 교부결정내역/);
const tableOnly=evidence(make('(단위 : 천원)\n| 구군명 | 예산액 | 기교부액 | 금회교부액 | 교부잔액 |\n| --- | --- | --- | --- | --- |\n| 합 계 | 100 | 20 | 50 | 30 |'));
assert.equal(tableOnly.fields.budget.status,'needs_review');
assert(tableOnly.fields.budget.excerpts.some(e=>e.sectionTitle==='재원·교부 표'&&e.unit==='천원'));
for(const f of Object.values(e.fields))for(const x of f.excerpts)assert(a[0].source.pages[0].text.includes(x.quote));
assert.equal(evidence(make('소요예산: *****\n사업기간: 2027년')).fields.budget.status,'redacted');
assert.equal(evidence(make('소요예산: 미정\n참여인원: 300명')).fields.budget.status,'unconfirmed');
assert.equal(evidence(make('사 업 비 : 155백만원 지원대상: 240명')).fields.budget.status,'needs_review');
assert.equal(evidence([{...a[0],assessment:'form_or_cover'}]).fields.budget.status,'unconfirmed');
research({url:'test',requestedQuery:'어르신 일자리'},async()=>({title:'어르신 일자리사업 참여자 인권교육 추진계획',attachments:[]})).then(r=>{assert.equal(r.relevanceStatus,'supporting_document');console.log('PASS: exact excerpts, masked/absent budget, spaced PDF label, forms excluded, query carried to research');}).catch(e=>{console.error(e);process.exitCode=1});

assert.equal(evidence(make('예 산 액: 금7,505,000천원(도비 2,607,000, 시비 4,898,000)')).fields.budget.status,'needs_review');

assert.equal(evidence(make('사 업 예 산 : 840백 만 원 (도 비 100%)')).fields.budget.excerpts[0].status,'evidence_candidate');
assert.equal(evidence(make('소요예산 '+String.raw`\*\*\*\*`)).fields.budget.status,'redacted');
assert.equal(evidence(make('소요예산 *****')).fields.budget.status,'redacted');
assert.equal(evidence(make('소요예산을 검토할 예정')).fields.budget.status,'unconfirmed');
