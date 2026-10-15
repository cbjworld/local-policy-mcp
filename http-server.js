const http=require('node:http'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Server}=require('@modelcontextprotocol/sdk/server/index.js');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const {StreamableHTTPServerTransport}=require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {ListToolsRequestSchema,CallToolRequestSchema,isInitializeRequest}=require('@modelcontextprotocol/sdk/types.js');

function createServer({publicUrl,token,allowPublic=false,maxSessions=8}={}){
 const origin=publicUrl?new URL(publicUrl):null;
 if(origin&&origin.protocol!=='https:')throw new Error('PUBLIC_URL must use HTTPS');
 if(!Number.isInteger(maxSessions)||maxSessions<1||maxSessions>32)throw new Error('Invalid session limit');
 const sessions=new Map();let starting=0;
 const fail=(res,status,message)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:message}));};
 async function dispose(s){if(s.closed)return;s.closed=true;for(const wake of s.waiters.splice(0))wake();sessions.delete(s.transport.sessionId);await Promise.allSettled([s.server.close(),s.client.close()]);}
 const timer=setInterval(()=>{for(const s of sessions.values())if(!s.active&&Date.now()-s.last>15*60*1000)void dispose(s);},30000);timer.unref();
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const localHosts=new Set(['127.0.0.1:'+server.address().port,'localhost:'+server.address().port]);
  if(!(origin?req.headers.host===origin.host:localHosts.has(req.headers.host)))return fail(res,403,'Invalid host');
  if(req.headers.origin&&req.headers.origin!==(origin?.origin||'http://'+req.headers.host))return fail(res,403,'Invalid origin');
  if(req.url==='/health'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"status":"ok"}');}
  if(req.url!=='/mcp')return fail(res,404,'Not found');
  if(token&&req.headers.authorization!=='Bearer '+token)return fail(res,401,'Authentication required');
  if(!token&&!allowPublic&&origin)return fail(res,403,'Public access is not enabled');
  if(!['POST','GET','DELETE'].includes(req.method)){res.setHeader('Allow','POST, GET, DELETE');return fail(res,405,'Method not allowed');}
  // shortcut: one process per session; use a shared worker pool only after measured memory pressure.
  let s,created=false;
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
    starting++;
    const client=new Client({name:'policy-http-bridge',version:'1.0.0'});
    try{
     // Only pass runtime settings, never hosting credentials, to document workers.
     const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','HOME','POLICY_PYTHON','NODE_EXTRA_CA_CERTS'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
     await client.connect(new StdioClientTransport({command:process.execPath,args:['--use-system-ca','--max-old-space-size=384',path.join(__dirname,'mcp.js')],env,stderr:'ignore'}));
     const rpc=new Server(client.getServerVersion(),{capabilities:{tools:{}},instructions:client.getInstructions()});
     const transport=new StreamableHTTPServerTransport({sessionIdGenerator:randomUUID,enableJsonResponse:true});
     s={server:rpc,client,transport,last:Date.now(),active:0,waiters:[],calls:0,window:Date.now(),closed:false};
     rpc.setRequestHandler(ListToolsRequestSchema,()=>client.listTools());
     rpc.setRequestHandler(CallToolRequestSchema,request=>client.callTool(request.params,undefined,{timeout:180000}));
     await rpc.connect(transport);
     transport.onclose=()=>{void dispose(s);};
     client.onclose=()=>{void dispose(s);};
     created=true;
    }catch(e){await client.close();throw e;}finally{starting--;}
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
  }
 });
 server.requestTimeout=200000;server.headersTimeout=10000;
 server.shutdown=async()=>{clearInterval(timer);await Promise.allSettled([...sessions.values()].map(dispose));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
 return server;
}
if(require.main===module){
 const host=process.env.HOST||'127.0.0.1',publicUrl=process.env.PUBLIC_URL,token=process.env.MCP_AUTH_TOKEN,allowPublic=process.env.MCP_ALLOW_PUBLIC==='1';
 if(host!=='127.0.0.1'&&(!publicUrl||(!token&&!allowPublic)))throw new Error('External binding requires PUBLIC_URL and authentication or explicit MCP_ALLOW_PUBLIC=1');
 const server=createServer({publicUrl,token,allowPublic});
 server.listen(Number(process.env.PORT||3000),host,()=>console.error('Policy MCP HTTP server ready'));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void server.shutdown();});
}
module.exports={createServer};
