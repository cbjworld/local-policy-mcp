const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'budget-data.json.gz'))));
const expected=[['보산동',7,227366,239908],['불현동',9,593662,586534],['송내동',7,472516,428251],['소요동',8,336478,354286]];
const search=require('./budget-search').search;
for(const [department,count,total,previous] of expected){
 const rows=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-268aa4681e'&&data.contexts[i].department===department);
 assert.equal(rows.length,count);assert.equal(rows.reduce((n,[,r])=>n+r.budget,0),total);assert.equal(rows.reduce((n,[,r])=>n+r.previous,0),previous);
 assert(rows.every(([i,r])=>r.budget-r.previous===r.delta&&r.page&&data.contexts[i].institutionAggregateVerified===false));
 const [i,row]=rows[0],ctx=data.contexts[i],found=search({q:row.name,institution:'동두천시'}).items.find(x=>x.department===department&&x.name===row.name);
 assert(found);assert.equal(found.budget,row.budget);assert.equal(found.page,row.page);assert.equal(found.source,ctx.source);assert.match(found.limitation,/8개 동/);
 if(department==='보산동'||department==='소요동')assert.match(found.limitation,/전년도액 합계/);
}
const scope=data.scope.partialInstitutionCoverage['동두천시'];assert.equal(scope.verifiedDepartments,36);assert.equal(scope.budgetRows,1357);
console.log('PASS: 동두천시 보산·불현·송내·소요 31행, 합계·부분 범위·원문');
