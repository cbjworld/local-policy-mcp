const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'budget-data.json.gz'))));
const rows=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-268aa4681e'&&data.contexts[i].department==='생연2동');
assert.equal(rows.length,8);assert.equal(rows.reduce((n,[,r])=>n+r.budget,0),362816);assert.equal(rows.reduce((n,[,r])=>n+r.previous,0),364316);
assert(rows.every(([i,r])=>r.budget-r.previous===r.delta&&r.page&&data.contexts[i].institutionAggregateVerified===false));
const partial=data.scope.partialInstitutionCoverage['동두천시'];assert.equal(partial.verifiedDepartments,7);assert.equal(partial.budgetRows,53);
const row=rows[0],c=data.contexts[row[0]],found=require('./budget-search').search({q:row[1].name,institution:'동두천시'}).items.find(x=>x.department==='생연2동'&&x.name===row[1].name);
assert(found);assert.equal(found.budget,row[1].budget);assert.equal(found.page,row[1].page);assert.equal(found.source,c.source);
console.log('PASS: 동두천시 생연2동 8행·금액·부분 범위·원문');
