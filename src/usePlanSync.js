import {useEffect,useRef,useState} from 'react';
import {supabase} from './supabase.js';
import {readCloud,requireUser} from './cloud-data.js';
import {readPlans,savePlans,validPlans,putPlan} from './plans-data.js';
import {syncPlans,mergePlans,readAccountPlans,writeAccountPlans,accountPlansKey} from './plan-sync.js';
import {fingerprint} from './journal-sync.js';
const readAccount=id=>readAccountPlans(localStorage,id);
export default function usePlanSync(account) {
  const id=account.session?.user.id||null,owner=id||'guest';
  const [state,setState]=useState({owner:null,plans:[],base:[],status:'loading',error:''});
  const stateRef=useRef(state),runRef=useRef(null),generation=useRef(0);stateRef.current=state;
  const store=(next)=>{
    if(next.owner==='guest')savePlans(localStorage,next.plans);
    else writeAccountPlans(localStorage,next.owner,next);
    stateRef.current=next;setState(next);
  };
  useEffect(()=>{
    if(account.loading)return;
    const epoch=++generation.current;let closed=false,running=false,queued=false;
    const current=()=>!closed&&generation.current===epoch&&stateRef.current.owner===owner;
    try{
      const data=id?readAccount(id):{...readPlans(localStorage),base:[]};
      const next={owner,plans:data.plans,base:data.base,ready:!id||localStorage.getItem(accountPlansKey(id))!==null,status:id?'loading':'local',error:data.error||''};
      stateRef.current=next;setState(next);
    }catch(e){const next={owner,plans:[],base:[],status:'blocked',error:e.message};stateRef.current=next;setState(next);}
    async function run(prefer=null){
      if(!id||!supabase||!current()||stateRef.current.status==='blocked')return;
      if(running){queued=true;return;}
      if(stateRef.current.conflict&&!prefer)return;
      running=true;
      const snapshot=stateRef.current;
      setState(s=>s.owner===owner?{...s,status:'syncing'}:s);
      try{
        const result=await syncPlans({base:snapshot.base,local:snapshot.plans,prefer,
          read:async()=>{if(!current())throw new Error('Phiên đã thay đổi.');return readCloud(supabase,id);},
          commit:async(payload,revision)=>{if(!current())throw new Error('Phiên đã thay đổi.');await requireUser(supabase,id);if(!current())throw new Error('Phiên đã thay đổi.');const {error}=await supabase.rpc('save_workspace',{expected_user_id:id,expected_revision:revision,new_payload:payload});if(error)throw error;}});
        if(!current())return;
        const latest=stateRef.current;
        // Edits made while the network request was running stay pending.
        const plans=mergePlans(snapshot.plans,latest.plans,result.plans,prefer);
        const pending=fingerprint(plans)!==fingerprint(result.base);
        store({...latest,plans,base:result.base,ready:true,status:pending?'pending':'synced',error:'',conflict:false});
        if(pending)queued=true;
      }catch(e){if(current()){
        const next={...stateRef.current,ready:true,status:'error',error:e.message,conflict:e.code==='PLAN_CONFLICT'};
        stateRef.current=next;setState(next);
      }}finally{running=false;if(queued&&current()){queued=false;queueMicrotask(()=>run());}}
    }
    runRef.current=run;
    run();
    const refresh=()=>{if(document.visibilityState!=='hidden')run();};
    const timer=setInterval(refresh,15000);
    window.addEventListener('online',refresh);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    const external=e=>{if(e.key===(id?accountPlansKey(id):'ridemate.plans.v1')){
      try{const cached=id?readAccount(id):{plans:readPlans(localStorage).plans,base:[]};
        const latest=stateRef.current,plans=id?mergePlans(latest.base,latest.plans,cached.plans):cached.plans;
        stateRef.current={...latest,plans};setState(stateRef.current);run();
      }catch(e){setState(s=>({...s,error:e.message,conflict:true,status:'error'}));}
    }};window.addEventListener('storage',external);
    return ()=>{closed=true;generation.current++;clearInterval(timer);window.removeEventListener('online',refresh);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('storage',external);runRef.current=null;};
  },[id,account.loading]);
  const changePlans=updater=>{
    const s=stateRef.current;
    if(account.loading||s.owner!==owner||s.status==='blocked')throw new Error('Đang mở dữ liệu tài khoản. Hãy thử lại sau.');
    const plans=typeof updater==='function'?updater(s.plans):updater;
    if(!validPlans(plans))throw new Error('Kế hoạch không hợp lệ.');
    store({...s,plans,status:id?'pending':'local',error:s.conflict?s.error:''});
    if(id)runRef.current?.();
  };
  const importGuest=()=>{
    const guest=readPlans(localStorage);if(guest.error)throw new Error(guest.error);
    changePlans(plans=>guest.plans.reduce((next,p)=>next.some(x=>x.id===p.id)?next:putPlan(next,p),plans));
  };
  return {...(state.owner===owner&&!account.loading?state:{owner,plans:[],status:'loading',error:''}),changePlans,
    retry:prefer=>runRef.current?.(prefer),importGuest,loading:account.loading||state.owner!==owner||state.ready===false};
}
