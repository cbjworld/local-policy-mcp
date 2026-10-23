const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module'),{execFileSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'policy-ocr-relay-test-'));execFileSync(process.execPath,[path.join(__dirname,'prepare-ocr-relay.cjs'),dir]);
let calls=0,terminated=0;const original=Module._load;Module._load=function(name,...args){if(name==='tesseract.js')return {createWorker:async()=>({setParameters:async()=>{},recognize:async()=>{calls++;return {data:{text:'사업비 80백만원',tsv:'5\t1\t1\t1\t1\t1\t10\t10\t20\t20\t96\t80백만원'}};},terminate:async()=>{terminated++;}})};return original.call(this,name,...args);};
const handler=require(path.join(dir,'api/ocr.js'));process.env.POLICY_OCR_RELAY_TOKEN='test-credential';
const image=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(image);image.writeUInt32BE(13,8);image.write('IHDR',12);image.writeUInt32BE(100,16);image.writeUInt32BE(100,20);
async function run(body,headers={},method='POST'){let status,value;await handler({method,headers:{authorization:'Bearer test-credential',...headers},body},{setHeader(){},status(n){status=n;return this;},json(v){value=v;}});return {status,value};}
(async()=>{
 assert.equal((await run({}, {},'GET')).status,405);assert.equal((await run({}, {authorization:''})).status,401);assert.equal((await run({}, {authorization:'Bearer 가'.repeat(3)})).status,401);assert.equal((await run({}, {'content-length':'4000000'})).status,413);
 const data={rawImage:image.toString('base64'),cleanImage:image.toString('base64')};assert.equal((await run({...data,rawImage:'abcd'})).status,400);
 const oversized=Buffer.from(image);oversized.writeUInt32BE(3000,16);assert.equal((await run({...data,cleanImage:oversized.toString('base64')})).status,400);
 const success=await run(data);assert.equal(success.status,200);assert.equal(success.value.text,'사업비 80백만원');assert.equal(success.value.ocr.passes,2);assert.equal(calls,2);assert.equal(terminated,1);
 const pair=await Promise.all([run(data),run(data)]);assert.deepEqual(pair.map(x=>x.status).sort(),[200,429]);console.log('PASS: OCR runner authentication, image bounds, payload limits, two passes, isolation and worker cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{Module._load=original;delete process.env.POLICY_OCR_RELAY_TOKEN;const target=path.resolve(dir);if(path.dirname(target)===path.resolve(os.tmpdir())&&path.basename(target).startsWith('policy-ocr-relay-test-'))fs.rmSync(target,{recursive:true,force:true});});
