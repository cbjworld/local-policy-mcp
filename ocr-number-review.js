const {words,overlap}=require('./ocr-quality');
const compact=s=>s.replace(/\s/g,'').replace(/^[|]+|[|]+$/g,''),digits=s=>s.match(/\d+/g)||[];
const context=s=>s.replace(/^[*x×|]+|[|.]+$/g,'').replace(/\d+/g,'#');
function lines(tsv){const groups=new Map();for(const row of tsv.split('\n')){const a=row.split('\t');if(a[0]!=='5'||a.length<12)continue;const w=words(row)[0];if(!w)continue;const key=a.slice(1,5).join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(w);}return [...groups.values()];}
function candidates(primary,alternate,{width,height}){
 const other=words(alternate),median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
 return lines(primary).flatMap(line=>{
  const changed=line.some(w=>/\d/.test(w.text)&&other.some(a=>/\d/.test(a.text)&&overlap(w,a)>=.45&&digits(w.text).join(':')!==digits(a.text).join(':')));
  if(!changed)return [];const content=line.filter(w=>/[\dA-Za-z가-힣]/.test(w.text)),h=median(content.map(w=>w.h)),y=median(content.map(w=>w.y)),pad=Math.max(8,Math.round(h*.3));
  const left=Math.max(0,Math.min(...content.map(w=>w.x))-pad),top=Math.max(0,y-pad),right=Math.min(width,Math.max(...content.map(w=>w.x+w.w))+pad),bottom=Math.min(height,y+h+pad);
  const source=compact(line.map(w=>w.text).join('')),nums=digits(source),alt=other.filter(w=>w.y+w.h/2>=top&&w.y+w.h/2<=bottom&&w.x>=left&&w.x<right).sort((a,b)=>a.x-b.x).flatMap(w=>digits(w.text));
  if(nums.length!==alt.length||!nums.length||right<=left||bottom<=top)return [];
  return [{source,numbers:nums,alternate:alt,rectangle:{left,top,width:right-left,height:bottom-top}}];
 // shortcut: four disputed lines per page; raise only after measuring remote execution limits.
 }).slice(0,4);
}
async function refine(worker,raw,clean,primary,alternate,size){
 let text=primary.text||'',passes=0;const corrections=[];
 for(const item of candidates(primary.tsv||'',alternate,size)){
  let a,b;try{await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});a=(await worker.recognize(raw,{rectangle:item.rectangle},{text:true,tsv:true})).data;passes++;b=(await worker.recognize(clean,{rectangle:item.rectangle},{text:true,tsv:true})).data;passes++;}catch{continue;}
  const value=compact(a.text||''),num=digits(value);
  if(value!==compact(b.text||'')||context(value)!==context(item.source)||num.join(':')!==item.alternate.join(':')||num.join(':')===item.numbers.join(':'))continue;
  const scores=[a,b].flatMap(r=>words(r.tsv||'').filter(w=>/\d/.test(w.text)).map(w=>w.confidence));
  if(!scores.length||scores.some(s=>s<70)||scores.reduce((a,b)=>a+b,0)/scores.length<80)continue;
  const rows=text.split('\n'),matches=rows.map((s,i)=>compact(s)===item.source?i:-1).filter(i=>i>=0);if(matches.length!==1)continue;
  const index=matches[0];let n=0;rows[index]=rows[index].replace(/\d+/g,()=>num[n++]);text=rows.join('\n');
  corrections.push({from:item.numbers,to:num,box:Object.values(item.rectangle),method:'two_crop_passes_and_same_location_alternate'});
 }
 return {text,passes,corrections};
}
module.exports={refine,candidates};
