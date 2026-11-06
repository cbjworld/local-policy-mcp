const assert=require('node:assert/strict');
const {search}=require('./budget-search');
const inferred=search({q:'해운대구 부모급여'}),explicit=search({q:'부모급여',institution:'부산광역시 해운대구'});assert.equal(inferred.inferredInstitution,'부산광역시 해운대구');assert.deepEqual(inferred.items,explicit.items);assert(inferred.totalCandidateRows>0);assert.equal(search({q:'중구 지원'}).inferredInstitution,undefined);
for(const [q,parent] of [['부산 중구 청년','부산광역시 중구'],['서울 중구 청년','서울특별시 중구']]){const actual=search({q}),expected=search({q:'청년',institution:parent});assert.equal(actual.inferredInstitution,parent);assert.deepEqual(actual.items,expected.items);assert.equal(actual.totalCandidateRows,expected.totalCandidateRows);}assert.equal(search({q:'서울 해운대구 부모급여'}).inferredInstitution,undefined);
assert.equal(search({q:'중구 청년'}).ambiguousInstitution.name,'중구');assert.equal(search({q:'부산 중구 청년'}).ambiguousInstitution,undefined);
const all=search({q:'청년',limit:2});assert.equal(all.items.length,2);assert.equal(all.nextOffset,2);
const next=search({q:'청년',limit:2,offset:2});assert.notDeepEqual(all.items,next.items);
for(const [shorthand,expanded] of [['음식물처리기','음식물 처리기'],['전세보증료','전세 보증료']]){
 const first=search({q:shorthand,limit:2}),wide=search({q:expanded,limit:2});
 assert.ok(first.totalCandidateRows>2,shorthand);assert.deepEqual(first.expandedSearchTerms,expanded.split(' '));
 assert.equal(first.totalCandidateRows,wide.totalCandidateRows);assert.deepEqual(first.items,wide.items);
 assert.ok(first.items.every(item=>item.source&&Number.isFinite(item.budget)));
 const second=search({q:shorthand,limit:2,offset:2});assert.equal(second.totalCandidateRows,first.totalCandidateRows);assert.deepEqual(second.items,search({q:expanded,limit:2,offset:2}).items);
}
const food=search({q:'음식물처리기',institution:'부산 금정구'});
assert.equal(food.totalCandidateRows,1);assert.equal(food.items[0].name,'가정용 음식물쓰레기 처리기 구입 지원');assert.ok(food.items[0].source);assert.equal(food.items[0].page,102);
const yongin=search({q:'청년참여 활성화',institution:'경기 용인시'});
assert.equal(yongin.totalCandidateRows,1);assert.equal(yongin.items[0].budget,105400);assert.equal(yongin.items[0].page,23);assert.ok(yongin.items[0].source.includes('yongin.go.kr'));
const iksan=search({q:'익산형 근로청년수당',institution:'익산시'});
assert.equal(iksan.totalCandidateRows,1);assert.equal(iksan.items[0].budget,3642740);assert.equal(iksan.items[0].page,1);assert.ok(iksan.items[0].source.includes('iksan.go.kr'));
const suseong=search({q:'청년센터 운영',institution:'대구 수성구'});
assert.equal(suseong.totalCandidateRows,1);assert.equal(suseong.items[0].budget,129619);assert.equal(suseong.items[0].page,16);assert.ok(suseong.items[0].source.includes('suseong.kr'));
const gyeyangRent=search({q:'청년월세 한시 특별지원',institution:'인천 계양구',limit:10});
assert.equal(gyeyangRent.totalCandidateRows,2);assert.deepEqual(gyeyangRent.items.map(x=>x.budget).sort((a,b)=>a-b),[72000,735000]);assert.ok(gyeyangRent.items.every(x=>x.page===6&&x.source.includes('/2026_0/')));
const dalseo=search({q:'달서청년 자격증 응시료',institution:'대구 달서구'});
assert.equal(dalseo.totalCandidateRows,1);assert.equal(dalseo.items[0].budget,56000);assert.equal(dalseo.items[0].page,4);assert.ok(dalseo.items[0].source.includes('dalseo.daegu.kr'));
const gangwon=search({q:'도정시책 및 현안사업의 전략적 추진',institution:'강원특별자치도'});
assert.equal(gangwon.totalCandidateRows,1);assert.equal(gangwon.items[0].budget,193000);assert.equal(gangwon.items[0].page,1);assert.ok(gangwon.items[0].source.includes('gwd.go.kr'));
const dalseong=search({q:'출산축하금 지원',institution:'대구 달성군'});
assert.equal(dalseong.totalCandidateRows,1);assert.equal(dalseong.items[0].budget,2500000);assert.equal(dalseong.items[0].page,18);assert.ok(dalseong.items[0].source.includes('dalseong.daegu.kr'));
assert.equal(search({q:'산후',institution:'경남 거제시'}).totalCandidateRows,search({q:'산후',institution:'거제시'}).totalCandidateRows);
assert.equal(search({q:'산후',institution:'경기도 거제시'}).totalCandidateRows,0);
assert.equal(search({q:'산후조리비'}).expandedSearchTerms,undefined);
assert.equal(search({q:'120미추홀콜센터'}).items[0].budget,229409);
assert.equal(search({q:'합천호 노후관광지',institution:'합천'}).items[0].budget,1500000);
assert.equal(search({q:'산후',institution:'존재하지않는기관'}).totalCandidateRows,0);
for(const [institution,parent,local] of [['부산 중구','부산광역시','중구'],['서울 강남구','서울특별시','강남구']]){
 const result=search({q:'청년',institution,limit:20});
 assert(result.totalCandidateRows>0,institution);
 assert(result.items.every(row=>row.parent===parent&&row.institution===local));
 assert.deepEqual(result.items,search({q:'청년',institution:parent+' '+local,limit:20}).items);
 assert.deepEqual(result.items,search({q:'청년',institution:local+' '+parent,limit:20}).items);
}
assert.equal(search({q:'청년',institution:'부산 강남구'}).totalCandidateRows,0);
for(const [short,full] of [['부산시 수영구','부산광역시 수영구'],['대구시 남구','대구광역시 남구'],['경남 김해시','경상남도 김해시'],['충남 천안시','충청남도 천안시']]){
 const a=search({q:'청년',institution:short,limit:5}),b=search({q:'청년',institution:full,limit:5});
 assert(a.totalCandidateRows>0,short);assert.deepEqual(a.items,b.items);assert.equal(a.totalCandidateRows,b.totalCandidateRows);assert.equal(a.nextOffset,b.nextOffset);
 assert(a.items.every(x=>x.source&&Number.isFinite(x.budget)),'original budget and source must survive alias matching');
}
assert.deepEqual(require('./region-aliases').regionTerms('경기도 광주시'),['경기도','광주시'],'ambiguous city name must not be expanded');
for(const args of [{q:''},{q:'청년',limit:21},{q:'청년',offset:-1},{q:3},{q:'청년',institution:[]}])assert.throws(()=>search(args));
const {spawnSync}=require('node:child_process');
const messages=[{jsonrpc:'2.0',id:0,method:'initialize',params:{protocolVersion:'2025-11-25',clientInfo:{name:'budget-test',version:'1'},capabilities:{}}},{jsonrpc:'2.0',method:'notifications/initialized'},{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'search_budget_projects',arguments:{q:'산후'}}}];
const r=spawnSync(process.execPath,['--use-system-ca','--max-old-space-size=512','mcp.js'],{cwd:__dirname,input:messages.map(JSON.stringify).join('\n')+'\n',encoding:'utf8',timeout:15000});
assert.equal(r.status,0,r.stderr);const reply=JSON.parse(r.stdout.trim().split('\n').at(-1));assert.equal(reply.result.isError,false);assert.equal(JSON.parse(reply.result.content[0].text).totalCandidateRows,search({q:'산후'}).totalCandidateRows);
console.log('budget search + MCP invocation passed');

