const path=require('node:path'),{timingSafeEqual}=require('node:crypto'),{assess}=require('../ocr-quality');
let busy=false;
function png(value){
 if(typeof value!=='string'||value.length>2800000||!value.length||value.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Invalid PNG');
 const b=Buffer.from(value,'base64');
 if(b.length<33||!b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))||b.readUInt32BE(8)!==13||b.toString('ascii',12,16)!=='IHDR')throw Error('Invalid PNG');
 const width=b.readUInt32BE(16),height=b.readUInt32BE(20);
 if(width<1||height<1||width>2700||height>2700||width*height>8000000)throw Error('Invalid image bounds');
 return {bytes:b,width,height};
}
module.exports=async(req,res)=>{
 const reply=(status,value)=>{res.setHeader('Cache-Control','no-store');res.status(status).json(value);};
 if(req.method!=='POST')return reply(405,{error:'POST_REQUIRED'});
 const token=process.env.POLICY_OCR_RELAY_TOKEN,authorization=req.headers.authorization||'',expected=Buffer.from('Bearer '+token);
 if(!token||typeof authorization!=='string'||Buffer.byteLength(authorization)!==expected.length||!timingSafeEqual(Buffer.from(authorization),expected))return reply(401,{error:'UNAUTHORIZED'});
 if(Number(req.headers['content-length'])>3900000)return reply(413,{error:'PAYLOAD_LIMIT'});
 let raw,clean;
 try{if(!req.body||JSON.stringify(req.body).length>3900000)throw Error();raw=png(req.body.rawImage);clean=png(req.body.cleanImage);if(raw.width!==clean.width||raw.height!==clean.height)throw Error();}
 catch{return reply(400,{error:'INVALID_IMAGES'});}
 if(busy)return reply(429,{error:'OCR_BUSY'});
 busy=true;let worker;
 try{
  const start=Date.now(),modelPath=path.join(__dirname,'..','ocr-models');
  worker=await require('tesseract.js').createWorker('kor+eng',1,{langPath:modelPath,cachePath:modelPath,cacheMethod:'none',gzip:false,errorHandler:()=>{}});
  const initMs=Date.now()-start,auditStart=Date.now();await worker.setParameters({tessedit_pageseg_mode:'3'});const alternate=await worker.recognize(raw.bytes,{},{tsv:true});
  const auditMs=Date.now()-auditStart,primaryStart=Date.now();await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});const primary=await worker.recognize(clean.bytes,{},{text:true,tsv:true});
  const primaryMs=Date.now()-primaryStart,quality=assess(primary.data.tsv||'',alternate.data.tsv||'');
  const refined=await require('../ocr-number-review').refine(worker,raw.bytes,clean.bytes,primary.data,alternate.data.tsv||'',raw),text=refined.text;quality.numberCorrections=refined.corrections;
  return reply(200,{text:text.slice(0,14000),truncated:text.length>14000,ocr:{engine:'Tesseract.js 7.0.0',languages:'kor+eng',auditEngine:'Tesseract.js 7.0.0',passes:2+refined.passes,initMs,auditMs,primaryMs,totalMs:Date.now()-start,quality}});
 }catch{return reply(502,{error:'OCR_FAILED'});}
 finally{if(worker)await worker.terminate().catch(()=>{});busy=false;}
};
