const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const code=`import io,sys
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject,NameObject,DecodedStreamObject
w=PdfWriter();w.add_blank_page(width=600,height=800);p=w.add_blank_page(width=600,height=800)
f=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
p[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):w._add_object(f)})})
s=DecodedStreamObject();s.set_data(b'BT /F1 12 Tf 30 700 Td (Existing text on page two) Tj ET');p[NameObject('/Contents')]=w._add_object(s)
b=io.BytesIO();w.write(b);sys.stdout.buffer.write(b.getvalue())`;
const fixture=spawnSync(process.env.POLICY_PYTHON||(process.platform==='win32'?'python':'python3'),['-c',code],{windowsHide:true});assert.equal(fixture.status,0,fixture.stderr?.toString());
const ocr=require('./ocr-reader');let count=0;ocr.read=async(bytes,{page})=>{count++;assert.equal(page,1);return{text:'지원대상: 주민\n사업비: 500만원',ocr:{engine:'test',quality:{items:[]}}};};
const {readResponse}=require('./discovery');
(async()=>{const response={bytes:fixture.stdout,url:'https://example.go.kr/mixed.pdf',type:'application/pdf'};
 const first=await readResponse(response,{page:1,ocr:true});assert.equal(count,1);assert.equal(first.parser,'tesseract');assert.deepEqual(first.pages.map(p=>p.page),[1]);assert(!first.scanComplete);
 const second=await readResponse(response,{page:2,ocr:true});assert.equal(count,1);assert.equal(second.pages.length,1);assert(second.pages[0].text.includes('Existing text'));assert(!second.ocr);
 const plain=await readResponse(response);assert.equal(plain.pages.length,2);assert.equal(count,1);
 const ev=require('./evidence').evidence([{status:'read',source:first}]);assert.equal(ev.fields.target.excerpts[0].extraction,'ocr_transcription');
 console.log('PASS: mixed PDF blank page gets OCR even beside text; text page does not OCR; exact page and OCR provenance preserved');
})().catch(e=>{console.error(e);process.exitCode=1});
