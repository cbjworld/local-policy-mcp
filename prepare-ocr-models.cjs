const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{gunzipSync}=require('node:zlib');
const hashes={kor:'ec1749377d49ac38fb3d3cd05dd5e2a53359d329f359762bc638a81132109992',eng:'5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747'};
(async()=>{const dir=path.join(__dirname,'ocr-models');fs.mkdirSync(dir,{recursive:true});
 for(const [lang,hash] of Object.entries(hashes)){
  const file=path.join(dir,lang+'.traineddata');let bytes=fs.existsSync(file)?fs.readFileSync(file):null;
  if(!bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==hash){
   const r=await fetch(`https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,{signal:AbortSignal.timeout(60000)});
   if(!r.ok)throw Error('OCR 모델 다운로드 실패: '+r.status);
   const packed=Buffer.from(await r.arrayBuffer());if(packed.length>20000000)throw Error('OCR 모델 크기 한도');bytes=gunzipSync(packed,{maxOutputLength:20000000});
   if(crypto.createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('OCR 모델 해시 불일치');fs.writeFileSync(file,bytes);
  }
  console.log('OCR model ready:',lang);
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
