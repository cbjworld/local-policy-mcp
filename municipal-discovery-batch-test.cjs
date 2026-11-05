const assert=require('node:assert/strict');
const {processEntries}=require('./municipal-discovery-batch.cjs');
(async()=>{
 const entries=[{url:'https://a.go.kr/',institution:'가',parent:'광역'}, {url:'https://b.go.kr/',institution:'나',parent:'광역'}, {url:'https://c.go.kr/',institution:'다',parent:'광역'}];
 let state={entries:[]},saved=[],calls=[];
 const probe=async url=>{calls.push(url);if(url.includes('b.go.kr'))throw Error('offline');return {source:url,status:'menu_candidates',candidates:[{url:url+'youth',status:'unverified_menu_link'}]};};
 let result=await processEntries(entries,state,{probe,checkpoint:async x=>saved.push(structuredClone(x)),limit:2});
 assert.equal(result.processed,2);assert.equal(result.remaining,1);assert.equal(saved.length,2);assert.equal(state.entries[1].status,'not_read');
 state=structuredClone(saved.at(-1));result=await processEntries(entries,state,{probe,checkpoint:async x=>saved.push(structuredClone(x)),limit:3});
 assert.equal(result.processed,1);assert.equal(result.remaining,0);assert.deepEqual(calls,entries.map(e=>e.url));assert.equal(state.entries[0].candidates[0].status,'unverified_menu_link');
 console.log('PASS: sequential discovery checkpoints, restart and failure status');
})().catch(e=>{console.error(e);process.exitCode=1});
