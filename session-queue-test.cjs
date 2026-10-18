const assert=require('node:assert/strict');
const {withSources,brief}=require('./discovery');
const {createQueue}=require('./research-queue');
(async()=>{
 const source={sourceId:'a',checkedAt:'2026-10-19T00:00:00Z',url:'https://example.go.kr/a',pages:[{page:1,text:'지원 대상은 지역 내 거주 청년입니다.'}]};
 const cases=[{region:'A',name:'사업1',fields:{target:{sourceId:'a',quote:'지원 대상은 지역 내 거주 청년입니다.',page:1}}},{region:'B',name:'사업2',fields:{target:{sourceId:'a',quote:'지원 대상은 지역 내 거주 청년입니다.',page:1}}}];
 await Promise.all([
  withSources(new Map([['a',source]]),async()=>{await new Promise(r=>setTimeout(r,10));assert.equal(brief({cases}).cases.length,2);}),
  withSources(new Map(),async()=>{await new Promise(r=>setTimeout(r,15));assert.throws(()=>brief({cases}),/이번 세션/);})
 ]);
 const run=createQueue({limit:1,waitMs:25});let release;
 const first=run(()=>new Promise(r=>{release=r;}));
 const second=run(()=>{throw Error('should have timed out');});
 await assert.rejects(run(()=>{}),/가득/);
 await assert.rejects(second,/대기 시간/);release();await first;
 assert.equal(await run(()=>42),42);
 const queue=createQueue();const order=[];let finish;
 const a=queue(async()=>{order.push(1);await new Promise(r=>{finish=r;});order.push(2);});
 const b=queue(async()=>{order.push(3);throw Error('worker failed');});
 const c=queue(()=>{order.push(4);});
 finish();await a;await assert.rejects(b,/worker failed/);await c;
 assert.deepEqual(order,[1,2,3,4]);
 console.log('PASS: concurrent citation isolation, bounded queue, timeout cleanup, ordered execution and failure recovery');
})().catch(e=>{console.error(e);process.exitCode=1;});
