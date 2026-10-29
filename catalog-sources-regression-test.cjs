const assert=require('node:assert/strict');
const {links}=require('./project-document-links.json');
const find=(projectId,documentId)=>links.find(x=>x.projectId===projectId&&x.document.url.includes(documentId));
for(const [projectId,documentId,relationship] of [
 ['bp-84e674ac3651ac4f33c7ac33','DCT53CA72218AC69A7B648024F701C0B250','same_named_budget_program'],
 ['bp-8cbfb9d98d3930d0d6ec6a22','DCT69914611A3DBE3C55D2EDDBBA50B4BEE','explicit_budget_line_reference'],
 ['bp-72a3ac3c8c771e31ab705492','DCT15D5F3F2792476E19D2E951386E88571','same_named_budget_program'],
 ['bp-bfb61502e56a3efd1ea0358b','DCT3AC24747910D4CF420A2020F99911BEE','same_named_budget_program'],
 ['bp-d683e10be0fcdca12ba4b816','DCT5168869BCBC8EDBF1C5424754003E4D6','explicit_budget_line_reference'],
 ['bp-aecce0079aa580c45305af7c','DCT1FAA58ABEEB8C616189281824648F70C','same_named_budget_program']
]){
 const link=find(projectId,documentId);assert.equal(link?.status,'body_supported');assert.equal(link.relationship,relationship);
 assert.ok(link.evidence.length>=2&&link.evidence.every(e=>e.quote&&e.sourceUrl.includes(documentId)));
}
assert.ok(find('bp-84e674ac3651ac4f33c7ac33','DCT53CA72218AC69A7B648024F701C0B250').evidence.some(e=>e.quote.includes('세부사업) 슬레이트처리지원(보조)')));
assert.ok(!find('bp-84e674ac3651ac4f33c7ac33','DCTEA739911E3FA030ED420188638393109'),'different named budget program');
assert.ok(!links.some(x=>x.document.url.includes('DCTAB6619B7ED72C9998A0B7221FB734FAC')),'conflicting disclosure status');
for(const [id,doc] of [['bp-202bcae680056dc588dc4a8c','DCTBB5CDE3B85B4CDB72438F791ACFF8E1D'],['bp-51d6aa627fe702132a8ca024','DCT111BF7D849A4DE81CDCA6E0979D31AAD'],['bp-51d6aa627fe702132a8ca024','DCT750610BDB6948B80A67A0FD6DBD17608'],['bp-9bc6ef6015978a38cefb5fd5','DCT6D5E1880636300DA04AE34136AF5E9B7']])assert.equal(find(id,doc)?.status,'title_candidate','withhold conflicting disclosure');
assert.ok(find('bp-72a3ac3c8c771e31ab705492','DCT15D5F3F2792476E19D2E951386E88571').evidence.some(e=>e.kind==='budget'&&e.quote.includes('2025년 예산')&&e.quote.includes('2026년 예산')&&e.quote.includes('15,600')&&e.quote.includes('49,000')),'retain distinct years, original budget and draft supplementary budget');
const gangwonGrant=find('bp-d683e10be0fcdca12ba4b816','DCT5168869BCBC8EDBF1C5424754003E4D6');
assert.ok(gangwonGrant.evidence.some(e=>e.kind==='allocation_budget'&&e.quote.includes('200,200,000원')));
assert.ok(gangwonGrant.evidence.some(e=>e.kind==='allocation_amount'&&e.quote.includes('31,100,000원')));
console.log('PASS: verified budget-source links preserve actual attachments and exclude conflicting disclosure and different budget programs');
