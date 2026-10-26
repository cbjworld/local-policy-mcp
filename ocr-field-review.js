const {words,overlap}=require('./ocr-quality'),imaging=require('./ocr-numeric-image');
const compact=s=>s.normalize('NFC').replace(/\s/g,'');
function canonical(text,task){
 if(typeof text!=='string'||text.length>64)return null;let value=compact(text);
 if(task.kind==='integer')return /^\d{1,3}$/.test(value)&&(value===task.alternate||/^\d{2}$/.test(task.alternatePrefix||'')&&/^\d{3}$/.test(value)&&value.startsWith(task.alternatePrefix))?value:null;
 if(task.kind==='percent'){
  value=value.replace(/^\((.*)\)$/,'$1');const m=/^(\d{1,4}(?:\.\d{1,3})?)%(p)?$/.exec(value);return m&&Number(m[1])<=10000?value:null;
 }
 if(task.kind==='date'){
  const m=/^((?:19|20)\d{2})년(\d{1,2})월(\d{1,2})일(?:\([월화수목금토일]\))?$/.exec(value);if(!m)return null;
  const [year,month,day]=m.slice(1).map(Number),d=new Date(Date.UTC(year,month-1,day));return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?value:null;
 }
 if(task.kind!=='unit')return null;value=value.replace(/[,，]$/,'');
 if(!/^(?:(?:연간|월간|매월|매년)?(?:최대|최소))?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:조|억|만|천|원)(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:억|만|천|원))*원?$/.test(value))return null;
 if(task.prefix&&!value.startsWith(task.prefix)||value.endsWith('원원'))return null;
 const order={조:4,억:3,만:2,천:1,원:0};let previous=5;for(const m of value.matchAll(/\d[\d,]*(?:\.\d+)?(조|억|만|천|원)/g)){if(order[m[1]]>=previous)return null;previous=order[m[1]];}
 return value.replace(/\d[\d,]*(?:\.\d+)?/g,n=>{const [integer,decimal]=n.replace(/,/g,'').split('.');return integer.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(decimal===undefined?'':'.'+decimal);});
}
function plan(groups,images,alternate,limit){
 const financial=/예산|회계|지원|사업|비용|세입|세출|[조억만원]/.test(groups.flatMap(g=>g.map(w=>w.text)).join('')),other=words(alternate||''),tasks=[],used=new Set();if(limit<=0)return tasks;
 function add(group,first,last,kind,{rightPad=8,leftPad=8,area,prefix,alternate,alternatePrefix,mode}={}){
  if(tasks.length>=Math.min(8,limit)||last<first)return;const key=groups.indexOf(group)+':'+first+':'+last;if(used.has(key))return;
  const span=group.slice(first,last+1);let verticalPad=8;if(kind==='unit'&&!area){const found=other.filter(a=>/\d/.test(a.text)&&span.some(w=>overlap(w,a)>=.4)),xs=span.map(w=>w.x),ys=span.map(w=>w.y),l=Math.max(0,Math.min(...xs)),r=Math.min(images[0].width,Math.max(...span.map(w=>w.x+w.w))),t=Math.max(0,Math.min(...ys)),b=Math.min(images[0].height,Math.max(...span.map(w=>w.y+w.h)));let mid=0,total=0;for(let y=t;y<b;y+=2)for(let x=l;x<r;x+=2){const v=images[0].pixels[y*images[0].width+x];total++;if(v>80&&v<210)mid++;}if(found.length>=2&&found.length<=4&&mid>total*.5){area={x:Math.min(...found.map(a=>a.x)),y:Math.min(...found.map(a=>a.y)),w:0,h:0};area.w=Math.max(...found.map(a=>a.x+a.w))-area.x;area.h=Math.max(...found.map(a=>a.y+a.h))-area.y;leftPad=rightPad=verticalPad=4;}}const left=Math.max(0,(area?.x??Math.min(...span.map(w=>w.x)))-leftPad),top=Math.max(0,(area?.y??Math.min(...span.map(w=>w.y)))-verticalPad),right=Math.min(images[0].width,(area?area.x+area.w:Math.max(...span.map(w=>w.x+w.w)))+rightPad),bottom=Math.min(images[0].height,(area?area.y+area.h:Math.max(...span.map(w=>w.y+w.h)))+verticalPad);
  if(right<=left||bottom<=top||right-left>512||bottom-top>256)return;const box=imaging.trimBox(images[0],{left,top,width:right-left,height:bottom-top});if(box.width<8||box.height<8||box.height>192||box.width/box.height>16)return;
  if(kind!=='date'&&span.some(w=>imaging.sign(images[0],w)))return;
  tasks.push({group,first,last,source:span.map(w=>w.text).join(''),box,kind,mode:mode||(kind==='percent'?'percent':kind==='integer'?'numeric':'korean'),prefix,alternate,alternatePrefix,images:images.map(im=>imaging.crop(im,box).toString('base64'))});used.add(key);
 }
 for(const group of groups)for(let i=0;i<group.length;i++){
  if(tasks.length>=Math.min(8,limit))return tasks;
  const w=group[i];if(w.confidence>=85||! /^(?:19|20)\d{2}[\d년A-Z]*$/i.test(w.text))continue;let numbers=0,last=i;
  for(let j=i;j<Math.min(group.length,i+6);j++){const a=group[j];if(j>i&&(a.x-group[j-1].x-group[j-1].w>Math.max(40,Math.max(a.h,group[j-1].h)*1.5)||! /^[\d년월일A-Z!%\[\]().]+$/i.test(a.text)))break;if(/\d/.test(a.text))numbers++;last=j;if(numbers===3){if(group[j+1]?.text==='일')last=j+1;break;}}
  if(numbers===3)add(group,i,last,'date');
 }
 for(const group of groups)for(let i=0;i<group.length;i++){
  if(tasks.length>=Math.min(8,limit))return tasks;
  if(!/^(최|최대|최소)$/.test(group[i].text))continue;const first=i>0&&/^(연간|월간|매월|매년)$/.test(group[i-1].text)?i-1:i;let last=i;
  for(let j=i+1;j<Math.min(group.length,i+6);j++){const a=group[j];if(a.x-group[j-1].x-group[j-1].w>120||! /^[\d,.만천억원\[\]A-Z]+$/i.test(a.text))break;last=j;}
  if(last>i)add(group,first,last,'unit',{rightPad:Math.max(8,...group.slice(first,last+1).map(w=>w.h)),prefix:group.slice(first,i+1).map(w=>w.text).join('')});
 }
 for(const group of groups)for(let i=0;i<group.length;i++){
  if(tasks.length>=Math.min(8,limit))return tasks;
  const w=group[i];if(financial&&w.confidence<85&&/^[A-Z]{2,6}$/.test(w.text)){const a=other.find(a=>a.confidence>=90&&/^\d{2}$/.test(a.text)&&overlap(w,a)>=.4);if(a){let boundary=null;for(let x=a.x+a.w;x<w.x+w.w;x++){let ink=0,count=0;for(let y=Math.max(0,w.y-w.h);y<Math.min(images[0].height,w.y+w.h*2);y++){count++;if(images[0].pixels[y*images[0].width+x]<170)ink++;}if(ink>count*.9){boundary=x;break;}}if(boundary){add(group,i,i,'integer',{area:{x:w.x,y:a.y,w:boundary-w.x,h:a.h},leftPad:4,rightPad:0,alternatePrefix:a.text,mode:'percent'});continue;}}}if(w.confidence>=85||! /\d/.test(w.text)||w.h<8||! /^[\d,.%pP()!|\[\]A-Z]+$/.test(w.text))continue;
  const alternatives=other.filter(a=>overlap(w,a)>=.4).sort((a,b)=>overlap(w,b)-overlap(w,a)),a=alternatives[0],integer=a?.text.replace(/[|.,]+$/,'');
  if(/^\d{1,3}$/.test(w.text)&&a?.confidence>=90&&/^\d{1,3}$/.test(integer)&&integer!==w.text){add(group,i,i,'integer',{area:a,alternate:integer});continue;}
  const percent=/%/.test(w.text)||a&&/%|\.\d{2}96\)?$/.test(a.text);if(percent){add(group,i,i,'percent',{area:a&&a.h<w.h*.8?a:undefined});continue;}
  if(!financial||(w.text.match(/\d/g)||[]).length<3)continue;let first=i,last=i;
  if(group[i-1]?.confidence<60&&/^[가-힣]$/.test(group[i-1].text)&&w.x-group[i-1].x-group[i-1].w<=12)first--;
  for(let j=i+1;j<Math.min(group.length,i+3);j++){const n=group[j];if(n.x-group[j-1].x-group[j-1].w>12||! /^(조|억|만|천|원|만원|억원|[가-힣])$/.test(n.text))break;if(! /^(조|억|만|천|원|만원|억원)$/.test(n.text)&&n.confidence>=60)break;last=j;}
  add(group,first,last,'unit',{leftPad:first<i?Math.max(8,Math.round(w.h*1.5)):8});
 }
 return tasks;
}
module.exports={plan,canonical};
