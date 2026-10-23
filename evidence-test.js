const assert=require('node:assert/strict'),{evidence}=require('./evidence'),{research}=require('./open-portal');
const make=text=>[{status:'read',source:{sourceId:'s',url:'https://example.go.kr/a',pages:[{page:1,text}]}}];
const deliveryText='지원대상: 저소득 주민 200명\n신청자격: 검진장비와 전문인력을 갖춘 의료기관\n사업내용: 건강검진 제공';
const delivery=evidence(make(deliveryText));
assert.equal(delivery.fields.target.excerpts.length,1);
assert(delivery.fields.target.excerpts[0].quote.includes('저소득 주민'));
assert.equal(delivery.deliveryQualifications.length,1);
assert(deliveryText.includes(delivery.deliveryQualifications[0].quote));
const procurement='신청자격) 공공기관, 지방공사·공단, 주무관청의 허가 등을 받아 설립된 법인 등 「지방계약법 시행령」제6조에서 정하는 전문기관';
const providerOnly=evidence(make(procurement));
assert.equal(providerOnly.fields.target.status,'unconfirmed');
assert.equal(providerOnly.deliveryQualifications[0].quote,procurement);
for(const text of ['신청자격: 관내 주소를 둔 세대','신청자격: 지역 중소기업 및 소상공인','지원대상: 지역 의료기관 시설개선 지원']){
 const result=evidence(make(text));assert.equal(result.deliveryQualifications.length,0);assert.equal(result.fields.target.status,'needs_review');
}
const view=require('./presentation').documentView({status:'read',evidence:providerOnly,attempts:make(procurement)});
assert.equal(view.fields.find(f=>f.key==='target').state,'미확인');
assert.equal(view.fields.find(f=>f.key==='target').deliveryQualifications[0].quote,procurement);
const digest=require('./research-brief')([{id:'d1',classification:'project_candidate',readingStatus:'read',reading:view}]);
assert.equal(digest[0].fields.target.quote,undefined);
assert.equal(digest[0].fields.target.deliveryQualifications[0].quote,procurement);
assert(require('./policy-followup').missingFields({status:'read',evidence:providerOnly}).includes('target'));
for(const [text,key,expected] of [
 ['지원내용\n․ 생백신 1회 (3.5만원 지원 / 본인부담금 5만원)\n․ 사백신 2회 (10만원 지원 / 본인부담금 26만원)\n❍ 소요예산: 102,350천원','activity','사백신 2회'],
 ['지원대상 : 65세 이상 시민 - 지원내용 ․ 생백신 1회 (3.5만원 지원) ․ 사백신 2회 (10만원 지원) ❍ 소요예산: 102,350천원','activity','사백신 2회'],
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
assert.equal(evidence(make('사업개요\n사업기간:2026년\n소요예산:500만원')).fields.activity.status,'unconfirmed');
assert.equal(evidence(make('지원내용: ○')).fields.activity.status,'unconfirmed');
const grantActivity='사업내용 : 농작물재해보험 가입 농가 보험료 일부 지원\n\n※ 전체 사업목적 및 사업별 핵심 내용을 기술\n\n2. 위의 교부결정에도 불구하고 교부결정을 취소할 수 있습니다.';
const activityQuote=evidence(make(grantActivity)).fields.activity.excerpts[0].quote;
assert.equal(activityQuote.trim(),'사업내용 : 농작물재해보험 가입 농가 보험료 일부 지원');
assert(grantActivity.includes(activityQuote));
const legalBoundary=evidence(make('사업내용: 보험료 지원\n2. 위의 교부결정에도 불구하고 보조금 교부를 취소할 수 있습니다.')).fields.activity.excerpts[0].quote;
assert(!legalBoundary.includes('교부결정'));
assert(evidence(make('지원내용: 보험료 지원\n※ 자부담 20%는 신청 농가 부담\n2. 추가 지원은 다음 달 신청')).fields.activity.excerpts[0].quote.includes('자부담 20%'));
assert.equal(evidence(make('소요예산\n*****')).fields.budget.status,'redacted');
assert.equal(evidence(make('사업비\n: 1,200천원')).fields.budget.status,'needs_review');
const infrastructure=evidence(make('사업개요 : LED 바닥신호등 3개소(11개) 설치 사업기간 : 2026. 7.~9. 설치대상 : 학교 앞 3개소'));
assert(infrastructure.fields.activity.excerpts.some(x=>x.quote.includes('11개')));
assert(infrastructure.fields.target.excerpts.some(x=>x.quote.includes('학교 앞')));
const its=evidence(make('추진대상: 2개소(삼척초등학교, 진주초등학교) 추진내용: 어린이보호구역 스마트횡단보도 구축 소요예산: 130,000,000원'));
assert(its.fields.target.excerpts.some(x=>x.quote.includes('진주초등학교')));
assert(its.fields.activity.excerpts.some(x=>x.quote.includes('스마트횡단보도')));
const rate=evidence(make('지원금액:구입금액의50% 지원한도:최대50만원 사업기간:2026년'));
assert(rate.fields.activity.excerpts.some(x=>x.quote.includes('50%')&&x.quote.includes('50만원')));
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

const commissioned=evidence(make('신청자격 : 주사무소가 광주에 소재하고 취업지원분야 사업위탁 추진 실적이 있으며 사업을 지속적으로 관리·운영 가능한 법인 또는 단체'));
assert.equal(commissioned.fields.target.status,'unconfirmed');assert.equal(commissioned.deliveryQualifications.length,1);
