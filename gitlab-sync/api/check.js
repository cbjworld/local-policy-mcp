module.exports=async(req,res)=>{
 if(req.method!=='GET'){res.statusCode=405;return res.end();}
 const results=[];
 for(const url of ['https://gitlab.aigov.go.kr/','https://gitlab.aigov.go.kr/conicon/local-policy-mcp.git/info/refs?service=git-receive-pack']){
  const started=Date.now();
  try{const response=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'manual'});await response.body?.cancel();results.push({url,status:response.status,ms:Date.now()-started});}
  catch(error){results.push({url,error:error.cause?.code||error.name,ms:Date.now()-started});}
 }
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','public, s-maxage=30');
 let gitAvailable=false;
 try{await require('node:util').promisify(require('node:child_process').execFile)('git',['--version'],{timeout:2000});gitAvailable=true;}catch{}
 res.end(JSON.stringify({region:process.env.VERCEL_REGION||null,gitAvailable,results}));
};
