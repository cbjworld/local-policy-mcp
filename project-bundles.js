function identity(doc){
 const years=[...new Set(String(doc.title||'').match(/20\d{2}/g)||[])];
 const year=years.length===1?years[0]:null;
 const name=String(doc.title||'').replace(/20\d{2}년도?/g,'').replace(/20\d{2}년?/g,'').replace(/[「」『』]/g,'').replace(/\s+/g,'').replace(/\((?:안|수정|변경)\)$/,'').replace(/(?:사업)?(?:추진변경계획|추진계획|시행계획|운영계획|예산편성계획|예산서|변경계획|기본계획|모집공고|공고)(?:보고)?$/,'');
 return {year,name,key:doc.institution&&year&&name?JSON.stringify([doc.institution,doc.department||'',year,name]):doc.url};
}
function bundle(documents,investigations=[]){
 const groups=new Map();
 const titleCounts=new Map();
 for(const doc of [...new Map(documents.map(d=>[d.url,d])).values()]){const k=identity(doc).key+'|'+String(doc.title).replace(/\s+/g,'');titleCounts.set(k,(titleCounts.get(k)||0)+1);}
 for(const doc of documents){const id=identity(doc);const ambiguous=titleCounts.get(id.key+'|'+String(doc.title).replace(/\s+/g,''))>1;const key=ambiguous?doc.url:id.key;if(!groups.has(key))groups.set(key,{institution:doc.institution,name:id.name,titleYear:id.year,grouping:ambiguous?'identical-title-different-documents-kept-separate':'same-institution-department-explicit-title-year-normalized-name-only',documents:[]});const g=groups.get(key);if(!g.documents.some(x=>x.url===doc.url))g.documents.push({...doc,role:require('./relevance').documentRole(doc.title)});}
 return [...groups.values()].map(g=>{
  g.documents.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const read=g.documents.map(d=>investigations.find(x=>x.candidate.url===d.url)).filter(Boolean);
  const titleSources=g.documents.filter(d=>(d.relevance||require('./relevance').classify(d.title)).kind==='project_candidate');
  const existence={status:titleSources.length?'title_inferred':'undetermined',label:titleSources.length?'사업 존재 추정 · 제목 근거':'사업 존재 판단 유보',sources:titleSources.map(d=>({title:d.title,url:d.url})),note:'비공개·읽기 실패여도 제목이 요청 사업을 뒷받침하면 존재 추정 사례로 포함하세요. 계획안은 추진 구상이며 현재 시행·예산 확정을 뜻하지 않습니다. 본문을 읽지 못한 대상·금액·기간은 미확인으로 유지하세요.'};
  g.existence=existence;
  const fields={};for(const key of ['target','activity','budget','period']){
   const entries=read.flatMap(x=>(x.result.evidence?.fields[key]?.excerpts||[]).map(e=>({...e,documentTitle:x.candidate.title,documentUrl:x.candidate.url})));
   fields[key]={status:entries.some(e=>e.status==='evidence_candidate')?'needs_review':entries.some(e=>e.status==='redacted')?'redacted':'unconfirmed',excerpts:entries};
  }
  const missing=Object.entries(fields).filter(([,v])=>v.status!=='needs_review').map(([k])=>k);
  const unread=g.documents.filter(d=>!investigations.some(x=>x.candidate.url===d.url));
  const organizations=read.flatMap(x=>(x.result.evidence?.organizations||[]).map(e=>({...e,documentTitle:x.candidate.title})));
  const budgetNotes=read.flatMap(x=>x.result.evidence?.budgetNotes||[]);
  const reviewFlags=[];
  for(const key of ['target','activity','period'])if(new Set(fields[key].excerpts.map(x=>x.documentUrl)).size>1&&new Set(fields[key].excerpts.map(x=>x.quote.replace(/\s+/g,''))).size>1)reviewFlags.push('multiple_'+key+'_excerpts_compare_context_not_latest_value');
  if(new Set(organizations.filter(x=>x.label==='도서관명').map(x=>x.value)).size>1)reviewFlags.push('different_implementing_libraries');
  if(budgetNotes.some(x=>/비예산/.test(x.quote))&&fields.budget.excerpts.some(x=>x.status==='redacted'))reviewFlags.push('nonbudget_checkbox_with_redacted_budget_do_not_infer_zero');
  if(new Set(fields.budget.excerpts.map(x=>x.quote.replace(/\s+/g,''))).size>1)reviewFlags.push('multiple_budget_excerpts_compare_context_not_latest_value');
  return {...g,fields,referenceExcerpts:read.flatMap(x=>x.result.evidence?.referenceExcerpts||[]),organizations,budgetNotes,reviewFlags,missingFields:missing,nextDocuments:missing.length?unread:[],warning:'제목의 연도로 묶은 후보입니다. 같은 사업인지 본문 확인이 필요합니다. 생산일자가 최신이라고 변경계획의 확정·시행을 뜻하지 않습니다. 예산과 사업기간의 기준연도를 별도로 확인하세요.'};
 });
}
module.exports={identity,bundle};
