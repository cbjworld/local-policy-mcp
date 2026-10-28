// Expand unambiguous colloquial province names only; 광주시 can also mean a city in Gyeonggi.
const aliases={서울시:'서울특별시',부산시:'부산광역시',대구시:'대구광역시',인천시:'인천광역시',대전시:'대전광역시',울산시:'울산광역시',세종시:'세종특별자치시',경남:'경상남도',경남도:'경상남도',경북:'경상북도',경북도:'경상북도',충남:'충청남도',충남도:'충청남도',충북:'충청북도',충북도:'충청북도'};
const regionTerms=value=>value.trim().normalize('NFKC').split(/\s+/).map(term=>aliases[term]||term);
module.exports={aliases,regionTerms};
