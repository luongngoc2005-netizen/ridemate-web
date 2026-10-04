# RideMate

Ứng dụng lập kế hoạch du lịch bằng xe máy: nhiều kế hoạch, AI tạo bản nháp, bản đồ, kiểm tra quỹ thời gian, checklist và nhật ký. Chỗ nghỉ hiện là tính năng demo.

## Bắt đầu

Cần Node.js 22+. Chạy tại thư mục `Web/ridemate-web`:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Chỉ sao chép `.env.example` khi chưa có `.env.local`. Điền cấu hình rồi khởi động lại Vite. Địa chỉ truy cập là URL Vite in ra, thường `http://localhost:5173`.

- Không cấu hình Supabase: dùng kế hoạch và nhật ký khách trên trình duyệt.
- Có Supabase: đăng nhập email/mật khẩu, đồng bộ kế hoạch/checklist và nhật ký theo tài khoản.
- Có provider AI và migration hạn mức: đăng nhập để tạo/chỉnh bản nháp bằng model. Đánh giá cơ bản vẫn dùng được khi AI không hoạt động.

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [HANDOFF.md](./HANDOFF.md) | Bàn giao, kiến trúc, giới hạn và nghiệm thu |
| [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) | Tài khoản, dữ liệu, ảnh, migration |
| [VLLM_SETUP.md](./VLLM_SETUP.md) | Model tự host và Cloudflare Tunnel |
| [OPENROUTER_SETUP.md](./OPENROUTER_SETUP.md) | Provider OpenRouter tùy chọn |
| [RENDER_DEPLOY.md](./RENDER_DEPLOY.md) | Deploy frontend và API Node cùng nguồn |
| [AI_ASSISTANT.md](./AI_ASSISTANT.md) | Luồng hội thoại, bản nháp và xác nhận |
| [PLANNING_SYNC.md](./PLANNING_SYNC.md) | Tọa độ, đánh giá từng ngày và đồng bộ kế hoạch |

## Các luồng hiện có

- Tạo nhiều kế hoạch từ Khám phá, form hoặc bản nháp AI. Chọn kế hoạch trước khi mở lịch trình, bản đồ và checklist; không tự mở kế hoạch khi đăng nhập.
- Sửa thông tin chuyến, ngày, thứ tự điểm ghé, ghi chú và checklist. Giảm số ngày cần xác nhận trước khi bỏ ngày cuối.
- AI hỏi từng thông tin còn thiếu, hiển thị bản nháp để sửa và xác nhận. Không tự lưu kế hoạch hoặc đặt dịch vụ.
- Tìm tọa độ điểm tham quan từ Photon/OpenStreetMap. Kết quả không rõ cần người dùng chọn; có Google Maps để đối chiếu và nhập tọa độ thủ công đã xác nhận.
- Kiểm tra từng ngày qua điểm ghé và nơi nghỉ; cảnh báo vượt giới hạn giờ chạy hoặc mốc kết thúc. Giả định chưa xác minh được ghi rõ và chỉnh được.
- Kế hoạch/checklist tự đồng bộ theo tài khoản, có cache riêng khi mất mạng và xử lý xung đột. Kế hoạch khách chỉ nhập vào tài khoản khi người dùng chọn.
- Hoàn thành chuyến mở form nhật ký; chỉ đánh dấu hoàn thành sau khi lưu thành công. Nhật ký gồm km thực tế, điểm đã đến, nội dung, ảnh và thống kê theo năm.
- Chỗ nghỉ có tìm phòng, đặt/hủy và liên kết ghim với hành trình **bằng dữ liệu demo**; không thu tiền hoặc giữ phòng thật.

## Bản đồ và thời gian

MapLibre/OpenFreeMap hiển thị bản đồ; Photon tìm địa điểm; Valhalla dùng profile `motorcycle`, yêu cầu tránh cao tốc và kiểm tra các đoạn cao tốc trả về; Overpass tìm cây xăng, quán ăn, đồ uống, sửa xe và điểm nghỉ dọc tuyến. Dịch vụ công cộng có thể lỗi hoặc thiếu dữ liệu. Các endpoint cấu hình tại `.env.example`.

Tuyến tổng quan nối điểm đi → các điểm có tọa độ theo thứ tự lịch trình → điểm đến. **Tuyến này chưa tự dùng `returnToOrigin` để thêm chặng về.** Phần kiểm tra từng ngày tính riêng nơi bắt đầu/kết thúc, nơi nghỉ và chặng về khi được yêu cầu. Không dùng tổng tuyến tổng quan làm tổng km/thời gian của chuyến khứ hồi.

ETA Valhalla giữ riêng với dự trù lập kế hoạch. Dự trù lấy giá trị lớn hơn giữa ETA và quãng đường/40 km/h, cộng nghỉ 15 phút sau mỗi 2 giờ chạy. Tổng quan có khoảng dự phòng thêm 25% thời gian chạy; kiểm tra từng ngày cộng thời gian tham quan và ăn uống do người dùng chỉnh. Chưa có giao thông trực tiếp hoặc ETA Google tự động.

Google Maps tính tuyến riêng; link yêu cầu xe máy và tránh cao tốc. Nếu vị trí truy cập không hỗ trợ xe máy, chọn xe máy trong ứng dụng Google Maps. Thời gian ô tô không tương đương thời gian xe máy.

Thời tiết Open-Meteo theo điểm đến và ngày chuyến đi trong cửa sổ 16 ngày, không phải toàn tuyến. Ngày quá khứ/quá xa được báo thiếu dự báo. GPS dùng quyền của trình duyệt, cần HTTPS hoặc localhost; vị trí sống chỉ giữ trong RAM, vị trí xuất phát đã xác nhận có thể lưu cùng kế hoạch.

## Kiểm tra và deploy

```powershell
npm test
npm run build
npm run check:route
node --env-file=.env.local scripts/check-vllm.js
```

Hai lệnh cuối gọi dịch vụ thật; `check:vllm` gửi hai yêu cầu mẫu trực tiếp đến model, không kiểm tra Auth/quota của web. `check:route` mặc định kiểm tra chặng một chiều Hà Nội–Cao Bằng.

Deploy Render **Web Service**: Build `npm ci --include=dev && npm run build`, Start `npm start`, Health Check `/healthz`. Static Site không phục vụ API AI. Xem [hướng dẫn deploy](./RENDER_DEPLOY.md).

## Giới hạn

Chưa có dẫn đường từng ngã rẽ, bản đồ offline, xác minh giờ mở cửa/phòng trống/giá vé, đánh giá thời tiết toàn tuyến hoặc đặt phòng thật. Nhật ký chưa có hàng đợi lưu offline và dọn ảnh cloud không còn sử dụng. Hội thoại và bản nháp chưa xác nhận chỉ giữ trong phiên màn hình. Kiểm thử local không thay thế nghiệm thu HTTPS, GPS, Supabase và deploy thật.
