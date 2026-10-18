# AI Assistant — trợ lý du lịch bằng xe máy

## Điểm tham quan theo điểm đến

Khi không yêu cầu điểm cụ thể, backend chỉ dùng danh sách địa danh nổi bật của B
có nguồn từ Vietnam Tourism hoặc cơ quan địa phương. Không gọi Overpass để lấy
POI bất kỳ cho trường hợp này. Danh sách hiện phủ đủ 63 tỉnh/thành theo tên cũ,
kèm Đà Lạt, Mộc Châu, Cát Bà: 66 khu vực, 177 tên điểm tham quan khác nhau.
Nhận cả tên cũ, tên hiện hành và ánh xạ sang 34 tỉnh/thành; giữ phạm vi du lịch cũ,
không thay tọa độ điểm đến bằng trung tâm tỉnh sau sáp nhập. Danh sách và nguồn:
[DESTINATION_DATA.md](./DESTINATION_DATA.md). Không cần migration Supabase.
Đã nhận diện tỉnh/thành nhưng thiếu danh sách thì báo
`AI_DESTINATION_NOT_SUPPORTED` (422), không yêu cầu người dùng nhập lại tên rõ hơn.
Điểm đến chưa nhận diện và chưa có dữ liệu thì báo `AI_DESTINATION_DATA_UNAVAILABLE`;
không mượn địa điểm tỉnh khác. Nguồn tham khảo hiện ngay trên lịch đề xuất.

Điểm được yêu cầu cụ thể được ưu tiên và kiểm tra bắt buộc có trong lịch; yêu cầu
bỏ điểm sẽ loại điểm đó. Nếu điểm chưa có trong danh sách, tra OpenStreetMap trong
ranh giới B, cache 15 phút và giới hạn chờ 8,5 giây. Chưa xác minh được điểm yêu cầu
thì báo `AI_REQUESTED_PLACE_UNAVAILABLE`, không tự thay bằng điểm khác.

Model chỉ sắp xếp các điểm đã tìm được. Điểm ngoài danh sách hoặc chặng sang tỉnh
không được yêu cầu bị chặn bằng `AI_DESTINATION_MISMATCH`. Dữ liệu này không xác nhận
thời gian chạy hay tính khả thi: vẫn cần tính tuyến riêng. Tọa độ OSM được giữ cùng
điểm và đưa ra cho người dùng đối chiếu, không tìm lại tên trên toàn quốc nếu đã có.
Nguồn Lạng Sơn: https://tamthanh.langson.gov.vn/gioi-thieu/di-tich-danh-thang.
Nguồn Hải Phòng: https://hatay.haiphong.gov.vn/di-san-van-hoa-78115/kham-pha-canh-dep-hai-phong-nam-2026-964803.
Danh sách Hải Phòng có các điểm nội đô, Đồ Sơn và các điểm Cát Bà. Chỉ chọn
một nhóm vừa sức; nguồn địa danh không xác nhận khả năng ghép hết vào 3 ngày.
Cát Bà là khu vực con của Hải Phòng nên không bị chặn nhầm là đi sang tỉnh khác;
nếu người dùng chọn riêng Cát Bà thì ưu tiên danh sách riêng của Cát Bà.

Backend hỗ trợ `AI_PROVIDER=vllm|openrouter|openai`. Xem [vLLM](./VLLM_SETUP.md), [OpenRouter](./OPENROUTER_SETUP.md) và [deploy](./RENDER_DEPLOY.md). Khóa chỉ nằm ở server. API AI yêu cầu đăng nhập Supabase và migration hạn mức; không cần service-role key.

## Hội thoại và bản nháp

AI Assistant dùng một ô chat, có thể mở khi chưa chọn kế hoạch. “Kiểm tra chuyến đi của tôi” mở đánh giá kế hoạch đang chọn. Lời chào/cảm ơn không tự tạo lịch trình; yêu cầu chưa rõ không tự sửa kế hoạch.

Ví dụ: “Lập lịch trình 3 ngày 2 đêm ở Cao Bằng”. Trợ lý hỏi từng thông tin còn thiếu: vị trí, điểm đến, ngày/đêm, ngày/giờ đi, người/xe, loại xe, kinh nghiệm, giới hạn giờ chạy, tránh tối và sở thích. Không mặc định Hà Nội khi thiếu điểm đi. GPS mới cần thao tác cho phép; vị trí sống đã bật và còn mới có thể được dùng cho điểm xuất phát.

Mặc định có chặng về ngày cuối; yêu cầu một chiều bỏ chặng về. Giữ số đêm đã yêu cầu. Bản nháp AI giới hạn 1–7 ngày; form kế hoạch thủ công hỗ trợ tới 30 ngày. Tọa độ GPS giữ ở frontend, chỉ tên khu vực được gửi cho model. Đổi tên điểm đi trong form xác nhận bỏ tọa độ xuất phát cũ.

