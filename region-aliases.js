// Expand unambiguous colloquial province names only; 광주시 can also mean a city in Gyeonggi.
const aliases={서울시:'서울특별시',부산시:'부산광역시',대구시:'대구광역시',인천시:'인천광역시',대전시:'대전광역시',울산시:'울산광역시',세종시:'세종특별자치시',경남:'경상남도',경남도:'경상남도',경북:'경상북도',경북도:'경상북도',충남:'충청남도',충남도:'충청남도',충북:'충청북도',충북도:'충청북도'};
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
module.exports={aliases,regionTerms,matchesRegion};
