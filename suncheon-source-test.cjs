const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const repo=__dirname,tmp=fs.mkdtempSync(path.join(os.tmpdir(),'suncheon-source-test-'));
try {
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json']){const src=path.join(repo,file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(tmp,file));}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz'))));assert.equal(data.rows.filter(([i])=>data.contexts[i].institution==='순천시').length,2104);
 const result=require(path.join(tmp,'budget-search')).search({q:'출산장려정책사업',institution:'순천시'});assert.equal(result.totalCandidateRows,1);const row=result.items[0];assert.equal(row.department,'보육아동과');assert.equal(row.budget,7790136);assert.equal(row.previous,8069180);assert.equal(row.delta,-279044);assert.equal(row.page,34);assert.equal(row.source,'https://www.suncheon.go.kr/kr/down/news/news_2026_1/t28.pdf');
 console.log('PASS: 순천시 사업 검색·편성액·PDF 페이지 출처');
}finally {fs.rmSync(tmp,{recursive:true,force:true});}

