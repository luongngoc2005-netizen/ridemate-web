# Dùng OpenRouter cho RideMate

1. Tạo API key tại https://openrouter.ai/settings/keys. Không gửi key vào chat hoặc commit Git.
2. Trên Render → Web Service → Environment, đặt:

```dotenv
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=thay_bang_key_cua_ban
OPENROUTER_MODEL=openrouter/free
```

Giữ cấu hình Supabase hiện có. Backend vẫn yêu cầu đăng nhập và migration
`supabase/migrations/202609300001_ai_quota.sql` đã chạy trong Supabase SQL Editor.
Không cần migration mới cho OpenRouter. Backend dùng Render hostname làm origin;
nếu dùng domain riêng, đặt `APP_ORIGIN=https://domain-cua-ban`.

3. Deploy phiên bản code có hỗ trợ OpenRouter, lưu biến môi trường và redeploy.
   Render phải chạy Web Service Node (`npm start`), không phải Static Site.
4. Đăng nhập và thử tạo lịch trình, sau đó yêu cầu sửa bản nháp. Kiểm tra
   `/api/assistant/status`: `ready: true` chỉ xác nhận đủ cấu hình, không xác minh key/hạn mức.

Local: đặt các biến trên vào `.env` (không dùng tiền tố `VITE_` cho key AI),
giữ các biến Supabase rồi khởi động lại `npm run dev`.

`openrouter/free` chọn model miễn phí khả dụng theo yêu cầu structured output;
model có thể thay đổi giữa các lượt. Code không tự chuyển sang model trả phí
hoặc OpenAI khi hết hạn mức. Có thể chọn ID model cụ thể trong `OPENROUTER_MODEL`,
nhưng phải kiểm tra giá và hỗ trợ structured output trước.

- `AI_PROVIDER_LIMIT`: nhà cung cấp giới hạn yêu cầu; thử lại sau, không gửi liên tục.
- `AI_TIMEOUT`: model chưa trả lời trong 90 giây. Thử lại sau hoặc dùng model tương thích khác; backend không tự thử lại để tránh tiêu thụ thêm hạn mức.
- `AI_PROVIDER_QUOTA`: hết số dư/hạn mức phía nhà cung cấp.
- `AI_MODEL_UNAVAILABLE`: model/endpoint không khả dụng hoặc không hỗ trợ schema.
- `AI_CREDENTIALS_INVALID`: kiểm tra key và quyền truy cập model.
- `QUOTA_EXCEEDED`: hạn mức riêng của RideMate trong Supabase.

Muốn quay lại OpenAI: đặt `AI_PROVIDER=openai`, cấu hình `OPENAI_API_KEY`
và `OPENAI_MODEL`. Hai nhà cung cấp dùng key riêng, không dùng chéo.

Tài liệu: https://openrouter.ai/docs/guides/routing/routers/free-router
và https://openrouter.ai/docs/guides/features/structured-outputs.
