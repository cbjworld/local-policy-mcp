const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),z=require('node:zlib');
const catalog=require('./policy-catalog'),{build}=require('./build-budget-index.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'policy-catalog-test-'));let store;
try{
 const contexts=[{institution:'중구',parent:'부산광역시',institutionId:'busan-jung',department:'보건과',year:2026,account:'일반회계',unit:'천원',source:'https://www.bsjunggu.go.kr/budget.pdf'},{institution:'중구',parent:'울산광역시',institutionId:'ulsan-jung',department:'보건과',year:2026,account:'일반회계',unit:'천원',source:'https://www.junggu.ulsan.kr/b.pdf'}];
 const rows=[[0,{name:'산후 조리비 지원',budget:100,page:1}],[0,{name:'산후조리비 지원',budget:200,page:2}],[1,{name:'산후조리비 지원',budget:300,page:1}],[0,{name:'산후조리비 추가지원',budget:50,page:3}]],input={formatVersion:1,scope:{year:2026,account:'일반회계 세출',nationwideComplete:false},contexts,rows};
 const id=catalog.projectId(contexts[0],rows[0][1]);assert.equal(id,catalog.projectId(contexts[0],{...rows[0][1],page:99,budget:999}));assert.notEqual(id,catalog.projectId({...contexts[0],department:'다른과'},rows[0][1]));assert.notEqual(id,catalog.projectId({...contexts[0],year:2027},rows[0][1]));
 const document={title:'2026년 산후조리비 지원계획',url:'https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?x=1'};
 const links={formatVersion:1,links:[{projectId:id,status:'body_supported',basis:'name_year_institution',document,evidence:[{kind:'program_name',quote:'사업명: 산후조리비 지원',page:1}]},{projectId:catalog.projectId(contexts[1],rows[2][1]),status:'title_candidate',document,evidence:[{kind:'document_title',quote:document.title}]}]};
 fs.writeFileSync(path.join(dir,'budget-data.json.gz'),z.gzipSync(JSON.stringify(input)));fs.writeFileSync(path.join(dir,'project-document-links.json'),JSON.stringify(links));build(dir);store=catalog.open(dir);
 const result=store.search({q:'산후 조리비',institution:'부산 중구'});assert.equal(result.total,2);assert.equal(result.coverage.budgetRows,4);assert.equal(result.coverage.catalogProjects,3);assert.equal(result.coverage.linkedProjects,1);assert.equal(result.coverage.documentLinks,1);
 const project=store.search({projectId:id}).items[0];assert.equal(project.budgetRowCount,2);assert.deepEqual(project.budgetVariants,[{amount:100,unit:'천원'},{amount:200,unit:'천원'}]);assert.match(project.budgetStatus,/do_not_sum/);assert.equal(project.documents.length,1);assert.equal(project.budgetRecords[1].page,2);
 const other=store.search({institution:'울산 중구'}).items[0];assert.equal(other.documentStatus,'title_candidates_only');assert.equal(other.documents.length,0);assert.equal(other.documentCandidates.length,1);
 assert.equal(store.search({q:'%_'}).total,0);assert.throws(()=>store.search({projectId:'invalid'}));assert.throws(()=>store.search({limit:100}));assert.equal(store.search({limit:1}).nextOffset,1);
 store.close();store=null;fs.appendFileSync(path.join(dir,'project-document-links.json'),' ');assert.throws(()=>catalog.open(dir),/Rebuild/);
 console.log('PASS: stable source-backed catalog identities, region/department/year separation, exact row preservation, unsummed budget variants, body/title link separation, literal search, pagination and stale evidence detection');
}finally{store?.close();fs.rmSync(dir,{recursive:true,force:true});}
