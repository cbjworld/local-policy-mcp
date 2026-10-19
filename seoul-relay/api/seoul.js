const https=require('node:https'),dns=require('node:dns'),{createHash,timingSafeEqual}=require('node:crypto');
const MAX=15*1024*1024,CHUNK=3*1024*1024;
function target(value){
 if(typeof value!=='string'||value.length>3000)throw Error('Invalid target');
 const u=new URL(value);
 if(u.protocol!=='https:'||u.hostname!=='opengov.seoul.go.kr'||u.port&&u.port!=='443'||u.username||u.password||!/^\/(?:section\/D\d+|sanction\/\d+|sanction\/view\/|og\/com\/download\.php)$/.test(u.pathname))throw Error('Invalid target');
 const uri=u.searchParams.get('uri');if(uri&&(!/^\/(?:files|sites\/default\/files)\//.test(uri)||uri.includes('..')))throw Error('Invalid file path');
 u.hash='';return u;
}
function lookup(host,options,cb){dns.lookup(host,{family:4},(error,address,family)=>{
 if(error)return cb(error);const [a,b]=address.split('.').map(Number);
 if(!(a>0&&a<224&&![10,127].includes(a)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0))&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19))))return cb(Error('Non-public address'));
 cb(null,address,family);
});}
async function fetchSource(value,signal,hops=0,deadline=Date.now()+25000){
 const url=target(value);if(hops>3||Date.now()>=deadline)throw Error('Source deadline');
 const response=await new Promise((resolve,reject)=>{
  const req=https.request(url,{lookup,family:4,signal,headers:{'Accept-Encoding':'identity','User-Agent':'PolicyResearchPrototype/0.2'}},res=>{
   if([301,302,303,307,308].includes(res.statusCode)){res.resume();return resolve({redirect:res.headers.location});}
   if(res.statusCode!==200){res.resume();return reject(Error('Source HTTP '+res.statusCode));}
   const parts=[];let size=0;res.on('data',b=>{size+=b.length;if(size>MAX)req.destroy(Error('File too large'));else parts.push(b);});
   res.on('aborted',()=>reject(Error('Source aborted')));res.on('error',reject);
   res.on('end',()=>resolve({url:url.href,type:res.headers['content-type']||'application/octet-stream',bytes:Buffer.concat(parts)}));
  });
  const timer=setTimeout(()=>req.destroy(Error('Source timeout')),Math.max(1,deadline-Date.now()));req.once('close',()=>clearTimeout(timer));req.once('error',reject);req.end();
 });
 if(response.redirect)return fetchSource(new URL(response.redirect,url).href,signal,hops+1,deadline);
 return response;
}
function createHandler({key=process.env.POLICY_SEOUL_RELAY_TOKEN,fetch=fetchSource}={}){
 // Cache at most two public originals for chunk consistency; never store user credentials or query text.
 const cache=new Map();
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.statusCode=405;return res.end();}
  if(typeof key!=='string'||key.length<32){res.statusCode=503;return res.end('Reader not configured');}
  const supplied=String(req.headers.authorization||''),expected='Bearer '+key;
  if(Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))){res.statusCode=401;return res.end();}
  const controller=new AbortController();req.once('aborted',()=>controller.abort());res.once('close',()=>{if(!res.writableEnded)controller.abort();});
  try{
   let args=req.body;
   if(args===undefined){const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>4096)throw Error('Body too large');parts.push(part);}args=JSON.parse(Buffer.concat(parts).toString());}
   const url=target(args?.url).href,offset=args.offset??0;
   if(!Number.isInteger(offset)||offset<0||offset>=MAX||offset%CHUNK)throw Error('Invalid offset');
   let entry=cache.get(url);
   if(!entry||entry.expires<Date.now()){
    const source=await fetch(url,controller.signal);target(source.url);if(source.bytes.length>MAX)throw Error('File too large');
    entry={...source,hash:createHash('sha256').update(source.bytes).digest('hex'),expires:Date.now()+30000};
    if(cache.size>=2)cache.delete(cache.keys().next().value);cache.set(url,entry);
   }
   if(offset>=entry.bytes.length&&!(offset===0&&entry.bytes.length===0))throw Error('Offset outside file');
   res.setHeader('Content-Type',entry.type);res.setHeader('X-Policy-Source-Url',encodeURIComponent(entry.url));
   res.setHeader('X-Policy-Total-Bytes',String(entry.bytes.length));res.setHeader('X-Policy-Sha256',entry.hash);res.setHeader('X-Policy-Offset',String(offset));res.setHeader('X-Policy-Region',process.env.VERCEL_REGION||'local');
   res.statusCode=200;res.end(entry.bytes.subarray(offset,offset+CHUNK));
  }catch(error){if(!res.headersSent){res.statusCode=/Invalid|Body too/.test(error.message)?400:502;res.end('Official source unavailable');}else res.destroy();}
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.target=target;module.exports.fetchSource=fetchSource;