Giờ đi có bộ chọn đồng hồ, giờ/phút và AM/PM trong bước hỏi thông tin, form xác nhận và điều chỉnh giờ đánh giá. AM là trước 12 giờ trưa, PM là từ 12 giờ trưa; 12:00 AM lưu thành 00:00, 12:00 PM lưu thành 12:00. Chỉ bấm Chọn giờ mới áp dụng lựa chọn; Hủy hoặc Escape giữ giờ cũ. Dữ liệu kế hoạch/API vẫn dùng HH:mm (24 tiếng). Tiêu đề ngày được bỏ số thứ tự do model thêm trước khi hiển thị/lưu, tránh lặp “Ngày 3: Ngày 3: …”.

Model tạo lịch đề xuất theo schema từ các điểm du lịch của B; người dùng sửa nội dung/ngày/điểm trước khi xác nhận. Khi AI không hoạt động, giữ thông tin đã nhập và báo lỗi; không dùng lịch mẫu Hà Nội–Cao Bằng thay thế.

## Tọa độ và quỹ thời gian

Bản nháp có phần tra cứu điểm tham quan và kiểm tra từng ngày. Xem [PLANNING_SYNC](./PLANNING_SYNC.md) để biết cách chọn ghim, đối chiếu Google Maps, nhập tọa độ và chọn nơi nghỉ.

Tọa độ không do model tự sinh. Kết quả không duy nhất hoặc thiếu khu vực cần người dùng chọn. Phần kiểm tra từng ngày báo thiếu tọa độ/lỗi tuyến thay vì công bố thời gian đầy đủ. Thời gian ăn, tham quan, nơi nghỉ và mốc kết thúc chưa có dữ liệu được ghi là giả định; người dùng chỉnh trước khi kết luận lịch phù hợp.

Giá vé, phòng, nhiên liệu và giờ mở cửa chưa xác minh không được cộng thành tổng chi phí. Catalog Vietnam Tourism hỗ trợ tên điểm đến, không phải bảng giá. Chỗ nghỉ của web hiện là demo.

## Xác nhận và lưu

Form xác nhận điền sẵn câu trả lời về ngày, giờ, điểm đi/đến và người/xe. Chỉ sau xác nhận mới tạo kế hoạch chứa lịch trình, checklist, tọa độ và thông tin lập kế hoạch đã duyệt. Lưu cache thất bại giữ bản nháp; lưu thành công có nút Mở kế hoạch ngay trong chat.

Kế hoạch đã lưu tự đồng bộ khi đăng nhập. Hội thoại và bản nháp chưa xác nhận chỉ giữ trong phiên màn hình, không tự đồng bộ. Không tự đặt phòng, mua vé hoặc đổi lịch để xử lý cảnh báo quá tải.

## Đánh giá kế hoạch trong chat

- Dùng hồ sơ xe ga/số/côn, kinh nghiệm, người đi cùng, giới hạn giờ chạy và tránh tối.
- Hồ sơ chung lưu trên trình duyệt; hồ sơ xác nhận trong kế hoạch đi cùng dữ liệu kế hoạch.
- Chat hỏi thông tin thời gian còn thiếu, không chia tổng tuyến cho số ngày hoặc phân tích giờ viết tự do trong ghi chú.
- Gợi ý giảm lịch có bản xem trước; chỉ bấm Áp dụng mới chuyển điểm sang Để sau. Có thể đưa lại lịch; dữ liệu đã đổi làm gợi ý cũ hết hiệu lực.
- Ghim gợi ý từ OSM, có nguồn và tọa độ gần đoạn tuyến đã xác định; không lấy ghim toàn tuyến thay cho chặng ngày chưa rõ.
- Mưa/mệt là tình huống người dùng báo, không phải dữ liệu thời tiết mới do model xác minh.

Phần kiểm tra từng ngày trong bản nháp/chi tiết kế hoạch tính tuyến riêng, có nơi nghỉ và chặng về. Luồng đánh giá cơ bản trong chat hiện chỉ tự lấy thời gian tổng tuyến khi kế hoạch một ngày và đủ tọa độ; chuyến nhiều ngày vẫn hỏi thời gian ngày được đánh giá.

## API và lỗi

- `GET /api/assistant/status`: đủ cấu hình hay chưa, có yêu cầu đăng nhập. Không kiểm tra model đang bật.
- `POST /api/assistant`: nhận diện ý định/ngày/thông tin trả lời.
- `POST /api/assistant/draft`: tạo hoặc chỉnh bản nháp, dùng chung Auth, origin và quota.

OpenAI dùng Responses Structured Outputs; OpenRouter/vLLM dùng Chat Completions với JSON Schema. Đầu vào/đầu ra được kiểm tra, không chuyển provider hoặc tự thử lại khi lỗi. Timeout OpenAI 30 giây; OpenRouter/vLLM 90 giây. Model offline, sai schema, output thiếu hoặc hết quota được báo rõ; bản nháp đang có được giữ.

Chi tiết hạn mức và cấu hình production: [RENDER_DEPLOY](./RENDER_DEPLOY.md). Kiểm thử provider giả lập và smoke test trực tiếp tới model không thay thế nghiệm thu đầy đủ Auth/quota trên bản deploy.
