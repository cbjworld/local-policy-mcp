const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'daegu-buk-audit-test-'));
try{
 for(const file of ['budget-search.js','policy-catalog.js','region-aliases.js','budget-data.json.gz','verified-budget-data.json','catalog-institutions.json']){const src=path.join(__dirname,file);if(fs.existsSync(src))fs.copyFileSync(src,path.join(tmp,file));}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp,'budget-data.json.gz'))));
 const rows=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-6f5ddb540e'&&data.contexts[i].department==='감사실');
 assert.equal(rows.length,7);assert.equal(rows.reduce((n,[,r])=>n+r.budget,0),287481);assert.equal(rows.reduce((n,[,r])=>n+r.previous,0),310115);
 assert(rows.every(([i,r])=>r.budget-r.previous===r.delta&&r.page&&data.contexts[i].institutionAggregateVerified===false));
 const result=require(path.join(tmp,'budget-search')).search({q:'부패방지업무추진',institution:'대구 북구'});
 const item=result.items.find(x=>x.department==='감사실');assert(item);assert.equal(item.budget,15420);assert.equal(item.previous,20420);assert.equal(item.page,2);assert.match(item.source,/\/6\.pdf$/);
 assert.match(item.limitation,/30개 부서/);assert.equal(result.scope.partialInstitutionCoverage['대구광역시 북구'].budgetRows,1088);
 const innovation=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-6f5ddb540e'&&data.contexts[i].department==='혁신전략과');
 assert.equal(innovation.length,13);assert.equal(innovation.reduce((n,[,r])=>n+r.budget,0),6676835);assert.equal(innovation.reduce((n,[,r])=>n+r.previous,0),5643886);
 assert(innovation.every(([i,r])=>r.budget-r.previous===r.delta&&r.page>=20&&r.page<=24&&data.contexts[i].account==='일반회계'));
 const found=require(path.join(tmp,'budget-search')).search({q:'도청터 및 주변 지역 개발 추진',institution:'대구 북구'}).items.find(x=>x.department==='혁신전략과');
 assert(found);assert.equal(found.budget,4800);assert.equal(found.page,20);assert.match(found.source,/\/7\.pdf$/);assert.match(found.limitation,/전년도액 합계/);
 for(const [department,count,total,previous,pageMin,pageMax] of [['정책소통과',13,1042558,1220533,12,19],['정보통신과',19,4153766,3780909,25,33]]){
  const list=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-6f5ddb540e'&&data.contexts[i].department===department);
  assert.equal(list.length,count);assert.equal(list.reduce((s,[,r])=>s+r.budget,0),total);assert.equal(list.reduce((s,[,r])=>s+r.previous,0),previous);
  assert(list.every(([i,r])=>r.budget-r.previous===r.delta&&r.page>=pageMin&&r.page<=pageMax&&data.contexts[i].account==='일반회계'));
  const [i,row]=list[0],hit=require(path.join(tmp,'budget-search')).search({q:row.name,institution:'대구 북구'}).items.find(x=>x.department===department);
  assert(hit);assert.equal(hit.budget,row.budget);assert.equal(hit.page,row.page);assert.equal(hit.source,data.contexts[i].source);
 }
 for(const [department,count,total,previous,first,last] of [["행정지원과", 37, 80939177, 76317159, 1, 25], ["재무과", 10, 4786445, 2700146, 26, 34], ["민원여권과", 11, 578355, 530508, 35, 41], ["세무과", 10, 1027872, 1028787, 42, 48], ["토지정보과", 16, 2318928, 3379587, 54, 62], ["일자리정책과", 30, 3271152, 2618052, 1, 11], ["관광과", 33, 1845920, 1314989, 12, 23], ["도시재생과", 8, 13169553, 6468800, 24, 27], ["민생경제과", 72, 5276697, 4411032, 28, 49]] ){
  const list=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-6f5ddb540e'&&data.contexts[i].department===department);assert.equal(list.length,count);assert.equal(list.reduce((n,[,r])=>n+r.budget,0),total);assert.equal(list.reduce((n,[,r])=>n+r.previous,0),previous);assert(list.every(([i,r])=>r.budget-r.previous===r.delta&&r.page>=first&&r.page<=last&&data.contexts[i].account==='일반회계'));
 }
 for(const [department,count,total,previous,first,last] of [["문화예술과", 32, 12161589, 12605481, 1, 8], ["공원녹지과", 55, 16927700, 11699188, 9, 39], ["교육청소년과", 52, 12530464, 10320133, 40, 56], ["체육진흥과", 30, 6244402, 13384957, 57, 68], ["안전총괄과", 47, 2654166, 2702438, 13, 29], ["건축주택과", 12, 1486358, 1013379, 30, 35], ["건설과", 54, 11100969, 9561000, 36, 53], ["보건과", 32, 16975648, 16777477, 1, 30], ["건강증진과", 57, 18777794, 15263265, 31, 79], ["위생과", 22, 1594964, 1532287, 80, 87], ["강북보건지소", 6, 812658, 753075, 88, 99]] ){
  const list=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-6f5ddb540e'&&data.contexts[i].department===department);assert.equal(list.length,count);assert.equal(list.reduce((n,[,r])=>n+r.budget,0),total);assert.equal(list.reduce((n,[,r])=>n+r.previous,0),previous);assert(list.every(([i,r])=>r.budget-r.previous===r.delta&&r.page>=first&&r.page<=last&&data.contexts[i].account==='일반회계'));
 }
 for(const [department,count,total,previous,first,last] of [["고성동", 6, 980056, 950262, 1, 4], ["칠성동", 6, 1320205, 1370444, 5, 9], ["침산1동", 6, 807695, 897224, 10, 14], ["침산2동", 6, 1027516, 965988, 15, 19], ["침산3동", 7, 1041804, 1077510, 20, 24], ["노원동", 6, 1104523, 1076412, 25, 29], ["산격1동", 6, 1204917, 1308642, 30, 34], ["산격2동", 6, 927254, 921126, 35, 39], ["산격3동", 6, 934938, 946706, 40, 44], ["산격4동", 6, 909204, 946860, 45, 49], ["복현1동", 6, 884400, 838405, 50, 54], ["복현2동", 8, 1293250, 1300758, 55, 59], ["대현동", 6, 1260897, 1224627, 60, 64], ["검단동", 6, 848687, 833887, 65, 69], ["무태조야동", 6, 1715306, 1762497, 70, 74], ["관문동", 6, 1860908, 1891622, 75, 79], ["태전1동", 6, 1199641, 1207912, 80, 84], ["태전2동", 6, 1308141, 1219046, 85, 89], ["구암동", 7, 1458320, 1418649, 90, 94], ["관음동", 6, 1243659, 1246830, 95, 99], ["읍내동", 6, 1365079, 1371368, 100, 104], ["동천동", 6, 1279481, 1329386, 105, 109], ["국우동", 6, 1487669, 1523798, 110, 114], ["복지정책과", 84, 286526583, 264291983, 1, 25]] ){
  const list=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-6f5ddb540e'&&data.contexts[i].department===department);assert.equal(list.length,count);assert.equal(list.reduce((n,[,r])=>n+r.budget,0),total);assert.equal(list.reduce((n,[,r])=>n+r.previous,0),previous);assert(list.every(([i,r])=>r.budget-r.previous===r.delta&&r.page>=first&&r.page<=last&&data.contexts[i].account==='일반회계'));
 }
 for(const [department,count,total,previous,first,last] of [["희망복지과", 61, 86065369, 78316839, 35, 55], ["여성아동과", 83, 162754883, 153613026, 56, 87], ["징수과", 4, 784357, 771587, 49, 52]] ){
  const list=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-6f5ddb540e'&&data.contexts[i].department===department);assert.equal(list.length,count);assert.equal(list.reduce((n,[,r])=>n+r.budget,0),total);assert.equal(list.reduce((n,[,r])=>n+r.previous,0),previous);assert(list.every(([i,r])=>r.budget-r.previous===r.delta&&r.page>=first&&r.page<=last&&data.contexts[i].account==='일반회계'));
 }
 const withheld=data.rows.filter(([i,r])=>data.contexts[i].institutionId==='gov-6f5ddb540e'&&data.contexts[i].department==='징수과'&&['세외수입징수관리','과태료징수시스템 운영관리'].includes(r.name));assert.equal(withheld.length,0);
 const planning=data.rows.filter(([i])=>data.contexts[i].institutionId==='gov-6f5ddb540e'&&data.contexts[i].department==='기획예산과');
 assert.equal(planning.length,25);assert.equal(planning.reduce((n,[,r])=>n+r.budget,0),4518393);assert.equal(planning.reduce((n,[,r])=>n+r.previous,0),5302162);
 assert(planning.every(([i,r])=>r.budget-r.previous===r.delta&&r.page>=1&&r.page<=11&&data.contexts[i].account==='일반회계'));
 const planned=require(path.join(tmp,'budget-search')).search({q:'민선9기 북구청장직 인수위원회 운영',institution:'대구 북구'}).items.find(x=>x.department==='기획예산과');assert(planned);assert.equal(planned.budget,30350);assert.equal(planned.page,1);assert.match(planned.source,/\/7\.pdf$/);
 const personnel=planning.filter(([,r])=>r.name==='인력운영비');assert.deepEqual(personnel.map(([,r])=>r.budget).sort((a,b)=>a-b),[70000,324565]);
 assert.equal(require(path.join(tmp,'policy-catalog')).projectId(data.contexts[personnel[0][0]],personnel[0][1]),require(path.join(tmp,'policy-catalog')).projectId(data.contexts[personnel[1][0]],personnel[1][1]));
 console.log('PASS: 대구 북구 감사실 7행 합계·부분 범위·출처 확인');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
