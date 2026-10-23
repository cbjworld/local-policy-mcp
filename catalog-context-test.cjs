const assert=require('node:assert/strict'),{lookup,compact}=require('./catalog-context'),workflow=require('./policy-workflow');
const url='https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=DCTAA12&prdnDt=20260107140719&nstSeCd=B';
const entry={projectId:'one',name:'노인 보청기 지원',institution:'영암군',department:'가족행복과',year:2026,account:'일반회계',budgetVariants:[{amount:13100,unit:'천원'}],budgetRecords:[{source:'https://www.yeongam.go.kr/budget.pdf',page:3,budget:13100,unit:'천원'}],documentCandidates:[{document:{title:'제목 후보',url:url+'#candidate'}}],documents:[{relationship:'same_named_budget_program',document:{title:'2026년 노인 보청기 구입비 지원 계획',institution:'전라남도 영암군',url,role:'plan'},evidence:[{quote:'소요예산 : 13,100천원',page:1,sourceUrl:url+'#fileId=one'}]}]};
const calls=[],search=args=>{calls.push(args);return {coverage:{year:2026},total:1,nextOffset:null,items:[entry]};};
const request=workflow.plan({question:'영암군 노인 보청기 지원 사업 찾아줘',startDate:'20260101',endDate:'20261231'});
const found=lookup(request,search);assert.equal(found.seedDocuments.length,1);assert(calls.every(c=>c.q==='노인 보청기'&&c.institution==='영암군'));
const beyondPage=lookup(request,args=>({total:21,nextOffset:args.linkedOnly?null:20,items:args.linkedOnly?[entry]:Array.from({length:20},(_,i)=>({...entry,projectId:'unlinked'+i,documents:[],documentCandidates:[]}))}));
assert.equal(beyondPage.seedDocuments.length,1,'linked evidence beyond the ordinary first page must survive');assert.equal(beyondPage.items[0].projectId,'one');
assert.equal(compact(found).items[0].documents[0].status,'saved_body_supported_link');assert.equal(compact(found).items[0].documentCandidates[0].status,'title_candidate');
assert.equal(lookup({...request,startDate:'20270101',endDate:'20271231'},search).seedDocuments.length,0);
assert.equal(lookup({...request,broad:true},search).seedDocuments.length,0);
assert.equal(lookup(request,()=>({items:[{...entry,documents:entry.documents.map(d=>({...d,relationship:'explicit_budget_line_reference'}))}],total:1})).seedDocuments.length,0);
assert.equal(lookup(request,()=>{throw Error('index missing')}).searches[0].status,'failed');
const regional=[];lookup(workflow.plan({question:'울산 중구 산후조리비 지원 사업 찾아줘'}),args=>{regional.push(args);return {items:[],total:0};});assert(regional.every(r=>r.institution==='울산광역시 중구'&&r.q==='산후조리비'));
// Saved references are always present, but a fresh body read still goes through the existing reader.
(async()=>{
 let readCount=0;
 const result=await workflow.research({question:'영암군 노인 보청기 지원 사업 찾아줘',queries:['노인 보청기'],startDate:'20260101',endDate:'20261231'},{searchCatalog:search,search:async()=>({items:[],reviewItems:[],relatedDocuments:[],total:0,hasMore:false}),research:async args=>{readCount++;assert.equal(args.url,url);return {status:'download_failed'};}});
 assert.equal(readCount,1);assert.equal(result.coverage.liveSearchDocuments,0);assert.equal(result.coverage.savedSeedDocuments,1);assert.equal(result.investigations[0].result.status,'download_failed');assert.equal(result.catalogEvidence.items.length,1);
 const view=require('./presentation').present('research_policy',result);assert.equal(view.catalogEvidence.items[0].documents.length,1);assert.equal(view.summary.textReadDocuments,0,'saved quotes are not fresh body reads');assert(JSON.stringify(view).length<=24000);
 const crowded={...result,catalogEvidence:{...result.catalogEvidence,items:Array.from({length:10},()=>({...entry,documents:entry.documents.map(d=>({...d,evidence:[{quote:'가'.repeat(10000)}]}))}))}};
 const bounded=require('./presentation').present('research_policy',crowded);assert(JSON.stringify(bounded).length<=24000);assert(bounded.responseSize.omittedCatalogItems>0);
 console.log('PASS: automatic budget-to-document lookup, explicit region, date limits, direct/reference/title separation, offline retention, fresh-reader dispatch and bounded output');
})().catch(error=>{console.error(error);process.exitCode=1;});