const andong=search({q:'빈집 철거',institution:'안동'}).items;assert.equal(andong.length,1);assert.equal(andong[0].budget,240000);assert.equal(andong[0].page,null);assert.ok(andong[0].table>0&&andong[0].tableRow>0);assert.ok(andong[0].source.startsWith('https://'));
const asan=search({q:'의정활동 지원',institution:'아산'}).items[0];assert.equal(asan.budget,1626509);assert.equal(asan.page,1);assert.equal(asan.institutionAggregateVerified,true);
const jeonnam=search({q:'소통도정 운영',institution:'전라남도'}).items[0];assert.equal(jeonnam.budget,77532);assert.equal(jeonnam.page,1);assert.ok(jeonnam.source.startsWith('https://www.jeonnam.go.kr/'));

// The website PDF is a proposal; the published total comes from the official original-budget dataset.
const yeosu=require("./verified-budget-search").search({institution:"여수시"}).items[0];
assert.equal(yeosu.amount,1354528942);assert.equal(yeosu.matchedDepartments,0);
assert.ok(yeosu.sources.every(url=>!url.includes("yeosu.go.kr/contents/12808/2026.pdf")));
const gyeyang=require('./verified-budget-search').search({institution:'계양구'}).items[0];
assert.equal(gyeyang.amount,732739805);assert.ok(gyeyang.sources.some(url=>url.includes('/2026_0/general_all02.pdf')));
const pohang=require('./verified-budget-search').search({institution:'포항시'}).items[0];
assert.equal(pohang.amount,2718000000);assert.ok(pohang.sources.some(url=>url.includes('VGEEEEEaCCIEGEEEEdGG')));
const geumcheon=require('./verified-budget-search').search({institution:'금천구'}).items[0];
assert.equal(geumcheon.amount,733143381);assert.ok(geumcheon.sources.some(url=>url.includes('nttNo=267459')));
for(const name of ['중랑구','광주시'])assert.equal(require('./verified-budget-search').search({institution:name}).items[0].amountStatus,'approximate');
const sokcho=require('./verified-budget-search').search({institution:'속초시'}).items[0];
assert.equal(sokcho.amount,468250973);assert.equal(sokcho.amountStatus,'official_database_with_vote');
assert(sokcho.sources.includes('https://www.sokchocl.go.kr/kr/assembly/details.do'));
assert(sokcho.sources.includes('https://www.sokchocl.go.kr/kr/assembly/five.do'));
assert(sokcho.sourceAccessNote.includes('제349회 예산결산특별위원회 제1차(2025.12.01.)'));
assert(sokcho.sourceAccessNote.includes('제349회 본회의 제3차(2025.12.19.)'));
for(const name of ['당진시','인천 동구(편성 당시)']){
 const result=require('./verified-budget-search').search({institution:name}),row=result.items[0];
 assert.equal(row.amountStatus,'source_conflict');assert.equal(row.amount,null);assert.equal(row.conflictCandidates.length,2);
 assert.equal(result.amountStatusCounts.unconfirmed,1);
}
const totals=require('./verified-budget-search').search;
assert.deepEqual(totals({institution:'인천 동구'}).items.map(x=>x.institution),['인천 동구(편성 당시)']);
assert.deepEqual(totals({institution:'인천동구'}).items.map(x=>x.institution),['인천 동구(편성 당시)']);
assert.deepEqual(totals({institution:'인천 남동구'}).items.map(x=>x.institution),['남동구']);
assert.deepEqual(totals({institution:'양주시'}).items.map(x=>x.institution),['양주시']);
assert.deepEqual(totals({institution:'남양주시'}).items.map(x=>x.institution),['남양주시']);
assert.deepEqual(totals({institution:'양주'}).items.map(x=>x.institution),['양주시']);
assert(totals({institution:'동구',limit:20}).items.every(x=>x.institution==='동구'||x.institution==='인천 동구(편성 당시)'));
assert(totals({institution:'대구',limit:20}).items.every(x=>x.parent==='대구광역시'));

