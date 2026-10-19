const assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const python=process.env.POLICY_PYTHON||(process.platform==='win32'?'python':'python3');
const r=spawnSync(python,['-S',path.join(__dirname,'extract-source.py'),JSON.stringify({url:'https://example.go.kr/a.pdf',q:'',page:1})],{input:Buffer.from('%PDF-1.4\n'),encoding:'utf8',windowsHide:true,env:{...process.env,POLICY_PDF_ENGINE:'pypdf'}});
if(r.error)throw r.error;
assert.equal(r.status,1);assert.equal(r.stderr,'MISSING_PYPDF');assert.equal(r.stdout,'');
console.log('PASS: missing PDF dependency has a bounded diagnostic, no source text or traceback returned');
