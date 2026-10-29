const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {build}=require('./build-budget-index.cjs'),{open}=require('./budget-sqlite');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'policy-index-failure-'));
const input={formatVersion:1,scope:{year:2026,account:'일반회계'},contexts:[{institution:'테스트시',parent:'테스트도'}],rows:[[0,{name:'청년 지원',budget:1}]]};
const data=path.join(dir,'budget-data.json.gz'),keys=path.join(dir,'budget-search-keys.json.gz'),database=path.join(dir,'budget-search.sqlite');
try{
 fs.writeFileSync(data,zlib.gzipSync(JSON.stringify(input)));build(dir);
 const originalData=fs.readFileSync(data),originalKeys=fs.readFileSync(keys),originalDatabase=fs.readFileSync(database);
 fs.writeFileSync(data,zlib.gzipSync(JSON.stringify({...input,scope:{...input.scope,updated:true}})));
 const rename=fs.renameSync;
 try{fs.renameSync=()=>{const error=Error('locked');error.code='EPERM';throw error;};assert.throws(()=>build(dir),/locked/);}
 finally{fs.renameSync=rename;}
 assert.deepEqual(fs.readFileSync(keys),originalKeys);assert.deepEqual(fs.readFileSync(database),originalDatabase);
 fs.writeFileSync(data,originalData);const db=open(dir);try{assert.equal(db.find(['청년'],null,0,1).total,1);}finally{db.close();}
 console.log('PASS: failed index replacement preserves the previous database and search keys');
}finally{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
