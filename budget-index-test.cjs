const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {build}=require('./build-budget-index.cjs'),{open}=require('./budget-sqlite');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'policy-index-test-'));
let db;
try{
 const input={formatVersion:1,scope:{year:2026,account:'일반회계'},contexts:[{institution:'수영구',parent:'부산광역시',source:'https://example.go.kr/a',unit:'천원'},{institution:'강남구',parent:'서울특별시'}],rows:[[0,{name:'ＡＩ 청년 지원',budget:0,page:1}],[1,{name:'청년지원',budget:58,page:2}],[0,{name:'100%_지원',budget:58800,page:3}],[0,{name:'청년지원',budget:27,page:4}]]};
 fs.writeFileSync(path.join(dir,'budget-data.json.gz'),zlib.gzipSync(JSON.stringify(input)));build(dir);db=open(dir);
 assert.equal(db.length,4);assert.deepEqual(db.scope,input.scope);
 const first=db.find(['청년','지원'],null,0,2);assert.equal(first.total,3);assert.deepEqual(first.items,[{...input.contexts[0],...input.rows[0][1]},{...input.contexts[1],...input.rows[1][1]}]);
 assert.deepEqual(db.find(['청년','지원'],null,2,2).items,[{...input.contexts[0],...input.rows[3][1]}]);
 assert.equal(db.find(['ai청년'],null,0,2).total,1);assert.equal(db.find(['청년'],'부산광역시수영구',0,2).total,2);
 assert.equal(db.find(['청년'],['부산','수영구'],0,2).total,2);
 assert.equal(db.find(['청년'],['서울','수영구'],0,2).total,0);
 // The JSON fallback must apply the same multi-part region filter as the SQLite path.
 fs.copyFileSync(path.join(__dirname,'budget-search.js'),path.join(dir,'budget-search.js'));
 const expected=db.find(['청년'],['부산','수영구'],0,2);
 db.close();db=null;
 fs.renameSync(path.join(dir,'budget-search.sqlite'),path.join(dir,'index-disabled.sqlite'));
 const fallbackSearch=require(path.join(dir,'budget-search.js')).search;
 const fallback=fallbackSearch({q:'청년',institution:'부산 수영구',limit:2});
 assert.equal(fallback.totalCandidateRows,expected.total);assert.deepEqual(fallback.items,expected.items);
 assert.equal(fallbackSearch({q:'청년',institution:'서울 수영구'}).totalCandidateRows,0);
 fs.renameSync(path.join(dir,'index-disabled.sqlite'),path.join(dir,'budget-search.sqlite'));db=open(dir);
 assert.equal(db.find(['%_'],null,0,2).total,1);assert.equal(db.find(["' OR 1=1 --"],null,0,2).total,0);
 assert.deepEqual(db.find(['청년'],null,4,2),{total:3,items:[]});
 db.close();db=null;
 fs.appendFileSync(path.join(dir,'budget-data.json.gz'),'changed');assert.throws(()=>open(dir),/stale/);
 console.log('PASS: prebuilt index keeps exact amounts, provenance, ordering, pagination, NFKC and literal search; stale index rejected');
}finally{if(db)db.close();for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
