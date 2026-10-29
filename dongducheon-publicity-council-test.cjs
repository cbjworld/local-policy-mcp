const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'budget-data.json.gz'))));
for(const [department,count,total,previous] of [['홍보미래담당관',18,4620323,1777269],['의회사무과',7,1383392,1260485],['시설사업소',3,1055377,954824],['건축과',11,2243630,1647359]]){
 const rows=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-268aa4681e'&&data.contexts[i].department===department);
 assert.equal(rows.length,count);assert.equal(rows.reduce((n,[,r])=>n+r.budget,0),total);assert.equal(rows.reduce((n,[,r])=>n+r.previous,0),previous);
 assert(rows.every(([i,r])=>r.budget-r.previous===r.delta&&r.page&&data.contexts[i].institutionAggregateVerified===false));
 const [i,row]=rows[0],ctx=data.contexts[i],found=require('./budget-search').search({q:row.name,institution:'동두천시'}).items.find(x=>x.department===department&&x.name===row.name);
 assert(found);assert.equal(found.budget,row.budget);assert.equal(found.page,row.page);assert.equal(found.source,ctx.source);assert.match(found.limitation,/미수록/);
 if(department==='건축과')assert.match(found.limitation,/전년도액 합계/);
}
const scope=data.scope.partialInstitutionCoverage['동두천시'];assert.equal(scope.verifiedDepartments,13);assert.equal(scope.budgetRows,189);assert.equal(scope.unverifiedDepartments,23);
const coverage=JSON.parse(fs.readFileSync(path.join(__dirname,'validation/dongducheon-2026-coverage.json')));
const listed=Object.values(coverage.groups).flat(),indexed=new Set(data.contexts.filter(x=>x.institutionId==='gov-268aa4681e').map(x=>x.department));
assert.equal(listed.length,36);assert.equal(coverage.indexedDepartments,13);assert.equal(coverage.remainingDepartments,23);
assert(listed.every(x=>(x.status==='indexed')===indexed.has(x.department)));
console.log('PASS: 동두천 홍보·의회·시설·건축 39행, 총괄·원문·부분 범위');
