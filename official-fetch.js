const https=require('node:https'),dns=require('node:dns'),net=require('node:net');
function validateUrl(value){
 if(typeof value!=='string'||value.length>3000)throw new Error('공식 원문 URL이 올바르지 않습니다.');
 const u=new URL(value);
 if(u.protocol!=='https:'||!(u.hostname.endsWith('.go.kr')||['www.gov.kr','gov.kr'].includes(u.hostname))||u.username||u.password||(u.port&&u.port!=='443'))throw new Error('HTTPS .go.kr 또는 정부24 공식 주소만 조회할 수 있습니다.');
 u.hash='';return u;
}
function publicIP(ip){
 if(net.isIP(ip)===6)return /^[23][0-9a-f]{3}:/i.test(ip)&&!/^2001:(?:0:|db8:)/i.test(ip)&&!/^2002:/i.test(ip);
 if(net.isIP(ip)!==4)return false;
 const [a,b]=ip.split('.').map(Number);
 return a>0&&a<224&&![10,127].includes(a)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0))&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19));
}
function lookup(host,options,cb){dns.lookup(host,options,(err,address,family)=>{
 if(err)return cb(err);const ips=Array.isArray(address)?address.map(x=>x.address):[address];
 if(!ips.length||!ips.every(publicIP))return cb(new Error('Non-public address blocked'));
 cb(null,address,family);
});}
async function download(value,hops=0,deadline=Date.now()+25000,body){
 const u=validateUrl(value);if(hops>3||Date.now()>=deadline)throw new Error('공식 원문 연결 시간 또는 이동 횟수 제한에 도달했습니다.');
 const response=await new Promise((resolve,reject)=>{
  const req=https.request(u,{lookup,method:body===undefined?'GET':'POST',headers:{Accept:'text/html,text/plain,application/pdf,application/octet-stream','Accept-Encoding':'identity','User-Agent':'PolicyResearchPrototype/0.2',...(body===undefined?{}:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'})}},res=>{
   if([301,302,303,307,308].includes(res.statusCode)){res.resume();return resolve({redirect:res.headers.location});}
   if(res.statusCode!==200){res.resume();return reject(new Error('원문 HTTP '+res.statusCode));}
   const chunks=[];let size=0;
   res.on('data',b=>{size+=b.length;if(size>15*1024*1024)req.destroy(new Error('size'));else chunks.push(b);});
   res.on('aborted',()=>reject(new Error('원문 전송 중단')));
   res.on('error',()=>reject(new Error('원문 읽기 실패')));
   res.on('end',()=>resolve({url:u.href,type:res.headers['content-type']||'',bytes:Buffer.concat(chunks)}));
  });
  const timer=setTimeout(()=>req.destroy(new Error('timeout')),Math.max(1,deadline-Date.now()));
  req.on('close',()=>clearTimeout(timer));
  req.on('error',()=>reject(new Error('원문 연결 실패 또는 15MB·25초 제한 초과. 인증서 검증은 유지됩니다.')));
  req.end(body);
 });
 if(Object.hasOwn(response,'redirect')){
  if(body!==undefined)throw new Error('POST 이동 응답: 포털에서 직접 확인하세요.');
  if(!response.redirect)throw new Error('원문 이동 주소가 없습니다.');
  return download(new URL(response.redirect,u).href,hops+1,deadline);
 }
 return response;
}
module.exports={validateUrl,publicIP,download};
