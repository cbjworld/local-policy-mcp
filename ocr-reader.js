const path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{fork}=require('node:child_process');let busy=false;
function read(bytes,{page=1}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length>15*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-'||!Number.isInteger(page)||page<1||page>10000)return Promise.reject(Error('OCR은 15MB 이하 PDF의 지정된 한 쪽만 지원합니다.'));
 if(busy)return Promise.reject(Error('다른 OCR 작업이 실행 중입니다. 완료 후 다시 조회하세요.'));
 busy=true;
 return new Promise((resolve,reject)=>{
  let dir,child;
  const cleanup=()=>{if(dir&&path.dirname(path.resolve(dir))===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('policy-ocr-'))try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:2});}catch{}};
  try{dir=fs.mkdtempSync(path.join(os.tmpdir(),'policy-ocr-'));child=fork(path.join(__dirname,'ocr-worker.js'),[],{execArgv:['--max-old-space-size=256'],serialization:'advanced',stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,env:Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','POLICY_PYTHON'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))});}
  catch{busy=false;cleanup();reject(Error('OCR 프로세스 실행 실패'));return;}
  let settled=false;
  const finish=(err,result)=>{if(settled)return;settled=true;clearTimeout(timer);busy=false;child.kill();err?reject(err):resolve(result);};
  const timer=setTimeout(()=>finish(Error('OCR 한 쪽 처리 120초 제한 초과')),120000);
  child.on('error',()=>finish(Error('OCR 프로세스 실행 실패')));child.on('exit',()=>{cleanup();finish(Error('OCR 프로세스 종료'));});
  child.on('message',m=>{const r=m?.result;if(!r||typeof r.text!=='string'||r.text.length>14000||JSON.stringify(r).length>250000)return finish(Error(m?.error||'OCR 출력 형식 한도 초과'));finish(null,r);});
  child.send({bytes,page,dir},e=>{if(e)finish(Error('OCR 입력 전송 실패'));});
 });
}
module.exports={read};
