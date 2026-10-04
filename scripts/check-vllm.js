import {serverConfig} from '../server/config.js';
import {interpretMessage} from '../server/assistant-api.js';
import {generateDraft} from '../server/draft-api.js';

// Administrative connectivity check: sends only synthetic travel requests.
const options=serverConfig({...process.env,AI_PROVIDER:'vllm',VLLM_BASE_URL:process.argv[2]||process.env.VLLM_BASE_URL},{production:false});
try{
  console.log('Checking structured intent...');
  const intent=await interpretMessage({message:'Đánh giá lịch trình ngày 1',context:{days:[{title:'Ngày 1',places:[]}]}},options);
  console.log(`Intent OK: ${intent.intent}`);
  console.log('Checking structured itinerary draft...');
  const result=await generateDraft({message:'Lập lịch trình 2 ngày 1 đêm ở Cao Bằng.',context:{origin:'Hà Nội',destination:'Cao Bằng',days:2,nights:1,returnToOrigin:true,date:'2026-10-15',departure:'06:30',people:2,vehicles:1,bike:'semi',experience:'new',hours:4,avoidDark:'yes',preferences:'Thiên nhiên, lịch nhẹ; chưa tính tuyến thực tế.'}},options);
  console.log(`Draft schema OK: ${result.draft.days.length} days; ${result.draft.origin} → ${result.draft.destination}`);
  console.log(`First day: ${result.draft.days[0].title}; last day: ${result.draft.days.at(-1).title}`);
  if(result.draft.origin!=='Hà Nội'||result.draft.destination!=='Cao Bằng'||result.draft.days.length!==2){
    console.warn('Model did not preserve all requested trip details. Review the draft before confirming.');
  }
}catch(error){
  console.error(`vLLM check failed: ${error.code||error.name||'UNKNOWN_ERROR'}`);
  process.exitCode=1;
}
