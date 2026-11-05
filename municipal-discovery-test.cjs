const assert=require('node:assert/strict');
const {candidates,discover}=require('./municipal-discovery.cjs');
(async()=>{
 const base='https://www.nowon.kr/';
 const links=[{title:'청년 지원사업',url:'https://www.nowon.kr/youth#top'},{title:'청년 지원사업',url:'https://www.nowon.kr/youth#other'},{title:'청년 지원사업',url:'https://evil.example/a'},{title:'청년 자료',url:'https://www.nowon.kr/file.pdf'},{title:'사이트 이용',url:'https://www.nowon.kr/help'}];
 assert.deepEqual(candidates(base,links).map(x=>x.url),['https://www.nowon.kr/youth']);
 assert.deepEqual(candidates(base,[{title:'청년 지원사업',url:'https://www.nowon.kr/youth;jsessionid=abc'},{title:'청년 지원사업',url:'https://www.nowon.kr/youth?token=abc'}]),[]);
 const fetch=async()=>({manifest:[{file:'memory',source:base}],results:[]}),read=async()=>Buffer.from('test'),parse=async(_bytes,opts)=>{assert.equal(opts.discovery,true);return {links};};
 const result=await discover(base,{fetch,save:async()=>{},read,parse});assert.equal(result.candidateCount,1);assert.equal(result.candidates[0].status,'unverified_menu_link');
 const failed=await discover(base,{fetch:async()=>({manifest:[],results:[{reason:'robots_disallowed'}]}),save:async()=>{}});assert.equal(failed.status,'not_read');assert.equal(failed.reason,'robots_disallowed');
 console.log('PASS: official same-host menu discovery preserves unverified status and respects download failures');
})().catch(e=>{console.error(e);process.exitCode=1});
