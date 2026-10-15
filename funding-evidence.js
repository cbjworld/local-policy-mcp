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
   const headers=split(line),roles=headers.map(h=>Object.hasOwn(columns,normalized(h))?columns[normalized(h)]:null);
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
module.exports={tables};
