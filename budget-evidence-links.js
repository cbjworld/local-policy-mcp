const normalize=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'');
function links(investigations,search){
 const found=[];
 for(const {candidate,result} of investigations){
  if(result.status!=='read')continue;
  for(const attempt of result.attempts||[])for(const p of attempt.source?.pages||[]){
   if(attempt.status!=='read'||attempt.assessment==='form_or_cover'||attempt.evidenceScope==='attachment_reference')continue;
   const name=p.text.match(/(?:보\s*조\s*)?사\s*업\s*명\s*[:：)]\s*([^\n|○□❍▢※]{2,160}?)(?=\n|[|○□❍▢※]|$)/);
   const period=p.text.match(/사\s*업\s*기\s*간\s*[:：)]\s*(20\d{2})(?:\.|년)/);
   if(!name||!period)continue;
   const year=Number(period[1]);
   const program=name[1].replace(/\*\*/g,'').trim(),key=normalize(program).replace(/사업$/,'');
   if(key.length<4)continue;
   const rows=search({q:key,institution:candidate.institution,limit:20}).items;
   const sameInstitution=row=>normalize(row.institution)===normalize(candidate.institution)||normalize((row.parent||'')+row.institution)===normalize(candidate.institution);
   const tables=require('./funding-evidence').tables([attempt]);
   // shortcut: link only nearby tables on the same extracted page; broader sections need semantic review.
   for(const t of tables.filter(t=>t.unit==='천원'&&t.roles.includes('appropriation')&&t.page===p.page&&t.start>period.index&&t.start-period.index<2500&&t.start>name.index&&t.start-name.index<3000)){
    const total=t.rows.find(r=>/^(합계|계|총계)$/.test(normalize(r.label)));
    if(!total)continue;
    const amount=total.values[t.roles.indexOf('appropriation')];
    if(!Number.isSafeInteger(amount))continue;
    for(const row of rows){
     if(!sameInstitution(row)||row.year!==year||row.unit!=='천원'||row.budget!==amount||!normalize(row.name).includes(key))continue;
     found.push({status:'matched_name_year_institution_amount',program,institution:candidate.institution,year,amount,unit:'천원',budgetRow:row,document:{title:candidate.title,url:candidate.url,sourceId:attempt.source.sourceId,page:p.page,nameQuote:name[0],periodQuote:period[0],tableQuote:t.quote,unitQuote:t.unitQuote},note:'본문의 사업명·사업기간과 동일 기관 본예산 행의 명칭·금액을 대조했습니다. 교부액이나 기초지자체 총사업비와 합산하지 마세요. 동일 사업의 법적 귀속과 현재 시행 여부는 별도 문맥 확인 사항입니다.'});
    }
   }
   if(require('./relevance').documentRole(candidate.title)!=='plan')continue;
   for(const excerpt of result.evidence?.fields?.budget?.excerpts||[]){
    if(excerpt.sourceId!==attempt.source.sourceId||excerpt.page!==p.page||excerpt.status!=='evidence_candidate'||excerpt.attribution==='reference_context')continue;
    const at=p.text.indexOf(excerpt.quote);
    if(at<Math.max(name.index,period.index)||at-name.index>3000||at-period.index>2500)continue;
    const amountMatch=excerpt.quote.match(/^(?:소\s*요\s*예\s*산|사\s*업\s*예\s*산|사\s*업\s*비|예\s*산\s*액)\s*[:：)]\s*(?:금\s*)?(\d[\d,]*)\s*(?:\*\*)?\s*(백만|천)?\s*원/);
    if(!amountMatch)continue;
    if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(amountMatch[1]))continue;
    const amount=Number(amountMatch[1].replaceAll(',',''))*(amountMatch[2]==='백만'?1000:amountMatch[2]==='천'?1:0.001);
    if(!Number.isSafeInteger(amount))continue;
    for(const row of rows){
     if(!sameInstitution(row)||row.year!==year||row.unit!=='천원'||row.budget!==amount||!normalize(row.name).includes(key))continue;
     found.push({status:'matched_name_year_institution_amount',program,institution:candidate.institution,year,amount,unit:'천원',budgetRow:row,document:{title:candidate.title,url:candidate.url,sourceId:attempt.source.sourceId,page:p.page,nameQuote:name[0],periodQuote:period[0],budgetQuote:excerpt.quote},note:'계획서의 명시된 사업명·기간·금액과 같은 기관 본예산 행을 대조했습니다. 계획금액 일치는 집행 또는 현재 시행 확인이 아닙니다.'});
    }
   }
  }
 }
 return [...new Map(found.map(x=>[JSON.stringify([x.document.url,x.budgetRow.source,x.budgetRow.page,x.amount]),x])).values()];
}
module.exports={links};
