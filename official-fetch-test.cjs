const assert=require('node:assert/strict'),https=require('node:https'),{EventEmitter}=require('node:events'),{download}=require('./official-fetch');
const original=https.request;
(async()=>{try{
 for(const [code,retryable] of [['ECONNRESET',true],['EAI_AGAIN',true],['CERT_HAS_EXPIRED',false]]){
  https.request=()=>{const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{req.emit('error',Object.assign(Error('private network detail'),{code}));req.emit('close');});return req;};
  await assert.rejects(download('https://www.open.go.kr/a'),e=>e.code===code&&e.retryable===retryable&&!e.message.includes('private network detail'));
 }
 for(const [status,retryable] of [[503,true],[403,false],[429,false]]){
  https.request=(url,options,callback)=>{const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{callback({statusCode:status,resume(){}});req.emit('close');});return req;};
  await assert.rejects(download('https://www.open.go.kr/a'),e=>e.code==='HTTP_'+status&&e.retryable===retryable);
 }
 console.log('PASS: sanitized transient error codes; no automatic retry for certificate, permission or rate limits');
}finally{https.request=original;}})().catch(e=>{console.error(e);process.exitCode=1;});
