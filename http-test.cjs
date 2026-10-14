const assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {createServer}=require('./http-server');
(async()=>{
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
   assert.equal((await c.listTools()).tools.length,7);
   assert.ok(c.getInstructions().includes('title_inferred'));
  }
  assert.notEqual(transports[0].sessionId,transports[1].sessionId);
  const init={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}};
  assert.equal((await fetch(url,{method:'POST',body:JSON.stringify(init),headers})).status,503);
  const bad=await clients[0].callTool({name:'read_official_source',arguments:{url:'http://127.0.0.1/private'}});
  assert.equal(bad.isError,true);
  const oldId=transports[0].sessionId;await transports[0].terminateSession();
  assert.equal((await fetch(url,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:2,method:'ping'}),headers:{...headers,'Mcp-Session-Id':oldId}})).status,404);
  assert.equal((await clients[1].listTools()).tools.length,7);
  console.log('PASS: HTTP SDK handshake, tools, isolated sessions, auth, origin, request limit, capacity, invalid URL, deletion');
 }finally{await Promise.allSettled(clients.map(c=>c.close()));await server.shutdown();}
})().catch(e=>{console.error(e);process.exitCode=1;});
