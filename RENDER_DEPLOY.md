# Triển khai RideMate trên Render

Dùng **Web Service Node** để phục vụ frontend `dist` và API AI cùng nguồn. Static Site không chạy API AI. Trước khi deploy, code cần có trên nhánh Git mà Render đọc; sửa local không tự cập nhật Render.

## Chuẩn bị

Áp dụng các migration cần thiết theo [SUPABASE_SETUP](./SUPABASE_SETUP.md). AI cần migration quota; chỗ nghỉ demo cần migration riêng.

| Cấu hình | Giá trị |
|---|---|
| Build | `npm ci --include=dev && npm run build` |
| Start | `npm start` |
| Health Check | `/healthz` |
| Node | 22+ |

`render.yaml` có cấu hình Web Service và provider mặc định OpenAI. Có thể cấu hình service qua Dashboard, chọn provider khác bằng Environment.

## Environment

Cấu hình chung:

```dotenv
NODE_ENV=production
NODE_VERSION=22
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Backend dùng lại Supabase project của frontend. Render cung cấp `RENDER_EXTERNAL_HOSTNAME` cho kiểm tra origin; nếu dùng domain riêng, đặt `APP_ORIGIN=https://DOMAIN_CUA_BAN` và truy cập đúng origin này. Origin không có path/query. Backend không bật CORS cho API AI.

Chọn một provider:

| Provider | Các biến server |
|---|---|
| vLLM tự host | `AI_PROVIDER=vllm`, `VLLM_BASE_URL`, `VLLM_MODEL`, tùy chọn `VLLM_API_KEY` |
| OpenRouter | `AI_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |
| OpenAI | `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL` |

Xem [vLLM](./VLLM_SETUP.md) hoặc [OpenRouter](./OPENROUTER_SETUP.md). OpenAI mặc định dùng `gpt-4.1-mini` qua Responses Structured Outputs; chỉ dùng model tương thích và tài khoản có quyền truy cập.

Khóa AI chỉ đặt ở server, không dùng tiền tố `VITE_`, không commit hoặc đưa vào `dist`. Không cần service-role key. Đổi biến frontend `VITE_*` cần rebuild; biến server cần restart/redeploy. Trong Supabase, cập nhật Site URL/Redirect URLs theo địa chỉ web mới.

## Kiểm tra sau deploy

1. `/healthz` trả `{"status":"ok"}`: chỉ xác nhận tiến trình web, không gọi model.
2. `/api/assistant/status` có `ready:true, authRequired:true`: chỉ xác nhận cấu hình, không xác minh model đang bật, khóa hợp lệ hoặc migration đã hoạt động.
3. Đăng nhập, tạo bản nháp AI, chỉnh bản nháp và xác nhận. Kiểm tra tọa độ và quỹ thời gian từng ngày.
4. Kiểm tra đồng bộ kế hoạch/checklist trên hai thiết bị, lỗi mạng và xung đột. Kiểm tra nhật ký/ảnh và đơn demo nếu dùng.
5. Với vLLM, tắt model nhưng giữ tunnel: web báo lỗi model, giữ bản nháp để thử lại.
6. Đăng xuất: không gửi API model khi chưa có phiên; đánh giá cơ bản vẫn dùng được.

## Hạn mức và vận hành AI

Quota mặc định: 10 lượt/phút, 50 lượt/ngày/tài khoản và 500 lượt/ngày/toàn ứng dụng. Cửa sổ ngày tính theo UTC trong SQL. Lượt đã được cấp vẫn tính khi provider lỗi; trả lời cục bộ không tính lượt. Quota không phải giới hạn chi phí tiền tệ.

API kiểm tra dữ liệu, token Supabase và quota trước khi gọi model. Giới hạn 32 KiB/request và 8 yêu cầu AI đồng thời mỗi tiến trình. Không log khóa/token/nội dung hội thoại/phản hồi thô. Không tự thử lại hoặc đổi provider khi lỗi.

Tắt AI: bỏ cấu hình bắt buộc của provider đang chọn (`VLLM_BASE_URL` hoặc API key tương ứng), rồi restart/redeploy. Frontend và đánh giá cơ bản vẫn hoạt động. Đổi domain không tự chuyển dữ liệu khách; chờ kế hoạch tài khoản đồng bộ trước khi dùng origin mới.

## Lỗi thường gặp

| Lỗi | Kiểm tra |
|---|---|
| `NOT_CONFIGURED` | Provider, endpoint/key, Supabase và origin |
| Startup failed | `dist/index.html`, port/origin, cấu hình production |
| `AUTH_REQUIRED` | Phiên đăng nhập; frontend/backend cùng project |
| `QUOTA_UNAVAILABLE` | Migration quota và dịch vụ Supabase |
| `QUOTA_EXCEEDED` | Hạn mức RideMate |
| `ORIGIN_REJECTED` | Domain truy cập và `APP_ORIGIN` |
| `AI_MODEL_OFFLINE` | vLLM, cloudflared, endpoint và gateway |
| `AI_CREDENTIALS_INVALID` | Khóa và quyền model |
| `AI_MODEL_UNAVAILABLE` | Model/schema tương thích |
| `AI_TIMEOUT` | Model không trả lời trong thời gian chờ |
| `AI_PROVIDER_LIMIT` / `AI_PROVIDER_QUOTA` | Hạn mức của nhà cung cấp |

## Production local

Điền `.env.local`, gồm `APP_ORIGIN=http://localhost:10000` nếu truy cập địa chỉ này:

```powershell
npm run build
node --env-file=.env.local server/index.js
```

Server mặc định port 10000; khi đổi `PORT`, đổi origin tương ứng. Trên Render, `npm start` đọc Environment của Dashboard, không upload `.env.local`.
