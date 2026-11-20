const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const gov=require('../gov24-snapshot.cjs');
const budget=require('../budget-search');
const portal=require('../open-portal');
const root=__dirname;
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 if(u.pathname==='/api/search'){
  const q=(u.searchParams.get('q')||'').trim(),region=(u.searchParams.get('region')||'').trim(),type=u.searchParams.get('type')||'gov',raw=u.searchParams.get('offset')||'0',offset=Number(raw);
  if(!q||q.length>100||region.length>80||!Number.isSafeInteger(offset)||offset<0||offset>99990||!['gov','budget','portal'].includes(type)||type==='portal'&&offset%10!==0){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({error:'검색어와 검색 조건을 확인해 주세요.'}));}
  try{const args={q,offset,limit:10};if(region)args.institution=region;
   if(type==='portal'&&region){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({error:'정보공개포털 검색은 지역 필터를 지원하지 않습니다. 검색어에 지역명을 함께 입력해 주세요.'}));}
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','');
   const v=type==='portal'?await portal.search({q,startDate:'20200101',endDate:today,page:offset/10+1,scope:'all',purpose:'documents'}):type==='gov'?gov.search(args):budget.search(args);
   const items=v.items.map(x=>type==='gov'?{title:x.title,region:x.institution,url:x.url,date:x.modifiedAt}:type==='portal'?{title:x.title,region:x.institution,department:x.department,url:x.url,date:x.date,disclosure:x.disclosure}:{title:x.name,region:[x.parent,x.parent===x.institution?null:x.institution].filter(Boolean).join(' '),department:x.department,year:x.year,amount:x.budget,unit:x.unit,url:x.source,page:x.page});
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});return res.end(JSON.stringify({items,total:type==='budget'?v.totalCandidateRows:v.total,nextOffset:type==='portal'?(v.hasMore?offset+10:null):v.nextOffset,date:type==='gov'?v.scope?.fetchedAt:null}));
  }catch(e){console.error('search failed:',e.message);res.writeHead(type==='portal'?503:500,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({error:type==='portal'?'정보공개포털 검색에 연결하지 못했습니다. 포털 점검 또는 접속 상태를 확인해 주세요.':'검색을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'}));}
 }
 const file=u.pathname==='/'?'index.html':u.pathname==='/app.js'?'app.js':u.pathname==='/style.css'?'style.css':null;
 if(!file){res.writeHead(404);return res.end('Not found');}
 res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});fs.createReadStream(path.join(root,file)).pipe(res);
});
server.listen(Number(process.env.PORT||4174),process.env.HOST||(process.env.RENDER?'0.0.0.0':'127.0.0.1'),()=>console.log('이웃정책 웹 준비 완료'));
