export async function requestAssistant(payload,{client,fetchImpl=fetch,signal,expectedUserId,drafting=false}={}){
  if(!client)throw new Error('Cần cấu hình tài khoản trước khi dùng AI. Phần đánh giá cơ bản vẫn hoạt động.');
  const {data,error}=await client.auth.getSession();
  if(error||!data.session?.access_token||!expectedUserId||data.session.user?.id!==expectedUserId)throw new Error('Phiên đăng nhập đã thay đổi. Hãy đăng nhập lại để dùng AI.');
  const response=await fetchImpl(drafting?'/api/assistant/draft':'/api/assistant',{
    method:'POST',headers:{'Content-Type':'application/json','X-RideMate-Assistant':'1',Authorization:`Bearer ${data.session.access_token}`},signal,
    body:JSON.stringify(payload),
  });
  let result;try{result=await response.json();}catch{
    // A proxy may return HTML/plain text before the Node API can return JSON.
    if(response.status===504)throw new Error('Máy chủ hết thời gian chờ AI (HTTP 504). Hãy thử lại sau; nếu lặp lại, quản trị viên cần kiểm tra Render Logs và model OpenRouter.');
    if([502,503].includes(response.status))throw new Error(`Máy chủ AI tạm thời không khả dụng (HTTP ${response.status}). Hãy thử lại sau khi dịch vụ khởi động xong; nếu lặp lại, kiểm tra Render Logs.`);
    throw new Error(`Máy chủ trả phản hồi không phải JSON (HTTP ${response.status}). Cần kiểm tra đường dẫn API và bản deploy trên Render. Bạn vẫn có thể dùng đánh giá cơ bản.`);
  }
  if(!response.ok){
    const messages={
      AI_TIMEOUT:'AI phản hồi quá chậm nên yêu cầu đã hết thời gian chờ. Bạn hãy thử lại sau hoặc yêu cầu lịch trình ngắn hơn. Model miễn phí có thể bận.',
      AUTH_REQUIRED:'Phiên đăng nhập hết hạn hoặc chưa hợp lệ. Hãy đăng nhập lại để dùng AI.',
      QUOTA_EXCEEDED:'Đã đạt hạn mức AI của tài khoản hoặc toàn ứng dụng. Hãy thử lại sau; đánh giá cơ bản vẫn hoạt động.',
      SERVER_BUSY:'AI đang xử lý nhiều yêu cầu. Bạn hãy thử lại sau một chút.',
      QUOTA_UNAVAILABLE:'Máy chủ chưa kiểm tra được hạn mức AI. Hãy kiểm tra cấu hình Supabase và bản cập nhật cơ sở dữ liệu.',
      NOT_CONFIGURED:'Máy chủ chưa cấu hình đủ AI. Phần đánh giá cơ bản vẫn hoạt động.',
      AUTH_UNAVAILABLE:'Chưa xác minh được đăng nhập. Bạn hãy thử lại sau.',
      AI_CREDENTIALS_INVALID:'Cấu hình khóa API hoặc quyền truy cập model trên máy chủ chưa hợp lệ.',
      AI_PROVIDER_LIMIT:'Nhà cung cấp AI đang giới hạn yêu cầu. Hãy thử lại sau; model miễn phí có hạn mức riêng.',
      AI_PROVIDER_QUOTA:'Tài khoản API của ứng dụng đã hết hạn mức hoặc số dư. Người quản trị cần kiểm tra hạn mức tại nhà cung cấp AI đang cấu hình.',
      AI_MODEL_UNAVAILABLE:'Model AI chưa khả dụng hoặc không hỗ trợ định dạng lịch trình yêu cầu. Người quản trị cần kiểm tra model đã chọn.',
    };
    throw new Error(messages[result?.error]||'Chưa kết nối được AI. Bạn vẫn có thể dùng đánh giá cơ bản.');
  }
  const latest=await client.auth.getSession();
  if(latest.error||latest.data.session?.user?.id!==expectedUserId)throw new Error('Tài khoản đã thay đổi trong lúc chờ. Hãy gửi lại yêu cầu.');
  return result;
}
