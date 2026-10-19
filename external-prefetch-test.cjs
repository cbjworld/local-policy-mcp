const assert=require('node:assert/strict'),portal=require('./open-portal'),{createSession}=require('./external-prefetch');
const doc=i=>'https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=TEST'+i;
const notice=i=>'https://opengov.seoul.go.kr/sanction/'+i;
const title=i=>'청년 이사비 지원 추진계획 '+i;
const items=[1,2,3,4].map(i=>({institution:'서울특별시 '+i,url:doc(i)}));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const html=(i,padding='')=>({url:doc(i),bytes:Buffer.from('var result = '+JSON.stringify({openCateSearchVO:{infoSj:title(i),oppSeCd:'3',fileYn:'N',fileList:[],oppUrl:notice(i)}})+';'+padding)});
async function main(){
 const starts=[],pending=new Map(),deadlines=[],counts=new Map();let active=0,maxActive=0;
 const get=async(url,hops,deadline,body,signal)=>{
  counts.set(url,(counts.get(url)||0)+1);
  const i=Number(url.match(/(?:TEST|sanction\/)(\d+)$/)[1]);
  if(url.includes('open.go.kr'))return html(i);
  starts.push(url);deadlines.push(deadline-Date.now());
  return new Promise((resolve,reject)=>{pending.set(i,{resolve:()=>resolve({url,bytes:Buffer.from(String(i))}),reject});signal?.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{code:'ABORT_ERR'})),{once:true});});
 };
 const extract=async response=>{active++;maxActive=Math.max(maxActive,active);await tick();active--;const i=Number(response.bytes.toString());return {sourceId:'s'+i,format:'html',pages:[{text:title(i)}],links:[]};};
 const session=createSession(portal,{get,extract});session.preload(items);await tick();
 assert.deepEqual(starts,[notice(1),notice(2),notice(3)]);
 assert(deadlines.every(ms=>ms>=24900&&ms<=25000),'every notice retains its own full 25 seconds');
 const first=session.research({url:doc(1),requestedQuery:'청년 이사비'});
 pending.get(2).reject(Object.assign(Error('timeout'),{code:'ETIMEDOUT',phase:'headers'}));
 pending.get(3).resolve();pending.get(1).resolve();
 const a=await first,b=await session.research({url:doc(2)}),c=await session.research({url:doc(3)});
 assert.equal(a.metadata.externalNotice.sourceId,'s1');assert.equal(c.metadata.externalNotice.sourceId,'s3');
 assert.equal(b.attempts[0].errorCode,'ETIMEDOUT');assert.equal(b.attempts[0].phase,'headers');
 assert.equal(typeof b.attempts[0].networkMs,'number');assert.equal(maxActive,1,'parsing remains sequential');
 assert.equal(counts.get(doc(1)),1);assert.equal(counts.get(notice(1)),1);session.close();
 // Cancelling unused speculative work must not leave rejected promises or start late requests.
 const cancelled=createSession(portal,{get,extract});cancelled.preload(items);await tick();cancelled.close();await tick();
 const late=createSession(portal,{get,extract});late.preload(items);late.close();await tick();await tick();
 // Oversized metadata falls back to a normal read rather than dropping the document.
 let bigGets=0;
 const big=createSession(portal,{get:async url=>{if(url===doc(1)){bigGets++;return html(1,' '.repeat(1024*1024));}return {url,bytes:Buffer.from('1')};},extract});
 big.preload([items[0]]);await tick();const bigResult=await big.research({url:doc(1)});assert.equal(bigGets,2);assert.equal(bigResult.metadata.externalNotice.sourceId,'s1');big.close();
 // Prefetch is not permission to accept a different document's contents.
 const mismatch=createSession(portal,{get:async url=>url===doc(1)?html(1):{url,bytes:Buffer.from('3')},extract});
 mismatch.preload([items[0]]);await tick();const wrong=await mismatch.research({url:doc(1)});assert.match(wrong.attempts[0].message,/제목 일치 확인 실패/);assert.equal(wrong.metadata.externalNotice,undefined);mismatch.close();
 console.log('PASS: three overlapping full-deadline requests, isolated failure, serial parsing, cancellation, large metadata fallback, title verification');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
