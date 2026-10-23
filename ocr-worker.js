const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
process.once('message',async({bytes,page,dir})=>{
 let worker;
 try{
  const pdf=path.join(dir,'input.pdf');fs.writeFileSync(pdf,bytes);
  const start=Date.now(),python=process.env.POLICY_PYTHON||(process.platform==='win32'?'python':'python3');
  const prepared=await promisify(execFile)(python,[path.join(__dirname,'prepare-ocr-page.py'),pdf,String(page),dir],{timeout:25000,maxBuffer:4096,windowsHide:true});
  const image=JSON.parse(prepared.stdout),prepareMs=Date.now()-start,modelPath=path.join(__dirname,'ocr-models');
  worker=await require('tesseract.js').createWorker('kor+eng',1,{langPath:modelPath,cachePath:modelPath,cacheMethod:'none',gzip:false,errorHandler:()=>{}});
  await worker.setParameters({tessedit_pageseg_mode:'3'});const original=await worker.recognize(path.join(dir,'raw.png'),{},{text:true,tsv:true});
  await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});const cleaned=await worker.recognize(path.join(dir,'clean.png'),{},{text:true,tsv:true});
  const quality=require('./ocr-quality').assess(cleaned.data.tsv||'',original.data.tsv||'');
  const text=cleaned.data.text||'';process.send({result:{text:text.slice(0,14000),truncated:text.length>14000,ocr:{engine:'Tesseract.js 7.0.0',languages:'kor+eng',...image,passes:2,prepareMs,totalMs:Date.now()-start,quality}}});
 }catch(e){process.send({error:'OCR 실행 실패: 모델·PDF 변환기·설치 환경을 확인하세요.'});}
 finally{if(worker)await worker.terminate().catch(()=>{});process.disconnect();}
});
