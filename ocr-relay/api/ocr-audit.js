const path=require('node:path'),{png,authorize}=require('../request');
let busy=false;
module.exports=async(req,res)=>{
 const reply=(status,value)=>{res.setHeader('Cache-Control','no-store');res.status(status).json(value);};
 if(!authorize(req,res))return;
 let image;try{image=png(req.body.rawImage);}catch{return reply(400,{error:'INVALID_IMAGES'});}
 if(busy)return reply(429,{error:'OCR_BUSY'});
 busy=true;let worker;
 try{
  const modelPath=path.join(__dirname,'..','ocr-models');
  worker=await require('tesseract.js').createWorker('kor+eng',1,{langPath:modelPath,cachePath:modelPath,cacheMethod:'none',gzip:false,errorHandler:()=>{}});
  const start=Date.now();await worker.setParameters({tessedit_pageseg_mode:'3'});
  const result=await worker.recognize(image.bytes,{},{tsv:true}),tsv=result.data.tsv||'';
  if(Buffer.byteLength(tsv)>2000000)throw Error('TSV limit');
  return reply(200,{engine:'Tesseract.js 7.0.0',tsv,auditMs:Date.now()-start});
 }catch{return reply(502,{error:'OCR_FAILED'});}
 finally{if(worker)await worker.terminate().catch(()=>{});busy=false;}
};
