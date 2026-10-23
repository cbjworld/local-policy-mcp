import os
os.environ['OMP_THREAD_LIMIT']='1'
import sys,json,subprocess,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageOps
from pypdf import PdfReader
source,page,directory=sys.argv[1],int(sys.argv[2]),Path(sys.argv[3])
start=time.perf_counter()
raw=directory/'raw'
subprocess.run(['pdftoppm','-f',str(page),'-l',str(page),'-r','220','-scale-to','2700','-singlefile',source,str(raw)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=20,check=True)
Image.MAX_IMAGE_PIXELS=8000000
im=Image.open(str(raw)+'.ppm').convert('L')
if im.width*im.height>8000000:raise ValueError('OCR pixel limit')
pdfPage=PdfReader(source).pages[page-1]
width,height=float(pdfPage.mediabox.width),float(pdfPage.mediabox.height)
if int(pdfPage.get('/Rotate',0))%180:width,height=height,width
unit=float(pdfPage.get('/UserUnit',1))
sourceDpi=round(min(im.width/(width*unit),im.height/(height*unit))*72)
arr=np.array(im);ink=arr<170
def lines(a,k,axis):
 z=np.moveaxis(a,axis,1);s=np.pad(np.cumsum(z,axis=1,dtype=np.int32),((0,0),(1,0)));starts=(s[:,k:]-s[:,:-k])==k
 delta=np.zeros((z.shape[0],z.shape[1]+1),np.int32);delta[:,:starts.shape[1]]+=starts;delta[:,k:k+starts.shape[1]]-=starts
 return np.moveaxis(np.cumsum(delta[:,:-1],axis=1)>0,1,axis)
arr[lines(ink,90,1)|lines(ink,90,0)]=255
ImageOps.autocontrast(Image.fromarray(arr)).save(directory/'clean.png',compress_level=0)
prepareMs=round((time.perf_counter()-start)*1000)
import tesserocr
auditStart=time.perf_counter()
with tesserocr.PyTessBaseAPI(path=str(Path(__file__).with_name('ocr-models')),lang='kor+eng',oem=tesserocr.OEM.LSTM_ONLY,psm=tesserocr.PSM.AUTO) as api:
 api.SetImageFile(str(raw)+'.ppm');api.SetSourceResolution(sourceDpi);api.Recognize();alternateTsv=api.GetTSVText(0)
print(json.dumps({'width':im.width,'height':im.height,'dpi':220,'sourceDpi':sourceDpi,'maxDimension':2700,'prepareMs':prepareMs,'auditMs':round((time.perf_counter()-auditStart)*1000),'auditEngine':tesserocr.tesseract_version().splitlines()[0],'alternateTsv':alternateTsv}))
