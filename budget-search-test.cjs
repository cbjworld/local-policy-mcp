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
