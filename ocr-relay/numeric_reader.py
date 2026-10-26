import io,base64,hashlib,math
from pathlib import Path
MODEL_SHA='48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b'
_session=None
_chars=None
def read(images):
 import numpy as np
 from PIL import Image
 global _session,_chars
 if not isinstance(images,list) or not 0<len(images)<=64:raise ValueError('Numeric batch bounds')
 prepared=[]
 for value in images:
  data=base64.b64decode(value,validate=True)
  if len(data)>120000 or not data.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('Numeric crop format')
  im=Image.open(io.BytesIO(data))
  if im.format!='PNG' or im.width<8 or im.height<8 or im.width>512 or im.height>192 or im.width/im.height>16:raise ValueError('Numeric crop bounds')
  width=math.ceil(im.width/im.height*48)
  prepared.append(np.asarray(im.convert('L').resize((width,48),Image.Resampling.BILINEAR),dtype=np.float32)/127.5-1)
 import onnxruntime as ort
 if _session is None:
  model=Path(__file__).with_name('numeric-model.onnx')
  if hashlib.sha256(model.read_bytes()).hexdigest()!=MODEL_SHA:raise ValueError('Numeric model integrity')
  options=ort.SessionOptions();options.intra_op_num_threads=1;options.inter_op_num_threads=1
  _session=ort.InferenceSession(str(model),sess_options=options,providers=['CPUExecutionProvider'])
  _chars=['blank']+_session.get_modelmeta().custom_metadata_map['character'].splitlines()+[' ']
 results=[]
 for offset in range(0,len(prepared),8):
  batch=prepared[offset:offset+8];width=max(320,max(a.shape[1] for a in batch));tensor=np.zeros((len(batch),3,48,width),dtype=np.float32)
  for i,a in enumerate(batch):tensor[i,:,:,:a.shape[1]]=a
  preds=_session.run(None,{_session.get_inputs()[0].name:tensor})[0]
  for pred in preds:
   indices=pred.argmax(axis=1);scores=pred.max(axis=1);select=(indices!=0)&np.concatenate(([True],indices[1:]!=indices[:-1]))
   results.append(dict(text=''.join(_chars[i] for i in indices[select])[:64],score=float(scores[select].mean()) if select.any() else 0))
 return results
if __name__=='__main__':
 import sys,json,time
 start=time.monotonic();r=read(json.load(sys.stdin)['images']);json.dump(dict(model='PP-OCRv4 numeric',results=r,ms=round((time.monotonic()-start)*1000)),sys.stdout,ensure_ascii=True)
