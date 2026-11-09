const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gov24-mcp-')),file=path.join(dir,'snapshot.json');let client;
 try{
  fs.writeFileSync(file,JSON.stringify({apiSource:'https://www.data.go.kr/data/15113968/openapi.do',fetchedAt:'2026-10-13T03:12:43.772Z',coverage:'시험',records:[{serviceId:'A123',title:'영월장학회 장학금',institution:'강원특별자치도 영월군',url:'https://www.gov.kr/portal/rcvfvrSvc/dtlEx/A123'}]}));
  client=new Client({name:'gov24-test',version:'1'});const transport=new StdioClientTransport({command:process.execPath,args:['mcp.js'],cwd:__dirname,env:{...process.env,POLICY_GOV24_SNAPSHOT:file}});await client.connect(transport);
  assert((await client.listTools()).tools.some(x=>x.name==='search_gov24_services'));
  const result=await client.callTool({name:'search_gov24_services',arguments:{q:'장학금',institution:'영월군'}});assert.equal(result.isError,false);const parsed=JSON.parse(result.content[0].text);assert.equal(parsed.total,1);assert.equal(parsed.items[0].serviceId,'A123');assert.equal(parsed.scope.fetchedAt,'2026-10-13T03:12:43.772Z');
  process.env.POLICY_GOV24_SNAPSHOT=file;
  const research=await require('./policy-workflow').research({question:'영월군 장학금 지원 사례 찾아줘',autoOcr:false},{search:async()=>({total:0,hasMore:false,items:[],reviewItems:[],relatedDocuments:[]})});
  const compact=require('./presentation').present('research_policy',research,'compact');assert.equal(compact.gov24References.items[0].serviceId,'A123');assert.equal(research.searchOutcome.status,'not_found_in_searched_scope');
  console.log('PASS: configured Gov24 snapshot exposed and searched over MCP stdio');
 }finally{await client?.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
