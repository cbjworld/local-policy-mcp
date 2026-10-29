const records=require('./project-document-links.json').links;
function knownConflict(url,fileId){try{const id=new URL(url).searchParams.get('prdnNstRgstNo');return records.some(r=>r.basis==='title_only_disclosure_conflict'&&new URL(r.document.url).searchParams.get('prdnNstRgstNo')===id&&r.blockedFileIds?.includes(fileId));}catch{return false;}}
// A cover field near the start is evidence; explanatory mentions elsewhere are not.
function markedPrivate(source){const page=source?.pages?.find(p=>p.page===1||p.page===null);if(!page)return false;const header=String(page.text||'').slice(0,1200).replace(/<[^>]*>/g,' ');return /공\s*개\s*(?:구\s*분|여\s*부)\s*[:：]?\s*비\s*공\s*개(?:\s*\(\s*[0-9,\s]+\s*\)|[ \t]*(?=\r?\n|$))/.test(header);}
module.exports={knownConflict,markedPrivate};
