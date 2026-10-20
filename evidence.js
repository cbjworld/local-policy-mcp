const labels={target:'지원대상|사업대상|참여대상|교육대상|가입자격|신청대상|신청자격|접종대상및비용|접종대상|사업위치|설치대상|대상구간|추진대상',activity:'지원내용|사업내용|주요내용|운영내용|지원내역|지원방법|접종내용|접종대상및비용|지원금액|지원한도|사업개요|설치내용|구축내용|추진내용',budget:'소요예산|사업예산|총사업비|사업비|예산액|총예산|금회교부결정내역',period:'사업기간|운영기간|추진기간|지원기간|신청기간'};
const spaced=s=>s.split('|').map(w=>[...w].join('\\s*')).join('|');
const nextLabel=new RegExp('(?:'+spaced(Object.values(labels).join('|'))+')[ \\t]*(?:[:：]|\\r?\\n|(?=[․·]))');
function evidence(attempts){
 const fields={},referenceExcerpts=[];
 for(const [key,label] of Object.entries(labels)){
  const boundaryLabel=key==='activity'?new RegExp('(?:'+spaced(Object.entries(labels).filter(([k])=>k!=='activity').map(([,v])=>v).join('|'))+')\\s*[:：]'):nextLabel;
  const excerpts=[];
  for(const a of attempts.filter(a=>a.status==='read'&&a.assessment!=='form_or_cover'))for(const p of a.source?.pages||[]){
   const pattern=new RegExp('(?:'+spaced(label)+')\\s*(?:\\*\\*)?\\s*'+(key==='budget'?'(?:[:：)]|(?=(?:\\\\?\\*){3,})|\\|[ \\t]*\\r?\\n)':'(?:[:：)]|</td>\\s*<td>|\\r?\\n|(?=[․·]))'),'g');let m;
   while((m=pattern.exec(p.text))&&excerpts.length<3){
    const section=key==='budget'&&m[0].includes('|');
    const tail=p.text.slice(pattern.lastIndex,pattern.lastIndex+(section||m[0].includes('</t')?700:280));
    const end=tail.search(boundaryLabel);let value=tail.slice(0,end<0?tail.length:end);
    if(!section&&key==='activity'){
     const boundary=value.search(/\n[ \t]*(?:[□▢❍○]|[ⅠⅡⅢⅣⅤⅥⅦ]|※\s*전체\s*사업목적\s*및\s*사업별\s*핵심\s*내용을\s*기술|\d+[.)]\s*위의\s*교부결정에도\s*불구하고)/);
     if(boundary>=0)value=value.slice(0,boundary);
    }
    else if(!section){
     // shortcut: keep indented continuation lines only; unindented prose still needs source review.
     const lines=value.split('\n');let keep=1;
     if(key==='target')while(keep<lines.length){
      if(!lines[keep].trim()){if(keep+1<lines.length&&/^[ \t]+\S/.test(lines[keep+1])){keep++;continue;}break;}
      if(!/^[ \t]+\S/.test(lines[keep])||/[:：]|^[ \t]*[□▢❍○]|^[ \t]*[ⅠⅡⅢⅣⅤⅥⅦ]/.test(lines[keep]))break;
      keep++;
     }
     value=lines.slice(0,keep).join('\n').split(/<\/t[dh]>/)[0];
    }
    else {const next=value.search(/\n(?:\|\s*(?:\d+|[ⅠⅡⅢⅣⅤⅥⅦ]+)\s*\||[ \t]*[ⅠⅡⅢⅣⅤⅥⅦ]+[ \t]*[가-힣])/);if(next>=0)value=value.slice(0,next);}
    const masked=/\*{3,}|(?:\\\*){3,}|비공개|가림/.test(value);
    if(key!=='budget'&&!masked&&!/[가-힣A-Za-z0-9]/.test(value.replace(/<[^>]*>/g,'')))continue;
    const amount=/\d[\d,.]*\s*(?:\*\*)?\s*(?:백\s*만|천\s*만|백|천|억|만)?\s*원/.test(value);
    const heading=[...p.text.slice(0,m.index).matchAll(/^\|\s*[ⅠⅡⅢⅣⅤⅥⅦ\d]+\s*\|[^\n]+/gm)].at(-1);
    const sectionTitle=heading?.[0]||null;
    // shortcut: section headings flag reference context; ownership still requires semantic review.
    const reference=!!sectionTitle&&/현황|필요성|참고|타\s*지자체|추진실적/.test(sectionTitle);
    const entry={sourceId:a.source.sourceId,url:a.source.url,page:p.page,quote:p.text.slice(m.index,pattern.lastIndex)+value,status:masked?'redacted':key==='budget'&&!amount?'label_only':'evidence_candidate',sectionTitle,attribution:reference?'reference_context':'requires_review'};
    if(reference)referenceExcerpts.push({...entry,field:key});else excerpts.push(entry);
   }
  }
  if(key==='target')for(const a of attempts.filter(a=>a.status==='read'&&a.assessment!=='form_or_cover'))for(const p of a.source?.pages||[]){
   // shortcut: only explicit target headings followed by a condition block; no free-text guessing.
   for(const m of p.text.matchAll(/지원대상[ \t]*<[^>\n]{1,100}>[ \t]*\r?\n/g)){
    if(excerpts.length>=3)break;
    const tail=p.text.slice(m.index+m[0].length,m.index+m[0].length+1200);
    const boundary=tail.search(/\n[ \t]*[▢□]|\n[ \t]*(?:지원내용|신청방법|신청기간)/);
    const quote=m[0]+tail.slice(0,boundary<0?tail.length:boundary);
    excerpts.push({sourceId:a.source.sourceId,url:a.source.url,page:p.page,quote,status:'evidence_candidate',sectionTitle:'지원대상 조건',attribution:'requires_review'});
   }
  }
  fields[key]={status:excerpts.some(x=>x.status==='evidence_candidate')?'needs_review':excerpts.some(x=>x.status==='redacted')?'redacted':'unconfirmed',excerpts};
 }
 const organizations=[],budgetNotes=[];
 fields.budget.tables=require('./funding-evidence').tables(attempts);
 for(const table of fields.budget.tables)if(table.unit&&table.rows.some(r=>r.values.some(Number.isSafeInteger))&&fields.budget.excerpts.length<3){
  fields.budget.excerpts.push({sourceId:table.sourceId,url:table.url,page:table.page,quote:table.quote,status:'evidence_candidate',sectionTitle:'재원·교부 표',attribution:'requires_review',unit:table.unit,unitQuote:table.unitQuote});
 }
 if(fields.budget.excerpts.some(e=>e.status==='evidence_candidate'))fields.budget.status='needs_review';
 for(const a of attempts.filter(a=>a.status==='read'&&a.assessment!=='form_or_cover'))for(const p of a.source?.pages||[]){
  for(const m of p.text.matchAll(/(?:지자체\(교육청\)명|도서관명|수행기관|운영기관|주최\/주관)\s*[:：]\s*([^\n○❍<|]{1,100})/g))organizations.push({label:m[0].split(/[:：]/)[0].trim(),value:m[1].trim(),quote:m[0],sourceId:a.source.sourceId,url:a.source.url,page:p.page});
  for(const m of p.text.matchAll(/■\s*비예산|(?:20\d{2})년\s*기준|총\s*예산액\s*변동\s*없음/g))budgetNotes.push({quote:m[0],sourceId:a.source.sourceId,url:a.source.url,page:p.page});
 }
 return {fields,referenceExcerpts,organizations:organizations.slice(0,12),budgetNotes:budgetNotes.slice(0,12),verification:'labelled-excerpts-only',instruction:'근거 후보입니다. 문서 생산기관과 organizations의 실제 지자체·수행기관을 구분하세요. 기관명 추출만으로 사업 귀속을 확정하지 마세요. 요청한 사업과의 관련성, 금액의 연도·단위·범위는 AI가 원문 문맥과 대조해야 합니다. 비예산 체크가 있어도 가려진 예산을 0원으로 해석하지 마세요. 예산은 계획액·편성액·집행액 중 무엇인지 확인하세요.'};
}
module.exports={evidence};