// Recovered sources, shifted table labels, and general-account transfers stay searchable.
for(const [institution,q,department,budget,page] of [
  ['구미시','적극적시책홍보','양포동',71358,1],
  ['용산구','노후위험시설물스마트안전관리시스템운영및유지관리','안전재난과',259595,682],
  ['남원시','하수도특별회계 자본전출','상하수도사업소',14975724,3],
  ['김포시','도심항공교통(UAM) 체계 구축','미래전략과',35000,284],
  ['안성시','전화금융사기 예방','행정과',57833,4],
  ['괴산군','예산편성 운영','기획홍보과',194328,6],
  ['충주시','노동단체 화합행사','투자유치과',69500,251],
  ['영월군','지방세정운영','세무회계과',263918,1],
  ['기장군','기금전출금(옥외광고발전기금)','도로관리과',40000,433]
]) {
  let result=search({q,institution,limit:20}),item=result.items.find(row=>row.department===department);
  while(!item&&result.nextOffset!==null){result=search({q,institution,limit:20,offset:result.nextOffset});item=result.items.find(row=>row.department===department);}
  assert.ok(item,`${institution} ${department}`);assert.equal(item.budget,budget);assert.equal(item.page,page);
}

for(const [short,full,wrong] of [['부산 수영구','부산광역시 수영구','울산 수영구'],['울산 중구','울산광역시 중구','부산 중구']]){
 const totals=require('./verified-budget-search').search;
 assert.equal(totals({institution:short}).total,1);
 assert.deepEqual(totals({institution:short}).items,totals({institution:full}).items);
 assert.notDeepEqual(totals({institution:short}).items,totals({institution:wrong}).items);
}
assert.deepEqual(require('./verified-budget-search').search({institution:'부산시 수영구'}),require('./verified-budget-search').search({institution:'부산광역시 수영구'}));
