const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const dir=path.resolve(process.argv[2]||path.join(os.tmpdir(),'local-policy-ocr-runner'));
if(fs.existsSync(dir)&&fs.readdirSync(dir).length&&(!fs.existsSync(path.join(dir,'package.json'))||JSON.parse(fs.readFileSync(path.join(dir,'package.json'))).name!=='local-policy-ocr-runner'))throw Error('Choose an empty deployment directory');
for(const name of ['package.json','package-lock.json','vercel.json','api/ocr.js','api/ocr-audit.js','request.js','remote-audit.js','public/index.html']){const target=path.join(dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(__dirname,'ocr-relay',name),target);}
for(const name of ['ocr-quality.js','ocr-number-review.js','ocr-numeric-image.js','prepare-ocr-models.cjs'])fs.copyFileSync(path.join(__dirname,name),path.join(dir,name));
fs.writeFileSync(path.join(dir,'.gitignore'),'node_modules/\n.vercel/\n.env*\n');
console.log(dir);
