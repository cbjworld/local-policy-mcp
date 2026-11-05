import assert from 'node:assert/strict';
import app,{SearchJob,SearchGate,portalPage} from './worker.mjs';
const cursor={q:'산후조리비',startDate:'20241028',endDate:'20261028',scope:'all',page:1};
const mockResponse=(c,total=20)=>new Response('var result = '+JSON.stringify({code:'200',parameterVO:{kwd:c.q,startDate:c.startDate,endDate:c.endDate,viewPage:c.page},rtnTotal:total,rtnList:[{INFO_SJ:'산후조리비 지원 계획',PRDCTN_INSTT_REGIST_NO:'DCT1',PRDCTN_DT:'20260101000000',INSTT_SE_CD:'B'}]})+';');
assert.equal((await portalPage(cursor,async()=>mockResponse(cursor))).items.length,1);
await assert.rejects(()=>portalPage(cursor,async()=>new Response('var result = {"code":"429"};')),/portal_http_429/);
await assert.rejects(()=>portalPage(cursor,async()=>new Response('',{status:429})),/portal_http_429/);
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
const holdStore=new Storage(),holdCalls=[];
const holdWorker=new SearchJob({storage:holdStore},{GATE:{idFromName:()=>'',get:()=>({fetch:async url=>{holdCalls.push(new URL(url).pathname);return Response.json({ok:true});}})}});
const holdStart=await holdWorker.fetch(req('start',{cursors:[cursor],deferForRateLimit:true}));
assert.equal((await holdStart.json()).status,'waiting_admission');
const holdJob=await holdStore.get('job');assert.equal(holdJob.cursors[0].page,1);assert(holdJob.quotaRetryAt-Date.now()>299000);assert.equal(holdStore.alarmAt,holdJob.quotaRetryAt);
await holdWorker.alarm();assert.equal((await holdStore.get('job')).pages,0);assert(!holdCalls.includes('/page'),'portal must not be contacted during rate-limit hold');
const realNow=Date.now;try{Date.now=()=>holdJob.quotaRetryAt+1;await holdWorker.alarm();assert.equal((await holdStore.get('job')).pages,1);assert.equal((await holdStore.get('job')).cursors[0].page,2);}finally{Date.now=realNow;}
const limitedStorage=new Storage(),limitedCalls=[];
const limitedWorker=new SearchJob({storage:limitedStorage},{GATE:{idFromName:()=>'',get:()=>({fetch:async url=>{limitedCalls.push(new URL(url).pathname);return Response.json({ok:true});}})}});
await limitedWorker.fetch(req('start',{cursors:[cursor]}));
let portalCalls=0;globalThis.fetch=async()=>{portalCalls++;return new Response('var result = {"code":"429"};');};
await limitedWorker.alarm();let limitedJob=await limitedStorage.get('job');
assert.equal(limitedJob.status,'waiting_admission');assert.equal(limitedJob.cursors[0].page,1);assert.equal(limitedJob.lastError,'portal_http_429');assert(limitedJob.quotaRetryAt-Date.now()>299000);assert(limitedCalls.includes('/yield'));
await limitedWorker.alarm();assert.equal(portalCalls,1,'rate-limited portal is not retried during the hold');
try{Date.now=()=>limitedJob.quotaRetryAt+1;globalThis.fetch=async()=>{portalCalls++;return mockResponse(cursor,1);};await limitedWorker.alarm();limitedJob=await limitedStorage.get('job');assert.equal(limitedJob.status,'complete');assert.equal(limitedJob.pages,1);assert.equal(portalCalls,2);}finally{Date.now=realNow;}
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
assert.equal(await staleStore.get('waiting:'+'a'.repeat(64)),undefined,'stale wait entries no longer exhaust the backlog');
assert(await staleStore.get('ticket:'+'a'.repeat(64)),'offline job retains admission and can resume');
assert.equal((await (await staleGate.fetch(new Request('https://gate/admit?id='+'a'.repeat(64)))).json()).waiting,false,'offline search can rejoin');
const badStorage=new Storage(),badGate=new SearchGate({storage:badStorage});
const env={SEARCH_SECRET:'test',GATE:{idFromName:()=>'',get:()=>({fetch:url=>badGate.fetch(new Request(url))})},JOBS:{idFromName:()=>'',get:()=>({fetch:async()=>new Response(null,{status:400})})}};
assert.equal((await app.fetch(new Request('https://worker/jobs/'+('e'.repeat(64))+'/status'),env)).status,401,'status requires worker authentication');
assert.equal((await app.fetch(new Request('https://worker/inspect?id='+('e'.repeat(64)),{headers:{authorization:'Bearer test'}}),env)).status,404,'global gate is not exposed externally');
assert.equal((await app.fetch(new Request('https://worker/kick',{method:'POST',headers:{authorization:'Bearer test'}}),env)).status,404,'watchdog is not exposed externally');
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
assert.deepEqual(gateView.gateSummary,{activeJobs:2,waitingJobs:2,eligibleWaitingJobs:1,pagesToday:71,attemptsToday:123});assert(!JSON.stringify(gateView).includes(otherId));
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
 assert.equal(legacyStorage.alarmAt,time+1000,'missing reservation is retried promptly');
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
 // A search stopped by the daily cap resumes its next page after UTC midnight and a restart.
 time=Date.parse('2026-10-28T23:59:00Z');
 const dailyGateStore=new Storage(),dailyGate=new SearchGate({storage:dailyGateStore});
 const dailyEnv={GATE:{idFromName:()=>'',get:()=>({fetch:url=>dailyGate.fetch(new Request(url))})}};
 const dailyId='a'.repeat(64),dailyJobStore=new Storage();
 await dailyGateStore.put('active:'+dailyId,time);
 await dailyGateStore.put('quota',{day:'2026-10-28',jobs:1,pages:1000,lastPage:time-4000});
 let dailyJob=new SearchJob({storage:dailyJobStore},dailyEnv);
 await dailyJob.fetch(new Request('https://job.internal/start',{method:'POST',headers:{'x-job-id':dailyId},body:JSON.stringify({cursors:[{...cursor,page:2}]})}));
 let dailyState=await dailyJobStore.get('job');dailyState.pages=1;await dailyJobStore.put('job',dailyState);
 await dailyJobStore.put('page:00000001',{items:['preserved']});
 globalThis.fetch=async()=>mockResponse({...cursor,page:2},20);
 await dailyJob.alarm();dailyState=await dailyJobStore.get('job');
 assert.equal(dailyState.cursors[0].page,2);assert.equal(dailyState.pages,1);
 assert.equal(dailyState.status,'waiting_admission');assert.equal(await dailyGateStore.get('active:'+dailyId),undefined,'daily quota wait must release the active slot');
 assert.equal(dailyJobStore.alarmAt,Date.parse('2026-10-29T00:00:01Z'));
 time=dailyJobStore.alarmAt;dailyJob=new SearchJob({storage:dailyJobStore},dailyEnv);
 await dailyJob.alarm();dailyState=await dailyJobStore.get('job');
 assert.equal(dailyState.status,'complete');assert.equal(dailyState.pages,2);
 assert.deepEqual((await dailyJobStore.get('page:00000001')).items,['preserved']);
 assert.equal((await dailyJobStore.get('page:00000002')).page,2);
 assert.equal((await dailyGateStore.get('quota')).pages,1,'only the new day is charged');

 // A failed quota-yield is retried early without reading another page before the daily reset.
 time=Date.parse('2026-10-28T20:00:00Z');
 const quotaHoldStore=new Storage(),quotaHoldGate=new SearchGate({storage:quotaHoldStore}),quotaHoldId='c'.repeat(64);
 await quotaHoldStore.put('active:'+quotaHoldId,time);await quotaHoldStore.put('quota',{day:'2026-10-28',jobs:1,pages:1000,lastPage:time-4000});
 let failYield=true,admissions=0;const quotaHoldEnv={GATE:{idFromName:()=>'',get:()=>({fetch:async url=>{
   if(url.includes('/yield')&&failYield){failYield=false;throw Error('gate_unavailable');}
   if(url.includes('/admit'))admissions++;
   return quotaHoldGate.fetch(new Request(url));
 }})}};
 const quotaHoldJobStore=new Storage(),quotaHoldJob=new SearchJob({storage:quotaHoldJobStore},quotaHoldEnv);
 await quotaHoldJob.fetch(new Request('https://job.internal/start',{method:'POST',headers:{'x-job-id':quotaHoldId},body:JSON.stringify({cursors:[cursor]})}));
 await quotaHoldJob.alarm();let hold=await quotaHoldJobStore.get('job');
 assert.equal(hold.needsYield,true);const quotaReset=hold.quotaRetryAt;assert(quotaReset>time+3600000);
 time+=600000;await quotaHoldJob.fetch(new Request('https://job.internal/recover',{method:'POST'}));assert.equal(quotaHoldJobStore.alarmAt,time+1000);
 time+=1000;quotaHoldJobStore.alarmAt=null;await quotaHoldJob.alarm();hold=await quotaHoldJobStore.get('job');
 assert.equal(hold.needsYield,undefined);assert.equal(await quotaHoldStore.get('active:'+quotaHoldId),undefined);
 assert.equal(quotaHoldJobStore.alarmAt,quotaReset);assert.equal(admissions,0,'only the slot is released before the reset');assert.equal(hold.pages,0);

 // Starting an already-waiting search must not strand an active slot until the quota reset.
 const duplicateStore=new Storage(),duplicateGateStore=new Storage(),duplicateId='d'.repeat(64);
 const duplicateGate=new SearchGate({storage:duplicateGateStore});
 const duplicateJob=new SearchJob({storage:duplicateStore},{GATE:{idFromName:()=>'',get:()=>({fetch:url=>duplicateGate.fetch(new Request(url))})}});
 await duplicateJob.fetch(new Request('https://job.internal/start',{method:'POST',headers:{'x-job-id':duplicateId,'x-admission-waiting':'1'},body:JSON.stringify({cursors:[cursor]})}));
 let duplicateState=await duplicateStore.get('job');duplicateState.quotaRetryAt=quotaReset;duplicateState.waitingUntil=quotaReset;await duplicateStore.put('job',duplicateState);duplicateStore.alarmAt=quotaReset;
 await duplicateGateStore.put('ticket:'+duplicateId,{day:null,order:time-600000});
 const duplicateEnv={SEARCH_SECRET:'test',GATE:{idFromName:()=>'',get:()=>({fetch:url=>duplicateGate.fetch(new Request(url))})},JOBS:{idFromName:()=>'',get:()=>({fetch:(request,opts)=>duplicateJob.fetch(typeof request==='string'?new Request(request,opts):request)})}};
 const duplicateStart=new Request('https://worker/jobs/'+duplicateId+'/start',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({cursors:[cursor]})});
 assert.equal((await app.fetch(duplicateStart,duplicateEnv)).status,409);
 assert.equal((await duplicateStore.get('job')).needsYield,true);assert.equal(duplicateStore.alarmAt,time+1000);
 time+=1000;duplicateStore.alarmAt=null;await duplicateJob.alarm();duplicateState=await duplicateStore.get('job');
 assert.equal(await duplicateGateStore.get('active:'+duplicateId),undefined,'duplicate start returns slot while job remains asleep');
 assert.equal(duplicateState.status,'waiting_admission');assert.equal(duplicateStore.alarmAt,quotaReset);assert.equal(duplicateState.pages,0);
 await duplicateGateStore.put('active:'+duplicateId,time-600000);
 await duplicateJob.fetch(new Request('https://job.internal/recover?held=1',{method:'POST'}));
 assert.equal((await duplicateStore.get('job')).needsYield,true);assert.equal(duplicateStore.alarmAt,time+1000,'watchdog repairs a missed duplicate-start wake');
 time+=1000;duplicateStore.alarmAt=null;await duplicateJob.alarm();
 assert.equal(await duplicateGateStore.get('active:'+duplicateId),undefined);assert.equal(duplicateStore.alarmAt,quotaReset);
 duplicateStore.alarmAt=time+500;
 await duplicateJob.fetch(new Request('https://job.internal/wake?held=1',{method:'POST'}));
 assert.equal(duplicateStore.alarmAt,time+500,'already earlier alarm is kept');
 assert.equal((await duplicateStore.get('job')).needsYield,true,'held-slot signal is saved even with an earlier alarm');

 // Stale waiting entries must not fill the queue, and admitted jobs keep their ticket/order.
 const staleBacklogStore=new Storage(),staleBacklog=new SearchGate({storage:staleBacklogStore});
 for(let i=0;i<50;i++)await staleBacklogStore.put('waiting:'+i.toString(16).padStart(64,'0'),{order:time-3600000+i,lastSeen:time-3600000});
 const newId='f'.repeat(64),oldId='0'.repeat(64);
 assert.equal((await (await staleBacklog.fetch(new Request('https://gate/admit?id='+newId))).json()).waiting,false);
 assert.equal((await staleBacklogStore.get('ticket:'+oldId)).order,time-3600000);
 const oldRejoin=await (await staleBacklog.fetch(new Request('https://gate/admit?id='+oldId))).json();
 assert.equal(oldRejoin.ok,true);assert.equal((await staleBacklogStore.get('quota')).jobs,1,'accepted old search does not consume a new daily ticket');

 // Only confirmed missing/finished jobs are released; old running jobs get their alarm back.
 const probeStore=new Storage(),probePromises=[],probeIds=Array.from({length:20},(_,i)=>i.toString(16).padStart(64,'0'));
 const recoveredStore=new Storage();let recovered=new SearchJob({storage:recoveredStore});
 await recovered.fetch(new Request('https://job.internal/start',{method:'POST',headers:{'x-job-id':probeIds[0]},body:JSON.stringify({cursors:[{...cursor,page:2}]})}));
 const recoveredJob=await recoveredStore.get('job');recoveredJob.updatedAt=time-600000;recoveredJob.pages=1;await recoveredStore.put('job',recoveredJob);
 await recoveredStore.put('page:00000001',{items:['preserved']});recoveredStore.alarmAt=null;
 const finishedStore=new Storage(),finished=new SearchJob({storage:finishedStore});await finishedStore.put('job',{status:'complete',updatedAt:time-600000});
 const missingJob=new SearchJob({storage:new Storage()});
 const probeWorkers=new Map([[probeIds[0],recovered],[probeIds[1],finished],[probeIds[2],missingJob]]);
 const probeGate=new SearchGate({storage:probeStore,waitUntil:p=>probePromises.push(p)},{JOBS:{idFromName:id=>id,get:id=>({fetch:(url,opts)=>probeWorkers.has(id)?probeWorkers.get(id).fetch(new Request(url,opts)):Promise.reject(Error('offline'))})}});
 for(const id of probeIds)await probeStore.put('active:'+id,time-600000);
 assert.equal((await (await probeGate.fetch(new Request('https://gate/admit?id='+newId))).json()).waiting,true);
 await Promise.all(probePromises);
 assert.equal(recoveredStore.alarmAt,time+1000,'lost running alarm is restored');
 assert(await probeStore.get('active:'+probeIds[0]),'recoverable job keeps its slot');
 assert.equal(await probeStore.get('active:'+probeIds[1]),undefined,'finished job releases slot');
 assert.equal(await probeStore.get('active:'+probeIds[2]),undefined,'missing job releases slot');
 assert(await probeStore.get('active:'+probeIds[3]),'inaccessible job is not assumed dead');
 const restoredEnv={GATE:{idFromName:()=>'',get:()=>({fetch:url=>probeGate.fetch(new Request(url))})}};
 recovered=new SearchJob({storage:recoveredStore},restoredEnv);globalThis.fetch=async()=>mockResponse({...cursor,page:2},20);
 time+=4000;await recovered.alarm();assert.equal((await recoveredStore.get('job')).status,'complete');
 assert.deepEqual((await recoveredStore.get('page:00000001')).items,['preserved']);
 assert.equal((await recoveredStore.get('page:00000002')).page,2);
 const changedId=probeIds[4],oldStamp=await probeStore.get('active:'+changedId);
 await probeGate.fetch(new Request('https://gate/admit?id='+changedId));
 await probeGate.fetch(new Request('https://gate/release?id='+changedId+'&expected='+oldStamp));
 assert.equal(await probeStore.get('active:'+changedId),time,'a stale probe cannot release a renewed slot');

 // The shared gate's alarm finds suspended jobs even when nobody issues another request.
 const autoStore=new Storage(),autoJobStore=new Storage(),autoId='9'.repeat(64);
 const autoJob=new SearchJob({storage:autoJobStore});
 await autoJob.fetch(new Request('https://job.internal/start',{method:'POST',headers:{'x-job-id':autoId,'x-admission-waiting':'1'},body:JSON.stringify({cursors:[cursor]})}));
 let autoState=await autoJobStore.get('job');autoState.updatedAt=time-3600000;await autoJobStore.put('job',autoState);autoJobStore.alarmAt=null;
 await autoStore.put('ticket:'+autoId,{day:null,order:time-3600000});
 const autoGate=new SearchGate({storage:autoStore,waitUntil:()=>{}},{JOBS:{idFromName:id=>id,get:()=>({fetch:(url,opts)=>autoJob.fetch(new Request(url,opts))})}});
 await autoGate.alarm();assert.equal(autoJobStore.alarmAt,time+1000,'lost alarm for suspended job is restored without client traffic');
 assert.equal(autoStore.alarmAt,time+300000,'watchdog continues while an accepted job remains');
 assert(await autoStore.get('ticket:'+autoId),'recovery preserves the suspended job admission ticket');
 autoStore.alarmAt=null;const cronTasks=[];
 await app.scheduled({}, {GATE:{idFromName:()=>'',get:()=>({fetch:(url,opts)=>autoGate.fetch(new Request(url,opts))})}}, {waitUntil:p=>cronTasks.push(p)});
 await Promise.all(cronTasks);assert.equal(autoStore.alarmAt,time+1000,'scheduled watchdog restores a lost gate alarm');

 // An older failed request must not roll back a later successful page.
 const raceStore=new Storage(),raceJob=new SearchJob({storage:raceStore});
 await raceJob.fetch(new Request('https://job.internal/start',{method:'POST',headers:{'x-job-id':newId},body:JSON.stringify({cursors:[cursor]})}));
 let rejectOld,oldStarted;const startedOld=new Promise(resolve=>{oldStarted=resolve;});let reads=0;
 globalThis.fetch=async()=>{if(++reads===1){oldStarted();return new Promise((_,reject)=>{rejectOld=reject;});}return mockResponse(cursor,10);};
 const oldCall=raceJob.alarm();await startedOld;await raceJob.alarm();rejectOld(Error('late failure'));await oldCall;
 const raceState=await raceStore.get('job');assert.equal(raceState.status,'complete');assert.equal(raceState.pages,1);assert.equal(raceState.failures,0);

}finally{Date.now=originalNow;globalThis.fetch=originalFetch;}
console.log('background-search: retry, restart, page validation and completion passed');
