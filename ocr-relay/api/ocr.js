const path=require('node:path'),{assess}=require('../ocr-quality'),{png,authorize}=require('../request');
let busy=false;

module.exports=async(req,res)=>{
 const reply=(status,value)=>{res.setHeader('Cache-Control','no-store');res.status(status).json(value);};
 if(!authorize(req,res))return;
 let raw,clean;
 try{if(!req.body||JSON.stringify(req.body).length>3900000)throw Error();raw=png(req.body.rawImage);clean=png(req.body.cleanImage);if(raw.width!==clean.width||raw.height!==clean.height)throw Error();}
 catch{return reply(400,{error:'INVALID_IMAGES'});}
 if(busy)return reply(429,{error:'OCR_BUSY'});
 busy=true;let worker;
 try{
  const start=Date.now(),modelPath=path.join(__dirname,'..','ocr-models'),auditTask=require('../remote-audit').read(req.body.rawImage);
  clean.bytes=require('../ocr-region-review').faintGridClean(raw.bytes,clean.bytes);
  worker=await require('tesseract.js').createWorker('kor+eng',1,{langPath:modelPath,cachePath:modelPath,cacheMethod:'none',gzip:false,errorHandler:()=>{}});
  const initMs=Date.now()-start,primaryStart=Date.now();await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});const primary=await worker.recognize(clean.bytes,{},{text:true,tsv:true});
  const primaryMs=Date.now()-primaryStart,remote=await auditTask;let alternate,auditMs,auditExecution,auditSegmentation='3';
  if(remote){alternate={data:{tsv:remote.tsv}};auditMs=remote.auditMs;auditExecution='parallel_function';auditSegmentation=remote.segmentation||'3';}
  else{const auditStart=Date.now();await worker.setParameters({tessedit_pageseg_mode:'3'});alternate=await worker.recognize(raw.bytes,{},{tsv:true});auditMs=Date.now()-auditStart;auditExecution='sequential_fallback';}
  const quality=assess(primary.data.tsv||'',alternate.data.tsv||'');
  const fallback=require('../ocr-numeric-fallback'),tasks=fallback.plan(primary.data,raw.bytes,clean.bytes,alternate.data.tsv),regions=require('../ocr-region-review'),regionPlans=regions.plan(primary.data,raw.bytes,clean.bytes,alternate.data.tsv),allTasks=[...tasks,...regionPlans],numericStart=Date.now();
  // Original fields remain first; the reader continues supplementary crops in the same warm invocation.
  const numericTask=require('../remote-audit').numeric(allTasks.flatMap(t=>t.images),Math.max(0,Math.min(6000,start+28000-Date.now())),allTasks.map(t=>t.mode||'numeric')).then(result=>({result,ms:Date.now()-numericStart}));
  const refined=await require('../ocr-number-review').refine(worker,raw.bytes,clean.bytes,primary.data,alternate.data.tsv||'',raw),numericResult=await numericTask,combined=numericResult.result,numeric=combined?{...combined,results:combined.results.slice(0,tasks.length*2)}:null,supplement=numeric?fallback.apply(refined.text,tasks,numeric.results,refined.corrections):{text:refined.text,corrections:[]},regionResult=combined?{results:combined.results.slice(tasks.length*2)}:null,reviewed=regionResult?regions.apply(supplement.text,regionPlans,regionResult.results,[...refined.corrections,...supplement.corrections]):{text:supplement.text,corrections:[]},text=reviewed.text;quality.numberCorrections=[...refined.corrections,...supplement.corrections,...reviewed.corrections];
  const numericFallback={execution:'overlapped_field_review',status:!tasks.length?'not_needed':numeric?'used':'unavailable',model:numeric?.model||'PP-OCRv4 numeric',koreanStatus:numeric?.koreanStatus||'not_requested',supportStatus:numeric?.supportStatus||'not_needed',checked:numeric?tasks.length:0,passes:numeric?numeric.results.reduce((n,r)=>n+(r.passes||1),0):0,ms:numericResult.ms};
  return reply(200,{text:text.slice(0,14000),truncated:text.length>14000,ocr:{engine:'Tesseract.js 7.0.0',languages:'kor+eng',auditEngine:'Tesseract.js 7.0.0',passes:2+refined.passes,initMs,auditMs,primaryMs,auditExecution,auditSegmentation,numericFallback,regionReview:{status:!regionPlans.length?'not_needed':regionResult?.results.some(r=>r.score>0)?'used':'unavailable',checked:regionResult?regionPlans.length:0,corrections:reviewed.corrections.length,execution:'shared_bounded_batch',ms:numericResult.ms},totalMs:Date.now()-start,quality}});
 }catch{return reply(502,{error:'OCR_FAILED'});}
 finally{if(worker)await worker.terminate().catch(()=>{});busy=false;}
};
