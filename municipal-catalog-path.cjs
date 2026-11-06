const fs=require('node:fs'),path=require('node:path');
module.exports=function municipalCatalogPath(){
 if(process.env.POLICY_MUNICIPAL_CATALOG)return process.env.POLICY_MUNICIPAL_CATALOG;
 const bundled=path.join(__dirname,'data','municipal-kogl1-20261106.json');
 return fs.existsSync(bundled)?bundled:null;
};
