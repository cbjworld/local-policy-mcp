const fs=require('node:fs'),path=require('node:path');
const norm=x=>String(x||'').normalize('NFKC').replace(/\s+/g,'');
function build(source,registry){
 if(!source||source.source!=='https://www.data.go.kr/data/15113968/openapi.do'||source.complete!==true||!Array.isArray(source.records)||source.records.length!==source.totalCount||source.records.length!==source.collectedCount||typeof source.fetchedAt!=='string'||!Number.isFinite(Date.parse(source.fetchedAt)))throw Error('정부24 원본 수집 상태를 확인하세요.');
 const valid=new Set(registry.filter(x=>!x.institution.includes('(편성 당시)')).map(x=>norm(x.parent===x.institution?x.parent:x.parent+' '+x.institution))),seen=new Set(),records=[];
 for(const row of source.records){
  if(!['광역시도','시군구'].includes(row['소관기관유형']))continue;
  const institution=row['소관기관명'],serviceId=String(row['서비스ID']||''),title=row['서비스명'],url=row['상세조회URL'],modifiedAt=row['수정일시'];
  if(!valid.has(norm(institution))||!/^[A-Za-z0-9]{1,40}$/.test(serviceId)||seen.has(serviceId)||typeof title!=='string'||!title.trim()||title.length>300||url!=='https://www.gov.kr/portal/rcvfvrSvc/dtlEx/'+serviceId||typeof modifiedAt!=='string'||!/^\d{14}$/.test(modifiedAt))throw Error('지자체 또는 정부24 항목의 출처를 확인하세요.');
  seen.add(serviceId);records.push({serviceId,title,institution,url,modifiedAt});
 }
 return {apiSource:source.source,fetchedAt:source.fetchedAt,coverage:'전국 광역·기초 직접 소관 목록; 저장 시점 기준. 일부 기관은 목록에 없을 수 있습니다.',institutionCount:new Set(records.map(x=>norm(x.institution))).size,records};
}
function main(){const [input,output]=process.argv.slice(2);if(!input||!output||path.resolve(input)===path.resolve(output))throw Error('사용법: node import-gov24-national.cjs 원본.json 새목록.json');const source=JSON.parse(fs.readFileSync(input,'utf8')),registry=require('./catalog-institutions.json').records,result=build(source,registry);fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({records:result.records.length,institutions:result.institutionCount,fetchedAt:result.fetchedAt}));}
module.exports={build};if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
