Warning: truncated output (original token count: 3960)
Total output lines: 45

const discovery=require('./discovery.js'),portal=require('./open-portal.js');
let initialized=false,ready=false,pending='';
const annotations={readOnlyHint:true,destructiveHint:false,openWorldHint:f…3860 tokens truncated…n'))>=0){const s=pending.slice(0,i);pending=pending.slice(i+1);if(s.trim())queue=queue.then(()=>line(s));}});
process.stdin.on('end',()=>{if(pending.trim())queue=queue.then(()=>line(pending));});

