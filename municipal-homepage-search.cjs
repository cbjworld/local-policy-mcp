const fs=require('node:fs');
const crypto=require('node:crypto');
const {validateUrl}=require('./official-fetch');
const {temporaryUrl}=require('./municipal-stage-download.cjs');
const records=require('./catalog-institutions.json').records;
const municipalitiesByHost=new Map();
for(const record of records){try{if(record.institution.includes('(편성 당시)'))continue;const host=new URL(record.url).hostname;const current=municipalitiesByHost.get(host)||[];current.push(record);municipalitiesByHost.set(host,current)}catch{}}
const normalize=x=>String(x||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
function safeLink(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!temporaryUrl(u)}catch{return false}}
function search({q,institution,offset=0,limit=10,sourceOffset=0,sourceLimit=20,contentOffset=0,contentLimit=2000,snapshot}={},file=require('./municipal-catalog-path.cjs')()){
 if(typeof q!=='string'||!q.trim()||q.length>100||institution!==undefined&&(typeof institution!=='string'||!institution.trim()||institution.length>80)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>20||!Number.isInteger(sourceOffset)||sourceOffset<0||!Number.isInteger(sourceLimit)||sourceLimit<1||sourceLimit>100||!Number.isInteger(contentOffset)||contentOffset<0||!Number.isInteger(contentLimit)||contentLimit<1||contentLimit>2000)throw Error('검색어, 지자체 또는 결과 범위를 확인하세요.');
 if(!file)throw Error('홈페이지 사업자료가 설정되지 않았습니다.');
 const inferredInstitution=institution===undefined?require('./region-aliases').inferInstitution(q,records):null;
 const ambiguousInstitution=institution===undefined?require('./region-aliases').ambiguousInstitution(q,records):null;
 if(inferredInstitution)institution=inferredInstitution;
 else if(ambiguousInstitution)institution=ambiguousInstitution.name;
 let data,version;try{if(fs.statSync(file).size>20*1024*1024)throw Error('too_large');const bytes=fs.readFileSync(file);if(bytes.length>20*1024*1024)throw Error('too_large');version=crypto.createHash('sha256').update(JSON.stringify([q,institution??null])).update('\0').update(bytes).digest('hex');data=JSON.parse(bytes.toString('utf8'));}catch{throw Error('홈페이지 자료를 읽을 수 없습니다. 파일과 크기 제한을 확인하세요.');}
 if(snapshot!==undefined&&(typeof snapshot!=='string'||snapshot!==version))throw Error('질문·지자체 또는 홈페이지 자료가 변경되어 이어볼 수 없습니다. 처음부터 다시 검색하세요.');
 const sources=Array.isArray(data.sources)?data.sources:[data];if(!sources.length||sources.length>5000)throw Error('홈페이지 자료 형식이 올바르지 않습니다.');
 const effectiveQuery=require('./region-aliases').queryWithoutRegion(q,institution);
 const regionTerms=institution?require('./region-aliases').regionTerms(institution).map(normalize):null;
 const terms=effectiveQuery.trim().split(/\s+/).map(normalize),rows=[],equivalent=[],partial=[],coverage=[],regionCoverage=[],seen=new Set();
 const targetTerms=terms.filter(t=>/^(청년|어르신|노인|고령자)$/.test(t)),subjectTerms=terms.filter(t=>!targetTerms.includes(t));
 for(const source of sources){
  if(!Array.isArray(source.items)||source.skipped!==undefined&&!Array.isArray(source.skipped)||typeof source.source!=='string'||!/^[a-f0-9]{64}$/.test(source.sha256||'')||seen.has(source.source))throw Error('홈페이지 자료 형식이 올바르지 않습니다.');seen.add(source.source);
  const sourceUrl=validateUrl(source.source);if(temporaryUrl(sourceUrl))throw Error('임시 접속 정보가 포함된 출처는 사용할 수 없습니다.');
  const municipalities=municipalitiesByHost.get(sourceUrl.hostname)||[],identity=municipalities.length===1?municipalities[0]:null;
  if(!identity)throw Error('홈페이지의 지자체를 주소록에서 유일하게 확인할 수 없습니다.');
  const regionMatches=!regionTerms||require('./region-aliases').matchesRegion(regionTerms,identity),entry={institution:identity.institution,parent:identity.parent,source:source.source,sourceSha256:source.sha256,extractedAt:typeof source.extractedAt==='string'?source.extractedAt:null,skippedEntries:Array.isArray(source.skipped)?source.skipped.length:0};coverage.push(entry);if(regionMatches)regionCoverage.push(entry);
  for(const row of source.items){
   const rawFields=row?.fields&&typeof row.fields==='object'&&!Array.isArray(row.fields)?Object.entries(row.fields).filter(([k,v])=>typeof v==='string'):[],fields=Object.fromEntries(rawFields.slice(0,20).map(([k,v])=>[k.slice(0,100),v.slice(0,2000)]));
   if(!row||row.source!==source.source||typeof row.name!=='string'||typeof row.content!=='string'||!((Number.isInteger(row.location?.table)&&row.location.table>0&&Number.isInteger(row.location?.row)&&row.location.row>0&&row.location.section===undefined&&row.location.elementId===undefined&&row.location.elementClass===undefined)||(Number.isInteger(row.location?.section)&&row.location.section>0&&row.location.table===undefined&&row.location.row===undefined&&row.location.elementId===undefined&&row.location.elementClass===undefined)||(['contents','conts','content','body_content'].includes(row.location?.elementId)&&row.location.table===undefined&&row.location.row===undefined&&row.location.section===undefined&&row.location.elementClass===undefined)||(((row.location?.elementClass==='view_cont'&&sourceUrl.hostname==='www.gumi.go.kr'&&sourceUrl.pathname.includes('/board/post/view.do'))||(row.location?.elementClass==='board-view-content'&&sourceUrl.hostname==='www.seongnam.go.kr'&&/^\/bbs[0-9]+\/[0-9]+$/.test(sourceUrl.pathname))||(row.location?.elementClass==='con_wrap'&&sourceUrl.hostname==='www.ansan.go.kr'&&sourceUrl.pathname==='/iloveyou/sub/contents.do')||(row.location?.elementClass==='tview_desc'&&sourceUrl.hostname==='www.yongin.go.kr'&&sourceUrl.pathname==='/user/bbs/BD_selectBbs.do')||(row.location?.elementClass==='con'&&sourceUrl.hostname==='www.bsseogu.go.kr'&&sourceUrl.pathname==='/news/board/view.do'))&&row.location.table===undefined&&row.location.row===undefined&&row.location.section===undefined&&row.location.elementId===undefined))||!regionMatches)continue;
   const text=row.name+' '+row.content+' '+rawFields.map(([,v])=>v).join(' '),normalized=normalize(text),exact=terms.every(t=>normalized.includes(t));
   const fit=require('./relevance').targetFit(text,effectiveQuery).status;
   const synonym=!exact&&targetTerms.length===1&&/^(어르신|노인|고령자)$/.test(targetTerms[0])&&subjectTerms.length>0&&subjectTerms.every(t=>normalized.includes(t))&&fit==='match';
   const fallback=!exact&&!synonym&&targetTerms.length===1&&subjectTerms.length>0&&subjectTerms.every(t=>normalize(row.name).includes(t))&&!normalized.includes(targetTerms[0])&&fit==='unspecified';
   if(!exact&&!synonym&&!fallback)continue;
   const chars=Array.from(row.content),nextContentOffset=contentOffset+contentLimit<chars.length?contentOffset+contentLimit:null;
   const targetFields=rawFields.filter(([key])=>/^(?:지원|신청|사업|수혜)?대상(?:자)?$/.test(normalize(key))).map(([,value])=>value).join(' ');
   const staffTarget=targetTerms.some(t=>/^(어르신|노인|고령자)$/.test(t))&&/(?:생활지원사|요양보호사|활동지원사|돌봄\s*종사자)/.test(targetFields);
   const item={name:row.name,content:chars.slice(contentOffset,contentOffset+contentLimit).join(''),contentColumn:typeof row.contentColumn==='string'?row.contentColumn:null,contentTruncated:contentOffset>0||nextContentOffset!==null,contentOffset,nextContentOffset,contentLength:chars.length,department:row.department,fields,fieldsTruncated:rawFields.length>20||rawFields.some(([k,v])=>k.length>100||v.length>2000),links:Array.isArray(row.links)?row.links.filter(x=>typeof x==='string'&&safeLink(x)).slice(0,20):[],institution:identity.institution,parent:identity.parent,source:row.source,sourceSha256:source.sha256,location:row.location,status:row.location.elementClass==='con_wrap'?'source_detail_candidate':row.location.elementClass?'source_notice_candidate':row.location.elementId?'source_detail_candidate':row.location.section?'source_section_candidate':'source_row_candidate',queryMatch:exact?'all_terms':synonym?'target_equivalent':'target_unconfirmed',...(synonym?{note:'어르신·노인·고령자 또는 65세 이상 등의 표현을 같은 대상군으로 찾아낸 후보입니다. 구체적인 자격은 원문을 확인하세요.'}:fallback?{missingTerms:targetTerms,note:'사업명은 검색 주제와 맞지만 요청한 대상이 원문 자료에서 확인되지 않습니다.'}:{})};
   if(staffTarget)item.beneficiaryWarning='지원대상에 돌봄 종사자가 포함되어 있습니다. 돌봄을 받는 어르신을 지원하는 사업인지 별도로 확인하세요.';
   if(row.location.elementClass==='con_wrap')item.matchScope='whole_page';else if(row.location.elementClass)item.matchScope='notice_body';else if(row.location.elementId)item.matchScope='whole_page';
   (exact?rows:synonym?equivalent:partial).push(item);
  }
 }
 const chosen=[...rows,...equivalent,...partial];
 const totalInstitutions=new Set(coverage.map(x=>JSON.stringify([x.parent,x.institution]))).size,skippedEntries=coverage.reduce((sum,x)=>sum+x.skippedEntries,0);
 return {snapshot:version,...(inferredInstitution?{inferredInstitution}:{}),...(ambiguousInstitution?{ambiguousInstitution}:{}),scope:{dataset:require('node:path').resolve(file)===require('node:path').resolve(__dirname,'data','municipal-kogl1-20261106.json')?'bundled_sample':'configured',sources:coverage.slice(sourceOffset,sourceOffset+sourceLimit),totalSources:coverage.length,totalInstitutions,skippedEntries,...(institution?{selectedRegion:{institution,totalSources:regionCoverage.length,totalInstitutions:new Set(regionCoverage.map(x=>JSON.stringify([x.parent,x.institution]))).size,skippedEntries:regionCoverage.reduce((sum,x)=>sum+x.skippedEntries,0),note:'지정한 지역과 일치하는 저장 출처 범위입니다. 자료가 없다고 사업이 없다는 뜻은 아닙니다.'}}:{}),sourceOffset,nextSourceOffset:sourceOffset+sourceLimit<coverage.length?sourceOffset+sourceLimit:null,coverage:'수록된 홈페이지의 추출된 표 행과 사업별 안내·개별 페이지 본문만 검색합니다. 미처리 항목은 사업 수가 아닙니다. 전국 전체나 현재 시행 여부를 뜻하지 않습니다.'},...(effectiveQuery!==q?{effectiveQuery}:{}),matchMode:equivalent.length?'includes_target_equivalent':rows.length?(partial.length?'all_terms_and_target_unconfirmed':'all_terms'):partial.length?'target_unconfirmed':'no_match',matchCounts:{allTerms:rows.length,targetEquivalent:equivalent.length,targetUnconfirmed:partial.length},total:chosen.length,offset,nextOffset:offset+limit<chosen.length?offset+limit:null,items:chosen.slice(offset,offset+limit)};
}
module.exports={search};
