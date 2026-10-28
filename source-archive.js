const {createHash,createCipheriv,createDecipheriv,randomBytes}=require('node:crypto');
const keyFor=id=>createHash('sha256').update('local-policy-archive-v1:').update(id).digest();
const nameFor=id=>createHash('sha256').update('local-policy-id-v1:').update(id).digest('hex');
function createArchive({account,namespace,token,fetchImpl=fetch}){
 if(!/^[a-f0-9]{32}$/.test(account||'')||!/^[a-f0-9]{32}$/.test(namespace||'')||!token)throw Error('출처 보관 설정을 확인하세요.');
 const base=`https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}/values/`;
 const request=(id,options)=>fetchImpl(base+nameFor(id),{...options,headers:{...options.headers,Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 async function put(id,value){
  const plain=Buffer.from(JSON.stringify(value));if(plain.length>5000000)throw Error('출처 목록이 보관 크기 한도를 초과했습니다.');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyFor(id),iv),body=Buffer.concat([Buffer.from('PSA1'),iv,cipher.update(plain),cipher.final(),cipher.getAuthTag()]);
  const r=await request(id,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body});
  if(!r.ok)throw Error('출처 저장소에 기록하지 못했습니다 (HTTP '+r.status+').');
  let result;try{result=await r.json()}catch{throw Error('출처 저장소의 저장 응답을 확인할 수 없습니다.');}if(result.success!==true)throw Error('출처 저장소가 저장 요청을 거절했습니다.');
 }
 async function get(id){
  const r=await request(id,{method:'GET'});if(r.status===404)throw Error('보관된 출처 목록을 찾지 못했습니다. 잠시 후 다시 확인하세요.');if(!r.ok)throw Error('출처 저장소를 읽지 못했습니다 (HTTP '+r.status+').');
  const size=Number(r.headers.get('content-length'));if(size>5000032)throw Error('출처 목록의 크기가 허용 범위를 넘었습니다.');
  const body=Buffer.from(await r.arrayBuffer());if(body.length<32||body.length>5000032||body.subarray(0,4).toString()!=='PSA1')throw Error('출처 목록의 저장 형식이 올바르지 않습니다.');
  try{const decipher=createDecipheriv('aes-256-gcm',keyFor(id),body.subarray(4,16));decipher.setAuthTag(body.subarray(-16));return JSON.parse(Buffer.concat([decipher.update(body.subarray(16,-16)),decipher.final()]).toString('utf8'));}catch{throw Error('출처 목록을 복호화할 수 없습니다. 검색 ID를 확인하세요.');}
 }
 return {put,get};
}
function configured(){const account=process.env.POLICY_KV_ACCOUNT,namespace=process.env.POLICY_KV_NAMESPACE,token=process.env.POLICY_KV_TOKEN;if(!account&&!namespace&&!token)return null;return createArchive({account,namespace,token});}
module.exports={createArchive,configured};
