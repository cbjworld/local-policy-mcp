// One durable object owns one search; an alarm resumes it independently of the MCP server.
const validId = id => /^[a-f0-9]{64}$/.test(id);
const dateOk = s => typeof s === 'string' && /^\d{8}$/.test(s) && !Number.isNaN(Date.parse(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6)}T00:00:00Z`)) && new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6)}T00:00:00Z`).toISOString().slice(0,10).replaceAll('-','') === s;
function splitPeriod(c){
 const ms=s=>Date.parse(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6)}T00:00:00Z`), format=n=>new Date(n).toISOString().slice(0,10).replaceAll('-','');
 const first=ms(c.startDate),last=ms(c.endDate);if(first>=last)return null;
 const mid=first+Math.floor((last-first)/86400000/2)*86400000;
 return [{...c,page:1,endDate:format(mid)},{...c,page:1,startDate:format(mid+86400000)}];
}
function validate(cursors) {
  return Array.isArray(cursors) && cursors.length > 0 && cursors.length <= 6 && cursors.every(c => c && typeof c.q === 'string' && c.q.trim().length > 0 && c.q.length <= 150 && dateOk(c.startDate) && dateOk(c.endDate) && c.startDate <= c.endDate && ['original','all'].includes(c.scope) && Number.isInteger(c.page) && c.page >= 1 && c.page <= 10000);
}
export async function portalPage(c, fetcher = fetch) {
  const params = new URLSearchParams({kwd:c.q,startDate:c.startDate,endDate:c.endDate,insttSeCd:'W,B',rowPage:'10',viewPage:String(c.page),sort:'s'});
  const path = c.scope === 'original' ? 'orginlInfoList.do' : 'infoList.do';
  const res = await fetcher(`https://www.open.go.kr/othicInfo/infoList/${path}?${params}`, {signal:AbortSignal.timeout(15000)});
  if (!res.ok) throw Error(`portal_http_${res.status}`);
  const text = await res.text();
  const match = text.match(/var result\s*=\s*(\{[^\n]+\});/);
  if (!match) throw Error('portal_response_invalid');
  const data = JSON.parse(match[1]);
  if (String(data.code) !== '200' || !Array.isArray(data.rtnList) || !Number.isFinite(Number(data.rtnTotal)) || data.parameterVO?.kwd !== c.q || data.parameterVO?.startDate !== c.startDate || data.parameterVO?.endDate !== c.endDate || (data.parameterVO?.viewPage != null && Number(data.parameterVO.viewPage) !== c.page)) throw Error('portal_response_mismatch');
  if ((Number(data.rtnTotal) > (c.page-1)*10 && !data.rtnList.length) || data.rtnList.some(x=>!x.PRDCTN_INSTT_REGIST_NO||!x.PRDCTN_DT||!x.INSTT_SE_CD)) throw Error('portal_page_incomplete');
  return {total:Number(data.rtnTotal),items:data.rtnList.map(x => ({title:x.INFO_SJ,institution:x.ALL_PROC_INSTT_NM||x.PROC_INSTT_NM,date:x.PRDCTN_DT,disclosure:({'1':'공개','2':'부분공개','3':'비공개','5':'열람제한'})[x.OTHBC_SE_CD]||'미확인',url:'https://www.open.go.kr/othicInfo/infoList/'+(c.scope==='all'?'infoListDetl2.do':'infoListDetl.do')+'?'+new URLSearchParams({prdnNstRgstNo:x.PRDCTN_INSTT_REGIST_NO,prdnDt:x.PRDCTN_DT,nstSeCd:x.INSTT_SE_CD})}))};
}
// The shared gate bounds free-tier traffic across jobs, not merely per process.
export class SearchGate {
  constructor(ctx,env) { this.storage=ctx.storage;this.ctx=ctx;this.env=env; }
  async fetch(request) {
    const kind=new URL(request.url).pathname;
    if (!['/admit','/page','/release','/yield','/inspect'].includes(kind)) return new Response(null,{status:404});
    const id=new URL(request.url).searchParams.get('id');
    if(!validId(id||''))return new Response(null,{status:400});
    const result=await this.storage.transaction(async tx=>{
      const now=Date.now(),day=new Date(now).toISOString().slice(0,10);
      let data=await tx.get('quota'); if (!data || data.day!==day) data={day,jobs:0,pages:0,lastPage:0};
      const nextDay=Date.parse(day+'T00:00:00Z')+86400000+1000;
      const key='active:'+id,active=await tx.get(key);
      const notifyNext=async()=>{
        if(!active||!this.env?.JOBS||!this.ctx?.waitUntil)return;
        const entries=await tx.list({prefix:'waiting:',limit:51});
        const candidate=[...entries].filter(([name,v])=>name!=='waiting:'+id&&now-v.lastSeen<=2400000&&(!v.lastWake||now-v.lastWake>=30000)).sort((a,b)=>a[1].order-b[1].order||a[0].localeCompare(b[0]))[0];
        if(candidate){await tx.put(candidate[0],{...candidate[1],lastWake:now});return candidate[0].slice(8);}
      };
      if(kind==='/inspect'){
        const entries=await tx.list({prefix:'pending:',limit:100});
        const age=v=>typeof v==='number'?v:v.lastSeen,order=v=>typeof v==='number'?v:v.order;
        const pending=[...entries].filter(([,v])=>now-age(v)<=180000).sort((a,b)=>order(a[1])-order(b[1])||a[0].localeCompare(b[0]));
        return {ok:true,position:pending.findIndex(([name])=>name==='pending:'+id)+1,pending:pending.length,pagesToday:data.pages,secondsSinceLastPage:Math.floor((now-data.lastPage)/1000)};
      }
      if(kind==='/release'){
        const ticket=await tx.get('ticket:'+id);
        if(new URL(request.url).searchParams.get('rollback')==='1'&&ticket?.day===day){data.jobs=Math.max(0,data.jobs-1);await tx.put('quota',data);}
        await tx.delete('ticket:'+id);await tx.delete(key);await tx.delete('waiting:'+id);await tx.delete('pending:'+id);await tx.delete('turn:'+id);return {ok:true,wakeId:await notifyNext()};
      }
      if(kind==='/yield'){
        // Keep the admission ticket and saved job; a full waiting list is retried later.
        if(!await tx.get('ticket:'+id))await tx.put('ticket:'+id,{day:null});
        const waitingKey='waiting:'+id;
        if(!await tx.get(waitingKey)&&(await tx.list({prefix:'waiting:',limit:51})).size<50)await tx.put(waitingKey,{order:now,lastSeen:now});
        await tx.delete(key);await tx.delete('pending:'+id);await tx.delete('turn:'+id);return {ok:true,wakeId:await notifyNext()};
      }
      if(kind==='/admit'&&!active){
        const waitingKey='waiting:'+id;
        let queued=await tx.get(waitingKey),isNew=false;
        if(!queued){
          const ticket=await tx.get('ticket:'+id);
          if(!ticket&&data.jobs>=100)return {ok:false,retryAt:nextDay,reason:'daily_job_limit'};
          const backlog=await tx.list({prefix:'waiting:',limit:51});
          if(backlog.size>=50)return {ok:false,retryAt:now+1800000,reason:'backlog_limit'};
          queued={order:now,lastSeen:now};await tx.put(waitingKey,queued);
          if(!ticket){isNew=true;await tx.put('ticket:'+id,{day});data.jobs++;await tx.put('quota',data);}
        }
        else{queued.lastSeen=now;await tx.put(waitingKey,queued);}
        const entries=await tx.list({prefix:'active:',limit:100});
        for(const [name,stamp] of entries)if(now-stamp>14*86400000){await tx.delete(name);await tx.delete('turn:'+name.slice(7));}
        const waiting=await tx.list({prefix:'waiting:',limit:51});
        const first=[...waiting].filter(([,v])=>now-v.lastSeen<=2400000).sort((a,b)=>a[1].order-b[1].order||a[0].localeCompare(b[0]))[0]?.[0];
        if([...entries.values()].filter(stamp=>now-stamp<=14*86400000).length>=20||first!==waitingKey)return {ok:true,waiting:true,retryAt:now+1800000,isNew};
        await tx.delete(waitingKey);await tx.put(key,now);await tx.delete('turn:'+id);
        return {ok:true,waiting:false,isNew};
      }
      if(kind==='/admit')return {ok:true,waiting:false,isNew:false};
      if(kind==='/page'){
        if(!active)return {ok:false,retryAt:now+1800000,reason:'not_admitted'};
        const rawPages=new URL(request.url).searchParams.get('pages');
        if(rawPages!==null){
          if(!/^\d+$/.test(rawPages)||!Number.isSafeInteger(Number(rawPages)))return {ok:false,reason:'invalid_progress'};
          const pages=Number(rawPages),turnKey='turn:'+id;let first=await tx.get(turnKey);
          if(first===undefined){first=pages;await tx.put(turnKey,first);}
          if(pages-first>=10){
            const waiting=await tx.list({prefix:'waiting:',limit:51});
            if([...waiting.values()].some(v=>now-v.lastSeen<=2400000))return {ok:false,reason:'yield_turn'};
          }
        }
        if((data.attempts||0)>=8000)return {ok:false,retryAt:nextDay,reason:'daily_attempt_limit'};
        data.attempts=(data.attempts||0)+1;await tx.put('quota',data);
      }
      if (kind==='/page' && data.pages>=1000) return {ok:false,retryAt:nextDay};
      if (kind==='/page') {
        const pendingKey='pending:'+id;
        const queued=await tx.get(pendingKey),order=typeof queued==='number'?queued:queued?.order;
        await tx.put(pendingKey,{order:order||now,lastSeen:now});
        const pending=await tx.list({prefix:'pending:',limit:100});
        const age=value=>typeof value==='number'?value:value.lastSeen;
        const sequence=value=>typeof value==='number'?value:value.order;
        for(const [name,value] of pending)if(now-age(value)>180000)await tx.delete(name);
        const ordered=[...pending].filter(([,value])=>now-age(value)<=180000).sort((a,b)=>sequence(a[1])-sequence(b[1])||a[0].localeCompare(b[0]));
        const position=ordered.findIndex(([name])=>name===pendingKey);
        if(position!==0||now-data.lastPage<3000)return {ok:false,retryAt:Math.max(now+3000*(Math.max(position,0)+1),data.lastPage+3000)+Math.floor(Math.random()*1000)};
        await tx.delete(pendingKey);
      }
      if(kind==='/page'){data.pages++;data.lastPage=now;}
      await tx.put(key,now);
      await tx.put('quota',data); return {ok:true};
    });
    const {wakeId,...response}=result;
    if(wakeId)this.ctx.waitUntil(Promise.resolve().then(()=>this.env.JOBS.get(this.env.JOBS.idFromName(wakeId)).fetch('https://job.internal/wake',{method:'POST'})).catch(()=>{}));
    return Response.json(response);
  }
}
export class SearchJob {
  constructor(ctx,env) { this.storage=ctx.storage; this.env=env; }
  async scheduleAdmissionRetry(until) {
    await this.storage.transaction(async tx=>{
      const job=await tx.get('job');if(job?.status!=='waiting_admission')return;
      const alarm=await this.storage.getAlarm();
      job.waitingUntil=alarm===null?until:Math.min(alarm,until);
      await tx.put('job',job);await tx.setAlarm(job.waitingUntil);
    });
  }
  async deferForAdmission(job) {
    job.status='waiting_admission';job.needsYield=true;job.waitingUntil=Date.now()+1800000;
    await this.storage.transaction(async tx=>{await tx.put('job',job);await tx.setAlarm(job.waitingUntil);});
    try{
      const gate=this.env.GATE.get(this.env.GATE.idFromName('global'));
      const result=await (await gate.fetch('https://gate.internal/yield?id='+job.id)).json();
      if(result.ok){delete job.needsYield;await this.storage.put('job',job);}
    }catch{}
  }
  async fetch(request) {
    const url = new URL(request.url);
    if(request.method==='POST'&&url.pathname==='/wake'){
      await this.storage.transaction(async tx=>{
        const job=await tx.get('job'),earlier=Date.now()+1000;
        if(job?.status!=='waiting_admission')return;
        const alarm=await this.storage.getAlarm();
        if(alarm!==null&&alarm<=earlier)return;
        job.waitingUntil=earlier;await tx.put('job',job);await tx.setAlarm(earlier);
      });
      return Response.json({ok:true});
    }
    if (request.method === 'POST' && url.pathname === '/start') {
      let input; try { input=await request.json(); } catch { return Response.json({error:'invalid_json'},{status:400}); }
      if (!validate(input.cursors)) return Response.json({error:'invalid_cursors'},{status:400});
      const exists=await this.storage.get('job');
      if (exists) return Response.json({error:'already_started'},{status:409});
      const id=request.headers.get('x-job-id');if(!validId(id||''))return Response.json({error:'invalid_id'},{status:400});
      await this.storage.transaction(async tx => {
        if (await tx.get('job')) throw Error('already_started');
        const waiting=request.headers.get('x-admission-waiting')==='1';
        const waitingUntil=waiting?Date.now()+1800000:null;
        await tx.put('job',{id,cursors:input.cursors,status:waiting?'waiting_admission':'running',...(waiting?{waitingUntil}:{}),pages:0,failures:0,createdAt:Date.now(),updatedAt:Date.now()});
        await tx.setAlarm(waitingUntil||Date.now()+1000);
      });
      return Response.json({status:request.headers.get('x-admission-waiting')==='1'?'waiting_admission':'running'},{status:202});
    }
    if (request.method === 'GET' && url.pathname === '/status') {
      const job=await this.storage.get('job');
      if (!job) return Response.json({error:'not_found'},{status:404});
      if(job.status==='running'&&this.env?.GATE&&job.id){
        try{const r=await this.env.GATE.get(this.env.GATE.idFromName('global')).fetch('https://gate.internal/inspect?id='+job.id);if(r.ok)job.cursors[0]={...job.cursors[0],gateStatus:await r.json()};}catch{}
      }
      return Response.json(job);
    }
    if (request.method === 'GET' && url.pathname === '/pages') {
      const cursor=url.searchParams.get('cursor')||'';
      if (cursor.length>100 || (cursor && !/^page:\d{8}$/.test(cursor))) return Response.json({error:'invalid_cursor'},{status:400});
      const pages=await this.storage.list({prefix:'page:',...(cursor?{startAfter:cursor}:{}),limit:3});
      return Response.json({pages:[...pages.values()],nextCursor:pages.size===3?[...pages.keys()].at(-1):null});
    }
    return Response.json({error:'not_found'},{status:404});
  }
  async alarm() {
    const job=await this.storage.get('job');
    if (!job) return;
    if(job.status==='waiting_admission'){
      try{
        const gate=this.env.GATE.get(this.env.GATE.idFromName('global'));
        if(job.needsYield){
          const yielded=await (await gate.fetch('https://gate.internal/yield?id='+job.id)).json();
          if(!yielded.ok)throw Error('yield_failed');
          delete job.needsYield;await this.storage.put('job',job);
        }
        const permit=await (await gate.fetch('https://gate.internal/admit?id='+job.id)).json();
        if(!permit.ok||permit.waiting){await this.scheduleAdmissionRetry(permit.retryAt||Date.now()+1800000);return;}
        job.status='running';delete job.waitingUntil;await this.storage.put('job',job);
      }catch{await this.scheduleAdmissionRetry(Date.now()+1800000);return;}
    }
    if(job.status!=='running'){
      if(this.env?.GATE&&job.id){try{const r=await this.env.GATE.get(this.env.GATE.idFromName('global')).fetch('https://gate.internal/release?id='+job.id);if(!r.ok)throw Error('release_failed');}catch{await this.storage.setAlarm(Date.now()+300000);}}
      return;
    }
    const c=job.cursors[0];
    try {
      const gate=this.env?.GATE?.get(this.env.GATE.idFromName('global'));
      if (gate) {
        const permit=await (await gate.fetch('https://gate.internal/page?id='+job.id+'&pages='+job.pages)).json();
        if(['not_admitted','yield_turn'].includes(permit.reason)){await this.deferForAdmission(job);return;}
        if (!permit.ok) {job.waitingUntil=permit.retryAt;await this.storage.put('job',job);await this.storage.setAlarm(permit.retryAt);return;}
      }
      const result=await portalPage(c);
      const more=c.page*10<result.total;
      await this.storage.transaction(async tx => {
        const current=await tx.get('job');
        // Replayed alarms cannot commit the same page twice.
        if (JSON.stringify(current.cursors[0]) !== JSON.stringify(c)) return;
        const key='page:'+String(current.pages+1).padStart(8,'0');
        await tx.put(key,{query:c.q,scope:c.scope,startDate:c.startDate,endDate:c.endDate,page:c.page,total:result.total,items:result.items});
        current.pages++; current.failures=0; delete current.lastError; delete current.waitingUntil; current.updatedAt=Date.now();
        current.cursors.shift();
        const split=result.total>100000?splitPeriod(c):null;
        if (split) current.cursors.push(...split);
        else if (more && c.page<10000) current.cursors.push({...c,page:c.page+1});
        else if (more && c.page===10000) current.limitReached=true;
        if (!current.cursors.length) current.status=current.limitReached?'page_limit':'complete';
        await tx.put('job',current);
      });
    } catch (error) {
      job.failures++; job.updatedAt=Date.now(); job.lastError=String(error.message).slice(0,100);
      if(job.failures>=6&&this.env?.GATE&&job.id){await this.deferForAdmission(job);return;}
      await this.storage.put('job',job);
    }
    const next=await this.storage.get('job');
    await this.storage.setAlarm(Date.now()+(next.status!=='running'?1000:next.failures ? Math.min(300000,10000*2**Math.min(next.failures-1,5)) : 3000));
  }
}
export default { async fetch(request, env) {
  if (!env.SEARCH_SECRET || request.headers.get('Authorization') !== `Bearer ${env.SEARCH_SECRET}`) return Response.json({error:'unauthorized'},{status:401});
  const url=new URL(request.url), match=url.pathname.match(/^\/jobs\/([a-f0-9]{64})\/(start|status|pages)$/);
  if (!match || !validId(match[1])) return Response.json({error:'not_found'},{status:404});
  if (match[2]==='start' && request.method==='POST') {
    let input;try{input=await request.clone().json();}catch{return Response.json({error:'invalid_json'},{status:400});}
    if(!validate(input.cursors))return Response.json({error:'invalid_cursors'},{status:400});
    const gate=env.GATE.get(env.GATE.idFromName('global'));
    const admission=await (await gate.fetch('https://gate.internal/admit?id='+match[1])).json();
    if (!admission.ok) return Response.json({error:admission.reason||'daily_job_limit',retryAt:admission.retryAt},{status:429});
    const stub=env.JOBS.get(env.JOBS.idFromName(match[1]));
    const headers=new Headers(request.headers);headers.set('x-job-id',match[1]);headers.set('x-admission-waiting',admission.waiting?'1':'0');
    let result;
    try{result=await stub.fetch(new Request('https://job.internal/start',{method:'POST',headers,body:JSON.stringify(input)}));}
    catch(error){
      if(admission.isNew)try{const status=await stub.fetch('https://job.internal/status');if(status.status===404)await gate.fetch('https://gate.internal/release?id='+match[1]+'&rollback=1');}catch{}
      throw error;
    }
    if(!result.ok&&admission.isNew)await gate.fetch('https://gate.internal/release?id='+match[1]+'&rollback=1');
    return result;
  }
  const stub=env.JOBS.get(env.JOBS.idFromName(match[1]));
  const headers=new Headers(request.headers);headers.set('x-job-id',match[1]);
  return stub.fetch(new Request('https://job.internal/'+match[2]+url.search,{method:request.method,headers,...(request.body?{body:request.body,duplex:'half'}:{})}));
} };
