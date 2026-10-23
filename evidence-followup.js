const {missingFields,sameBusinessCandidate,sameBusinessEvidence}=require('./policy-followup');
const {requestedGaps,summarize}=require('./financial-summary');
const {documentKey}=require('./project-bundles');
function gaps(base,investigations,question){
 const related=investigations.filter(x=>x===base||!['different_implementing_entity','unconfirmed_business_identity'].includes(x.relationshipStatus)&&sameBusinessEvidence(base,x));
 const core=missingFields(base.result).filter(k=>!related.some(x=>!missingFields(x.result).includes(k)));
 const financial=requestedGaps(base.result,question).filter(k=>!related.some(x=>x.result.status==='read'&&x.result.relevanceStatus!=='supporting_document'&&x.result.targetFit?.status!=='mismatch'&&summarize(x.result.attempts||[],x.result.evidence?.fields?.budget?.amounts).rows.some(r=>r.key===k&&['stated','calculated'].includes(r.status))));
 return [...core,...financial];
}
async function supplement({request,investigations,allDocuments,io,byUrl,candidates,financialDocuments,stageDocuments,ocrBudget={remaining:2}}){
 const events=[],searched=new Set();
 const tried=d=>investigations.some(x=>documentKey(x.candidate.url)===documentKey(d.url));
 const bases=()=>investigations.filter(x=>!x.purpose&&!(x.result.status!=='read'&&investigations.filter(y=>y.candidate.institution===x.candidate.institution).length>=2)&&gaps(x,investigations,request.question).length);
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
     const a=x.candidate,year=identity(d).year,otherYear=identity(a).year;
     return a.institution&&d.institution&&!(year&&otherYear&&year!==otherYear)&&!(a.department&&d.department&&a.department!==d.department)&&(d.institution===a.institution||x.result.status==='read'&&(a.institution.startsWith(d.institution+' ')||d.institution.startsWith(a.institution+' ')));
    });
    if(base){anchor=base;item=d;purpose='link_financial_evidence';break;}
   }
  }
  if(!item){
   anchor=bases().find(x=>!searched.has(x.candidate.institution));
   if(!anchor)break;
   searched.add(anchor.candidate.institution);
   const missing=gaps(anchor,investigations,request.question);
   const q=request.queries[0]+' '+(missing.some(k=>['budget','planBudget','supportBudget','promotionBudget'].includes(k))?'예산':'계획');
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
 return events;
}
module.exports={supplement,gaps};
