import io,base64,hashlib,math,threading,unicodedata,time,re
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
def candidates(pred,chars):
 labels=[(i,c) for i,c in enumerate(chars) if len(c)==1 and c in '0123456789,'];current={'':(1.0,0.0)}
 for row in pred:
  top=sorted(labels,key=lambda x:row[x[0]],reverse=True)[:4];nxt={}
  def add(s,b=0,n=0):
   if len(s)>24:return
   pb,pn=nxt.get(s,(0,0));nxt[s]=(pb+b,pn+n)
  for text,(pb,pn) in current.items():
   add(text,b=(pb+pn)*float(row[0]))
   for i,c in top:
    score=float(row[i])
    if score<.0001:continue
    if text.endswith(c):add(text,n=pn*score);add(text+c,n=pb*score)
    else:add(text+c,n=(pb+pn)*score)
  current=dict(sorted(nxt.items(),key=lambda x:sum(x[1]),reverse=True)[:32]);scale=max(sum(v) for v in current.values()) or 1;current={k:(v[0]/scale,v[1]/scale) for k,v in current.items()}
 return [s for s,v in sorted(current.items(),key=lambda x:sum(x[1]),reverse=True) if re.fullmatch(r'\d{1,3}(?:,\d{3})+',s)][:8]

def read(images,modes=None,budget_ms=6000):
 if type(budget_ms) is not int or not 500<=budget_ms<=6000:raise ValueError('Numeric time bounds')
 started=time.monotonic()
 import numpy as np
 from PIL import Image
 if not isinstance(images,list) or not 0<len(images)<=64:raise ValueError('Numeric batch bounds')
 if modes is not None and (not isinstance(modes,list) or len(modes)*2!=len(images) or any(x not in ('numeric','korean','percent','table') for x in modes)):raise ValueError('Numeric mode bounds')
 labels=[x for mode in modes for x in (mode,mode)] if modes is not None else ['numeric']*len(images)
 required={False} if modes is None else ({True} if all(x=='korean' for x in modes) else {False,True} if any(x in ('korean','percent') for x in modes) else {False})
 # Warm supplementary calls do not need the cold import/model reserve.
 reserve=200 if all(k in _models for k in required) else 600 if _models else 1200
 deadline=started+max(0,(budget_ms-reserve)/1000)
 prepared=[]
 for value in images:
  data=base64.b64decode(value,validate=True)
  if len(data)>120000 or not data.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('Numeric crop format')
  im=Image.open(io.BytesIO(data))
  if im.format!='PNG' or im.width<8 or im.height<8 or im.width>512 or im.height>192 or im.width/im.height>16:raise ValueError('Numeric crop bounds')
  width=math.ceil(im.width/im.height*48)
  prepared.append(np.asarray(im.convert('L').resize((width,48),Image.Resampling.BILINEAR),dtype=np.float32)/127.5-1)
 aliases={};seen={}
 for i,a in enumerate(prepared):
  key=(labels[i],a.shape,a.tobytes())
  if key in seen:aliases[i]=seen[key]
  else:seen[key]=i
 results=[None]*len(images)
 for korean in (False,True):
  indices=[i for i,mode in enumerate(labels) if i not in aliases and (mode in ('korean','percent') if korean else mode!='korean')]
  if not indices:continue
  if korean and time.monotonic()>=deadline:continue
  try:model,chars=session(korean)
  except Exception:
   if not korean:raise
   continue
  batches=[]
  widths={}
  for index in indices:widths.setdefault(max(320,prepared[index].shape[1]) if korean else 0,[]).append(index)
  for group in widths.values():batches.extend(group[offset:offset+8] for offset in range(0,len(group),8))
  for selected in batches:
   if korean and time.monotonic()>=deadline:break
   batch=[prepared[i] for i in selected];width=max(320,max(a.shape[1] for a in batch));tensor=np.zeros((len(batch),3,48,width),dtype=np.float32)
   for i,a in enumerate(batch):tensor[i,:,:,:a.shape[1]]=a
   try:preds=model.run(None,{model.get_inputs()[0].name:tensor})[0]
   except Exception:
    if not korean:raise
    break
   for index,pred in zip(selected,preds):
    positions=pred.argmax(axis=1);scores=pred.max(axis=1);keep=(positions!=0)&np.concatenate(([True],positions[1:]!=positions[:-1]))
    value=dict(text=unicodedata.normalize('NFC',''.join(chars[i] for i in positions[keep]))[:64],score=float(scores[keep].mean()) if keep.any() else 0)
    if not korean and labels[index]=='table' and time.monotonic()<deadline and (value['score']<.98 or not re.fullmatch(r'\d{1,3}(?:,\d{3})+',value['text'].replace(' ',''))):value['candidates']=candidates(pred,chars)
    if korean and labels[index]=='percent':results[index].update(koreanText=value['text'],koreanScore=value['score'],passes=2)
    else:results[index]=value
 for i,original in aliases.items():
  if results[original] is not None:results[i]={**results[original],'reused':True}
 for i,r in enumerate(results):
  if r is None:results[i]=dict(text='',score=0,koreanUnavailable=True)
  elif labels[i]=='percent' and 'koreanText' not in r:r['koreanUnavailable']=True
 return results
if __name__=='__main__':
 import sys,json,time
 start=time.monotonic();body=json.load(sys.stdin);r=read(body['images'],body.get('modes'),body.get('budgetMs',6000));json.dump(dict(model='PP-OCRv4 numeric',results=r,ms=round((time.monotonic()-start)*1000)),sys.stdout,ensure_ascii=True)
