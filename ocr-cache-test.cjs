const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),cp=require('node:child_process');
let calls=0;const sent=[];const original=cp.fork;
cp.fork=()=>{calls++;const child=new EventEmitter();child.kill=()=>queueMicrotask(()=>child.emit('exit'));child.send=(input)=>{sent.push(input);const {page,nextPage}=input;queueMicrotask(()=>child.emit('message',{result:{text:'page '+page,ocr:{totalMs:100,quality:{items:[]}}},...(nextPage?{nextPrepared:{page:nextPage,image:{width:10,height:10,prepareMs:10},raw:Buffer.from('raw'),clean:Buffer.from('clean')}}:{})}));};return child;};
const {read}=require('./ocr-reader');cp.fork=original;
(async()=>{
 const pdf=Buffer.from('%PDF-first');const first=await read(pdf);assert.equal(first.ocr.cacheHit,false);first.text='mutated';first.ocr.quality.items.push('mutated');
 const hit=await read(pdf);assert.equal(hit.text,'page 1');assert.deepEqual(hit.ocr.quality.items,[]);assert.equal(hit.ocr.cacheHit,true);assert.equal(hit.ocr.totalMs,0);assert.equal(hit.ocr.originalProcessingMs,100);assert.equal(calls,1);
 await read(pdf,{page:2});assert.equal(calls,2);await read(Buffer.from('%PDF-changed'));assert.equal(calls,3);
 await assert.rejects(read(pdf,{page:0}));assert.equal(calls,3);
 for(let i=0;i<4;i++)await read(Buffer.from('%PDF-'+i));await read(pdf);assert.equal(calls,8);
 const pipeline=Buffer.from('%PDF-pipeline');await read(pipeline,{page:1,nextPage:2});await read(pipeline,{page:2});assert.equal(sent.at(-1).prepared.page,2);assert.equal(sent.at(-1).prepared.raw.toString(),'raw');await read(Buffer.from('%PDF-other-pipeline'),{page:2});assert.equal(sent.at(-1).prepared,undefined);await assert.rejects(read(pipeline,{page:1,nextPage:3}));
 console.log('PASS: bounded OCR cache uses PDF content and page, isolates results, preserves validation and records cached timing');
})().catch(e=>{console.error(e);process.exitCode=1;});
