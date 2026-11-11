const assert=require('node:assert/strict');
const path=require('node:path');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
(async()=>{
 const client=new Client({name:'national-gov24-check',version:'1'});
 const file=path.join(__dirname,'data','gov24-national-20261110.json');
 const all=require('./gov24-snapshot.cjs').collect({searches:[{q:'산후조리비'}]},file);
 assert.equal(all.searches[0].total,46);assert.equal(all.searches[0].pagesRead,3);assert.equal(all.items.length,46);assert.equal(new Set(all.items.map(x=>x.serviceId)).size,46);
 try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:['mcp.js'],cwd:__dirname,env:{...process.env,POLICY_GOV24_SNAPSHOT:file}}));
  async function search(args){const r=await client.callTool({name:'search_gov24_services',arguments:args});assert.equal(r.isError,false);return JSON.parse(r.content[0].text);}
  for(const [q,institution,title,agency] of [
   ['산후조리','부산광역시','부산형 산후조리비 지원','부산광역시'],
   ['장학금','영월군','(재)영월장학회 장학금','강원특별자치도 영월군'],
   ['돌봄','의왕시','아이돌봄 신규 및 120시간 이용자 확대지원','경기도 의왕시'],
   ['출산','제주특별자치도','제주특별자치도 출산 농가도우미 지원','제주특별자치도'],
   ['청년','대구 중구','청년 사업자 임대료 지원 사업','대구광역시 중구']]){
    const r=await search({q,institution,limit:20});assert.equal(r.scope.records,7891);assert.equal(r.scope.institutions,243);assert(r.items.some(x=>x.title===title&&x.institution===agency),`${institution} ${q}`);
  }
  const implicit=await search({q:'대구 중구 청년',limit:20});assert(implicit.items.some(x=>x.institution==='대구광역시 중구'));assert(implicit.items.every(x=>x.institution==='대구광역시 중구'));
  const ambiguous=await search({q:'지원',institution:'중구',limit:1});assert(ambiguous.ambiguousInstitution.parents.includes('부산광역시'));assert(ambiguous.ambiguousInstitution.parents.includes('서울특별시'));assert(ambiguous.nextOffset);
  const next=await search({q:'지원',institution:'중구',limit:1,offset:ambiguous.nextOffset,snapshot:ambiguous.snapshot});assert.notEqual(next.items[0].serviceId,ambiguous.items[0].serviceId);
  const pet=await search({q:'반려동물 의료비',institution:'서울특별시 동대문구'});assert(pet.items.some(x=>x.serviceId==='305000000130'));
  for(const [q,institution,title,agency] of [
   ['어린이집 전기','경기도','어린이집 전기레인지 지원','경기도 안양시'],
   ['귀농인 이사','경상북도','귀농인 이사비용 지원','경상북도 안동시'],
   ['노인 의료급여','대전광역시','노인장기요양 의료급여부담금 지원','대전광역시'],
   ['임산부 교통비','충청북도','군 지역 임산부 교통비 지원','충청북도'],
   ['장애인가정 출산','인천광역시','장애인가정 출산지원금 지원','인천광역시 제물포구'],
   ['대학생 주거비','강원특별자치도','도내 대학생 장학금 지원(주거비)','강원특별자치도'],
   ['소상공인 경영','울산광역시','소상공인 경영안정자금','울산광역시'],
   ['치매 무료검진','전북특별자치도','치매 무료검진 지원','전북특별자치도 전주시'],
   ['효행장려금','세종특별자치시','효행장려금 지원','세종특별자치시'],
   ['반려동물 의료비','서울특별시','취약계층 반려동물 의료비 지원','서울특별시 동대문구']]){
    const r=await search({q,institution,limit:20});assert(r.items.some(x=>x.title===title&&x.institution===agency),`${institution} ${q}`);
    assert(r.items.every(x=>require('./gov24-url.cjs').validGov24Url(x.url,x.serviceId)));
    console.log(`PASS: ${institution} ${q} — ${r.total} candidates`);
  }
  console.log('PASS: 5 actual regional questions, region inference, ambiguous districts and pagination via MCP stdio');
 }finally{await client.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
