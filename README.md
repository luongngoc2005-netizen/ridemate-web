# RideMate Web Demo

## Chạy thử
1. Cài Node.js 20+
2. Mở Terminal tại thư mục `ridemate-web`
3. Chạy:

```bash
npm install
npm run dev
```

4. Mở địa chỉ Vite hiện ra, thường là `http://localhost:5173`

## Demo có sẵn
- Home
- Tạo chuyến
- Chi tiết chuyến
- Checklist tương tác
- Công cụ hỗ trợ mở Google Maps
- Google Maps preview
- AI Assistant demo cục bộ
- Nhật ký hành trình
- Responsive cơ bản

Lưu ý: AI hiện là demo logic cục bộ, chưa gọi API thật.

## Hành trình có thể chỉnh sửa
- Tạo chuyến đi từ Khám phá hoặc Lên kế hoạch; dùng nút **Tổng quan hành trình** để quay lại từ mọi màn hình.
- **Chỉnh sửa** thay đổi điểm đi, điểm đến, ngày khởi hành, số ngày, sở thích và ghi chú. Những ngày được giữ lại không mất lịch trình đã tự sửa. Giảm số ngày cần xác nhận trước khi bỏ các ngày cuối.
- **Lịch trình** cho phép đổi tiêu đề ngày, thêm/xóa/đổi thứ tự điểm tham quan và ghi chú từng ngày. Bấm **Lưu ngày** để áp dụng, hoặc **Hủy chỉnh sửa** để bỏ bản nháp.
- Gợi ý tham quan cho Hà Giang, Cao Bằng, Mộc Châu và Cát Bà có nguồn Vietnam Tourism ngay trong giao diện. Đây là khung tham khảo, chưa tính quãng đường hoặc thời gian di chuyển; các điểm đến khác hỗ trợ tự nhập và tìm trên Google Maps.
- Tab **Ghi chú** lưu tự động nội dung chung và ghi chú từng ngày. Checklist cũng được lưu khi đổi màn hình.
- Hiện lưu **một chuyến đi** bằng localStorage trên trình duyệt của từng người dùng. Tạo chuyến mới cần xác nhận thay thế chuyến cũ. Dữ liệu giữ được sau khi tải lại trang nhưng chưa đồng bộ tài khoản/thiết bị và không còn nếu xóa dữ liệu trình duyệt. Khi trình duyệt từ chối lưu, app hiển thị cảnh báo.

## Kiểm tra
`npm test` kiểm tra tạo lịch trình, sửa số ngày giữ dữ liệu, định dạng ngày và xử lý lưu trữ lỗi.
`npm run build` tạo bản triển khai trong `dist`.
