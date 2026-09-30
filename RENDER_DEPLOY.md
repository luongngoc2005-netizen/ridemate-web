# Triển khai RideMate và AI Assistant trên Render

Backend production đã được thêm. Một **Web Service** phục vụ cả thư mục build
`dist/` và `/api/assistant`, không cần tách tên miền frontend/backend.

## 1. Cập nhật Supabase

Mở Supabase project đang dùng → **SQL Editor** → chạy toàn bộ tệp:

`supabase/migrations/202609300001_ai_quota.sql`

Có thể chạy lại tệp này; bộ đếm hiện có được giữ nguyên. Migration không sửa dữ
liệu kế hoạch hoặc nhật ký. Chỉ lưu ID người dùng và bộ đếm; không lưu hội thoại.

Hạn mức mặc định: **10 lần/phút, 50 lần/ngày/tài khoản**, **500 lần/ngày/toàn ứng
dụng**. Ngày tính theo UTC, phút là cửa sổ phút cố định. Một yêu cầu hợp lệ đã
được cấp lượt vẫn tính lượt nếu OpenAI trả lỗi. Câu trả lời được xử lý cục bộ
không tính lượt. Bộ đếm không mất khi Render restart và dùng chung giữa các
instance. Muốn đổi hạn mức, sửa các ngưỡng trong hàm SQL bằng tài khoản quản trị.
Các giới hạn này chặn số lượt, không phải mức chi tiêu USD chính xác.

## 2. Tạo hoặc cấu hình Render Web Service

Code cần có trên nhánh Git mà Render đọc. Phiên thay đổi code này chưa push hoặc
tạo dịch vụ trên tài khoản của bạn.

Nếu dịch vụ cũ là **Static Site**, tạo **New → Web Service** với cùng repository.
Giữ site cũ cho đến khi kiểm tra dịch vụ mới thành công. Nếu đã là **Web Service**,
cập nhật build/start command tại Settings.

