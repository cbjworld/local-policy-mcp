const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'budget-data.json.gz'))));
for(const [department,count,total,previous] of [['홍보미래담당관',18,4620323,1777269],['의회사무과',7,1383392,1260485],['시설사업소',3,1055377,954824],['건축과',11,2243630,1647359],['공공사업과',7,24800000,13728150],['세무과',7,612379,531600],['기획감사담당관',23,10310907,10090599],['회계과',20,52358014,50042569],['민원봉사과',20,758860,649220],['정보통신과',20,4057478,3999211],['문화예술과',62,6654649,4280685],['체육관광과',65,10566507,7102066],['일자리경제과',50,7142676,5495589],['환경보호과',53,30422670,24384693],['자치행정과',60,38744210,34650228],['도시재생과',18,8502522,3413727],['교통행정과',45,15842531,17393663],['도로과',27,13587184,14420433],['사회복지과',184,153441741,145948931],['보건행정과',41,5006856,4866727],['도서문화사업소',19,2366494,1784842],['미래교육진흥원',28,10942544,12891867],['가족지원과',137,37476909,37253602],['안전총괄과',43,5374940,5434443],['건강증진과',72,7862540,7484330],['공원녹지과',52,12933825,14891319],['농업축산위생과',115,5027465,5362363]]){
 const rows=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-268aa4681e'&&data.contexts[i].department===department);
 assert.equal(rows.length,count);assert.equal(rows.reduce((n,[,r])=>n+r.budget,0),total);assert.equal(rows.reduce((n,[,r])=>n+r.previous,0),previous);
 assert(rows.every(([i,r])=>r.budget-r.previous===r.delta&&r.page&&data.contexts[i].institutionAggregateVerified===false));
 const [i,row]=rows[0],ctx=data.contexts[i],found=require('./budget-search').search({q:row.name,institution:'동두천시'}).items.find(x=>x.department===department&&x.name===row.name);
 assert(found);assert.equal(found.budget,row.budget);assert.equal(found.page,row.page);assert.equal(found.source,ctx.source);assert.match(found.limitation,/미수록/);
 if(['건축과','공공사업과','기획감사담당관','회계과','정보통신과','문화예술과','체육관광과','일자리경제과','환경보호과','자치행정과','도시재생과','교통행정과','도로과','사회복지과','보건행정과','도서문화사업소','미래교육진흥원','가족지원과','안전총괄과','건강증진과','공원녹지과','농업축산위생과'].includes(department))assert.match(found.limitation,/전년도액 합계/);
}
const scope=data.scope.partialInstitutionCoverage['동두천시'];assert.equal(scope.verifiedDepartments,36);assert.equal(scope.budgetRows,1357);assert.equal(scope.unverifiedDepartments,0);
const coverage=JSON.parse(fs.readFileSync(path.join(__dirname,'validation/dongducheon-2026-coverage.json')));
const listed=Object.values(coverage.groups).flat(),indexed=new Set(data.contexts.filter(x=>x.institutionId==='gov-268aa4681e').map(x=>x.department));
assert.equal(listed.length,36);assert.equal(coverage.indexedDepartments,36);assert.equal(coverage.remainingDepartments,0);
assert(listed.every(x=>(x.status==='indexed')===indexed.has(x.department)));
console.log('PASS: 동두천 27개 부서 1207행, 총괄·원문·부분 범위');
