const assert=require('node:assert/strict'),{createStore}=require('./research-sources');
const a=createStore(),b=createStore(),items=Array.from({length:75},(_,i)=>({url:'https://www.open.go.kr/item/'+i,institution:'기관'+i,title:'지원 사업 '+i,relevance:{kind:'project_candidate'}}));
const saved=a.save({request:{question:'산후조리비'},candidates:[...items,items[0]],reviewItems:[],relatedDocuments:[],investigations:[]});
assert.equal(saved.total,75);let offset=0,all=[];do{let r=a.list({researchId:saved.researchId,offset,limit:30});all.push(...r.items);offset=r.nextOffset}while(offset!==null);assert.equal(all.length,75);assert.deepEqual(all.map(x=>x.url),items.map(x=>x.url));assert.throws(()=>b.list({researchId:saved.researchId}),/만료/);assert.throws(()=>a.list({researchId:saved.researchId,limit:31}),/확인/);
const old=Date.now;try{Date.now=()=>old()+601000;assert.equal(a.list({researchId:saved.researchId}).total,75);Date.now=()=>old()+86401000;assert.throws(()=>a.list({researchId:saved.researchId}),/만료/);}finally{Date.now=old;}
console.log('PASS: paginated source links, no duplicates, bounded pages, session isolation and expiry');
