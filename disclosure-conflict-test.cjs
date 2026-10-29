const assert=require('node:assert/strict'),p=require('./open-portal'),guard=require('./disclosure-conflict'),records=require('./project-document-links.json').links;
const held=records.filter(x=>x.basis==='title_only_disclosure_conflict');
assert.equal(held.length,8);
for(const x of held){assert.equal(x.status,'title_candidate');assert.deepEqual(x.evidence,[{kind:'document_title',quote:x.document.title}]);assert.equal(x.blockedFileIds.length,1);assert(guard.knownConflict(x.document.url,x.blockedFileIds[0]));assert(!guard.knownConflict(x.document.url,'another-public-file'));}
assert(guard.markedPrivate({pages:[{page:1,text:'등록번호 1 결재일자 2026.1.1. 공개구분 비공개(5) 사업비 3만원'}]}));
assert(guard.markedPrivate({pages:[{page:null,text:'공 개 여 부 : 비 공 개 (5, 6)'}]}));
assert(!guard.markedPrivate({pages:[{page:1,text:'공개구분 대국민 공개. 비공개 대상 정보에 대한 설명입니다.'}]}));
assert(!guard.markedPrivate({pages:[{page:1,text:'공개여부 비공개 제도를 설명하는 공개 안내입니다.'}]}));
assert(!guard.markedPrivate({pages:[{page:2,text:'공개구분 비공개(5)'}]}));
const html=r=>({bytes:Buffer.from('var result = '+JSON.stringify(r)+';')}),json=r=>({bytes:Buffer.from(JSON.stringify(r))});
const url='https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=DCTTEST&prdnDt=20260101000000&nstSeCd=B';
const meta={infoSj:'문서',oppSeCd:'1',fileYn:'Y',nstSeCd:'B',urtxtYn:'Y',fileList:[{fileId:'f',fileNm:'plan.pdf',fileSeDc:'첨부'}]};
let transfers=0;
const io={get:async()=>html({openCateSearchVO:meta}),post:async step=>{transfers++;return step.endsWith('.down')?{bytes:Buffer.from('%PDF-test')}:json({error_code:'00',esbFilePath:'p',esbFileName:'x',fileName:'x',isPdf:'N'});},extract:async(_response,args)=>({sourceId:'mock',format:'pdf',pages:[{page:args.page,text:args.page===1?'공개구분 비공개(5)\n사업비 123456원':'사업비 123456원'}]})};
(async()=>{
 for(const args of [{},{q:'사업비'},{page:2},{ocr:true}]){const result=await p.read({url,fileId:'f',...args},io);assert.equal(result.status,'disclosure_conflict');assert(!result.source);assert(!JSON.stringify(result).includes('123456'));}
 const publicIo={...io,extract:async()=>({sourceId:'public',pages:[{page:1,text:'공개구분 공개. 비공개 대상 정보에 대한 설명과 사업비 123456원.'}]})};
 assert.equal((await p.read({url,fileId:'f'},publicIo)).status,'read');
 const imageIo={...io,extract:async()=>({sourceId:'image',format:'pdf',pages:[{page:1,text:''},{page:2,text:'후속쪽 기밀 998877'}]})};
 for(const args of [{q:'기밀'},{page:2}]){const value=await p.read({url,fileId:'f',...args},imageIo);assert.equal(value.status,'disclosure_unverified');assert(!JSON.stringify(value).includes('998877'));}
 const first=await p.read({url,fileId:'f',scanEmptyPdf:true},imageIo);assert.equal(first.status,'no_text');assert(!JSON.stringify(first).includes('998877'));assert.deepEqual(first.source.pages,[{page:1,text:'',truncated:false}]);
 let covers=0;
 const ocrIo={...io,extract:async(_r,args)=>{if(args.page===1&&args.ocr){covers++;return {sourceId:'cover',format:'pdf',pages:[{page:1,text:'공개구분 공개'}],ocr:{status:'read'}};}return {sourceId:'selected',format:'pdf',pages:[{page:args.page,text:args.page===1?'':'선택한 2쪽'}],ocr:args.ocr?{status:'read'}:undefined};}};
 const ocrReader=p.createReader(ocrIo),readSecond=await ocrReader({url,fileId:'f',page:2,ocr:true});assert.equal(readSecond.status,'read');assert.equal(readSecond.coverDisclosureCheck.status,'ocr_no_explicit_private_marker');assert.equal(readSecond.source.pages[0].text,'선택한 2쪽');
 await ocrReader({url,fileId:'f',page:2,ocr:true});assert.equal(covers,1,'one document investigation reuses its OCR cover check');
 const privateCover={...ocrIo,extract:async(_r,args)=>args.page===1?{sourceId:'cover',format:'pdf',pages:[{page:1,text:args.ocr?'공개구분 비공개(5)':'당사자'}],ocr:args.ocr?{status:'read'}:undefined}:{pages:[{page:2,text:'기밀 998877'}]}};
 const failedCover={...ocrIo,extract:async(_r,args)=>({sourceId:'cover',format:'pdf',pages:[{page:args.page,text:''}],ocr:args.ocr?{status:'failed'}:undefined})};
 assert.equal((await p.read({url,fileId:'f',page:2,ocr:true},failedCover)).status,'disclosure_unverified');
 const privateAfterOcr={...privateCover,extract:async(r,args)=>args.page===1&&!args.ocr?{format:'pdf',pages:[{page:1,text:''}]}:privateCover.extract(r,args)};
 const blockedAfterOcr=await p.read({url,fileId:'f',page:2,ocr:true},privateAfterOcr);assert.equal(blockedAfterOcr.status,'disclosure_conflict');assert(!JSON.stringify(blockedAfterOcr).includes('998877'));
 await assert.rejects(p.read({url,fileId:'f',q:'검색',ocr:true},ocrIo),/OCR은 검색어 없이/);
 const blocked=held[0],blockedMeta={...meta,fileList:[{fileId:blocked.blockedFileIds[0],fileNm:'plan.pdf',fileSeDc:'첨부'}]};
 const prior=transfers;const known=await p.read({url:blocked.document.url,fileId:blocked.blockedFileIds[0],page:2},{...io,get:async()=>html({openCateSearchVO:blockedMeta})});assert.equal(known.status,'disclosure_conflict');assert.equal(transfers,prior);
 console.log('PASS: 8 withheld links retain titles only; marked-private source suppressed on read, keyword, page and OCR; public text retained');
})().catch(e=>{console.error(e);process.exitCode=1});
