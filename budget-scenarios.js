const integer=(v,name,min,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw Error(name+' 값은 '+min+'~'+max+'의 정수여야 합니다.');return v;};
function calculate({scenarios,budgetCeilingKRW}={}){
 if(!Array.isArray(scenarios)||scenarios.length<1||scenarios.length>5)throw Error('시나리오는 1~5개가 필요합니다.');
 if(budgetCeilingKRW!==undefined)integer(budgetCeilingKRW,'예산 상한',0);
 const results=scenarios.map((s,i)=>{
  if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!['label','participants','amountPerPaymentKRW','paymentsPerYear','fixedCostKRW','assumedMunicipalSharePercent'].includes(k)))throw Error('시나리오 항목이 올바르지 않습니다.');
  if(s.label!==undefined&&(typeof s.label!=='string'||!s.label.trim()||s.label.length>80))throw Error('시나리오 이름은 1~80자여야 합니다.');
  integer(s.participants,'지원 인원',0,10000000);integer(s.amountPerPaymentKRW,'1회 지원액',0,1000000000000);integer(s.paymentsPerYear,'연간 지급 횟수',1,366);
  if(s.fixedCostKRW!==undefined)integer(s.fixedCostKRW,'입력한 기타 비용',0);
  if(s.assumedMunicipalSharePercent!==undefined)integer(s.assumedMunicipalSharePercent,'가정한 지방비 비율',0,100);
  const support=BigInt(s.participants)*BigInt(s.amountPerPaymentKRW)*BigInt(s.paymentsPerYear),total=support+BigInt(s.fixedCostKRW??0);
  if(total>BigInt(Number.MAX_SAFE_INTEGER))throw Error('계산 결과가 정확히 표현할 수 있는 금액 범위를 초과했습니다.');
  const municipal=s.assumedMunicipalSharePercent===undefined?null:(total*BigInt(s.assumedMunicipalSharePercent)+50n)/100n;
  return {label:s.label||'시나리오 '+(i+1),basis:'explicit_input_assumptions',assumptions:{...s},annualSupportCostKRW:Number(support),includedOtherCostKRW:s.fixedCostKRW??null,modeledAnnualCostKRW:Number(total),otherCostsIncluded:s.fixedCostKRW!==undefined,assumedMunicipalCostKRW:municipal===null?null:Number(municipal),assumedOtherFundingKRW:municipal===null?null:Number(total-municipal),...(budgetCeilingKRW!==undefined?{budgetCeilingKRW,modeledBalanceKRW:budgetCeilingKRW-Number(total),ceilingComparison:total>BigInt(budgetCeilingKRW)?'입력 비용이 상한 초과':'입력 비용이 상한 이내'}:{}),formula:`${s.participants}명 × ${s.amountPerPaymentKRW}원 × 연 ${s.paymentsPerYear}회${s.fixedCostKRW===undefined?' (기타 비용 미입력)':' + 기타 비용 '+s.fixedCostKRW+'원'}`};
 });
 return {status:'scenario_calculation',currency:'KRW',unit:'원',officialAppropriation:false,results,interpretation:'입력한 인원·지급액·횟수에 따른 1년 비용 모형입니다. 공식 편성 예산·실제 지출과 구분하세요. 지방비 비율은 사용자가 가정한 값이며 실제 보조율이 아닙니다. 기타 비용 미입력 시 지원금만 계산합니다. 상한 비교는 모형 전체 비용 기준입니다.',rounding:'가정한 지방비는 원 단위 사사오입하고 나머지는 기타 재원으로 배분합니다. 두 금액의 합은 모형 비용과 일치합니다.'};
}
module.exports={calculate};
