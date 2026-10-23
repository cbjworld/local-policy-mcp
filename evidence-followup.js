const {missingFields,sameBusiness}=require('./policy-followup');
const {requestedGaps,summarize}=require('./financial-summary');
const {documentKey}=require('./project-bundles');
function gaps(base,investigations,question){
 const related=investigations.filter(x=>x===base||sameBusiness(base.candidate,x.candidate));
 const core=missingFields(base.result).filter(k=>!related.some(x=>!missingFields(x.result).includes(k)));
 const financial=requestedGaps(base.result,question).filter(k=>!related.some(x=>x.result.status==='read'&&x.result.relevanceStatus!=='supporting_document'&&x.result.targetFit?.status!=='mismatch'&&summarize(x.result.attempts||[],x.result.evidence?.fields?.budget?.amounts).rows.some(r=>r.key===k&&['stated','calculated'].includes(r.status))));
 return [...core,...financial];
}
async function supplement({request,investigations,allDocuments,io,byUrl,candidates,financialDocuments,stageDocuments}){
 const events=[],searched=new Set();
 const tried=d=>investigations.some(x=>documentKey(x.candidate.url)===documentKey(d.url));
 const bases=()=>investigations.filter(x=>!x.purpose&&!(x.result.status!=='read'&&investigations.filter(y=>y.candidate.institution===x.candidate.institution).length>=2)&&gaps(x,investigations,request.question).length);
 for(let n=0;n<2;n++){
  let anchor,item,purpose='fill_missing_evidence';
  for(const base of bases()){
   const found=allDocuments.filter(d=>!d.readingDecision&&!tried(d)&&sameBusiness(base.candidate,d)).sort((a,b)=>Number(['budget','plan'].includes(b.documentRole))-Number(['budget','plan'].includes(a.documentRole)))[0];
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
   anchor=bases().find(x=>!searched.has(x.candidate.institution)&&require('./project-bundles').identity(x.candidate).year);
   if(!anchor)break;
   searched.add(anchor.candidate.institution);
   const missing=gaps(anchor,investigations,request.question),year=require('./project-bundles').identity(anchor.candidate).year;
   const q=request.queries[0]+' '+(missing.some(k=>['budget','planBudget','supportBudget','promotionBudget'].includes(k))?'예산':'계획');
   const args={q,scope:'all',page:1,startDate:year+'0101',endDate:request.endDate<year+'1231'?request.endDate:year+'1231'};
   if(args.startDate<request.startDate)args.startDate=request.startDate;
   const event={fromUrl:anchor.candidate.url,missingFields:missing,search:args,status:'no_matching_document',candidates:[]};events.push(event);
   try{
    const result=await io.search(args);event.searchTotal=result.total;event.hasMore=result.hasMore;
    for(const doc of [...result.items,...result.reviewItems,...result.relatedDocuments]){
     if(!sameBusiness(anchor.candidate,doc))continue;
     const d={...doc,documentRole:doc.documentRole||require('./relevance').documentRole(doc.title)};
     if(['비공개','열람제한'].includes(d.disclosure))d.readingDecision={status:'listed_nonpublic',reason:'목록상 비공개·열람제한'};
     event.candidates.push({title:d.title,url:d.url,readingDecision:d.readingDecision});
     if(!byUrl.has(documentKey(d.url))){byUrl.set(documentKey(d.url),d);allDocuments.push(d);stageDocuments.push(d);if(['budget','allocation_or_deposit','execution_or_settlement'].includes(d.documentRole))financialDocuments.push(d);else candidates.push(d);}
    }
    item=allDocuments.find(d=>!d.readingDecision&&!tried(d)&&sameBusiness(anchor.candidate,d));
   }catch(error){event.status='search_failed';event.message=error.message;}
   if(!item)continue;
  }
  item={...item,followup:{fromUrl:anchor.candidate.url,missingFields:gaps(anchor,investigations,request.question),relationship:purpose==='link_financial_evidence'?'financial_stage_candidate_not_confirmed_same_business':'same_name_institution_year_department'}};
  const missing=gaps(anchor,investigations,request.question),event={purpose,relationship:item.followup.relationship,fromUrl:anchor.candidate.url,url:item.url,title:item.title,role:item.documentRole,missingFields:missing,status:'reading'};events.push(event);
  try{const result=await io.research({url:item.url,requestedQuery:request.question});investigations.push({candidate:item,purpose,missingFields:missing,result});event.status=result.status;}
  catch(error){investigations.push({candidate:item,purpose,missingFields:missing,result:{status:'failed',message:error.message}});event.status='failed';event.message=error.message;}
  event.remainingFields=gaps(anchor,investigations,request.question);
 }
 return events;
}
module.exports={supplement,gaps};
