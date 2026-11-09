const assert=require('node:assert/strict');
const path=require('node:path');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
(async()=>{
 const client=new Client({name:'national-gov24-check',version:'1'});
 const file=path.join(__dirname,'data','gov24-national-20261013.json');
 try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:['mcp.js'],cwd:__dirname,env:{...process.env,POLICY_GOV24_SNAPSHOT:file}}));
  async function search(args){const r=await client.callTool({name:'search_gov24_services',arguments:args});assert.equal(r.isError,false);return JSON.parse(r.content[0].text);}
  for(const [q,institution,title,agency] of [
   ['산후조리','부산광역시','부산형 산후조리비 지원','부산광역시'],
   ['장학금','영월군','(재)영월장학회 장학금','강원특별자치도 영월군'],
   ['돌봄','의왕시','아이돌봄 신규 및 120시간 이용자 확대지원','경기도 의왕시'],
   ['출산','제주특별자치도','제주특별자치도 출산 농가도우미 지원','제주특별자치도'],
   ['청년','대구 중구','청년 사업자 임대료 지원 사업','대구광역시 중구']]){
    const r=await search({q,institution,limit:20});assert.equal(r.scope.records,7904);assert.equal(r.scope.institutions,243);assert(r.items.some(x=>x.title===title&&x.institution===agency),`${institution} ${q}`);
  }
  const implicit=await search({q:'대구 중구 청년',limit:20});assert(implicit.items.some(x=>x.institution==='대구광역시 중구'));assert(implicit.items.every(x=>x.institution==='대구광역시 중구'));
  const ambiguous=await search({q:'지원',institution:'중구',limit:1});assert(ambiguous.ambiguousInstitution.parents.includes('부산광역시'));assert(ambiguous.ambiguousInstitution.parents.includes('서울특별시'));assert(ambiguous.nextOffset);
  const next=await search({q:'지원',institution:'중구',limit:1,offset:ambiguous.nextOffset,snapshot:ambiguous.snapshot});assert.notEqual(next.items[0].serviceId,ambiguous.items[0].serviceId);
  console.log('PASS: 5 actual regional questions, region inference, ambiguous districts and pagination via MCP stdio');
 }finally{await client.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
