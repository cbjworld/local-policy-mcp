function collect(catalog,search){
 if(typeof search!=='function')return null;
 const queries=[...new Set((catalog?.searches||[]).map(s=>s.q).filter(q=>typeof q==='string'&&q.trim()))].slice(0,3);
 const searches=[],found=new Map();let scope=null;
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
  }catch{searches.push({q,institution:catalog.institution??null,status:'failed',note:'저장된 홈페이지 자료를 검색하지 못했습니다.'});}
 }
 const all=[...found.values()],first=[],rest=[],regions=new Set();
 for(const item of all){const key=JSON.stringify([item.parent,item.institution]);if(regions.has(key))rest.push(item);else{regions.add(key);first.push(item);}}
 const items=[...first,...rest].slice(0,5);
 return {scope,searches,items,omittedItems:Math.max(0,all.length-items.length),note:'저장된 홈페이지 발췌이며 실시간·전국 전체 검색이 아닙니다. 페이지 단위 자료는 여러 사업을 포함할 수 있습니다. 지원 조건·시점과 예산 연결은 각 원문에서 확인하고 포털 원문과 구분하세요.'};
}
module.exports={collect};
