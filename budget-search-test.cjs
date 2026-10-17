const assert=require('node:assert/strict');
const {search}=require('./budget-search');
const all=search({q:'청년',limit:2});assert.equal(all.items.length,2);assert.equal(all.nextOffset,2);
const next=search({q:'청년',limit:2,offset:2});assert.notDeepEqual(all.items,next.items);
assert.equal(search({q:'120미추홀콜센터'}).items[0].budget,229409);
assert.equal(search({q:'합천호 노후관광지',institution:'합천'}).items[0].budget,1500000);
assert.equal(search({q:'산후',institution:'존재하지않는기관'}).totalCandidateRows,0);
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

// Recovered sources, shifted table labels, and general-account transfers stay searchable.
for(const [institution,q,department,budget,page] of [
  ['구미시','적극적시책홍보','양포동',71358,1],
  ['용산구','노후위험시설물스마트안전관리시스템운영및유지관리','안전재난과',259595,682],
  ['남원시','하수도특별회계 자본전출','상하수도사업소',14975724,3],
  ['김포시','도심항공교통(UAM) 체계 구축','미래전략과',35000,284]
]) {
  let result=search({q,institution,limit:20}),item=result.items.find(row=>row.department===department);
  while(!item&&result.nextOffset!==null){result=search({q,institution,limit:20,offset:result.nextOffset});item=result.items.find(row=>row.department===department);}
  assert.ok(item,`${institution} ${department}`);assert.equal(item.budget,budget);assert.equal(item.page,page);
}
