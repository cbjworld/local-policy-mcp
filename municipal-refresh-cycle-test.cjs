const assert=require('node:assert/strict'),{cycle}=require('./municipal-refresh-cycle.cjs');
(async()=>{
 const sources=Array.from({length:5},(_,i)=>({source:String(i)})),state={nextOffset:0,results:[]},saved=[];
 const probe=async(s,{offset,limit})=>({checkedAt:'now',results:s.slice(offset,offset+limit).map(x=>({source:x.source,status:'unchanged'})),nextOffset:offset+limit<s.length?offset+limit:null});
 const first=await cycle(sources,state,{probe,batchSize:2,maxBatches:1,checkpoint:async s=>saved.push(JSON.stringify(s))});assert.equal(first.processed,2);assert.equal(saved.length,1);
 const restored=JSON.parse(saved[0]),last=await cycle(sources,restored,{probe,batchSize:2,maxBatches:2});assert.equal(last.complete,true);assert.deepEqual(restored.results.map(x=>x.source),['0','1','2','3','4']);
 const broken={nextOffset:0,results:[]};await assert.rejects(()=>cycle(sources,broken,{batchSize:2,probe:async()=>({results:[{source:'wrong'}],nextOffset:2})}),/일치하지/);assert.equal(broken.nextOffset,0);
 console.log('PASS: bounded batches, checkpoint continuation and refusal to advance on invalid results');
})().catch(e=>{console.error(e);process.exitCode=1;});

