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
 const shortBase={...base},shortNext={...extra,url:'short-extra'},shortInvestigations=[{candidate:shortBase,result:value('지원대상: 청년\n지원내용: 면접 지원\n사업비:500만원\n사업기간:2026년')}],shortRead=[];
 const shortEvents=await supplement({request:{...request,question:'청년 면접비 찾아줘'},investigations:shortInvestigations,allDocuments:[shortBase,shortNext],byUrl:new Map(),candidates:[shortBase],financialDocuments:[],stageDocuments:[],io:{search:async()=>({items:[],reviewItems:[],relatedDocuments:[],total:0}),research:async args=>{shortRead.push(args.url);return value('지원금액: 1인당 최대 5만원');}}});
 assert.deepEqual(shortRead,['short-extra']);assert(shortEvents[0].missingFields.includes('benefit'));assert(!shortEvents[0].remainingFields.includes('benefit'));assert.equal(shortInvestigations[1].relationshipStatus,'same_business_evidence');
 const known=value('지원대상: 무주택 임차인\n지원내용: 보증료 지원\n사업비:308백만원\n사업기간:2026년');
 const source={sourceId:'ocr',url:'https://a.go.kr/plan',format:'pdf',ocr:{status:'read'},pages:[{page:2,text:'사업비:308백만원'}]};
 known.attempts.push({status:'no_text',fileId:'scan',source:{...source,ocr:undefined,pages:[{page:3,text:''}]}});
 for(const page of [1,2])known.attempts.push({status:'read',fileId:'scan',automaticOcr:true,assessment:'plan_candidate',source:{...source,pages:[{page,text:'계획'}]}});
 const primary={...base,title:'2026년 보증료 지원사업 시행계획'},alternate={...primary,title:'2026년 보증료 지원사업 시행계획 통보',url:'private',disclosure:'비공개',readingDecision:{status:'listed_nonpublic'}};
 const reads=[],budget={remaining:0,supplementRemaining:1},list=[{candidate:primary,result:known}];
 const final=await supplement({request:{...request,question:'보증료 지원 한도',queries:['보증료 지원']},investigations:list,allDocuments:[primary,alternate],byUrl:new Map(),candidates:[primary],financialDocuments:[],stageDocuments:[],ocrBudget:budget,io:{search:async()=>({items:[],reviewItems:[],relatedDocuments:[],total:0}),read:async args=>{reads.push(args);return {status:'read',source:{...source,sourceId:'next',pages:[{page:3,text:'지원금액: 1인당 최대 40만원 한도'}]}};}}});
 assert.equal(reads.length,1);assert.equal(reads[0].page,3);assert.equal(budget.supplementRemaining,0);assert.equal(final.at(-1).purpose,'fill_missing_benefit_next_page');assert(!final.at(-1).remainingFields.includes('benefit'));assert(known.attempts.some(a=>a.source?.sourceId==='next'));assert(known.evidence.fields.budget.excerpts.some(e=>e.quote.includes('308')));
 console.log('PASS: same-name/institution/year/department supplemental lookup, new-page candidate ingestion, private/cross-year rejection, preserved sources, bounded failures');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
