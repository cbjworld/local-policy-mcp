const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
process.once('message',async({bytes,page,dir})=>{
 let worker;
 try{
  const pdf=path.join(dir,'input.pdf');fs.writeFileSync(pdf,bytes);
  const start=Date.now(),python=process.env.POLICY_PYTHON||(process.platform==='win32'?'python':'python3'),accelerator=require('./ocr-accelerator');
  let acceleration={status:'not_configured'};
  if(accelerator.configured()){
   try{
    const prepared=await promisify(execFile)(python,[path.join(__dirname,'prepare-ocr-page.py'),pdf,String(page),dir,'--transfer'],{timeout:25000,maxBuffer:2200000,windowsHide:true});
    const image=JSON.parse(prepared.stdout),remoteStart=Date.now(),r=await accelerator.read(fs.readFileSync(path.join(dir,'raw-transfer.png')),fs.readFileSync(path.join(dir,'clean-transfer.png')));
    process.send({result:{text:r.text,truncated:r.truncated,ocr:{...r.ocr,...image,remoteMs:Date.now()-remoteStart,runnerProcessingMs:r.ocr.totalMs,totalMs:Date.now()-start,acceleration:{status:'used'}}}});return;
   }catch{acceleration={status:'fallback',reason:'OCR_RUNNER_UNAVAILABLE'};}
  }
  const prepared=await promisify(execFile)(python,[path.join(__dirname,'prepare-ocr-page.py'),pdf,String(page),dir],{timeout:100000,maxBuffer:2200000,windowsHide:true});
  const {alternateTsv,...image}=JSON.parse(prepared.stdout),modelPath=path.join(__dirname,'ocr-models'),initStart=Date.now();
  worker=await require('tesseract.js').createWorker('kor+eng',1,{langPath:modelPath,cachePath:modelPath,cacheMethod:'none',gzip:false,errorHandler:()=>{}});
  const initMs=Date.now()-initStart,primaryStart=Date.now();
  await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});const cleaned=await worker.recognize(path.join(dir,'clean.png'),{},{text:true,tsv:true});
  const primaryMs=Date.now()-primaryStart,quality=require('./ocr-quality').assess(cleaned.data.tsv||'',alternateTsv);
  const refined=await require('./ocr-number-review').refine(worker,path.join(dir,'raw.ppm'),path.join(dir,'clean.png'),cleaned.data,alternateTsv,image);
  const text=refined.text;quality.numberCorrections=refined.corrections;process.send({result:{text:text.slice(0,14000),truncated:text.length>14000,ocr:{engine:'Tesseract.js 7.0.0',languages:'kor+eng',...image,passes:2+refined.passes,initMs,primaryMs,totalMs:Date.now()-start,quality,acceleration}}});
 }catch(e){process.send({error:'OCR 실행 실패: 모델·PDF 변환기·설치 환경을 확인하세요.'});}
 finally{if(worker)await worker.terminate().catch(()=>{});process.disconnect();}
});
