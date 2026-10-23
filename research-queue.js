function createQueue({limit=20,waitMs=30000,concurrency=1}={}){
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw Error('Invalid research concurrency');
 let active=0;const waiting=[];
 return async function run(task){
  if(active>=concurrency){
   if(waiting.length>=limit)throw Error('문서 조회 대기열이 가득 찼습니다. 잠시 후 다시 요청하세요.');
   await new Promise((resolve,reject)=>{
    const entry={wake:()=>{clearTimeout(timer);resolve();}};
    const timer=setTimeout(()=>{const i=waiting.indexOf(entry);if(i>=0)waiting.splice(i,1);reject(Error('문서 조회 대기 시간이 지났습니다. 잠시 후 다시 요청하세요.'));},waitMs);
    waiting.push(entry);
   });
  }else active++;
  try{return await task();}finally{const next=waiting.shift();if(next)next.wake();else active--;}
 };
}
module.exports={createQueue};
