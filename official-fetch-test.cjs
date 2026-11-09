const assert=require('node:assert/strict'),https=require('node:https'),{EventEmitter}=require('node:events'),{download,validateUrl}=require('./official-fetch');
const original=https.request;
(async()=>{try{
 assert.equal(validateUrl('https://www.nowon.kr/path').hostname,'www.nowon.kr');
 for(const url of ['https://not-nowon.kr/path','https://evil.nowon.kr/path','https://www.nowon.kr.evil.com/','http://www.nowon.kr/','https://user@www.nowon.kr/','https://www.nowon.kr:8443/'])assert.throws(()=>validateUrl(url));
 const parsed=await require('./discovery').extract(Buffer.from('<html><a href="/file.pdf">첨부</a><a href="https://evil.nowon.kr/file.pdf">가짜</a></html>'),{url:'https://www.nowon.kr/notice',type:'text/html',page:1});
 assert.deepEqual(parsed.links.map(x=>x.url),['https://www.nowon.kr/file.pdf']);
 const many=Buffer.from('<html>'+Array.from({length:65},(_,i)=>'<a href="/'+i+'">메뉴</a>').join('')+'</html>');
 assert.equal((await require('./discovery').extract(many,{url:'https://www.nowon.kr/',type:'text/html',page:1})).links.length,60);
 assert.equal((await require('./discovery').extract(many,{url:'https://www.nowon.kr/',type:'text/html',page:1,discovery:true})).links.length,65);
 for(const [code,retryable] of [['ECONNRESET',true],['EAI_AGAIN',true],['CERT_HAS_EXPIRED',false]]){
  https.request=()=>{const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{req.emit('error',Object.assign(Error('private network detail'),{code}));req.emit('close');});return req;};
  await assert.rejects(download('https://www.open.go.kr/a'),e=>e.code===code&&e.retryable===retryable&&!e.message.includes('private network detail'));
 }
 for(const [status,retryable] of [[503,true],[403,false],[429,false]]){
  https.request=(url,options,callback)=>{const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{callback({statusCode:status,resume(){}});req.emit('close');});return req;};
  await assert.rejects(download('https://www.open.go.kr/a'),e=>e.code==='HTTP_'+status&&e.retryable===retryable);
 }
 let redirectCalls=0;
 https.request=(url,options,callback)=>{redirectCalls++;const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{callback({statusCode:302,headers:{location:'https://www.gccity.go.kr/next'},resume(){}});req.emit('close');});return req;};
 await assert.rejects(download('https://www.nowon.kr/first',0,Date.now()+25000,undefined,undefined,true),/다른 호스트/);assert.equal(redirectCalls,1);
 const controller=new AbortController(),seen=[];
 https.request=(url,options,callback)=>{
  seen.push({url:url.href,signal:options.signal});const req=new EventEmitter();
  req.end=()=>queueMicrotask(()=>{if(seen.length===1)callback({statusCode:302,headers:{location:'/next'},resume(){}});else{callback(Object.assign(new EventEmitter(),{statusCode:200,headers:{}}));options.signal.addEventListener('abort',()=>{req.emit('error',Object.assign(Error('aborted'),{code:'ABORT_ERR'}));req.emit('close');},{once:true});controller.abort();}req.emit('close');});return req;
 };
 await assert.rejects(download('https://www.open.go.kr/first',0,Date.now()+25000,undefined,controller.signal),e=>e.code==='ABORT_ERR');
 assert.equal(seen.length,2);assert(seen.every(x=>x.signal===controller.signal));assert.equal(seen[1].url,'https://www.open.go.kr/next');
 https.request=()=>{const req=new EventEmitter();req.destroy=e=>{req.emit('error',e);req.emit('close');};req.end=()=>queueMicrotask(()=>{const socket=Object.assign(new EventEmitter(),{connecting:true});req.emit('socket',socket);socket.emit('lookup');socket.emit('connect');socket.emit('secureConnect');});return req;};
 await assert.rejects(download('https://www.open.go.kr/slow',0,Date.now()+20),e=>e.code==='ETIMEDOUT'&&e.phase==='headers');
 const pooled=Object.assign(new EventEmitter(),{connecting:false});
 https.request=(url,options,callback)=>{const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{req.emit('socket',pooled);const response=Object.assign(new EventEmitter(),{statusCode:200,headers:{}});callback(response);response.emit('end');req.emit('close');});return req;};
 for(let i=0;i<20;i++)await download('https://www.open.go.kr/reused');
 for(const event of ['lookup','connect','secureConnect'])assert.equal(pooled.listenerCount(event),0,'no listeners retained on a reused socket');
 pooled.connecting=true;await download('https://www.open.go.kr/closed-before-handshake');
 for(const event of ['lookup','connect','secureConnect'])assert.equal(pooled.listenerCount(event),0,'unfinished handshake listeners removed on close');
 const requests=[];
 https.request=(url,options,callback)=>{requests.push({agent:options.agent,accept:options.headers.Accept,lookup:options.lookup});const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{if(requests.length===1)callback({statusCode:302,headers:{location:'/next'},resume(){}});else{const response=Object.assign(new EventEmitter(),{statusCode:200,headers:{}});callback(response);response.emit('end');}req.emit('close');});return req;};
 await download('https://www.nowon.kr/start',0,Date.now()+25000,undefined,undefined,true,true,true);
 assert.equal(requests.length,2);assert(requests.every(x=>x.agent===false&&x.accept===undefined&&typeof x.lookup==='function'),'safe DNS and request options must persist across same-host redirects');
 console.log('PASS: sanitized transient errors, certificate checks, redirect cancellation and network timeout phase');
}finally{https.request=original;}})().catch(e=>{console.error(e);process.exitCode=1;});
