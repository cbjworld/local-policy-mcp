const assert=require('node:assert/strict'),{sameBusiness}=require('./policy-followup'),{supplement}=require('./evidence-followup');
const base={title:'2026년 청년 면접수당 지원사업 추진계획',institution:'테스트시',department:'청년과',url:'primary',documentRole:'plan'};
const extra={...base,title:'2026년 청년 면접수당 지원사업 예산변경',url:'extra',documentRole:'budget'};
assert(sameBusiness(base,extra));
for(const d of [{...extra,institution:'다른시'},{...extra,department:'복지과'},{...extra,title:extra.title.replace('2026','2025')},{...extra,title:'2026년 청년 면접정장 지원사업 예산변경'},{...extra,title:extra.title.replace('2026년 ','')}])assert(!sameBusiness(base,d));
const value=text=>{const attempts=[{status:'read',source:{sourceId:text,url:'https://a.go.kr/'+encodeURIComponent(text),scanComplete:true,pages:[{page:1,text}]}}];return {status:'read',attempts,evidence:require('./evidence').evidence(attempts)};};
async function main(){
 const docs=[base],investigations=[{candidate:base,result:value('지원대상: 청년\n지원내용: 면접수당\n사업비:500만원\n사업기간:2026년')}],read=[],search=[];
 const byUrl=new Map([[base.url,base]]),financialDocuments=[],stageDocuments=[base];
 const request={question:'사업비 구성과 홍보비',queries:['청년 면접수당'],startDate:'20260101',endDate:'20261023'};
 const events=await supplement({request,investigations,allDocuments:docs,byUrl,candidates:[base],financialDocuments,stageDocuments,io:{search:async args=>{search.push(args);return {total:4,hasMore:false,items:[extra,{...extra,url:'wrong',institution:'다른시'},{...extra,url:'old',title:extra.title.replace('2026','2025')},{...extra,url:'private',disclosure:'비공개'}],reviewItems:[],relatedDocuments:[]};},research:async args=>{read.push(args.url);return value('지원금:400만원\n홍보비:100만원');}}});
 assert.deepEqual(read,['extra']);assert.equal(search.length,1);assert.equal(search[0].q,'청년 면접수당 예산');
 assert.equal(events.at(-1).status,'read');assert.deepEqual(events.at(-1).remainingFields,[]);assert.equal(investigations[0].candidate.url,'primary');assert.equal(investigations[1].purpose,'fill_missing_evidence');
 assert(!docs.some(d=>['wrong','old'].includes(d.url)));assert(docs.find(d=>d.url==='private').readingDecision);
 const failed=[];const more=await supplement({request,investigations:[{candidate:base,result:value('본문')}],allDocuments:[base],byUrl:new Map([[base.url,base]]),candidates:[base],financialDocuments:[],stageDocuments:[base],io:{search:async()=>{failed.push(1);throw Error('provider timeout');}}});assert.equal(failed.length,1);assert.equal(more[0].status,'search_failed');
 console.log('PASS: same-name/institution/year/department supplemental lookup, new-page candidate ingestion, private/cross-year rejection, preserved sources, bounded failures');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
