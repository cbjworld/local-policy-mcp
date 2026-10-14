const assert=require('node:assert/strict'),{classify,screen}=require('./relevance');
for(const [title,expected] of [['반려동물복지센터 개소식 계획(안)','ceremony'],['반려동물 보호 및 학대방지 조례 일부개정 계획','legal'],['취약계층 반려동물 의료비 지원사업 추진계획','project_candidate'],['반려동물 문화축제 운영계획','project_candidate'],['청년 월세 지원금 지급','administration'],['반려동물 현황','unclassified']])assert.equal(classify(title).kind,expected);
const r={items:['반려동물복지센터 개소식 계획','반려동물 지원사업 계획','반려동물 현황'].map(title=>({title})),total:30};
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
