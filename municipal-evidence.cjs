const keyForRegion=item=>JSON.stringify([item.parent,item.institution]);
function assessTarget(item,question){
 if(!question)return item;
 const fields=Object.entries(item.fields||{}).filter(([k,v])=>/^(?:지원|신청|사업|수혜)?대상(?:자)?$/.test(k.replace(/\s/g,''))&&typeof v==='string'&&v.trim()).map(([,v])=>v);
 const sections=[...String(item.content||'').matchAll(/(?:지원\s*대상(?:자)?|신청\s*대상|사업\s*대상)\s*[:：]\s*(.{1,500}?)(?=\s*(?:사업\s*내용|지원\s*내용|신청\s*방법|사업\s*기간|선정\s*기준|사업\s*목적|구비\s*서류|문의)\s*[:：]|$)/gs)].map(x=>x[1]);
 const target=fields.length===1?fields[0]:fields.length===0&&sections.length===1?sections[0]:null;
 const text=target||[item.name,item.content,...Object.values(item.fields||{})].filter(x=>typeof x==='string').join(' ');
 const fit=require('./relevance').targetFit(text,question);
 const consultation=/월세/.test(question)&&/(?:전.?월세|월세).{0,25}(?:안심계약|계약\s*(?:상담|도움))/.test(item.name||'');
 const careExclusion=/(?:아동|아이|영유아).*돌봄|아이\s*돌봄/.test(question)&&/^가정\s*양육\s*수당(?:\s*지원)?$/.test(item.name||'')&&/아이\s*돌봄\s*(?:서비스)?[^.]{0,20}(?:미이용|이용하지\s*않)/.test(text);
 const hearingAndAid=/난청\s*(?:검사|선별검사|확진검사)/.test(question)&&/(?:검사\s*비|검사\s*지원)/.test(item.content||'')&&/보청기/.test(item.content||'');
 const leaseReview=/전세\s*자금/.test(question)&&/임차\s*보증금/.test(item.name||'')&&!/전세/.test(item.content||'');
 const mixedMortgage=/전세\s*자금/.test(question)&&/주택\s*자금/.test(item.name||'')&&/구입/.test(item.content||'')&&/전세/.test(item.content||'');
 const topicWarning=consultation?'전월세 계약 상담·동행 안내입니다. 월세 지급 사업으로 단정하지 마세요.':careExclusion?'아이돌봄서비스를 이용하지 않는 가정의 양육수당입니다. 돌봄서비스 제공 사업으로 세지 마세요.':hearingAndAid?'청각검사와 보청기 지원은 대상·한도가 다를 수 있으므로 각각의 조건과 금액을 구분하세요.':leaseReview?'임차보증금 이자 안내입니다. 전세 적용 여부는 이 발췌문에서 확인되지 않았으므로 원문을 확인하세요.':mixedMortgage?'주택 구입과 전세가 함께 안내됩니다. 전세 조건과 구입 조건을 나누어 확인하세요.':undefined;
 const disabilityRequested=/장애인|장애아동/.test(question);
 const disabilityMentioned=Boolean(target&&/장애인|장애아동/.test(target));
 const conditionAssessment=disabilityRequested?{requested:'장애인',status:disabilityMentioned?'mentioned_in_target':'unconfirmed',scope:target?'explicit_target':'excerpt',...(target?{excerpt:target.slice(0,250)}:{})}:undefined;
 const result={...item,...(topicWarning?{topicWarning}:{}),...(conditionAssessment?{conditionAssessment}:{})};
 if(disabilityRequested&&!disabilityMentioned){result.queryMatch='target_unconfirmed';result.note='장애인 지원 여부가 명시된 지원대상에서 확인되지 않습니다. 확정 사례로 세지 마세요.';}
 const titleFit=require('./relevance').targetFit(item.name||'',question);
 if(titleFit.status==='mismatch')return {...result,queryMatch:'target_mismatch',targetAssessment:{...titleFit,scope:'title',excerpt:item.name},note:'사업 제목의 연령 대상이 원래 질문과 다릅니다. 본문에 다른 연령이 언급돼도 요청 대상의 확정 사례로 세지 마세요.'};
 if(!fit.requested.length)return result;
 const targetAssessment={...fit,scope:target?'explicit_target':'excerpt',...(target?{excerpt:target.slice(0,250)}:{})};
 if(fit.status==='mismatch')return {...result,queryMatch:'target_mismatch',targetAssessment,note:'원래 질문의 연령 대상과 이 발췌문의 명시 대상이 다릅니다. 요청한 대상의 확정 사례로 세지 마세요.'};
 if(fit.status==='unspecified')return {...result,queryMatch:'target_unconfirmed',targetAssessment,note:'원래 질문의 연령 대상이 이 발췌문에서 확인되지 않습니다. 확정 사례로 세지 마세요.'};
 return {...result,targetAssessment};
}
function diversify(values,regionOf){
 const first=[],rest=[],seen=new Set();
 for(const value of values){const key=regionOf(value);if(seen.has(key))rest.push(value);else{seen.add(key);first.push(value);}}
 return [...first,...rest];
}
function collect(catalog,search,link,question){
 if(typeof search!=='function')return null;
 const queries=[...new Set((catalog?.searches||[]).map(s=>s.q).filter(q=>typeof q==='string'&&q.trim()))].slice(0,3);
 const searches=[],linkSearches=[],found=new Map(),linked=new Map(),linkTargets=new Map();let scope=null;
 for(const q of queries){
  const base={q,...(catalog.institution?{institution:catalog.institution}:{})},regions=new Map();
  let result=null,snapshot,offset=0,scanned=0,pages=0,failure=null;
  while(pages<3){
   let page;
   try{page=search({...base,offset,limit:20,contentLimit:500,...(snapshot?{snapshot}:{})});}
   catch{failure=offset;break;}
   if(snapshot&&page.snapshot!==snapshot){failure=offset;break;}
   result=page;snapshot=page.snapshot;pages++;scanned+=page.items.length;
   scope={dataset:page.scope?.dataset??null,totalSources:page.scope?.totalSources??null,totalInstitutions:page.scope?.totalInstitutions??null,skippedEntries:page.scope?.skippedEntries??null,selectedRegion:page.scope?.selectedRegion??null,description:page.scope?.coverage??null};
   for(const [index,rawItem] of page.items.entries()){
    const item=assessTarget(rawItem,question);
    const regionKey=keyForRegion(item);if(item.parent&&item.institution&&!regions.has(regionKey))regions.set(regionKey,item.parent+' '+item.institution);
    const key=JSON.stringify([item.source,item.location,item.name]);if(found.has(key))continue;
    const entries=Object.entries(item.fields||{}),fields=Object.fromEntries(entries.slice(0,4).map(([k,v])=>[k,String(v).slice(0,180)]));
    found.set(key,{name:item.name,institution:item.institution,parent:item.parent,publisherInstitution:item.publisherInstitution,programAuthority:item.programAuthority,institutionRole:item.institutionRole,source:item.source,sourceSha256:item.sourceSha256,location:item.location,status:item.status,queryMatch:item.queryMatch,targetAssessment:item.targetAssessment,conditionAssessment:item.conditionAssessment,matchScope:item.matchScope,missingTerms:item.missingTerms,targetNote:item.note,beneficiaryWarning:item.beneficiaryWarning,topicWarning:item.topicWarning,content:item.content,contentTruncated:item.contentTruncated,contentLength:item.contentLength,nextContentOffset:item.nextContentOffset,fields,fieldsTruncated:Boolean(item.fieldsTruncated||entries.length>4||entries.some(([,v])=>String(v).length>180)),followup:{tool:'search_municipal_homepage',arguments:{...base,offset:offset+index,limit:1,snapshot}}});
   }
   if(page.nextOffset===null||page.nextOffset===undefined||regions.size>=5)break;
   if(!Number.isInteger(page.nextOffset)||page.nextOffset<=offset){failure=offset;break;}
   offset=page.nextOffset;
  }
  if(!result){searches.push({q,institution:catalog.institution??null,status:'failed',note:'저장된 홈페이지 자료를 검색하지 못했습니다.'});continue;}
  searches.push({q,institution:catalog.institution??null,total:result.total,scannedItems:scanned,scannedPages:pages,nextOffset:failure??result.nextOffset,ambiguousInstitution:result.ambiguousInstitution??null,...(failure!==null?{status:'partial',note:'일부 페이지를 읽지 못했습니다. 처음부터 재확인하세요.'}:{}),followup:{tool:'search_municipal_homepage',arguments:{...base,offset:0,limit:20,...(failure===null?{snapshot}:{})}}});
  for(const [regionKey,institution] of regions){const k=JSON.stringify([q,regionKey]);if(!linkTargets.has(k))linkTargets.set(k,{q,institution});}
 }
 const targets=[...linkTargets.values()];
 if(typeof link==='function')for(const {q,institution} of targets.slice(0,5))try{
  const comparison=link({q,institution,maxComparisons:2});
  linkSearches.push({q,institution,comparisons:comparison.comparisons,complete:comparison.complete,returnedPairs:comparison.pairs.length,cursor:comparison.cursor,followup:{tool:'link_municipal_budget_auto',arguments:{q,institution}}});
  for(const pair of comparison.pairs){const h=assessTarget(pair.homepage,question),b=pair.budget,key=JSON.stringify([h.source,h.location,b.source,b.page,b.table,b.tableRow,b.name]);if(linked.has(key))continue;
   linked.set(key,{query:q,relationship:pair.relationship,nameMatch:pair.nameMatch,note:pair.note,homepage:{name:h.name,institution:h.institution,parent:h.parent,publisherInstitution:h.publisherInstitution,programAuthority:h.programAuthority,institutionRole:h.institutionRole,source:h.source,sourceSha256:h.sourceSha256,location:h.location,queryMatch:h.queryMatch,targetAssessment:h.targetAssessment,conditionAssessment:h.conditionAssessment,missingTerms:h.missingTerms,targetNote:h.note,matchScope:h.matchScope,beneficiaryWarning:h.beneficiaryWarning,topicWarning:h.topicWarning},budget:{name:b.name,institution:b.institution,parent:b.parent,year:b.year,amount:b.budget,unit:b.unit,source:b.source,page:b.page,table:b.table,tableRow:b.tableRow,archiveMember:b.archiveMember,archiveSha256:b.archiveSha256,sourceFileSha256:b.sourceFileSha256,officialDocumentList:b.officialDocumentList,limitation:b.limitation}});
  }
 }catch{linkSearches.push({q,institution,status:'failed',note:'홈페이지와 예산 후보를 대조하지 못했습니다.'});}
 const rank=x=>x.queryMatch==='target_mismatch'?2:x.queryMatch==='target_unconfirmed'||x.topicWarning?1:0;
 const all=[...found.values()].sort((a,b)=>rank(a)-rank(b)),allLinks=[...linked.values()].sort((a,b)=>rank(a.homepage)-rank(b));
 const items=[0,1,2].flatMap(level=>diversify(all.filter(x=>rank(x)===level),keyForRegion)).slice(0,5);
 const links=[0,1,2].flatMap(level=>diversify(allLinks.filter(x=>rank(x.homepage)===level),x=>keyForRegion(x.homepage))).slice(0,5);
 for(const item of items){
  if(item.matchScope!=='notice_body')continue;
  item.noticeWarning='한 공지에 여러 사업이 있을 수 있습니다. 각 사업의 대상·지원액과 연도를 따로 확인하세요.';
  if(!item.contentTruncated||item.contentLength>2000)continue;
  try{const page=search({...item.followup.arguments,contentLimit:2000}),full=page.items?.[0];
   if(page.snapshot===item.followup.arguments.snapshot&&full?.source===item.source&&full.sourceSha256===item.sourceSha256&&JSON.stringify(full.location)===JSON.stringify(item.location))Object.assign(item,{content:full.content,contentTruncated:full.contentTruncated,contentLength:full.contentLength,nextContentOffset:full.nextContentOffset});
  }catch{}
 }
 const attempted=typeof link==='function'?Math.min(targets.length,5):0,remaining=targets.slice(attempted);
 const unattempted=remaining.slice(0,20).map(({q,institution})=>({q,institution,followup:{tool:'link_municipal_budget_auto',arguments:{q,institution}}}));
 const schemeGroups=require('./municipal-scheme-links.cjs').group(all);
 return {scope,searches,items,schemeGroups,omittedItems:Math.max(0,all.length-items.length),linkSearches,linkCoverage:{scannedRegionQueries:targets.length,attemptedRegionQueries:attempted,unattemptedRegionQueries:remaining.length,unattempted,omittedUnattempted:Math.max(0,remaining.length-unattempted.length)},links,omittedLinks:Math.max(0,allLinks.length-links.length),note:'저장된 홈페이지 발췌이며 실시간·전국 전체 검색이 아닙니다. 검색어당 최대 세 쪽과 최대 다섯 지역·검색어 조합을 대조합니다. 미대조 지역은 linkCoverage.unattempted로 이어서 확인하세요. 연결은 후보 또는 페이지 참고자료이며 예산행을 합산하거나 같은 사업으로 확정하지 마세요. 생략된 연결은 linkSearches.followup에서 처음부터 확인하고, 이후 cursor로 이어가세요. 지원 조건·시점과 예산 연결은 각 원문에서 확인하고 포털 원문과 구분하세요.'};
}
module.exports={collect};
