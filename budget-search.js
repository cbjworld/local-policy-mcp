const data=(()=>{
 const packed=JSON.parse(require('node:zlib').gunzipSync(require('node:fs').readFileSync(require('node:path').join(__dirname,'budget-data.json.gz'))).toString('utf8'));
 if(packed.formatVersion===undefined)return packed;
 if(packed.formatVersion!==1)throw Error('Unsupported budget data format');
 return packed;
})();
const normalize=s=>s.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
function search({q,institution,offset=0,limit=10}={}){
 if(typeof q!=='string'||!q.trim()||q.length>100)throw Error('q must contain 1–100 characters');
 if(institution!==undefined&&(typeof institution!=='string'||!institution.trim()||institution.length>80))throw Error('Invalid institution');
 if(!Number.isInteger(offset)||offset<0||offset>data.rows.length||!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid pagination');
 const terms=q.trim().split(/\s+/).map(normalize);
 const found=data.rows.filter(entry=>{const r=data.formatVersion===1?entry[1]:entry,c=data.formatVersion===1?data.contexts[entry[0]]:r;return (!institution||normalize((c.parent||'')+' '+c.institution).includes(normalize(institution)))&&terms.every(t=>normalize(r.name).includes(t));});
 return {scope:data.scope,query:q,totalCandidateRows:found.length,offset,items:found.slice(offset,offset+limit).map(entry=>data.formatVersion===1?({...data.contexts[entry[0]],...entry[1]}):entry),nextOffset:offset+limit<found.length?offset+limit:null,note:'2026 일반회계 세출 사업행 편성액입니다. 새 자료는 사업행 증감 산술과 해당 부서 사업합계가 공식 부서 총액과 일치한 경우만 포함합니다. 원문 링크와 PDF 쪽수 또는 한글 표·행 위치를 제시하세요. 지원금 단가·집행액·현행 시행 여부와 사업명 의미는 별도 확인해야 합니다. 검색 결과 없음은 사업 부재를 뜻하지 않습니다. 계획·대상·집행 확인에는 research_policy를 이어 사용하세요.'};
}
module.exports={search};
