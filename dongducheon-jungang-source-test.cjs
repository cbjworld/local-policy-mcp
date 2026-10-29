const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'budget-data.json.gz'))));
const rows=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-268aa4681e'&&data.contexts[i].department==='중앙동');
assert.equal(rows.length,7);assert.equal(rows.reduce((n,[,r])=>n+r.budget,0),300377);assert.equal(rows.reduce((n,[,r])=>n+r.previous,0),298828);
assert(rows.every(([i,r])=>r.budget-r.previous===r.delta&&r.page&&data.contexts[i].institutionAggregateVerified===false));
assert.equal(data.scope.partialInstitutionCoverage['동두천시'].budgetRows,53);
const row=rows[0],c=data.contexts[row[0]],found=require('./budget-search').search({q:row[1].name,institution:'동두천시'}).items.find(x=>x.department==='중앙동'&&x.name===row[1].name);
assert(found);assert.equal(found.budget,row[1].budget);assert.equal(found.page,row[1].page);assert.equal(found.source,c.source);assert.match(found.limitation,/전년도액 합계/);
console.log('PASS: 동두천시 중앙동 7행·금액·전년도 범위·원문');
