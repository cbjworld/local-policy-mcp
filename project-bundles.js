function documentKey(value){
 try{const u=new URL(value);if(u.hostname==='www.open.go.kr'&&/^\/othicInfo\/infoList\/infoListDetl2?\.do$/.test(u.pathname)&&u.searchParams.get('prdnNstRgstNo'))return JSON.stringify([u.hostname,u.searchParams.get('prdnNstRgstNo'),u.searchParams.get('prdnDt'),u.searchParams.get('nstSeCd')]);}catch{}
 return value;
}
function identity(doc){
 const years=[...new Set(String(doc.title||'').match(/20\d{2}/g)||[])];
 const year=years.length===1?years[0]:null;
 const name=String(doc.title||'').replace(/20\d{2}년도?/g,'').replace(/20\d{2}년?/g,'').replace(/[「」『』]/g,'').replace(/\s+/g,'').replace(/\((?:안|수정|변경)\)$/,'').replace(/(?:사업)?(?:추진변경계획|추진계획|시행계획|운영계획|예산편성계획|예산서|변경계획|기본계획|모집공고|공고)(?:보고|통보|안내)?$/,'');
 return {year,name,key:doc.institution&&year&&name?JSON.stringify([doc.institution,doc.department||'',year,name]):doc.url};
}
function bundle(documents,investigations=[]){
 const groups=new Map();
 const titleCounts=new Map();
 for(const doc of [...new Map(documents.map(d=>[documentKey(d.url),d])).values()]){const k=identity(doc).key+'|'+String(doc.title).replace(/\s+/g,'');titleCounts.set(k,(titleCounts.get(k)||0)+1);}
 for(const doc of new Map(documents.map(d=>[documentKey(d.url),d])).values()){const id=identity(doc);const ambiguous=titleCounts.get(id.key+'|'+String(doc.title).replace(/\s+/g,''))>1;const key=ambiguous?doc.url:id.key;if(!groups.has(key))groups.set(key,{institution:doc.institution,name:id.name,titleYear:id.year,grouping:ambiguous?'identical-title-different-documents-kept-separate':'same-institution-department-explicit-title-year-normalized-name-only',documents:[]});const g=groups.get(key);if(!g.documents.some(x=>documentKey(x.url)===documentKey(doc.url)))g.documents.push({...doc,role:require('./relevance').documentRole(doc.title)});}
 const unambiguous=[];
 for(const g of groups.values()){
  const values=new Map();
  for(const d of g.documents){
   const result=investigations.find(x=>documentKey(x.candidate.url)===documentKey(d.url))?.result;
   if(result?.status!=='read')continue;
   for(const o of result.evidence?.organizations||[]){
    if(!['도서관명','지자체(교육청)명'].includes(o.label)||!o.value)continue;
    if(!values.has(o.label))values.set(o.label,new Set());values.get(o.label).add(o.value.replace(/\s+/g,''));
   }
  }
  // Different implementing entities make title-only grouping unsafe; retain each source separately.
  if([...values.values()].some(v=>v.size>1))unambiguous.push(...g.documents.map(d=>({...g,grouping:'different_implementing_entities_kept_separate',documents:[d]})));
  else unambiguous.push(g);
 }
 return unambiguous.map(g=>{
  g.documents.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const read=g.documents.map(d=>investigations.find(x=>documentKey(x.candidate.url)===documentKey(d.url))).filter(Boolean);
  const titleSources=g.documents.filter(d=>(d.relevance||require('./relevance').classify(d.title)).kind==='project_candidate');
  const existence={status:titleSources.length?'title_inferred':'undetermined',label:titleSources.length?'사업 존재 추정 · 제목 근거':'사업 존재 판단 유보',sources:titleSources.map(d=>({title:d.title,url:d.url})),note:'비공개·읽기 실패여도 제목이 요청 사업을 뒷받침하면 존재 추정 사례로 포함하세요. 계획안은 추진 구상이며 현재 시행·예산 확정을 뜻하지 않습니다. 본문을 읽지 못한 대상·금액·기간은 미확인으로 유지하세요.'};
  g.existence=existence;
  const fields={};for(const key of ['target','activity','budget','period']){
   const entries=read.flatMap(x=>(x.result.evidence?.fields[key]?.excerpts||[]).map(e=>({...e,documentTitle:x.candidate.title,documentUrl:x.candidate.url})));
   fields[key]={status:entries.some(e=>e.status==='evidence_candidate')?'needs_review':entries.some(e=>e.status==='redacted')?'redacted':'unconfirmed',excerpts:entries};
  }
  const periodYears=fields.period.excerpts.flatMap(e=>{
   if(e.status!=='evidence_candidate'||e.sourceScope==='attachment_reference'||!/^\s*사\s*업\s*기\s*간\s*[:：)]/.test(e.quote||''))return [];
   const years=[...new Set((e.quote||'').match(/20\d{2}/g)||[])];
   const quote=e.quote.match(/^\s*사\s*업\s*기\s*간\s*[:：)]\s*20\d{2}(?:년|\.)?/)?.[0];
   return years.length===1&&quote?[{year:years[0],documentUrl:e.documentUrl,page:e.page,quote}]:[];
  });
  const distinctYears=[...new Set(periodYears.map(e=>e.year))],businessYear=distinctYears.length===1?distinctYears[0]:null;
  const missing=Object.entries(fields).filter(([,v])=>v.status!=='needs_review').map(([k])=>k);
  const unread=g.documents.filter(d=>!investigations.some(x=>documentKey(x.candidate.url)===documentKey(d.url)));
  const organizations=read.flatMap(x=>(x.result.evidence?.organizations||[]).map(e=>({...e,documentTitle:x.candidate.title})));
  const budgetNotes=read.flatMap(x=>x.result.evidence?.budgetNotes||[]);
  const reviewFlags=[];
  if(distinctYears.length>1)reviewFlags.push('conflicting_business_years');
  if(g.titleYear&&businessYear&&g.titleYear!==businessYear)reviewFlags.push('title_year_differs_from_business_year');
  for(const key of ['target','activity','period'])if(new Set(fields[key].excerpts.map(x=>x.documentUrl)).size>1&&new Set(fields[key].excerpts.map(x=>x.quote.replace(/\s+/g,''))).size>1)reviewFlags.push('multiple_'+key+'_excerpts_compare_context_not_latest_value');
  if(new Set(organizations.filter(x=>x.label==='도서관명').map(x=>x.value)).size>1)reviewFlags.push('different_implementing_libraries');
  if(budgetNotes.some(x=>/비예산/.test(x.quote))&&fields.budget.excerpts.some(x=>x.status==='redacted'))reviewFlags.push('nonbudget_checkbox_with_redacted_budget_do_not_infer_zero');
  if(new Set(fields.budget.excerpts.map(x=>x.quote.replace(/\s+/g,''))).size>1)reviewFlags.push('multiple_budget_excerpts_compare_context_not_latest_value');
  return {...g,businessYear,businessYearEvidence:businessYear?periodYears.filter(e=>e.year===businessYear).slice(0,2):[],fields,referenceExcerpts:read.flatMap(x=>x.result.evidence?.referenceExcerpts||[]),organizations,budgetNotes,reviewFlags,missingFields:missing,nextDocuments:missing.length?unread:[],warning:'제목의 연도로 묶은 후보입니다. 같은 사업인지 본문 확인이 필요합니다. 생산일자가 최신이라고 변경계획의 확정·시행을 뜻하지 않습니다. 예산과 사업기간의 기준연도를 별도로 확인하세요.'};
 });
}
// Group for investigation only: institution/year does not establish a shared project identity.
function evidenceMap(documents,investigations=[]){
 const reads=new Map(investigations.map(x=>[documentKey(x.candidate.url),x.result.status]));
 const groups=new Map(),seen=new Set();
 const labels={plan:'계획·방침',budget:'예산 편성·변경',allocation_or_deposit:'교부·예탁',execution_or_settlement:'집행·정산',payment_related:'지급 관련 문서',payment_request:'지급 건의·요청'};
 for(const d of documents){
  const role=require('./relevance').documentRole(d.title);
  if(!labels[role]||!d.url||seen.has(documentKey(d.url)))continue;
  seen.add(documentKey(d.url));
  const year=identity(d).year,institution=d.institution||null;
  const key=institution&&year?JSON.stringify([institution,year]):d.url;
  if(!groups.has(key))groups.set(key,{institution,titleYear:year,relationship:'same_institution_year_candidates_not_confirmed_same_project',stages:[]});
  const group=groups.get(key);
  let stage=group.stages.find(x=>x.role===role);
  if(!stage){stage={role,label:labels[role],documents:[]};group.stages.push(stage);}
  stage.documents.push({title:d.title,url:d.url,department:d.department||null,readingStatus:reads.get(documentKey(d.url))||'not_attempted'});
 }
 return [...groups.values()].map(g=>({...g,missingStages:['plan','budget','allocation_or_deposit','execution_or_settlement'].filter(k=>!g.stages.some(s=>s.role===k)),note:'문서 제목에 따른 조사 경로입니다. 단계별 자료가 같은 사업인지 본문 대조가 필요하며, 미발견은 자료 부존재가 아닙니다. 지급 건의와 지급 관련 문서, 교부·예탁은 실제 집행을 확정하지 않습니다.'}));
}
module.exports={identity,bundle,evidenceMap,documentKey};
