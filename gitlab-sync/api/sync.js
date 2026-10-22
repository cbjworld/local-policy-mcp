const crypto=require('node:crypto'),{synchronize}=require('../sync');
let busy=false;
module.exports=async(req,res)=>{
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 const send=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
 if(req.method!=='POST')return send(405,{error:'POST_REQUIRED'});
 const token=process.env.GITLAB_SYNC_TOKEN;
 if(!token||token.length<20)return send(503,{error:'SYNC_NOT_CONFIGURED'});
 const supplied=Buffer.from(req.headers.authorization||''),wanted=Buffer.from('Bearer '+token);
 if(supplied.length!==wanted.length||!crypto.timingSafeEqual(supplied,wanted))return send(401,{error:'UNAUTHORIZED'});
 let body=req.body;
 try{if(Buffer.isBuffer(body))body=body.toString('utf8');if(typeof body==='string'){if(body.length>200)return send(400,{error:'INVALID_REQUEST'});body=JSON.parse(body);}}catch{return send(400,{error:'INVALID_REQUEST'});}
 if(!body||Object.keys(body).length!==1||typeof body.commit!=='string'||!/^[a-f0-9]{40}$/.test(body.commit))return send(400,{error:'INVALID_COMMIT'});
 if(busy)return send(409,{error:'SYNC_BUSY'});busy=true;
 const started=Date.now();
 try{return send(200,{...await synchronize(body.commit,token),region:process.env.VERCEL_REGION,ms:Date.now()-started});}
 catch(error){const known=['NON_FAST_FORWARD_OR_HISTORY_GAP','PUSH_VERIFICATION_FAILED','SYNC_DOWNLOAD_LIMIT','SYNC_DEADLINE','REDIRECT_BLOCKED','UNEXPECTED_REMOTE','CREDENTIAL_DESTINATION_BLOCKED'];const gitErrors=['HttpError','GitPushError','ParseError','InternalError','NotFoundError','MissingParameterError','UnknownTransportError'];return send(502,{error:error.safePushReason?'PUSH_REJECTED '+error.safePushReason:known.includes(error.message)?error.message:'SYNC_FAILED',code:gitErrors.includes(error.code)?error.code:'OTHER',httpStatus:Number.isInteger(error.data?.statusCode)?error.data.statusCode:undefined,region:process.env.VERCEL_REGION});}
 finally{busy=false;}
};
