# Dùng model vLLM cho RideMate

Luồng: trình duyệt → backend RideMate → vLLM Chat Completions. Backend kiểm tra đăng nhập Supabase và quota. Kế hoạch chỉ lưu sau xác nhận.

## Model và endpoint

vLLM cần served model name `ridemate-qwen` (hoặc đổi `VLLM_MODEL`) và hỗ trợ JSON Schema qua Chat Completions. Backend gửi `response_format.type=json_schema`, `temperature=0.3`, `stream=false`; timeout model 90 giây. Lời chào qua curl hoạt động chưa đủ để xác nhận hai schema ý định/lịch trình của web.

Nếu backend và vLLM cùng máy, có thể dùng `http://localhost:8036/v1`. Với server khác, dùng HTTPS. `localhost` là máy chạy backend RideMate, không phải máy mở trình duyệt.

## Cloudflare Tunnel

Giữ cloudflared chạy độc lập với vLLM. Tắt/bật model không đổi URL khi cùng tiến trình Quick Tunnel vẫn chạy; tạo lại Quick Tunnel thường cấp hostname khác. Khi URL đổi, cập nhật `VLLM_BASE_URL` và restart/redeploy backend.

Named Tunnel với hostname trên domain bạn sở hữu/quản lý dùng cho địa chỉ ổn định. Không nhập domain tự đặt chưa sở hữu. Origin service theo cấu hình vLLM ví dụ này là **HTTP** `http://localhost:8036`; HTTPS là phía URL công khai của tunnel.

## Cấu hình web

Giữ cấu hình Supabase và migration quota theo [SUPABASE_SETUP](./SUPABASE_SETUP.md), rồi đặt:

```dotenv
AI_PROVIDER=vllm
VLLM_BASE_URL=https://HOSTNAME_TUNNEL_CUA_BAN/v1
VLLM_MODEL=ridemate-qwen
VLLM_API_KEY=
```

`VLLM_API_KEY` để trống khi server không yêu cầu key. Nếu bật xác thực, đặt key riêng cho vLLM; không dùng chéo key OpenAI/OpenRouter. Các biến này chỉ ở server, không có tiền tố `VITE_`.

- Dev: `.env.local`, khởi động lại `npm run dev`.
- Render: Environment của Web Service, restart/redeploy; xem [RENDER_DEPLOY](./RENDER_DEPLOY.md).
- Production local: `npm run build`, đúng `APP_ORIGIN`, rồi `node --env-file=.env.local server/index.js`.

## Kiểm tra

Dùng endpoint đã điền trong `.env.local`:

```powershell
node --env-file=.env.local scripts/check-vllm.js
```

Lệnh gửi hai yêu cầu mẫu trực tiếp tới model, không kiểm tra Auth/quota của web. Không gửi key vào chat hoặc commit Git.

Sau đó bật model, mở web và đăng nhập; tạo/sửa lịch trình rồi xác nhận. Thử tắt model và gửi lại để kiểm tra bản nháp được giữ. `/api/assistant/status` chỉ xác nhận đủ cấu hình; không kiểm tra model đang bật.

| Lỗi | Ý nghĩa |
|---|---|
| `AI_MODEL_OFFLINE` | Kết nối model/tunnel hoặc gateway lỗi |
| `AI_MODEL_UNAVAILABLE` | Server từ chối model/schema |
| `AI_TIMEOUT` | Model hết thời gian chờ |
| `AI_INVALID_OUTPUT` / `AI_INVALID_DRAFT` | Output chưa hợp lệ, không lưu kế hoạch |

Backend không tự đổi provider hoặc thử lại khi lỗi.
