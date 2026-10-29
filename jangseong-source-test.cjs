const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const repo=__dirname,tmp=fs.mkdtempSync(path.join(os.tmpdir(),'jangseong-source-test-'));
try {
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json']){const src=path.join(repo,file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(tmp,file));}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz'))));assert.equal(data.rows.filter(([i])=>data.contexts[i].institution==='장성군').length,1492);
 const result=require(path.join(tmp,'budget-search')).search({q:'청년부부 결혼축하금',institution:'장성군'});assert.equal(result.totalCandidateRows,1);const row=result.items[0];assert.equal(row.department,'인구경제실');assert.equal(row.budget,78000);assert.equal(row.previous,148000);assert.equal(row.delta,-70000);assert.equal(row.page,2);assert.equal(row.source,'https://www.jangseong.go.kr/download/finance/2026/primary/167.pdf');
 console.log('PASS: 장성군 사업 검색·편성액·PDF 페이지 출처');
}finally {fs.rmSync(tmp,{recursive:true,force:true});}
