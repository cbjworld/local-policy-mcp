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
import runpy,tempfile,shutil,http.client
from unittest.mock import patch
class Download:
 def __init__(self,host,timeout):assert host=='files.pythonhosted.org' and timeout==45;self.closed=False
 def request(self,method,path):assert method=='GET' and path.startswith('/packages/') and path.endswith('rapidocr_onnxruntime-1.4.4-py3-none-any.whl')
 def getresponse(self):return self
 def read(self,limit):assert limit==16000001;return b'invalid package'
 def close(self):self.closed=True
for status,reason in [(302,'download'),(200,'integrity')]:
 with tempfile.TemporaryDirectory() as tmp:
  script=Path(tmp)/'prepare-numeric-model.py';shutil.copyfile(root/script.name,script)
  connection=Download('files.pythonhosted.org',45);connection.status=status
  with patch.object(http.client,'HTTPSConnection',return_value=connection):
   try:runpy.run_path(str(script))
   except ValueError as error:assert reason in str(error)
   else:raise AssertionError('Invalid model download accepted')
  assert connection.closed and not (Path(tmp)/'numeric-model.onnx').exists()
print('PASS: fixed HTTPS model origin, redirects rejected, integrity enforced and connection closed')
