const {words,overlap}=require('./ocr-quality'),imaging=require('./ocr-numeric-image'),{replaceLocated}=require('./ocr-number-review');
const money=/^(?:△|-)?(?:0|[1-9]\d{0,2})(?:,\d{3})+$/,compact=s=>s.replace(/\s/g,'');
const trimBox=imaging.trimBox;
// A lost numeric prefix can bring the adjacent table border into its crop.
function trimBorder(image,box){
 let left=box.left,right=box.left+box.width;for(let i=0;i<Math.min(8,box.width);i++){for(const x of [box.left+i,box.left+box.width-1-i]){let ink=0;for(let y=box.top;y<box.top+box.height;y++)if(image.pixels[y*image.width+x]<170)ink++;if(ink<box.height*.9)continue;if(x<box.left+8)left=Math.max(left,x+1);else right=Math.min(right,x);}}if(right>left)box={...box,left,width:right-left};
 return box;
}
// Short signed runs need more horizontal separation; no source digits are synthesized.
function wideCrop(image,box){
 const width=box.width*2,height=box.height,pixels=Buffer.alloc(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels[y*width+x]=image.pixels[(box.top+y)*image.width+box.left+Math.floor(x/2)];
 return imaging.crop({width,height,pixels},{left:0,top:0,width,height});
}
function plan(primary,raw,clean,alternate=''){
 const groups=new Map();for(const row of (primary.tsv||'').split('\n')){const a=row.split('\t'),w=words(row)[0];if(!w)continue;const key=a.slice(1,5).join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(w);}
 let koreanCells=0;const other=words(alternate),all=[...groups.values()],images=[imaging.grey(raw),imaging.grey(clean)];if(images.some(x=>!x))return [];
 const numeric=w=>/^[△Δ▲스A£N\\,0-9.%-]+$/.test(w.text),tasks=[];
 outer:for(const group of all)for(let first=0;first<group.length;first++){
  const start=group[first];if(!numeric(start))continue;let last=first;
  while(last+1<group.length&&last-first<2){const a=group[last],b=group[last+1];if(!numeric(b)||b.x-a.x-a.w>Math.max(8,Math.min(a.h,b.h)*.6)||Math.abs(a.y+a.h/2-b.y-b.h/2)>Math.max(a.h,b.h)*.4)break;last++;}
  let span=group.slice(first,last+1),recoveredPrefix=false;
  if(span.some(w=>w.text.includes(','))){const prefix=[];for(let i=first-1;i>=Math.max(0,first-2);i--){const w=group[i],next=prefix[0]||span[0];if(w.confidence>=60||!/^\p{Script=Hangul}{1,2}$/u.test(w.text)||next.x-w.x-w.w>12||Math.abs(next.y+next.h/2-w.y-w.h/2)>Math.max(w.h,next.h)*.6)break;prefix.unshift(w);}if(prefix.some(w=>imaging.sign(images[0],w))){span=[...prefix,...span];recoveredPrefix=true;}}
  const source=span.map(w=>w.text).join(''),digits=(source.match(/\d/g)||[]).length;first=last;
  if((digits<4&&!source.includes(',')&&!/^[△Δ▲스A£]/.test(source))||digits>12||money.test(source)&&span.every(w=>w.confidence>=85))continue;
  const triangle=span.map(w=>imaging.sign(images[0],w)).find(Boolean);if(digits<4&&!source.includes(',')&&!triangle)continue;
  const left=Math.max(0,Math.min(...span.map(w=>w.x))-8),top=Math.max(0,Math.min(...span.map(w=>w.y))-8),right=Math.min(images[0].width,Math.max(...span.map(w=>w.x+w.w))+8),bottom=Math.min(images[0].height,Math.max(...span.map(w=>w.y+w.h))+8),untrimmed={left,top,width:right-left,height:bottom-top};
  if(untrimmed.width<8||untrimmed.height<8||untrimmed.width>512||untrimmed.height>256)continue;const disputed=other.some(a=>/\d/.test(a.text)&&compact(a.text)!==source&&span.some(w=>overlap(w,a)>=.45)),trimmed=trimBox(images[0],untrimmed,disputed),originalBox=recoveredPrefix?trimBorder(images[0],trimmed):trimmed,cell=money.test(source)&&untrimmed.height>=48?trimBox(images[0],trimBorder(images[0],untrimmed),true):originalBox,korean=money.test(source)&&cell.height<untrimmed.height*.75&&koreanCells<4;let box=korean?cell:originalBox;if(korean)koreanCells++;
  if(/,\d{1,2}$/.test(source)){let edge=0;for(let y=box.top;y<box.top+box.height;y++)if(images[0].pixels[y*images[0].width+box.left+box.width-1]<170)edge++;if(edge>2&&edge<box.height*.8){let right=Math.min(images[0].width,box.left+box.width+24);for(let x=box.left+box.width;x<right;x++){let ink=0;for(let y=box.top;y<box.top+box.height;y++)if(images[0].pixels[y*images[0].width+x]<170)ink++;if(ink>=box.height*.9){right=x;break;}}box={...box,width:right-box.left};}}
  if(box.width<8||box.height<8||box.width>512||box.height>192||box.width/box.height>16)continue;
  const leftEdge=triangle?Math.max(box.left,triangle.x+triangle.w+(recoveredPrefix?0:1)):box.left,readBox={...box,left:leftEdge,width:box.left+box.width-leftEdge};if(readBox.width<8)continue;
  tasks.push({group,first:last-span.length+1,last,source,box,hasTriangle:!!triangle,...(korean?{mode:'korean'}:{}),images:images.map(im=>(triangle&&!source.includes(',')&&readBox.width<=256&&readBox.width/readBox.height<=8?wideCrop(im,readBox):imaging.crop(im,readBox)).toString('base64'))});if(tasks.length===32)break outer;
 }
 tasks.push(...require('./ocr-field-review').plan(all,images,alternate,32-tasks.length));
 return tasks.slice(0,32).map(t=>({...t,occurrence:{index:all.filter(g=>compact(g.map(w=>w.text).join(''))===compact(t.group.map(w=>w.text).join(''))).indexOf(t.group),total:all.filter(g=>compact(g.map(w=>w.text).join(''))===compact(t.group.map(w=>w.text).join(''))).length}}));
}
function apply(text,tasks,results,previousCorrections=[]){
 const corrections=[];if(!Array.isArray(results)||results.length!==tasks.length*2)return {text,corrections};
 const groups=[...new Set(tasks.map(t=>t.group))],blocked=new Set();
 for(const c of previousCorrections){if(!Array.isArray(c.from)||c.from.length!==1||!Array.isArray(c.to)||c.to.length!==1||!Array.isArray(c.box)||c.box.length!==4||typeof c.from[0]!=='string'||typeof c.to[0]!=='string')continue;const matches=groups.flatMap(group=>group.map((w,index)=>({group,w,index}))).filter(({w})=>w.text===c.from[0]&&[w.x,w.y,w.w,w.h].every((v,i)=>v===c.box[i]));if(matches.length!==1)continue;const {group,w,index}=matches[0];w.text=c.to[0];for(const t of tasks)if(t.group===group&&t.first<=index&&t.last>=index)blocked.add(t);}
 const rows=text.split('\n'),locations=new Map();for(const t of tasks)if(!locations.has(t.group)){const source=compact(t.group.map(w=>w.text).join('')),matches=rows.map((r,i)=>compact(r)===source?i:-1).filter(i=>i>=0);locations.set(t.group,matches.length===t.occurrence.total?matches[t.occurrence.index]:null);}
 for(let i=0;i<tasks.length;i++){
  const t=tasks[i];if(blocked.has(t))continue;const [a,b]=results.slice(i*2,i*2+2),values=[a,b].map(r=>compact(r?.text||'')),value=t.hasTriangle?'△'+values[0].replace(/^[△-]/,''):values[0],other=t.hasTriangle?'△'+values[1].replace(/^[△-]/,''):values[1];
  if(t.kind){
   const fields=require('./ocr-field-review'),av=fields.canonical(a?.text,t),bv=fields.canonical(b?.text,t);
   if(!av||av!==bv||![a,b].every(r=>Number.isFinite(r?.score)&&r.score>=.94&&r.score<=1)||t.kind==='percent'&&![a,b].every(r=>Number.isFinite(r?.koreanScore)&&r.koreanScore>=.90&&fields.canonical(r.koreanText,t)===av))continue;
   const index=locations.get(t.group);if(!Number.isInteger(index)||av===compact(t.source))continue;const next=replaceLocated(rows[index],t.group,t.first,t.last,av);if(next===null)continue;
   corrections.push({from:[t.source],to:[av],box:Object.values(t.box),method:'two_source_'+t.kind+'_field_review',confidence:Math.min(a.score,b.score)});rows[index]=next;for(let j=t.first;j<t.last;j++)t.group[j].text='';t.group[t.last].text=av;continue;
  }
  const negative=/^[△-]/.test(value),sourceNegative=t.hasTriangle||/^[△-]/.test(t.source);if(negative!==sourceNegative)continue;
  if(!money.test(value)||value!==other||![a,b].every(r=>Number.isFinite(r?.score)&&r.score>=.94&&r.score<=1)||value===compact(t.source))continue;
  const index=locations.get(t.group);if(!Number.isInteger(index))continue;const next=replaceLocated(rows[index],t.group,t.first,t.last,value);if(next===null)continue;
  corrections.push({from:[t.source],to:[value],box:Object.values(t.box),method:'independent_numeric_model_two_source_crops',confidence:Math.min(a.score,b.score)});rows[index]=next;
  for(let j=t.first;j<t.last;j++)t.group[j].text='';t.group[t.last].text=value;
 }
 return {text:rows.join('\n'),corrections};
}
module.exports={plan,apply,trimBox};
