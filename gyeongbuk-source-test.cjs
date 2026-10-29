const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gyeongbuk-source-test-'));
try{
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json']){const src=path.join(__dirname,file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(tmp,file));}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz'))));
 const rows=data.rows.filter(([i])=>data.contexts[i].institution==='경상북도');assert.equal(rows.length,62);
 assert(rows.every(([i])=>data.contexts[i].institutionAggregateVerified===false&&data.contexts[i].limitation.includes('전체 부서 확인 미완료')));
 const partial=data.scope.partialInstitutionCoverage['경상북도'];assert.equal(partial.status,'partial');assert.equal(partial.verifiedDepartments,17);assert.equal(partial.budgetRows,62);
 const result=require(path.join(tmp,'budget-search')).search({q:'의회운영및교류사업의내실화',institution:'경상북도'});assert.equal(result.totalCandidateRows,1);assert.equal(result.items[0].budget,506640);assert.equal(result.items[0].page,1);assert.equal(result.items[0].source,'https://gb.go.kr/Main/budget/2026/bon/11050002.pdf');assert.equal(result.scope.partialInstitutionCoverage['경상북도'].status,'partial');
 const catalog=require('./policy-catalog').search({q:'의회운영및교류사업의내실화',institution:'경상북도'});assert.equal(catalog.coverage.partialInstitutionCoverage['경상북도'].status,'partial');assert(catalog.items[0].budgetRecords[0].limitation.includes('전체 부서 확인 미완료'));
 console.log('PASS: 경북 일부 17개 부서의 출처·금액·미완료 범위가 예산과 사업 검색에 보존됨');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
