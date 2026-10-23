const normalize=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'');
function pages(x){return (x.result.attempts||[]).filter(a=>a.status==='read'&&a.assessment!=='form_or_cover'&&a.evidenceScope!=='attachment_reference').flatMap(a=>(a.source?.pages||[]).map(p=>({...p,sourceId:a.source.sourceId,url:a.source.url})));}
const cite=(p,quote)=>({sourceId:p.sourceId,url:p.url,page:p.page,quote});
function issuer(text,institution){
 const exact=text.split('\n').find(line=>normalize(line.replace(/<[^>]+>|[*_#]/g,''))===institution+'장');
 if(exact)return exact;
 const escaped=[...institution+'장'].map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*');
 return text.match(new RegExp(escaped+'(?=\\s+(?:수신자|주무관|협조자|시행)|\\s*$)'))?.[0];
}
function period(ps){
 const matches=ps.flatMap(p=>[...p.text.matchAll(/사\s*업\s*기\s*간\s*[:：)]\s*(20\d{2})(?:년|\.)/g)].map(m=>({year:m[1],evidence:cite(p,m[0])})));
 const years=new Set(matches.map(m=>m.year));return years.size===1?matches[0]:null;
}
function links(investigations=[]){
 const read=investigations.filter(x=>x.result.status==='read'&&x.result.relevanceStatus!=='supporting_document');
 const groups=[];
 for(const upper of read){
  const institution=upper.candidate.institution||'';
  if(!/^[가-힣]+(?:특별시|광역시|특별자치시|도)$/.test(institution))continue;
  const region=institution.replace(/(?:특별자치도|특별자치시|특별시|광역시|도)$/,'');
  const name=upper.candidate.title.match(new RegExp('('+region+'(?:형|도)?\\s*[^\\n「」\\[\\]()]{1,70}?지원\\s*사업)'))?.[1];
  if(!name||/자체|추가\s*지원|별도\s*지원|확대\s*지원/.test(upper.candidate.title))continue;
  const up=pages(upper),year=period(up);
  const distribution=up.map(p=>({p,m:p.text.match(/(?:구\s*[·ㆍ・‧]?\s*군|시\s*[·ㆍ・‧]?\s*군)[^\n]{0,80}?(?:보조금\s*교부|보조사업자|시행)|보조\s*사업자\s*[:：]\s*\d+개\s*(?:구\s*[·ㆍ・‧]?\s*군|시\s*[·ㆍ・‧]?\s*군)/)})).find(x=>x.m);
  if(!year||!distribution||!up.some(p=>normalize(p.text).includes(normalize(name))))continue;
  const members=[];
  for(const lower of read){
   if(!lower.candidate.institution?.startsWith(institution+' ')||!normalize(lower.candidate.title).includes(normalize(name)))continue;
   if(/자체|추가\s*지원|별도\s*지원|확대\s*지원/.test(lower.candidate.title))continue;
   const ps=pages(lower),lowerYear=period(ps);
   if(!lowerYear||lowerYear.year!==year.year)continue;
   // Require an explicit grant notice naming this program and its provincial/city issuer.
   const grant=ps.find(p=>normalize(p.text).includes(normalize(name))&&/교부결정|교부통지|교부\s*알림/.test(p.text)&&issuer(p.text,institution));
   if(!grant)continue;
   const programLine=grant.text.split('\n').find(line=>normalize(line).includes(normalize(name))&&/교부결정|교부통지|교부\s*알림/.test(line));
   const programPattern=[...normalize(name)].map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*');
   const programQuote=programLine?.length<=500?programLine:grant.text.match(new RegExp(programPattern+'[^\\n]{0,100}?(?:교부결정|교부통지|교부\\s*알림)'))?.[0];
   if(!programQuote||programQuote.length>500)continue;
   const issuerQuote=issuer(grant.text,institution);
   members.push({url:lower.candidate.url,institution:lower.candidate.institution,evidence:[lowerYear.evidence,cite(grant,programQuote),cite(grant,issuerQuote)]});
  }
  if(members.length)groups.push({name:name.trim(),year:year.year,status:'same_program_body_supported',coordinatingInstitution:institution,primaryUrl:upper.candidate.url,documents:[{url:upper.candidate.url,institution},...members.map(({url,institution})=>({url,institution}))],evidence:[year.evidence,cite(distribution.p,distribution.m[0]),...members.flatMap(m=>m.evidence)],countAsOneCase:true,budgetRule:'사업은 한 사례로 비교합니다. 광역 전체액·기초 사업비·교부액은 문서별로 유지하고 합산하지 마세요. 문서 생산기관이 금액의 적용 범위를 뜻하지 않습니다.'});
 }
 const unique=new Map();
 for(const group of groups){
  const key=JSON.stringify([group.coordinatingInstitution,normalize(group.name),group.year]);
  if(!unique.has(key))unique.set(key,group);
  else{const kept=unique.get(key);kept.documents=[...new Map([...kept.documents,...group.documents].map(d=>[d.url,d])).values()];kept.evidence.push(...group.evidence);}
 }
 return [...unique.values()];
}
function caseCounts(projects=[],confirmed=[]){
 const parents=projects.map((_,i)=>i),root=i=>parents[i]===i?i:(parents[i]=root(parents[i]));
 for(const link of confirmed){
  const urls=new Set(link.documents.map(d=>d.url));
  const members=projects.flatMap((p,i)=>p.documents.some(d=>urls.has(d.url))?[i]:[]);
  for(const i of members.slice(1))parents[root(i)]=root(members[0]);
 }
 return {candidateProjectGroups:projects.length,projectGroups:new Set(parents.map((_,i)=>root(i))).size,confirmedLinkedPrograms:confirmed.length};
}
function retainedLinks(confirmed,documents){
 const urls=new Set(documents.map(d=>d.url));
 return confirmed.map(link=>{const kept=link.documents.filter(d=>urls.has(d.url));return {...link,documents:kept,primaryUrl:urls.has(link.primaryUrl)?link.primaryUrl:kept[0]?.url,omittedDocumentCount:(link.omittedDocumentCount||0)+link.documents.length-kept.length};}).filter(link=>link.documents.length>=2);
}
function catalogLinks(context,candidates=[],investigations=[],existing=[]){
 const {documentKey,institutionKey}=require('./catalog-evidence'),present=new Map(candidates.map(d=>[documentKey(d.url),d])),read=new Map(investigations.map(d=>[documentKey(d.candidate.url),d]));
 const occupied=new Set(existing.flatMap(l=>l.documents.map(d=>documentKey(d.url))));
 const result=[];
 for(const item of context?.items||[]){
  const matched=[];
  for(const link of item.documents||[]){
   if(link.status!=='body_supported'||link.relationship!=='same_named_budget_program'||!link.evidence?.some(e=>e.quote))continue;
   const key=documentKey(link.document.url),candidate=present.get(key);if(!candidate||occupied.has(key)||institutionKey(candidate.institution)!==institutionKey(link.document.institution))continue;
   const fresh=read.get(key),freshPages=fresh?.result.status==='read'?pages(fresh):[],freshPeriod=period(freshPages);
   if(!freshPeriod&&freshPages.some(p=>/사\s*업\s*기\s*간\s*[:：)]\s*20\d{2}/.test(p.text)))continue;
   if(freshPeriod&&Number(freshPeriod.year)!==item.year)continue;
   if(!matched.some(m=>documentKey(m.document.url)===key))matched.push({document:{url:candidate.url,institution:candidate.institution},evidence:link.evidence});
  }
  if(matched.length<2)continue;
  result.push({name:item.name,year:String(item.year),status:'same_budget_project_saved_body_supported',basis:'같은 기관·부서·연도·회계·사업 식별번호에 직접 연결된 저장 본문 근거',catalogProjectId:item.projectId,coordinatingInstitution:(item.parent||'')+' '+item.institution,primaryUrl:matched[0].document.url,documents:matched.map(m=>m.document),evidence:matched.flatMap(m=>m.evidence.map(e=>({...e,url:e.sourceUrl}))),countAsOneCase:true,budgetRule:'같은 사업의 원안·수정안·단계별 문서입니다. 문서별 금액과 조건을 보존하며 합산하지 않습니다. 최신 문서가 이전 문서를 대체했는지와 현재 효력은 별도 확인합니다.'});
 }
 return result;
}
module.exports={links,caseCounts,retainedLinks,catalogLinks};
