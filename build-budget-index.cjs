const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const normalize=s=>s.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
function build(directory=__dirname){
 const packed=fs.readFileSync(path.join(directory,'budget-data.json.gz')),data=JSON.parse(zlib.gunzipSync(packed));
 if(data.formatVersion!==1)throw Error('Budget index requires packed format 1');
 const target=path.join(directory,'budget-search.sqlite'),temporary=target+'.'+process.pid+'.tmp',db=new DatabaseSync(temporary);
 try{
  db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; BEGIN; CREATE TABLE metadata(value TEXT NOT NULL); CREATE TABLE contexts(id INTEGER PRIMARY KEY, raw TEXT NOT NULL); CREATE TABLE projects(id INTEGER PRIMARY KEY, context_id INTEGER NOT NULL, raw TEXT NOT NULL);');
  const sha256=crypto.createHash('sha256').update(packed).digest('hex');
  const context=db.prepare('INSERT INTO contexts VALUES (?,?)'),row=db.prepare('INSERT INTO projects VALUES (?,?,?)');
  data.contexts.forEach((r,i)=>context.run(i,JSON.stringify(r)));
  data.rows.forEach(([id,r],i)=>row.run(i,id,JSON.stringify(r)));
  const catalog=require('./policy-catalog').buildTables(db,data,directory);
  const keys={sha256,names:data.rows.map(([,r])=>normalize(r.name)),contextIds:data.rows.map(([id])=>id),institutions:data.contexts.map(r=>normalize((r.parent||'')+' '+r.institution))};
  const packedKeys=zlib.gzipSync(JSON.stringify(keys)),keysSha256=crypto.createHash('sha256').update(packedKeys).digest('hex');
  db.prepare('INSERT INTO metadata VALUES (?)').run(JSON.stringify({format:1,sha256,scope:data.scope,rows:data.rows.length,catalog,keysSha256}));
  db.exec('COMMIT;');db.close();
  const keysFile=path.join(directory,'budget-search-keys.json.gz');
  const previousKeys=fs.existsSync(keysFile)?fs.readFileSync(keysFile):null;
  try{fs.writeFileSync(keysFile,packedKeys);fs.renameSync(temporary,target);}
  catch(error){if(previousKeys)fs.writeFileSync(keysFile,previousKeys);else fs.rmSync(keysFile,{force:true});throw error;}
  return {rows:data.rows.length,catalog,bytes:fs.statSync(target).size};
 }catch(e){try{db.close();}catch{};fs.rmSync(temporary,{force:true});throw e;}
}
if(require.main===module)console.log(JSON.stringify(build()));
module.exports={build};
