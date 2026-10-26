import importlib.util,io,json,os,sys
from pathlib import Path
root=Path(__file__).parent
sys.path.insert(0,str(root))
spec=importlib.util.spec_from_file_location('numeric_api',root/'api'/'numeric.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Fake:
 def __init__(self,body,token='Bearer test-only'):
  self.headers={'Authorization':token,'Content-Length':str(len(body))};self.rfile=io.BytesIO(body);self.wfile=io.BytesIO();self.status=None
 def reply(self,status,value):self.status=status;self.value=value
os.environ['POLICY_OCR_RELAY_TOKEN']='test-only'
def request(value,token='Bearer test-only'):
 f=Fake(json.dumps(value).encode(),token);m.handler.do_POST(f);return f
m.read=lambda images:[dict(text='3,000',score=.99) for x in images]
assert request(dict(images=['test'])).status==200
assert request(dict(images=['test']),'wrong').status==401
assert request(dict(images=[])).status==400
assert request(dict(images=['test']*65)).status==400
assert request(dict(images=[None])).status==400
f=Fake(b'{}');f.headers['Content-Length']='1800001';m.handler.do_POST(f);assert f.status==413
f=Fake(b'{}');m.handler.do_GET(f);assert f.status==405
m.read=lambda images:(_ for _ in []).throw(RuntimeError('private internals'))
f=request(dict(images=['test']));assert f.status==503 and 'private' not in str(f.value)
from numeric_reader import read
for images in [[],['eA=='],['x']*65]:
 try:read(images)
 except ValueError:pass
 else:raise AssertionError('Invalid image accepted')
print('PASS: numeric reader authentication, body/batch/PNG limits, sanitized failures and validation before model load')
