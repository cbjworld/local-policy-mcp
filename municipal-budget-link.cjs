const budget=require('./budget-search');
const homepage=require('./municipal-homepage-search.cjs');
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
function baseName(value){return normalize(value).replace(/(?:지원사업|지원|사업)$/,'')}
function link({q,institution,websiteOffset=0,budgetOffset=0,pairOffset=0}={},deps={budget,homepage}){
 if(typeof institution!=='string'||!institution.trim())throw Error('지자체를 지정하세요.');
 if(![websiteOffset,budgetOffset,pairOffset].every(x=>Number.isInteger(x)&&x>=0))throw Error('결과 범위를 확인하세요.');
 const b=deps.budget.search({q,institution,limit:20,offset:budgetOffset}),h=deps.homepage.search({q,institution,limit:20,offset:websiteOffset});
 const pairs=[];
 for(const web of h.items)for(const row of b.items){
  if(normalize(web.parent)!==normalize(row.parent)||normalize(web.institution)!==normalize(row.institution))continue;
  const a=baseName(web.name),c=baseName(row.name);
  const exact=normalize(web.name).length>=6&&normalize(web.name)===normalize(row.name);
  if(!exact&&(a.length<6||c.length<6||(!a.includes(c)&&!c.includes(a))))continue;
  pairs.push({relationship:'same_name_region_candidate',homepage:web,budget:row,note:'이름과 지자체가 일치하는 연결 후보입니다. 회계연도·사업 범위와 동일 여부를 원문에서 확인하세요. 예산액은 지원 단가나 집행액이 아닙니다.'});
 }
 return {query:q,institution,pairs:pairs.slice(pairOffset,pairOffset+20),candidatePairCount:pairs.length,pairOffset,nextPairOffset:pairOffset+20<pairs.length?pairOffset+20:null,pairsTruncated:pairs.length>20,website:{total:h.total,offset:websiteOffset,nextOffset:h.nextOffset},budget:{totalCandidateRows:b.totalCandidateRows,offset:budgetOffset,nextOffset:b.nextOffset,scope:b.scope},note:'지정한 홈페이지·예산 각 20건의 조합을 대조한 후보입니다. 같은 두 쪽에 남은 후보는 nextPairOffset으로, 다른 자료 쪽은 websiteOffset과 budgetOffset의 모든 조합을 바꿔 확인하세요. 여러 예산행을 별도 사업으로 세거나 합산하지 마세요. 누락된 자료나 현행 시행 여부는 이 결과만으로 판단할 수 없습니다.'};
}
module.exports={link};
