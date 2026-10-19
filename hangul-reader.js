const {fork}=require('node:child_process'),path=require('node:path');
function createReader(start=()=>fork(path.join(__dirname,'extract-hangul.js'),['--worker'],{execArgv:['--max-old-space-size=256'],serialization:'advanced',stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,env:Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))})){
 let worker=null,active=null,idle=null,completed=0,id=0;const queue=[];
 function stop(){clearTimeout(idle);idle=null;const old=worker;worker=null;completed=0;if(old){old.removeAllListeners('message');old.kill();}}
 function fail(message){const jobs=[active,...queue.splice(0)].filter(Boolean);active=null;stop();for(const job of jobs){clearTimeout(job.timer);job.reject(Error(message));}}
 function dispatch(){
  if(active||!queue.length)return;
  clearTimeout(idle);idle=null;active=queue.shift();
  if(!worker){
   try{worker=start();}catch{fail('한글 변환기 실행 불가');return;}
   const child=worker;
   child.on('error',()=>{if(worker===child)fail('한글 변환기 연결 실패');});
   child.on('exit',()=>{if(worker===child)fail('한글 변환기 종료: 형식·메모리 제한을 확인하세요.');});
   child.on('message',message=>{
    if(worker!==child)return;
    if(!active||message?.id!==active.id){fail('한글 변환 응답 불일치');return;}
    const job=active;active=null;clearTimeout(job.timer);
    if(!message.result||!Array.isArray(message.result.pages)||JSON.stringify(message.result).length>1500000){job.reject(Error('한글 문서 추출 실패 또는 출력 제한 초과'));stop();}
    else{job.resolve(message.result);completed++;if(completed>=8)stop();}
    if(queue.length)dispatch();else{child.unref?.();child.channel?.unref();idle=setTimeout(stop,30000);idle.unref();}
   });
  }
  worker.ref?.();worker.channel?.ref();
  const job=active;
  job.timer=setTimeout(()=>fail('한글 문서 추출 30초 제한 초과'),30000);
  try{worker.send({id:job.id,bytes:job.bytes,options:job.options},e=>{if(e&&active===job)fail('한글 변환기 전송 실패');});}catch{fail('한글 변환기 전송 실패');}
 }
 return {read(bytes,options){
  if(!Buffer.isBuffer(bytes)||bytes.length>15*1024*1024)return Promise.reject(Error('한글 문서 15MB 제한 초과'));
  if(queue.length>=2)return Promise.reject(Error('한글 변환 대기 한도 초과'));
  return new Promise((resolve,reject)=>{queue.push({id:++id,bytes,options,resolve,reject});dispatch();});
 },close(){fail('한글 변환기 종료');}};
}
const shared=createReader();module.exports={createReader,read:(bytes,options)=>shared.read(bytes,options)};
