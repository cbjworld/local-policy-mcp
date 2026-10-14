const {download}=require('./official-fetch');
const {readResponse,researchNotice}=require('./discovery');
const base='https://www.open.go.kr';
function embedded(bytes){
 const m=bytes.toString('utf8').match(/var result\s*=\s*(\{[^\n]+\});/);
 if(!m)throw Error('정보공개포털 응답 구조 변경 또는 접근 제한. 포털에서 직접 확인하세요.');
 return JSON.parse(m[1]);
}
function detailUrl(id,date,type,scope){return base+'/othicInfo/infoList/'+(scope==='all'?'infoListDetl2.do':'infoListDetl.do')+'?'+new URLSearchParams({prdnNstRgstNo:id,prdnDt:date,nstSeCd:type});}
function dateValue(s){if(typeof s!=='string'||!/^\d{8}$/.test(s))return false;const iso=s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6);const d=new Date(iso);return !isNaN(d)&&d.toISOString().slice(0,10)===iso;}
async function rawSearch({q,startDate,endDate,page=1,scope='original'}={},get=download){
 if(typeof q!=='string'||!q.trim()||q.length>300||!dateValue(startDate)||!dateValue(endDate)||startDate>endDate||!Number.isInteger(page)||page<1||page>100||!['original','all'].includes(scope))throw Error('검색어, YYYYMMDD 시작·종료일, 페이지 1~100, scope original/all을 확인하세요.');
 const url=base+'/othicInfo/infoList/'+(scope==='original'?'orginlInfoList.do':'infoList.do')+'?'+new URLSearchParams({kwd:q,startDate,endDate,insttSeCd:'W,B',rowPage:'10',viewPage:String(page),sort:'s'});
 const r=embedded((await get(url)).bytes);
 if(String(r.code)!=='200'||!Array.isArray(r.rtnList)||!Number.isFinite(Number(r.rtnTotal)))throw Error('포털 검색 실패: 결과 없음으로 해석하지 마세요.');
 if(r.parameterVO?.kwd!==q||r.parameterVO?.startDate!==startDate||r.parameterVO?.endDate!==endDate)throw Error('포털이 요청한 검색 조건을 반영하지 않았습니다.');
 return {status:'ok',mode:'live-open-portal',url,checkedAt:new Date().toISOString(),q,startDate,endDate,scope,page,total:Number(r.rtnTotal),hasMore:page*10<Number(r.rtnTotal),items:r.rtnList.map(x=>({title:x.INFO_SJ,institution:x.ALL_PROC_INSTT_NM||x.PROC_INSTT_NM,department:x.CHRG_DEPT_NM,date:x.PRDCTN_DT,documentNumber:x.DOC_NO,disclosure:({'1':'공개','2':'부분공개','3':'비공개','5':'열람제한'})[x.OTHBC_SE_CD]||'미확인',url:detailUrl(x.PRDCTN_INSTT_REGIST_NO,x.PRDCTN_DT,x.INSTT_SE_CD,scope)})),warning:'문서 건수이며 사업 건수가 아닙니다. 제목은 본문 근거가 아닙니다. 검색 기간과 공개 범위 밖 문서는 포함되지 않습니다.'};
}
async function post(step,params){
 return download(base+'/util/wonmunUtils/'+step,0,Date.now()+25000,new URLSearchParams(Object.entries(params).filter(([,v])=>v!==undefined&&v!==null)).toString());
}
function unwrap(response){const raw=JSON.parse(response.bytes.toString('utf8'));return raw.modelAndView?.model?.result||raw.result||raw;}
function check(r){
 if(String(r.rtnCode)==='1'||![0,'0','00'].includes(r.error_code))throw Error(String(r.error_msg||r.rtnMessage||'포털 파일 제공 실패').slice(0,1000));
}
async function read({url,fileId,q='',page=1}={},io={get:download,post,extract:readResponse}){
 const u=new URL(url);
 if(u.origin!==base||!['/othicInfo/infoList/infoListDetl.do','/othicInfo/infoList/infoListDetl2.do'].includes(u.pathname)||u.username||u.password||u.href.length>3000)throw Error('정보공개포털의 공식 문서 상세 주소가 필요합니다.');
 if(typeof q!=='string'||q.length>300||!Number.isInteger(page)||page<1||page>10000||fileId!==undefined&&(typeof fileId!=='string'||fileId.length>100))throw Error('첨부 ID·검색어·페이지를 확인하세요.');
 const detail=await io.get(u.href),r=embedded(detail.bytes),v=r.openCateSearchVO;
 if(!v||typeof v.infoSj!=='string'||!v.infoSj)throw Error('문서 상세 정보를 찾지 못했습니다.');
 const files=Array.isArray(v.fileList)?v.fileList:[];
 const eligible=['1','2'].includes(v.oppSeCd)&&v.urtxtYn!=='N'&&v.fileYn==='Y'&&r.downloadRestriction!=='X';
 const attachments=files.map(f=>({fileId:f.fileId,name:f.fileNm,bytes:Number(f.fileByteNum)||null,available:eligible&&(v.oppSeCd==='1'||f.fileOppYn==='Y')&&(v.nstSeCd!=='E'||f.fileSeDc==='본문')}));
 const out={url:u.href,checkedAt:new Date().toISOString(),title:v.infoSj,institution:v.prcsNstNm||v.nstCdNm,department:v.chrgDeptNm,date:v.prdnDt,documentNumber:v.docNo,disclosure:v.dlsrCdNm,attachments,status:'metadata',warning:'목록 확인은 원문 열람이 아닙니다. 예산·계획은 source의 실제 문장으로 확인하세요.'};
 out.externalLinks=typeof v.oppUrl==='string'&&/^https:\/\/opengov\.seoul\.go\.kr\//.test(v.oppUrl)?[v.oppUrl]:[];
 if(fileId===undefined)return out;
 const f=files.find(x=>x.fileId===fileId),a=attachments.find(x=>x.fileId===fileId);
 if(!f||!a.available)return {...out,status:'unavailable',message:'공개 다운로드 대상 첨부가 아닙니다. 포털에서 공개 범위를 확인하세요.'};
 let stage='download';
 try{
  let result=unwrap(await io.post('wonmunFileRequest.ajax',{fileId:f.fileId,esbFileName:f.fileNm,docId:v.docNo,ctDate:v.prdnDt,orgCd:v.nstCd,prdnNstRgstNo:v.prdnNstRgstNo,oppSeCd:v.oppSeCd,isPdf:'N',chrgDeptNm:v.chrgDeptNm}));check(result);
  const p={};
  for(const k of ['prdnNstRgstNo','prdnDt','nstCd','infoSj','chgrNmpn','chrgDeptCd','chrgDeptNm','nstClNm','prsrvPdCd','ndnfFiltrRndabtYn','rceptInsttCd','rceptInsttCdNm'])p[k]=v[k];
  for(const k of ['esbFilePath','esbFileName','fileName','orglPrdnNstCd','isPdf','closegvrnYn','mngrTelno'])p[k]=result[k];
  Object.assign(p,{fileId:f.fileId,orgCd:v.nstCd,orgSeCd:v.nstSeCd,orgNm:v.prcsNstNm,docId:v.docNo,step:'step2'});
  result=unwrap(await io.post('wonmunFileFilter.ajax',p));check(result);
  const params={};for(const k of ['esbFilePath','esbFileName','fileName','isPdf']){if(typeof result[k]!=='string'||!result[k])throw Error('포털 파일 응답 필드 누락');params[k]=result[k];}
  Object.assign(params,{prdnNstRgstNo:v.prdnNstRgstNo,prdnDt:v.prdnDt,fileId:f.fileId,gubun:'esbFilePath'});
  const response=await io.post('wonmunFileDownload.down',params);
  const b=response.bytes;
  if(!(b.subarray(0,5).toString()==='%PDF-'||b.subarray(0,2).toString()==='PK'||b.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex'))||b.subarray(0,17).toString()==='HWP Document File'))throw Error('지원하는 PDF/HWP/HWPX 파일이 아닙니다. 오류 페이지를 본문으로 처리하지 않았습니다.');
  const citation=new URL(u);citation.hash=new URLSearchParams({fileId:f.fileId}).toString();
  stage='extract';
  const source=await io.extract({...response,url:citation.href},{q,page});
  const hasText=source.pages.some(p=>p.text.trim());
  return {...out,status:hasText?'read':'no_text',fileId:f.fileId,fileName:f.fileNm,source,...(hasText?{}:{message:'파일은 내려받았지만 이 범위에서 텍스트를 추출하지 못했습니다. 이미지 문서는 OCR이 필요하며 검색어 미일치일 수도 있습니다.'})};
 }catch(e){return {...out,status:stage==='extract'?'extraction_failed':'download_failed',fileId:f.fileId,message:e.message};}
}
function isForm(name){return /표지/.test(name)||(/서식|신청서|동의서|양식/.test(name)&&!/지침/.test(name));}
function attachmentScore(f){
 return (/추진계획|시행계획|사업계획|예산|방침/.test(f.name)?10:0)+(/\.hwpx?$/i.test(f.name)?2:0)-(isForm(f.name)?20:0);
}
async function research({url,requestedQuery=''}={},reader=read,externalReader=researchNotice){
 if(typeof requestedQuery!=='string'||requestedQuery.length>300)throw Error('검색 목적은 300자 이하 문자열이어야 합니다.');
 const metadata=await reader({url});
 metadata.relevance=require('./relevance').classify(metadata.title,requestedQuery);
 metadata.requestedQuery=requestedQuery;
 const candidates=metadata.attachments.filter(f=>f.available).sort((a,b)=>attachmentScore(b)-attachmentScore(a));
 const attempts=[];
 // shortcut: follow only an explicit Seoul disclosure link, one level; no general website search.
 for(const link of (metadata.externalLinks||[]).slice(0,1)){
  try{
   const external=await externalReader({url:link});
   const noticeText=(external.notice?.pages||[]).map(p=>p.text).join('').replace(/\s+/g,'');
   if(!metadata.title||!noticeText.includes(metadata.title.replace(/\s+/g,'')))throw Error('외부 원문 제목 일치 확인 실패');
   for(const a of external.attachments||[]){
    const hasText=['pdf','hwp','hwpx'].includes(a.source?.format)&&a.source?.pages?.some(p=>p.text.trim());
    attempts.push({url:a.url,fileName:a.title,status:hasText?'read':a.status==='read'?'no_text':a.status,source:a.source,message:a.error,assessment:'external_attachment_needs_review'});
   }
   metadata.externalNotice=external.notice;
  }catch(e){attempts.push({url:link,status:'external_failed',message:e.message});}
 }
 // shortcut: at most three files per document; expose the rest for explicit follow-up.
 for(const file of candidates.slice(0,3)){
  if(isForm(file.name)&&attempts.some(a=>a.status==='read'&&a.assessment==='plan_candidate'))continue;
  let result;try{result=await reader({url,fileId:file.fileId});}catch(e){result={status:'download_failed',message:e.message};}
  if(result.status==='download_failed'&&/시간 초과|timeout|timed out|ECONNRESET|ETIMEDOUT/i.test(result.message||'')){
   const initialFailure=result.message;
   try{result={...await reader({url,fileId:file.fileId}),retryCount:1,initialFailure};}catch(e){result={status:'download_failed',message:e.message,retryCount:1,initialFailure};}
  }
  const text=(result.source?.pages||[]).map(p=>p.text).join('\n').replace(/<[^>]+>/g,' ');
  const form=isForm(file.name);
  const plan=!['legal','ceremony','administration'].includes(metadata.relevance.kind)&&/사업기간|사업개요|사업 개요|소요예산|추진계획|추진 계획|사업비/.test(text);
  attempts.push({...result,fileId:file.fileId,fileName:file.name,assessment:form?'form_or_cover':plan?'plan_candidate':'text_needs_review'});
  const missing=()=>Object.values(require('./evidence').evidence(attempts).fields).some(f=>f.status==='unconfirmed');
  // shortcut: at most two more six-page ranges per PDF; expose remaining pages rather than claiming full reading.
  if(!form&&result.source?.format==='pdf'){
   for(let extra=0;extra<2&&missing()&&result.source?.scanComplete===false;extra++){
    const page=Number(result.source.scannedThroughPage)+1;
    if(!Number.isInteger(page)||page<2||page>result.source.totalPages)break;
    let next;try{next=await reader({url,fileId:file.fileId,page});}catch(e){next={status:'download_failed',message:e.message};}
    attempts.push({...next,fileId:file.fileId,fileName:file.name,startPage:page,assessment:plan?'plan_candidate':'text_needs_review'});
    result=next;
    if(!next.source)break;
   }
  }
  if(result.status==='read'&&!form&&plan&&!missing())break;
 }
 return {metadata,attempts,evidence:require('./evidence').evidence(attempts),relevanceStatus:['legal','ceremony','administration'].includes(metadata.relevance.kind)?'supporting_document':'requires_semantic_review',remaining:candidates.filter(f=>!attempts.some(a=>a.fileId===f.fileId)),status:attempts.some(a=>a.status==='read')?'read':candidates.length||attempts.length?'unreadable':'no_available_attachment',warning:'첨부명과 본문 단서로 최대 3개를 확인했습니다. 명시된 서울시 공개문서 링크는 한 단계 따라갑니다. plan_candidate는 의미 검증 완료가 아닙니다. 양식·표지 및 예산 단위·연도를 확인하세요. 이미지 PDF는 OCR 미지원입니다.'};
}
async function search(args={},get=download){
 const {purpose='projects',...query}=args;
 if(!['projects','documents'].includes(purpose))throw Error('purpose projects/documents를 확인하세요.');
 return require('./relevance').screen(await rawSearch(query,get),purpose);
}
module.exports={search,read,research,attachmentScore,isForm};
