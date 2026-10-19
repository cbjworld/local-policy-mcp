const assert=require('node:assert/strict'),workflow=require('./policy-workflow'),{missingFields,sameProject}=require('./policy-followup'),{researchNotice}=require('./discovery');
const full=()=>({status:'read',evidence:{fields:Object.fromEntries(['target','activity','budget','period'].map(k=>[k,{excerpts:[{status:'evidence_candidate',quote:'지원 근거 '+k,sourceId:'s',url:'https://a.go.kr/file'}]}]))}});
const primary={title:'2026년 산후조리비 지원사업 추진계획',institution:'테스트시',department:'보건과',url:'primary'};
const alternate={...primary,title:'2026년 산후조리비 지원사업 변경계획',url:'alternate'};
const other={...primary,institution:'다른시',url:'other'};
const search=docs=>async()=>({total:docs.length,hasMore:false,items:docs,reviewItems:[],relatedDocuments:[]});
async function main(){
 assert.equal(sameProject(primary,alternate),true);
 for(const doc of [{...alternate,institution:'다른시'},{...alternate,department:'다른과'},{...alternate,title:alternate.title.replace('2026','2025')},{...alternate,title:'산후조리비 지원사업 계획'}])assert.equal(sameProject(primary,doc),false);
 assert.deepEqual(missingFields({status:'read'}),['target','activity','budget','period']);
 assert.deepEqual(missingFields({...full(),relevanceStatus:'supporting_document'}),['target','activity','budget','period']);
 assert.deepEqual(missingFields({...full(),targetFit:{requested:['older'],status:'unspecified'}}),['target']);
 for(const initial of [{status:'unreadable',attempts:[{status:'external_failed'}]},{status:'read'},{...full(),evidence:{fields:{target:{excerpts:[{status:'evidence_candidate',quote:'지원대상: 산모'}]}}}}]){
  const calls=[],docs=[primary,other,...Array.from({length:4},(_,i)=>({...primary,institution:'별도시'+i,url:'extra'+i})),alternate];
  const result=await workflow.research({question:'산후조리비 지원',queries:['산후조리비']},{search:search(docs),research:async({url})=>{calls.push(url);return url==='primary'?initial:full();}});
  assert.deepEqual(calls,['primary','alternate','other']);
  assert.equal(result.investigations[1].candidate.followup.fromUrl,'primary');
  assert(result.investigations[1].candidate.followup.missingFields.includes('budget'));
  assert.equal(result.investigations[0].result,initial,'initial failure/evidence is retained');
 }
 // Mere text extraction must not end the investigation as two successful cases.
 const textCalls=[],textDocs=Array.from({length:8},(_,i)=>({...primary,institution:'기관'+i,url:'text'+i}));
 const textOnly=await workflow.research({question:'산후조리비 지원',queries:['산후조리비']},{search:search(textDocs),research:async({url})=>{textCalls.push(url);return {status:'read'};}});
 assert.equal(textCalls.length,6);assert.equal(textOnly.limits.maxDocuments,7);
 const grant={...primary,title:'2026년 산후조리비 지원 교부결정',url:'grant'};
 const financeCalls=[];
 const finance=await workflow.research({question:'산후조리비 지원',queries:['산후조리비']},{search:search([primary,grant]),research:async({url})=>{financeCalls.push(url);return url==='grant'?full():{status:'unreadable'};}});
 assert.deepEqual(financeCalls,['primary','grant']);assert.equal(finance.investigations[1].purpose,'link_financial_evidence');
 const stale=[];
 await workflow.research({question:'산후조리비 지원',queries:['산후조리비']},{search:search([primary,{...grant,title:grant.title.replace('2026','2025')}]),research:async({url})=>{stale.push(url);return {status:'unreadable'};}});
 assert.deepEqual(stale,['primary'],'do not substitute an explicitly different fiscal year');
 const notice='https://opengov.seoul.go.kr/sanction/123',valid='https://opengov.seoul.go.kr/og/com/download.php?nid=123&rid=F001&dtype=basic',calls=[];
 const result=await researchNotice({url:notice},async({url})=>{calls.push(url);return url===notice?{url,pages:[],links:[{url:'https://opengov.seoul.go.kr/og/com/download.php',title:'PDF 다운로드'},{url:valid,title:'원문 다운로드'},{url:'https://example.go.kr/download?id=123',title:'첨부 다운로드'}]}:{url,pages:[{text:'공개 본문'}],format:'hwpx'};});
 assert.equal(result.attachments.length,2);assert.deepEqual(calls,[notice,valid,'https://example.go.kr/download?id=123']);
 let wrongTitleCalls=0;
 await assert.rejects(researchNotice({url:notice,expectedTitle:'청년 이사비 계획'},async()=>{wrongTitleCalls++;return {url:notice,pages:[{text:'다른 사업'}],links:[{url:valid,title:'원문 다운로드'}]};}),/제목 일치 확인 실패/);
 assert.equal(wrongTitleCalls,1,'reject the wrong page before downloading its attachments');
 console.log('PASS: unreadable/text-only/partial plans follow same-project alternative, preserve failures and field provenance, reject cross-year/department merges, skip parameterless Seoul button');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
