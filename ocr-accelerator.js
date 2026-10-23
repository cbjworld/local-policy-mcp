function configured(){return !!(process.env.POLICY_OCR_RELAY_URL&&process.env.POLICY_OCR_RELAY_TOKEN);}
async function read(raw,clean){
 const url=new URL(process.env.POLICY_OCR_RELAY_URL);
 if(url.protocol!=='https:'||!url.hostname.endsWith('.vercel.app')||url.port||url.username||url.password||url.pathname!=='/api/ocr'||url.search||url.hash)throw Error('INVALID_OCR_RUNNER');
 const body=JSON.stringify({rawImage:raw.toString('base64'),cleanImage:clean.toString('base64')});if(body.length>3900000)throw Error('OCR_IMAGE_PAYLOAD_LIMIT');
 const token=process.env.POLICY_OCR_RELAY_TOKEN;
 const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'x-vercel-protection-bypass':require('node:crypto').createHash('sha256').update(token).digest('hex').slice(0,32),'content-type':'application/json'},body,signal:AbortSignal.timeout(30000),redirect:'error'});
 if(!response.ok)throw Error('OCR_RUNNER_HTTP_'+response.status);
 const length=Number(response.headers.get('content-length'));if(length>250000)throw Error('OCR_RUNNER_OUTPUT_LIMIT');
 const reader=response.body.getReader(),chunks=[];let bytes=0;try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>250000){await reader.cancel();throw Error('OCR_RUNNER_OUTPUT_LIMIT');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 const r=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(!r||typeof r.text!=='string'||r.text.length>14000||typeof r.truncated!=='boolean'||r.ocr?.engine!=='Tesseract.js 7.0.0'||r.ocr?.passes!==2||r.ocr?.quality?.verification!=='ocr_transcription_only'||!Array.isArray(r.ocr.quality.items)||r.ocr.quality.items.length>120)throw Error('INVALID_OCR_RUNNER_OUTPUT');
 return r;
}
module.exports={configured,read};
