const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'daegu-buk-audit-test-'));
try{
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json']){const src=path.join(__dirname,file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(tmp,file));}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz'))));
 const rows=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-6f5ddb540e'&&data.contexts[i].department==='감사실');
 assert.equal(rows.length,7);assert.equal(rows.reduce((n,[,r])=>n+r.budget,0),287481);assert.equal(rows.reduce((n,[,r])=>n+r.previous,0),310115);
 assert(rows.every(([i,r])=>r.budget-r.previous===r.delta&&r.page&&data.contexts[i].institutionAggregateVerified===false));
 const result=require(path.join(tmp,'budget-search')).search({q:'부패방지업무추진',institution:'대구 북구'});
 const item=result.items.find(x=>x.department==='감사실');assert(item);assert.equal(item.budget,15420);assert.equal(item.previous,20420);assert.equal(item.page,2);assert.match(item.source,/\/6\.pdf$/);
 assert.match(item.limitation,/2개 부서/);assert.equal(result.scope.partialInstitutionCoverage['대구광역시 북구'].budgetRows,18);
 console.log('PASS: 대구 북구 감사실 7행 합계·부분 범위·출처 확인');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
