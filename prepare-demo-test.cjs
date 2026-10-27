const assert=require('node:assert/strict'),{prepare}=require('./prepare-demo.cjs'),{createServer}=require('./http-server');
(async()=>{
 await assert.rejects(prepare({url:'http://other.example/mcp'}),/INVALID_ENDPOINT/);
 await assert.rejects(prepare({url:'https://user:secret@example.com/mcp'}),/INVALID_ENDPOINT/);
 await assert.rejects(prepare({timeoutMs:0}),/INVALID_TIMEOUT/);
 const server=createServer({maxSessions:1}),originalFetch=global.fetch;
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/mcp',messages=[];let healthCalls=0;
 try{
  global.fetch=async(input,options)=>{
   if(String(input).endsWith('/health')&&++healthCalls===1)return new Response('<html>Starting</html>',{status:503});
   return originalFetch(input,options);
  };
  const r=await prepare({url,timeoutMs:20000,progress:s=>messages.push(s)});
  assert.equal(r.version,require('./package.json').version);assert(r.tools>=4);assert.equal(healthCalls,2);assert.equal(messages.length,3);
  // Closing the check session must not occupy the server's session capacity.
  await prepare({url,timeoutMs:10000,progress:()=>{}});
  global.fetch=async()=>new Response('<html>Not ready</html>',{status:200});
  await assert.rejects(prepare({url,timeoutMs:120,progress:()=>{}}),/WAKE_TIMEOUT/);
  global.fetch=async(input)=>String(input).endsWith('/health')?Response.json({status:'ok'}):new Response('Unavailable',{status:503});
  await assert.rejects(prepare({url,timeoutMs:1000,progress:()=>{}}));
 }finally{global.fetch=originalFetch;await server.shutdown();}
 console.log('PASS: demo readiness retries cold health responses, verifies real MCP search and OCR schema, closes sessions and rejects false readiness');
})().catch(e=>{console.error(e);process.exitCode=1;});
