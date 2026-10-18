// A document-level digest: never merge amounts across documents or institutions.
module.exports=function researchBrief(documents){
 return documents.filter(d=>d.classification==='project_candidate').sort((a,b)=>Number(b.readingStatus==='read'&&!b.supportingOnly)-Number(a.readingStatus==='read'&&!a.supportingOnly)).slice(0,6).map(d=>({
  documentId:d.id,institution:d.institution,title:d.title,url:d.url,
  basis:d.readingStatus==='read'&&!d.supportingOnly?'본문 근거 후보':'제목으로 사업 존재 추정',
  role:d.role,
  fields:Object.fromEntries(['target','activity','budget','period'].map(key=>{
   const f=!d.supportingOnly&&d.reading?.fields.find(f=>f.key===key);
   const quote=f?.evidence?.find(e=>e.quote&&e.quote.length<=500);
   return [key,{state:f?.state||'미확인',...(quote?{quote:quote.quote,url:quote.url||d.url,page:quote.page,sourceId:quote.sourceId}:{}),...(f?.evidence?.length&&!quote?{detailDocumentId:d.id}:{})}];
  }))
 }));
};
