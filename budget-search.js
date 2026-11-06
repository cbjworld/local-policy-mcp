const indexed=require('node:fs').existsSync(require('node:path').join(__dirname,'budget-search.sqlite'))?require('./budget-sqlite').open():null;
const data=indexed?null:(()=>{
 const packed=JSON.parse(require('node:zlib').gunzipSync(require('node:fs').readFileSync(require('node:path').join(__dirname,'budget-data.json.gz'))).toString('utf8'));
 if(packed.formatVersion===undefined)return packed;
 if(packed.formatVersion!==1)throw Error('Unsupported budget data format');
 return packed;
})();
const normalize=s=>s.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
// These common shorthand terms often omit words present in official business names.
// Expansions are candidate searches, not a claim that every matching business is identical.
const shorthandTerms={'음식물처리기':['음식물','처리기'],'전세보증료':['전세','보증료']};
const names=indexed?null:data.rows.map(entry=>normalize(data.formatVersion===1?entry[1].name:entry.name));
const enrich=require('./policy-catalog').enrich;
const contexts=indexed?null:(data.formatVersion===1?data.contexts:data.rows).map(r=>enrich(r,__dirname));
function search({q,institution,offset=0,limit=10}={}){
 if(typeof q!=='string'||!q.trim()||q.length>100)throw Error('q must contain 1–100 characters');
 if(institution!==undefined&&(typeof institution!=='string'||!institution.trim()||institution.length>80))throw Error('Invalid institution');
 if(!Number.isInteger(offset)||offset<0||offset>(indexed?indexed.length:data.rows.length)||!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid pagination');
 const inferredInstitution=institution===undefined?require('./region-aliases').inferInstitution(q,require('./catalog-institutions.json').records):null;
 const ambiguousInstitution=institution===undefined?require('./region-aliases').ambiguousInstitution(q,require('./catalog-institutions.json').records):null;
 if(inferredInstitution)institution=inferredInstitution;
 const effectiveQuery=require('./region-aliases').queryWithoutRegion(q,institution);
 const terms=effectiveQuery.trim().split(/\s+/).map(normalize);
 const region=institution?require('./region-aliases').regionTerms(institution).map(normalize):null;
 const regionMatches=indexed||!region?null:contexts.map(entry=>require('./region-aliases').matchesRegion(region,entry));
 function find(searchTerms){
  if(indexed)return indexed.find(searchTerms,region,offset,limit);
  const found=data.rows.filter((entry,i)=>(!regionMatches||regionMatches[data.formatVersion===1?entry[0]:i])&&searchTerms.every(t=>names[i].includes(t)));
  return {total:found.length,items:found.slice(offset,offset+limit).map(entry=>data.formatVersion===1?({...contexts[entry[0]],...entry[1]}):enrich(entry,__dirname))};
 }
 let result=find(terms),expandedTerms;
 if(!result.total&&Object.hasOwn(shorthandTerms,normalize(effectiveQuery))){expandedTerms=shorthandTerms[normalize(effectiveQuery)];result=find(expandedTerms);}
 return {scope:indexed?indexed.scope:data.scope,query:q,...(inferredInstitution?{inferredInstitution}:{}),...(ambiguousInstitution?{ambiguousInstitution}:{}),...(effectiveQuery!==q?{effectiveQuery}:{}),...(expandedTerms?{expandedSearchTerms:expandedTerms,searchNotice:'원래 표현의 일치 결과가 없어 사업명에 각 단어가 들어간 후보로 검색을 넓혔습니다. 사업 내용을 원문으로 확인하세요.'}:{}),totalCandidateRows:result.total,offset,items:result.items,nextOffset:offset+limit<result.total?offset+limit:null,note:'2026 일반회계 세출 사업행 편성액입니다. 새 자료는 사업행 증감 산술과 해당 부서 사업합계가 공식 부서 총액과 일치한 경우만 포함합니다. 원문 링크와 PDF 쪽수 또는 한글 표·행 위치를 제시하세요. 지원금 단가·집행액·현행 시행 여부와 사업명 의미는 별도 확인해야 합니다. 검색 결과 없음은 사업 부재를 뜻하지 않습니다. 계획·대상·집행 확인에는 research_policy를 이어 사용하세요.'};
}
module.exports={search};
