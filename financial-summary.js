const labels={planBudget:'계획서 사업비',documentBudget:'문서 예산액',supportBudget:'지원금 예산',promotionBudget:'홍보비',benefit:'지원액',perPayment:'회당 지원액',annualLimit:'연간 지원 한도',currentAllocation:'금회 교부액',previousAllocation:'기교부액',allocation:'교부액'};
function money(text){
 const m=String(text).replace(/\s+/g,'').match(/^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,6}))?(천만|백만|억|만|천|백)?원$/);
 if(!m)return null;
 const scale=BigInt({억:100000000,천만:10000000,백만:1000000,만:10000,천:1000,백:100}[m[3]]||1),den=10n**BigInt(m[2]?.length||0);
 const n=BigInt(m[1].replaceAll(',','')+(m[2]||''))*scale;
 return n%den===0n&&n/den<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n/den):null;
}
const amount='(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,6})?\\s*(?:천\\s*만|백\\s*만|억|만|천|백)?\\s*원';
const source=e=>({sourceId:e.sourceId,url:e.url,page:e.page,quote:e.quote,...(e.attachmentTitle?{attachmentTitle:e.attachmentTitle}:{})});
function summarize(attempts,existingAmounts){
 const rows=Object.fromEntries(Object.entries(labels).map(([key,label])=>[key,{key,label,status:'not_stated',display:'별도 표기 없음',observations:[]}]))
 const amounts=existingAmounts||require('./funding-evidence').amounts(attempts);
 const add=(key,entry)=>{const r=rows[key];if(!r.observations.some(e=>e.sourceId===entry.sourceId&&e.valueKRW===entry.valueKRW&&e.basis===entry.basis))r.observations.push(entry);};
 for(const a of amounts.filter(a=>!['reference_context','attachment_reference'].includes(a.attribution))){
  let key={project_total:'planBudget',budget_unspecified:'planBudget',support_budget:'supportBudget',promotion_budget:'promotionBudget',support_amount:'benefit',support_limit:'benefit',support_unit_rate:'benefit',current_allocation:'currentAllocation',previous_allocation:'previousAllocation',allocation_unspecified:'allocation'}[a.role];
  if(a.role==='budget_unspecified'&&/^예산액/.test(a.quote.replace(/\s+/g,'')))key='documentBudget';
  if(a.role==='support_budget'&&/[:：]\s*(?:1\s*인\s*당|가구\s*당|1\s*회\s*당)/.test(a.quote))key='benefit';
  if(!key)continue;
  if(a.status==='redacted'){add(key,{...source(a),basis:'redacted',valueKRW:null});continue;}
  for(const text of a.amountTexts||[]){
   const valueKRW=money(text);if(valueKRW===null)continue;
   // No partial reading of compound amounts, negative revisions, historical prefixes or formulas.
   const labelEnd=a.quote.search(/[:：;)]/),prefix=a.quote.slice(labelEnd+1,a.quote.indexOf(text));
   if(key!=='benefit'&&(labelEnd<0||!/^\s*(?:금\s*)?$/.test(prefix)))continue;
   if(key!=='benefit'&&/^\s*[×xX*]\s*\d/.test(a.quote.slice(a.quote.indexOf(text)+text.length)))continue;
   add(key,{...source(a),basis:'stated',sourceLabel:a.quote.slice(0,labelEnd).replace(/\s+/g,''),amountText:text,valueKRW});
  }
 }
 const readable=attempts.filter(a=>a.status==='read'&&a.assessment!=='form_or_cover'&&a.assessment!=='target_mismatch'&&a.evidenceScope!=='attachment_reference');
 for(const a of readable)for(const p of a.source?.pages||[]){
  if(/타\s*지자체|타\s*시[·ㆍ]?군|시군명.{0,80}사업비/.test(p.text.slice(0,350)))continue;
  // A single explicit per-recipient payment in a support-content line is not the project budget.
  const payment=new RegExp('(?:지원\\s*내용|보조\\s*금액)\\s*[:：]\\s*([가-힣 \\t]{0,12}?(?:1\\s*인|1\\s*가구|1\\s*명|1?\\s*호)\\s*당[^\\n:：;|]{0,24}?('+amount+')[^\\n]{0,50})','g');
  for(const m of p.text.matchAll(payment)){if(/기존|종전|변경|에서|→|%/.test(m[1])||[...m[1].matchAll(new RegExp(amount,'g'))].length!==1)continue;const valueKRW=money(m[2]);if(valueKRW!==null)add('benefit',{sourceId:a.source.sourceId,url:a.source.url,page:p.page,quote:m[0],basis:'stated',sourceLabel:'수혜 단위가 명시된 지급액',amountBasis:/최대|한도/.test(m[1])?'ceiling_not_fixed_payment':'source_label',amountText:m[2],valueKRW});}
  // Only an explicit support-budget label can anchor a multiplication, never a free-floating figure.
  const formula=new RegExp('(?:면\\s*접\\s*수\\s*당\\s*)?지\\s*원\\s*금\\s*[:：]\\s*('+amount+')\\s*[×xX*]\\s*(\\d{1,3}(?:,\\d{3})+|\\d+)\\s*(명|회|가구|개소|건)(?:\\s*[×xX*]\\s*(\\d+)\\s*(회|개월|월))?(?![\\d.]|\\s*[×xX*+÷/])','g');
  for(const m of p.text.matchAll(formula)){
   const rate=money(m[1]),count=Number(m[2].replaceAll(',','')),times=m[4]?Number(m[4]):1;
   if(rate===null||![count,times].every(Number.isSafeInteger))continue;
   const result=BigInt(rate)*BigInt(count)*BigInt(times);if(result>BigInt(Number.MAX_SAFE_INTEGER))continue;
   if(/^\s*(?:[+÷/×xX*−-]|\(\s*\d+(?:\.\d+)?\s*%)/.test(p.text.slice(m.index+m[0].length)))continue;
   const before=p.text.slice(Math.max(0,m.index-180),m.index);if(/참고|타\s*지자체|전년도|전년\s*실적/.test(before))continue;
   add('supportBudget',{sourceId:a.source.sourceId,url:a.source.url,page:p.page,quote:m[0],basis:'calculated',valueKRW:Number(result),formula:{amountPerUnitKRW:rate,count,countUnit:m[3],times,timesUnit:m[5]||null}});
  }
  // Terms are distinct from total expenditure. Keep explicit period markers with each amount.
  for(const [key,pattern] of [['perPayment',new RegExp('(?<![\\d가-힣])(?:1\\s*회\\s*당|회당|1회\\s*(?:면접수당|지원금)?|1회\\s*면접수당)\\s*('+amount+')','g')],['annualLimit',new RegExp('(?<![가-힣])(?:1인당\\s*)?연\\s*('+amount+')\\s*(?:한도|이내|최대)?','g')]])for(const m of p.text.matchAll(pattern)){
   const before=p.text.slice(Math.max(0,m.index-120),m.index);if(/타\s*지자체|전년도|전년\s*실적/.test(before))continue;
   const valueKRW=money(m[1]);if(valueKRW!==null)add(key,{sourceId:a.source.sourceId,url:a.source.url,page:p.page,quote:m[0],basis:'stated',amountText:m[1],valueKRW});
  }
 }
 const complete=readable.length>0&&readable.every(a=>a.source?.scanComplete===true&&!a.source.pages.some(p=>p.truncated));
 for(const r of Object.values(rows)){
  const values=[...new Set(r.observations.filter(e=>e.valueKRW!==null).map(e=>e.valueKRW))];
  if(r.observations.length>4)r.omittedObservations=r.observations.length-4;
  r.observations=r.observations.slice(0,4);
  r.status=values.length>1?'multiple_values':values.length?r.observations.some(e=>e.basis==='stated')?'stated':'calculated':r.observations.some(e=>e.basis==='redacted')?'redacted':'not_stated';
  r.display=r.status==='redacted'?'가림 처리':r.status==='not_stated'?(complete?'별도 표기 없음':'읽은 범위 별도 표기 없음'):values.map(v=>(v/10000).toLocaleString('ko-KR',{maximumFractionDigits:4})+'만원').join(' / ')+(r.status==='calculated'?' (산식 계산값)':'');
  if(values.length===1)r.valueKRW=values[0];
  if(r.key==='benefit'&&r.observations.length&&r.observations.every(e=>e.amountBasis==='ceiling_not_fixed_payment'))r.display='최대 '+r.display;
 }
 const checks=[];
 if([rows.planBudget,rows.supportBudget,rows.promotionBudget].every(r=>['stated','calculated'].includes(r.status)&&Number.isSafeInteger(r.valueKRW))){
  const total=BigInt(rows.supportBudget.valueKRW)+BigInt(rows.promotionBudget.valueKRW);
  if(total<=BigInt(Number.MAX_SAFE_INTEGER))checks.push({kind:'support_plus_promotion',status:Number(total)===rows.planBudget.valueKRW?'matched':'mismatch',statedTotalKRW:rows.planBudget.valueKRW,componentTotalKRW:Number(total)});
 }
 for(const r of Object.values(rows)){
  const extracted=r.observations.filter(e=>attempts.some(a=>a.source?.sourceId===e.sourceId&&a.source?.ocr?.status==='read'));
  if(extracted.length){r.ocrReviewRequired=true;r.display+=' (OCR 판독값)';for(const e of extracted)e.extraction='ocr_transcription';}
  if(r.status==='not_stated'&&attempts.some(a=>a.source?.ocr?.status==='read'))r.display='OCR 읽은 범위에서 추출되지 않음';
 }
 if(Object.values(rows).some(r=>r.ocrReviewRequired))for(const c of checks){c.verification='ocr_arithmetic_only';c.ocrReviewRequired=true;}
 return {checks,rows:Object.values(rows).filter(r=>['planBudget','supportBudget','promotionBudget'].includes(r.key)||r.status!=='not_stated'),scope:'one_document_only',completeTextRead:complete,instruction:'계획서 사업비에는 사업비·소요예산·총사업비의 원문 금액을 함께 분류합니다. 원문 명칭은 observations.sourceLabel에 보존합니다. stated는 표기 금액, calculated는 산식 계산값입니다. OCR 판독값은 기계 전사 후보이며 금액 확정·자동 합산에 사용하지 마세요. 서로 다른 값은 문서 내 문맥을 대조하고 임의로 하나를 고르지 마세요. not_stated는 표기 범위이며 0원이 아닙니다. 항목·금액·근거를 짧게 제시하세요.'};
}
function requestedGaps(result,question=''){
 if(result?.status!=='read'||result.relevanceStatus==='supporting_document'||result.targetFit?.status==='mismatch')return [];
 const requested=[];
 if(/예산|사업비|지원|수당|조리비|교통비/.test(question))requested.push('planBudget');
 if(/지원|수당|조리비|교통비/.test(question))requested.push('benefit');
 if(/지원금\s*(?:총액|예산)|사업비\s*구성|예산\s*구성|지원금[·ㆍ과\s]+홍보비/.test(question))requested.push('supportBudget');
 if(/홍보비/.test(question))requested.push('promotionBudget');
 const summary=summarize(result.attempts||[],result.evidence?.fields?.budget?.amounts);
 return requested.filter(key=>(summary.rows.find(r=>r.key===key)?.status||'not_stated')==='not_stated');
}
function compact(s){return {rows:s.rows,checks:s.checks,completeTextRead:s.completeTextRead,scope:s.scope};}
module.exports={summarize,money,requestedGaps,compact};
