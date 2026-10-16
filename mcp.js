Warning: truncated output (original token count: 3960)
Total output lines: 45

const discovery=require('./discovery.js'),portal=require('./open-portal.js');
let initialized=false,ready=false,pending='';
const annotations={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
const idsSchema={type:'array',items:{type:'string'},minItems:2,maxItems:4,uniqueItems:true};
const evidenceSchema={type:['object','null'],properties:{sourceId:{type:'string'},quote:{type:'string',minLength:8,maxLength:2000},page:{type:['integer','null']}},required:['sourceId','quote'],additionalProperties:false};
const tools=[
 {"name": "search_verified_budget_totals", "description": "Search reconciled 2026 original-budget general-account municipal EXPENDITURE TOTALS for 223 covered institutions. Municipality totals are not individual project budgets, benefits or actual spending. Return sources and limitations; no hit means missing coverage, not zero budget. Indexed business-level expenditure search is a separate tool.", "inputSchema": {"type": "object", "properties": {"institution": {"type": "string", "minLength": 1, "maxLength": 80}, "offset": {"type": "integer", "minimum": 0}, "limit": {"type": "integer", "minimum": 1, "maximum": 20}}, "additionalProperties": false}, "annotations": {"readOnlyHint": true, "destructiveHint": false, "openWorldHint": false}},
 {"name": "search_budget_projects", "description": "Search indexed 2026 original-budget general-account BUSINESS expenditure rows. 265416 rows; some municipalities and departments are not covered. Read returned scope. q is space-separated AND business-name keywords; institution filters region. New rows passed arithmetic and department sum reconciliation; Seoul city rows instead passed original general-account total and independent official business name/amount reconciliation. Amounts thousand KRW appropriations, not benefits or spending. Cite source plus PDF page or HWP table/row; never fabricate a page. No hit does not prove absence. Use research_policy for plans/execution.", "inputSchema": {"type": "ob…2960 tokens truncated…ult={tools};
 else if(m.method==='tools/call'){
  const name=m.params?.name,t=tools.find(t=>t.name===name);if(!t)return err(-32602,'Unknown tool');
  const args=m.params.arguments??{};
  try{
   if(args?.detail!==undefined&&!['compact','full'].includes(args.detail))throw new Error('Invalid detail');
   if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(t.inputSchema.properties,k)))throw new Error('Invalid arguments');
   const value=name==='search_verified_budget_totals'?require('./verified-budget-search').search(args):name==='search_budget_projects'?require('./budget-search').search(args):name==='research_policy'?await require('./policy-workflow').research(args):name==='research_open_document'?await portal.research(args):name==='search_open_documents'?await portal.search(args):name==='read_open_document'?await portal.read(args):name==='research_official_notice'?await discovery.researchNotice(args):name==='build_research_brief'?discovery.brief(args):await discovery.read(args);
   result={content:[{type:'text',text:JSON.stringify(require("./presentation").present(name,value,args.detail))}],isError:false};
  }catch(e){result={content:[{type:'text',text:e.message}],isError:true};}
 }else return err(-32601,'Method not found');
 return {jsonrpc:'2.0',id:m.id,result};
}
async function line(s){try{const r=await handle(JSON.parse(s));if(r)process.stdout.write(JSON.stringify(r)+'\n');}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');}}
let queue=Promise.resolve();
process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{pending+=chunk;if(pending.length>65536){console.error('Input limit exceeded');process.exit(1);}let i;while((i=pending.indexOf('\n'))>=0){const s=pending.slice(0,i);pending=pending.slice(i+1);if(s.trim())queue=queue.then(()=>line(s));}});
process.stdin.on('end',()=>{if(pending.trim())queue=queue.then(()=>line(pending));});

