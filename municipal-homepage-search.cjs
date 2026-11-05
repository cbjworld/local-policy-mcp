const fs=require('node:fs');
const {validateUrl}=require('./official-fetch');
const {temporaryUrl}=require('./municipal-stage-download.cjs');
const records=require('./catalog-institutions.json').records;
const municipalitiesByHost=new Map();
for(const record of records){try{if(record.institution.includes('(편성 당시)'))continue;const host=new URL(record.url).hostname;const current=municipalitiesByHost.get(host)||[];current.push(record);municipalitiesByHost.set(host,current)}catch{}}
const normalize=x=>String(x||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
function safeLink(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!temporaryUrl(u)}catch{return false}}
function search({q,institution,offset=0,limit=10,sourceOffset=0,sourceLimit=20,contentOffset=0,contentLimit=2000}={},file=process.env.POLICY_MUNICIPAL_CATALOG){
 if(typeof q!=='string'||!q.trim()||q.length>100||institution!==undefined&&(typeof institution!=='string'||!institution.trim()||institution.length>80)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>20||!Number.isInteger(sourceOffset)||sourceOffset<0||!Number.isInteger(sourceLimit)||sourceLimit<1||sourceLimit>100||!Number.isInteger(contentOffset)||contentOffset<0||!Number.isInteger(contentLimit)||contentLimit<1||contentLimit>2000)throw Error('검색어, 지자체 또는 결과 범위를 확인하세요.');
 if(!file)throw Error('홈페이지 사업자료가 설정되지 않았습니다.');
 let data;try{if(fs.statSync(file).size>20*1024*1024)throw Error('too_large');data=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('홈페이지 자료를 읽을 수 없습니다. 파일과 크기 제한을 확인하세요.');}
 const sources=Array.isArray(data.sources)?data.sources:[data];if(!sources.length||sources.length>5000)throw Error('홈페이지 자료 형식이 올바르지 않습니다.');
 const effectiveQuery=require('./region-aliases').queryWithoutRegion(q,institution);
 const terms=effectiveQuery.trim().split(/\s+/).map(normalize),rows=[],partial=[],coverage=[],seen=new Set();
 const targetTerms=terms.filter(t=>/^(청년|어르신|노인|고령자)$/.test(t)),subjectTerms=terms.filter(t=>!targetTerms.includes(t));
 for(const source of sources){
  if(!Array.isArray(source.items)||source.skipped!==undefined&&!Array.isArray(source.skipped)||typeof source.source!=='string'||!/^[a-f0-9]{64}$/.test(source.sha256||'')||seen.has(source.source))throw Error('홈페이지 자료 형식이 올바르지 않습니다.');seen.add(source.source);
  const sourceUrl=validateUrl(source.source);if(temporaryUrl(sourceUrl))throw Error('임시 접속 정보가 포함된 출처는 사용할 수 없습니다.');
  const municipalities=municipalitiesByHost.get(sourceUrl.hostname)||[],identity=municipalities.length===1?municipalities[0]:null;
  if(!identity)throw Error('홈페이지의 지자체를 주소록에서 유일하게 확인할 수 없습니다.');
  const region=normalize(identity.parent+' '+identity.institution);coverage.push({institution:identity.institution,parent:identity.parent,source:source.source,sourceSha256:source.sha256,extractedAt:typeof source.extractedAt==='string'?source.extractedAt:null,skippedEntries:Array.isArray(source.skipped)?source.skipped.length:0});
  for(const row of source.items){
   const rawFields=row?.fields&&typeof row.fields==='object'&&!Array.isArray(row.fields)?Object.entries(row.fields).filter(([k,v])=>typeof v==='string'):[],fields=Object.fromEntries(rawFields.slice(0,20).map(([k,v])=>[k.slice(0,100),v.slice(0,2000)]));
   if(!row||row.source!==source.source||typeof row.name!=='string'||typeof row.content!=='string'||!((Number.isInteger(row.location?.table)&&row.location.table>0&&Number.isInteger(row.location?.row)&&row.location.row>0&&row.location.section===undefined&&row.location.elementId===undefined)||(Number.isInteger(row.location?.section)&&row.location.section>0&&row.location.table===undefined&&row.location.row===undefined&&row.location.elementId===undefined)||(['contents','conts','content','body_content'].includes(row.location?.elementId)&&row.location.table===undefined&&row.location.row===undefined&&row.location.section===undefined))||institution&&!institution.trim().split(/\s+/).every(t=>region.includes(normalize(t))))continue;
   const text=row.name+' '+row.content+' '+rawFields.map(([,v])=>v).join(' '),normalized=normalize(text),exact=terms.every(t=>normalized.includes(t));
   const fallback=targetTerms.length===1&&subjectTerms.length>0&&subjectTerms.every(t=>normalize(row.name).includes(t))&&!normalized.includes(targetTerms[0])&&require('./relevance').targetFit(text,effectiveQuery).status==='unspecified';
   if(!exact&&!fallback)continue;
   const chars=Array.from(row.content),nextContentOffset=contentOffset+contentLimit<chars.length?contentOffset+contentLimit:null;
   const item={name:row.name,content:chars.slice(contentOffset,contentOffset+contentLimit).join(''),contentColumn:typeof row.contentColumn==='string'?row.contentColumn:null,contentTruncated:contentOffset>0||nextContentOffset!==null,contentOffset,nextContentOffset,contentLength:chars.length,department:row.department,fields,fieldsTruncated:rawFields.length>20||rawFields.some(([k,v])=>k.length>100||v.length>2000),links:Array.isArray(row.links)?row.links.filter(x=>typeof x==='string'&&safeLink(x)).slice(0,20):[],institution:identity.institution,parent:identity.parent,source:row.source,sourceSha256:source.sha256,location:row.location,status:row.location.elementId?'source_detail_candidate':row.location.section?'source_section_candidate':'source_row_candidate',queryMatch:exact?'all_terms':'target_unconfirmed',...(!exact?{missingTerms:targetTerms,note:'사업명은 검색 주제와 맞지만 요청한 대상이 원문 행에서 확인되지 않습니다.'}:{})};
   (exact?rows:partial).push(item);
  }
 }
 const chosen=rows.length?rows:partial;
 const totalInstitutions=new Set(coverage.map(x=>JSON.stringify([x.parent,x.institution]))).size,skippedEntries=coverage.reduce((sum,x)=>sum+x.skippedEntries,0);
 return {scope:{sources:coverage.slice(sourceOffset,sourceOffset+sourceLimit),totalSources:coverage.length,totalInstitutions,skippedEntries,sourceOffset,nextSourceOffset:sourceOffset+sourceLimit<coverage.length?sourceOffset+sourceLimit:null,coverage:'수록된 홈페이지의 추출된 표 행과 사업별 안내·개별 페이지 본문만 검색합니다. 미처리 항목은 사업 수가 아닙니다. 전국 전체나 현재 시행 여부를 뜻하지 않습니다.'},...(effectiveQuery!==q?{effectiveQuery}:{}),matchMode:rows.length?'all_terms':partial.length?'target_unconfirmed':'no_match',total:chosen.length,offset,nextOffset:offset+limit<chosen.length?offset+limit:null,items:chosen.slice(offset,offset+limit)};
}
module.exports={search};
