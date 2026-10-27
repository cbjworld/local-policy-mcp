const assert=require('node:assert/strict'),portal=require('./open-portal'),{createSession}=require('./external-prefetch');
const doc=i=>'https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=TEST'+i;
const notice=i=>'https://opengov.seoul.go.kr/sanction/'+i;
const title=i=>'청년 이사비 지원 추진계획 '+i;
const items=[1,2,3,4,5].map(i=>({institution:'서울특별시 '+i,url:doc(i)}));
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
 mainland.preload(mainlandItems);await tick();assert.equal(metadataStarts.length,4);
 mainland.preload([mainlandItems[4]]);await tick();assert.equal(metadataStarts.length,4,'at most four metadata slots');
 resolvers.get(doc(1))();resolvers.get(doc(2))();resolvers.get(doc(3))();resolvers.get(doc(4))();
 assert.equal((await mainland.research({url:doc(1)})).status,'no_available_attachment');
 mainland.preload([mainlandItems[4]]);await tick();assert.equal(metadataStarts.length,5);resolvers.get(doc(5))();
 await mainland.research({url:doc(5)});assert.equal(metadataStarts.filter(x=>x===doc(1)).length,1);mainland.close();
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
 rankSession.preload(items);await tick();delayed.get(doc(3))();await tick();assert.equal(rankDownloads.length,0,'third metadata response must not take a first-two file slot');delayed.get(doc(1))();delayed.get(doc(2))();await tick();await tick();assert.deepEqual([...new Set(rankDownloads)].sort(),['1','2']);
 await rankSession.research({url:doc(1),autoOcr:false});
 rankSession.preload(items.slice(2));await tick();await tick();
 assert.deepEqual([...new Set(rankDownloads)].sort(),['1','2','3'],'an existing metadata entry gains the released file slot');
 rankSession.preload(items.slice(2));await tick();assert.equal(rankDownloads.filter(x=>x==='3').length,3,'repeat preload must not download the same file again');
 rankSession.close();delayed.get(doc(4))();await tick();assert(!rankDownloads.includes('4'),'closing cancels later speculative transfers');
 let transfers=0;
 const budgeted=createSession(portal,{get:async(url,hops,deadline,body)=>{
  if(!body)return {url,bytes:Buffer.from('var result = '+JSON.stringify({openCateSearchVO:metadata})+';')};
  transfers++;return url.endsWith('.down')?{url,bytes:Buffer.from('%PDF-test')}:{url,bytes:Buffer.from(JSON.stringify({error_code:'00',esbFilePath:'path',esbFileName:'plan.pdf',fileName:'file',isPdf:'Y'}))};
 },extract:async()=>({sourceId:'bounded',format:'pdf',scanComplete:true,pages:[{page:1,text:'사업기간:2026년\n지원대상:청년\n사업비:100만원\n지원내용:이사비 지원'}]})});
 for(let i=1;i<=8;i++){
  const before=transfers;budgeted.preload([{url:doc(i)}]);for(let n=0;n<4;n++)await tick();
  assert.equal(transfers-before,i<=6?3:0,'at most six speculative public files');
  assert.equal((await budgeted.research({url:doc(i),autoOcr:false})).status,'read','prefetch limit must not block required later reads');
 }
 budgeted.close();
 // The same investigation must not repeat a definitive provider failure from prefetch.
 let requestCount=0;
 const providerSession=()=>createSession(portal,{get:async(url,hops,deadline,body)=>{
  if(!body)return {url,bytes:Buffer.from('var result = '+JSON.stringify({openCateSearchVO:metadata})+';')};
  requestCount++;return {url,bytes:Buffer.from(JSON.stringify({error_code:'99',error_msg:'시스템 점검'}))};
 }});
 const failed=providerSession();failed.preload([items[0]]);for(let i=0;i<4;i++)await tick();
 const unavailable=await failed.research({url:doc(1),requestedQuery:'청년 이사비',autoOcr:false});
 assert.equal(unavailable.attempts[0].errorCode,'PROVIDER_MAINTENANCE');assert.equal(requestCount,1);failed.close();
 const refreshed=providerSession();refreshed.preload([items[0]]);await refreshed.research({url:doc(1),autoOcr:false});assert.equal(requestCount,2,'a new investigation must recheck availability');refreshed.close();
 let transientRequests=0;
 const transient=createSession(portal,{get:async(url,hops,deadline,body)=>{
  if(!body)return {url,bytes:Buffer.from('var result = '+JSON.stringify({openCateSearchVO:metadata})+';')};
  if(++transientRequests===1)throw Object.assign(Error('timeout'),{code:'ETIMEDOUT'});
  return url.endsWith('.down')?{url,bytes:Buffer.from('%PDF-test')}:{url,bytes:Buffer.from(JSON.stringify({error_code:'00',esbFilePath:'path',esbFileName:'plan.pdf',fileName:'file',isPdf:'Y'}))};
 },extract:async()=>({format:'pdf',pages:[{page:1,text:'사업비:100만원'}]})});
 transient.preload([items[0]]);for(let i=0;i<4;i++)await tick();
 assert.equal((await transient.research({url:doc(1),autoOcr:false})).status,'read');assert.equal(transientRequests,4,'transient prefetch failure must still perform required transfer');transient.close();
 // A failed transfer frees its reservation before any document is read.
 const earlyRequests=[];let unblock;
 const early=createSession(portal,{get:async(url,hops,deadline,body,signal)=>{
  if(!body)return {url,bytes:Buffer.from('var result = '+JSON.stringify({openCateSearchVO:{...metadata,fileList:[{fileId:url.split('TEST')[1],fileNm:'추진계획.pdf',fileByteNum:100}]}})+';')};
  if(signal.aborted)throw Error('aborted');
  const id=new URLSearchParams(body).get('fileId');
  if(url.endsWith('wonmunFileRequest.ajax')){
   earlyRequests.push(id);
   if(id==='1')return {url,bytes:Buffer.from(JSON.stringify({error_code:'99',error_msg:'시스템 점검'}))};
   if(id==='2')await new Promise((resolve,reject)=>{unblock=resolve;signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});});
  }
  return url.endsWith('.down')?{url,bytes:Buffer.from('%PDF-test')}:{url,bytes:Buffer.from(JSON.stringify({error_code:'00',esbFilePath:'path',esbFileName:'plan.pdf',fileName:'file',isPdf:'Y'}))};
 },extract:async()=>({format:'pdf',pages:[{page:1,text:'사업비:100만원'}]})});
 early.preload(items);for(let i=0;i<8;i++)await tick();
 assert.deepEqual(earlyRequests,['1','2','3'],'failed first file must release a slot to the third; two speculative residents remain bounded');
 unblock();for(let i=0;i<8;i++)await tick();assert(!earlyRequests.includes('4'),'successful prefetched files retain their two resident slots');
 await early.research({url:doc(2),autoOcr:false});early.preload(items.slice(3));for(let i=0;i<8;i++)await tick();assert(earlyRequests.includes('4'),'released slot continues with the later required candidate');early.close();
 let warms=0;
 for(const [name,publicFile,expected] of [['추진계획.hwp',true,1],['참고 지침.hwpx',true,1],['추진계획.hwpx',false,1]]){
  const warmSession=createSession(portal,{warm:()=>warms++,get:async url=>({url,bytes:Buffer.from('var result = '+JSON.stringify({openCateSearchVO:{...metadata,oppSeCd:publicFile?'1':'3',fileList:[{fileId:'warm',fileNm:name,fileByteNum:100}]}})+';')})});
  warmSession.preload([{url:doc(1)}]);await tick();assert.equal(warms,expected,'only public useful HWP metadata should warm the worker');warmSession.close();
 }
 console.log('PASS: rolling two-file reservations, six-file speculative limit, required later reads, cancellation, serial parsing and privacy-filter preservation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
