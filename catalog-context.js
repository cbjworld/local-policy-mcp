const {documentKey,institutionKey}=require('./catalog-evidence');
const generic=new Set(['지원','사업','지원사업','정책','사례','계획','계획서','예산','예산과','계획과','전국','전국의']);
function lookup(request,search=require('./policy-catalog').search){
 const registry=require('./catalog-institutions.json').records;
 const words=request.topic.split(/\s+/),prefix=words[0]?.replace(/(?:에서|의)$/,'');
 const provinceMatches=r=>institutionKey((prefix||'')+r.institution)===institutionKey((r.parent||'')+r.institution)||r.parent?.replace(/(?:특별자치도|특별자치시|특별시|광역시|도)$/,'')===prefix;
 const district=registry.find(r=>r.institution===words[1]&&provinceMatches(r));
 const regionTokens=district?words.slice(0,2):registry.some(r=>r.institution===prefix)?words.slice(0,1):[];
 const municipality=district?district.parent+' '+district.institution:regionTokens.length?prefix:null;
 const queries=[...new Set(request.queries.map(q=>{let tokens=q.split(/\s+/);if(regionTokens.length&&regionTokens.every((t,i)=>tokens[i]===t))tokens=tokens.slice(regionTokens.length);return tokens.filter(w=>!generic.has(w)).join(' ').trim();}).filter(Boolean))];
 const entries=new Map(),searches=[];let coverage=null;
 for(const q of queries){try{
  const result=search({q,...(municipality?{institution:municipality}:{}),limit:20});coverage=result.coverage;
  searches.push({q,institution:municipality,total:result.total,nextOffset:result.nextOffset});
  for(const item of result.items)entries.set(item.projectId,item);
  const linked=search({q,...(municipality?{institution:municipality}:{}),limit:20,linkedOnly:true});
  Object.assign(searches.at(-1),{savedLinkedTotal:linked.total,savedLinkedNextOffset:linked.nextOffset});
  for(const item of linked.items)entries.set(item.projectId,item);
 }catch(error){searches.push({q,status:'failed',message:error.message});}}
 const ranked=[...entries.values()].sort((a,b)=>Number(b.documents.length>0)-Number(a.documents.length>0)||Number(b.documentCandidates.length>0)-Number(a.documentCandidates.length>0));
 const items=[],seenInstitutions=new Set();
 for(const item of ranked){const key=(item.parent||'')+' '+item.institution;if(seenInstitutions.has(key))continue;items.push(item);seenInstitutions.add(key);if(items.length===5)break;}
 for(const item of ranked)if(items.length<5&&!items.some(p=>p.projectId===item.projectId))items.push(item);
 const seedDocuments=new Map();
 if(!request.broad)for(const item of items)for(const link of item.documents){
  // Only direct, dated links seed live reading. Related accounts and title matches stay references.
  const date=String(link.document.date||new URL(link.document.url).searchParams.get('prdnDt')||'').replace(/\D/g,'').slice(0,8);
  if(link.relationship!=='same_named_budget_program'||date.length!==8||date<request.startDate||date>request.endDate)continue;
  const key=documentKey(link.document.url);if(!seedDocuments.has(key))seedDocuments.set(key,{...link.document,documentRole:link.document.role,discovery:'saved_catalog',savedCatalogProjectId:item.projectId});
 }
 return {institution:municipality,coverage,searches,items,seedDocuments:[...seedDocuments.values()],note:'저장된 예산·문서 연결입니다. 현재 조회에서 새로 읽은 본문과 구분하세요. 예산 항목 수는 독립 정책 수가 아닙니다. 관련 예산과목 참조와 제목 후보를 직접 사업 확인으로 바꾸거나 금액을 합산하지 마세요.'};
}
function compact(context){
 if(!context)return null;
 return {institution:context.institution,coverage:context.coverage,searches:context.searches,note:context.note,items:context.items.map(p=>({projectId:p.projectId,name:p.name,institution:p.institution,parent:p.parent,department:p.department,year:p.year,account:p.account,budgetVariants:p.budgetVariants,budgetStatus:p.budgetStatus,budgetSources:p.budgetRecords.slice(0,2).map(r=>({source:r.source,page:r.page,table:r.table,tableRow:r.tableRow,amount:r.budget,unit:r.unit})),documents:p.documents.slice(0,2).map(l=>({status:'saved_body_supported_link',relationship:l.relationship,...l.document,note:l.note,evidence:l.evidence.slice(0,3),followup:{tool:'research_open_document',arguments:{url:l.document.url}}})),omittedDocuments:Math.max(0,p.documents.length-2),documentCandidates:p.documentCandidates.slice(0,1).map(l=>({status:'title_candidate',...l.document}))}))};
}
module.exports={lookup,compact};
