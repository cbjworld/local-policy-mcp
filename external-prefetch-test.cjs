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
 const mainlandItems=items.map(x=>({...x,institution:'충청남도 시험시'})),metadataStarts=[],resolvers=new Map();
 const mainland=createSession(portal,{get:async url=>{metadataStarts.push(url);return new Promise(resolve=>resolvers.set(url,()=>resolve({url,bytes:Buffer.from('var result = '+JSON.stringify({openCateSearchVO:{infoSj:'교통비 지원 계획',oppSeCd:'3',fileYn:'N',fileList:[]}})+';')})));}});
 mainland.preload(mainlandItems);await tick();assert.equal(metadataStarts.length,3);
 mainland.preload([mainlandItems[3]]);await tick();assert.equal(metadataStarts.length,3,'at most three metadata slots');
 resolvers.get(doc(1))();resolvers.get(doc(2))();resolvers.get(doc(3))();
 assert.equal((await mainland.research({url:doc(1)})).status,'no_available_attachment');
 mainland.preload([mainlandItems[3]]);await tick();assert.equal(metadataStarts.length,4);resolvers.get(doc(4))();
 await mainland.research({url:doc(4)});assert.equal(metadataStarts.filter(x=>x===doc(1)).length,1);mainland.close();
 let resetCalls=0;
 const reset=createSession(portal,{get:async url=>{if(++resetCalls===1)throw Object.assign(Error('reset'),{code:'ECONNRESET',retryable:true});return {url,bytes:Buffer.from('var result = '+JSON.stringify({openCateSearchVO:{infoSj:'교통비 지원 계획',oppSeCd:'3',fileYn:'N',fileList:[]}})+';')};}});
 reset.preload([mainlandItems[0]]);await tick();const restored=await reset.research({url:doc(1)});assert.equal(restored.status,'no_available_attachment');assert.equal(restored.metadataPrefetchFailure.code,'ECONNRESET');assert.equal(resetCalls,2);reset.close();
 const metadata={infoSj:'2026년 청년 이사비 지원 추진계획',oppSeCd:'1',fileYn:'Y',nstSeCd:'B',urtxtYn:'Y',fileList:[{fileId:'plan',fileNm:'2026년 청년 이사비 지원 추진계획.pdf',fileByteNum:12345}]};
 const posts=[],parsed=[];
 const publicSession=createSession(portal,{get:async(url,hops,deadline,body)=>{
  if(!body)return {url,bytes:Buffer.from('var result = '+JSON.stringify({openCateSearchVO:metadata})+';')};
  posts.push(url);return url.endsWith('.down')?{url,bytes:Buffer.from('%PDF-test')}:{url,bytes:Buffer.from(JSON.stringify({error_code:'00',esbFilePath:'path',esbFileName:'plan.pdf',fileName:'file',isPdf:'Y'}))};
 },extract:async()=>{parsed.push(1);return {sourceId:'p',format:'pdf',scanComplete:true,pages:[{page:1,text:'사업기간:2026년\n지원대상:청년\n사업비:100만원\n지원내용:이사비 지원'}]};}});
 publicSession.preload([items[0]]);await tick();await tick();assert.equal(posts.length,3);assert.equal(parsed.length,0,'speculative public download must not parse or OCR');
 const publicResult=await publicSession.research({url:doc(1),autoOcr:false});assert.equal(publicResult.status,'read');assert.equal(posts.length,3,'validated file reused without a second filter or download');assert.equal(parsed.length,1);publicSession.close();
 const delayed=new Map(),rankDownloads=[];
 const rankSession=createSession(portal,{get:async(url,hops,deadline,body)=>{
  if(!body)return new Promise(resolve=>delayed.set(url,()=>resolve({url,bytes:Buffer.from('var result = '+JSON.stringify({openCateSearchVO:{...metadata,fileList:[{fileId:url.split('TEST')[1],fileNm:'추진계획.pdf',fileByteNum:100}]}})+';')})));
  rankDownloads.push(new URLSearchParams(body).get('fileId'));return url.endsWith('.down')?{url,bytes:Buffer.from('%PDF-test')}:{url,bytes:Buffer.from(JSON.stringify({error_code:'00',esbFilePath:'path',esbFileName:'plan.pdf',fileName:'file',isPdf:'Y'}))};
 },extract:async()=>({sourceId:'rank',format:'pdf',pages:[{page:1,text:'사업비:1만원'}]})});
 rankSession.preload(items);await tick();delayed.get(doc(3))();await tick();assert.equal(rankDownloads.length,0,'third metadata response must not take a first-two file slot');delayed.get(doc(1))();delayed.get(doc(2))();await tick();await tick();assert.deepEqual([...new Set(rankDownloads)].sort(),['1','2']);rankSession.close();
 console.log('PASS: three overlapping full-deadline requests, isolated failure, serial parsing, cancellation, large metadata fallback, title verification, bounded municipal metadata prefetch');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
