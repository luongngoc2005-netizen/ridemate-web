import React,{createContext,useContext,useEffect,useMemo,useState,useRef} from 'react';
import {supabase} from '../supabase.js';
import {createLocalBookings,createCloudBookings} from './booking-store.js';
const Context=createContext(null);
export const useBookings=()=>useContext(Context);
export function BookingProvider({userId,authLoading,children}) {
  const store=useMemo(()=>userId?createCloudBookings(supabase,userId):createLocalBookings(),[userId]);
  const owner=useRef(store); owner.current=store;
  const generation=useRef(0);
  const [state,setState]=useState({store:null,bookings:[],loading:true,error:''});
  async function refresh() {
    if(authLoading)return;
    const revision=++generation.current;
    try { const bookings=await store.list(); if(owner.current===store&&revision===generation.current)setState({store,bookings,loading:false,error:''}); }
    catch(error){if(owner.current===store&&revision===generation.current)setState(previous=>({store,bookings:previous.store===store?previous.bookings:[],loading:false,error:error.message}));}
  }
  useEffect(()=>{
    if(authLoading)return;
    let active=true;
    const reload=()=>{if(active)refresh();};
    reload(); const timer=setInterval(reload,15000); window.addEventListener('focus',reload);
    return ()=>{active=false;clearInterval(timer);window.removeEventListener('focus',reload);};
  },[store,authLoading]);
  async function mutate(method,...args) {
    if(authLoading||owner.current!==store)throw new Error('Tài khoản đang thay đổi, hãy thử lại.');
    const result=await store[method](...args);
    if(owner.current!==store)throw new Error('Tài khoản đã thay đổi. Mở lại danh sách đơn của tài khoản vừa dùng.');
    await refresh(); return result;
  }
  const current=state.store===store&&!authLoading?state:{bookings:[],loading:true,error:''};
  return <Context.Provider value={{...current,userId,refresh,book:(...args)=>mutate('book',...args),cancel:id=>mutate('cancel',id)}}>{children}</Context.Provider>;
}
