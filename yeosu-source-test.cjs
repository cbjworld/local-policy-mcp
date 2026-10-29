const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const repo=__dirname,tmp=fs.mkdtempSync(path.join(os.tmpdir(),'yeosu-source-test-'));
try{
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json']){const source=path.join(repo,file);if(fs.existsSync(source))fs.copyFileSync(source,path.join(tmp,file));}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz'))));assert.equal(data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-524b814cf2').length,1982);
 const search=require(path.join(tmp,'budget-search')).search,result=search({q:'청년월세',institution:'전남 여수시'});assert.equal(result.totalCandidateRows,1);const row=result.items[0];
 assert.equal(row.name,'청년월세 한시 특별지원');assert.equal(row.department,'건축과');assert.equal(row.budget,1052160);assert.equal(row.previous,650000);assert.equal(row.delta,402160);assert.equal(row.page,6);
 assert.equal(new URL(row.source).hostname,'www.yeosu.go.kr');assert.match(new URL(row.source).pathname,/\/568993\/342684\//);assert.match(row.officialDocumentList,/document\/2026\/main/);
 const move=search({q:'이사비 지원사업',institution:'여수시'}).items.find(x=>x.department==='건축과');assert.equal(move?.budget,4000);assert.equal(move?.page,6);
 const document={url:'https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=TESTYEOSU',title:'가상 사업계획',date:'20260101'};
 const item={projectId:'fixture',name:row.name,institution:row.institution,parent:row.parent,department:row.department,year:2026,account:'일반회계',budgetVariants:[{amount:row.budget,unit:'천원'}],budgetStatus:'single_recorded_amount',budgetRowCount:1,budgetRecords:[row],documents:[{status:'body_supported',relationship:'same_named_budget_program',document,evidence:[]}],documentCandidates:[]};
 const compact=require('./catalog-context').compact({institution:'여수시',coverage:{},searches:[],items:[item]});assert.equal(compact.items[0].budgetSources[0].officialDocumentList,row.officialDocumentList);
 const compared=require('./case-comparison')([{documentId:'fixture',institution:'여수시',title:document.title,url:document.url,fields:{}}],compact);assert.equal(compared[0].documents[0].appropriations[0].sources[0].officialDocumentList,row.officialDocumentList);
 console.log('PASS: 여수시 2026 일반회계 예산 검색과 공식 PDF 쪽수 확인');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
