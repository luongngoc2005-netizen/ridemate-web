# Kiểm thử luồng AI trên Render — 18/10/2026

Trang: https://ridemate-pka.onrender.com/ . Thử bằng Edge qua giao diện với phiên
đã đăng nhập. Đây là kết quả của bản đang deploy, không phải nghiệm thu các sửa
đổi local chưa push. Không nhập mật khẩu, không bật GPS và không đặt dịch vụ.

## Kịch bản và kết quả

1. Vào AI Assistant, gửi "Xin chào": trả lời chào, không tạo lịch trình — đạt.
2. Yêu cầu 3 ngày 2 đêm Hà Nội → Lạng Sơn bằng xe máy, các địa danh nổi tiếng,
   có quay về. Trả lời ngày 24/10/2026, 06:30, 2 người/1 xe, không yêu cầu riêng.
   Form hỏi tiếp từng thông tin còn thiếu và dùng hồ sơ lái xe đã lưu — đạt.
3. AI trả JSON được hiển thị thành lịch 3 ngày — phần kết nối/render đạt.
   Nội dung không đạt: đưa Bản Giốc, Ngườm Ngao vào hành trình Lạng Sơn và tự
   ghi giờ đến 12:00/18:00 dù chưa có tuyến đã tính.
4. Điểm đến bị tách thành cả câu "Lạng Sơn bằng xe máy, chọn các địa danh nổi
   tiếng tại Lạng Sơn". Các bước tìm tọa độ và đánh giá ngày đều lỗi theo tên này.
5. Yêu cầu sửa để ngày 2 chỉ đi Tam Thanh/Nhị Thanh, bỏ các điểm khác: ngày 2
   thay đổi nhưng vẫn giữ một điểm đã yêu cầu bỏ và giờ đến chưa xác minh.
   Điểm đến lại bị đổi thành cả đoạn câu yêu cầu sửa — không đạt.
6. Bấm Dùng lịch trình này: mở form, có sẵn ngày/giờ/người/xe — đạt.
7. Sửa Điểm đến thành Lạng Sơn. Bấm lưu khi chưa tích ô xác nhận: báo
   "Bạn cần đánh dấu xác nhận đã xem lịch trình." — đạt.
8. Tích xác nhận và lưu: hiện ĐÃ LƯU; mở được kế hoạch; số kế hoạch tăng từ 1
   lên 2 — đạt. Kế hoạch thử: `2e522a3d-fab3-45ff-8af8-50fcb132730c`.
9. Ghi chú chung được gắn nhãn [KIỂM THỬ WEB — KHÔNG DÙNG ĐỂ ĐI THỰC TẾ].
   Sau reload, kế hoạch và ghi chú vẫn có trong danh sách. Mở lại hiện trạng thái
   "Kế hoạch đã đồng bộ tài khoản." — lưu trữ/reopen đạt; chưa đối chiếu thiết bị khác.
10. Reload trang kế hoạch làm mất active trip trên URL, hiện Chưa có chuyến đi;
    chọn lại từ danh sách thì dữ liệu vẫn đủ — lỗi khôi phục điều hướng, không mất dữ liệu.
11. Trở về Khám phá và mở bong bóng: hiển thị đúng Hà Nội → Lạng Sơn. Chọn Cây
    xăng tải 30 ghim; chọn Sửa xe tải 30 ghim; chỗ nghỉ tải 30 ghim; có liên kết chỉ đường theo tọa độ.
    Tuyến đại diện hai đầu tải được; chưa xác nhận tuyến qua từng điểm tham quan.
12. Nhóm Quán ăn đứng ở "Đang tìm các điểm dọc tuyến… 0/5 đoạn đã tải" qua
    nhiều lần quan sát; chưa có kết quả. Chuyển sang chỗ nghỉ thì tải được 30 điểm.
    Chưa xác nhận quán ăn/đồ uống hoạt động; cần kiểm tra riêng nguồn Overpass và thời gian chờ.

## Giới hạn

- Bản online vẫn có tab Hành trình; các sửa chọn địa danh nổi tiếng, kiểm tra
  sai khu vực và bỏ tab chỉ mới ở local.
- Chưa kiểm tra GPS thật, di chuyển thực tế, Google Maps mở và dẫn đường,
  các điểm tham quan qua tọa độ đã xác nhận hoặc đồng bộ trên thiết bị thứ hai.
- Thao tác popup ghim bằng công cụ điều khiển gặp lỗi tọa độ cửa sổ nên chưa
  xác nhận popup bằng thao tác trực tiếp. Không quy lỗi công cụ này cho web.
- Giữ lại kế hoạch kiểm thử có nhãn để người dùng xem; kế hoạch có sẵn không bị chỉnh.

## Sửa local phát hiện trong lần thử này

- Tách điều kiện phương tiện/sở thích khỏi tên điểm đến.
- Chỉ đổi điểm đi/đến khi người dùng yêu cầu đổi tuyến hoặc đổi điểm đến rõ ràng;
  nhắc địa danh trong câu sửa ngày không thay metadata tuyến.
- Local: 222/222 kiểm thử đạt; build thành công. Chưa push hoặc deploy các sửa
  trong phiên này. Cần chạy nghiệm thu lại trên Render sau khi deploy.
