const assert=require('node:assert/strict');
const workflow=require('./policy-workflow'),compact=require('./compact-research');
assert.deepEqual(workflow.plan({question:'청년 면접수당 지원 사업 찾아줘'}).queries,['청년 면접수당','청년 면접비','청년 면접활동비']);
assert.deepEqual(workflow.plan({question:'청년 면접비',queries:['별도 표현']}).queries,['별도 표현']);
const candidates=Array.from({length:100},(_,i)=>({institution:'테스트'+i+'시',title:'2026년 청년 면접비 지원사업 계획 '+ '가'.repeat(200),url:'https://www.open.go.kr/document/'+i,relevance:{kind:'project_candidate'}}));
const result=compact({candidates:[...candidates,candidates[0]],investigations:[],projects:[]});
assert(result.responseSize.omittedDocuments>0);
assert.equal(result.institutionDirectory.rows.length,100);
assert.deepEqual(result.institutionDirectory.rows[0].slice(0,3),['테스트0시',1,0]);assert.equal(result.institutionDirectory.rows[0][4],candidates[0].url);
assert(result.institutionDirectory.rows.some(r=>r[0]==='테스트99시'));
assert(JSON.stringify(result).length<=24000);
console.log('PASS: interview wording variants, explicit queries, all producer names survive compact pruning without duplicate counts');

const many=[...Array.from({length:8},(_,i)=>({institution:'중복시',title:'지원사업 추진계획 '+i,url:'https://www.open.go.kr/dup/'+i,relevance:{kind:'project_candidate'}})),{institution:'새로운시',title:'지원사업 추진계획',url:'https://www.open.go.kr/new',relevance:{kind:'project_candidate'}}];
const diverse=compact({candidates:many,investigations:[],projects:[]});assert(diverse.documents.findIndex(d=>d.institution==='새로운시')<diverse.documents.findIndex(d=>d.url.endsWith('/dup/1')));
