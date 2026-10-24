const assert=require('node:assert/strict'),{deflateSync}=require('node:zlib'),im=require('./ocr-numeric-image'),{refine,replaceLocated}=require('./ocr-number-review');
const chunk=(type,data)=>{const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);return b;};
function png(width=200,height=100,points=[]){const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;const data=Buffer.alloc((width+1)*height,255);for(let y=0;y<height;y++)data[y*(width+1)]=0;for(const [x,y] of points)data[y*(width+1)+x+1]=0;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',h),chunk('IDAT',deflateSync(data)),chunk('IEND',Buffer.alloc(0))]);}
const image=im.grey(png());assert.equal(image.width,200);assert.equal(image.pixels.length,20000);assert(image.pixels.every(x=>x===255));assert.equal(im.grey(Buffer.from('bad')),null);
const tri={x:0,y:0,w:28,h:20,points:[]};for(let y=0;y<20;y++){const x=Math.round(13.5*(1-y/19));tri.points.push([x,y],[27-x,y]);}for(let x=0;x<28;x++)tri.points.push([x,19]);assert(im.triangle(tri));
assert(!im.triangle({...tri,points:tri.points.filter(p=>p[1]!==19)}));assert(!im.triangle({x:0,y:0,w:8,h:20,points:[]}));assert(!im.triangle({x:0,y:0,w:28,h:20,points:Array.from({length:560},(_,i)=>[i%28,Math.floor(i/28)])}));
const word=(text,x=20,score=94)=>`5\t1\t1\t1\t1\t1\t${x}\t20\t60\t30\t${score}\t${text}`;
async function check(original,recognized,alternate,score=94){const p={text:original+'\n',tsv:word(original,20,30)},w={setParameters:async()=>{},recognize:async()=>({data:{text:recognized,tsv:word(recognized,20,score)}})};return refine(w,png(),png(),p,word(alternate),{width:200,height:100});}
(async()=>{assert.equal((await check('8s','8호','8호')).text,'8호\n');assert.equal((await check('8s','9호','8호')).text,'8s\n');assert.equal((await check('8s','8호','8호',60)).text,'8s\n');
let calls=0;const cellWorker=text=>({setParameters:async()=>{},recognize:async()=>{calls++;return {data:{text,tsv:word(text)}};}});
const amount={text:'68000원\n',tsv:word('68000')+'\n'+word('원',100)},alternate=word('68,000')+'\n'+word('원',60);
assert.equal((await refine(cellWorker('68,000원'),png(),png(),amount,alternate,{width:200,height:100})).text,'68,000원\n');
calls=0;assert.equal((await refine(cellWorker('68,000원'),png(),png(),amount,amount.tsv,{width:200,height:100})).text,amount.text);assert.equal(calls,0);
const signedImage=png(200,100,tri.points.map(([x,y])=>[x+20,y+20])),omitted={text:'75,403,600\n',tsv:word('75,403,600',20,15)};
assert.equal((await refine(cellWorker('스75,403,600'),signedImage,signedImage,omitted,omitted.tsv,{width:200,height:100})).text,'△75,403,600\n');
assert.equal((await refine(cellWorker('스75,403,600'),png(),png(),omitted,omitted.tsv,{width:200,height:100})).text,omitted.text);
const row=(text,i,score)=>`5\t1\t1\t1\t${i+1}\t1\t20\t${20+i*40}\t60\t30\t${score}\t${text}`,labels=Array.from({length:8},(_,i)=>String(10000+i*1000));
const many={text:[...labels,'8s'].join('\n'),tsv:[...labels.map((s,i)=>row(s,i,95)),row('8s',8,30)].join('\n')},alternates=[...labels.map((s,i)=>row(s.slice(0,2)+','+s.slice(2),i,95)),row('8호',8,94)].join('\n'),seen=[];
const priorityWorker={setParameters:async()=>{},recognize:async(_,{rectangle})=>{seen.push(rectangle.top);return {data:{text:'8호',tsv:row('8호',8,94)}};}};
const prioritised=await refine(priorityWorker,png(200,500),png(200,500),many,alternates,{width:200,height:500});assert(prioritised.text.endsWith('8호'));assert(seen[0]>300);assert(prioritised.passes<=24);
const a={text:'50.500',x:20,y:20,w:60,h:30},g=[{text:'😀항목'},a];assert.equal(replaceLocated('😀항목 50.500',g,1,1,'50,500'),'😀항목 50,500');
const dup=[{text:'스'}, {text:'124,588'}];assert.equal(replaceLocated('스 124,588\n스 124,588',dup,0,1,'△124,588'),null);assert.equal(replaceLocated('스 124,588\n스 124,588',dup,0,1,'△124,588',{index:1,total:2}),'스 124,588\n△124,588');
console.log('PASS: bounded grayscale decoding, closed triangle versus open/solid/digit rejection, source-located unit repair, low-confidence/disagreement preservation and duplicate row ordering');})().catch(e=>{console.error(e);process.exitCode=1;});
