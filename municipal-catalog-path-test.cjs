const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const env={...process.env};delete env.POLICY_MUNICIPAL_CATALOG;
const run=e=>spawnSync(process.execPath,['-e',"const a=require('./municipal-homepage-search.cjs').search({q:'산후조리비',institution:'안산시'});console.log(JSON.stringify({dataset:a.scope.dataset,total:a.scope.totalSources,found:a.total}))"],{cwd:__dirname,env:e,encoding:'utf8'});
const bundled=run(env);assert.equal(bundled.status,0,bundled.stderr);assert.deepEqual(JSON.parse(bundled.stdout),{dataset:'bundled_sample',total:12,found:1});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'policy-catalog-'));try{
 const sample=JSON.parse(fs.readFileSync(path.join(__dirname,'data','municipal-kogl1-20261106.json'),'utf8'));const file=path.join(dir,'custom.json');fs.writeFileSync(file,JSON.stringify({sources:sample.sources.filter(x=>x.source.includes('ansan.go.kr'))}));
 const configured=run({...env,POLICY_MUNICIPAL_CATALOG:file});assert.equal(configured.status,0,configured.stderr);assert.deepEqual(JSON.parse(configured.stdout),{dataset:'configured',total:1,found:1});
 const invalid=run({...env,POLICY_MUNICIPAL_CATALOG:path.join(dir,'missing.json')});assert.notEqual(invalid.status,0,'an invalid explicit path must not silently use the bundled sample');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log('PASS: bundled sample loads without setup; explicit catalog wins and invalid override fails');
