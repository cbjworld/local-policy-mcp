const {setTimeout:wait}=require('node:timers/promises');
const DEFAULT_URL='https://local-policy-mcp.onrender.com/mcp';

async function prepare({url=DEFAULT_URL,timeoutMs=120000,progress=console.log}={}){
 const endpoint=new URL(url);
 if(endpoint.pathname!=='/mcp'||endpoint.search||endpoint.hash||endpoint.username||endpoint.password||!(endpoint.protocol==='https:'||endpoint.protocol==='http:'&&endpoint.hostname==='127.0.0.1'))throw Error('INVALID_ENDPOINT');
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>180000)throw Error('INVALID_TIMEOUT');
 const start=Date.now(),deadline=start+timeoutMs,remaining=()=>Math.max(1,deadline-Date.now());
 progress('1/3 서버를 깨우고 있습니다. 최대 2분 동안 확인합니다.');
 let healthy=false;
 while(Date.now()<deadline){
  try{
   const r=await fetch(new URL('/health',endpoint),{signal:AbortSignal.timeout(Math.min(15000,remaining())),redirect:'error',headers:{accept:'application/json'}});
   if(r.ok&&(await r.json()).status==='ok'){healthy=true;break;}
   await r.body?.cancel().catch(()=>{});
  }catch{}
  if(Date.now()<deadline)await wait(Math.min(5000,remaining()));
 }
 if(!healthy)throw Error('WAKE_TIMEOUT');
 progress('2/3 MCP 연결과 원문·OCR 도구 등록을 확인합니다.');
 const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
 const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
 const client=new Client({name:'local-policy-demo-check',version:'1'});
 const transport=new StreamableHTTPClientTransport(endpoint,{requestInit:{signal:AbortSignal.timeout(remaining())}});
 try{
  await client.connect(transport,{timeout:remaining()});
  const {tools}=await client.listTools({}, {timeout:remaining()});
  for(const name of ['research_policy','read_open_document','search_budget_projects','build_research_brief'])if(!tools.some(t=>t.name===name))throw Error('MISSING_TOOLS');
  if(tools.find(t=>t.name==='read_open_document').inputSchema.properties?.ocr?.type!=='boolean')throw Error('MISSING_OCR_TOOL');
  progress('3/3 실제 예산 검색으로 첫 색인을 준비합니다.');
  const response=await client.callTool({name:'search_budget_projects',arguments:{q:'빈집',limit:1}},undefined,{timeout:remaining()});
  if(response.isError)throw Error('SEARCH_FAILED');
  const result=JSON.parse(response.content.find(c=>c.type==='text')?.text||'null');
  if(!Array.isArray(result?.items)||!result.items.length||!result.items.every(x=>typeof x.source==='string'&&x.source.startsWith('https://')&&Number.isFinite(x.budget)))throw Error('INVALID_SEARCH_RESULT');
  return {version:client.getServerVersion().version,tools:tools.length,ms:Date.now()-start,checkedAt:new Date().toISOString()};
 }finally{
  await transport.terminateSession().catch(()=>{});
  await client.close();
 }
}

if(require.main===module)prepare().then(r=>{
 console.log('\n시연 준비 완료 · 서버 v'+r.version+' · '+(r.ms/1000).toFixed(1)+'초');
 console.log('MCP 연결, 원문·OCR 도구 등록, 실제 예산 검색을 확인했습니다.');
 console.log('마지막 호출 후 15분 동안 요청이 없으면 다시 잠듭니다. 시연 직전에 다시 실행하세요.');
 console.log('실제 원문 다운로드·OCR 실행 검사는 시연할 질문으로 별도 확인하세요.');
}).catch(e=>{
 console.error(e.code==='MODULE_NOT_FOUND'?'준비 도구를 설치하려면 이 폴더에서 npm ci를 먼저 실행하세요.':e.message==='WAKE_TIMEOUT'?'2분 안에 서버 응답을 받지 못했습니다. 인터넷 연결과 서버 상태를 확인한 뒤 다시 실행하세요.':'시연 준비가 완료되지 않았습니다. MCP 연결·검색 확인에 실패했습니다. 다시 실행해 주세요.');
 process.exitCode=1;
});
module.exports={prepare};
