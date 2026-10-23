import sys,json,subprocess,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageOps
source,page,directory=sys.argv[1],int(sys.argv[2]),Path(sys.argv[3])
raw=directory/'raw'
subprocess.run(['pdftoppm','-f',str(page),'-l',str(page),'-r','220','-scale-to','2700','-singlefile','-png',source,str(raw)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=20,check=True)
Image.MAX_IMAGE_PIXELS=8000000
im=Image.open(str(raw)+'.png').convert('L')
if im.width*im.height>8000000:raise ValueError('OCR pixel limit')
arr=np.array(im);ink=arr<170
def lines(a,k,axis):
 z=np.moveaxis(a,axis,1);s=np.pad(np.cumsum(z,axis=1,dtype=np.int32),((0,0),(1,0)));starts=(s[:,k:]-s[:,:-k])==k
 delta=np.zeros((z.shape[0],z.shape[1]+1),np.int32);delta[:,:starts.shape[1]]+=starts;delta[:,k:k+starts.shape[1]]-=starts
 return np.moveaxis(np.cumsum(delta[:,:-1],axis=1)>0,1,axis)
arr[lines(ink,90,1)|lines(ink,90,0)]=255
ImageOps.autocontrast(Image.fromarray(arr)).save(directory/'clean.png')
print(json.dumps({'width':im.width,'height':im.height,'dpi':220,'maxDimension':2700}))
