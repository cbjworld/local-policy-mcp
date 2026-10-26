import io,base64,hashlib,math,threading,unicodedata,time
from pathlib import Path
MODELS={False:('numeric-model.onnx','48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b'),True:('korean-model.onnx','cd6e2ea50f6943ca7271eb8c56a877a5a90720b7047fe9c41a2e541a25773c9b')}
_models={}
_lock=threading.Lock()
def session(korean):
 import onnxruntime as ort
 with _lock:
  if korean not in _models:
   name,wanted=MODELS[korean];model=Path(__file__).with_name(name)
   if hashlib.sha256(model.read_bytes()).hexdigest()!=wanted:raise ValueError('Numeric model integrity')
   options=ort.SessionOptions();options.intra_op_num_threads=1;options.inter_op_num_threads=1
   model_session=ort.InferenceSession(str(model),sess_options=options,providers=['CPUExecutionProvider'])
   _models[korean]=(model_session,['blank']+model_session.get_modelmeta().custom_metadata_map['character'].splitlines()+[' '])
 return _models[korean]
def read(images,modes=None,budget_ms=6000):
 if type(budget_ms) is not int or not 500<=budget_ms<=6000:raise ValueError('Numeric time bounds')
 deadline=time.monotonic()+max(0,(budget_ms-1200)/1000)
 import numpy as np
 from PIL import Image
 if not isinstance(images,list) or not 0<len(images)<=64:raise ValueError('Numeric batch bounds')
 if modes is not None and (not isinstance(modes,list) or len(modes)*2!=len(images) or any(x not in ('numeric','korean','percent') for x in modes)):raise ValueError('Numeric mode bounds')
 labels=[x for mode in modes for x in (mode,mode)] if modes is not None else ['numeric']*len(images)
 prepared=[]
 for value in images:
  data=base64.b64decode(value,validate=True)
  if len(data)>120000 or not data.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('Numeric crop format')
  im=Image.open(io.BytesIO(data))
  if im.format!='PNG' or im.width<8 or im.height<8 or im.width>512 or im.height>192 or im.width/im.height>16:raise ValueError('Numeric crop bounds')
  width=math.ceil(im.width/im.height*48)
  prepared.append(np.asarray(im.convert('L').resize((width,48),Image.Resampling.BILINEAR),dtype=np.float32)/127.5-1)
 results=[None]*len(images)
 for korean in (False,True):
  indices=[i for i,mode in enumerate(labels) if (mode!='numeric' if korean else mode!='korean')]
  if not indices:continue
  if korean and time.monotonic()>=deadline:continue
  try:model,chars=session(korean)
  except Exception:
   if not korean:raise
   continue
  for offset in range(0,len(indices),8):
   if korean and time.monotonic()>=deadline:break
   selected=indices[offset:offset+8];batch=[prepared[i] for i in selected];width=max(320,max(a.shape[1] for a in batch));tensor=np.zeros((len(batch),3,48,width),dtype=np.float32)
   for i,a in enumerate(batch):tensor[i,:,:,:a.shape[1]]=a
   try:preds=model.run(None,{model.get_inputs()[0].name:tensor})[0]
   except Exception:
    if not korean:raise
    break
   for index,pred in zip(selected,preds):
    positions=pred.argmax(axis=1);scores=pred.max(axis=1);keep=(positions!=0)&np.concatenate(([True],positions[1:]!=positions[:-1]))
    value=dict(text=unicodedata.normalize('NFC',''.join(chars[i] for i in positions[keep]))[:64],score=float(scores[keep].mean()) if keep.any() else 0)
    if korean and labels[index]=='percent':results[index].update(koreanText=value['text'],koreanScore=value['score'],passes=2)
    else:results[index]=value
 for i,r in enumerate(results):
  if r is None:results[i]=dict(text='',score=0,koreanUnavailable=True)
  elif labels[i]=='percent' and 'koreanText' not in r:r['koreanUnavailable']=True
 return results
if __name__=='__main__':
 import sys,json,time
 start=time.monotonic();body=json.load(sys.stdin);r=read(body['images'],body.get('modes'),body.get('budgetMs',6000));json.dump(dict(model='PP-OCRv4 numeric',results=r,ms=round((time.monotonic()-start)*1000)),sys.stdout,ensure_ascii=True)
