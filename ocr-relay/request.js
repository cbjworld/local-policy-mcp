const {timingSafeEqual}=require('node:crypto');
function png(value){
 if(typeof value!=='string'||value.length>2800000||!value.length||value.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Invalid PNG');
 const b=Buffer.from(value,'base64');
 if(b.length<33||!b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))||b.readUInt32BE(8)!==13||b.toString('ascii',12,16)!=='IHDR')throw Error('Invalid PNG');
 const width=b.readUInt32BE(16),height=b.readUInt32BE(20);
 if(width<1||height<1||width>2700||height>2700||width*height>8000000)throw Error('Invalid image bounds');
 return {bytes:b,width,height};
}
function authorize(req,res){
 const reply=(status,value)=>{res.setHeader('Cache-Control','no-store');res.status(status).json(value);};
 if(req.method!=='POST'){reply(405,{error:'POST_REQUIRED'});return false;}
 const token=process.env.POLICY_OCR_RELAY_TOKEN,authorization=req.headers.authorization||'',expected=Buffer.from('Bearer '+token);
 if(!token||typeof authorization!=='string'||Buffer.byteLength(authorization)!==expected.length||!timingSafeEqual(Buffer.from(authorization),expected)){reply(401,{error:'UNAUTHORIZED'});return false;}
 if(Number(req.headers['content-length'])>3900000||!req.body||JSON.stringify(req.body).length>3900000){reply(413,{error:'PAYLOAD_LIMIT'});return false;}
 return true;
}
module.exports={png,authorize};
