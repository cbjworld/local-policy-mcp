const {createHash}=require('node:crypto');
async function post(endpoint,body,limit,timeout){
 const host=process.env.VERCEL_URL,token=process.env.POLICY_OCR_RELAY_TOKEN;
 if(!host||!token||!/^[a-z0-9][a-z0-9.-]*\.vercel\.app$/i.test(host))return null;
 try{
  const response=await fetch('https://'+host+'/api/'+endpoint,{method:'POST',headers:{authorization:'Bearer '+token,'x-vercel-protection-bypass':createHash('sha256').update(token).digest('hex').slice(0,32),'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error'});
  if(!response.ok||Number(response.headers.get('content-length'))>limit)return null;
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();return null;}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }catch{return null;}
}
async function read(rawImage){
 const result=await post('ocr-audit',{rawImage},2100000,24000);
 return result?.engine==='Tesseract.js 7.0.0'&&typeof result.tsv==='string'&&Buffer.byteLength(result.tsv)<=2000000&&Number.isFinite(result.auditMs)&&result.auditMs>=0&&result.auditMs<=30000?result:null;
}
async function numeric(images,timeout,modes){
 if(timeout<500||!images.length)return null;
 if(modes!==undefined&&(!Array.isArray(modes)||modes.length*2!==images.length||modes.some(x=>!['numeric','korean','percent'].includes(x))))return null;
 const r=await post('numeric',{images,...(modes?{modes,budgetMs:Math.max(500,Math.min(6000,Math.floor(timeout)))}:{})},30000,timeout);
 return ['PP-OCRv4 numeric','PP-OCRv4 numeric + PP-OCRv5 Korean'].includes(r?.model)&&(r.koreanStatus===undefined||['used','unavailable','not_requested'].includes(r.koreanStatus))&&Array.isArray(r.results)&&r.results.length===images.length&&r.results.every(x=>typeof x?.text==='string'&&x.text.length<=64&&Number.isFinite(x.score)&&x.score>=0&&x.score<=1&&(x.koreanText===undefined||typeof x.koreanText==='string'&&x.koreanText.length<=64&&Number.isFinite(x.koreanScore)&&x.koreanScore>=0&&x.koreanScore<=1)&&(x.koreanUnavailable===undefined||typeof x.koreanUnavailable==='boolean')&&(x.passes===undefined||x.passes===1||x.passes===2))?r:null;
}
module.exports={read,numeric};
