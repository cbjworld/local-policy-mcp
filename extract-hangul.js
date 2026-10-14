'use strict';
const {parse}=require('kordoc');
async function main(){
 const options=JSON.parse(process.argv[2]);
 if(options.page!==1)throw new Error('HWP page selection unsupported');
 const chunks=[];let size=0;
 for await(const chunk of process.stdin){size+=chunk.length;if(size>15*1024*1024)throw new Error('Document too large');chunks.push(chunk);}
 const result=await parse(Buffer.concat(chunks),{ocr:false});
 if(!result.success||!['hwp','hwp3','hwpx'].includes(result.fileType))throw new Error('Unsupported document');
 const text=result.markdown||'';
 if(!text.trim())throw new Error('No readable text');
 // shortcut: no reliable physical page mapping; retain document-level citations until layout mapping is validated.
 const words=options.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
 const matches=!words.length||words.every(w=>text.toLowerCase().includes(w));
 const at=words.length?Math.max(0,text.toLowerCase().indexOf(words[0])-1000):0;
 const excerpt=matches?text.slice(at,at+100000):'';
 process.stdout.write(JSON.stringify({format:result.fileType.startsWith('hwp')&&result.fileType!=='hwpx'?'hwp':'hwpx',pages:excerpt?[{page:null,text:excerpt,truncated:excerpt!==text}]:[],links:[],parser:'kordoc',parserWarnings:result.warnings||[],warning:'한글 문서에서 추출한 본문입니다. 실제 쪽 번호는 제공하지 않습니다. 표의 병합 셀·단위는 원본과 대조하세요.'}));
}
main().catch(()=>{process.stderr.write('Hangul extraction failed');process.exitCode=1;});
