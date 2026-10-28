import assert from 'node:assert/strict';
import app,{SearchJob,SearchGate,portalPage} from './worker.mjs';
const cursor={q:'산후조리비',startDate:'20241028',endDate:'20261028',scope:'all',page:1};
const mockResponse=(c,total=20)=>new Response('var result = '+JSON.stringify({code:'200',parameterVO:{kwd:c.q,startDate:c.startDate,endDate:c.endDate,viewPage:c.page},rtnTotal:total,rtnList:[{INFO_SJ:'산후조리비 지원 계획',PRDCTN_INSTT_REGIST_NO:'DCT1',PRDCTN_DT:'20260101000000',INSTT_SE_CD:'B'}]})+';');
assert.equal((await portalPage(cursor,async()=>mockResponse(cursor))).items.length,1);
await assert.rejects(()=>portalPage(cursor,async()=>mockResponse({...cursor,page:2})),/mismatch/);
await assert.rejects(()=>portalPage(cursor,async()=>new Response('var result = '+JSON.stringify({code:'200',parameterVO:{kwd:cursor.q,startDate:cursor.startDate,endDate:cursor.endDate,viewPage:1},rtnTotal:20,rtnList:[]})+';')),/incomplete/);
class Storage {
  constructor(){this.map=new Map();this.alarmAt=null;}
  async get(k){return structuredClone(this.map.get(k));}
  async put(k,v){this.map.set(k,structuredClone(v));}
  async delete(k){this.map.delete(k);}
  async getAlarm(){return this.alarmAt;}
  async setAlarm(t){this.alarmAt=t;}
  async transaction(fn){return fn(this);}
  async list({prefix,startAfter='',limit}){return new Map([...this.map].filter(([k])=>k.startsWith(prefix)&&k>startAfter).sort().slice(0,limit));}
}
const store=new Storage();
const req=(path,body)=>new Request('https://job.internal/'+path,body?{method:'POST',headers:{'x-job-id':'a'.repeat(64)},body:JSON.stringify(body)}:undefined);
let worker=new SearchJob({storage:store});
assert.equal((await worker.fetch(req('start',{cursors:[cursor]}))).status,202);
assert.ok(store.alarmAt);
let fail=true;
globalThis.fetch=async url=>{if(fail){fail=false;throw Error('temporary');}const p=new URL(url).searchParams;return mockResponse({...cursor,page:Number(p.get('viewPage'))});};
await worker.alarm();
assert.equal((await store.get('job')).cursors[0].page,1);
assert.equal((await store.get('job')).failures,1);
worker=new SearchJob({storage:store}); // simulate a fresh process using the same durable storage
await worker.alarm();
assert.equal((await store.get('job')).cursors[0].page,2);
await worker.alarm();
assert.equal((await store.get('job')).status,'complete');
assert.equal((await (await worker.fetch(req('pages'))).json()).pages.length,2);
assert.equal((await worker.fetch(req('start',{cursors:[cursor]}))).status,409);
const splitStorage=new Storage(),splitWorker=new SearchJob({storage:splitStorage});
await splitWorker.fetch(req('start',{cursors:[cursor]}));
globalThis.fetch=async()=>mockResponse(cursor,100001);
await splitWorker.alarm();
const split=(await splitStorage.get('job')).cursors;
assert.equal(split.length,2);assert.equal(split[0].startDate,cursor.startDate);assert.equal(split[1].endDate,cursor.endDate);assert.equal(split[0].page,1);assert.equal(split[1].page,1);
const gateStorage=new Storage(),gate=new SearchGate({storage:gateStorage});
const gateURL='https://gate/page?id='+'a'.repeat(64);
await gateStorage.put('active:'+'a'.repeat(64),Date.now());
assert.equal((await (await gate.fetch(new Request(gateURL))).json()).ok,true);
const retry=await (await gate.fetch(new Request(gateURL))).json();
assert.equal(retry.ok,false);assert.ok(retry.retryAt-Date.now()<10000);
await gateStorage.put('quota',{day:new Date().toISOString().slice(0,10),pages:1000,jobs:100,lastPage:0});
const limited=await (await gate.fetch(new Request(gateURL))).json();
assert.equal(limited.ok,false);assert.ok(limited.retryAt>Date.now());
await gateStorage.put('quota',{day:new Date().toISOString().slice(0,10),pages:0,jobs:1,lastPage:0,attempts:8000});
assert.equal((await (await gate.fetch(new Request(gateURL))).json()).reason,'daily_attempt_limit');
await gateStorage.put('quota',{day:new Date().toISOString().slice(0,10),pages:1000,jobs:100,lastPage:0});
assert.equal((await (await gate.fetch(new Request('https://gate/admit?id='+'b'.repeat(64)))).json()).ok,false);
const fullStore=new Storage(),fullGate=new SearchGate({storage:fullStore});
for(let i=0;i<20;i++)await fullStore.put('active:'+i.toString(16).padStart(64,'0'),Date.now());
const waiting=await (await fullGate.fetch(new Request('https://gate/admit?id='+'f'.repeat(64)))).json();
assert.equal(waiting.ok,true);assert.equal(waiting.waiting,true);
assert(waiting.retryAt-Date.now()>=1799000,'waiting retries use the free-tier interval');
const waitStorage=new Storage(),waitWorker=new SearchJob({storage:waitStorage},{GATE:{idFromName:()=>'',get:()=>({fetch:url=>fullGate.fetch(new Request(url))})}});
assert.equal((await waitWorker.fetch(new Request('https://job.internal/start',{method:'POST',headers:{'x-job-id':'f'.repeat(64),'x-admission-waiting':'1'},body:JSON.stringify({cursors:[cursor]})}))).status,202);
await waitWorker.alarm();assert.equal((await waitStorage.get('job')).status,'waiting_admission');
await fullGate.fetch(new Request('https://gate/release?id='+('0'.repeat(64))));
await waitWorker.alarm();assert.equal((await waitStorage.get('job')).status,'running');assert.equal((await waitStorage.get('job')).pages,1);
const quota=await fullStore.get('quota');assert.equal(quota.jobs,1,'retries must not use extra daily jobs');
const staleStore=new Storage(),staleGate=new SearchGate({storage:staleStore});
await staleStore.put('waiting:'+'a'.repeat(64),{order:Date.now()-3600000,lastSeen:Date.now()-3600000});
const next=await (await staleGate.fetch(new Request('https://gate/admit?id='+'b'.repeat(64)))).json();
assert.equal(next.waiting,false,'an offline waiting job must not block another job');
assert(await staleStore.get('waiting:'+'a'.repeat(64)),'offline job remains available to resume');
const badStorage=new Storage(),badGate=new SearchGate({storage:badStorage});
const env={SEARCH_SECRET:'test',GATE:{idFromName:()=>'',get:()=>({fetch:url=>badGate.fetch(new Request(url))})},JOBS:{idFromName:()=>'',get:()=>({fetch:async()=>new Response(null,{status:400})})}};
assert.equal((await app.fetch(new Request('https://worker/jobs/'+('e'.repeat(64))+'/status'),env)).status,401,'status requires worker authentication');
assert.equal((await app.fetch(new Request('https://worker/inspect?id='+('e'.repeat(64)),{headers:{authorization:'Bearer test'}}),env)).status,404,'global gate is not exposed externally');
assert.equal((await app.fetch(new Request('https://worker/jobs/'+('e'.repeat(64))+'/wake',{method:'POST',headers:{authorization:'Bearer test'}}),env)).status,404,'wake is not exposed through the external worker route');
const badRequest=new Request('https://worker/jobs/'+('e'.repeat(64))+'/start',{method:'POST',headers:{authorization:'Bearer test'},body:'{}'});
assert.equal((await app.fetch(badRequest,env)).status,400);assert.equal((await badStorage.list({prefix:'active:',limit:100})).size,0,'invalid requests cannot reserve a slot');
const rejected=new Request('https://worker/jobs/'+('e'.repeat(64))+'/start',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({cursors:[cursor]})});
assert.equal((await app.fetch(rejected,env)).status,400);assert.equal((await badStorage.list({prefix:'active:',limit:100})).size,0,'rejected starts release newly reserved slots');
assert.equal((await badStorage.get('quota')).jobs,0,'rejected starts restore the daily admission count');
env.JOBS.get=()=>({fetch:async request=>{if(typeof request==='string')return new Response(null,{status:404});throw Error('start_failed');}});
const interrupted=new Request('https://worker/jobs/'+('d'.repeat(64))+'/start',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({cursors:[cursor]})});
await assert.rejects(()=>app.fetch(interrupted,env),/start_failed/);assert.equal((await badStorage.list({prefix:'active:',limit:100})).size,0,'confirmed missing jobs release slots after an interrupted start');
assert.equal((await badStorage.get('quota')).jobs,0,'confirmed failed starts restore daily admission count');
const fairStore=new Storage(),fairGate=new SearchGate({storage:fairStore}),now=Date.now();
await fairStore.put('active:'+'a'.repeat(64),now);await fairStore.put('active:'+'b'.repeat(64),now);
await fairStore.put('quota',{day:new Date(now).toISOString().slice(0,10),pages:1,jobs:2,lastPage:now-4000});
await fairStore.put('pending:'+'b'.repeat(64),now-1000);
assert.equal((await (await fairGate.fetch(new Request('https://gate/page?id='+'a'.repeat(64)))).json()).ok,false);
assert.equal((await (await fairGate.fetch(new Request('https://gate/inspect?id='+'a'.repeat(64)))).json()).position,2);
assert.equal((await (await fairGate.fetch(new Request('https://gate/page?id='+'b'.repeat(64)))).json()).ok,true);
const liveStore=new Storage(),liveGate=new SearchGate({storage:liveStore});
await liveStore.put('active:'+'a'.repeat(64),now);await liveStore.put('active:'+'b'.repeat(64),now);
await liveStore.put('quota',{day:new Date(now).toISOString().slice(0,10),pages:1,jobs:2,lastPage:now-4000});
await liveStore.put('pending:'+'b'.repeat(64),{order:now-240000,lastSeen:now-1000});
assert.equal((await (await liveGate.fetch(new Request('https://gate/page?id='+'a'.repeat(64)))).json()).ok,false);
assert.equal((await (await liveGate.fetch(new Request('https://gate/page?id='+'b'.repeat(64)))).json()).ok,true);
const summaryStore=new Storage(),summaryGate=new SearchGate({storage:summaryStore}),otherId='d'.repeat(64);
await summaryStore.put('quota',{day:new Date(now).toISOString().slice(0,10),jobs:4,pages:71,attempts:123,lastPage:now-4000});
await summaryStore.put('active:'+('a'.repeat(64)),now);await summaryStore.put('active:'+otherId,now-15*86400000);
await summaryStore.put('waiting:'+('b'.repeat(64)),{order:now,lastSeen:now});await summaryStore.put('waiting:'+otherId,{order:now-3600000,lastSeen:now-3600000});
const gateView=await (await summaryGate.fetch(new Request('https://gate/inspect?id='+('a'.repeat(64))))).json();
assert.deepEqual(gateView.gateSummary,{activeJobs:1,waitingJobs:2,eligibleWaitingJobs:1,pagesToday:71,attemptsToday:123});assert(!JSON.stringify(gateView).includes(otherId));
const statusStore=new Storage(),statusEnv={GATE:{idFromName:()=>'',get:()=>({fetch:async()=>Response.json({...gateView,privateOtherId:otherId,gateSummary:{...gateView.gateSummary,privateOtherId:otherId}})})}};
const statusJob=new SearchJob({storage:statusStore},statusEnv);
await statusJob.fetch(new Request('https://job.internal/start',{method:'POST',headers:{'x-job-id':'a'.repeat(64),'x-admission-waiting':'1'},body:JSON.stringify({cursors:[cursor]})}));
let statusView=await (await statusJob.fetch(new Request('https://job.internal/status'))).json();
assert.deepEqual(statusView.gateSummary,gateView.gateSummary);assert(!JSON.stringify(statusView).includes(otherId));
let statusRecord=await statusStore.get('job');statusRecord.status='running';await statusStore.put('job',statusRecord);
statusView=await (await statusJob.fetch(new Request('https://job.internal/status'))).json();assert.deepEqual(statusView.gateSummary,gateView.gateSummary);assert(!JSON.stringify(statusView).includes(otherId));
const unavailable=new SearchJob({storage:statusStore},{GATE:{idFromName:()=>'',get:()=>({fetch:async()=>{throw Error('offline')}})}});
statusView=await (await unavailable.fetch(new Request('https://job.internal/status'))).json();assert.equal(statusView.gateSummaryStatus,'unavailable');assert.equal(statusView.gateSummary,undefined);
// Repeated portal failures must release capacity without losing already stored results.
const originalNow=Date.now,originalFetch=globalThis.fetch;let time=Date.parse('2026-10-28T04:00:00Z');
try{
 Date.now=()=>time;
 const failGateStorage=new Storage(),failGate=new SearchGate({storage:failGateStorage});
 const gateStub={fetch:url=>failGate.fetch(new Request(url))};
 const gateEnv={GATE:{idFromName:()=>'',get:()=>gateStub}};
 const failedId='f'.repeat(64),waiterId='e'.repeat(64);
 for(let i=0;i<19;i++)assert.equal((await (await failGate.fetch(new Request('https://gate/admit?id='+i.toString(16).padStart(64,'0')))).json()).waiting,false);
 assert.equal((await (await failGate.fetch(new Request('https://gate/admit?id='+failedId))).json()).waiting,false);
 assert.equal((await (await failGate.fetch(new Request('https://gate/admit?id='+waiterId))).json()).waiting,true);
 const failedStorage=new Storage();let failedJob=new SearchJob({storage:failedStorage},gateEnv);
 await failedJob.fetch(new Request('https://job.internal/start',{method:'POST',headers:{'x-job-id':failedId},body:JSON.stringify({cursors:[{...cursor,page:2}]})}));
 let initial=await failedStorage.get('job');initial.pages=1;await failedStorage.put('job',initial);await failedStorage.put('page:00000001',{items:['preserved']});
 globalThis.fetch=async()=>{throw Error('portal_offline');};
 for(let i=0;i<6;i++){time+=10000;await failedJob.alarm();}
 let state=await failedStorage.get('job');assert.equal(state.status,'waiting_admission');assert.equal(state.failures,6);assert.equal(state.cursors[0].page,2);assert.deepEqual((await failedStorage.get('page:00000001')).items,['preserved']);
 assert.equal(await failGateStorage.get('active:'+failedId),undefined);assert(failedStorage.alarmAt>time);
 assert.equal((await (await failGate.fetch(new Request('https://gate/admit?id='+waiterId))).json()).waiting,false,'another job obtains released slot');
 await failGate.fetch(new Request('https://gate/release?id='+('0'.repeat(64))));
 const before=(await failGateStorage.get('quota')).jobs;
 failedJob=new SearchJob({storage:failedStorage},gateEnv);globalThis.fetch=async()=>mockResponse({...cursor,page:2},20);
 time+=1800000;await failedJob.alarm();state=await failedStorage.get('job');
 assert.equal(state.status,'complete');assert.equal(state.pages,2);assert.equal((await failGateStorage.get('quota')).jobs,before,'readmission does not consume another daily job');
 assert.deepEqual((await failedStorage.get('page:00000001')).items,['preserved']);
 const missing='a'.repeat(64),denied=await (await failGate.fetch(new Request('https://gate/page?id='+missing))).json();
 assert.equal(denied.reason,'not_admitted');assert.equal(await failGateStorage.get('active:'+missing),undefined);
 const legacyStorage=new Storage(),legacy=new SearchJob({storage:legacyStorage},gateEnv);
 await legacy.fetch(new Request('https://job.internal/start',{method:'POST',headers:{'x-job-id':missing},body:JSON.stringify({cursors:[cursor]})}));
 await legacy.alarm();assert.equal((await legacyStorage.get('job')).status,'waiting_admission');assert(await failGateStorage.get('ticket:'+missing));
 await failGate.fetch(new Request('https://gate/release?id='+missing));
 // An accepted job yields even when the waiting list is full, retaining its ticket.
 const congestedStorage=new Storage(),congested=new SearchGate({storage:congestedStorage}),congestedId='a'.repeat(64);
 await congestedStorage.put('quota',{day:new Date(time).toISOString().slice(0,10),jobs:100,pages:0,lastPage:0});
 await congestedStorage.put('active:'+congestedId,time);await congestedStorage.put('ticket:'+congestedId,{day:new Date(time).toISOString().slice(0,10)});
 for(let i=0;i<50;i++)await congestedStorage.put('waiting:'+i.toString(16).padStart(64,'0'),{order:time,lastSeen:time});
 await congested.fetch(new Request('https://gate/yield?id='+congestedId));assert.equal(await congestedStorage.get('active:'+congestedId),undefined);
 assert.equal((await (await congested.fetch(new Request('https://gate/admit?id='+congestedId))).json()).reason,'backlog_limit');
 await congestedStorage.delete('waiting:'+('0'.repeat(64)));assert.equal((await (await congested.fetch(new Request('https://gate/admit?id='+congestedId))).json()).ok,true);
 assert.equal((await congestedStorage.get('quota')).jobs,100,'previously accepted job can requeue even at the daily limit');
 // A failed yield after saving waiting state is retried after process restart.
 const recoveryStorage=new Storage(),recoveryId='b'.repeat(64);
 await failGate.fetch(new Request('https://gate/release?id='+('1'.toString().padStart(64,'0'))));
 await failGate.fetch(new Request('https://gate/admit?id='+recoveryId));
 const brokenEnv={GATE:{idFromName:()=>'',get:()=>({fetch:async()=>{throw Error('offline');}})}};
 let recovery=new SearchJob({storage:recoveryStorage},brokenEnv);
 await recovery.fetch(new Request('https://job.internal/start',{method:'POST',headers:{'x-job-id':recoveryId},body:JSON.stringify({cursors:[cursor]})}));
 let interrupted=await recoveryStorage.get('job');interrupted.failures=6;interrupted.lastError='portal_offline';
 await recovery.deferForAdmission(interrupted);assert.equal((await recoveryStorage.get('job')).needsYield,true);assert(recoveryStorage.alarmAt>time);
 recovery=new SearchJob({storage:recoveryStorage},gateEnv);globalThis.fetch=async()=>mockResponse(cursor,10);
 time+=1800000;await recovery.alarm();assert.equal((await recoveryStorage.get('job')).status,'complete');
 // A long successful search keeps running without waiters, then yields at a completed-page boundary.
 const turnStore=new Storage(),turnGate=new SearchGate({storage:turnStore}),turnId='a'.repeat(64),nextId='b'.repeat(64);
 const turnEnv={GATE:{idFromName:()=>'',get:()=>({fetch:url=>turnGate.fetch(new Request(url))})}};
 assert.equal((await (await turnGate.fetch(new Request('https://gate/admit?id='+turnId))).json()).waiting,false);
 const turnJobStore=new Storage();let turnJob=new SearchJob({storage:turnJobStore},turnEnv);
 await turnJob.fetch(new Request('https://job.internal/start',{method:'POST',headers:{'x-job-id':turnId},body:JSON.stringify({cursors:[cursor]})}));
 globalThis.fetch=async url=>mockResponse({...cursor,page:Number(new URL(url).searchParams.get('viewPage'))},130);
 for(let i=0;i<12;i++){time+=4000;await turnJob.alarm();}
 assert.equal((await turnJobStore.get('job')).pages,12,'no waiting job means no artificial 10-page stop');
 for(let i=0;i<19;i++)await turnStore.put('active:'+i.toString(16).padStart(64,'0'),time);
 assert.equal((await (await turnGate.fetch(new Request('https://gate/admit?id='+nextId))).json()).waiting,true);
 time+=4000;await turnJob.alarm();let turnState=await turnJobStore.get('job');
 assert.equal(turnState.status,'waiting_admission');assert.equal(turnState.pages,12);assert.equal(turnState.cursors[0].page,13);
 assert.equal((await turnJobStore.list({prefix:'page:',limit:100})).size,12);assert.equal((await turnStore.get('quota')).pages,12,'yield does not spend a page');
 assert.equal(await turnStore.get('active:'+turnId),undefined);assert(await turnStore.get('ticket:'+turnId));
 assert.equal((await (await turnGate.fetch(new Request('https://gate/admit?id='+nextId))).json()).waiting,false,'waiting search gets the released slot');
 await turnGate.fetch(new Request('https://gate/release?id='+('0'.repeat(64))));
 const admittedJobs=(await turnStore.get('quota')).jobs;time+=1800000;
 turnJob=new SearchJob({storage:turnJobStore},turnEnv);await turnJob.alarm();turnState=await turnJobStore.get('job');
 assert.equal(turnState.status,'complete');assert.equal(turnState.pages,13);assert.equal((await turnJobStore.get('page:00000013')).page,13);
 assert.equal((await turnStore.get('quota')).jobs,admittedJobs,'turn rotation does not consume an extra daily job');
 assert.equal((await turnStore.get('quota')).pages,13);
 // Releasing a slot wakes the oldest different waiting job without synchronously waiting for it.
 const notifyStore=new Storage(),wakes=[],wakeA='c'.repeat(64),wakeB='d'.repeat(64),wakeSelf='a'.repeat(64);
 const wakeBStorage=new Storage(),wakeAStorage=new Storage(),wakeBJob=new SearchJob({storage:wakeBStorage}),wakeAJob=new SearchJob({storage:wakeAStorage});
 for(const [id,worker] of [[wakeA,wakeAJob],[wakeB,wakeBJob]])await worker.fetch(new Request('https://job.internal/start',{method:'POST',headers:{'x-job-id':id,'x-admission-waiting':'1'},body:JSON.stringify({cursors:[cursor]})}));
 const wakeWorkers=new Map([[wakeA,wakeAJob],[wakeB,wakeBJob]]);
 const notifyGate=new SearchGate({storage:notifyStore,waitUntil:p=>wakes.push(p)},{JOBS:{idFromName:id=>id,get:id=>({fetch:(url,opts)=>wakeWorkers.get(id).fetch(new Request(url,opts))})}});
 await notifyStore.put('active:'+wakeSelf,time);await notifyStore.put('waiting:'+wakeSelf,{order:time-3000,lastSeen:time});
 await notifyStore.put('waiting:'+wakeA,{order:time-2000,lastSeen:time});await notifyStore.put('waiting:'+wakeB,{order:time-1000,lastSeen:time});
 await notifyGate.fetch(new Request('https://gate/yield?id='+wakeSelf));await Promise.all(wakes.splice(0));
 assert.equal(wakeAStorage.alarmAt,time+1000,'oldest other waiter wakes promptly');assert.equal(wakeBStorage.alarmAt,time+1800000,'later waiter keeps its fallback alarm');
 assert.equal((await wakeAStorage.get('job')).status,'waiting_admission');
 const delayedStore=new Storage(),delayedCalls=[];let resolveWake;
 const delayedGate=new SearchGate({storage:delayedStore,waitUntil:p=>delayedCalls.push(p)},{JOBS:{idFromName:id=>id,get:()=>({fetch:()=>new Promise(resolve=>{resolveWake=resolve;})})}});
 await delayedStore.put('active:'+wakeSelf,time);await delayedStore.put('waiting:'+wakeA,{order:time,lastSeen:time});
 const response=await Promise.race([delayedGate.fetch(new Request('https://gate/release?id='+wakeSelf)),new Promise((_,reject)=>setTimeout(()=>reject(Error('synchronous wake deadlock')),1000))]);
 assert.equal(response.status,200,'slot release does not wait for another object');
 await Promise.resolve();resolveWake(new Response(null,{status:500}));await Promise.all(delayedCalls);
 assert.equal(wakeBStorage.alarmAt,time+1800000,'failed notification never deletes fallback alarms');
 await notifyStore.delete('waiting:'+wakeSelf);const anotherActive='e'.repeat(64);await notifyStore.put('active:'+anotherActive,time);
 await notifyGate.fetch(new Request('https://gate/release?id='+anotherActive));await Promise.all(wakes.splice(0));
 assert.equal(wakeBStorage.alarmAt,time+1000,'a recent wake is suppressed so another waiting job is notified');
 await wakeAJob.fetch(new Request('https://job.internal/wake',{method:'POST'}));assert.equal(wakeAStorage.alarmAt,time+1000,'an earlier existing alarm is not delayed');
 const wakeBState=await wakeBStorage.get('job');wakeBState.waitingUntil=time-1000;await wakeBStorage.put('job',wakeBState);wakeBStorage.alarmAt=null;
 await wakeBJob.fetch(new Request('https://job.internal/wake',{method:'POST'}));assert.equal(wakeBStorage.alarmAt,time+1000,'a missing alarm is restored');
 // A wake arriving during an in-flight admission check must not be overwritten by its 30-minute retry.
 const racingStore=new Storage();let resolveAdmission,admissionStarted;
 const started=new Promise(resolve=>{admissionStarted=resolve;});
 const racingJob=new SearchJob({storage:racingStore},{GATE:{idFromName:()=>'',get:()=>({fetch:()=>{admissionStarted();return new Promise(resolve=>{resolveAdmission=resolve;});}})}});
 await racingJob.fetch(new Request('https://job.internal/start',{method:'POST',headers:{'x-job-id':wakeB,'x-admission-waiting':'1'},body:JSON.stringify({cursors:[cursor]})}));
 racingStore.alarmAt=null;const processing=racingJob.alarm();await started;
 await racingJob.fetch(new Request('https://job.internal/wake',{method:'POST'}));
 resolveAdmission(Response.json({ok:true,waiting:true,retryAt:time+1800000}));await processing;
 assert.equal(racingStore.alarmAt,time+1000,'admission retry preserves a concurrent earlier wake');
 const boundaryStore=new Storage(),boundaryGate=new SearchGate({storage:boundaryStore});
 await boundaryStore.put('active:'+turnId,time);await boundaryStore.put('waiting:'+nextId,{order:time,lastSeen:time});
 for(let p=0;p<10;p++){time+=4000;assert.equal((await (await boundaryGate.fetch(new Request('https://gate/page?id='+turnId+'&pages='+p))).json()).ok,true);}
 time+=4000;assert.equal((await (await boundaryGate.fetch(new Request('https://gate/page?id='+turnId+'&pages=10'))).json()).reason,'yield_turn');
 assert.equal((await boundaryStore.get('quota')).pages,10,'the next unvisited page is not charged before yielding');
 const oldStore=new Storage(),oldGate=new SearchGate({storage:oldStore});
 await oldStore.put('active:'+turnId,time);await oldStore.put('waiting:'+nextId,{order:time,lastSeen:time});
 for(let p=333;p<343;p++){time+=4000;assert.equal((await (await oldGate.fetch(new Request('https://gate/page?id='+turnId+'&pages='+p))).json()).ok,true);}
 time+=4000;assert.equal((await (await oldGate.fetch(new Request('https://gate/page?id='+turnId+'&pages=343'))).json()).reason,'yield_turn','existing jobs start a new turn at their current saved page');
 const staleTurnStore=new Storage(),staleTurnGate=new SearchGate({storage:staleTurnStore});
 await staleTurnStore.put('active:'+turnId,time);await staleTurnStore.put('turn:'+turnId,0);
 await staleTurnStore.put('waiting:'+nextId,{order:time-3600000,lastSeen:time-3600000});
 assert.equal((await (await staleTurnGate.fetch(new Request('https://gate/page?id='+turnId+'&pages=10'))).json()).ok,true,'stale waiters do not interrupt active searches');
}finally{Date.now=originalNow;globalThis.fetch=originalFetch;}
console.log('background-search: retry, restart, page validation and completion passed');
