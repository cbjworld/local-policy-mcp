const https=require('node:https'),{createHash}=require('node:crypto');
const MAX=15*1024*1024,CHUNK=3*1024*1024;
function endpoint(value){const u=new URL(value);if(u.protocol!=='https:'||!u.hostname.endsWith('.vercel.app')||u.username||u.password||u.port||u.search||u.hash||u.pathname!=='/api/seoul')throw Error('Invalid Seoul reader endpoint');return u;}
function part(url,offset,{deadline,signal,relayUrl,token}){return new Promise((resolve,reject)=>{
 const req=https.request(endpoint(relayUrl),{method:'POST',signal,lookup:require('./official-fetch').lookup,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'Accept-Encoding':'identity'}},res=>{
  if(res.statusCode!==200){res.resume();return reject(Object.assign(Error('서울 원문 조회 경로 HTTP '+res.statusCode),{code:'RELAY_HTTP_'+res.statusCode}));}
  const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>CHUNK)req.destroy(Error('Relay chunk limit'));else chunks.push(b);});res.on('aborted',()=>reject(Error('Relay transfer interrupted')));res.on('error',reject);res.on('end',()=>resolve({headers:res.headers,bytes:Buffer.concat(chunks)}));
 });
 const timer=setTimeout(()=>req.destroy(Object.assign(Error('서울 원문 조회 시간 초과'),{code:'ETIMEDOUT'})),Math.max(1,deadline-Date.now()));req.once('close',()=>clearTimeout(timer));req.once('error',reject);req.end(JSON.stringify({url,offset}));
});}
async function read(url,{deadline=Date.now()+25000,signal,relayUrl=process.env.POLICY_SEOUL_RELAY_URL,token=process.env.POLICY_SEOUL_RELAY_TOKEN,request=part}={}){
 endpoint(relayUrl);if(typeof token!=='string'||token.length<32)throw Error('서울 원문 조회 경로 인증 설정이 필요합니다.');
 const chunks=[];let offset=0,total,hash,sourceUrl,type,region;
 do{
  if(Date.now()>=deadline)throw Error('서울 원문 조회 시간 초과');
  const result=await request(url,offset,{deadline,signal,relayUrl,token}),h=result.headers;
  const nextTotal=Number(h['x-policy-total-bytes']),nextOffset=Number(h['x-policy-offset']),nextHash=h['x-policy-sha256'],nextUrl=decodeURIComponent(h['x-policy-source-url']||'');
  const u=require('./official-fetch').validateUrl(nextUrl);
  if(u.hostname!=='opengov.seoul.go.kr'||!Number.isInteger(nextTotal)||nextTotal<0||nextTotal>MAX||nextOffset!==offset||!/^\w{64}$/.test(nextHash||'')||result.bytes.length!==Math.min(CHUNK,nextTotal-offset)||offset&&(!result.bytes.length||nextTotal!==total||nextHash!==hash||nextUrl!==sourceUrl))throw Error('서울 원문 조회 응답 무결성 확인 실패');
  total=nextTotal;hash=nextHash;sourceUrl=nextUrl;type=h['content-type']||'';region=h['x-policy-region'];chunks.push(result.bytes);offset+=result.bytes.length;
 }while(offset<total);
 const bytes=Buffer.concat(chunks);if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('서울 원문 내용 해시 불일치');
 return {url:sourceUrl,type,bytes,transport:{mode:'seoul-region-reader',region}};
}
module.exports={read,endpoint};
