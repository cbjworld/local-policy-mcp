const data=require('./verified-budget-data.json');
const norm=s=>s.normalize('NFKC').replace(/\s/g,'').toLowerCase();
function search({institution,offset=0,limit=10}={}){
 if(institution!==undefined&&(typeof institution!=='string'||!institution.trim()||institution.length>80))throw Error('Invalid institution');
 if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid pagination');
 const terms=institution?require('./region-aliases').regionTerms(institution).map(norm):null;
 const rows=data.items.filter(x=>!terms||require('./region-aliases').matchesRegion(terms,x));
 return {total:rows.length,coveredRegions:data.regions,amountStatusCounts:{recorded:rows.filter(x=>x.amountStatus!=='approximate'&&x.amountStatus!=='source_conflict').length,approximate:rows.filter(x=>x.amountStatus==='approximate').length,unconfirmed:rows.filter(x=>x.amountStatus==='source_conflict').length},nationwideComplete:false,items:rows.slice(offset,offset+limit),nextOffset:offset+limit<rows.length?offset+limit:null,note:data.note};
}
module.exports={search};
