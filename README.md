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
- Bản đồ cung đường và các điểm hỗ trợ dọc đường
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

## Bản đồ tổng quan hành trình
- Leaflet hiển thị đường đi từ điểm xuất phát đến điểm đến; Photon tìm tọa độ tại Việt Nam, Valhalla tính tuyến xe máy với yêu cầu tránh cao tốc. Tuyến chưa bao gồm các điểm tham quan từng ngày. Người dùng mở Google Maps và chọn xe máy để dẫn đường.
- Overpass tìm cây xăng, quán ăn và điểm nghỉ/chỗ ở tại 5 vùng nhỏ dọc tuyến, lọc trong khoảng 1,5 km theo đường thẳng tới tuyến và chọn tối đa 3 điểm mỗi loại. Đây là một số gợi ý, không phải danh sách đầy đủ. Dữ liệu lấy từ OpenStreetMap, không xác minh giờ mở cửa.
- Các điểm có ghim trên bản đồ và danh sách bên dưới Thông tin nhanh. Nếu nguồn dữ liệu lỗi, cung đường vẫn hiển thị khi đã tải được; app cung cấp thử lại và liên kết tìm trên Google Maps.
- Các dịch vụ công cộng hiện dùng cho demo, không cần API key và không đảm bảo tính sẵn sàng. Trước khi mở rộng cần chọn nhà cung cấp/hạ tầng phù hợp và kiểm tra chính sách sử dụng. Có thể đổi endpoint bằng `VITE_GEOCODER_URL`, `VITE_ROUTER_URL`, `VITE_PLACES_URL`, `VITE_TILE_URL` khi build.
- Cache tọa độ 7 ngày, tuyến 24 giờ, điểm hỗ trợ 6 giờ, tối đa 8 mục trong trình duyệt. Không tải trước bản đồ offline. Tính năng này không bổ sung backend hay database.
- Nguồn và chính sách: [Leaflet](https://leafletjs.com/), [Photon](https://github.com/komoot/photon), [Valhalla](https://github.com/valhalla/valhalla), [OSM tiles](https://operations.osmfoundation.org/policies/tiles/).

## Nhật ký và thành tựu theo năm
- “Tạo bài mới” và “Thêm bài viết” tạo một bản ghi cho một chuyến đi đã hoàn thành. Người dùng nhập ngày kết thúc, km thực tế, các điểm đã đến, kỷ niệm và nhật ký; có thể chỉnh sửa hoặc xóa sau khi lưu.
- Chọn năm để xem tổng km, số chuyến và số điểm đã đến. Điểm trùng tên (không phân biệt chữ hoa/thường) chỉ tính một lần trong năm; nên nhập kèm tỉnh/thành. Chuyến đang lên kế hoạch không tự tính vào thành tựu.
- Mỗi chuyến có tối đa 8 ảnh JPG/PNG/WebP, tối đa 10 MB mỗi ảnh; ảnh được thu nhỏ cạnh dài tối đa 1600px và lưu JPEG. Có thể chọn ảnh bìa, bỏ ảnh và mở ảnh lớn trong chi tiết hành trình.
- Nhật ký và ảnh được lưu cục bộ bằng IndexedDB, độc lập với chuyến đang lập kế hoạch. Chưa upload lên server hoặc đồng bộ tài khoản. Xóa dữ liệu trình duyệt sẽ mất nhật ký; lỗi lưu được báo ngay và giữ nguyên bản nháp để thử lại.
