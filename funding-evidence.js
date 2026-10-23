const normalized=s=>String(s).replace(/[\s*·․ㆍ()（）]/g,'');
const columns={총사업비:'projectTotal',시비:'cityShare',구군비:'districtShare',예산액:'appropriation',예산액시:'appropriation',기교부액:'previousAllocation',금회교부액:'currentAllocation',교부잔액:'allocationRemaining'};
function tables(attempts){
 const found=[];
 for(const a of attempts.filter(a=>a.status==='read'&&a.assessment!=='form_or_cover'))for(const p of a.source?.pages||[]){
  const lines=p.text.split('\n');let offset=0;
  for(let i=0;i<lines.length;i++){
   const line=lines[i],start=offset;offset+=line.length+1;
   if(!/^\s*\|/.test(line)||!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1]||''))continue;
   const split=s=>s.trim().slice(1,-1).split('|').map(x=>x.trim());
   const headers=split(line),roles=headers.map(h=>Object.hasOwn(columns,normalized(h))?columns[normalized(h)]:/^예산액\((?:\d+차)?추경반영\)$/.test(h.replace(/<br\s*\/?>/gi,'').replace(/\s/g,''))?'appropriation':null);
   if(new Set(roles.filter(Boolean)).size!==roles.filter(Boolean).length)continue;
   if(!roles.some(Boolean))continue;
   let end=i+2;while(end<lines.length&&/^\s*\|/.test(lines[end]))end++;
   const quote=lines.slice(i,end).join('\n');
   const unitMatch=[...p.text.slice(Math.max(0,start-500),start).matchAll(/단위\s*[:：]\s*([^\n)）]{1,25})/g)].at(-1);
   const unit=unitMatch?.[1].trim();
   const number=s=>/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(s||'')&&Number.isSafeInteger(Number(s.replaceAll(',','')))?Number(s.replaceAll(',','')):null;
   const rows=lines.slice(i+2,end).map(line=>{const cells=split(line);return {label:cells[0],values:roles.map((role,k)=>role?number(cells[k]):null)};});
   const checks=[];
   const get=(r,key)=>r.values[roles.indexOf(key)];
   const has=keys=>keys.every(k=>roles.includes(k));
   for(const row of rows){
    for(const [kind,keys,calculate] of [
     ['funding_shares',['projectTotal','cityShare','districtShare'],v=>v[1]+v[2]],
     ['allocation_balance',['appropriation','previousAllocation','currentAllocation','allocationRemaining'],v=>v[1]+v[2]+v[3]]
    ])if(has(keys)){
     const v=keys.map(k=>get(row,k));
     if(v.every(Number.isSafeInteger))checks.push({kind,row:row.label,status:v[0]===calculate(v)?'matched':'mismatch',stated:v[0],calculated:calculate(v)});
    }
   }
   const total=rows.find(r=>/^(합계|계|총계)$/.test(normalized(r.label)));
   const details=rows.filter(r=>r!==total);
   if(total&&details.length)for(let k=1;k<roles.length;k++)if(roles[k]&&[total,...details].every(r=>Number.isSafeInteger(r.values[k]))){
    const calculated=details.reduce((sum,r)=>sum+r.values[k],0);
    checks.push({kind:'column_sum',column:headers[k],status:total.values[k]===calculated?'matched':'mismatch',stated:total.values[k],calculated});
   }
   found.push({sourceId:a.source.sourceId,url:a.source.url,page:p.page,start,headers,roles,unit:['천원','백만원','원'].includes(unit)?unit:null,unitQuote:unitMatch?.[0]||null,rows,checks,quote,verification:'arithmetic_only_not_policy_attribution',meaning:roles.includes('currentAllocation')?'교부 내역 · 주민 지급실적과 구분':'사업비 재원 구성 · 편성 확정 여부는 문맥 확인'});
   if(found.length===6)return found;
  }
 }
 return found;
}
const amountLabels={총사업비:['project_total','총사업비'],소요예산:['budget_unspecified','소요예산 · 편성 여부 확인'],사업예산:['budget_unspecified','사업예산 · 편성 여부 확인'],사업비:['budget_unspecified','사업비 · 범위 확인'],예산액:['budget_unspecified','예산액 · 범위 확인'],지원금액:['support_amount','지원액'],지원한도:['support_limit','지원 한도'],지원액:['support_amount','지원액'],금회교부결정내역:['current_allocation','금회 교부결정액'],금회교부액:['current_allocation','금회 교부액'],기교부액:['previous_allocation','기교부액'],교부액:['allocation_unspecified','교부액 · 차수 확인'],교부금액:['allocation_unspecified','교부금액 · 차수 확인'],지원금:['support_budget','지원금 예산'],홍보비:['promotion_budget','홍보비'],지원규모:['support_scope','지원 규모 · 성격 확인'],지원단가:['support_unit_rate','지원 단가']};
function amounts(attempts){
 const result=[];
 const headings=Object.keys(amountLabels).map(s=>[...s].join('\\s*')).join('|');
 const boundary=new RegExp('(?:'+headings+'|지원대상|사업기간|신청기간|사업내용)\\s*[:：)]');
 for(const a of attempts.filter(a=>a.status==='read'&&a.assessment!=='form_or_cover'))for(const p of a.source?.pages||[]){
  const pattern=new RegExp('('+headings+')\\s*(?:[:：)]|\\r?\\n|차등적용\\s*▶)','g');let m;
  while((m=pattern.exec(p.text))&&result.length<12){
   // shortcut: classify explicit prose labels only; table roles are returned separately by tables().
   if(p.text.slice(p.text.lastIndexOf('\n',m.index)+1,m.index).includes('|'))continue;
   const tail=p.text.slice(pattern.lastIndex,pattern.lastIndex+300),end=tail.search(boundary);
   const value=tail.slice(0,end<0?tail.length:end).match(/^[ \t]*(?:\r?\n[ \t]*)?[^\r\n]*/)?.[0]||'';
   const quote=p.text.slice(m.index,pattern.lastIndex)+value;
   const matches=[...value.matchAll(/\d[\d,.]*\s*(?:\*\*)?\s*(?:백\s*만|천\s*만|억|만|천|백)?\s*원/g)].map(x=>x[0]);
   const redacted=/\*{3,}|(?:\\\*){3,}|비공개|가림/.test(value);
   const rates=[...value.matchAll(/\d+(?:\.\d+)?\s*%/g)].map(x=>x[0]);
   const key=m[1].replace(/\s+/g,'');let [role,label]=amountLabels[key];
   if(key==='지원규모'&&/^\s*(?:융자\s*(?:금)?\d|(?:금)?[\d,.]+\s*(?:백\s*만|천\s*만|억|만|천|백)?\s*원\s*\(\s*(?:농협\s*)?융자(?:금)?\s*\))/.test(value)){role='financing_principal';label='융자 규모 · 재정지출과 구분';}
   const sameAmounts=matches.length>1&&matches[0].replace(/[\s,]/g,'')===matches[1].replace(/[\s,]/g,'');
   if(role==='budget_unspecified'&&sameAmounts&&/^\s*(?:금)?[\d,.]+\s*(?:백\s*만|천\s*만|억|만|천|백)?\s*원\s*\(\s*(?:이차|이자)보전금\s*[\d,.]+\s*(?:백\s*만|천\s*만|억|만|천|백)?\s*원\s*\)/.test(value)){role='interest_subsidy_budget';label='이자보전 사업비';}
   if(!matches.length&&!redacted&&!(role.startsWith('support_')&&rates.length))continue;
   const per=role.startsWith('support_')?quote.match(/(?:1\s*인|인|1\s*가구|가구|세대|1\s*개소|개소|1\s*명|명)\s*당/):null;
   const reference=/타\s*지자체|타\s*시[·ㆍ]?군|시군명.{0,80}사업비/.test(p.text.slice(0,350));
   result.push({role,label,quote,amountTexts:redacted?[]:role==='support_unit_rate'?matches:matches.slice(0,1),status:redacted?'redacted':'evidence_candidate',attribution:reference?'reference_context':'requires_review',...(role.startsWith('support_')?{recipientBasis:per?.[0]||null,rateTexts:rates,amountBasis:/최대|한도/.test(value)?'ceiling_not_fixed_payment':'source_label'}:{}),sourceId:a.source.sourceId,url:a.source.url,page:p.page,verification:'explicit_label_only',note:role==='financing_principal'?'융자 원금 규모이며 지자체 지출 예산이나 무상 지원금과 구분합니다.':role==='interest_subsidy_budget'?'명시된 이자보전 사업비이며 금융기관의 융자 원금과 합산하지 않습니다.':role.includes('allocation')?'교부 결정·이전 내역이며 주민 지급이나 집행 완료를 뜻하지 않습니다.':role==='support_unit_rate'?'조건별 단가를 원문과 함께 비교하세요. 단가를 사업 총액으로 사용하지 마세요.':'첫 금액은 해당 표제의 근거 후보입니다. 인용문에 함께 있는 재원별 금액을 총액으로 합산하지 마세요. 연도·대상·편성 여부는 문맥을 확인하세요.'});
  }
 }
 return result;
}
module.exports={tables,amounts};
