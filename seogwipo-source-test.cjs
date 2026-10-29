const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'seogwipo-source-test-'));
try{
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json']){const src=path.join(__dirname,file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(tmp,file));}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz'))));
 const rows=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-7534e9a618');
 assert.equal(rows.length,1176);assert.equal(new Set(rows.map(([i])=>data.contexts[i].department)).size,47);
 assert.equal(rows.reduce((n,[,r])=>n+r.budget,0),859293340);
 assert(rows.every(([i,r])=>r.budget-r.previous===r.delta&&r.page&&data.contexts[i].account==='일반회계'&&data.contexts[i].institutionAggregateVerified===false));
 const scope=data.scope.partialInstitutionCoverage['서귀포시'];assert.equal(scope.verifiedDepartments,47);assert.equal(scope.unverifiedDepartments,10);assert.equal(scope.budgetRows,1176);
 const result=require(path.join(tmp,'budget-search')).search({q:'산후조리비',institution:'서귀포시'});
 const a=result.items.find(x=>x.department==='서귀포시보건행정과');assert(a);assert.equal(a.budget,100000);assert.equal(a.page,497);assert.match(a.limitation,/행정시/);assert.match(a.limitation,/중복 합산 금지/);
 const b=result.items.find(x=>x.department==='서귀포시동부보건소');assert(b);assert.equal(b.budget,22000);assert.equal(b.page,550);assert.equal(new URL(b.source).hostname,'www.jeju.go.kr');
 console.log('PASS: 서귀포시 47개 부서 일반회계 합계·부분 수록·원문');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
