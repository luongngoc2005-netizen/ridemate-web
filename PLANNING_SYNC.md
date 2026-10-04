# Tọa độ, đánh giá lịch và tự đồng bộ kế hoạch

## Vị trí điểm tham quan

Bản nháp AI và chi tiết kế hoạch có phần tìm tọa độ từ Photon/OpenStreetMap.
Tự chọn chỉ khi tên điểm tham quan khớp chính xác, đúng loại và địa chỉ chứa
khu vực yêu cầu, với một kết quả duy nhất. Nhiều kết quả hoặc không đủ địa chỉ
thì người dùng phải chọn. Không tự gán tọa độ từ model, cửa hàng, bến xe hoặc
điểm trung tâm tỉnh thay cho điểm tham quan.

Giữ MapLibre/OpenStreetMap theo lựa chọn của người dùng. Link Google Maps dùng
để đối chiếu; không gọi Google Places API. Có thể bấm chuột phải đúng điểm trên
Google Maps, sao chép **vĩ độ, kinh độ**, nhập vào web và xác nhận. Web chuyển
đúng sang thứ tự kinh độ/vĩ độ nội bộ, kiểm tra ranh giới Việt Nam. Nguồn tọa độ
thủ công được ghi rõ. Một ghim địa danh có thể khác cổng vào/bãi đỗ xe: chọn vị trí
phù hợp để tiếp cận thực tế. Không khẳng định độ chính xác tuyệt đối của OSM.

Tọa độ, địa chỉ và nguồn đi cùng điểm khi xác nhận bản nháp và khi đồng bộ.
Đổi tên hoặc điểm đến không tái dùng tọa độ của bản nháp cũ.

## Kiểm tra khả thi

Kiểm tra từng ngày trước khi lưu bản nháp (khi đã có thông tin xác nhận) và trong
chi tiết kế hoạch. Tuyến nối nơi bắt đầu ngày → các điểm có tọa độ → nơi nghỉ
cuối ngày. Ngày cuối về đúng điểm xuất phát nếu returnToOrigin=true. Nơi nghỉ
cụ thể chọn qua tìm địa chỉ/ghim bản đồ. Nếu chỉ chọn khu vực nghỉ, dùng điểm đại diện của khu vực đó; chưa chọn thì dùng điểm đại diện của điểm đến và ghi rõ giả định. Không hiểu nội dung văn bản nơi nghỉ thành tọa độ.

Thiếu tọa độ điểm tham quan hoặc dịch vụ tuyến lỗi thì không công bố thời gian
đầy đủ cho ngày đó. Thời gian lập kế hoạch dùng giá trị lớn hơn giữa Valhalla
xe máy và quãng đường/40 km/h, thêm nghỉ 15 phút sau mỗi 2 giờ chạy; mặc định
60 phút tham quan/điểm và 60 phút ăn uống/ngày, đều có thể chỉnh. Giờ 07:00 và
mốc kết thúc 18:00 là giả định có thể chỉnh, không phải dữ liệu giờ hoàng hôn.
So với giới hạn giờ chạy và mong muốn tránh tối, báo quá tải, đề xuất giảm điểm,
chia chặng hoặc thêm đêm; không tự đổi lịch. Chưa có giao thông trực tiếp,
giờ mở cửa, thời tiết toàn tuyến hoặc xác nhận phòng trống.

## Đồng bộ kế hoạch/checklist

Dùng Supabase user_workspaces và RPC save_workspace hiện có; không cần migration
mới nếu đã làm SUPABASE_SETUP.md. Kế hoạch của từng tài khoản có cache riêng
ridemate.account-plans.v1:<user-id>; kế hoạch khách giữ ở khóa cũ. Đăng nhập không
tự nhập kế hoạch khách: vào Tài khoản → Nhập kế hoạch khách từ trình duyệt.
Kế hoạch trùng ID trong tài khoản được giữ, không bị nhập đè.

Tạo/sửa lịch, tọa độ, checklist và ghi chú ghi cache trước, tự gửi khi online.
Đọc lại mỗi 15 giây khi tab hiện, khi trở lại tab/cửa sổ hoặc mạng phục hồi.
Không tự chọn kế hoạch đang mở trên thiết bị mới. Mất mạng giữ bản sửa để thử
lại; đóng trang không mất bản sửa đã ghi cache, nhưng chưa đảm bảo bản cloud đã
lưu trước khi có trạng thái đồng bộ.

Hợp nhất ba phiên bản (bản gốc/local/cloud), theo ID kế hoạch, ngày, điểm và
checklist. Mục khác nhau hợp nhất; cùng trường hoặc thứ tự xung đột thì dừng
và cho chọn bản local/cloud chỉ cho phần xung đột. RPC revision retry giữ nguyên
nhật ký/ảnh và thay đổi không liên quan. Đổi tài khoản vô hiệu hóa callback cũ.
Không gửi dữ liệu kế hoạch khách/tài khoản khác tự động.

## Nghiệm thu

1. Tạo lịch AI Cao Bằng; chọn đúng thác/cửa hang, đối chiếu Google Maps, xác nhận.
2. Kiểm tra ghim giữ sau reload, đổi tên không giữ ghim cũ, thiếu ghim báo thiếu.
3. Chọn giới hạn 6 giờ/ngày: Hà Nội–Cao Bằng báo vượt sức chạy ở ngày đi/về.
4. Đăng nhập cùng tài khoản hai thiết bị; tick hai mục checklist khác nhau,
   xác nhận cả hai được giữ. Sửa cùng ghi chú và kiểm tra chọn giải quyết xung đột.
5. Tắt mạng, sửa checklist, reload, bật mạng lại; kiểm tra bản sửa được gửi.
6. Đổi tài khoản/đăng xuất: không hiển thị kế hoạch của tài khoản trước.

Kiểm thử tự động bao gồm hợp nhất/checklist, CAS retry cùng nhật ký, xung đột,
cache theo tài khoản, mất quyền ghi cache, tọa độ và đánh giá thời gian.
Nghiệm thu Supabase thật và UI/GPS thiết bị vẫn cần thực hiện trên bản HTTPS.
