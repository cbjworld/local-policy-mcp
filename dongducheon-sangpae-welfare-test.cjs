const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'budget-data.json.gz'))));
const cases=[['상패동',7,349332],['복지정책과',90,58238234]];
for(const [department,count,total] of cases){
 const rows=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-268aa4681e'&&data.contexts[i].department===department);
 assert.equal(rows.length,count);assert.equal(rows.reduce((n,[,r])=>n+r.budget,0),total);
 assert(rows.every(([i,r])=>r.budget-r.previous===r.delta&&r.page&&data.contexts[i].institutionAggregateVerified===false));
 const search=require('./budget-search').search, [i,row]=rows[0],context=data.contexts[i];
 const hit=search({q:row.name,institution:'동두천시'}).items.find(x=>x.department===department&&x.name===row.name);
 assert(hit);assert.equal(hit.budget,row.budget);assert.equal(hit.page,row.page);assert.equal(hit.source,context.source);assert.match(hit.limitation,/8개 동/);
 if(department==='상패동')assert.equal(rows.reduce((n,[,r])=>n+r.previous,0),304052);
 if(department==='복지정책과'){assert.equal(rows.reduce((n,[,r])=>n+r.previous,0),55198925);assert.match(hit.limitation,/전년도액 합계/);}
}
const hit=require('./budget-search').search({q:'청년월세 지원사업',institution:'동두천시'}).items.find(x=>x.department==='복지정책과');
assert(hit);assert.equal(hit.budget,306948);assert.equal(hit.page,6);assert.match(hit.limitation,/8개 동/);
const late=require('./budget-search').search({q:'자활성공지원금 지원',institution:'동두천시'}).items.find(x=>x.department==='복지정책과');assert(late);assert.equal(late.budget,3700);assert.equal(late.page,9);
const scope=data.scope.partialInstitutionCoverage['동두천시'];assert.equal(scope.verifiedDepartments,13);assert.equal(scope.budgetRows,189);
console.log('PASS: 동두천 상패동·복지정책과 97행과 출처·수록 범위');
