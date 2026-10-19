const http=require('node:http'),handler=require('./api/seoul');
if(!process.env.POLICY_SEOUL_RELAY_TOKEN||process.env.POLICY_SEOUL_RELAY_TOKEN.length<32)throw Error('POLICY_SEOUL_RELAY_TOKEN is required');
http.createServer((req,res)=>{if(req.url==='/api/seoul')return handler(req,res);res.statusCode=404;res.end();}).listen(Number(process.env.PORT||3001),process.env.HOST||'127.0.0.1',()=>console.error('Seoul public source reader ready'));
