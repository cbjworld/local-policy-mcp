const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const repo=__dirname,tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ganghwa-source-test-'));
try {
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json']){const src=path.join(repo,file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(tmp,file));}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz'))));assert.equal(data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-bec1aae9dd').length,1594);
 const result=require(path.join(tmp,'budget-search')).search({q:'청년월세 특별지원사업',institution:'인천 강화군'});assert.equal(result.totalCandidateRows,1);const row=result.items[0];assert.equal(row.department,'일자리경제과');assert.equal(row.budget,52000);assert.equal(row.previous,40000);assert.equal(row.delta,12000);assert.equal(row.page,320);assert.equal(row.source,'https://www.ganghwa.go.kr/open_content/main/bbs/bbsMsgFileDown.do?bcd=estimate&msg_seq=356&fileno=3');
 const selected=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-bec1aae9dd').map(([i,r])=>({...data.contexts[i],...r}));assert.equal(selected.reduce((n,r)=>n+r.budget,0),703219676);assert(!selected.some(r=>r.department==='복지정책과'&&r.page===204&&r.budget===81000));
 console.log('PASS: 강화군 일반회계 분리·부서 합계·사업명·PDF 위치');
}finally {fs.rmSync(tmp,{recursive:true,force:true});}
