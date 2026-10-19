const assert=require('node:assert/strict'),{classify,screen}=require('./relevance');
for(const title of ['2026년 직원 대상포진·독감 예방접종 지원 계획','공무원 건강검진 지원 계획','교직원 후생복지 지원계획']){
 assert.equal(screen({q:'대상포진 예방접종',items:[{title}]}).items.length,0);
 assert.equal(screen({q:'대상포진 예방접종',items:[{title}]},'documents').items.length,1);
}
assert.equal(classify('2026년 직원 대상포진·독감 예방접종 지원 계획','직원 대상포진').kind,'project_candidate');
assert.equal(classify('65세 이상 주민 대상포진 예방접종 지원계획','대상포진').kind,'project_candidate');
for(const [title,expected] of [['반려동물복지센터 개소식 계획(안)','ceremony'],['반려동물 보호 및 학대방지 조례 일부개정 계획','legal'],['취약계층 반려동물 의료비 지원사업 추진계획','project_candidate'],['반려동물 문화축제 운영계획','project_candidate'],['청년 월세 지원금 지급','administration'],['반려동물 현황','unclassified']])assert.equal(classify(title).kind,expected);
const r={items:['반려동물복지센터 개소식 계획','반려동물 지원사업 계획','반려동물 현황'].map(title=>({title})),total:30};
assert.equal(screen({q:'울산 산후조리비',items:[{title:'2026년 산후조리비 지원계획',institution:'울산광역시 중구'}]}).items.length,1);
assert.equal(screen({q:'울산 산후조리비',items:[{title:'2026년 산후조리비 지원계획',institution:'부산광역시'}]}).items.length,0);
assert.equal(classify('어르신 일자리사업 참여자 인권교육 추진계획','어르신 일자리').kind,'administration');
assert.equal(classify('어르신 일자리사업 참여자 인권교육 추진계획','어르신 인권교육').kind,'project_candidate');
for(const title of ['반려동물 놀이터 운영 기간제 채용계획','반려동물 축제 시간외근무 확대 계획','설계용역 착수보고회 개최계획'])assert.equal(classify(title).kind,'administration');
for(const title of ['병원동행 서비스 전달식 추진계획','소상공인 지원 위원회 구성 운영계획','스마트경로당 제안서평가위원회 위원 모집 공고','스마트 경로당 방문 인사 추진계획'])assert.notEqual(classify(title).kind,'project_candidate');
for(const title of ['폭염 대책 추진계획','소상공인 특별보증 융자 지원사업 추진계획','청년 월세지원 사업 예산편성 계획'])assert.equal(classify(title).kind,'project_candidate');
assert.equal(screen(r).items.length,1);assert.equal(screen(r).reviewItems.length,1);assert.equal(screen(r).relatedDocuments.length,1);assert.equal(screen(r,'documents').items.length,3);
console.log('PASS: ceremony, legal, payment excluded; service/festival retained; uncertain and raw views preserved');
const focused=screen({q:'청년 AI 구독료 지원',items:[{title:'청년 AI 구독료 지원사업'},{title:'생성형 AI 업무지원 서비스 운영 계획'},{title:'청년 생성형 AI 구독료 지원사업 추진계획'}]});
assert.equal(focused.items.length,2);assert.equal(focused.reviewItems.length,1);

assert.equal(classify('2025년 아동급식 지원사업 시비보조금 집행잔액 및 발생이자 반납').kind,'administration');
const auxiliary=[
 '2027년 청년 AI구독료 지원사업 현황조사 결과 제출',
 '2027년 청년 AI 구독료 지원사업 현황 제출',
 '국민신문고 국민제안에 대한 검토 보고(부산 재직 청년 생성형 AI 구독료 지원)',
 '청년정책 업무 추진을 위한 AI 구독료 지급 건의',
 '청년 생성형 AI 구독료 지원사업 모집에 따른 통합접수시스템 이용 협조 요청',
 '2026년 청년 생성형 AI 구독료 지원사업 홍보 협조 요청',
 '청년 생성형 AI 구독료 지원사업 홍보물 제작',
 '청년 생성형 AI 구독료 지원사업 보도자료 송부'
];
const filtered=screen({q:'청년 AI 구독료',items:auxiliary.map(title=>({title}))});
assert.equal(filtered.items.length,0);assert.equal(filtered.relatedDocuments.length,auxiliary.length);
assert.equal(screen({q:'청년 AI 구독료',items:auxiliary.map(title=>({title}))},'documents').items.length,auxiliary.length);
const {bundle}=require('./project-bundles');
for(const title of ['2027년 청년 AI 구독료 지원사업 추진 계획','청년 생성형 AI 구독료 지원사업 공고']){
 const doc={title,institution:'테스트시',url:'https://example.go.kr/plan'};
 const p=bundle(screen({q:'청년 AI 구독료',items:[doc]}).items,[{candidate:doc,result:{status:'no_available_attachment'}}])[0];
 assert.equal(p.existence.status,'title_inferred');assert.equal(p.fields.budget.status,'unconfirmed');
}
console.log('PASS: survey and internal notices remain supporting documents; unreadable plans still imply existence');

assert.equal(require('./relevance').documentRole('사업비 예탁 건의'),'allocation_or_deposit');
assert.equal(require('./relevance').documentRole('보조금 교부결정'),'allocation_or_deposit');
assert.equal(require('./relevance').documentRole('사업 집행실적 및 정산'),'execution_or_settlement');
assert.equal(require('./relevance').documentRole('추경 예산 편성'),'budget');
const {targetFit}=require('./relevance');
assert.equal(targetFit('선천성 난청 검사 및 보청기 지원','어르신 보청기').status,'mismatch');
assert.equal(targetFit('노인 주거 지원','청년 주거').status,'mismatch');
assert.equal(targetFit('청각장애인 보청기 지원','어르신 보청기').status,'unspecified');
assert.equal(targetFit('공항소음지역 난청자 지원','어르신 보청기').status,'unspecified');
assert.equal(targetFit('어르신과 아동 공동 지원','어르신 지원').status,'match');
assert.equal(targetFit('보청기 지원','보청기').status,'unspecified');
