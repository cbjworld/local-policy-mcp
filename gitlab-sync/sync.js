const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),git=require('isomorphic-git');
const SOURCE='https://github.com/cbjworld/local-policy-mcp.git';
const DESTINATION='https://gitlab.aigov.go.kr/conicon/local-policy-mcp.git';
function allowedRequest(url,method,headers={}){
 const u=new URL(url),source=u.origin==='https://github.com',destination=u.origin==='https://gitlab.aigov.go.kr';
 const prefix=source?'/cbjworld/local-policy-mcp.git':destination?'/conicon/local-policy-mcp.git':null;
 if(!prefix||u.username||u.password||u.hash)throw Error('UNEXPECTED_REMOTE');
 const endpoint=u.pathname.slice(prefix.length);
 if(!u.pathname.startsWith(prefix)||!((method==='GET'&&endpoint==='/info/refs'&&['git-upload-pack','git-receive-pack'].includes(u.searchParams.get('service')))||(method==='POST'&&((source&&endpoint==='/git-upload-pack')||(destination&&endpoint==='/git-receive-pack')))))throw Error('UNEXPECTED_REMOTE');
 if(source&&Object.keys(headers).some(k=>k.toLowerCase()==='authorization'))throw Error('CREDENTIAL_DESTINATION_BLOCKED');
 return true;
}
function httpClient(deadline,fetcher=fetch){
 let received=0;
 return {async request({url,method='GET',headers={},body}){
  allowedRequest(url,method,headers);
  const left=deadline-Date.now();if(left<=0)throw Error('SYNC_DEADLINE');
  const requestBody=body?(async function*(){for await(const chunk of body)yield chunk;})():undefined;
  const r=await fetcher(url,{method,headers,redirect:'manual',signal:AbortSignal.timeout(left),...(requestBody?{body:requestBody,duplex:'half'}:{})});
  if(r.status>=300&&r.status<400){await r.body?.cancel();throw Error('REDIRECT_BLOCKED');}
  return {url,method,statusCode:r.status,statusMessage:r.statusText,headers:Object.fromEntries(r.headers),body:(async function*(){if(r.body)for await(const chunk of r.body){received+=chunk.length;if(received>128*1024*1024)throw Error('SYNC_DOWNLOAD_LIMIT');yield chunk;}})()};
 }};
}
async function synchronize(expected,token,{driver=git,http=httpClient(Date.now()+240000)}={}){
 if(!/^[a-f0-9]{40}$/.test(expected))throw Error('INVALID_COMMIT');
 const onAuth=url=>{if(url!==DESTINATION)throw Error('CREDENTIAL_DESTINATION_BLOCKED');return {username:'oauth2',password:token};};
 const remote=async()=>{
  const refs=await driver.listServerRefs({http,url:DESTINATION,forPush:true,protocolVersion:1,onAuth});
  const oid=refs.find(r=>r.ref==='refs/heads/main')?.oid;
  if(!/^[a-f0-9]{40}$/.test(oid||''))throw Error('INVALID_REMOTE_MAIN');return oid;
 };
 const previous=await remote();
 if(previous===expected)return {status:'already_current',commit:expected};
 const temporaryRoot=path.resolve(os.tmpdir());
 const dir=await fs.promises.mkdtemp(path.join(temporaryRoot,'policy-gitlab-sync-'));
 try{
  // shortcut: a 64-commit window bounds ephemeral storage; larger gaps require a direct resync.
  await driver.clone({fs,http,dir,url:SOURCE,ref:'main',singleBranch:true,noCheckout:true,noTags:true,depth:64});
  const current=await driver.resolveRef({fs,dir,ref:'refs/heads/main'});
  if(current!==expected)return {status:'superseded',requested:expected,sourceCommit:current};
  if(!await driver.isDescendent({fs,dir,oid:current,ancestor:previous,depth:-1}))throw Error('NON_FAST_FORWARD_OR_HISTORY_GAP');
  const messages=[];
  try{await driver.push({fs,http,dir,url:DESTINATION,ref:'main',remoteRef:'main',force:false,onAuth,onMessage:message=>{if(messages.join('').length<2000)messages.push(String(message));}});}
  catch(error){if(error.code==='GitPushError'){const reason=[...messages,error.data?.result?.error,error.data?.result?.refs?.['refs/heads/main']?.error].filter(Boolean).join(' ');error.safePushReason=reason.split(token).join('[redacted]').split(Buffer.from('oauth2:'+token).toString('base64')).join('[redacted]').replace(/https?:\/\/\S+|glpat-[\w-]+/g,'[redacted]').replace(/[\r\n\x00-\x1f]/g,' ').slice(0,600);}throw error;}
  if(await remote()!==current)throw Error('PUSH_VERIFICATION_FAILED');
  return {status:'synchronized',previous,commit:current};
 }finally{if(path.dirname(path.resolve(dir))!==temporaryRoot||!path.basename(dir).startsWith('policy-gitlab-sync-'))throw Error('INVALID_TEMP_PATH');await fs.promises.rm(dir,{recursive:true,force:true});}
}
module.exports={synchronize,allowedRequest,httpClient,SOURCE,DESTINATION};
