const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function download(fetcher=fetch){
 const response=await fetcher('https://files.pythonhosted.org/packages/ba/12/1e5497183bdbe782dbb91bad1d0d2297dba4d2831b2652657f7517bfc6df/rapidocr_onnxruntime-1.4.4-py3-none-any.whl',{redirect:'error',signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error('Numeric model package download');
 const chunks=[];let length=0;for await(const chunk of response.body){length+=chunk.length;if(length>16000000)throw Error('Numeric model package size');chunks.push(Buffer.from(chunk));}
 const bytes=Buffer.concat(chunks);if(hash(bytes)!=='971d7d5f223a7a808662229df1ef69893809d8457d834e6373d3854bc1782cbf')throw Error('Numeric model package integrity');return bytes;
}
async function downloadKorean(fetcher=fetch){
 let r=await fetcher('https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv5/rec/korean_PP-OCRv5_rec_mobile.onnx',{redirect:'manual',signal:AbortSignal.timeout(45000)});if([301,302,303,307,308].includes(r.status)){const target=new URL(r.headers.get('location')||'',r.url||'https://www.modelscope.cn');if(target.protocol!=='https:'||target.hostname!=='cdn-lfs-cn-1.modelscope.cn'||target.port||target.username||target.password)throw Error('Korean model redirect');await r.body?.cancel();r=await fetcher(target,{redirect:'error',signal:AbortSignal.timeout(45000)});}
 if(!r.ok)throw Error('Korean model download');
 const chunks=[];let size=0;for await(const c of r.body){size+=c.length;if(size>16000000)throw Error('Korean model size');chunks.push(Buffer.from(c));}const b=Buffer.concat(chunks);if(hash(b)!=='cd6e2ea50f6943ca7271eb8c56a877a5a90720b7047fe9c41a2e541a25773c9b')throw Error('Korean model integrity');return b;
}
if(require.main===module)(async()=>{
 const model=path.join(__dirname,'numeric-model.onnx');if(!fs.existsSync(model)||hash(fs.readFileSync(model))!=='48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b')execFileSync(process.platform==='win32'?'python':'python3',[path.join(__dirname,'prepare-numeric-model.py')],{input:await download(),stdio:['pipe','inherit','inherit'],windowsHide:true});
 const korean=path.join(__dirname,'korean-model.onnx');if(!fs.existsSync(korean)||hash(fs.readFileSync(korean))!=='cd6e2ea50f6943ca7271eb8c56a877a5a90720b7047fe9c41a2e541a25773c9b')fs.writeFileSync(korean,await downloadKorean());console.log('OCR recognition models ready: numeric and Korean');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={download,downloadKorean};
