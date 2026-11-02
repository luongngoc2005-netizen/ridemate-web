# Thời tiết dọc đường — bản web

Mở một chuyến đi → **1. Chuẩn bị → Tổng quan → Bản đồ, thời tiết và thông tin tuyến**. Phía dưới bản đồ có mục **Thời tiết dọc đường**. Chọn ngày, giờ xuất phát, thời gian tham quan/ăn uống rồi bấm **Phân tích thời tiết dọc đường**.

Phần này bổ sung cho dự báo theo ngày tại điểm đến, không thay thế dự báo đó. Chỉ ngày được chọn mới gọi dự báo dọc đường. Các thông số trong form dùng cho lần phân tích, chưa ghi đè lịch đã lưu. Đổi ngày/giờ/thời gian dừng sẽ hủy yêu cầu trước và bỏ kết quả cũ.

## Cách tính

- Tính riêng từng ngày: điểm xuất phát ngày đầu → các điểm dừng → chỗ nghỉ. Ngày sau bắt đầu từ chỗ nghỉ ngày trước. Ngày cuối quay về điểm đi nếu `returnToOrigin` bật. Chưa có nơi nghỉ thì dùng ghim đại diện của điểm đến và hiển thị giả định này.
- Dùng lại `loadRoute`, bộ lọc cao tốc và kiểm tra toàn bộ hình học trong Việt Nam. Không chuyển sang tuyến ô tô khi tuyến xe máy lỗi. Thiếu tọa độ điểm dừng thì yêu cầu bổ sung trước khi phân tích.
- `parseOsrm` giữ thêm `timeTable` của mỗi leg từ distance/duration của từng step trong phản hồi Valhalla định dạng OSRM. Chuẩn hóa để mốc cuối bằng tổng của leg; thiếu dữ liệu step thì nội suy theo tổng chặng và thông báo rõ.
- Nhân thời gian từng step theo mức dự trù chạy của RideMate cho leg đó. Tham quan chia đều cho các điểm đã lên lịch; ăn uống đặt ở giữa tổng thời gian chạy; nghỉ ngắn 15 phút sau mỗi 2 giờ lái. Các điểm ghé có cùng tọa độ vẫn được cộng thời gian dừng. ETA là giờ đến, chưa cộng hoạt động sau khi đã tới điểm cuối.
- Quy ước thời gian xuất phát: ngày/giờ Việt Nam (UTC+7) → epoch UTC. Không dùng múi giờ máy để chọn giờ dự báo. Trần phân tích theo giờ: 7 ngày tới tính cả giờ đến; chặng vượt 24 giờ cần chia lại.
- Lấy mẫu đều theo quãng đường với mật độ mục tiêu khoảng 30 km hoặc 45 phút, bổ sung các điểm ghé và hai đầu tuyến. Quy đổi tỷ lệ giữa tổng chiều dài hình học và số km engine. Dừng nghỉ dài có thể tạo khoảng ETA lớn giữa hai mẫu đường. Giới hạn 48 khoảng đều và 96 mẫu/ngày.
- Lượng mưa và xác suất mưa lấy khung giờ chứa ETA; 15 phút đầu giờ ưu tiên giá trị lớn hơn ở hai khung kề. Gió giật là cực đại của giờ trước nên cũng dùng khung giờ, không nội suy. Nhiệt độ, mây, tầm nhìn nội suy giữa hai mốc. Mã WMO không nội suy; ưu tiên mã dông ở hai mốc.
- Thiếu mốc giờ hoặc dữ liệu mưa/xác suất/mã thời tiết → không có dữ liệu. Thiếu gió/tầm nhìn không được kết luận điều kiện thuận lợi. Dông dựa trên mã WMO 95/96/99, không suy diễn từ xác suất mưa.
- Ngưỡng và màu nằm trong `src/route-weather-data.js`. Đây là quy tắc gợi ý của sản phẩm, chưa được hiệu chỉnh như một thang đánh giá rủi ro đã kiểm định. Màu xanh không xác nhận toàn tuyến an toàn.
- Vẽ toàn bộ hình học bằng màu của mẫu gần nhất; không nối tắt các mẫu. Chế độ màu ngày đi vẫn được giữ. Bấm một mẫu trong danh sách để đưa bản đồ tới đó.

## API và vận hành

`GET /api/route-weather?latitudes=...&longitudes=...&start=EPOCH_SECONDS&end=EPOCH_SECONDS`

- Có trong Node production server và Vite development server. `vite preview` chỉ phục vụ giao diện; khi thử bằng preview cần mock API hoặc chạy Node bằng `npm start` để có endpoint thật.
- Tối đa 15 vị trí/request, hai request song song ở client. Server chỉ gọi endpoint Open-Meteo cố định, chỉ chấp nhận tọa độ trong khung VN, cửa sổ tối đa 48 giờ và thời gian hợp lệ. Không nhận URL tùy ý.
- Chọn `timezone=GMT`, `timeformat=unixtime` và 7 biến hourly: mưa, xác suất mưa, mã thời tiết, nhiệt độ, mây, gió giật, tầm nhìn. Không reverse-geocode thêm từng mẫu: điểm ghé dùng tên đã chọn, các mẫu còn lại hiện km.
- Client cache hữu hạn 160 vị trí/cửa sổ, 30 phút. Server cache hữu hạn 64 batch, 30 phút; gộp yêu cầu đang chạy giống nhau, tối đa 4 request upstream đồng thời và 60 batch mới/phút mỗi tiến trình.
- Upstream timeout 12 giây mỗi lần; retry một lần sau 1 giây với HTTP 429/5xx. Timeout toàn bộ phía client 30 giây. Lỗi một batch giữ được kết quả các batch khác và hiển thị các điểm thiếu màu xám.
- `WEATHER_OPEN_METEO_API_KEY` là biến **server-only**. Có key thì dùng `customer-api.open-meteo.com`, không có thì dùng `api.open-meteo.com` cho đánh giá/phi thương mại. Không đưa key vào `VITE_*`. Tài khoản/gói thương mại chưa được cấu hình trong lần triển khai local này.
- Batching giảm số HTTP request, không có nghĩa mọi vị trí chỉ tính một lượt quota. Kiểm tra điều khoản hiện hành trước khi vận hành thương mại. Khóa khách hàng chỉ tồn tại trên server; API không trả chi tiết lỗi upstream hoặc URL chứa key.
- Chưa hỗ trợ chọn tuyến thay thế, gợi ý giờ khởi hành tự động, dẫn đường nền hoặc cảnh báo thời tiết chính thức. Chưa thay đổi codebase mobile.

## Kiểm tra

```powershell
npm test
npm run build
$env:RIDEMATE_TEST_PRODUCTION='1'
npx playwright test --project=phone-390 --project=desktop
```

Kiểm tra chuyên biệt: `tests/route-weather.test.js`, `tests/route-weather-api.test.js`, `tests/mobile/route-weather.spec.js`. Các ca gồm timeline theo step/dừng/ngày, ghim trùng nhau, UTC, ngưỡng, null, cửa sổ dự báo, cache, batching, hủy yêu cầu cũ, proxy cố định, chuyển ngày/giờ, lớp màu và điều hướng khi dịch vụ lỗi.

Nguồn tham khảo: [đặc tả Open-Meteo](https://open-meteo.com/en/docs), [quyền sử dụng API](https://open-meteo.com/en/pricing), [Valhalla](https://valhalla.github.io/valhalla/api/route/api-reference/). Dữ liệu: Open-Meteo và OpenStreetMap contributors.
