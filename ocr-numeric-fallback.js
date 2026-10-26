const {words}=require('./ocr-quality'),imaging=require('./ocr-numeric-image'),{replaceLocated}=require('./ocr-number-review');
const money=/^(?:△|-)?(?:0|[1-9]\d{0,2})(?:,\d{3})+$/,compact=s=>s.replace(/\s/g,'');
function trimBox(image,box){
 if(box.height<48)return box;
 const bands=[];let start=-1;
 for(let y=0;y<=box.height;y++){let count=0;if(y<box.height)for(let x=0;x<box.width;x++)if(image.pixels[(box.top+y)*image.width+box.left+x]<170)count++;
  const ink=count>=2&&count<box.width*.8;if(ink&&start<0)start=y;if(!ink&&start>=0){bands.push({top:start,height:y-start});start=-1;}
 }
 bands.sort((a,b)=>b.height-a.height);const main=bands[0];if(!main||main.height<12||!bands[1]||bands[1].height>main.height*.55)return box;
 const top=Math.max(0,main.top-4),bottom=Math.min(box.height,main.top+main.height+4);return {...box,top:box.top+top,height:bottom-top};
}
function plan(primary,raw,clean){
 const groups=new Map();for(const row of (primary.tsv||'').split('\n')){const a=row.split('\t'),w=words(row)[0];if(!w)continue;const key=a.slice(1,5).join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(w);}
 const all=[...groups.values()],images=[imaging.grey(raw),imaging.grey(clean)];if(images.some(x=>!x))return [];
 const numeric=w=>/^[△Δ▲스A£N\\,0-9.%-]+$/.test(w.text),tasks=[];
 outer:for(const group of all)for(let first=0;first<group.length;first++){
  const start=group[first];if(!numeric(start))continue;let last=first;
  while(last+1<group.length&&last-first<2){const a=group[last],b=group[last+1];if(!numeric(b)||b.x-a.x-a.w>Math.max(8,Math.min(a.h,b.h)*.6)||Math.abs(a.y+a.h/2-b.y-b.h/2)>Math.max(a.h,b.h)*.4)break;last++;}
  const span=group.slice(first,last+1),source=span.map(w=>w.text).join(''),digits=(source.match(/\d/g)||[]).length;first=last;
  if((digits<4&&!source.includes(','))||digits>12||money.test(source)&&span.every(w=>w.confidence>=85))continue;
  const left=Math.max(0,Math.min(...span.map(w=>w.x))-8),top=Math.max(0,Math.min(...span.map(w=>w.y))-8),right=Math.min(images[0].width,Math.max(...span.map(w=>w.x+w.w))+8),bottom=Math.min(images[0].height,Math.max(...span.map(w=>w.y+w.h))+8),untrimmed={left,top,width:right-left,height:bottom-top};
  if(untrimmed.width<8||untrimmed.height<8||untrimmed.width>512||untrimmed.height>256)continue;const box=trimBox(images[0],untrimmed);
  if(box.width<8||box.height<8||box.width>512||box.height>192||box.width/box.height>16)continue;
  tasks.push({group,first:last-span.length+1,last,source,box,hasTriangle:span.some(w=>!!imaging.sign(images[0],w)),images:images.map(im=>imaging.crop(im,box).toString('base64'))});if(tasks.length===32)break outer;
 }
 return tasks.slice(0,32).map(t=>({...t,occurrence:{index:all.filter(g=>compact(g.map(w=>w.text).join(''))===compact(t.group.map(w=>w.text).join(''))).indexOf(t.group),total:all.filter(g=>compact(g.map(w=>w.text).join(''))===compact(t.group.map(w=>w.text).join(''))).length}}));
}
function apply(text,tasks,results){
 const corrections=[];if(!Array.isArray(results)||results.length!==tasks.length*2)return {text,corrections};
 const rows=text.split('\n'),locations=new Map();for(const t of tasks)if(!locations.has(t.group)){const source=compact(t.group.map(w=>w.text).join('')),matches=rows.map((r,i)=>compact(r)===source?i:-1).filter(i=>i>=0);locations.set(t.group,matches.length===t.occurrence.total?matches[t.occurrence.index]:null);}
 for(let i=0;i<tasks.length;i++){
  const t=tasks[i],[a,b]=results.slice(i*2,i*2+2),value=compact(a?.text||'');
  const negative=/^[△-]/.test(value),sourceNegative=t.hasTriangle||/^[△-]/.test(t.source);if(negative!==sourceNegative)continue;
  if(!money.test(value)||value!==compact(b?.text||'')||![a,b].every(r=>Number.isFinite(r?.score)&&r.score>=.94&&r.score<=1)||value===compact(t.source))continue;
  const index=locations.get(t.group);if(!Number.isInteger(index))continue;const next=replaceLocated(rows[index],t.group,t.first,t.last,value);if(next===null)continue;
  corrections.push({from:[t.source],to:[value],box:Object.values(t.box),method:'independent_numeric_model_two_source_crops',confidence:Math.min(a.score,b.score)});rows[index]=next;
  for(let j=t.first;j<t.last;j++)t.group[j].text='';t.group[t.last].text=value;
 }
 return {text:rows.join('\n'),corrections};
}
module.exports={plan,apply,trimBox};
