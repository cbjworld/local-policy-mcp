const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
function open(directory=__dirname){
 const db=new DatabaseSync(path.join(directory,'budget-search.sqlite'),{readOnly:true});
 try{
  const meta=JSON.parse(db.prepare('SELECT value FROM metadata').get().value);
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,'budget-data.json.gz'))).digest('hex');
  if(meta.format!==1||meta.sha256!==hash)throw Error('Budget search index is stale; rebuild it with node build-budget-index.cjs');
  const keys=JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(path.join(directory,'budget-search-keys.json.gz'))));
  if(keys.sha256!==hash||keys.names.length!==meta.rows||keys.contextIds.length!==meta.rows)throw Error('Budget search keys are stale; rebuild them');
  const read=db.prepare('SELECT p.raw AS row,c.raw AS context FROM projects p JOIN contexts c ON p.context_id=c.id WHERE p.id=?');
  return {scope:meta.scope,length:meta.rows,find(terms,region,offset,limit){
   const regionTerms=region?(Array.isArray(region)?region:[region]):null;
   const regionMatches=regionTerms?keys.institutions.map(name=>regionTerms.every(term=>name.includes(term))):null;
   let total=0;const rows=[];
   for(let i=0;i<keys.names.length;i++)if((!regionMatches||regionMatches[keys.contextIds[i]])&&terms.every(t=>keys.names[i].includes(t))){if(total>=offset&&rows.length<limit)rows.push(read.get(i));total++;}
   return {total,items:rows.map(r=>({...JSON.parse(r.context),...JSON.parse(r.row)}))};
  },close(){db.close();}};
 }catch(e){db.close();throw e;}
}
module.exports={open};
