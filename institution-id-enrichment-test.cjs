const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const catalog=require('./policy-catalog'),data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'budget-data.json.gz'))));
const expected={
 '인천광역시':{id:'gov-7a17ad2e73',parent:'인천광역시',host:'www.incheon.go.kr',rows:2720,project:'bp-8b87b9723bea7a19cd7e4b34'},
 '거제시':{id:'gov-2f62f2cfa3',parent:'경상남도',host:'www.geoje.go.kr',rows:1892,project:'bp-a364467d2b662c64d2a90edd'},
 '무주군':{id:'gov-cc1577ddea',parent:'전북특별자치도',host:'www.muju.go.kr',rows:1532,project:'bp-2d1364178a09017d450b2a71'},
 '합천군':{id:'gov-328a5846a8',parent:'경상남도',host:'www.hc.go.kr',rows:1397,project:'bp-880c0c46e25961eb49e04662'}
};
const groups={};for(const [i,row] of data.rows){const c=data.contexts[i];if(!c.institutionId&&expected[c.institution]){(groups[c.institution]??=[]).push([c,row]);}}
for(const [name,e] of Object.entries(expected)){
 const rows=groups[name];assert.equal(rows.length,e.rows);
 for(const [original,row] of rows){const copy=JSON.stringify(original),resolved=catalog.enrich(original);assert.equal(JSON.stringify(original),copy);assert.equal(resolved.resolvedInstitutionId,e.id);assert.equal(resolved.parent,e.parent);assert.equal(new URL(original.source).hostname,e.host);}
 const sample=catalog.search({projectId:e.project});assert.equal(sample.total,1);assert.equal(sample.items[0].resolvedInstitutionId,e.id);assert.equal(sample.items[0].budgetRecords[0].resolvedInstitutionId,e.id);
 const budget=require('./budget-search').search({q:rows[0][1].name,institution:name,limit:20});assert(budget.items.some(item=>item.institution===name&&item.resolvedInstitutionId===e.id&&item.name===rows[0][1].name));
 const sampleRaw=rows[0][0];assert.equal(catalog.enrich({...sampleRaw,source:'https://wrong.example/doc'}).resolvedInstitutionId,undefined);assert.equal(catalog.enrich({...sampleRaw,source:'http://'+e.host+'/doc'}).resolvedInstitutionId,undefined);assert.equal(catalog.enrich({...sampleRaw,parent:'다른 지역'}).resolvedInstitutionId,undefined);assert.equal(catalog.enrich({...sampleRaw,institutionId:'existing'}).resolvedInstitutionId,undefined);
}
for(const [id,body,candidates] of [['bp-3f3dfbf19319f807bb6ae11c',1,0],['bp-458d7646f0c01cbebedbad42',1,0],['bp-9b4deaef8b671a7e15454a83',0,1]]){const result=catalog.search({projectId:id});assert.equal(result.total,1);assert.equal(result.items[0].documents.length,body);assert.equal(result.items[0].documentCandidates.length,candidates);}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'duplicate-registry-'));
try{const records={records:[{institution:'중구',parent:'서울특별시',url:'https://example.go.kr/',institutionId:'one'},{institution:'중구',parent:'부산광역시',url:'https://example.go.kr/',institutionId:'two'}]};fs.writeFileSync(path.join(tmp,'catalog-institutions.json'),JSON.stringify(records));assert.equal(catalog.enrich({institution:'중구',source:'https://example.go.kr/document'},tmp).resolvedInstitutionId,undefined);}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log('PASS: four source-matched institution identities preserve project IDs and linked documents');
