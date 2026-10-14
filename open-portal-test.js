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
 calls.length=0;v.oppSeCd='3';assert.equal((await p.read({url,fileId:'f'},io)).status,'unavailable');assert.equal(calls.length,0);
 v.oppSeCd='2';v.fileList[0].fileOppYn='N';assert.equal((await p.read({url,fileId:'f'},io)).status,'unavailable');assert.equal(calls.length,0);
 v.oppSeCd='1';let count=0;const blocked={...io,post:async()=>{count++;return json({error_code:'99',error_msg:'provider timeout'});}};
 assert.equal((await p.read({url,fileId:'f'},blocked)).status,'download_failed');assert.equal(count,1);
 count=0;const filterFailure={...io,post:async(step)=>{count++;return step.includes('Filter')?json({error_code:'99',error_msg:'filter failed'}):io.post(step);}};
 assert.equal((await p.read({url,fileId:'f'},filterFailure)).status,'download_failed');assert.equal(count,2);
 assert.equal((await p.read({url,fileId:'f'},{...io,extract:async()=>({pages:[{text:''}]})})).status,'no_text');
 assert.equal((await p.read({url,fileId:'f'},{...io,extract:async()=>{throw Error('conversion failed');}})).status,'extraction_failed');
 const external={...io,get:async()=>html({openCateSearchVO:{...v,oppUrl:'https://opengov.seoul.go.kr/section/test'}})};
 assert.deepEqual((await p.read({url},external)).externalLinks,['https://opengov.seoul.go.kr/section/test']);
 for(const bad of ['https://evil.com/a','https://user@www.open.go.kr/othicInfo/infoList/infoListDetl.do','http://www.open.go.kr/othicInfo/infoList/infoListDetl.do'])await assert.rejects(p.read({url:bad},io));
 console.log('PASS: dates, search failures, pagination, private files, request/filter/download order, provider failure, empty text, URL boundaries');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
