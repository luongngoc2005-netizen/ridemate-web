# Provider OpenRouter tùy chọn

Code vẫn hỗ trợ OpenRouter. Nếu dùng model tự host, làm theo [VLLM_SETUP](./VLLM_SETUP.md).

Lấy API key từ [OpenRouter](https://openrouter.ai/settings/keys), đặt trong `.env.local` cho dev hoặc Environment của Render Web Service:

```dotenv
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=YOUR_OPENROUTER_KEY
OPENROUTER_MODEL=openrouter/free
```

Giữ Supabase/Auth/migration quota và origin theo [RENDER_DEPLOY](./RENDER_DEPLOY.md). Key chỉ ở server, không có tiền tố `VITE_`. Khởi động lại dev hoặc restart/redeploy Render khi đổi cấu hình.

`openrouter/free` là giá trị cấu hình mặc định của adapter; lựa chọn model, khả năng hỗ trợ schema và hạn mức phía nhà cung cấp cần kiểm tra khi dùng. Có thể đặt ID model cụ thể hỗ trợ Chat Completions JSON Schema. Code không tự đổi sang model trả phí hoặc provider khác khi lỗi.

Đăng nhập và thử tạo/chỉnh bản nháp. `ready:true` chỉ xác nhận đủ cấu hình. Timeout OpenRouter 90 giây. Các mã lỗi: `AI_PROVIDER_LIMIT`, `AI_PROVIDER_QUOTA`, `AI_MODEL_UNAVAILABLE`, `AI_CREDENTIALS_INVALID`, `AI_TIMEOUT`; `QUOTA_EXCEEDED` là quota của RideMate.

Muốn dùng OpenAI, chọn `AI_PROVIDER=openai` và cấu hình `OPENAI_API_KEY`, `OPENAI_MODEL`. Hai provider dùng key riêng.
