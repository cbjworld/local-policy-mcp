const keys=['target','activity','budget','period'];
function missingFields(result){
 if(result?.status!=='read'||result.relevanceStatus==='supporting_document'||result.targetFit?.status==='mismatch')return [...keys];
 return keys.filter(key=>key==='target'&&result.targetFit?.requested?.length&&result.targetFit.status==='unspecified'||!result.evidence?.fields?.[key]?.excerpts?.some(e=>['evidence_candidate','redacted'].includes(e.status)&&e.quote));
}
function sameProject(a,b){
 const {identity}=require('./project-bundles'),x=identity(a),y=identity(b);
 return !!(a.institution&&b.institution&&x.year&&y.year&&x.key===y.key);
}
module.exports={missingFields,sameProject};
