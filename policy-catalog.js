const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const normalize=value=>String(value??'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
const registries=new Map();
function enrich(context,directory=__dirname){
 if(context.parent)return context;
 if(!registries.has(directory)){const file=path.join(directory,'verified-budget-data.json'),registry=path.join(directory,'catalog-institutions.json'),names=new Map(),items=[...(fs.existsSync(file)?JSON.parse(fs.readFileSync(file)).items:[]),...(fs.existsSync(registry)?JSON.parse(fs.readFileSync(registry)).records:[])];for(const item of items){const name=normalize(item.institution);if(!names.has(name))names.set(name,new Set());if(item.parent)names.get(name).add(item.parent);}registries.set(directory,names);}
 const parents=[...(registries.get(directory).get(normalize(context.institution))||[])];
 return parents.length===1?{...context,parent:parents[0]}:context;
}
function projectId(context,row){
 const origin=(()=>{try{return new URL(context.source).hostname;}catch{return context.source||'';}})();
 const institution=context.institutionId||[context.parent,context.institution,origin].map(normalize);
 const department=context.department||['unidentified',context.source,row.page];
 return 'bp-'+crypto.createHash('sha256').update(JSON.stringify([institution,normalize(department),context.year,context.account,normalize(row.name)])).digest('hex').slice(0,24);
}
function documentsFile(directory){const file=path.join(directory,'project-document-links.json');return fs.existsSync(file)?fs.readFileSync(file):Buffer.from('{"formatVersion":1,"links":[]}');}
function registryHash(directory){const hash=crypto.createHash('sha256');for(const name of ['verified-budget-data.json','catalog-institutions.json']){const file=path.join(directory,name);hash.update(name);if(fs.existsSync(file))hash.update(fs.readFileSync(file));}return hash.digest('hex');}
function buildTables(db,data,directory){
 db.exec('CREATE TABLE catalog(id TEXT PRIMARY KEY, context_id INTEGER NOT NULL, name TEXT NOT NULL, name_key TEXT NOT NULL, institution_key TEXT NOT NULL); CREATE TABLE catalog_rows(row_id INTEGER PRIMARY KEY, project_id TEXT NOT NULL); CREATE INDEX catalog_project_rows ON catalog_rows(project_id);');
 const insert=db.prepare('INSERT OR IGNORE INTO catalog VALUES (?,?,?,?,?)'),row=db.prepare('INSERT INTO catalog_rows VALUES (?,?)');
 data.rows.forEach(([contextId,item],index)=>{const original=data.contexts[contextId],context=enrich(original,directory),id=projectId(original,item);insert.run(id,contextId,item.name,normalize(item.name),normalize((context.parent||'')+' '+context.institution));row.run(index,id);});
 const packed=documentsFile(directory),documents=JSON.parse(packed);
 if(documents.formatVersion!==1||!Array.isArray(documents.links))throw Error('Invalid project document links');
 const exists=db.prepare('SELECT id FROM catalog WHERE id=?');
 for(const link of documents.links){if(!exists.get(link.projectId))throw Error('Linked budget project is missing: '+link.projectId);if(!Array.isArray(link.evidence)||!link.evidence.length||!/^https:\/\/www\.open\.go\.kr\//.test(link.document?.url||''))throw Error('Invalid linked document evidence');}
 const confirmed=documents.links.filter(x=>x.status==='body_supported');
 return {projects:db.prepare('SELECT count(*) AS n FROM catalog').get().n,linkedProjects:new Set(confirmed.map(x=>x.projectId)).size,documentLinks:confirmed.length,titleCandidateLinks:documents.links.length-confirmed.length,linksSha256:crypto.createHash('sha256').update(packed).digest('hex'),registrySha256:registryHash(directory)};
}
function open(directory=__dirname){
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(path.join(directory,'budget-search.sqlite'),{readOnly:true});
 try{
  const meta=JSON.parse(db.prepare('SELECT value FROM metadata').get().value),packed=documentsFile(directory);
  if(!meta.catalog||meta.catalog.registrySha256!==registryHash(directory)||meta.sha256!==crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,'budget-data.json.gz'))).digest('hex')||meta.catalog.linksSha256!==crypto.createHash('sha256').update(packed).digest('hex'))throw Error('Rebuild the policy catalog with npm run prepare:index');
  const links=JSON.parse(packed).links,byId=new Map();for(const link of links){if(!byId.has(link.projectId))byId.set(link.projectId,[]);byId.get(link.projectId).push(link);}
  const read=db.prepare('SELECT p.raw AS item,c.raw AS context FROM catalog_rows r JOIN projects p ON p.id=r.row_id JOIN contexts c ON c.id=p.context_id WHERE r.project_id=? ORDER BY r.row_id');
  function search({q,institution,projectId:id,offset=0,limit=10}={}){
   if(q!==undefined&&(typeof q!=='string'||!q.trim()||q.length>100))throw Error('Invalid q');
   if(institution!==undefined&&(typeof institution!=='string'||!institution.trim()||institution.length>80))throw Error('Invalid institution');
   if(id!==undefined&&!/^bp-[a-f0-9]{24}$/.test(id))throw Error('Invalid projectId');
   if(!Number.isInteger(offset)||offset<0||offset>meta.rows||!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid pagination');
   const where=[],params=[];if(id){where.push('id=?');params.push(id);}
   for(const term of q?.trim().split(/\s+/)||[]){where.push('instr(name_key,?)>0');params.push(normalize(term));}
   for(const term of institution?.trim().split(/\s+/)||[]){where.push('instr(institution_key,?)>0');params.push(normalize(term));}
   const filter=where.length?' WHERE '+where.join(' AND '):'',total=db.prepare('SELECT count(*) AS n FROM catalog'+filter).get(...params).n;
   const items=db.prepare('SELECT id,name FROM catalog'+filter+' ORDER BY id LIMIT ? OFFSET ?').all(...params,limit,offset).map(group=>{
    const records=read.all(group.id).map(r=>({...enrich(JSON.parse(r.context),directory),...JSON.parse(r.item)})),first=records[0];
    const budgetVariants=[...new Map(records.map(r=>[JSON.stringify([r.budget,r.unit]),{amount:r.budget,unit:r.unit}])).values()];
    const attached=byId.get(group.id)||[],documents=attached.filter(x=>x.status==='body_supported'),documentCandidates=attached.filter(x=>x.status==='title_candidate');
    return {projectId:group.id,name:group.name,institution:first.institution,parent:first.parent,department:first.department,year:first.year,account:first.account,budgetVariants,budgetStatus:budgetVariants.length===1?'single_recorded_amount':'multiple_recorded_amounts_do_not_sum',budgetRowCount:records.length,budgetRecords:records.slice(0,20),omittedBudgetRecords:Math.max(0,records.length-20),documents,documentCandidates,documentStatus:documents.length?'body_supported_links':documentCandidates.length?'title_candidates_only':'not_linked'};
   });
   return {coverage:{year:meta.scope.year,account:meta.scope.account,collectedDate:meta.scope.collectedDate,budgetRows:meta.rows,catalogProjects:meta.catalog.projects,linkedProjects:meta.catalog.linkedProjects,documentLinks:meta.catalog.documentLinks,nationwideComplete:meta.scope.nationwideComplete},total,offset,items,nextOffset:offset+limit<total?offset+limit:null,note:'동일 기관·부서·연도·회계·사업명의 예산행 목록입니다. 서로 다른 기관의 사업은 이름만으로 합치지 않습니다. 금액 변형과 출처를 보존하며 합산하지 않습니다. 근거 미연결은 문서나 사업의 부재가 아닙니다. 사업명 의미·전국 고유 정책 수·현재 시행은 별도 확인합니다.'};
  }
  return {search,close:()=>db.close()};
 }catch(error){db.close();throw error;}
}
let current;function search(args){current??=open();return current.search(args);}
module.exports={projectId,enrich,buildTables,open,search};
