const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib'),crypto=require('node:crypto'),Module=require('node:module');
const repo=__dirname,tmp=fs.mkdtempSync(path.join(os.tmpdir(),'buan-source-test-'));
try {
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json','project-document-links.json']){const src=path.join(repo,file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(tmp,file));}
 const packed=fs.readFileSync(path.join(tmp,'budget-data.json.gz')),data=JSON.parse(zlib.gunzipSync(packed));
 const match=data.rows.find(([id,r])=>data.contexts[id].institution==='부안군'&&r.name==='전북청년 1인 출산급여 지원사업');assert(match,'부안군 원문 자료 없음');
 const context=data.contexts[match[0]],row=match[1];assert.equal(context.archiveMember,'2026년 예산(홈페이지)/10-1.기획감사담당관.pdf');assert.equal(row.page,8);assert.equal(row.budget,13500);
 function check(v){assert.equal(v.source,'https://www.buan.go.kr/images/01_potal/content/sub05/budget/2026/20251216.zip');assert.equal(v.archiveMember,context.archiveMember);assert.equal(v.page,8);assert.equal(v.archiveSha256,context.archiveSha256);assert.equal(v.sourceFileSha256,context.sourceFileSha256);}
 const direct=require(path.join(tmp,'budget-search')).search({q:'전북청년 1인 출산급여',institution:'부안군'});assert.equal(direct.totalCandidateRows,1);check(direct.items[0]);
 const sha=x=>crypto.createHash('sha256').update(x).digest('hex');const rh=crypto.createHash('sha256');for(const n of ['verified-budget-data.json','catalog-institutions.json']){rh.update(n);if(fs.existsSync(path.join(tmp,n)))rh.update(fs.readFileSync(path.join(tmp,n)));}
 const docFile=path.join(tmp,'project-document-links.json'),docs=fs.existsSync(docFile)?fs.readFileSync(docFile):Buffer.from('{"formatVersion":1,"links":[]}');
 const catalog=require(path.join(tmp,'policy-catalog')),id=catalog.projectId(context,row),meta={sha256:sha(packed),rows:1,scope:data.scope,catalog:{registrySha256:rh.digest('hex'),linksSha256:sha(docs),projects:1}};
 const oldLoad=Module._load;
 class MockDatabase {prepare(sql){if(sql.includes('SELECT value FROM metadata'))return {get:()=>({value:JSON.stringify(meta)})};if(sql.includes('SELECT id,raw FROM contexts'))return {all:()=>[{id:match[0],raw:JSON.stringify(context)}]};if(sql.includes('sqlite_master'))return {get:()=>null};if(sql.includes('SELECT p.raw AS item'))return {all:()=>[{item:JSON.stringify(row),context:JSON.stringify(context)}]};if(sql.includes('SELECT id,name,count(*)'))return {all:()=>[{id,name:row.name,total:1}]};throw Error('unexpected query: '+sql)}close(){}}
 Module._load=function(request,...args){return request==='node:sqlite'?{DatabaseSync:MockDatabase}:oldLoad.call(this,request,...args)};
 try {const catalogSearch=catalog.open(tmp);const result=catalogSearch.search({q:'전북청년 1인 출산급여',institution:'부안군'});assert.equal(result.total,1);assert.equal(result.items[0].budgetRecords.length,1);check(result.items[0].budgetRecords[0]);catalogSearch.close();} finally {Module._load=oldLoad;}
 const document={url:'https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=TEST',title:'가상 사업계획',date:'20260101'};
 const item={projectId:id,name:row.name,institution:'부안군',parent:'전북특별자치도',department:context.department,year:2026,account:'일반회계',budgetVariants:[{amount:row.budget,unit:'천원'}],budgetStatus:'single_recorded_amount',budgetRowCount:1,budgetRecords:[{...context,...row}],documents:[{status:'body_supported',relationship:'same_named_budget_program',document,evidence:[]}],documentCandidates:[]};
 const compact=require('./catalog-context').compact({institution:'부안군',coverage:{},searches:[],items:[item]});check(compact.items[0].budgetSources[0]);
 const compared=require('./case-comparison')([{documentId:'fixture',institution:'부안군',title:document.title,url:document.url,fields:{}}],compact);assert.equal(compared[0].documents[0].appropriations.length,1);check(compared[0].documents[0].appropriations[0].sources[0]);
 console.log('PASS: 실제 사업행의 ZIP 출처가 검색·사업 목록·압축 응답·모의 연결 비교표에 유지됨');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}

