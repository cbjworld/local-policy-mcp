const assert=require('node:assert/strict');
const {run,robotsRule}=require('./municipal-stage-download.cjs');
(async()=>{
 assert.equal(robotsRule('User-agent: *\nDisallow: /private\nCrawl-delay: 5','https://www.nowon.kr/private').allowed,false);
 assert.equal(robotsRule('User-agent: *\nDisallow: /private\nCrawl-delay: 5','https://www.nowon.kr/public').delay,5);
 const calls=[],waits=[],saved=[];
 const fetcher=async(url,_h,_d,_b,_s,sameHost,separateConnection,omitAccept)=>{calls.push(url);assert.equal(sameHost,true);assert.equal(separateConnection,true);assert.equal(omitAccept,true);if(url.endsWith('/robots.txt'))return {url,type:'text/plain',bytes:Buffer.from('User-agent: *\nDisallow: /private')};return {url,type:'text/html',bytes:Buffer.alloc(600)};};
 const input=[{source:'https://www.nowon.kr/public',parser:'table'},{source:'https://www.nowon.kr/private/a',parser:'table'},{source:'https://www.nowon.kr.evil.example/',parser:'table'},{source:'https://www.gccity.go.kr/program',parser:'table'}];
 const x=await run(input,{fetcher,rule:(rules,url)=>({allowed:!url.includes('/private'),delay:5}),save:async(_b,url)=>{saved.push(url);return 'staged.html'},sleep:async ms=>waits.push(ms),limit:4});
 assert.equal(x.manifest.length,2);assert.equal(x.results[1].reason,'robots_disallowed');assert.equal(x.results[2].status,'failed');assert(!calls.some(c=>c.includes('/private')));assert.equal(calls.filter(c=>c.includes('nowon.kr/robots.txt')).length,1);assert(waits.includes(5000));assert.equal(saved.length,2);
 const fail=await run([{source:'https://www.nowon.kr/public',parser:'table'}],{fetcher:async()=>{throw Error('offline')},save:async()=>{throw Error('unexpected')},sleep:async()=>{},limit:1});
 assert.equal(fail.results[0].reason,'robots_unavailable');assert.equal(fail.manifest.length,0);
 const next=await run(input,{fetcher,rule:()=>({allowed:true,delay:0}),save:async()=> 'staged.html',sleep:async()=>{},limit:1,offset:3});assert.equal(next.results[0].source,input[3].source);assert.equal(next.nextOffset,null);
 const detail=await run([{source:'https://www.nowon.kr/public',parser:'detail',title:'청년 지원'}],{fetcher,rule:()=>({allowed:true,delay:0}),save:async()=> 'staged.html',sleep:async()=>{},limit:1});assert.equal(detail.manifest[0].title,'청년 지원');
 const temporary=await run([{source:'https://www.nowon.kr/public',parser:'table'}],{fetcher:async u=>u.endsWith('/robots.txt')?{url:u,type:'text/plain',bytes:Buffer.from('User-agent: *')}:{url:'https://www.nowon.kr/page;jsessionid=temporary',type:'text/html',bytes:Buffer.alloc(600)},rule:()=>({allowed:true,delay:0}),save:async()=>{throw Error('must not save')},sleep:async()=>{},limit:1});assert.equal(temporary.results[0].reason,'temporary_redirect');assert.equal(temporary.manifest.length,0);
 const unsafeInput=await run([{source:'https://www.nowon.kr/page?token=temporary',parser:'table'}],{fetcher:async()=>{throw Error('must not fetch')},save:async()=>{throw Error('must not save')},sleep:async()=>{},limit:1});assert.equal(unsafeInput.results[0].reason,'temporary_source');assert.equal(unsafeInput.results[0].source,null);
 console.log('PASS: registered hosts, robots restrictions, pacing, safe redirects and failure preservation');
})().catch(e=>{console.error(e);process.exitCode=1});
