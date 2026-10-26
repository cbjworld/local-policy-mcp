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
m.read=lambda images,modes=None,budget=6000:[dict(text='3,000',score=.99) for x in images]
assert request(dict(images=['test'])).status==200
assert request(dict(images=['test']),'wrong').status==401
assert request(dict(images=[])).status==400
assert request(dict(images=['test']*65)).status==400
assert request(dict(images=[None])).status==400
assert request(dict(images=['test','test'],modes=['invalid'])).status==400
assert request(dict(images=['test','test'],modes=[True])).status==400
assert request(dict(images=['test','test'],modes=['korean'],budgetMs=7000)).status==400
assert request(dict(images=['test','test'],modes=['korean'],budgetMs=6000)).status==200
f=Fake(b'{}');f.headers['Content-Length']='1800001';m.handler.do_POST(f);assert f.status==413
f=Fake(b'{}');m.handler.do_GET(f);assert f.status==405
m.read=lambda images,modes=None,budget=6000:(_ for _ in []).throw(RuntimeError('private internals'))
f=request(dict(images=['test']));assert f.status==503 and 'private' not in str(f.value)
from numeric_reader import read
for images in [[],['eA=='],['x']*65]:
 try:read(images)
 except ValueError:pass
 else:raise AssertionError('Invalid image accepted')
print('PASS: numeric reader authentication, body/batch/PNG limits, sanitized failures and validation before model load')
import runpy,tempfile,shutil
from unittest.mock import patch
with tempfile.TemporaryDirectory() as tmp:
 script=Path(tmp)/'prepare-numeric-model.py';shutil.copyfile(root/script.name,script)
 class Input:buffer=io.BytesIO(b'invalid package')
 with patch.object(sys,'stdin',Input()):
  try:runpy.run_path(str(script))
  except ValueError as error:assert 'integrity' in str(error)
  else:raise AssertionError('Invalid model package accepted')
 assert not (Path(tmp)/'numeric-model.onnx').exists()
print('PASS: untrusted model package rejected before extraction')
from unittest.mock import patch
import numeric_reader as nr
import numpy as np
from PIL import Image
buffer=io.BytesIO();Image.new('L',(32,32),255).save(buffer,format='PNG');encoded=__import__('base64').b64encode(buffer.getvalue()).decode()
class FakeModel:
 def get_inputs(self):return [type('Input',(),dict(name='x'))()]
 def run(self,_,feed):
  count=feed['x'].shape[0];out=np.zeros((count,3,3),dtype=np.float32);out[:,0,0]=1;out[:,1,1]=1;out[:,2,0]=1;return [out]
def missing(korean):
 if korean:raise RuntimeError('auxiliary unavailable')
 return FakeModel(),['blank','1','0']
with patch.object(nr,'session',side_effect=missing):
 result=nr.read([encoded]*4,['numeric','korean']);assert result[0]['text']=='1' and result[1]['text']=='1';assert result[2]['koreanUnavailable'] and result[3]['koreanUnavailable']
 result=nr.read([encoded]*2,['percent']);assert result[0]['text']=='1' and result[0]['koreanUnavailable']
 result=nr.read([encoded]*2,['korean'],500);assert all(x['koreanUnavailable'] for x in result)
for modes,budget in [(['invalid'],6000),(['numeric'],True),(['korean'],7000)]:
 try:nr.read([encoded]*2,modes,budget)
 except ValueError:pass
 else:raise AssertionError('Untrusted numeric mode/time accepted')
print('PASS: bounded modes/deadline and Korean model failure preserve completed numeric results')

wide_buffer=io.BytesIO();Image.new('L',(256,32),255).save(wide_buffer,format='PNG');wide_encoded=__import__('base64').b64encode(wide_buffer.getvalue()).decode()
widths_seen=[]
class WidthModel(FakeModel):
 def run(self,_,feed):
  widths_seen.append(feed['x'].shape[3]);return super().run(_,feed)
with patch.object(nr,'session',return_value=(WidthModel(),['blank','1','0'])):
 result=nr.read([encoded,wide_encoded,encoded,wide_encoded],['korean','korean'])
 assert widths_seen==[320,384] and all(x['text']=='1' for x in result)
print('PASS: Korean crops use stable padding regardless of wider neighboring cells')
