function collect(catalog,search,link){
 if(typeof search!=='function')return null;
 const queries=[...new Set((catalog?.searches||[]).map(s=>s.q).filter(q=>typeof q==='string'&&q.trim()))].slice(0,3);
 const searches=[],linkSearches=[],found=new Map(),linked=new Map();let scope=null;
 for(const q of queries){
  const args={q,...(catalog.institution?{institution:catalog.institution}:{}),limit:20,contentLimit:500};
  try{
   const result=search(args);scope={totalSources:result.scope?.totalSources??null,totalInstitutions:result.scope?.totalInstitutions??null,skippedEntries:result.scope?.skippedEntries??null,description:result.scope?.coverage??null};
   searches.push({q,institution:catalog.institution??null,total:result.total,scannedItems:result.items.length,nextOffset:result.nextOffset,ambiguousInstitution:result.ambiguousInstitution??null,followup:{tool:'search_municipal_homepage',arguments:{q,...(catalog.institution?{institution:catalog.institution}:{}),offset:0,limit:20,snapshot:result.snapshot}}});
   for(const [offset,item] of result.items.entries()){
    const key=JSON.stringify([item.source,item.location,item.name]);if(found.has(key))continue;
    const entries=Object.entries(item.fields||{}),fields=Object.fromEntries(entries.slice(0,4).map(([k,v])=>[k,String(v).slice(0,180)]));
    found.set(key,{name:item.name,institution:item.institution,parent:item.parent,source:item.source,sourceSha256:item.sourceSha256,location:item.location,status:item.status,queryMatch:item.queryMatch,matchScope:item.matchScope,beneficiaryWarning:item.beneficiaryWarning,content:item.content,contentTruncated:item.contentTruncated,contentLength:item.contentLength,nextContentOffset:item.nextContentOffset,fields,fieldsTruncated:Boolean(item.fieldsTruncated||entries.length>4||entries.some(([,v])=>String(v).length>180)),followup:{tool:'search_municipal_homepage',arguments:{q,...(catalog.institution?{institution:catalog.institution}:{}),offset,limit:1,snapshot:result.snapshot}}});
   }
   if(result.total&&typeof link==='function')try{
    const linkArgs={q,...(catalog.institution?{institution:catalog.institution}:{}),maxComparisons:2},comparison=link(linkArgs);
    linkSearches.push({q,comparisons:comparison.comparisons,complete:comparison.complete,returnedPairs:comparison.pairs.length,cursor:comparison.cursor,followup:{tool:'link_municipal_budget_auto',arguments:{q,...(catalog.institution?{institution:catalog.institution}:{})}}});
    for(const pair of comparison.pairs){const h=pair.homepage,b=pair.budget,key=JSON.stringify([h.source,h.location,b.source,b.page,b.table,b.tableRow,b.name]);if(linked.has(key))continue;
     linked.set(key,{query:q,relationship:pair.relationship,nameMatch:pair.nameMatch,note:pair.note,homepage:{name:h.name,institution:h.institution,parent:h.parent,source:h.source,sourceSha256:h.sourceSha256,location:h.location},budget:{name:b.name,institution:b.institution,parent:b.parent,year:b.year,amount:b.budget,unit:b.unit,source:b.source,page:b.page,table:b.table,tableRow:b.tableRow,archiveMember:b.archiveMember,archiveSha256:b.archiveSha256,sourceFileSha256:b.sourceFileSha256,officialDocumentList:b.officialDocumentList,limitation:b.limitation}});
    }
   }catch{linkSearches.push({q,status:'failed',note:'홈페이지와 예산 후보를 대조하지 못했습니다.'});}
  }catch{searches.push({q,institution:catalog.institution??null,status:'failed',note:'저장된 홈페이지 자료를 검색하지 못했습니다.'});}
 }
 const all=[...found.values()],first=[],rest=[],regions=new Set();
 for(const item of all){const key=JSON.stringify([item.parent,item.institution]);if(regions.has(key))rest.push(item);else{regions.add(key);first.push(item);}}
 const items=[...first,...rest].slice(0,5);
 const links=[...linked.values()];
 return {scope,searches,items,omittedItems:Math.max(0,all.length-items.length),linkSearches,links:links.slice(0,5),omittedLinks:Math.max(0,links.length-5),note:'저장된 홈페이지 발췌이며 실시간·전국 전체 검색이 아닙니다. 연결은 후보 또는 페이지 참고자료이며 예산행을 합산하거나 같은 사업으로 확정하지 마세요. 생략된 연결은 linkSearches.followup에서 처음부터 확인하고, 이후 cursor로 이어가세요. 지원 조건·시점과 예산 연결은 각 원문에서 확인하고 포털 원문과 구분하세요.'};
}
module.exports={collect};
