const assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {createServer}=require('./http-server');
(async()=>{
 const server=createServer({allowPublic:true,maxSessions:20});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=new URL('http://127.0.0.1:'+server.address().port+'/mcp');
 const results=[];
 try{
  for(const count of [5,10,20]){
   const connections=Array.from({length:count},()=>({client:new Client({name:'public-load-check',version:'1'}),transport:new StreamableHTTPClientTransport(url)}));
   try{
    await Promise.all(connections.map(async c=>{await c.client.connect(c.transport);assert.equal((await c.client.listTools()).tools.length,9);}));
    const started=performance.now();
    const timings=await Promise.all(connections.map(async(c,i)=>{
     const start=performance.now(),q=i%2?'빈집':'산후';
     const r=await c.client.callTool({name:'search_budget_projects',arguments:{q,limit:2}});
     assert(!r.isError);const data=JSON.parse(r.content[0].text);
     assert(data.items.length);assert.equal(data.query,q);
     return Math.round(performance.now()-start);
    }));
    results.push({clients:count,successes:timings.length,totalMs:Math.round(performance.now()-started),maxRequestMs:Math.max(...timings),rssMB:Math.round(process.memoryUsage().rss/1048576),peakRssMB:Math.round(process.resourceUsage().maxRSS/1024)});
   }finally{await Promise.allSettled(connections.map(async c=>{await c.transport.terminateSession();await c.client.close();}));}
  }
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),scope:'local SDK sessions and indexed budget searches; document queue tested separately',results}));
 }finally{await server.shutdown();}
})().catch(e=>{console.error(e);process.exitCode=1;});
