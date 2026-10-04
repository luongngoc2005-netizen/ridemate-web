import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrip} from '../src/trip-data.js';
import {mergePlans,syncPlans,readAccountPlans,writeAccountPlans} from '../src/plan-sync.js';
const plan=()=>createTrip({origin:'Hà Nội',destination:'Cao Bằng',date:'2026-10-15',days:3});
test('pending cache survives reload and is isolated by account without importing guest data',()=>{
  const records=new Map([['ridemate.plans.v1','guest-data']]);
  const storage={getItem:k=>records.get(k)||null,setItem:(k,v)=>records.set(k,v)};
  const p=plan(),base=[p],local=[{...p,notes:'offline edit'}];
  writeAccountPlans(storage,'account-a',{plans:local,base});
  assert.deepEqual(readAccountPlans(storage,'account-a'),{plans:local,base});
  assert.deepEqual(readAccountPlans(storage,'account-b'),{plans:[],base:[]});
  assert.equal(storage.getItem('ridemate.plans.v1'),'guest-data');
  const denied={...storage,setItem:()=>{throw new Error('Quota');}};
  assert.throws(()=>writeAccountPlans(denied,'account-a',{plans:[],base:[]}),/Quota/);
  assert.deepEqual(readAccountPlans(storage,'account-a').plans,local);
});
test('different plans and checklist items merge without overwriting journals',async()=>{
  const a=plan(),b=plan(),base=[a,b],local=structuredClone(base),remote=structuredClone(base);
  local[0].checklist[0].done=true;remote[0].checklist[1].done=true;remote[1].notes='other device';
  const merged=mergePlans(base,local,remote);
  assert.equal(merged[0].checklist[0].done,true);assert.equal(merged[0].checklist[1].done,true);assert.equal(merged[1].notes,'other device');
  let committed;
  await syncPlans({base,local,read:async()=>({revision:4,payload:{version:1,trips:remote,trip:remote[0],entries:[{id:'journal',photos:[{path:'keep'}]}]}}),commit:async(p,r)=>{assert.equal(r,4);committed=p;}});
  assert.deepEqual(committed.entries,[{id:'journal',photos:[{path:'keep'}]}]);
});
test('same-field conflict preserves both versions until explicit resolution',()=>{
  const p=plan(),base=[p],local=[{...p,notes:'local'}],remote=[{...p,notes:'remote'}];
  assert.throws(()=>mergePlans(base,local,remote),e=>e.code==='PLAN_CONFLICT');
  assert.equal(mergePlans(base,local,remote,'local')[0].notes,'local');
  assert.equal(mergePlans(base,local,remote,'remote')[0].notes,'remote');
  assert.equal(remote[0].notes,'remote');
});
test('remote deletes propagate and concurrent edits cannot resurrect silently',()=>{
  const p=plan();assert.deepEqual(mergePlans([p],[p],[]),[]);
  assert.throws(()=>mergePlans([p],[{...p,notes:'pending'}],[]),/thiết bị khác/);
});
test('revision retry preserves a journal added during first write',async()=>{
  const p=plan();let attempt=0,output;
  const read=async()=>({revision:attempt+1,payload:{version:1,trips:[p],trip:p,entries:attempt?[{id:'new-journal'}]:[]}});
  const commit=async payload=>{if(attempt++===0)throw Object.assign(new Error('CAS'),{code:'40001'});output=payload;};
  await syncPlans({base:[p],local:[{...p,notes:'saved'}],read,commit});
  assert.equal(output.trips[0].notes,'saved');assert.deepEqual(output.entries,[{id:'new-journal'}]);
});
test('ambiguous successful write retry is idempotent',async()=>{
  const p=plan(),local=[{...p,notes:'saved'}];let writes=0;
  const result=await syncPlans({base:[p],local,read:async()=>({revision:2,payload:{version:1,trips:local,entries:[]}}),commit:async()=>writes++});
  assert.equal(writes,0);assert.deepEqual(result.plans,local);
});
test('edit made while sync is running remains pending against committed base',()=>{
  const p=plan(),snapshot=[p],latest=structuredClone(snapshot),committed=structuredClone(snapshot);
  latest[0].checklist[0].done=true;committed[0].notes='from other device';
  const merged=mergePlans(snapshot,latest,committed);assert.equal(merged[0].checklist[0].done,true);assert.equal(merged[0].notes,'from other device');
});
