const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'daegu-buk-source-test-'));
try{
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json']){
  const src=path.join(__dirname,file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(tmp,file));
 }
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz'))));
 const rows=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-6f5ddb540e'&&data.contexts[i].department==='의회사무국');
 assert.equal(rows.length,11);assert.equal(rows.reduce((sum,[,r])=>sum+r.budget,0),4357500);
 assert(rows.every(([i,r])=>r.budget-r.previous===r.delta&&data.contexts[i].institutionAggregateVerified===false&&data.contexts[i].limitation.includes('0원 사업 누락 가능')));
 const partial=data.scope.partialInstitutionCoverage['대구광역시 북구'];assert.equal(partial.status,'partial');assert.equal(partial.verifiedDepartments,15);assert.equal(partial.budgetRows,315);
 const search=require(path.join(tmp,'budget-search')).search;
 const result=search({q:'의정활동 홍보',institution:'대구 북구'});
 assert.equal(result.totalCandidateRows,1);assert.equal(result.items[0].budget,67300);assert.equal(result.items[0].previous,50300);assert.equal(result.items[0].page,1);
 assert.equal(result.items[0].source,'https://www.buk.daegu.kr/cmsh/buk.daegu.kr/file/budget_2026_1/14.pdf');
 assert(result.items[0].limitation.includes('15개 부서'));assert.equal(result.scope.partialInstitutionCoverage['대구광역시 북구'].status,'partial');
 assert.equal(search({q:'의정활동 홍보',institution:'부산 북구'}).items.some(r=>r.institutionId==='gov-6f5ddb540e'),false);
 console.log('PASS: 대구 북구 의회사무국 부분 범위·11행 합계·출처·지역 구분');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
