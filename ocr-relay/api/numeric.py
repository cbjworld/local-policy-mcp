from http.server import BaseHTTPRequestHandler
import hmac,json,os,time
from numeric_reader import read
class handler(BaseHTTPRequestHandler):
 def reply(self,status,value):
  body=json.dumps(value,ensure_ascii=False).encode('utf-8');self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
 def do_GET(self):self.reply(405,dict(error='POST_REQUIRED'))
 def do_POST(self):
  token=os.environ.get('POLICY_OCR_RELAY_TOKEN','');authorization=self.headers.get('Authorization','')
  if not token or not hmac.compare_digest(authorization.encode(),('Bearer '+token).encode()):return self.reply(401,dict(error='UNAUTHORIZED'))
  try:
   length=int(self.headers.get('Content-Length','0'))
   if length<1 or length>1800000:return self.reply(413,dict(error='PAYLOAD_LIMIT'))
   body=json.loads(self.rfile.read(length));images=body['images'];modes=body.get('modes');budget=body.get('budgetMs',6000)
   if type(budget) is not int or not 500<=budget<=6000:raise ValueError('Invalid time budget')
   if modes is not None and (not isinstance(modes,list) or len(modes)*2!=len(images) or any(x not in ('numeric','korean','percent') for x in modes)):raise ValueError('Invalid modes')
   if not isinstance(images,list) or not 0<len(images)<=64 or any(not isinstance(x,str) or len(x)>160000 for x in images):raise ValueError('Invalid image batch')
  except (ValueError,KeyError,TypeError):return self.reply(400,dict(error='INVALID_CROPS'))
  try:
   start=time.monotonic();modes=body.get('modes');results=read(images,modes,body.get('budgetMs',6000))
   return self.reply(200,dict(model='PP-OCRv4 numeric + PP-OCRv5 Korean' if modes and any(x!='numeric' for x in modes) else 'PP-OCRv4 numeric',koreanStatus='unavailable' if any(x.get('koreanUnavailable') for x in results) else 'used' if modes and any(x!='numeric' for x in modes) else 'not_requested',results=results,ms=round((time.monotonic()-start)*1000)))
  except (ValueError,OSError):return self.reply(400,dict(error='INVALID_CROPS'))
  except Exception:return self.reply(503,dict(error='NUMERIC_READER_UNAVAILABLE'))
