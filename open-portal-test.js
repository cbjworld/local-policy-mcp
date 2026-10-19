const assert=require('node:assert/strict'),p=require('./open-portal');
const url='https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=TEST';
const html=r=>({bytes:Buffer.from('var result = '+JSON.stringify(r)+';')});
const json=r=>({bytes:Buffer.from(JSON.stringify(r))});
async function main(){
 for(const args of [{q:'x',startDate:'20260230',endDate:'20261013'},{q:'',startDate:'20260101',endDate:'20261013'},{q:'x',startDate:'20261013',endDate:'20260101'}])await assert.rejects(p.search(args,()=>assert.fail('invalid input requested')));
 const args={q:'청년',startDate:'20260101',endDate:'20261013',scope:'all',purpose:'documents'};
 const r=await p.search(args,async()=>html({code:200,rtnTotal:11,parameterVO:{...args,kwd:args.q},rtnList:[{INFO_SJ:'계획',PRDCTN_INSTT_REGIST_NO:'id',PRDCTN_DT:'20260716',INSTT_SE_CD:'B',OTHBC_SE_CD:'3'}]}));assert.equal(r.hasMore,true);assert.equal(r.items[0].disclosure,'비공개');assert.match(r.items[0].url,/infoListDetl2/);
 await assert.rejects(p.search(args,async()=>html({code:491,rtnList:[],rtnTotal:0})));
 await assert.rejects(p.search(args,async()=>html({code:200,rtnList:[],rtnTotal:0,parameterVO:{...args,q:undefined,kwd:'wrong'}})));
 const v={infoSj:'추진계획',oppSeCd:'1',fileYn:'Y',nstSeCd:'B',urtxtYn:'Y',fileList:[{fileId:'f',fileNm:'plan.hwpx',fileSeDc:'첨부'}]};
 const calls=[];const io={get:async()=>html({openCateSearchVO:v}),post:async(step)=>{calls.push(step);if(step.endsWith('.down'))return {bytes:Buffer.from('PK-test')};return json({error_code:'00',esbFilePath:'server-value',esbFileName:'plan.hwpx',fileName:'generated',isPdf:'N'});},extract:async()=>({sourceId:'test',pages:[{page:null,text:'소요예산 30,000천원'}]})};
 const result=await p.read({url,fileId:'f'},io);assert.equal(result.status,'read');assert.deepEqual(calls,['wonmunFileRequest.ajax','wonmunFileFilter.ajax','wonmunFileDownload.down']);
 assert(p.attachmentScore({name:'추진 계획.pdf'})>p.attachmentScore({name:'공고.hwpx'}));
 for(const failedStage of ['wonmunFileRequest.ajax','wonmunFileFilter.ajax','wonmunFileDownload.down']){
  const stages=[];let failed=false;
  const recovered=await p.read({url,fileId:'f'},{...io,post:async(stage)=>{stages.push(stage);if(stage===failedStage&&!failed){failed=true;throw Object.assign(Error('connection reset'),{code:'ECONNRESET',retryable:true});}return io.post(stage);}});
  assert.equal(recovered.status,'read');assert.equal(recovered.retryCount,1);assert.equal(stages.length,4);assert.equal(stages.filter(s=>s===failedStage).length,2);
  assert.equal(recovered.timings.filter(t=>t.status==='failed').length,1);
 }
 let permanentCalls=0;
 for(const code of ['HTTP_403','ETIMEDOUT','FILE_TOO_LARGE','CERT_HAS_EXPIRED']){
  const permanent=await p.read({url,fileId:'f'},{...io,post:async()=>{permanentCalls++;throw Object.assign(Error('blocked'),{code,retryable:false});}});
  assert.equal(permanent.errorCode,code);assert.equal(permanent.retryCount,0);
 }
 assert.equal(permanentCalls,4);
 let exhaustedCalls=0;
 const exhausted=await p.read({url,fileId:'f'},{...io,post:async()=>{exhaustedCalls++;throw Object.assign(Error('reset'),{code:'ECONNRESET',retryable:true});}});
 assert.equal(exhausted.status,'download_failed');assert.equal(exhausted.retryCount,1);assert.equal(exhaustedCalls,2);
 calls.length=0;v.oppSeCd='3';assert.equal((await p.read({url,fileId:'f'},io)).status,'unavailable');assert.equal(calls.length,0);
 v.oppSeCd='2';v.fileList[0].fileOppYn='N';assert.equal((await p.read({url,fileId:'f'},io)).status,'unavailable');assert.equal(calls.length,0);
 v.oppSeCd='1';let count=0;const blocked={...io,post:async()=>{count++;return json({error_code:'99',error_msg:'provider timeout'});}};
 assert.equal((await p.read({url,fileId:'f'},blocked)).status,'download_failed');assert.equal(count,1);
 count=0;const filterFailure={...io,post:async(step)=>{count++;return step.includes('Filter')?json({error_code:'99',error_msg:'filter failed'}):io.post(step);}};
 assert.equal((await p.read({url,fileId:'f'},filterFailure)).status,'download_failed');assert.equal(count,2);
 assert.equal((await p.read({url,fileId:'f'},{...io,extract:async()=>({pages:[{text:''}]})})).status,'no_text');
 assert.equal((await p.read({url,fileId:'f'},{...io,extract:async()=>{throw Error('conversion failed');}})).status,'extraction_failed');
 // One investigation reuses transport bytes, not extracted pages or another user's disclosure snapshot.
 let gets=0,posts=0,extracts=0;
 const cachedIO={...io,get:async()=>{gets++;return io.get();},post:async step=>{posts++;return io.post(step);},extract:async(response,args)=>{extracts++;return {sourceId:'page-'+args.page,pages:[{page:args.page,text:args.q||'original'}]};}};
 const reader=p.createReader(cachedIO);
 await reader({url});
 assert.equal((await reader({url,fileId:'f',page:1,q:'first'})).source.pages[0].text,'first');
 assert.equal((await reader({url,fileId:'f',page:7,q:'second'})).source.pages[0].page,7);
 assert.equal(gets,1);assert.equal(posts,3);assert.equal(extracts,2);
 const independent=p.createReader(cachedIO);await independent({url,fileId:'f'});
 assert.equal(gets,2);assert.equal(posts,6);
 let retries=0;
 const retryReader=p.createReader({...cachedIO,post:async step=>{if(retries++===0)return json({error_code:'99',error_msg:'provider timeout'});return io.post(step);}});
 assert.equal((await retryReader({url,fileId:'f'})).status,'download_failed');
 assert.equal((await retryReader({url,fileId:'f'})).status,'read');assert.equal(retries,4);
 const invalidReader=p.createReader({...cachedIO,post:async step=>step.endsWith('.down')?{bytes:Buffer.from('<html>error</html>')}:io.post(step)});
 assert.equal((await invalidReader({url,fileId:'f'})).status,'download_failed');
 const twoFiles={...v,fileList:[...v.fileList,{fileId:'g',fileNm:'second.hwpx'}]};
 posts=0;const bounded=p.createReader({...cachedIO,get:async()=>html({openCateSearchVO:twoFiles})});
 for(const fileId of ['f','g','f'])assert.equal((await bounded({url,fileId})).status,'read');
 assert.equal(posts,9); // Only the latest validated file is retained.
 const external={...io,get:async()=>html({openCateSearchVO:{...v,oppUrl:'https://opengov.seoul.go.kr/section/test'}})};
 const selected=[];
 const attachments=[{fileId:'child',name:'아동 보청기 계획.hwp',available:true},{fileId:'sheet',name:'예산.xlsx',available:true},{fileId:'adult',name:'어르신 보청기 계획.hwp',available:true}];
 const picked=await p.research({url,requestedQuery:'어르신 보청기 지원'},async a=>{
  if(!a.fileId)return {title:'보청기 지원계획',attachments};selected.push(a.fileId);return {status:'read',source:{sourceId:'adult',pages:[{page:null,text:'지원대상: 65세 이상 어르신\n사업내용: 구입비 지원\n사업비: 1,000천원\n사업기간: 2026년'}]}};
 });
 assert.deepEqual(selected,['adult']);assert.equal(picked.selectionNotes.length,2);assert.equal(picked.remaining.length,2);assert.equal(picked.evidence.fields.budget.status,'needs_review');
 const mismatch=await p.research({url,requestedQuery:'어르신 보청기'},async a=>a.fileId?{status:'read',source:{sourceId:'child',pages:[{page:null,text:'지원대상: 영유아\n사업비: 999천원'}]}}:{title:'보청기 지원 계획',attachments:[{fileId:'generic',name:'사업계획.hwp',available:true}]});
 assert.equal(mismatch.evidence.fields.budget.status,'unconfirmed');assert.equal(mismatch.relevanceStatus,'supporting_document');assert.equal(mismatch.attempts[0].assessment,'target_mismatch');
 assert.deepEqual((await p.read({url},external)).externalLinks,['https://opengov.seoul.go.kr/section/test']);
 for(const bad of ['https://evil.com/a','https://user@www.open.go.kr/othicInfo/infoList/infoListDetl.do','http://www.open.go.kr/othicInfo/infoList/infoListDetl.do'])await assert.rejects(p.read({url:bad},io));
 console.log('PASS: dates, search failures, pagination, private files, request/filter/download order, provider failure, empty text, URL boundaries');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
