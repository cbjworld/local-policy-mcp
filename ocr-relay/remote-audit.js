const {createHash}=require('node:crypto');
async function read(rawImage){
 const host=process.env.VERCEL_URL,token=process.env.POLICY_OCR_RELAY_TOKEN;
 if(!host||!token||!/^[a-z0-9][a-z0-9.-]*\.vercel\.app$/i.test(host))return null;
 try{
  const response=await fetch('https://'+host+'/api/ocr-audit',{method:'POST',headers:{authorization:'Bearer '+token,'x-vercel-protection-bypass':createHash('sha256').update(token).digest('hex').slice(0,32),'content-type':'application/json'},body:JSON.stringify({rawImage}),signal:AbortSignal.timeout(24000),redirect:'error'});
  if(!response.ok||Number(response.headers.get('content-length'))>2100000)return null;
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2100000){await reader.cancel();return null;}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
  const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(result.engine!=='Tesseract.js 7.0.0'||typeof result.tsv!=='string'||Buffer.byteLength(result.tsv)>2000000||!Number.isFinite(result.auditMs)||result.auditMs<0||result.auditMs>30000)return null;
  return result;
 }catch{return null;}
}
module.exports={read};
