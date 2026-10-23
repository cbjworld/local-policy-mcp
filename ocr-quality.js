function words(tsv){
 if(typeof tsv!=='string'||tsv.length>2000000)throw Error('OCR 위치 정보 한도 초과');
 return tsv.split('\n').flatMap(line=>{const a=line.split('\t');if(a[0]!=='5'||a.length<12||!a[11].trim())return [];
 const [x,y,w,h,confidence]=a.slice(6,11).map(Number);if(![x,y,w,h,confidence].every(Number.isFinite)||w<=0||h<=0)return [];
 return [{text:a.slice(11).join('\t').trim(),x,y,w,h,confidence}];}).slice(0,15000);
}
const normalize=s=>s.normalize('NFKC').replace(/[\s,]/g,'').replace(/[△Δ▲−]/g,'-');
function overlap(a,b){const x=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)),y=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));return x*y/Math.min(a.w*a.h,b.w*b.h);}
function assess(primaryTsv,alternateTsv){
 const primary=words(primaryTsv),alternate=words(alternateTsv),numbers=primary.filter(w=>/\d/.test(w.text));
 const items=numbers.map(w=>{
  const matches=alternate.filter(a=>/\d/.test(a.text)&&overlap(w,a)>=.45).sort((a,b)=>overlap(w,b)-overlap(w,a));
  const other=matches[0],reasons=[];
  if(w.confidence<85)reasons.push('low_engine_score');
  if(!other)reasons.push('no_same_location_number');
  else if(normalize(w.text)!==normalize(other.text))reasons.push('two_pass_disagreement');
  if(/\d,/.test(w.text)&&!/^\D*\d{1,3}(?:,\d{3})+(?:\.\d+)?\D*$/.test(w.text))reasons.push('malformed_grouping');
  return {text:w.text,box:[w.x,w.y,w.w,w.h],engineScore:w.confidence,alternate:other?.text||null,status:reasons.length?'review':'two_pass_agreement',reasons};
 });
 return {method:'same_location_two_pass_and_engine_score',threshold:85,numericTokens:items.length,reviewCount:items.filter(i=>i.status==='review').length,agreementCount:items.filter(i=>i.status==='two_pass_agreement').length,items:items.filter(i=>i.status==='review').slice(0,120),omittedReviewItems:Math.max(0,items.filter(i=>i.status==='review').length-120),verification:'ocr_transcription_only',instruction:'표시된 숫자는 두 설정 불일치·낮은 인식 점수 등 재검토 위치입니다. 일치하거나 점수가 높아도 원문 정답을 보증하지 않습니다. 단위·감액·표 행열을 임의 보정하지 마세요.'};
}
module.exports={assess,words,overlap};
