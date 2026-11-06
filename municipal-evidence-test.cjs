const assert=require('node:assert/strict');
const {collect}=require('./municipal-evidence.cjs');
const {research}=require('./policy-workflow');
const {present}=require('./presentation');
const snapshot='a'.repeat(64);
const items=Array.from({length:7},(_,i)=>({name:'청년 월세 '+i,institution:i<2?'가군':'나군',parent:'시험도',source:'https://example.go.kr/'+i,sourceSha256:'b'.repeat(64),location:{table:1,row:i+2},status:'source_row_candidate',queryMatch:'all_terms',content:'지원대상 청년',contentTruncated:false,fields:{지원대상:'청년'}}));
const search=args=>({snapshot,scope:{totalSources:7,totalInstitutions:2,skippedEntries:1,coverage:'수록된 자료'},total:7,nextOffset:null,items:items.slice(0,args.limit)});
const catalog={institution:'시험도',searches:[{q:'청년 월세'}]};
const x=collect(catalog,search);assert.equal(x.items.length,5);assert.equal(x.omittedItems,2);assert.deepEqual(x.items.slice(0,2).map(i=>i.institution),['가군','나군']);assert.equal(x.items[1].followup.arguments.offset,2);assert.equal(x.items[1].followup.arguments.snapshot,snapshot);assert.equal(x.searches[0].total,7);assert.equal(collect(catalog,null),null);
assert.equal(collect(catalog,()=>{throw Error('private path must not leak')}).searches[0].status,'failed');
(async()=>{
 const io={search:async()=>{throw Error('portal offline')},searchHomepage:search,searchCatalog:()=>({coverage:null,total:0,items:[],nextOffset:null})};
 const r=await research({question:'청년 월세 지원 찾아줘',autoOcr:false},io);
 assert.equal(r.status,'search_failed');assert.equal(r.municipalEvidence.items.length,5);assert.equal(r.municipalEvidence.items[0].source,items[0].source);
 const compact=present('research_policy',r);assert.equal(compact.municipalEvidence.items.length,5);assert(compact.municipalEvidence.items[0].followup.arguments.snapshot);assert(JSON.stringify(compact).length<=24000);
 const crowded={...r,municipalEvidence:{...r.municipalEvidence,items:r.municipalEvidence.items.map(i=>({...i,name:'가'.repeat(12000)}))}};const bounded=present('research_policy',crowded);assert(JSON.stringify(bounded).length<=24000);assert(bounded.municipalEvidence.omittedItems>r.municipalEvidence.omittedItems);assert(bounded.municipalEvidence.searches[0].followup);
 console.log('PASS: homepage evidence survives portal failure, compact response, source locations and paginated followups');
})().catch(e=>{console.error(e);process.exitCode=1});
