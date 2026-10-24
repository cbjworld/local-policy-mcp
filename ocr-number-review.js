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
function replaceLocated(text,group,first,last,value,occurrence){
 const rows=text.split('\n'),joined=group.map(w=>w.text.replace(/\s/g,'')).join(''),source=compact(joined),matches=rows.map((s,i)=>compact(s)===source?i:-1).filter(i=>i>=0);if(!matches.length||matches.length>1&&(!occurrence||occurrence.total!==matches.length||!Number.isInteger(occurrence.index)||occurrence.index<0||occurrence.index>=matches.length))return null;
 const rowIndex=matches[matches.length===1?0:occurrence.index],row=rows[rowIndex],positions=row.split('').map((c,i)=>/\s/.test(c)?-1:i).filter(i=>i>=0);while(positions.length&&row[positions[0]]==='|')positions.shift();while(positions.length&&row[positions.at(-1)]==='|')positions.pop();
 const skip=joined.length-joined.replace(/^\|+/,'').length,start=group.slice(0,first).map(w=>w.text.replace(/\s/g,'')).join('').length-skip,end=group.slice(0,last+1).map(w=>w.text.replace(/\s/g,'')).join('').length-skip;
 if(start<0||end>positions.length||end<=start)return null;rows[rowIndex]=row.slice(0,positions[start])+value+row.slice(positions[end-1]+1);return rows.join('\n');
}
async function cells(worker,raw,clean,primary,alternate,text){
 const imaging=require('./ocr-numeric-image');let image;try{image=imaging.grey(raw)||imaging.grey(clean);}catch{return {text,passes:0,corrections:[]};}if(!image)return {text,passes:0,corrections:[]};
 const groups=lines(primary.tsv||''),other=words(alternate),corrections=[];let passes=0,retries=0;
 const tasks=groups.flatMap(group=>{const financialRow=group.filter(a=>/\d[,.]\d{3}/.test(a.text)).length>=2;return group.map((w,index)=>{
  const numeric=/^[\d,.]+$/.test(w.text),unit=/^\d+[a-z]$/i.test(w.text),grouped=/\d[,.]\d{3}/.test(w.text),symbol=grouped?imaging.sign(image,w):null;
  return {group,index,numeric,unit,grouped,symbol,financialRow,priority:symbol||unit||numeric&&w.confidence<85&&(grouped||financialRow)?0:1};
 });}).sort((a,b)=>a.priority-b.priority);
 // Existing repair candidates keep their slots before the newly added high-score disputes.
 for(const {group,index,numeric,unit,grouped,symbol,financialRow} of tasks){
  const w=group[index];if(!/\d/.test(w.text))continue;
  const previous=group[index-1];let first=index,value,method;
  if(symbol&&previous&&/^[스AΔ△▲N\\]+$/.test(previous.text)&&w.x-previous.x-previous.w<12){first=index-1;value='△'+w.text;method='closed_triangle_pixels';}
  else if(/^\d{1,3}\.\d{3}$/.test(w.text)&&group.some(a=>/원/.test(a.text))&&imaging.comma(image,w)){value=w.text.replace('.',',');method='comma_tail_pixels';}
  else{
   const disputed=numeric&&other.some(a=>/^[\d,.]+$/.test(a.text)&&overlap(w,a)>=.6&&a.text!==w.text);
   if(retries>=8||!(symbol||unit||disputed||numeric&&w.confidence<85&&(grouped||financialRow)))continue;retries++;
   const narrower=numeric&&!symbol&&other.find(a=>a.confidence>=85&&/^[\d,.]+$/.test(a.text)&&overlap(w,a)>=.6&&a.w<=w.w),area=narrower||w;
   const left=Math.max(0,area.x-6),top=Math.max(0,area.y-6),rectangle={left,top,width:Math.min(image.width-left,area.w+12),height:Math.min(image.height-top,area.h+12)};
   let a,b;try{await worker.setParameters({tessedit_pageseg_mode:'7',preserve_interword_spaces:'1'});a=(await worker.recognize(raw,{rectangle},{text:true,tsv:true})).data;passes++;b=(await worker.recognize(clean,{rectangle},{text:true,tsv:true})).data;passes++;}catch{continue;}
   const trim=s=>compact(s||'').replace(/^[|]+|[|]+$/g,''),av=trim(a.text),bv=trim(b.text);if(av!==bv)continue;
   const scores=[a,b].flatMap(r=>words(r.tsv||'').filter(w=>/\d/.test(w.text)).map(w=>w.confidence));if(!scores.length||scores.some(s=>s<80))continue;
   const alt=other.filter(a=>a.x>=w.x-3&&a.x<w.x+w.w&&a.y+a.h/2>=w.y&&a.y+a.h/2<=w.y+w.h).sort((a,b)=>a.x-b.x).map(a=>a.text).join('');
   if(symbol&&/^[스AΔ△▲]\d/.test(av)&&(digits(w.text).join('')===digits(av).join('')||/^2\d/.test(w.text)&&digits(w.text.slice(1)).join('')===digits(av).join(''))){value=av.replace(/^[스AΔ△▲]/,'△');method='closed_triangle_and_two_cell_passes';}
   else if((/^\d[\d,]*(?:호|명|개|원|주|개월)?$/.test(av))&&compact(alt)===av){const adjacent=group[index+1]?.text;value=numeric&&adjacent&&/^(호|명|개|원|주|개월)$/.test(adjacent)&&av.endsWith(adjacent)?av.slice(0,-adjacent.length):av;method='two_cell_passes_and_same_location_alternate';}
  }
  if(!value||value===group.slice(first,index+1).map(w=>w.text).join(''))continue;
  const same=groups.filter(g=>compact(g.map(w=>w.text).join(''))===compact(group.map(w=>w.text).join('')));
  const changed=replaceLocated(text,group,first,index,value,{index:same.indexOf(group),total:same.length});if(changed===null)continue;
  corrections.push({from:[group.slice(first,index+1).map(w=>w.text).join('')],to:[value],box:[w.x,w.y,w.w,w.h],method});text=changed;for(let n=first;n<index;n++)group[n].text='';w.text=value;
 }
 return {text,passes,corrections};
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
 const repaired=await cells(worker,raw,clean,primary,alternate,text);
 return {text:repaired.text,passes:passes+repaired.passes,corrections:[...corrections,...repaired.corrections]};
}
module.exports={refine,candidates,replaceLocated};
