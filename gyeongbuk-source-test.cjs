const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gyeongbuk-source-test-'));
try{
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json']){const src=path.join(__dirname,file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(tmp,file));}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz'))));
 const rows=data.rows.filter(([i])=>data.contexts[i].institution==='경상북도');assert.equal(rows.length,76);
 assert(rows.every(([i])=>data.contexts[i].institutionAggregateVerified===false&&data.contexts[i].limitation.includes('전체 부서 확인 미완료')));
 const partial=data.scope.partialInstitutionCoverage['경상북도'];assert.equal(partial.status,'partial');assert.equal(partial.verifiedDepartments,22);assert.equal(partial.budgetRows,76);
 for(const [department,total,previous] of [['APEC준비지원단 기획행사과',376005,432700],['APEC준비지원단 운영지원과',295900,53980],['APEC준비지원단 의전홍보과',544106,4395340],['APEC준비지원단 대외협력과',137580,32480]]){
  const group=rows.filter(([i])=>data.contexts[i].department===department);
  assert.equal(group.length,2);assert.equal(group.reduce((n,[,r])=>n+r.budget,0),total);assert.equal(group.reduce((n,[,r])=>n+r.previous,0),previous);
  assert(group.every(([i,r])=>r.budget-r.previous===r.delta&&r.page>=1&&r.page<=5&&data.contexts[i].account==='일반회계'));
  const [i,row]=group[0],hit=require(path.join(tmp,'budget-search')).search({q:row.name,institution:'경상북도'}).items.find(x=>x.department===department);
  assert(hit);assert.equal(hit.budget,row.budget);assert.equal(hit.page,row.page);assert.equal(hit.source,data.contexts[i].source);
 }
 const police=rows.filter(([i])=>data.contexts[i].department==='자치경찰위원회 자치경찰총괄과');assert.equal(police.length,6);assert.equal(police.reduce((n,[,r])=>n+r.budget,0),3814577);assert.equal(police.reduce((n,[,r])=>n+r.previous,0),1980103);assert(police.every(([i,r])=>r.budget-r.previous===r.delta&&r.page>=1&&r.page<=5&&data.contexts[i].account==='일반회계'));
 const result=require(path.join(tmp,'budget-search')).search({q:'의회운영및교류사업의내실화',institution:'경상북도'});assert.equal(result.totalCandidateRows,1);assert.equal(result.items[0].budget,506640);assert.equal(result.items[0].page,1);assert.equal(result.items[0].source,'https://gb.go.kr/Main/budget/2026/bon/11050002.pdf');assert.equal(result.scope.partialInstitutionCoverage['경상북도'].status,'partial');
 const catalog=require('./policy-catalog').search({q:'의회운영및교류사업의내실화',institution:'경상북도'});assert.equal(catalog.coverage.partialInstitutionCoverage['경상북도'].status,'partial');assert(catalog.items[0].budgetRecords[0].limitation.includes('전체 부서 확인 미완료'));
 console.log('PASS: 경북 일부 22개 부서의 출처·금액·미완료 범위가 예산과 사업 검색에 보존됨');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
