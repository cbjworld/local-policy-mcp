const assert=require('node:assert/strict');
const {evidenceMap}=require('./project-bundles');
const {documentKey}=require('./project-bundles');
const original='https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=DCT123&prdnDt=20260101&nstSeCd=W';
const metadata=original.replace('infoListDetl.do','infoListDetl2.do')+'&kwd=anything';
assert.equal(documentKey(original),documentKey(metadata));
assert.notEqual(documentKey(original),documentKey(metadata.replace('20260101','20260102')));
assert.notEqual(documentKey(original),documentKey(metadata.replace('www.open.go.kr','example.go.kr')));
const dual=evidenceMap([{title:'2026년 산후조리비 지원계획',institution:'A',url:original},{title:'2026년 산후조리비 지원계획',institution:'A',url:metadata}],[{candidate:{url:metadata},result:{status:'read'}}]);
assert.equal(dual[0].stages[0].documents.length,1);
assert.equal(dual[0].stages[0].documents[0].readingStatus,'read');
const docs=[
 {title:'2026년 산후조리비 지원사업 추진계획',institution:'A',url:'plan'},
 {title:'2026년 산후조리비 지원사업 보조금 교부',institution:'A',url:'grant'},
 {title:'2026년 산후조리비 지원사업 집행잔액 반납',institution:'A',url:'settlement'},
 {title:'2025년 산후조리비 지원사업 추진계획',institution:'A',url:'previous'},
 {title:'2026년 산후조리비 지원사업 계획',institution:'B',url:'other'},
 {title:'산후조리비 지원사업 계획',institution:'A',url:'unknown1'},
 {title:'산후조리비 지원사업 계획',institution:'A',url:'unknown2'}
];
const groups=evidenceMap([...docs,docs[0]],[{candidate:docs[0],result:{status:'read'}}]);
assert.equal(groups.length,5);
assert.equal(groups[0].stages.length,3);
assert.equal(groups[0].stages[0].documents[0].readingStatus,'read');
assert.deepEqual(groups[0].missingStages,['budget']);
assert.equal(groups[0].stages[1].documents[0].readingStatus,'not_attempted');
assert.match(groups[0].relationship,/not_confirmed/);
const compact=require('./presentation').present('research_policy',{candidates:docs,financialDocuments:[],evidenceMap:groups});
assert.equal(compact.evidenceMap[0].stages[1].documentIds[0],'d2');
assert(JSON.stringify(compact).length<=24000);
const many=Array.from({length:300},(_,i)=>({...docs[0],url:'url'+i,institution:'기관'+i,title:docs[0].title+'x'.repeat(500)}));
const small=require('./presentation').present('research_policy',{candidates:many,evidenceMap:evidenceMap(many)});
assert(JSON.stringify(small).length<=24000);
const ids=new Set(small.documents.map(d=>d.id));
for(const g of small.evidenceMap)for(const s of g.stages)for(const id of s.documentIds)assert(ids.has(id));
const readDoc={title:'2026년 산후조리비 지원 계획',url:'read-first',institution:'A'};
const crowded=require('./presentation').present('research_policy',{candidates:[readDoc,...many],investigations:[{candidate:readDoc,result:{status:'read',evidence:{fields:{budget:{status:'needs_review',excerpts:[{quote:'소요예산: 100천원',url:'read-first',page:2}]}}}}}]});
assert(crowded.documents.find(d=>d.url==='read-first').reading.fields.find(f=>f.key==='budget').evidence.some(e=>e.quote==='소요예산: 100천원'));
assert(crowded.reviewGuidance);
assert.equal(crowded.documents.find(d=>d.url==='read-first').reading.reviewGuidance,undefined);
assert.equal(crowded.documents.find(d=>d.url==='read-first').reading.note,undefined);
assert(crowded.responseSize.omittedDocuments>0);
assert.equal(crowded.responseSize.omittedReadingDetails,0);
(async()=>{
 const result=await require('./policy-workflow').research({question:'산후조리비',queries:['산후조리비']},{search:async()=>({total:3,hasMore:false,items:[...docs,{title:'2026년 반려동물 의료비 지원사업 집행잔액 반납',url:'unrelated',institution:'A'}],reviewItems:[],relatedDocuments:[]})});
 assert(result.evidenceMap.some(g=>g.stages.some(s=>s.role==='allocation_or_deposit')));
 assert(!result.evidenceMap.some(g=>g.stages.some(s=>s.documents.some(d=>d.url==='unrelated'))));
 console.log('PASS: stage paths, exact years and institutions, unknown-year separation, no invented reading, bounded compact references, unrelated-topic exclusion');
})().catch(e=>{console.error(e);process.exitCode=1});
