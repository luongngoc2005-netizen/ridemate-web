import { confirmDemoBooking, normalizeRequest } from './booking-data.js';
import { requireUser } from '../cloud-data.js';

export function createLocalBookings(indexedDB=globalThis.indexedDB) {
  let connection;
  function open() {
    if(!indexedDB) return Promise.reject(new Error('Trình duyệt không cho phép lưu đơn demo.'));
    return connection ||= new Promise((resolve,reject)=>{
      const request=indexedDB.open('ridemate.booking-demo.v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('bookings',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>{connection=null;reject(request.error);};
    });
  }
  async function transaction(action) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('bookings','readwrite'), store=tx.objectStore('bookings');
      let result,failure;
      const all=store.getAll();
      all.onsuccess=()=>{try {result=action(all.result,store);}catch(error){failure=error;tx.abort();}};
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(failure||tx.error||new Error('Chưa lưu được đơn demo.'));
      tx.onerror=()=>{};
    });
  }
  return {
    list:()=>transaction(rows=>rows),
    book:(requestId,input)=>transaction((rows,store)=>{const booking=confirmDemoBooking(rows,requestId,input);store.put(booking);return booking;}),
    cancel:id=>transaction((rows,store)=>{const booking=rows.find(b=>b.id===id);if(!booking)throw new Error('Không tìm thấy đơn.');const next={...booking,status:'cancelled'};store.put(next);return next;}),
  };
}

const cloudError = error => new Error(['42P01','PGRST202','PGRST205','42883'].includes(error?.code)
  ? 'Chưa bật đặt phòng demo trên tài khoản. Cần chạy migration đặt phòng trong SUPABASE_SETUP.md; bạn vẫn có thể đăng xuất để thử bản demo trên trình duyệt.'
  : error?.message||'Chưa lưu được đơn. Hãy kiểm tra kết nối và thử lại.');
export function createCloudBookings(client,userId) {
  return {
    async list() {
      await requireUser(client,userId);
      const {data,error}=await client.from('demo_bookings').select('payload').eq('user_id',userId);
      if(error)throw cloudError(error);
      await requireUser(client,userId);
      return data.map(row=>row.payload);
    },
    async book(requestId,input) {
      await requireUser(client,userId);
      const {data,error}=await client.rpc('book_demo_stay',{expected_user_id:userId,request_id:requestId,new_request:normalizeRequest(input)});
      if(error)throw cloudError(error);return data;
    },
    async cancel(id) {
      await requireUser(client,userId);
      const {data,error}=await client.rpc('cancel_demo_stay',{expected_user_id:userId,booking_id:id});
      if(error)throw cloudError(error);return data;
    },
  };
}
