const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const norm=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
const regions=require('./region-aliases.js'),registry=require('./catalog-institutions.json').records.filter(x=>!x.institution.includes('(편성 당시)'));
const agencies=new Map(registry.map(x=>[norm(x.parent===x.institution?x.parent:x.parent+' '+x.institution),x]));
function configuredPath(){
 if(process.env.POLICY_GOV24_SNAPSHOT)return process.env.POLICY_GOV24_SNAPSHOT;
 if(process.env.POLICY_MUNICIPAL_CATALOG){const candidate=path.join(path.dirname(process.env.POLICY_MUNICIPAL_CATALOG),'gov24-municipal-snapshot.json');if(fs.existsSync(candidate))return candidate;}
 const bundled=path.join(__dirname,'data','gov24-national-20261013.json');return fs.existsSync(bundled)?bundled:null;
}
function search({q,institution,offset=0,limit=10,snapshot}={},file=configuredPath()){
 if(typeof q!=='string'||!q.trim()||q.length>100||institution!==undefined&&(typeof institution!=='string'||!institution.trim()||institution.length>80)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>20)throw Error('검색어 또는 결과 범위를 확인하세요.');
 if(!file)throw Error('정부24 저장 자료가 설정되지 않았습니다.');
 let data,version;try{const stat=fs.statSync(file);if(stat.size>20*1024*1024)throw Error('too_large');const bytes=fs.readFileSync(file);if(bytes.length>20*1024*1024)throw Error('too_large');version=crypto.createHash('sha256').update(JSON.stringify([q,institution??null])).update('\0').update(bytes).digest('hex');data=JSON.parse(bytes.toString('utf8'));}catch{throw Error('정부24 저장 자료를 읽을 수 없습니다.');}
 if(snapshot!==undefined&&snapshot!==version)throw Error('질문 또는 정부24 저장 자료가 변경되어 처음부터 다시 검색해야 합니다.');
 if(!Array.isArray(data.records)||data.records.length>20000||typeof data.fetchedAt!=='string'||data.fetchedAt.length>40||!Number.isFinite(Date.parse(data.fetchedAt))||data.coverage!==undefined&&(typeof data.coverage!=='string'||data.coverage.length>200)||data.apiSource!=='https://www.data.go.kr/data/15113968/openapi.do')throw Error('정부24 저장 자료 형식이 올바르지 않습니다.');
 const inferred=institution?null:regions.inferInstitution(q,registry),ambiguous=regions.ambiguousInstitution(institution||q,registry);
 const selected=institution||inferred||ambiguous?.name,query=selected?regions.queryWithoutRegion(q,selected):q;
 const terms=query.trim().split(/\s+/).map(norm),region=selected?regions.regionTerms(selected):null,rows=[],seen=new Set();
 for(const r of data.records){
  if(!r||typeof r.serviceId!=='string'||!/^[A-Za-z0-9]{1,40}$/.test(r.serviceId)||typeof r.title!=='string'||!r.title.trim()||r.title.length>300||typeof r.institution!=='string'||r.institution.length>150||typeof r.url!=='string')throw Error('정부24 항목 형식이 올바르지 않습니다.');
  let u;try{u=new URL(r.url);}catch{throw Error('정부24 원문 주소가 올바르지 않습니다.');}
  if(u.protocol!=='https:'||u.hostname!=='www.gov.kr'||u.username||u.password||u.port||u.search||u.hash||u.pathname!=='/portal/rcvfvrSvc/dtlEx/'+r.serviceId||seen.has(r.serviceId))throw Error('정부24 원문 주소가 올바르지 않습니다.');seen.add(r.serviceId);
  const agency=agencies.get(norm(r.institution));if(!agency)throw Error('정부24 소관기관을 확인할 수 없습니다.');
  if(region&&!regions.matchesRegion(region,agency)||!terms.every(t=>norm(r.title).includes(t)))continue;
  rows.push({serviceId:r.serviceId,title:r.title,institution:r.institution,url:u.href,modifiedAt:typeof r.modifiedAt==='string'&&/^\d{14}$/.test(r.modifiedAt)?r.modifiedAt:null});
 }
 return {snapshot:version,scope:{source:data.apiSource,fetchedAt:data.fetchedAt,coverage:data.coverage||null,records:data.records.length,institutions:new Set(data.records.map(r=>norm(r.institution))).size,note:'정부24 API에서 저장한 서비스명 후보입니다. 수집 시점 이후 변경과 현재 시행 여부는 확인되지 않았으며 사업 수나 예산을 뜻하지 않습니다.'},...(ambiguous?{ambiguousInstitution:ambiguous}:{}),total:rows.length,offset,nextOffset:offset+limit<rows.length?offset+limit:null,items:rows.slice(offset,offset+limit)};
}
function collect(catalog,file=configuredPath()){
 if(!file)return null;
 const queries=[...new Set((catalog?.searches||[]).map(x=>x.q).filter(q=>typeof q==='string'&&q.trim()))].slice(0,3),items=new Map(),searches=[];let scope=null;
 for(const q of queries){try{const args={q,...(catalog.institution?{institution:catalog.institution}:{})},result=search({...args,limit:5},file);scope=result.scope;searches.push({...args,total:result.total,nextOffset:result.nextOffset,snapshot:result.snapshot,followup:{tool:'search_gov24_services',arguments:{...args,limit:5,snapshot:result.snapshot}}});for(const item of result.items)items.set(item.serviceId,item);}catch{searches.push({q,status:'failed'});}}
 return {scope,searches,items:[...items.values()].slice(0,5),omittedItems:Math.max(0,items.size-5),note:'정부24 저장 목록의 제목 후보입니다. 지자체 문서·사업과 중복될 수 있으며 현재 시행·예산·지원 조건을 확정하지 않습니다. 생략 항목은 각 검색의 followup부터 이어서 확인하세요.'};
}
module.exports={search,collect,configuredPath};
