const reviewed=require('./data/municipal-scheme-links.json');

function group(items){
 const bySource=new Map(items.map(item=>[item.source,item]));
 return reviewed.flatMap(entry=>{
  const sources=entry.sources.map(ref=>{
   const item=bySource.get(ref.url);
   if(!item||item.sourceSha256!==ref.sha256||item.name!==ref.title||!item.content.includes(ref.quote))return null;
   return {source:item.source,sourceSha256:item.sourceSha256,institution:item.institution,parent:item.parent,location:item.location,quote:ref.quote,role:ref.role,followup:item.followup};
  });
  return sources.every(Boolean)?[{name:entry.name,relationship:entry.relationship,note:entry.note,sources}]:[];
 }).slice(0,5);
}
module.exports={group};
