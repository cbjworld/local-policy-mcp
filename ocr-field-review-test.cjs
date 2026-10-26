const assert=require('node:assert/strict'),fields=require('./ocr-field-review'),fallback=require('./ocr-numeric-fallback');
const canonical=(s,kind='unit',extra={})=>fields.canonical(s,{kind,...extra});
assert.equal(canonical('3,045억,'),'3,045억');assert.equal(canonical('4959억'),'4,959억');assert.equal(canonical('연간 최대 200만원','unit',{prefix:'연간최'}),'연간최대200만원');
for(const s of ['사업비200만원','2,00만원','1e3만원','200원원','2만원 이하'])assert.equal(canonical(s),null,s);
assert.equal(canonical('2026년 2월 25일','date'),'2026년2월25일');for(const s of ['2025년2월29일','2026년13월1일','2026년4월31일'])assert.equal(canonical(s,'date'),null);
assert.equal(canonical('(5.74%)','percent'),'5.74%');assert.equal(canonical('2.78%p','percent'),'2.78%p');assert.equal(canonical('270','integer',{alternate:'270'}),'270');assert.equal(canonical('160','integer',{alternate:'270'}),null);
const group=[{text:'1.019',x:20,y:40,w:50,h:25},{text:'65.2490)',x:90,y:40,w:80,h:25}],base={group,occurrence:{index:0,total:1},hasTriangle:false,box:{left:20,top:40,width:150,height:25}},tasks=[{...base,first:0,last:0,source:'1.019'},{...base,first:1,last:1,source:'65.2490)',kind:'percent'}],correction={from:['1.019'],to:['1,019'],box:[20,40,50,25]},money={text:'9,999',score:.99},percent={text:'(5.74%)',score:.96,koreanText:'5.74%',koreanScore:.92};
assert.equal(fallback.apply('1,019 65.2490)',tasks,[money,money,percent,percent],[correction]).text,'1,019 5.74%');
const task={...base,group:[{text:'65.2490)',x:90,y:40,w:80,h:25}],first:0,last:0,source:'65.2490)',kind:'percent'};
assert.equal(fallback.apply('65.2490)',[task],[{...percent,koreanScore:.89},percent]).text,'65.2490)');assert.equal(fallback.apply('65.2490)',[task],[{...percent,koreanText:'5.74억'},percent]).text,'65.2490)');
console.log('PASS: calendar validation, unit formatting without digit synthesis, dual-model percentages, alternate-matched integers, and source-position alignment that preserves prior repairs');

assert.equal(canonical('123','integer',{alternatePrefix:'12'}),'123');assert.equal(canonical('234','integer',{alternatePrefix:'12'}),null);assert.equal(canonical('1234','integer',{alternatePrefix:'12'}),null);

const letterGroup=[{text:'ABC',x:20,y:30,w:50,h:20}],letterTask={group:letterGroup,first:0,last:0,source:'ABC',kind:'integer',mode:'percent',alternatePrefix:'12',box:{left:20,top:30,width:50,height:20},occurrence:{index:0,total:1}},letterRead={text:'123',score:.99,koreanText:'123',koreanScore:.99};assert.equal(fallback.apply('ABC',[letterTask],[letterRead,letterRead]).text,'123');assert.equal(fallback.apply('ABC',[{...letterTask,group:[{...letterGroup[0],text:'ABC'}]}],[{...letterRead,koreanScore:.93},letterRead]).text,'ABC');