| Mục | Giá trị |
|---|---|
| Runtime | Node |
| Root Directory | Để trống nếu `package.json` ở gốc repo `ridemate-web` |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/healthz` |
| Node version | `22` |

File `render.yaml` cung cấp cấu hình Blueprint tương đương. Không dùng Vite dev
server hoặc `npm run preview` làm Start Command. Server lắng nghe `0.0.0.0` và
cổng Render cấp qua `PORT`.

## 3. Environment trong Render

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |
| `VITE_SUPABASE_URL` | URL Supabase project hiện tại |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key hoặc anon key của project |
| `OPENAI_API_KEY` | API key OpenAI, chỉ đặt tại Render |
| `OPENAI_MODEL` | `gpt-4.1-mini` hoặc model có quyền dùng và hỗ trợ Responses Structured Outputs |

Backend dùng lại hai biến Supabase công khai, không cần `service_role` key. Nếu
đặt `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` riêng, chúng phải trỏ cùng project
với frontend. Không đặt API key OpenAI vào bất kỳ biến `VITE_*` nào, mã nguồn,
Blueprint, tin nhắn chat hoặc tệp nằm trong `dist/`.

Render cấp sẵn `RENDER_EXTERNAL_HOSTNAME`; backend dùng nó làm nguồn web được
phép gọi API. Nếu dùng tên miền riêng, đặt thêm:

```env
APP_ORIGIN=https://ten-mien-cua-ban.example
```

Khi đó hãy truy cập bằng đúng tên miền đó. Cấu hình hiện chỉ cho một origin; các
trang khác không được gọi AI bằng trình duyệt. Các API không bật CORS.

Chọn **Save, rebuild, and deploy**. Biến `VITE_*` cần rebuild để cập nhật frontend.
Trong Supabase **Authentication → URL Configuration**, cập nhật Site URL và
Redirect URLs theo địa chỉ Render/tên miền mới để các luồng đăng nhập qua email
và khôi phục mật khẩu trở về đúng web.

## 4. Kiểm tra sau deploy

1. Mở `/healthz`: nhận `{"status":"ok"}`. Endpoint này kiểm tra tiến trình web,
   không gọi OpenAI và không tiêu lượt.
2. Mở `/api/assistant/status`: nhận `ready: true, authRequired: true` nếu các cấu
   hình cần thiết đã có. Đây **không phải** bằng chứng khóa/model/migration đã
   hoạt động; lần chat có đăng nhập mới xác minh được toàn bộ kết nối.
3. Đăng nhập tài khoản RideMate bình thường, mở kế hoạch → AI Assistant → gửi
   một câu hỏi. Backend kiểm tra token với Supabase, đặt chỗ hạn mức bằng SQL,
   rồi mới gọi OpenAI. Tài khoản anonymous của Supabase không được dùng API trả phí.
4. Đăng xuất: AI Assistant trở lại đánh giá cơ bản, hiển thị nút đăng nhập. Không
   gửi yêu cầu trả phí khi chưa có phiên. Các yêu cầu giả/phiên hết hạn bị từ chối.

## Lỗi thường gặp

- **NOT_CONFIGURED / ready=false:** thiếu khóa hoặc cấu hình Supabase.
- **Startup failed:** chưa build `dist/index.html`, sai origin/cổng, hoặc đã đặt
  khóa AI nhưng chưa có URL/key Supabase và origin production.
- **AUTH_REQUIRED:** đăng nhập lại, kiểm tra frontend/backend cùng project.
- **QUOTA_UNAVAILABLE:** chạy migration ở bước 1; kiểm tra Supabase hoạt động.
- **QUOTA_EXCEEDED:** đã đạt một trong ba hạn mức; chờ cửa sổ hạn mức tiếp theo.
- **AI_CREDENTIALS_INVALID:** kiểm tra khóa, model và quyền project OpenAI.
- **AI_PROVIDER_LIMIT:** kiểm tra hạn mức/tín dụng/rate limit của project OpenAI.
- **ORIGIN_REJECTED:** kiểm tra `APP_ORIGIN` và tên miền đang truy cập.

## Chạy production trên máy để kiểm tra

```sh
npm run build
node --env-file=.env server/index.js
```

Nếu `.env` có API key, cần Supabase và `APP_ORIGIN=http://localhost:10000`.
Nếu chưa có key, server vẫn phục vụ giao diện ở chế độ cơ bản. Trong Render,
`npm start` đọc biến môi trường được đặt trên Dashboard, không cần upload `.env`.

## Giới hạn và vận hành

- Không log khóa, token, nội dung hội thoại hoặc phản hồi thô từ nhà cung cấp.
- Tối đa 32 KiB/request, kiểm tra dữ liệu trước khi cấp lượt; tối đa 8 yêu cầu AI
  đồng thời mỗi tiến trình. Lỗi auth/quota không được bỏ qua để gọi OpenAI.
- Tắt AI bằng cách xóa `OPENAI_API_KEY` rồi deploy lại; web cơ bản vẫn hoạt động.
- Backend hiện dùng OpenAI để hiểu yêu cầu có cấu trúc. Các phép tính, lời khuyên
  theo tiêu chí và thao tác áp dụng kế hoạch vẫn do RideMate quyết định.
- Đổi sang domain/origin mới không tự chuyển các kế hoạch đang lưu trong trình
  duyệt ở domain cũ: lưu các kế hoạch lên tài khoản trước, rồi tải ở domain mới.
- Chưa triển khai trên tài khoản Render/Supabase hoặc gọi OpenAI bằng khóa thật
  trong phiên viết code này; kiểm thử HTTP và SQL dùng dữ liệu thử, API giả lập.

Nguồn: [Render Web Services](https://render.com/docs/web-services),
[Render Environment](https://render.com/docs/configure-environment-variables),
[Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser).
# Thử OpenRouter

Hướng dẫn cấu hình provider và model miễn phí: [OPENROUTER_SETUP.md](OPENROUTER_SETUP.md).
Các bước OpenAI bên dưới áp dụng khi `AI_PROVIDER=openai` (mặc định).
