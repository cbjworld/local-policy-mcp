const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{search}=require('./gov24-snapshot.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gov24-')),file=path.join(dir,'snapshot.json');
try{
 const source='https://www.data.go.kr/data/15113968/openapi.do',rows=[{serviceId:'A123',title:'영월장학회 장학금',institution:'강원특별자치도 영월군',url:'https://www.gov.kr/portal/rcvfvrSvc/dtlEx/A123',modifiedAt:'20260901101508'},{serviceId:'B456',title:'청년 장학금',institution:'서울특별시 성동구',url:'https://www.gov.kr/portal/rcvfvrSvc/dtlEx/B456'}];
 const data={apiSource:source,fetchedAt:'2026-10-13T03:12:43.772Z',coverage:'시험 범위',records:rows};fs.writeFileSync(file,JSON.stringify(data));
 const a=search({q:'장학금',institution:'영월군'},file);assert.equal(a.total,1);assert.equal(a.items[0].serviceId,'A123');assert.equal(a.scope.fetchedAt,data.fetchedAt);assert.equal(search({q:'장학금',limit:1},file).nextOffset,1);assert.equal(search({q:'월세',institution:'영월군'},file).total,0);assert.throws(()=>search({q:'장학금',snapshot:a.snapshot},file),/변경/);
 const collected=require('./gov24-snapshot.cjs').collect({institution:'영월군',searches:[{q:'장학금'},{q:'장학금'}]},file);assert.equal(collected.items.length,1);assert.equal(collected.items[0].serviceId,'A123');assert.equal(collected.searches.length,1);
 rows[0].url='https://evil.example/A123';fs.writeFileSync(file,JSON.stringify(data));assert.throws(()=>search({q:'장학금'},file),/주소/);
 console.log('PASS: official snapshot, institution filtering, pagination and strict source URLs');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
