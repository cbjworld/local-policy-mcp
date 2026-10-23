const {evidence}=require('./evidence');
const {missingFields}=require('./policy-followup');
function gaps(attempts,question=''){
 attempts=attempts.filter(a=>a.assessment!=='target_mismatch');
 const result={status:attempts.some(a=>a.status==='read')?'read':'unreadable',attempts,evidence:evidence(attempts)};
 result.targetFit=require('./relevance').targetFit(result.evidence.fields.target.excerpts.map(e=>e.quote).join(' '),question);
 return [...new Set([...missingFields(result),...require('./financial-summary').requestedGaps(result,question)])];
}
async function readMissing({url,file,attempts,reader,question='',budget}){
 const events=[],used=new Set(attempts.filter(a=>a.fileId===file.fileId&&a.source?.ocr).flatMap(a=>a.source.pages.map(p=>p.page)));
 const candidates=new Map();
 for(const a of attempts.filter(a=>a.fileId===file.fileId&&a.source?.format==='pdf'&&a.evidenceScope!=='attachment_reference'&&a.assessment!=='form_or_cover'&&a.assessment!=='target_mismatch')){
  for(const p of a.source.pages||[])if(Number.isInteger(p.page)&&p.page>=1&&p.page<=18&&!p.text.trim())candidates.set(p.page,p);
 }
 // shortcut: read the earliest textless page, then the next only if fields remain missing; never claim semantic page selection.
 for(const page of [...candidates.keys()].sort((a,b)=>a-b)){
  if(budget.remaining<=0||used.size>=2||!gaps(attempts,question).length)break;
  if(used.has(page))continue;
  const missingFields=gaps(attempts,question),event={fileId:file.fileId,fileName:file.name,page,missingFields,reason:'textless_page_with_missing_fields'};
  budget.remaining--;used.add(page);
  let result;
  try{result=await reader({url,fileId:file.fileId,page,ocr:true});}
  catch(error){result={status:'extraction_failed',message:error.message};}
  const fit=require('./relevance').targetFit(evidence([result]).fields.target.excerpts.map(e=>e.quote).join(' '),question);
  const text=(result.source?.pages||[]).map(p=>p.text).join('\n');
  const assessment=fit.status==='mismatch'?'target_mismatch':/사업기간|사업개요|사업\s*개요|소요예산|추진\s*계획|사업비/.test(text)?'plan_candidate':'text_needs_review';
  attempts.push({...result,fileId:file.fileId,fileName:file.name,evidenceScope:'document_attachment',assessment,automaticOcr:true,startPage:page});
  event.status=result.status;event.targetMismatch=assessment==='target_mismatch';
  event.remainingFields=gaps(attempts.filter(a=>a.assessment!=='target_mismatch'),question);
  events.push(event);
  if(result.source?.ocr?.status==='failed'||assessment==='target_mismatch')break;
 }
 return events;
}
module.exports={readMissing,gaps};
