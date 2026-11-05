function configured(env=process.env,fetcher=fetch){
 const url=env.POLICY_BACKGROUND_URL,secret=env.POLICY_BACKGROUND_SECRET;
 if(!url||!secret)return null;
 const base=new URL(url);
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('백그라운드 검색 주소 설정을 확인하세요.');
 const call=async(id,action,options={})=>{
  if(!/^[a-f0-9]{64}$/.test(id))throw Error('검색 ID를 확인하세요.');
  const r=await fetcher(new URL('/jobs/'+id+'/'+action+(options.cursor?'?cursor='+encodeURIComponent(options.cursor):''),base),{method:options.body?'POST':'GET',headers:{authorization:'Bearer '+secret,...(options.body?{'content-type':'application/json'}:{})},...(options.body?{body:JSON.stringify(options.body)}:{}),signal:AbortSignal.timeout(5000)});
  const result=await r.json();
  if(!r.ok)throw Error(result.error==='daily_job_limit'?'백그라운드 검색 일일 작업 한도에 도달했습니다.':result.error==='active_job_limit'?'백그라운드 검색이 혼잡하여 작업을 시작하지 못했습니다.':`백그라운드 검색 응답 오류 (${r.status})`);
  return result;
 };
 return {start:(id,cursors,options={})=>call(id,'start',{body:{cursors,...(options.deferForRateLimit?{deferForRateLimit:true}:{})}}),status:id=>call(id,'status'),pages:(id,cursor)=>call(id,'pages',{cursor})};
}
module.exports={configured};
