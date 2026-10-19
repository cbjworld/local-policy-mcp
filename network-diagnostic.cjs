const dns=require('node:dns/promises'),tls=require('node:tls'),net=require('node:net'),{execFile}=require('node:child_process'),{download,publicIP}=require('./official-fetch');
const targets=['https://www.open.go.kr/','https://opengov.seoul.go.kr/section/D0000057368455'];
const log=value=>console.error('NETWORK_DIAG '+JSON.stringify(value));
function handshake(host,address){return new Promise(resolve=>{const start=Date.now();let phase='connect';const socket=tls.connect({host:address,port:443,servername:host,rejectUnauthorized:true}),timer=setTimeout(()=>socket.destroy(Object.assign(Error('timeout'),{code:'ETIMEDOUT'})),8000);let done=false;const end=data=>{if(done)return;done=true;clearTimeout(timer);socket.destroy();resolve({host,address,phase,ms:Date.now()-start,...data});};socket.once('connect',()=>{phase='tls';});socket.once('secureConnect',()=>end({ok:true,tls:socket.getProtocol(),authorized:socket.authorized}));socket.once('error',e=>end({ok:false,code:e.code||e.name}));});}
function python(url){const code="import json,urllib.request,sys\ntry:\n r=urllib.request.urlopen(sys.argv[1],timeout=8); print(json.dumps({'ok':True,'status':r.status,'bytes':len(r.read(256))}))\nexcept Exception as e: print(json.dumps({'ok':False,'errorType':type(e).__name__,'reasonType':type(getattr(e,'reason',None)).__name__}))";return new Promise(resolve=>{execFile(process.env.POLICY_PYTHON||(process.platform==='win32'?'python':'python3'),['-c',code,url],{timeout:10000,windowsHide:true},(error,stdout)=>{try{resolve({mode:'python',url,...JSON.parse(stdout)});}catch{resolve({mode:'python',url,ok:false,code:error?.code||'PARSE_ERROR'});}});});}
async function run(){
 log({runtime:process.version,platform:process.platform,autoSelectFamily:net.getDefaultAutoSelectFamily(),proxyVariables:['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','NODE_USE_ENV_PROXY'].filter(k=>process.env[k])});
 await Promise.all(targets.map(async url=>{
  const host=new URL(url).hostname;let addresses=[];try{addresses=await dns.lookup(host,{all:true});log({host,addresses:addresses.map(x=>publicIP(x.address)?x:{family:x.family,address:'nonpublic'})});}catch(e){log({host,dnsError:e.code});}
  await Promise.all([
   ...addresses.filter(x=>publicIP(x.address)).slice(0,2).map(async x=>log({mode:'tls',...await handshake(host,x.address)})),
   python(url).then(log),
   (async()=>{const start=Date.now();try{const response=await download(url);log({mode:'node',url,ok:true,ms:Date.now()-start,bytes:response.bytes.length,finalUrl:response.url});}catch(e){log({mode:'node',url,ok:false,ms:Date.now()-start,code:e.code,phase:e.phase});}})()
  ]);
 }));
}
module.exports={run};if(require.main===module)run().catch(e=>log({error:e.name}));
