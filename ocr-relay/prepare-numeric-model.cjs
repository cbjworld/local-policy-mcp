const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function download(fetcher=fetch){
 const response=await fetcher('https://files.pythonhosted.org/packages/ba/12/1e5497183bdbe782dbb91bad1d0d2297dba4d2831b2652657f7517bfc6df/rapidocr_onnxruntime-1.4.4-py3-none-any.whl',{redirect:'error',signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error('Numeric model package download');
 const chunks=[];let length=0;for await(const chunk of response.body){length+=chunk.length;if(length>16000000)throw Error('Numeric model package size');chunks.push(Buffer.from(chunk));}
 const bytes=Buffer.concat(chunks);if(hash(bytes)!=='971d7d5f223a7a808662229df1ef69893809d8457d834e6373d3854bc1782cbf')throw Error('Numeric model package integrity');return bytes;
}
if(require.main===module)(async()=>{
 const model=path.join(__dirname,'numeric-model.onnx');if(fs.existsSync(model)&&hash(fs.readFileSync(model))==='48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b')return console.log('Numeric model ready: PP-OCRv4 recognition only');
 execFileSync(process.platform==='win32'?'python':'python3',[path.join(__dirname,'prepare-numeric-model.py')],{input:await download(),stdio:['pipe','inherit','inherit'],windowsHide:true});
})().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={download};
