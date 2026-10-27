const {missingFields,sameBusinessCandidate,sameBusinessEvidence}=require('./policy-followup');
const {requestedGaps,summarize}=require('./financial-summary');
const {documentKey}=require('./project-bundles');
function gaps(base,investigations,question){
 const related=investigations.filter(x=>x===base||!['different_implementing_entity','unconfirmed_business_identity'].includes(x.relationshipStatus)&&sameBusinessEvidence(base,x));
 const core=missingFields(base.result,question).filter(k=>!related.some(x=>!missingFields(x.result,question).includes(k)));
 const financial=requestedGaps(base.result,question).filter(k=>!related.some(x=>x.result.status==='read'&&x.result.relevanceStatus!=='supporting_document'&&x.result.targetFit?.status!=='mismatch'&&summarize(x.result.attempts||[],x.result.evidence?.fields?.budget?.amounts).rows.some(r=>r.key===k&&['stated','calculated'].includes(r.status))));
 return [...core,...financial];
}
async function supplement({request,investigations,allDocuments,io,byUrl,candidates,financialDocuments,stageDocuments,ocrBudget={remaining:2},focusUrls}){
 const events=[],searched=new Set();
 const tried=d=>investigations.some(x=>documentKey(x.candidate.url)===documentKey(d.url));
 const inFocus=x=>!focusUrls||focusUrls.has(x.candidate.url);
 const bases=()=>investigations.filter(x=>inFocus(x)&&!x.purpose&&!(x.result.status!=='read'&&investigations.filter(y=>y.candidate.institution===x.candidate.institution).length>=2)&&gaps(x,investigations,request.question).length).sort((a,b)=>Number(b.result.status==='read')-Number(a.result.status==='read'));
 for(let n=0;n<2;n++){
  let anchor,item,purpose='fill_missing_evidence';
  for(const base of bases()){
   const found=allDocuments.filter(d=>!d.readingDecision&&!tried(d)&&sameBusinessCandidate(base.candidate,d)).sort((a,b)=>Number(['budget','plan'].includes(b.documentRole))-Number(['budget','plan'].includes(a.documentRole)))[0];
   if(found){anchor=base;item=found;break;}
  }
  if(!item&&!events.some(e=>e.purpose==='link_financial_evidence')){
   const {identity}=require('./project-bundles');
   for(const d of financialDocuments.filter(d=>!d.readingDecision&&!tried(d)&&stageDocuments.some(s=>s.url===d.url))){
    const base=investigations.find(x=>{
     if(!inFocus(x))return false;
     const a=x.candidate,year=identity(d).year,otherYear=identity(a).year;
     return a.institution&&d.institution&&!(year&&otherYear&&year!==otherYear)&&!(a.department&&d.department&&a.department!==d.department)&&(d.institution===a.institution||x.result.status==='read'&&(a.institution.startsWith(d.institution+' ')||d.institution.startsWith(a.institution+' ')));
    });
    if(base&&gaps(base,investigations,request.question).some(k=>['budget','planBudget','supportBudget','promotionBudget'].includes(k))){anchor=base;item=d;purpose='link_financial_evidence';break;}
   }
  }
  if(!item){
   anchor=bases().find(x=>!searched.has(x.candidate.institution));
   if(!anchor)break;
   searched.add(anchor.candidate.institution);
   const missing=gaps(anchor,investigations,request.question);
   const q=missing.includes('benefit')&&!missing.some(k=>['budget','planBudget'].includes(k))?anchor.candidate.title.replace(/20\d{2}년?/g,'').replace(/(?:추진|시행)계획.*$/,'').replace(/[「」『』]/g,'').trim()+' 시행계획':request.queries[0]+' '+(missing.some(k=>['budget','planBudget','supportBudget','promotionBudget'].includes(k))?'예산':'계획');
   // Search dates are production dates; a next-year plan may be written in the preceding year.
   const args={q,scope:'all',page:1,startDate:request.startDate,endDate:request.endDate};
   const event={fromUrl:anchor.candidate.url,missingFields:missing,search:args,status:'no_matching_document',candidates:[]};events.push(event);
   try{
    const result=await io.search(args);event.searchTotal=result.total;event.hasMore=result.hasMore;
    for(const doc of [...result.items,...result.reviewItems,...result.relatedDocuments]){
     if(!sameBusinessCandidate(anchor.candidate,doc))continue;
     const d={...doc,documentRole:doc.documentRole||require('./relevance').documentRole(doc.title)};
     if(['비공개','열람제한'].includes(d.disclosure))d.readingDecision={status:'listed_nonpublic',reason:'목록상 비공개·열람제한'};
     event.candidates.push({title:d.title,url:d.url,readingDecision:d.readingDecision});
     if(!byUrl.has(documentKey(d.url))){byUrl.set(documentKey(d.url),d);allDocuments.push(d);stageDocuments.push(d);if(['budget','allocation_or_deposit','execution_or_settlement'].includes(d.documentRole))financialDocuments.push(d);else candidates.push(d);}
    }
    item=allDocuments.find(d=>!d.readingDecision&&!tried(d)&&sameBusinessCandidate(anchor.candidate,d));
   }catch(error){event.status='search_failed';event.message=error.message;}
   if(!item)continue;
  }
  item={...item,followup:{fromUrl:anchor.candidate.url,missingFields:gaps(anchor,investigations,request.question),relationship:purpose==='link_financial_evidence'?'financial_stage_candidate_not_confirmed_same_business':'same_name_institution_department_candidate'}};
  const missing=gaps(anchor,investigations,request.question),event={purpose,relationship:item.followup.relationship,fromUrl:anchor.candidate.url,url:item.url,title:item.title,role:item.documentRole,missingFields:missing,status:'reading'};events.push(event);
  try{
   const result=await io.research({url:item.url,requestedQuery:request.question,autoOcr:ocrBudget.remaining>0},{ocrBudget});
   const different=['도서관명','지자체(교육청)명'].some(label=>{
    const names=r=>(r.evidence?.organizations||[]).filter(o=>o.label===label).map(o=>o.value.replace(/\s+/g,''));
    const a=names(anchor.result),b=names(result);return a.length&&b.length&&!a.some(n=>b.includes(n));
   });
   const confirmed=!different&&sameBusinessEvidence(anchor,{candidate:item,result});
   const relationship=different?'same_title_different_implementing_entity':confirmed?'same_name_institution_year_department':purpose==='link_financial_evidence'?'financial_stage_candidate_not_confirmed_same_business':'business_identity_unconfirmed';
   item={...item,followup:{...item.followup,relationship}};
   investigations.push({candidate:item,purpose,missingFields:missing,result,relationshipStatus:different?'different_implementing_entity':confirmed?'same_business_evidence':'unconfirmed_business_identity'});
   event.status=result.status;event.relationship=relationship;
  }
  catch(error){investigations.push({candidate:item,purpose,missingFields:missing,result:{status:'failed',message:error.message}});event.status='failed';event.message=error.message;}
  event.remainingFields=gaps(anchor,investigations,request.question);
 }
 // One additional page only after same-business document lookup cannot fill a benefit ceiling.
 if(ocrBudget.supplementRemaining>0&&io.read){
  for(const anchor of bases()){
   const missing=gaps(anchor,investigations,request.question);
   if(anchor.result.status!=='read'||missing.length!==1||missing[0]!=='benefit')continue;
   const attempts=anchor.result.attempts||[],ocr=attempts.filter(a=>a.automaticOcr&&a.status==='read'&&a.source?.ocr?.status==='read');
   const last=ocr.at(-1);if(!last||ocr.length<2)continue;
   const page=Math.max(...ocr.filter(a=>a.fileId===last.fileId).flatMap(a=>a.source.pages.map(p=>p.page)))+1;
   if(page>18||!attempts.some(a=>a.fileId===last.fileId&&a.source?.pages?.some(p=>p.page===page&&!p.text.trim())))continue;
   ocrBudget.supplementRemaining--;
   const event={purpose:'fill_missing_benefit_next_page',fromUrl:anchor.candidate.url,url:anchor.candidate.url,fileId:last.fileId,page,missingFields:missing,status:'reading'};events.push(event);
   try{
    const result=await io.read({url:anchor.candidate.url,fileId:last.fileId,page,ocr:true});
    attempts.push({...result,fileId:last.fileId,fileName:last.fileName,evidenceScope:'document_attachment',assessment:last.assessment,automaticOcr:true,startPage:page});
    anchor.result.evidence=require('./evidence').evidence(attempts.filter(a=>a.assessment!=='target_mismatch'));
    (anchor.result.automaticOcr||=[]).push({fileId:last.fileId,page,status:result.status,reason:'benefit_missing_after_other_document_lookup'});
    event.status=result.status;event.remainingFields=gaps(anchor,investigations,request.question);
   }catch(error){event.status='failed';event.message=error.message;}
   break;
  }
 }
 return events;
}
module.exports={supplement,gaps};
