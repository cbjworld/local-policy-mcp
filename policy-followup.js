const keys=['target','activity','budget','period'];
function missingFields(result){
 if(result?.status!=='read'||result.relevanceStatus==='supporting_document'||result.targetFit?.status==='mismatch')return [...keys];
 return keys.filter(key=>key==='target'&&result.targetFit?.requested?.length&&result.targetFit.status==='unspecified'||!result.evidence?.fields?.[key]?.excerpts?.some(e=>['evidence_candidate','redacted'].includes(e.status)&&e.quote));
}
function sameProject(a,b){
 const {identity}=require('./project-bundles'),x=identity(a),y=identity(b);
 return !!(a.institution&&b.institution&&x.year&&y.year&&x.key===y.key);
}
function sameBusiness(a,b){
 if(sameProject(a,b))return true;
 const {identity}=require('./project-bundles'),x=identity(a),y=identity(b);
 if(!a.institution||a.institution!==b.institution||!x.year||x.year!==y.year||(a.department||'')!==(b.department||''))return false;
 const name=s=>s.replace(/\((?:안|수정|변경)\)/g,'').replace(/(?:제?\d+차)?(?:시비|도비|군비|구비)?(?:보조금)?(?:교부결정|교부계획|교부건의|예탁건의|예탁계획|집행내역|집행계획|결산보고|예산편성|예산변경)(?:계획|보고|알림|내역|건의)?$/,'').replace(/사업$/,'');
 return name(x.name).length>=6&&name(x.name)===name(y.name);
}
module.exports={missingFields,sameProject,sameBusiness};
