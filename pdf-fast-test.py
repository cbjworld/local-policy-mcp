import importlib.util, os, io, json, subprocess, sys
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
root=os.path.dirname(__file__)
spec=importlib.util.spec_from_file_location('pdf_fast',os.path.join(root,'pdf_fast.py'))
engine=importlib.util.module_from_spec(spec); spec.loader.exec_module(engine)
writer=PdfWriter()
for i in range(8):
    page=writer.add_blank_page(width=600,height=800)
    font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
    page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})})
    stream=DecodedStreamObject();stream.set_data(('BT /F1 12 Tf 30 700 Td (Budget 58800 page '+str(i+1)+') Tj ET').encode())
    page[NameObject('/Contents')]=writer._add_object(stream)
buf=io.BytesIO();writer.write(buf);data=buf.getvalue()
r=engine.extract(data,1)
assert r['totalPages']==8 and r['scannedThroughPage']==6 and not r['scanComplete']
assert [p['page'] for p in r['pages']]==list(range(1,7))
assert all('Budget 58800 page '+str(p['page']) in p['text'] for p in r['pages'])
last=engine.extract(data,7);assert last['scanComplete'] and [p['page'] for p in last['pages']]==[7,8]
for payload,start in [(data,9),(b'not PDF',1)]:
    try: engine.extract(payload,start);raise AssertionError('accepted invalid PDF/range')
    except ValueError: pass
writer.encrypt('secret');buf=io.BytesIO();writer.write(buf)
try: engine.extract(buf.getvalue(),1);raise AssertionError('accepted encrypted PDF')
except ValueError: pass
for q in ['', 'Budget']:
    response=subprocess.run([sys.executable,os.path.join(root,'extract-source.py'),json.dumps({'url':'https://example.go.kr/a.pdf','q':q,'page':1})],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=dict(os.environ,POLICY_PDF_ENGINE='poppler'),check=True)
    result=json.loads(response.stdout)
    assert result.get('parser')==('poppler' if not q else None)
    assert len(result['pages'])==6
print('PASS: fast PDF page mapping, six-page bound, continuation, literal text, encrypted/corrupt rejection and query fallback; no OCR')
