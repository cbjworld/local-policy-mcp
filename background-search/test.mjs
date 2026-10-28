import assert from 'node:assert/strict';
import {SearchJob,SearchGate,portalPage} from './worker.mjs';
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
assert.equal((await (await gate.fetch(new Request(gateURL))).json()).ok,true);
assert.equal((await (await gate.fetch(new Request(gateURL))).json()).ok,false);
await gateStorage.put('quota',{day:new Date().toISOString().slice(0,10),pages:1000,jobs:100,lastPage:0});
const limited=await (await gate.fetch(new Request(gateURL))).json();
assert.equal(limited.ok,false);assert.ok(limited.retryAt>Date.now());
assert.equal((await (await gate.fetch(new Request('https://gate/admit?id='+'b'.repeat(64)))).json()).ok,false);
const fullStore=new Storage(),fullGate=new SearchGate({storage:fullStore});
for(let i=0;i<20;i++)await fullStore.put('active:'+i.toString(16).padStart(64,'0'),Date.now());
const refused=await (await fullGate.fetch(new Request('https://gate/admit?id='+'f'.repeat(64)))).json();
assert.equal(refused.reason,'active_job_limit');
await fullGate.fetch(new Request('https://gate/release?id='+('0'.repeat(64))));
assert.equal((await (await fullGate.fetch(new Request('https://gate/admit?id='+'f'.repeat(64)))).json()).ok,true);
console.log('background-search: retry, restart, page validation and completion passed');
