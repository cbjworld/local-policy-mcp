const assert=require('assert/strict'),{refine,candidates}=require('./ocr-number-review');
const t=(text,x=30,score=94,line=1)=>`5\t1\t1\t1\t${line}\t1\t${x}\t40\t80\t30\t${score}\t${text}`;
const primary={text:'임신(1주 이상)\n',tsv:t('임신(1주')+'\n'+t('이상)',120)},alt=t('임신(12주')+'\n'+t('이상)',120),size={width:300,height:200};
async function run(a='임신(12주 이상)',b=a,score=94,p=primary){let calls=0;const w={setParameters:async()=>{},recognize:async()=>{const text=calls++?b:a;return {data:{text,tsv:t(text,30,score)}};}};return {result:await refine(w,'raw','clean',p,alt,size),calls};}
(async()=>{let r=await run();assert.equal(r.result.text,'임신(12주 이상)\n');assert.equal(r.result.corrections.length,1);assert.equal(r.calls,2);
assert.equal((await run('임신(12주 이상)','임신(19주 이상)')).result.text,primary.text);
assert.equal((await run('임신(19주 이상)')).result.text,primary.text);
assert.equal((await run('임신(12주 미만)')).result.text,primary.text);
assert.equal((await run('임신(12주 이상)',undefined,60)).result.text,primary.text);
assert.equal((await run('임신(12주 이상)',undefined,94,{...primary,text:primary.text+primary.text})).result.text,primary.text+primary.text);
assert.equal(candidates(primary.tsv,primary.tsv,size).length,0);
const many=Array.from({length:8},(_,i)=>t('1주',30,94,i+1)).join('\n'),manyAlt=many.replaceAll('1주','12주');assert(candidates(many,manyAlt,size).length<=4);
const failure=await refine({setParameters:async()=>{throw Error();}},'r','c',primary,alt,size);assert.equal(failure.text,primary.text);
console.log('PASS: source-located numeric repair, two crop agreement, alternate confirmation, low-confidence/context/duplicate rejection, bounded retries and failure preservation');})().catch(e=>{console.error(e);process.exitCode=1;});
