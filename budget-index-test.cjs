const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {build}=require('./build-budget-index.cjs'),{open}=require('./budget-sqlite');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'policy-index-test-'));
let db;
try{
 const input={formatVersion:1,scope:{year:2026,account:'일반회계'},contexts:[{institution:'수영구',parent:'부산광역시',source:'https://example.go.kr/a',unit:'천원'},{institution:'강남구',parent:'서울특별시'},{institution:'거제시'},{institution:'중구'}],rows:[[0,{name:'ＡＩ 청년 지원',budget:0,page:1}],[1,{name:'청년지원',budget:58,page:2}],[0,{name:'100%_지원',budget:58800,page:3}],[0,{name:'청년지원',budget:27,page:4}],[2,{name:'산후지원',budget:11,page:5}],[3,{name:'복지지원',budget:12,page:6}]]};
 fs.writeFileSync(path.join(dir,'catalog-institutions.json'),JSON.stringify({records:[{institution:'거제시',parent:'경상남도'},{institution:'중구',parent:'서울특별시'},{institution:'중구',parent:'부산광역시'}]}));
 fs.writeFileSync(path.join(dir,'budget-data.json.gz'),zlib.gzipSync(JSON.stringify(input)));build(dir);db=open(dir);
 assert.equal(db.length,6);assert.deepEqual(db.scope,input.scope);
 const first=db.find(['청년','지원'],null,0,2);assert.equal(first.total,3);assert.deepEqual(first.items,[{...input.contexts[0],...input.rows[0][1]},{...input.contexts[1],...input.rows[1][1]}]);
 assert.deepEqual(db.find(['청년','지원'],null,2,2).items,[{...input.contexts[0],...input.rows[3][1]}]);
 assert.equal(db.find(['ai청년'],null,0,2).total,1);assert.equal(db.find(['청년'],'부산광역시수영구',0,2).total,2);
 assert.equal(db.find(['청년'],['부산','수영구'],0,2).total,2);
 assert.equal(db.find(['청년'],['서울','수영구'],0,2).total,0);
 for(const terms of [['산후'],['산후지원']]){
  const geoje=db.find(terms,['경상남도','거제시'],0,2);
  assert.equal(geoje.total,1);assert.equal(geoje.items[0].parent,'경상남도');assert.equal(geoje.items[0].budget,11);
  assert.equal(db.find(terms,['경기도','거제시'],0,2).total,0);
 }
 assert.equal(db.find(['복지지원'],['서울','중구'],0,2).total,0,'ambiguous unparented district must not be assigned');
 // The JSON fallback must apply the same multi-part region filter as the SQLite path.
 fs.copyFileSync(path.join(__dirname,'budget-search.js'),path.join(dir,'budget-search.js'));
 fs.copyFileSync(path.join(__dirname,'region-aliases.js'),path.join(dir,'region-aliases.js'));
 fs.copyFileSync(path.join(__dirname,'policy-catalog.js'),path.join(dir,'policy-catalog.js'));
 const expected=db.find(['청년'],['부산','수영구'],0,2);
 db.close();db=null;
 fs.renameSync(path.join(dir,'budget-search.sqlite'),path.join(dir,'index-disabled.sqlite'));
 const fallbackSearch=require(path.join(dir,'budget-search.js')).search;
 const fallback=fallbackSearch({q:'청년',institution:'부산 수영구',limit:2});
 assert.equal(fallback.totalCandidateRows,expected.total);assert.deepEqual(fallback.items,expected.items);
 assert.deepEqual(fallbackSearch({q:'청년',institution:'부산시 수영구',limit:2}).items,expected.items);
 assert.equal(fallbackSearch({q:'청년',institution:'서울 수영구'}).totalCandidateRows,0);
 assert.equal(fallbackSearch({q:'산후',institution:'경남 거제시'}).items[0].budget,11);
 assert.equal(fallbackSearch({q:'산후',institution:'경기도 거제시'}).totalCandidateRows,0);
 fs.renameSync(path.join(dir,'index-disabled.sqlite'),path.join(dir,'budget-search.sqlite'));db=open(dir);
 assert.equal(db.find(['%_'],null,0,2).total,1);assert.equal(db.find(["' OR 1=1 --"],null,0,2).total,0);
 assert.deepEqual(db.find(['청년'],null,4,2),{total:3,items:[]});
 const searches=[[['ai청년'],null,0,2],[['청년지원'],null,0,2],[['청년지원'],['부산','수영구'],0,2],[['청년지원'],null,2,1],[['청년지원'],null,4,1],[['%_'],null,0,2],[['청년'],['서울','수영구'],0,2]];
 const indexed=searches.map(args=>db.find(...args));db.close();db=null;
 const legacy=new (require('node:sqlite').DatabaseSync)(path.join(dir,'budget-search.sqlite'));legacy.exec('DROP TABLE catalog_search');legacy.close();db=open(dir);
 for(let i=0;i<searches.length;i++)assert.deepEqual(db.find(...searches[i]),indexed[i],'indexed and fallback rows, counts, region and pagination must agree');
 db.close();db=null;
 const duplicates={formatVersion:1,scope:input.scope,contexts:[{institution:'중구',parent:'부산',institutionId:'same',department:'동일과',year:2026,account:'일반회계'},{institution:'중구',parent:'서울',institutionId:'same',department:'동일과',year:2026,account:'일반회계'}],rows:[[0,{name:'청년지원',budget:10}],[1,{name:'청년지원',budget:20}]]};
 fs.writeFileSync(path.join(dir,'budget-data.json.gz'),zlib.gzipSync(JSON.stringify(duplicates)));build(dir);db=open(dir);
 assert.deepEqual(db.find(['청년지원'],['부산'],0,10),{total:1,items:[{...duplicates.contexts[0],...duplicates.rows[0][1]}]});
 assert.deepEqual(db.find(['청년지원'],['서울'],0,10),{total:1,items:[{...duplicates.contexts[1],...duplicates.rows[1][1]}]});
 db.close();db=null;
 const many={formatVersion:1,scope:input.scope,contexts:Array.from({length:501},(_,i)=>({institution:'시험'+i,parent:'서울',institutionId:'inst'+i})),rows:Array.from({length:501},(_,i)=>[i,{name:'청년지원',budget:i}])};
 fs.writeFileSync(path.join(dir,'budget-data.json.gz'),zlib.gzipSync(JSON.stringify(many)));build(dir);db=open(dir);
 assert.deepEqual(db.find(['청년지원'],['서울'],500,1),{total:501,items:[{...many.contexts[500],...many.rows[500][1]}]},'large region uses complete fallback');
 db.close();db=null;
 const oldMetadata=new (require('node:sqlite').DatabaseSync)(path.join(dir,'budget-search.sqlite'));const metadata=JSON.parse(oldMetadata.prepare('SELECT value FROM metadata').get().value);delete metadata.keysSha256;oldMetadata.prepare('UPDATE metadata SET value=?').run(JSON.stringify(metadata));oldMetadata.close();db=open(dir);assert.equal(db.find(['청년지원'],null,0,1).total,501,'legacy metadata remains readable');db.close();db=null;
 const districts={formatVersion:1,scope:input.scope,contexts:[{institution:'동구',parent:'인천광역시'},{institution:'남동구',parent:'인천광역시'},{institution:'동구',parent:'부산광역시'},{institution:'동구',parent:'대구광역시'},{institution:'양주시',parent:'경기도'},{institution:'남양주시',parent:'경기도'},{institution:'권선구',parent:'경기도 수원시'},{institution:'팔달구',parent:'경기도 수원시'}],rows:[0,1,2,3,4,5,6,7].map(i=>[i,{name:'청년지원',budget:i}])};
 fs.writeFileSync(path.join(dir,'budget-data.json.gz'),zlib.gzipSync(JSON.stringify(districts)));build(dir);db=open(dir);
 const regionCases=[['인천 동구',1,['동구']],['인천 남동구',1,['남동구']],['부산 동구',1,['동구']],['대구',1,['동구']],['동구',3,['동구','동구','동구']],['인천',2,['동구','남동구']],['양주시',1,['양주시']],['양주',1,['양주시']],['남양주시',1,['남양주시']],['수원시',2,['권선구','팔달구']],['경기도 수원시 권선구',1,['권선구']]];
 for(const [query,total,names] of regionCases){const result=db.find(['청년지원'],require('./region-aliases').regionTerms(query),0,10);assert.equal(result.total,total,query);assert.deepEqual(result.items.map(x=>x.institution),names,query);}
 db.close();db=null;fs.renameSync(path.join(dir,'budget-search.sqlite'),path.join(dir,'index-disabled.sqlite'));
 delete require.cache[require.resolve(path.join(dir,'budget-search.js'))];const regionFallback=require(path.join(dir,'budget-search.js')).search;
 for(const [query,total,names] of regionCases){const result=regionFallback({q:'청년지원',institution:query});assert.equal(result.totalCandidateRows,total,query);assert.deepEqual(result.items.map(x=>x.institution),names,query);}
 fs.renameSync(path.join(dir,'index-disabled.sqlite'),path.join(dir,'budget-search.sqlite'));
 build(dir);
 fs.appendFileSync(path.join(dir,'budget-search-keys.json.gz'),'changed');assert.throws(()=>open(dir),/stale/);
 fs.appendFileSync(path.join(dir,'budget-data.json.gz'),'changed');assert.throws(()=>open(dir),/stale/);
 console.log('PASS: prebuilt index keeps exact amounts, provenance, ordering, pagination, NFKC and literal search; stale index rejected');
}finally{if(db)db.close();for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
