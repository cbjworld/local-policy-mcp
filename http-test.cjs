const assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {createServer}=require('./http-server');
(async()=>{
 const previous=process.env.MCP_MAX_SESSIONS;
 process.env.MCP_MAX_SESSIONS='0';assert.throws(()=>createServer(),/Invalid session limit/);
 process.env.MCP_MAX_SESSIONS='invalid';assert.throws(()=>createServer(),/Invalid session limit/);
 if(previous===undefined)delete process.env.MCP_MAX_SESSIONS;else process.env.MCP_MAX_SESSIONS=previous;
 const server=createServer({token:'test-only',maxSessions:2});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=new URL('http://127.0.0.1:'+server.address().port+'/mcp'),clients=[],transports=[];
 const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:'Bearer test-only'};
 try{
  assert.equal((await fetch(url,{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}})).status,401);
  assert.equal((await fetch(url,{method:'POST',body:'{}',headers:{...headers,Origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(url,{method:'POST',body:'{',headers})).status,400);
  assert.equal((await fetch(url,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'ping'}),headers})).status,400);
  assert.equal((await fetch(url,{method:'POST',body:' '.repeat(60001),headers})).status,413);
  for(let i=0;i<2;i++){
   const c=new Client({name:'remote-test',version:'1'}),t=new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:'Bearer test-only'}}});
   clients.push(c);transports.push(t);await c.connect(t);
   assert.equal((await c.listTools()).tools.length,9);
   assert.ok(c.getInstructions().includes('title_inferred'));
  }
  const concurrent=await Promise.all(Array.from({length:4},()=>clients[0].listTools()));assert.ok(concurrent.every(r=>r.tools.length===9));
  assert.notEqual(transports[0].sessionId,transports[1].sessionId);
  const budget=await clients[0].callTool({name:'search_budget_projects',arguments:{q:'산후',limit:2}});
  assert.equal(budget.isError,false);const budgetData=JSON.parse(budget.content[0].text);
  assert.equal(budgetData.totalCandidateRows,require('./budget-search').search({q:'산후'}).totalCandidateRows);assert.equal(budgetData.items.length,2);assert.equal(budgetData.scope.nationwideComplete,false);
  const parallel=await Promise.all(clients.map((c,i)=>c.callTool({name:'search_budget_projects',arguments:{q:i?'빈집':'산후',limit:2}})));
  for(let i=0;i<parallel.length;i++){assert.equal(parallel[i].isError,false);assert.equal(JSON.parse(parallel[i].content[0].text).totalCandidateRows,require('./budget-search').search({q:i?'빈집':'산후'}).totalCandidateRows);}
  const init={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}};
  assert.equal((await fetch(url,{method:'POST',body:JSON.stringify(init),headers})).status,503);
  const bad=await clients[0].callTool({name:'read_official_source',arguments:{url:'http://127.0.0.1/private'}});
  assert.equal(bad.isError,true);
  const oldId=transports[0].sessionId;await transports[0].terminateSession();
  assert.equal((await fetch(url,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:2,method:'ping'}),headers:{...headers,'Mcp-Session-Id':oldId}})).status,404);
  assert.equal((await clients[1].listTools()).tools.length,9);
  console.log('PASS: HTTP SDK handshake, tools, isolated sessions, auth, origin, request limit, capacity, invalid URL, deletion');
 }finally{await Promise.allSettled(clients.map(c=>c.close()));await server.shutdown();}
})().catch(e=>{console.error(e);process.exitCode=1;});
