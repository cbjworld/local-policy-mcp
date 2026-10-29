const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const repo=__dirname,tmp=fs.mkdtempSync(path.join(os.tmpdir(),'yeongdong-source-test-'));
try{
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json']){const source=path.join(repo,file);if(fs.existsSync(source))fs.copyFileSync(source,path.join(tmp,file));}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz')))),rows=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-9ee642f0d4');
 assert.equal(rows.length,1305);assert.equal(rows.reduce((sum,[,row])=>sum+row.budget,0),510010921);assert(rows.every(([i,r])=>r.budget-r.previous===r.delta&&data.contexts[i].source&&r.page));
 const search=require(path.join(tmp,'budget-search')).search;
 const row=search({q:'군민의날',institution:'충북 영동군'}).items.find(x=>x.name.includes('군민의날'));
 assert(row);assert.equal(row.department,'국악문화예술과');assert.equal(row.budget,120000);assert.equal(row.previous,110000);assert.equal(row.delta,10000);assert.equal(row.page,86);assert.equal(new URL(row.source).hostname,'tour.yd21.go.kr');assert.equal(new URL(row.source).searchParams.get('mng_no'),'3162');assert.match(row.officialDocumentList,/GotoPage=4/);
 const sports=search({q:'레이크사랑 걷기대회',institution:'영동군'}).items.find(x=>x.name.includes('레이크사랑'));assert(sports);assert.equal(sports.budget,20000);assert.equal(sports.page,202);
 console.log('PASS: 영동군 공식 세출 1,305행과 사업 검색·원문 쪽수 확인');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
