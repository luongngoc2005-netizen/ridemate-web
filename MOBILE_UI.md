# Kiểm tra giao diện điện thoại

## Thay đổi

- Menu dưới chia đúng 5 mục, có icon và nhãn; nút Tài khoản giữ trên header. Khoảng chừa cho menu và vùng an toàn dùng chung trên các màn.
- Khám phá: ô điểm xuất phát/điểm đến đầy hàng, form gọn hơn, không ép ô ngày quá hẹp. Kế hoạch có nút tạo mới và nhóm nút mở/xóa dễ bấm.
- AI Assistant: sửa tin nhắn người dùng bị dàn thành cột do trùng class `.user`; giảm khoảng trống, cuộn ngang các gợi ý, giữ cỡ chữ nhập liệu 16 px. Bong bóng tạm ẩn khi vùng soạn chat có focus để không chen vào lần bấm Gửi.
- Bong bóng hành trình mở thành khung vừa vùng giữa header và menu dưới. Nội dung cuộn riêng, nút đóng rõ hơn và trả focus về nút mở sau khi đóng.
- Chỗ nghỉ: bộ lọc có cột phù hợp, thẻ phòng gọn hơn, ô ngày dành cả hàng ở màn nhỏ. Nhật ký tăng độ tương phản icon và cân lại các ô thành tựu.
- Form tạo chuyến đi, hộp chọn vị trí và đồng hồ dùng khoảng cách/nút bấm phù hợp màn hẹp. Header/menu chừa safe-area khi thiết bị cung cấp giá trị này.

CSS responsive tập trung ở `src/responsive.css`, import sau CSS của từng tính năng. Bố cục desktop được giữ; sửa class tin nhắn và màu nút đóng áp dụng chung.

## Chạy lại

```sh
npm ci
npm test
npm run build
npm run test:mobile
```

`playwright.config.js` chạy một Vite server kiểm thử tại `127.0.0.1:5180`. Windows dùng Microsoft Edge (Chromium) đã cài. Trên hệ thống khác cần browser Chromium của Playwright (`npx playwright install chromium`).

Các project: 320×844, 360×844, 390×844, 430×844, xoay ngang 844×390 và desktop 1440×1000. Ca nhập AI còn đổi viewport xuống cao 500 px để kiểm tra vùng nhập trên màn thấp. Đây không phải bàn phím iOS/Android thật.

`tests/mobile/layout.spec.js` có 12 ca trên mỗi kích thước: Khám phá, Kế hoạch, Tạo kế hoạch, Checklist, AI, Nhật ký, Công cụ, Chỗ nghỉ, Tài khoản, chi tiết hành trình, bong bóng và luồng đồng hồ/chọn vị trí. Kiểm tra tràn ngang, menu, vùng cuộn, đóng/mở và chuyển focus; đồng thời lưu ảnh để đối chiếu trực quan.

Ảnh ở `output/mobile/screenshots/`, log và trace ở `output/mobile/`. Đây là đầu ra local bị Git bỏ qua. Có thể xem các file `phone-390-home.png`, `phone-390-ai.png`, `phone-390-plans.png`, `phone-390-companion.png` và `phone-320-stays.png` sau khi chạy.

## Phạm vi xác minh

Browser dùng context và kế hoạch khách kiểm thử riêng, không đăng nhập, không xin GPS, không thay đổi tài khoản/kế hoạch thật và không gửi prompt tới model. API trạng thái AI được giả lập ở chế độ cơ bản. Bản đồ có thể đang tải tile/tuyến khi chụp; ảnh không chứng minh chất lượng dữ liệu hoặc dẫn đường.

Kiểm thử giao diện trên localhost không thay thế nghiệm thu trên điện thoại thật hoặc Render sau deploy, đặc biệt với bàn phím, tai thỏ, GPS và thanh địa chỉ động của Safari.
