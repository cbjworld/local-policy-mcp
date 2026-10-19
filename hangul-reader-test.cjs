const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),fs=require('node:fs'),path=require('node:path'),{createReader}=require('./hangul-reader');
async function main(){
 const children=[];const fake=()=>{const c=new EventEmitter();c.jobs=[];c.kill=()=>{c.killed=true;};c.send=(j,cb)=>{c.jobs.push(j);cb();};children.push(c);return c;};
 const r=createReader(fake),opts={page:1,q:''};
 const a=r.read(Buffer.from('a'),opts),b=r.read(Buffer.from('b'),opts),c=r.read(Buffer.from('c'),opts);
 await assert.rejects(r.read(Buffer.from('d'),opts),/대기/);assert.equal(children.length,1);
 for(const [i,promise] of [a,b,c].entries()){const job=children[0].jobs.at(-1);assert.equal(job.bytes.toString(),String.fromCharCode(97+i));children[0].emit('message',{id:job.id,result:{pages:[{page:null,text:String(i)}]}});assert.equal((await promise).pages[0].text,String(i));}
 for(let i=0;i<6;i++){const p=r.read(Buffer.from('x'),opts),child=children.at(-1),job=child.jobs.at(-1);child.emit('message',{id:job.id,result:{pages:[]}});await p;}
 assert.equal(children.length,2);assert(children[0].killed);
 const wrong=r.read(Buffer.from('bad'),opts);children.at(-1).emit('message',{id:-1,result:{pages:[]}});await assert.rejects(wrong,/불일치/);
 const large=r.read(Buffer.from('x'),opts),largeChild=children.at(-1);largeChild.emit('message',{id:largeChild.jobs.at(-1).id,result:{pages:[{text:'x'.repeat(1500001)}]}});await assert.rejects(large,/출력 제한/);
 const dying=r.read(Buffer.from('a'),opts),waiting=r.read(Buffer.from('b'),opts);const pending=Promise.allSettled([dying,waiting]);children.at(-1).emit('exit',1);assert((await pending).every(x=>x.status==='rejected'));
 await assert.rejects(r.read(Buffer.alloc(15*1024*1024+1),opts),/15MB/);r.close();
 const set=global.setTimeout;let expire;global.setTimeout=fn=>{expire=fn;return {unref(){}};};
 try{const timed=createReader(fake),p=timed.read(Buffer.from('x'),opts);expire();await assert.rejects(p,/30초/);timed.close();}finally{global.setTimeout=set;}
 const real=createReader();try{
  const template=fs.readFileSync(path.join(path.dirname(require.resolve('kordoc')),'../templates/일반기안문_서식.hwpx'));
  const first=await real.read(template,opts),second=await real.read(template,{page:1,q:'absent-query-713950'});
  assert.equal(first.format,'hwpx');assert(first.pages[0].text);assert.equal(first.pages[0].page,null);assert.deepEqual(second.pages,[]);
  await assert.rejects(real.read(Buffer.from('not a document'),opts));assert.deepEqual((await real.read(template,opts)).pages,first.pages);
 }finally{real.close();}
 const discovery=require('./discovery'),template=fs.readFileSync(path.join(path.dirname(require.resolve('kordoc')),'../templates/일반기안문_서식.hwpx')),aStore=new Map(),bStore=new Map();
 const [aSource,bSource]=await Promise.all([discovery.withSources(aStore,()=>discovery.readResponse({bytes:template,url:'https://example.go.kr/a.hwpx',type:'application/octet-stream'})),discovery.withSources(bStore,()=>discovery.readResponse({bytes:template,url:'https://example.go.kr/b.hwpx',type:'application/octet-stream'},{q:'absent-query-713950'}))]);
 assert.equal(aStore.size,1);assert.equal(bStore.size,1);assert(aStore.has(aSource.sourceId));assert(!aStore.has(bSource.sourceId));assert(bStore.has(bSource.sourceId));assert.deepEqual(bSource.pages,[]);
 console.log('PASS: isolated HWP jobs, FIFO, bounded input/queue, recycle after eight, protocol/exit failure recovery, real HWPX and query separation; no OCR');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
