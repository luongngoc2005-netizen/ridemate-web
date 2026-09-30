export async function requestAssistant(payload,{client,fetchImpl=fetch,signal,expectedUserId}={}){
  if(!client)throw new Error('Cần cấu hình tài khoản trước khi dùng AI. Phần đánh giá cơ bản vẫn hoạt động.');
  const {data,error}=await client.auth.getSession();
  if(error||!data.session?.access_token||!expectedUserId||data.session.user?.id!==expectedUserId)throw new Error('Phiên đăng nhập đã thay đổi. Hãy đăng nhập lại để dùng AI.');
  const response=await fetchImpl('/api/assistant',{
    method:'POST',headers:{'Content-Type':'application/json','X-RideMate-Assistant':'1',Authorization:`Bearer ${data.session.access_token}`},signal,
    body:JSON.stringify(payload),
  });
  let result;try{result=await response.json();}catch{throw new Error('Máy chủ AI chưa phản hồi đúng định dạng. Bạn vẫn có thể dùng đánh giá cơ bản.');}
  if(!response.ok){
    const messages={
      AUTH_REQUIRED:'Phiên đăng nhập hết hạn hoặc chưa hợp lệ. Hãy đăng nhập lại để dùng AI.',
      QUOTA_EXCEEDED:'Đã đạt hạn mức AI của tài khoản hoặc toàn ứng dụng. Hãy thử lại sau; đánh giá cơ bản vẫn hoạt động.',
      SERVER_BUSY:'AI đang xử lý nhiều yêu cầu. Bạn hãy thử lại sau một chút.',
      QUOTA_UNAVAILABLE:'Máy chủ chưa kiểm tra được hạn mức AI. Hãy kiểm tra cấu hình Supabase và bản cập nhật cơ sở dữ liệu.',
      NOT_CONFIGURED:'Máy chủ chưa cấu hình đủ AI. Phần đánh giá cơ bản vẫn hoạt động.',
      AUTH_UNAVAILABLE:'Chưa xác minh được đăng nhập. Bạn hãy thử lại sau.',
      AI_CREDENTIALS_INVALID:'Cấu hình khóa API hoặc quyền truy cập model trên máy chủ chưa hợp lệ.',
      AI_PROVIDER_LIMIT:'Dịch vụ AI đang giới hạn yêu cầu hoặc tài khoản API chưa đủ hạn mức.',
      AI_PROVIDER_QUOTA:'Tài khoản OpenAI API của ứng dụng đã hết hạn mức. Người quản trị cần kiểm tra Billing và Limits trên OpenAI Platform; thử gửi lại ngay chưa giải quyết được lỗi này.',
    };
    throw new Error(messages[result?.error]||'Chưa kết nối được AI. Bạn vẫn có thể dùng đánh giá cơ bản.');
  }
  const latest=await client.auth.getSession();
  if(latest.error||latest.data.session?.user?.id!==expectedUserId)throw new Error('Tài khoản đã thay đổi trong lúc chờ. Hãy gửi lại yêu cầu.');
  return result;
}
