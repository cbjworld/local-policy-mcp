const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
function open(directory=__dirname){
 const db=new DatabaseSync(path.join(directory,'budget-search.sqlite'),{readOnly:true});
 try{
  const meta=JSON.parse(db.prepare('SELECT value FROM metadata').get().value);
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,'budget-data.json.gz'))).digest('hex');
  if(meta.format!==1||meta.sha256!==hash)throw Error('Budget search index is stale; rebuild it with node build-budget-index.cjs');
  const packedKeys=fs.readFileSync(path.join(directory,'budget-search-keys.json.gz'));
  if(meta.keysSha256&&crypto.createHash('sha256').update(packedKeys).digest('hex')!==meta.keysSha256)throw Error('Budget search keys are stale; rebuild them');
  let keys;
  function loadKeys(){
   if(!keys){keys=JSON.parse(require('node:zlib').gunzipSync(packedKeys));if(keys.sha256!==hash||keys.names.length!==meta.rows||keys.contextIds.length!==meta.rows)throw Error('Budget search keys are stale; rebuild them');}
   return keys;
  }
  if(!meta.keysSha256)loadKeys();
  const substringIndex=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='catalog_search'").get();
  const normalize=s=>String(s??'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  let contexts;
  const enrich=require('./policy-catalog').enrich;
  const read=db.prepare('SELECT p.raw AS row,c.raw AS context FROM projects p JOIN contexts c ON p.context_id=c.id WHERE p.id=?');
  return {scope:meta.scope,length:meta.rows,find(terms,region,offset,limit){
   const regionTerms=region?(Array.isArray(region)?region:[region]):null;
   const indexedTerm=terms.filter(t=>/^[\p{L}\p{N}]{3,}$/u.test(t)).sort((a,b)=>b.length-a.length)[0];
   const regionIds=regionTerms?(contexts??=db.prepare('SELECT id,raw FROM contexts').all().map(r=>({id:r.id,entry:enrich(JSON.parse(r.raw),directory)}))).filter(c=>require('./region-aliases').matchesRegion(regionTerms,c.entry)).map(c=>c.id):null;
   if(substringIndex&&indexedTerm&&(!regionIds||regionIds.length<=500)){
    const where=['x.rowid IN (SELECT rowid FROM catalog_search WHERE name_key MATCH ?)'],params=['"'+indexedTerm+'"'];
    for(const term of terms){where.push('instr(x.name_key,?)>0');params.push(term);}
    if(regionIds){if(!regionIds.length)return {total:0,items:[]};where.push('p.context_id IN ('+regionIds.map(()=>'?').join(',')+')');params.push(...regionIds);}
    const from=' FROM catalog x JOIN catalog_rows r ON r.project_id=x.id JOIN projects p ON p.id=r.row_id JOIN contexts c ON c.id=p.context_id WHERE '+where.join(' AND ');
    const rows=db.prepare('SELECT p.raw AS row,c.raw AS context,count(*) OVER() AS total'+from+' ORDER BY p.id LIMIT ? OFFSET ?').all(...params,limit,offset);
    const total=rows[0]?.total??(offset?db.prepare('SELECT count(*) AS n'+from).get(...params).n:0);
    return {total,items:rows.map(r=>({...enrich(JSON.parse(r.context),directory),...JSON.parse(r.row)}))};
   }
   const loaded=loadKeys(),regionMatches=regionTerms?new Set(regionIds):null;
   let total=0;const rows=[];
   for(let i=0;i<loaded.names.length;i++)if((!regionMatches||regionMatches.has(loaded.contextIds[i]))&&terms.every(t=>loaded.names[i].includes(t))){if(total>=offset&&rows.length<limit)rows.push(read.get(i));total++;}
   return {total,items:rows.map(r=>({...enrich(JSON.parse(r.context),directory),...JSON.parse(r.row)}))};
  },close(){db.close();}};
 }catch(e){db.close();throw e;}
}
module.exports={open};
