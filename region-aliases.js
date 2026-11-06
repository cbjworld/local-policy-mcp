// Expand unambiguous colloquial province names only; 광주시 can also mean a city in Gyeonggi.
const aliases={서울시:'서울특별시',부산시:'부산광역시',대구시:'대구광역시',인천시:'인천광역시',대전시:'대전광역시',울산시:'울산광역시',세종시:'세종특별자치시',경남:'경상남도',경남도:'경상남도',경북:'경상북도',경북도:'경상북도',충남:'충청남도',충남도:'충청남도',충북:'충청북도',충북도:'충청북도'};
const parentAliases={...aliases,서울:'서울특별시',부산:'부산광역시',대구:'대구광역시',인천:'인천광역시',대전:'대전광역시',울산:'울산광역시',경기:'경기도',강원:'강원특별자치도',강원도:'강원특별자치도',전북:'전북특별자치도',전라북도:'전북특별자치도',전남:'전라남도',제주:'제주특별자치도',제주도:'제주특별자치도'};
const regionTerms=value=>value.trim().normalize('NFKC').split(/\s+/).map(term=>aliases[term]||term);
const normalize=value=>String(value??'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
function matchesRegion(terms,entry){
 const name=String(entry.institution??'').normalize('NFKC');
 const local=name.split(/\s+/).map(part=>normalize(part.split('(')[0]));
 const localFull=normalize(name.replace(/\([^)]*\)/g,''));
 const parents=String(entry.parent??'').normalize('NFKC').split(/\s+/).map(normalize);
 const key=normalize((entry.parent||'')+' '+entry.institution);
 return terms.every(term=>term==='대구'
  ?normalize(entry.parent).includes(term)||local.includes('대구광역시')
  :/^[가-힣]+[시구군]$/.test(term)&&!/(광역시|특별시|특별자치시)$/.test(term)
   ?local.includes(term)||localFull===term||parents.includes(term)||key===term
   :/^[가-힣]{2,}$/.test(term)?normalize(entry.parent).includes(term)||local.some(part=>part.startsWith(term)):key.includes(term));
}
function queryWithoutRegion(query,institution){
 if(typeof query!=='string'||typeof institution!=='string'||!institution.trim())return query;
 const names=institution.trim().split(/\s+/).map(x=>x.normalize('NFKC'));
 for(const [alias,parent] of Object.entries(parentAliases))if(names.includes(parent)&&!names.includes(alias))names.push(alias);
 const tokens=query.trim().split(/\s+/), kept=tokens.filter(token=>{
  const word=token.normalize('NFKC').replace(/[?？!！,.，。]+$/u,'');
  return !names.some(name=>[name,name+'의',name+'에서',name+'은',name+'는'].includes(word));
 });
 return kept.length&&kept.length<tokens.length?kept.join(' '):query;
}
function inferInstitution(query,records){
 if(typeof query!=='string'||!Array.isArray(records))return null;
 const tokens=query.trim().normalize('NFKC').split(/\s+/).map(t=>t.replace(/[?？!！,.，。]+$/u,'').replace(/(?:에서|으로|의|은|는)$/u,''));
 const parents=new Set(tokens.map(t=>parentAliases[t]||t).filter(t=>records.some(r=>r.parent===t)));
 if(parents.size>1)return null;
 const found=records.filter(r=>r.parent&&r.institution&&r.institution!==r.parent&&!r.institution.includes('(')&&tokens.includes(r.institution)&&(!parents.size||parents.has(r.parent)));
 const unique=new Map(found.map(r=>[JSON.stringify([r.parent,r.institution]),r]));
 if(unique.size!==1)return null;
 const r=unique.values().next().value;
 return `${r.parent} ${r.institution}`;
}
function ambiguousInstitution(query,records){
 if(typeof query!=='string'||!Array.isArray(records))return null;
 const tokens=query.trim().normalize('NFKC').split(/\s+/).map(t=>t.replace(/[?？!！,.，。]+$/u,'').replace(/(?:에서|으로|의|은|는)$/u,''));
 if(tokens.some(t=>records.some(r=>r.parent===(parentAliases[t]||t))))return null;
 const found=records.filter(r=>r.parent&&r.institution&&r.institution!==r.parent&&!r.institution.includes('(')&&tokens.includes(r.institution));
 const names=[...new Set(found.map(r=>r.institution))],parents=[...new Set(found.map(r=>r.parent))];
 return names.length===1&&parents.length>1?{name:names[0],parents,note:'같은 이름의 지자체가 여러 곳입니다. 광역 지역을 함께 지정해 주세요.'}:null;
}
module.exports={aliases,regionTerms,matchesRegion,queryWithoutRegion,inferInstitution,ambiguousInstitution};
