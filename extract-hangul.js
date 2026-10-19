'use strict';
const {parseHwp,parseHwpx,parseHwp3}=require('kordoc');
async function convert(bytes,options){
 if(options.page!==1)throw new Error('HWP page selection unsupported');
 if(!Buffer.isBuffer(bytes)||bytes.length>15*1024*1024)throw Error('Document too large');
 const parse=bytes.subarray(0,2).toString()==='PK'?parseHwpx:bytes.subarray(0,17).toString()==='HWP Document File'?parseHwp3:parseHwp;
 const result=await parse(bytes,{ocr:false});
 if(!result.success||!['hwp','hwp3','hwpx'].includes(result.fileType))throw new Error('Unsupported document');
 const text=result.markdown||'';
 if(!text.trim())throw new Error('No readable text');
 // shortcut: no reliable physical page mapping; retain document-level citations until layout mapping is validated.
 const words=options.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
 const matches=!words.length||words.every(w=>text.toLowerCase().includes(w));
 const at=words.length?Math.max(0,text.toLowerCase().indexOf(words[0])-1000):0;
 const excerpt=matches?text.slice(at,at+100000):'';
 return {format:result.fileType.startsWith('hwp')&&result.fileType!=='hwpx'?'hwp':'hwpx',pages:excerpt?[{page:null,text:excerpt,truncated:excerpt!==text}]:[],links:[],parser:'kordoc',parserWarnings:result.warnings||[],warning:'한글 문서에서 추출한 본문입니다. 실제 쪽 번호는 제공하지 않습니다. 표의 병합 셀·단위는 원본과 대조하세요.'};
}
if(process.argv[2]==='--worker')process.on('message',async job=>{
 try{const result=await convert(job.bytes,job.options);if(JSON.stringify(result).length>1500000)throw Error('Output limit');process.send({id:job.id,result});}catch{process.send({id:job.id,error:'Hangul extraction failed'});}
});
else (async()=>{const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;if(size>15*1024*1024)throw Error('Document too large');chunks.push(chunk);}process.stdout.write(JSON.stringify(await convert(Buffer.concat(chunks),JSON.parse(process.argv[2]))));})().catch(()=>{process.stderr.write('Hangul extraction failed');process.exitCode=1;});
