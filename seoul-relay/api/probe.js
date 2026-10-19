const {timingSafeEqual}=require('node:crypto'),dns=require('node:dns/promises');
module.exports=async(req,res)=>{
 const key=process.env.POLICY_SEOUL_RELAY_TOKEN,a=Buffer.from(String(req.headers.authorization||'')),b=Buffer.from('Bearer '+key);
 if(!key||key.length<32||a.length!==b.length||!timingSafeEqual(a,b)){res.statusCode=401;return res.end();}
 const results=await Promise.all(['https://www.open.go.kr/','https://opengov.seoul.go.kr/section/D0000057368455'].map(async url=>{
  const host=new URL(url).hostname,start=Date.now();let addresses;try{addresses=await dns.lookup(host,{all:true});}catch(e){addresses=[{error:e.code}];}
  try{const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(8000)});await r.body?.cancel();return {url,addresses,status:r.status,ms:Date.now()-start};}
  catch(e){return {url,addresses,code:e.cause?.code||e.name,ms:Date.now()-start};}
 }));
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({runtime:process.version,region:process.env.VERCEL_REGION,results}));
};
