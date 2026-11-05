const budget=require('./budget-search');
const homepage=require('./municipal-homepage-search.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
function baseName(value){return normalize(value).replace(/(?:지원사업|지원|사업)$/,'')}
function link({q,institution,websiteOffset=0,budgetOffset=0,pairOffset=0}={},deps={budget,homepage}){
 if(institution!==undefined&&(typeof institution!=='string'||!institution.trim()))throw Error('지자체를 확인하세요.');
 if(![websiteOffset,budgetOffset,pairOffset].every(x=>Number.isInteger(x)&&x>=0))throw Error('결과 범위를 확인하세요.');
 const b=deps.budget.search({q,institution,limit:20,offset:budgetOffset}),h=deps.homepage.search({q,institution,limit:20,offset:websiteOffset});
 const pairs=[];
 for(const web of h.items)for(const row of b.items){
  if(!normalize(web.parent)||!normalize(row.parent)||!normalize(web.institution)||!normalize(row.institution)||normalize(web.parent)!==normalize(row.parent)||normalize(web.institution)!==normalize(row.institution))continue;
  const a=baseName(web.name),c=baseName(row.name);
  const exact=normalize(web.name).length>=6&&normalize(web.name)===normalize(row.name);
  const sameBase=a.length>=4&&a===c;
  if(!exact&&!sameBase&&(a.length<6||c.length<6||(!a.includes(c)&&!c.includes(a))))continue;
  pairs.push({relationship:'same_name_region_candidate',homepage:web,budget:row,note:'이름과 지자체가 일치하는 연결 후보입니다. 회계연도·사업 범위와 동일 여부를 원문에서 확인하세요. 예산액은 지원 단가나 집행액이 아닙니다.'});
 }
 return {query:q,institution:institution??null,pairs:pairs.slice(pairOffset,pairOffset+20),candidatePairCount:pairs.length,pairOffset,nextPairOffset:pairOffset+20<pairs.length?pairOffset+20:null,pairsTruncated:pairs.length>20,website:{total:h.total,offset:websiteOffset,nextOffset:h.nextOffset,coverage:{totalSources:h.scope?.totalSources??null,totalInstitutions:h.scope?.totalInstitutions??null,skippedEntries:h.scope?.skippedEntries??null,description:h.scope?.coverage??null}},budget:{totalCandidateRows:b.totalCandidateRows,offset:budgetOffset,nextOffset:b.nextOffset,scope:b.scope},note:'지정한 홈페이지·예산 각 20건의 조합을 대조한 후보입니다. 같은 두 쪽에 남은 후보는 nextPairOffset으로, 다른 자료 쪽은 websiteOffset과 budgetOffset의 모든 조합을 바꿔 확인하세요. 여러 예산행을 별도 사업으로 세거나 합산하지 마세요. 누락된 자료나 현행 시행 여부는 이 결과만으로 판단할 수 없습니다.'};
}
function fingerprint(){
 const catalog=process.env.POLICY_MUNICIPAL_CATALOG;if(!catalog)throw Error('홈페이지 사업자료가 설정되지 않았습니다.');
 const index=path.join(__dirname,'budget-search.sqlite'),budgetFile=fs.existsSync(index)?index:path.join(__dirname,'budget-data.json.gz'),stat=fs.statSync(budgetFile);
 return crypto.createHash('sha256').update(fs.readFileSync(catalog)).update(JSON.stringify({size:stat.size,mtimeMs:stat.mtimeMs})).digest('hex');
}
function linkAuto({q,institution,cursor,maxComparisons=10}={},deps={budget,homepage},snapshot=fingerprint){
 if(!Number.isInteger(maxComparisons)||maxComparisons<1||maxComparisons>20)throw Error('한 번에 대조할 쪽 수를 확인하세요.');
 const version=snapshot();
 if(cursor!==undefined&&cursor!==null&&(typeof cursor!=='object'||Array.isArray(cursor)||cursor.q!==q||(cursor.institution??null)!==(institution??null)||cursor.version!==version))throw Error('검색어나 자료가 변경되어 이어볼 수 없습니다. 처음부터 다시 검색하세요.');
 let pos=cursor?{websiteOffset:cursor.websiteOffset,budgetOffset:cursor.budgetOffset,pairOffset:cursor.pairOffset}:{websiteOffset:0,budgetOffset:0,pairOffset:0};
 if(![pos.websiteOffset,pos.budgetOffset,pos.pairOffset].every(v=>Number.isInteger(v)&&v>=0))throw Error('이어보기 위치를 확인하세요.');
 const cache=service=>{const values=new Map();return {search(args){const key=JSON.stringify(args);if(!values.has(key))values.set(key,service.search(args));return values.get(key)}}};
 const batched={budget:cache(deps.budget),homepage:cache(deps.homepage)};
 let comparisons=0,pairs=[],last=null,complete=false;
 while(comparisons<maxComparisons&&pairs.length<20){
  const result=link({q,institution,...pos},batched);comparisons++;last=result;
  if(result.website.total===0||result.budget.totalCandidateRows===0){complete=true;break;}
  const take=Math.min(20-pairs.length,result.pairs.length);pairs.push(...result.pairs.slice(0,take));
  if(take<result.pairs.length)pos={...pos,pairOffset:pos.pairOffset+take};
  else if(result.nextPairOffset!==null)pos={...pos,pairOffset:result.nextPairOffset};
  else if(result.budget.nextOffset!==null)pos={...pos,budgetOffset:result.budget.nextOffset,pairOffset:0};
  else if(result.website.nextOffset!==null)pos={websiteOffset:result.website.nextOffset,budgetOffset:0,pairOffset:0};
  else{complete=true;break;}
 }
 if(snapshot()!==version)throw Error('대조 중 자료가 변경되었습니다. 처음부터 다시 검색하세요.');
 const scope=last.budget.scope||{};
 return {query:q,institution:institution??null,pairs,comparisons,complete,completionScope:'수록된 홈페이지와 예산 자료의 검색 결과 대조 범위',cursor:complete?null:{q,...(institution!==undefined?{institution}:{}),version,...pos},websiteTotal:last.website.total,websiteCoverage:last.website.coverage,budgetTotalCandidateRows:last.budget.totalCandidateRows,budgetCoverage:{year:scope.year??null,account:scope.account??null,nationwideComplete:scope.nationwideComplete??null,collectedDate:scope.collectedDate??null,listedInstitutions:Array.isArray(scope.institutions)?scope.institutions.length:null,partialCoverageListed:scope.partialInstitutionCoverage?Object.keys(scope.partialInstitutionCoverage).length>0:null},note:'같은 이름과 지자체의 연결 후보이며 상위 지자체가 확인되지 않으면 연결하지 않습니다. 원문·연도·사업 범위를 확인하고 여러 예산행을 사업 수로 세거나 합산하지 마세요. 미완료면 같은 질문과 cursor로 이어서 호출하세요.'};
}
module.exports={link,linkAuto};
