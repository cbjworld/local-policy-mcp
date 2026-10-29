const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'yeonsu-source-test-'));
try {
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json','project-document-links.json']){const src=path.join(__dirname,file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(tmp,file));}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz'))));
 const match=data.rows.find(([id,r])=>data.contexts[id].institution==='연수구'&&r.name==='청년월세 지원사업(만19~34세)');assert(match);
 const context=data.contexts[match[0]],row=match[1],listing='https://www.yeonsu.go.kr/main/administration/budget/present.asp';
 function check(v){assert.equal(v.source,'https://www.yeonsu.go.kr/ShareEtc/download.asp?FilePath=file_main&FileName=present_2026_0_33.pdf');assert.equal(v.page,7);assert.equal(v.officialDocumentList,listing);assert.match(v.limitation,/공식 본예산 목록/);}
 assert.equal(row.budget,1300000);const result=require(path.join(tmp,'budget-search')).search({q:'청년월세',institution:'인천 연수구'});assert.equal(result.totalCandidateRows,2);check(result.items.find(x=>x.name===row.name));
 const document={url:'https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=TESTYEONSU',title:'가상 사업계획',date:'20260101'};
 const item={projectId:'fixture',name:row.name,institution:'연수구',parent:'인천광역시',department:context.department,year:2026,account:'일반회계',budgetVariants:[{amount:row.budget,unit:'천원'}],budgetStatus:'single_recorded_amount',budgetRowCount:1,budgetRecords:[{...context,...row}],documents:[{status:'body_supported',relationship:'same_named_budget_program',document,evidence:[]}],documentCandidates:[]};
 const compact=require('./catalog-context').compact({institution:'연수구',coverage:{},searches:[],items:[item]});check(compact.items[0].budgetSources[0]);
 const compared=require('./case-comparison')([{documentId:'fixture',institution:'연수구',title:document.title,url:document.url,fields:{}}],compact);assert.equal(compared[0].documents[0].appropriations.length,1);check(compared[0].documents[0].appropriations[0].sources[0]);
 console.log('PASS: 연수구 원문 목록 경유 안내와 페이지가 예산 검색·비교표 출처에 유지됨');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
