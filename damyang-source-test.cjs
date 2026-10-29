const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'damyang-source-test-'));
try{
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json']){const source=path.join(__dirname,file);if(fs.existsSync(source))fs.copyFileSync(source,path.join(tmp,file));}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz'))));
 const rows=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-9d8c9876bf');
 assert.equal(rows.length,20);assert.equal(rows.reduce((n,[,row])=>n+row.budget,0),9777227);
 assert(rows.every(([i,row])=>row.budget-row.previous===row.delta&&row.page&&data.contexts[i].department==='기획예산실'&&data.contexts[i].institutionAggregateVerified===false));
 const search=require(path.join(tmp,'budget-search')).search,result=search({q:'군정 현안',institution:'담양군'});
 const row=result.items.find(x=>x.name==='군정 현안 및 주요시책업무 추진');
 assert(row);assert.equal(row.budget,204600);assert.equal(row.previous,200100);assert.equal(row.delta,4500);assert.equal(row.page,1);
 assert.equal(row.source,'https://www.damyang.go.kr/board/getFile?boardId=BBS_9999999&fileSid=206910&isInline=true');
 assert.match(row.limitation,/총괄표/);assert.match(row.limitation,/PDF 이미지/);assert.match(row.limitation,/접근이 제한/);
 assert.equal(result.scope.partialInstitutionCoverage['담양군'].status,'partial');assert.equal(result.scope.partialInstitutionCoverage['담양군'].verifiedDepartments,1);
 assert.equal(result.scope.partialInstitutionCoverage['담양군'].budgetRows,20);assert.equal(result.scope.partialInstitutionCoverage['경상북도'].status,'partial');
 assert.equal(search({q:'군정 현안',institution:'영동군'}).items.some(x=>x.institution==='담양군'),false);
 console.log('PASS: 담양군 기획예산실 20행, 금액·출처·검색·부분 범위');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
