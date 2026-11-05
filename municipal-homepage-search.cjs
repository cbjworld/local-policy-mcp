const fs=require('node:fs');
const {validateUrl}=require('./official-fetch');
const records=require('./catalog-institutions.json').records;
const normalize=x=>String(x||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
function search({q,institution,offset=0,limit=10}={},file=process.env.POLICY_MUNICIPAL_CATALOG){
 if(typeof q!=='string'||!q.trim()||q.length>100||institution!==undefined&&(typeof institution!=='string'||!institution.trim()||institution.length>80)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>20)throw Error('검색어, 지자체 또는 결과 범위를 확인하세요.');
 if(!file)throw Error('홈페이지 사업자료가 설정되지 않았습니다.');
 let data;try{if(fs.statSync(file).size>20*1024*1024)throw Error('too_large');data=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('홈페이지 자료를 읽을 수 없습니다. 파일과 크기 제한을 확인하세요.');}
 const sources=Array.isArray(data.sources)?data.sources:[data];if(!sources.length||sources.length>500)throw Error('홈페이지 자료 형식이 올바르지 않습니다.');
 const terms=q.trim().split(/\s+/).map(normalize),rows=[],coverage=[],seen=new Set();
 for(const source of sources){
  if(!Array.isArray(source.items)||typeof source.source!=='string'||!/^[a-f0-9]{64}$/.test(source.sha256||'')||seen.has(source.source))throw Error('홈페이지 자료 형식이 올바르지 않습니다.');seen.add(source.source);
  const host=validateUrl(source.source).hostname,municipalities=records.filter(x=>{try{return new URL(x.url).hostname===host&&!x.institution.includes('(편성 당시)')}catch{return false}}),identity=municipalities.length===1?municipalities[0]:null;
  if(!identity)throw Error('홈페이지의 지자체를 주소록에서 유일하게 확인할 수 없습니다.');
  const region=normalize(identity.parent+' '+identity.institution);coverage.push({institution:identity.institution,parent:identity.parent,source:source.source,sourceSha256:source.sha256,extractedAt:typeof source.extractedAt==='string'?source.extractedAt:null,skippedTables:source.skipped?.length||0});
  for(const row of source.items){
   const rawFields=row?.fields&&typeof row.fields==='object'&&!Array.isArray(row.fields)?Object.entries(row.fields).filter(([k,v])=>typeof v==='string'):[],fields=Object.fromEntries(rawFields.slice(0,20).map(([k,v])=>[k.slice(0,100),v.slice(0,2000)]));
   if(row&&row.source===source.source&&typeof row.name==='string'&&typeof row.content==='string'&&Number.isInteger(row.location?.table)&&Number.isInteger(row.location?.row)&&terms.every(t=>normalize(row.name+' '+row.content+' '+rawFields.map(([,v])=>v).join(' ')).includes(t))&&(!institution||institution.trim().split(/\s+/).every(t=>region.includes(normalize(t)))))rows.push({name:row.name,content:row.content.slice(0,2000),contentTruncated:row.content.length>2000,department:row.department,fields,fieldsTruncated:rawFields.length>20||rawFields.some(([k,v])=>k.length>100||v.length>2000),links:Array.isArray(row.links)?row.links.filter(x=>typeof x==='string'&&/^https:\/\//.test(x)).slice(0,20):[],institution:identity.institution,parent:identity.parent,source:row.source,sourceSha256:source.sha256,location:row.location,status:'source_row_candidate'});
  }
 }
 return {scope:{sources:coverage,coverage:'수록된 홈페이지의 추출된 표 행만 검색합니다. 전국 전체나 현재 시행 여부를 뜻하지 않습니다.'},total:rows.length,offset,nextOffset:offset+limit<rows.length?offset+limit:null,items:rows.slice(offset,offset+limit)};
}
module.exports={search};
