const assert=require('node:assert/strict'),crypto=require('node:crypto'),{check}=require('./municipal-refresh-check.cjs');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
(async()=>{
 const sources=['one','two','three'].map(x=>({source:'https://www.nowon.kr/'+x,sha256:hash(x),extractedAt:'2026-11-05'}));
 const run=async(items,{save,offset,limit})=>{const results=[];for(const item of items.slice(offset,offset+limit)){if(item.source.endsWith('three'))results.push({source:item.source,status:'failed',reason:'robots_disallowed'});else{await save(Buffer.from(item.source.endsWith('one')?'one':'different'),item.source);results.push({source:item.source,status:'downloaded'});}}return {results,nextOffset:null,remaining:0};};
 const r=await check(sources,{offset:0,limit:3,run});assert.deepEqual(r.results.map(x=>x.status),['unchanged','changed','failed']);assert.equal(r.results[2].reason,'robots_disallowed');assert.equal(r.results[1].previouslyExtractedAt,'2026-11-05');
 await assert.rejects(()=>check([{source:'x',sha256:'bad'}],{run}),/출처/);
 console.log('PASS: original hash comparisons, change detection, access failures and original data preservation');
})().catch(e=>{console.error(e);process.exitCode=1;});
