function validGov24Url(value,id){
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return false;
  if(u.hostname==='www.gov.kr')return !u.search&&u.pathname==='/portal/rcvfvrSvc/dtlEx/'+id;
  if(u.hostname!=='plus.gov.kr'||u.pathname!=='/portal/benefitV2/benefitTotalSrvcList/benefitSrvcDtl')return false;
  const p=u.searchParams,keys=[...p.keys()];
  return keys.length===3&&new Set(keys).size===3&&/^[0-9]+$/.test(p.get('svcSeq')||'')&&p.get('bnefType')==='all'&&p.get('svcId')===id;
 }catch{return false;}
}
module.exports={validGov24Url};
