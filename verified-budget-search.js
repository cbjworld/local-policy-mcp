const data=require('./verified-budget-data.json');
const norm=s=>s.normalize('NFKC').replace(/\s/g,'').toLowerCase();
function search({institution,offset=0,limit=10}={}){
 if(institution!==undefined&&(typeof institution!=='string'||!institution.trim()||institution.length>80))throw Error('Invalid institution');
 if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid pagination');
 const rows=data.items.filter(x=>!institution||norm(x.parent+' '+x.institution).includes(norm(institution)));
 return {total:rows.length,coveredRegions:data.regions,nationwideComplete:false,items:rows.slice(offset,offset+limit),nextOffset:offset+limit<rows.length?offset+limit:null,note:data.note};
}
module.exports={search};
