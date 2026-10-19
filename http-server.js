const http=require('node:http'),{randomUUID}=require('node:crypto');
const {Server}=require('@modelcontextprotocol/sdk/server/index.js');
const {createHandler}=require('./mcp');
const {createQueue}=require('./research-queue');
const {StreamableHTTPServerTransport}=require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {ListToolsRequestSchema,CallToolRequestSchema,isInitializeRequest}=require('@modelcontextprotocol/sdk/types.js');

function createServer({publicUrl,token,allowPublic=false,maxSessions=Number(process.env.MCP_MAX_SESSIONS||20)}={}){
 const origin=publicUrl?new URL(publicUrl):null;
 if(origin&&origin.protocol!=='https:')throw new Error('PUBLIC_URL must use HTTPS');
 if(!Number.isInteger(maxSessions)||maxSessions<1||maxSessions>32)throw new Error('Invalid session limit');
 const sessions=new Map();let starting=0;
 const researchQueue=createQueue();
 const fastTools=new Set(['search_budget_projects','search_verified_budget_totals','build_research_brief','calculate_policy_budget']);
 const fail=(res,status,message)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:message}));};
 async function dispose(s){if(s.closed)return;s.closed=true;for(const wake of s.waiters.splice(0))wake();sessions.delete(s.transport.sessionId);await s.server.close();}
 const timer=setInterval(()=>{for(const s of sessions.values())if(!s.active&&Date.now()-s.last>15*60*1000)void dispose(s);},30000);timer.unref();
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  // Hosting probes use an internal Host header; this endpoint exposes only process health.
  if(req.url==='/health'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"status":"ok"}');}
  const localHosts=new Set(['127.0.0.1:'+server.address().port,'localhost:'+server.address().port]);
  if(!(origin?req.headers.host===origin.host:localHosts.has(req.headers.host)))return fail(res,403,'Invalid host');
  if(req.headers.origin&&req.headers.origin!==(origin?.origin||'http://'+req.headers.host))return fail(res,403,'Invalid origin');
  if(req.url!=='/mcp')return fail(res,404,'Not found');
  if(token&&req.headers.authorization!=='Bearer '+token)return fail(res,401,'Authentication required');
  if(!token&&!allowPublic&&origin)return fail(res,403,'Public access is not enabled');
  if(!['POST','GET','DELETE'].includes(req.method)){res.setHeader('Allow','POST, GET, DELETE');return fail(res,405,'Method not allowed');}
  // Session-local citation stores share one read-only budget index.
  let s,created=false,reserved=false;
  try{
   let body;
   if(req.method==='POST'){
    if(!req.headers['content-type']?.startsWith('application/json'))return fail(res,415,'JSON required');
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>60000){fail(res,413,'Request too large');req.resume();return;}chunks.push(chunk);}
    try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return fail(res,400,'Invalid JSON');}
   }
   const id=req.headers['mcp-session-id'];
   if(id){s=sessions.get(id);if(!s)return fail(res,404,'Session expired; initialize again');}
   else{
    if(req.method!=='POST'||!isInitializeRequest(body))return fail(res,400,'Initialize first');
    if(sessions.size+starting>=maxSessions){res.setHeader('Retry-After','30');return fail(res,503,'Session capacity reached');}
    starting++;reserved=true;
    let rpc;
    try{
     const handle=createHandler();
     const init=await handle({jsonrpc:'2.0',id:0,method:'initialize',params:body.params});
     if(init.error)throw Error(init.error.message);
     await handle({jsonrpc:'2.0',method:'notifications/initialized'});
     rpc=new Server(init.result.serverInfo,{capabilities:{tools:{}},instructions:init.result.instructions});
     const transport=new StreamableHTTPServerTransport({sessionIdGenerator:randomUUID,enableJsonResponse:true});
     s={server:rpc,transport,last:Date.now(),active:0,waiters:[],calls:0,window:Date.now(),closed:false};
     rpc.setRequestHandler(ListToolsRequestSchema,async()=> (await handle({jsonrpc:'2.0',id:1,method:'tools/list'})).result);
     rpc.setRequestHandler(CallToolRequestSchema,async request=>{
      const run=async()=>{
       if(s.closed)throw Error('세션이 종료됐습니다. 다시 연결하세요.');
       const response=await handle({jsonrpc:'2.0',id:1,method:'tools/call',params:request.params});
       if(response.error)throw Error(response.error.message);
       return response.result;
      };
      try{return fastTools.has(request.params.name)?await run():await researchQueue(run);}
      catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}
     });
     await rpc.connect(transport);
     transport.onclose=()=>{void dispose(s);};
     created=true;
    }catch(e){await rpc?.close();throw e;}
   }
   while(s.active){
    if(s.waiters.length>=4){res.setHeader('Retry-After','5');return fail(res,429,'Session queue full; retry sequentially');}
    const ready=await new Promise(resolve=>{
     const wake=()=>{clearTimeout(timeout);resolve(true);};
     const timeout=setTimeout(()=>{s.waiters=s.waiters.filter(x=>x!==wake);resolve(false);},15000);
     s.waiters.push(wake);
    });
    if(!ready){res.setHeader('Retry-After','5');return fail(res,429,'Queue wait expired; retry sequentially');}
   }
   if(s.closed)return fail(res,404,'Session expired; initialize again');
   if(Date.now()-s.window>60000){s.window=Date.now();s.calls=0;}
   if(++s.calls>60){res.setHeader('Retry-After','60');return fail(res,429,'Session rate limit');}
   s.active++;s.last=Date.now();
   try{
    if(req.method==='GET'){res.setHeader('Allow','POST, DELETE');fail(res,405,'Standalone event stream is not offered');}
    else await s.transport.handleRequest(req,res,body);
    if(created){if(s.transport.sessionId)sessions.set(s.transport.sessionId,s);else await dispose(s);}
   }finally{s.active--;s.last=Date.now();s.waiters.shift()?.();}
  }catch{
   if(s)await dispose(s);
   if(!res.headersSent)fail(res,500,'MCP request failed');else res.end();
  }finally{if(reserved)starting--;}
 });
 server.requestTimeout=200000;server.headersTimeout=10000;
 server.shutdown=async()=>{clearInterval(timer);await Promise.allSettled([...sessions.values()].map(dispose));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
 return server;
}
if(require.main===module){
 const host=process.env.HOST||'127.0.0.1',publicUrl=process.env.PUBLIC_URL||process.env.RENDER_EXTERNAL_URL,token=process.env.MCP_AUTH_TOKEN,allowPublic=process.env.MCP_ALLOW_PUBLIC==='1';
 if(host!=='127.0.0.1'&&(!publicUrl||(!token&&!allowPublic)))throw new Error('External binding requires PUBLIC_URL and authentication or explicit MCP_ALLOW_PUBLIC=1');
 const server=createServer({publicUrl,token,allowPublic});
 server.listen(Number(process.env.PORT||3000),host,()=>{console.error('Policy MCP HTTP server ready');require('./network-diagnostic.cjs').run().catch(e=>console.error('NETWORK_DIAG '+e.name));});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void server.shutdown();});
}
module.exports={createServer};
