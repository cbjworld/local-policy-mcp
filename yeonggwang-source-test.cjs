const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const repo=__dirname,tmp=fs.mkdtempSync(path.join(os.tmpdir(),'yeonggwang-source-test-'));
try {
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json']){const src=path.join(repo,file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(tmp,file));}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz'))));assert.equal(data.rows.filter(([i])=>data.contexts[i].institution==='영광군').length,1705);
 const result=require(path.join(tmp,'budget-search')).search({q:'영광사랑 출산축하용품',institution:'영광군'});assert.equal(result.totalCandidateRows,1);const row=result.items[0];assert.equal(row.department,'인구교육정책실');assert.equal(row.budget,120000);assert.equal(row.previous,120000);assert.equal(row.delta,0);assert.equal(row.page,10);assert.ok(row.source.startsWith('https://www.yeonggwang.go.kr/widget/widget/get_download?real_file=/data/web/yesan/2026/bon/11-3.pdf&'));
 console.log('PASS: 영광군 사업 검색·편성액·PDF 페이지 출처');
}finally {fs.rmSync(tmp,{recursive:true,force:true});}

