const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const repo=__dirname,tmp=fs.mkdtempSync(path.join(os.tmpdir(),'eumseong-source-test-'));
try{
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json']){const src=path.join(repo,file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(tmp,file));}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz'))));assert.equal(data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-a8ce9b3e5e').length,1637);
 const search=require(path.join(tmp,'budget-search')).search;
 const result=search({q:'여성장애인 출산비용 지원',institution:'충북 음성군'});assert.equal(result.totalCandidateRows,1);const row=result.items[0];assert.equal(row.department,'복지정책과');assert.equal(row.budget,2400);assert.equal(row.previous,4800);assert.equal(row.delta,-2400);assert.equal(row.page,28);assert.equal(row.source,'https://www.eumseong.go.kr/DATA/download/cts2063_1/cts2063_1_022.pdf');
 assert.equal(search({q:'고향사랑기금 예치금',institution:'음성군'}).totalCandidateRows,0);assert.equal(search({q:'재난관리기금 전출금',institution:'음성군'}).items[0].budget,1481000);
 console.log('PASS: 음성군 일반회계·특별회계·기금 분리와 사업·PDF 쪽수');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
