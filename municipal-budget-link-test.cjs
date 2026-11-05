const assert=require('node:assert/strict');
const {link}=require('./municipal-budget-link.cjs');
const website={name:'청년월세 지원사업',institution:'칠곡군',parent:'경상북도',source:'https://www.chilgok.go.kr/web',location:{section:1}};
const rows=[{name:'청년월세지원사업',institution:'칠곡군',parent:'경상북도',year:2026,unit:'천원',budget:123,source:'https://www.chilgok.go.kr/budget',page:1},{name:'청년신혼부부 월세지원사업',institution:'칠곡군',parent:'경상북도'},{name:'청년월세지원사업',institution:'다른군',parent:'경상북도'}];
const deps={homepage:{search:()=>({items:[website],total:1,nextOffset:null})},budget:{search:()=>({items:rows,totalCandidateRows:3,nextOffset:null,scope:{}})}};
const result=link({q:'청년 월세',institution:'칠곡군'},deps);
assert.equal(result.pairs.length,1);assert.equal(result.pairs[0].relationship,'same_name_region_candidate');assert.equal(result.pairs[0].budget.budget,123);assert.equal(result.pairs[0].budget.unit,'천원');assert.equal(result.pairs[0].homepage.source,website.source);assert.equal(result.pairs[0].budget.source,rows[0].source);assert.match(result.pairs[0].note,/후보/);assert.throws(()=>link({q:'월세'},deps));
console.log('PASS: same-region same-name candidates retain separate evidence, amount and year');
