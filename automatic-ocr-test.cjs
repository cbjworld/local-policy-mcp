const assert=require('node:assert/strict'),portal=require('./open-portal'),auto=require('./automatic-ocr');
const url='https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=test',full='지원대상: 주민\n지원내용: 처리기 구입비 지원\n사업비: 500만원\n지원금액: 1가구당 10만원\n사업기간: 2026년';
const file={fileId:'image',name:'2026년 음식물처리기 지원 사업 추진계획.pdf',available:true};
const source=(text,page=1)=>({sourceId:'s'+page+text.length,url:url+'#fileId=image',format:'pdf',totalPages:4,scannedThroughPage:4,scanComplete:true,pages:[{page,text}]});
(async()=>{
 const calls=[],budget={remaining:2},attempts=[{status:'no_text',fileId:'image',source:{...source(''),pages:[1,2,3,4].map(page=>({page,text:''}))},assessment:'text_needs_review'}];
 const events=await auto.readMissing({url,file,attempts,budget,question:'음식물처리기 지원',reader:async args=>{calls.push(args);return {status:'read',source:{...source(args.page===1?'결재 표지':full,args.page),ocr:{status:'read'}}};}});
 assert.deepEqual(calls.map(x=>x.page),[1,2]);assert(calls.every(x=>x.ocr===true&&!x.q));assert.equal(budget.remaining,0);assert.deepEqual(events.at(-1).remainingFields,[]);assert.equal(attempts.at(-1).automaticOcr,true);
 const complete=[{status:'read',fileId:'image',source:{...source(full),pages:[{page:1,text:full},{page:2,text:''}]}}];let count=0;
 assert.equal((await auto.readMissing({url,file,attempts:complete,budget:{remaining:2},question:'음식물처리기 지원',reader:async()=>{count++;}})).length,0);assert.equal(count,0);
 for(const assessment of ['form_or_cover','target_mismatch'])assert.equal((await auto.readMissing({url,file,attempts:[{status:'no_text',fileId:'image',source:source(''),assessment}],budget:{remaining:2},reader:async()=>{throw Error('must not read');}})).length,0);
 assert.equal((await auto.readMissing({url,file,attempts:[{status:'no_text',fileId:'image',source:source(''),evidenceScope:'attachment_reference'}],budget:{remaining:2},reader:async()=>{throw Error('must not read');}})).length,0);
 const noBudget=await auto.readMissing({url,file,attempts:[{status:'no_text',fileId:'image',source:source('')}],budget:{remaining:0},reader:async()=>{throw Error('must not read');}});assert.equal(noBudget.length,0);
 const read=[];const reader=async args=>{read.push(args);if(!args.fileId)return{title:file.name.replace('.pdf',''),attachments:[{...file,available:false}]};throw Error('private');};assert.equal((await portal.research({url},reader)).automaticOcr.length,0);assert.equal(read.length,1);
 const mixed=[{status:'read',fileId:'image',source:{...source('사업비: 500만원'),pages:[{page:1,text:'사업비: 500만원'},{page:2,text:''},{page:3,text:'참고'}]}}],mixCalls=[];
 await auto.readMissing({url,file,attempts:mixed,budget:{remaining:2},question:'음식물처리기 지원',reader:async args=>{mixCalls.push(args.page);return{status:'read',source:{...source(full,args.page),ocr:{status:'read'}}};}});assert.deepEqual(mixCalls,[2]);
 const failed=[];const failure=await auto.readMissing({url,file,attempts:[{status:'no_text',fileId:'image',source:source('')}],budget:{remaining:2},reader:async args=>{failed.push(args.page);return{status:'no_text',source:{...source('',args.page),ocr:{status:'failed'}}};}});assert.equal(failed.length,1);assert.equal(failure[0].status,'no_text');
 console.log('PASS: targeted blank-page progression, stop on complete fields, two-page/shared budget, mixed pages, private/reference/form/target exclusions, failed OCR retention');
})().catch(e=>{console.error(e);process.exitCode=1});
