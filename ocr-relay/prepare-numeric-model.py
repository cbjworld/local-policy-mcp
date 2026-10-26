from pathlib import Path
import hashlib,io,sys,zipfile
MODEL_SHA='48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b'
WHEEL_SHA='971d7d5f223a7a808662229df1ef69893809d8457d834e6373d3854bc1782cbf'
file=Path(__file__).with_name('numeric-model.onnx')
if not file.exists() or hashlib.sha256(file.read_bytes()).hexdigest()!=MODEL_SHA:
 packed=sys.stdin.buffer.read(16000001)
 if len(packed)>16000000 or hashlib.sha256(packed).hexdigest()!=WHEEL_SHA:raise ValueError('Numeric model package integrity')
 with zipfile.ZipFile(io.BytesIO(packed)) as z:data=z.read('rapidocr_onnxruntime/models/ch_PP-OCRv4_rec_infer.onnx')
 if len(data)>12000000 or hashlib.sha256(data).hexdigest()!=MODEL_SHA:raise ValueError('Numeric model integrity')
 file.write_bytes(data)
print('Numeric model ready: PP-OCRv4 recognition only')
