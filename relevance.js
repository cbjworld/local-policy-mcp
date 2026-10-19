function documentRole(title=''){
 const t=title.replace(/\s+/g,'');
 if(/정산|집행실적|지급내역|집행잔액/.test(t))return 'execution_or_settlement';
 if(/교부|예탁|예치금/.test(t))return 'allocation_or_deposit';
 if(/예산|추경/.test(t))return 'budget';
 if(/계획|방침/.test(t))return 'plan';
 return 'other';
}
function targetFit(text='',question=''){
 const groups={older:/어르신|노인|고령자|(?:65|70|75)\s*세\s*이상/,youth:/청년/,child:/영유아|신생아|영아|아동|어린이|선천성\s*난청\s*검사/};
 const requested=Object.keys(groups).filter(k=>groups[k].test(question)),mentioned=Object.keys(groups).filter(k=>groups[k].test(text));
 if(!requested.length||!mentioned.length)return {status:'unspecified',requested,mentioned};
 if(requested.some(k=>mentioned.includes(k)))return {status:'match',requested,mentioned};
 // Only disjoint age groups are rejected. Missing age, disability or geography alone is not a conflict.
 if(requested.includes('older')||mentioned.includes('older'))return {status:'mismatch',requested,mentioned,reason:'질문과 문서에 명시된 연령 대상이 다름'};
 return {status:'unspecified',requested,mentioned};
}
// shortcut: title rules infer existence only; body attribution still needs semantic review.
function classify(title,q=''){
 const t=String(title||'').replace(/\s+/g,'');
 if(/(?:직원|공무원|교직원).*(?:예방접종|건강검진|복지포인트|후생복지)/.test(t)&&!/(?:직원|공무원|교직원)/.test(q))return {kind:'administration',reason:'직원 후생·건강 지원 문서: 주민 대상 사업과 구분',score:-2};
 if(/현황조사|현황(?:자료)?(?:제출|회신)|국민신문고|국민제안|민원.*(?:답변|검토)|업무추진을위한.*구독료|홍보(?:협조|물|자료)|보도자료송부|통합접수시스템.*협조|권한신청서|담당자.*현행화/.test(t))return {kind:'administration',reason:'조사·제안·홍보·내부 처리 자료: 제목만으로 해당 기관의 사업 시행을 판단하지 않음',score:-2};
 if(/참여자|참여단/.test(t)&&/교육/.test(t)&&q&&!/교육/.test(q))return {kind:'administration',reason:'사업 참여자 교육: 요청 사업 자체의 시행계획과 구분',score:-2};
 if(/조례|규칙.*개정|입법예고|자치법규/.test(t))return {kind:'legal',reason:'조례·입법 문서: 사업 시행계획과 구분',score:-3};
 if(/개소식|개관식|준공식|착공식|협약식|전달식/.test(t))return {kind:'ceremony',reason:'기념식·의전 행사 문서',score:-3};
 if(/집행잔액|발생이자.*반납|보조금.*반납|지급내역|지급명단|지원금.*지급|출장|회의개최|위원회.*결과|교육.*입교|채용|시간외근무|포상|공적심사|착수보고회|준공검사|준공검토|지출품의/.test(t))return {kind:'administration',reason:'개별 집행·행정 처리 문서',score:-2};
 if(/표창|입찰|견적제출|발주계획|간담회|성과공유회|협의회.*개최|위원회.*(?:개최|구성|모집)|추진단.*구성|업무협약|정산.*(?:알림|요청)|이관계획|철회|이의신청|합동점검|평가계획|방문인사/.test(t))return {kind:'administration',reason:'사업의 회의·조직·계약·평가 등 보조 절차',score:-2};
 if(/사업|지원|조성|운영|시행|추진|예방접종|축제|실행|대책/.test(t)&&/계획|예산|공모|모집|공고|방침/.test(t))return {kind:'project_candidate',reason:'사업 후보: 대상·내용·예산·기간을 본문에서 확인해야 함',score:/추진계획|시행계획|기본계획|지원계획|운영계획|실시계획/.test(t)?5:3};
 return {kind:'unclassified',reason:'제목만으로 사업 문서인지 판단 불가',score:0};
}
function screen(result,purpose='projects'){
 const anchors=String(result.q||'').split(/\s+/).filter(w=>w&&!['지원','사업','정책','사례'].includes(w));
 const all=result.items.map(x=>{
  let relevance=classify(x.title,result.q);
  const title=String(x.title||'').replace(/\s+/g,'').toLowerCase();
  const context=title+String(x.institution||'').replace(/\s+/g,'').toLowerCase();
  const matches=anchors.every(w=>context.includes(w.toLowerCase()));
  if(anchors.length&&relevance.kind==='project_candidate'&&!matches)relevance={kind:'unclassified',reason:'원래 검색 주제의 일부 핵심어가 제목에서 확인되지 않음: 본문 관련성 추가 확인 필요',score:0};
  if(anchors.length&&matches&&relevance.kind==='unclassified'&&/사업/.test(title))relevance={kind:'project_candidate',reason:'원래 검색 주제와 사업명이 일치하는 후보: 계획서 여부는 본문 확인 필요',score:2};
  return {...x,relevance,documentRole:documentRole(x.title),stageNote:'제목에서 추정한 문서 역할이며 교부·예탁은 실제 집행이나 현재 시행 확정이 아닙니다.'};
 });
 const candidates=all.filter(x=>x.relevance.kind==='project_candidate').sort((a,b)=>b.relevance.score-a.relevance.score);
 return {...result,purpose,totalMeaning:'포털 원시 문서 건수이며 관련 사업 수가 아님',items:purpose==='documents'?all:candidates,
 reviewItems:purpose==='documents'?[]:all.filter(x=>x.relevance.kind==='unclassified'),
 relatedDocuments:purpose==='documents'?[]:all.filter(x=>['legal','ceremony','administration'].includes(x.relevance.kind)),
 guidance:'사업 검색에서는 items도 미검증 후보입니다. reviewItems는 판단 유보, relatedDocuments는 보조자료입니다. 넓은 주제는 후보 제목을 바탕으로 사업 종류를 먼저 제시하세요. 후보가 부족하면 다음 페이지를 최대 3페이지까지 확인하고, 원문에서 요청 사업과의 관련성·지원 대상·실행 내용·예산·기간을 검토하세요. 예산이 없으면 미확인으로 표시하고 읽기 성공을 정책 검색 성공으로 세지 마세요.'};
}
module.exports={classify,screen,documentRole,targetFit};
