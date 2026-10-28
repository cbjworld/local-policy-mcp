const assert=require('node:assert/strict');
const {createStore}=require('./research-sources');
const {createArchive}=require('./source-archive');
(async()=>{
 const data=new Map();
 const fetchImpl=async(url,opts)=>{
  if(opts.method==='PUT'){data.set(url,Buffer.from(opts.body));return new Response('{"success":true}');}
  const body=data.get(url);return body?new Response(body):new Response(null,{status:404});
 };
 const archive=createArchive({account:'a'.repeat(32),namespace:'b'.repeat(32),token:'test',fetchImpl});
 const a=createStore({archive}),b=createStore({archive});
 const items=Array.from({length:75},(_,i)=>({url:'https://www.open.go.kr/item/'+i,institution:'기관'+i,title:'지원 사업 '+i,relevance:{kind:'project_candidate'}}));
 const saved=await a.save({request:{question:'산후조리비'},candidates:[...items,items[0]]});
 assert.equal(saved.storage,'archived');assert.equal(saved.total,75);
 const encrypted=[...data.values()][0];assert(!encrypted.includes(Buffer.from('산후조리비')));assert(!encrypted.includes(Buffer.from('open.go.kr')));
 for(let i=0;i<130;i++)await a.save({candidates:[]});
 let offset=0,all=[];do{const r=await b.list({researchId:saved.researchId,offset,limit:30});all.push(...r.items);offset=r.nextOffset}while(offset!==null);
 assert.deepEqual(all.map(x=>x.url),items.map(x=>x.url));
 assert.equal((await a.list({researchId:saved.researchId})).total,75);
 await assert.rejects(()=>a.list({researchId:saved.researchId,limit:31}),/확인/);
 const key=[...data.keys()][0],original=data.get(key);data.set(key,Buffer.from(original));data.get(key)[20]^=1;
 await assert.rejects(()=>createStore({archive}).list({researchId:saved.researchId}),/복호화/);data.set(key,original);
 const fail=createStore({archive:{put:async()=>{throw Error('failed')},get:async()=>{throw Error('missing')}}});
 const temp=await fail.save({candidates:items});assert.equal(temp.storage,'temporary');assert.match(temp.warning,/임시/);
 const clock=Date.now;try{Date.now=()=>clock()+86401000;assert.equal((await b.list({researchId:saved.researchId})).total,75);await assert.rejects(()=>fail.list({researchId:temp.researchId}),/missing/);}finally{Date.now=clock;}
 console.log('PASS: encrypted archival, pagination, restart, eviction, expiry, tampering and failure handling');
})().catch(e=>{console.error(e);process.exitCode=1});
