const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ansan-source-test-'));
try{
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json']){const src=path.join(__dirname,file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(tmp,file));}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz'))));
 const rows=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-ccf234ebc5');
 assert.equal(rows.length,2492);assert.equal(new Set(rows.map(([i])=>data.contexts[i].department)).size,105);
 assert.equal(rows.reduce((n,[,r])=>n+r.budget,0),2053213911);
 assert(rows.every(([i,r])=>r.budget-r.previous===r.delta&&r.page&&data.contexts[i].institutionAggregateVerified===true));
 const search=require(path.join(tmp,'budget-search')).search;
 const result=search({q:'청년부동산 중개보수 및 이사비',institution:'안산시'});
 const item=result.items.find(x=>x.institutionId==='gov-ccf234ebc5'&&x.name.includes('이사비 지원사업'));
 assert(item);assert.equal(item.budget,42000);assert.equal(item.page,4);assert.equal(new URL(item.source).hostname,'www.ansan.go.kr');
 const a=rows.filter(([i,r])=>data.contexts[i].department==='복지정책과'&&r.name.includes('자활근로'));
 assert(a.some(([,r])=>r.page===163&&r.budget===4555300&&r.name.endsWith('(자활근로사업)')));
 assert(a.some(([,r])=>r.page===164&&r.budget===1833&&r.name.endsWith('(자활근로사업)(시비추가)')));
 console.log('PASS: 안산시 2,492행·105개 부서 합계·지역 검색·원문 페이지');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
