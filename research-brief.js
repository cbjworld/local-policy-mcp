// A document-level digest: never merge amounts across documents or institutions.
module.exports=function researchBrief(documents,links=[]){
 const evidenceCount=d=>d.supportingOnly?0:(d.reading?.fields||[]).filter(f=>f.evidence?.some(e=>e.quote)).length;
 const rows=documents.filter(d=>d.classification==='project_candidate').sort((a,b)=>evidenceCount(b)-evidenceCount(a)||Number(b.readingStatus==='read'&&!b.supportingOnly)-Number(a.readingStatus==='read'&&!a.supportingOnly)).map(d=>({
  targetFit:d.targetFit,documentId:d.id,institution:d.institution,title:d.title,url:d.url,
  basis:d.targetFit?.requested?.length&&d.targetFit.status==='unspecified'&&d.readingStatus==='read'?'본문 열람 · 요청 대상 관련성 미확인':d.readingStatus==='read'&&!d.supportingOnly?(evidenceCount(d)?'본문 근거 후보':'본문 열람 · 핵심 근거 미확인'):'제목으로 사업 존재 추정',
  role:d.role,
  fields:Object.fromEntries(['target','activity','budget','period'].map(key=>{
   const f=!d.supportingOnly&&d.reading?.fields.find(f=>f.key===key);
   const excerpts=f?.evidence?.filter(e=>e.quote&&e.quote.length<=500)||[];
   const quote=(key==='target'&&excerpts.find(e=>/^신\s*청\s*자\s*격/.test(e.quote)))||excerpts[0];
   return [key,{state:f?.state||'미확인',...(key==='budget'&&f?.financialAmounts?.length?{financialAmounts:f.financialAmounts.slice(0,3).map(a=>({role:a.role,label:a.label,amountTexts:a.amountTexts,recipientBasis:a.recipientBasis,amountBasis:a.amountBasis,url:a.url,page:a.page,sourceId:a.sourceId,...(a.quote?.length<=300?{quote:a.quote}:{detailDocumentId:d.id})})),omittedFinancialAmounts:Math.max(0,f.financialAmounts.length-3)}:{}),...(key==='target'&&f?.deliveryQualifications?.length?{deliveryQualifications:f.deliveryQualifications}:{}),...(quote?{quote:quote.quote,url:quote.url||d.url,page:quote.page,sourceId:quote.sourceId}:{}),...(f?.evidence?.length&&!quote?{detailDocumentId:d.id}:{})}];
  }))
 }));
 const children=new Set();
 for(const link of links){
  const primary=rows.find(r=>r.url===link.primaryUrl);
  const members=rows.filter(r=>r.url!==link.primaryUrl&&link.documents.some(d=>d.url===r.url));
  if(!primary||!members.length)continue;
  primary.programName=link.name;primary.programYear=link.year;primary.countAsOneCase=true;
  primary.participatingInstitutions=[...new Set([primary.institution,...members.map(m=>m.institution)])];
  primary.linkedDocuments=members;primary.budgetRule=link.budgetRule;
  for(const member of members)children.add(member.url);
 }
 return rows.filter(r=>!children.has(r.url)).slice(0,6);
};
