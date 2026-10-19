const path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
if(process.env.POLICY_PDF_ENGINE!=='poppler')console.log('SKIP: optional Poppler tests; set POLICY_PDF_ENGINE=poppler to enable');
else{
 const python=process.env.POLICY_PYTHON||(process.platform==='win32'?'python':'python3');
 const r=spawnSync(python,[path.join(__dirname,'pdf-fast-test.py')],{encoding:'utf8',windowsHide:true});
 assert.equal(r.status,0,r.stderr||r.error?.message);process.stdout.write(r.stdout);
}
