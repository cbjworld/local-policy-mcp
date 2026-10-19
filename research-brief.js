// A document-level digest: never merge amounts across documents or institutions.
module.exports=function researchBrief(documents,links=[]){
 const rows=documents.filter(d=>d.classification==='project_candidate').sort((a,b)=>Number(b.readingStatus==='read'&&!b.supportingOnly)-Number(a.readingStatus==='read'&&!a.supportingOnly)).map(d=>({
  documentId:d.id,institution:d.institution,title:d.title,url:d.url,
  basis:d.readingStatus==='read'&&!d.supportingOnly?'본문 근거 후보':'제목으로 사업 존재 추정',
  role:d.role,
  fields:Object.fromEntries(['target','activity','budget','period'].map(key=>{
   const f=!d.supportingOnly&&d.reading?.fields.find(f=>f.key===key);
   const quote=f?.evidence?.find(e=>e.quote&&e.quote.length<=500);
   return [key,{state:f?.state||'미확인',...(quote?{quote:quote.quote,url:quote.url||d.url,page:quote.page,sourceId:quote.sourceId}:{}),...(f?.evidence?.length&&!quote?{detailDocumentId:d.id}:{})}];
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
