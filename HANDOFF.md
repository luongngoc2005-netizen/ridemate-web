# Bàn giao RideMate

Tài liệu mô tả code hiện tại, cập nhật 04/10/2026. Xem [README](./README.md) để chạy ứng dụng. Không dùng tài liệu này làm bằng chứng đã deploy hoặc nghiệm thu dịch vụ thật.

## Kiến trúc

- React/Vite: `src/main.jsx`, các màn hình kế hoạch, AI, nhật ký, tài khoản và chỗ nghỉ.
- Node: `server/index.js` phục vụ `dist` và API AI cùng nguồn; Vite tích hợp API khi chạy dev.
- Supabase: Auth email/mật khẩu, workspace JSONB, RPC có revision, ảnh private và đơn chỗ nghỉ demo.
- Provider AI: vLLM Chat Completions, OpenRouter Chat Completions hoặc OpenAI Responses. Chọn bằng `AI_PROVIDER`; không tự chuyển provider khi lỗi.
- MapLibre/OpenFreeMap, Photon, Valhalla xe máy, Overpass và Open-Meteo. Bộ giải mã tên `osrm-data.js` xử lý định dạng tương thích OSRM của Valhalla, không có nghĩa dịch vụ định tuyến đang dùng OSRM ô tô.

## Điểm vào các phần chính

| Phần | File |
|---|---|
| Nhiều kế hoạch | `src/plans-data.js`, `src/Plans.jsx` |
| Đồng bộ tài khoản | `src/usePlanSync.js`, `src/plan-sync.js` |
| AI và bản nháp | `src/AIAssistant.jsx`, `src/DraftReply.jsx`, `server/draft-api.js` |
| Tọa độ điểm tham quan | `src/attraction-location.js`, `src/DraftLocations.jsx`, `src/TripLocations.jsx` |
| Quỹ thời gian từng ngày | `src/trip-feasibility.js`, `src/TripFeasibility.jsx` |
| Tuyến tổng quan | `src/route-data.js`, `src/motorcycle-routing.js`, `src/TripRouteContext.jsx` |
| Nhật ký cloud | `src/journal-sync.js`, `src/cloud-journal.js` |
| Chỗ nghỉ demo | `src/stays/`, migration demo bookings |

## Lưu và chuyển dữ liệu

Khách dùng localStorage cho kế hoạch và IndexedDB cho nhật ký/ảnh. Đăng nhập dùng cache kế hoạch riêng theo user ID và tự đồng bộ Supabase; nhật ký lưu trực tiếp lên tài khoản. Không tự nhập dữ liệu khách: dùng nút nhập kế hoạch trong Tài khoản và nút nhập nhật ký trong Nhật ký hành trình.

Cache kế hoạch chứa bản sửa và bản gốc để hợp nhất ba phiên bản. Sửa các mục khác nhau được gộp; sửa trùng nội dung cần chọn bản giữ lại. RPC retry giữ nguyên nhật ký và ảnh. Đổi tài khoản không chuyển bản sửa sang tài khoản khác. Hồ sơ người lái chung và hội thoại chưa tự đồng bộ; hồ sơ đã xác nhận trong kế hoạch đi cùng kế hoạch.

Khi đổi máy/origin, chờ kế hoạch báo đã đồng bộ trước khi mở tài khoản trên thiết bị mới. Dữ liệu khách ở origin cũ không tự di chuyển. Cập nhật tất cả thiết bị sang bản app mới để tránh thao tác ghi snapshot từ phiên bản cũ.

## Những giới hạn cần giữ rõ

1. Tuyến tổng quan chưa thêm chặng về theo `returnToOrigin`; kiểm tra từng ngày có tính chặng về. Không trình bày hai kết quả là cùng một tổng tuyến.
2. Nơi nghỉ chưa có tọa độ dùng điểm đại diện của khu vực đã chọn; chưa thể coi là địa chỉ khách sạn thật.
3. Tra cứu tên có thể trả nhiều ghim. Chọn đúng điểm tiếp cận/cổng vào và kiểm tra biển báo; không bảo đảm dữ liệu OSM đầy đủ hoặc chính xác tuyệt đối.
4. Kiểm tra từng ngày và đánh giá cơ bản trong chat là hai luồng: chat vẫn không tự suy ra thời gian mọi ngày từ tổng tuyến.
5. Trạng thái AI `ready` phản ánh cấu hình, không xác nhận model đang bật. Quick Tunnel có thể đổi hostname khi tạo lại.
6. Chưa có ETA Google tự động, giao thông trực tiếp, bản đồ offline hoặc đặt dịch vụ thật. Nhật ký không có hàng đợi offline; ảnh cloud chưa được dọn khi không còn tham chiếu.
7. Build có cảnh báo bundle lớn; UI/GPS thiết bị, Supabase đa thiết bị và deploy cần nghiệm thu riêng.

## Nghiệm thu và vận hành

- Chạy `npm test`, `npm run build`; xem [PLANNING_SYNC](./PLANNING_SYNC.md) cho ca tọa độ, thời gian, offline và xung đột.
- Kiểm tra đăng ký, email xác nhận, quên mật khẩu và dữ liệu tách biệt giữa hai tài khoản.
- Thử cùng tài khoản trên hai thiết bị: checklist khác mục, ghi chú cùng mục và bản sửa khi mất mạng.
- Thử GPS cho phép/từ chối trên HTTPS; xác nhận tọa độ điểm đi và ghim tham quan sau reload.
- Bật/tắt vLLM: lỗi model giữ bản nháp; `/healthz` và `ready` không thay thế yêu cầu AI có đăng nhập.
- Kiểm tra chỗ nghỉ demo và migration riêng; không dùng đơn demo làm xác nhận phòng thật.

Lượt triển khai gần nhất đã có 152 kiểm thử đạt, kiểm thử phần sửa cuối và build đạt. Tra cứu địa điểm và tuyến từng ngày Cao Bằng đã thử bằng dịch vụ thật. UI local bị timeout; chưa nghiệm thu Supabase trên hai thiết bị thật hoặc xác nhận deploy bản mới. Các số này là kết quả kiểm tra tại thời điểm ghi tài liệu, không phải trạng thái dịch vụ hiện tại.
