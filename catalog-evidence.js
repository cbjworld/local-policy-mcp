const clean=s=>String(s||'').normalize('NFKC').replace(/\*\*/g,'');
function nameKey(s){return clean(s).replace(/\((?:국비|도비|시비|군비|구비|균특|기금|보조|자체)(?:\/(?:지원|직접))?\)/g,'').replace(/[\s·ㆍ‧˙\u0307「」『』【】\[\]]/g,'').replace(/사업$/,'').toLowerCase();}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// The saved registry uses this parent label; preserve the document's original institution in output.
function institutionKey(s){return clean(s).replace(/\s+/g,'').replace(/^전라남도(?=.+[시군구]$)/,'전남광주통합특별시');}
function documentKey(url){try{const u=new URL(url),id=u.searchParams.get('prdnNstRgstNo');if(u.origin==='https://www.open.go.kr'&&/^DCT[A-Z0-9]+$/.test(id||''))return [id,u.searchParams.get('prdnDt')||'',u.searchParams.get('nstSeCd')||''].join(':');}catch{}return String(url);}
function anchors(candidate,attempt,projects){
 if(attempt.status!=='read'||attempt.assessment==='form_or_cover')return [];
 const titleYears=[...new Set([...String(candidate.title).matchAll(/20\d{2}/g)].map(x=>Number(x[0])))];
 if(titleYears.length>1)return [];
 const matches=[];
 for(const project of projects){
  const key=nameKey(project.name);if(key.length<6||!nameKey(candidate.title).includes(key)||titleYears.length&&titleYears[0]!==project.year)continue;
  const pages=attempt.source?.pages||[],periods=pages.slice(0,2).flatMap(p=>[...p.text.matchAll(/사\s*업\s*기\s*간\s*[:：)]\s*(20\d{2})[^\n\uE000-\uF8FF○◯□❍▢※]{0,90}/g)].map(m=>({year:Number(m[1]),quote:m[0],page:p.page})));
  if(periods.length&&periods.some(p=>p.year!==project.year))continue;
  const regex=new RegExp([...key].map(escape).join('[\\s*·ㆍ‧˙「」『』【】\\[\\]]*'),'i');
  for(const page of pages){const header=page.text.slice(0,1600),name=header.match(regex);if(!name)continue;
   const period=periods.find(p=>p.year===project.year),year=header.match(new RegExp(project.year+'(?:년|[.\\s])'));
   if(!period&&!year)continue;
   const at=name.index,lo=Math.max(0,at-70),hi=Math.min(header.length,at+name[0].length+90);
   matches.push({projectId:project.id,evidence:[{kind:'program_heading',page:page.page,quote:header.slice(lo,hi)},{kind:period?'period':'document_year',page:period?.page??page.page,quote:period?.quote||year[0]}]});break;
  }
 }
 // Funding annotations can yield several budget identities. Keep them as candidates until distinguished.
 return matches.length===1?matches:[];
}
module.exports={nameKey,anchors,institutionKey,documentKey};
function budgetReferences(candidate,attempt,projects){
 if(attempt.status!=='read'||attempt.assessment==='form_or_cover'||/조례|규칙|협약식|심의회/.test(candidate.title||''))return [];
 const years=[...new Set([...String(candidate.title).matchAll(/20\d{2}/g)].map(x=>Number(x[0])))];
 if(years.length>1)return [];
 const found=[],periods=(attempt.source?.pages||[]).slice(0,2).flatMap(p=>[...p.text.matchAll(/사\s*업\s*기\s*간\s*[:：)]\s*(20\d{2})/g)].map(m=>Number(m[1])));
 for(const page of attempt.source?.pages||[])for(const marker of page.text.matchAll(/예\s*산\s*과\s*목\s*[:：)\]｜|]?\s*[●◦ㅇ]?\s*/g)){
  const start=marker.index+marker[0].length,tail=page.text.slice(start,start+600),stop=tail.search(/붙임|[\uE000-\uF8FF○◯□❍▢※]|\n\s*(?:\d+[.)]\s*)?(?:교부조건|행정사항|위의 교부결정)/),quote=page.text.slice(marker.index,start+(stop<0?tail.length:stop));
  const matched=projects.filter(p=>nameKey(p.name).length>=6&&nameKey(quote).includes(nameKey(p.name))&&(!years.length||years[0]===p.year));
  if(matched.length!==1)continue;const project=matched[0];
  if(periods.some(year=>year!==project.year))continue;
  const yearPage=[page,...(attempt.source?.pages||[]).slice(0,2)].find(p=>new RegExp(project.year+'(?:년|[.\\s])').test(p.text)),year=yearPage?.text.match(new RegExp(project.year+'(?:년|[.\\s])'));
  const period=page.text.match(/사\s*업\s*기\s*간\s*[:：)]\s*(20\d{2})/);
  if(!year||period&&Number(period[1])!==project.year)continue;
  found.push({projectId:project.id,evidence:[{kind:'budget_account_reference',page:page.page,quote},{kind:'document_year',page:yearPage.page,quote:year[0]}]});
 }
 return found;
}
module.exports.budgetReferences=budgetReferences;
