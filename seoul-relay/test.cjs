const assert=require('node:assert/strict'),http=require('node:http'),{createHash}=require('node:crypto'),{createHandler,target}=require('./api/seoul'),client=require('../seoul-relay-client');
const key='test-only-reader-key-not-production-12345',url='https://opengov.seoul.go.kr/section/D123',CHUNK=3*1024*1024;
async function main(){
 for(const bad of ['http://opengov.seoul.go.kr/section/D123','https://evil.go.kr/section/D123','https://opengov.seoul.go.kr.evil.com/section/D123','https://user@opengov.seoul.go.kr/section/D123','https://opengov.seoul.go.kr/user/login','https://opengov.seoul.go.kr/og/com/download.php?uri=https://evil.test/','https://opengov.seoul.go.kr/og/com/download.php?uri=/files/../secret'])assert.throws(()=>target(bad));
 const previousEndpoint=process.env.POLICY_SEOUL_RELAY_URL,previousRead=client.read,signal=new AbortController().signal,deadline=Date.now()+25000;
 try{process.env.POLICY_SEOUL_RELAY_URL='https://reader.vercel.app/api/seoul';client.read=async(value,options)=>{assert.equal(value,url);assert.equal(options.deadline,deadline);assert.equal(options.signal,signal);return {url,bytes:Buffer.from('original')};};assert.equal((await require('../official-fetch').download(url,0,deadline,undefined,signal)).bytes.toString(),'original');}
 finally{client.read=previousRead;if(previousEndpoint===undefined)delete process.env.POLICY_SEOUL_RELAY_URL;else process.env.POLICY_SEOUL_RELAY_URL=previousEndpoint;}
 const bytes=Buffer.alloc(7*1024*1024,65);let fetches=0;
 const server=http.createServer(createHandler({key,fetch:async value=>{fetches++;return {url:value,type:'application/pdf',bytes};}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(value,offset)=>{const r=await fetch(base,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({url:value,offset})});assert.equal(r.status,200);return {headers:Object.fromEntries(r.headers),bytes:Buffer.from(await r.arrayBuffer())};};
 try{
  assert.equal((await fetch(base,{method:'POST',body:'{}'})).status,401);assert.equal(fetches,0);
  assert.equal((await fetch(base)).status,405);
  assert.equal((await fetch(base,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({url:'https://127.0.0.1/secret'})})).status,400);assert.equal(fetches,0);
  const result=await client.read(url,{relayUrl:'https://reader.vercel.app/api/seoul',token:key,request});assert.deepEqual(result.bytes,bytes);assert.equal(fetches,1);assert.equal(result.url,url);
  await assert.rejects(client.read(url,{relayUrl:'https://reader.vercel.app/api/seoul',token:key,request:async(value,offset)=>{const part=await request(value,offset);if(offset)part.headers['x-policy-sha256']='0'.repeat(64);return part;}}),/무결성/);
  await assert.rejects(client.read(url,{relayUrl:'https://reader.vercel.app/api/seoul',token:key,request:async(value,offset)=>{const part=await request(value,offset);part.headers['x-policy-source-url']=encodeURIComponent('https://evil.go.kr/source');return part;}}),/무결성/);
  await assert.rejects(client.read(url,{relayUrl:'https://reader.vercel.app/api/seoul',token:key,request:async()=>({bytes:Buffer.from('wrong'),headers:{'x-policy-total-bytes':'5','x-policy-offset':'0','x-policy-sha256':createHash('sha256').update('right').digest('hex'),'x-policy-source-url':encodeURIComponent(url)}})}),/해시/);
  assert.throws(()=>client.endpoint('https://reader.vercel.app/api/seoul?key=secret'));assert.throws(()=>client.endpoint('https://localhost/api/seoul'));
  console.log('PASS: authenticated fixed Seoul source, unsafe target rejection, 7MB byte parity in 3MB chunks, bounded cache, source-change/hash tampering rejected');
 }finally{await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
