# AI Assistant — đồng hành du lịch bằng xe máy

Backend hỗ trợ cả OpenAI và OpenRouter. Để thử model miễn phí, xem
[OPENROUTER_SETUP.md](OPENROUTER_SETUP.md). Chọn bằng `AI_PROVIDER`; key chỉ nằm trên server.

Mở kế hoạch → **Kiểm tra chuyến đi của tôi** mở đánh giá ngay trong AI Assistant.
Mục AI Assistant trên thanh điều hướng mở cuộc trò chuyện với kế hoạch hiện hành.
Không cần chọn kế hoạch để chat. Gợi ý lịch trình mới, khám phá điểm đến, chỉnh bản nháp và xác nhận lưu đều nằm trong cùng lịch sử tin nhắn, dùng một ô gửi tin.

## Phạm vi bản đầu

- Chat, gợi ý câu hỏi, trả lời một thông tin còn thiếu mỗi lượt. Nhận các câu đơn giản
  về ngày mai, xuất phát muộn, mệt, mưa, điểm dừng và chuẩn bị xe. Câu không hiểu được
  được báo rõ, không giả một câu trả lời AI.
- Hồ sơ xe ga/số/côn, người đi cùng, kinh nghiệm, giới hạn thời gian và tránh tối
  lưu riêng trong trình duyệt (`ridemate.rider.v1`), chưa đồng bộ tài khoản.
- Thời gian từng ngày lưu trong kế hoạch. Không chia tổng thời gian tuyến cho số
  ngày, không tự suy ra các điểm ngủ đêm. Ngày mai tính theo lịch Việt Nam, không
  đồng nghĩa ngày thứ hai. Không phân tích tự động các giờ viết tự do trong ghi chú.
- Câu trả lời có bốn phần: gợi ý, lý do cá nhân hóa, điểm dừng, thông tin còn thiếu.
- Gợi ý giảm lịch trình có bản xem trước; chỉ nút Áp dụng mới chuyển điểm cuối ngày
  sang Để sau. Có thể đưa lại cuối lịch trình. Thời gian cần tính lại sau thay đổi;
  gợi ý cũ không được áp dụng lên lịch đã đổi. Không tự thay lịch khi chat.
- Ghim chỉ lấy từ OpenStreetMap có tọa độ và nguồn, gần đoạn tuyến đã xác định
  của ngày được hỏi. Chuyến nhiều ngày chưa có đủ tọa độ thì không dùng ghim toàn
  tuyến thay thế. Khoảng cách là đường thẳng, chưa xác minh đường đi vòng/giờ mở cửa.
- Thời tiết, độ phù hợp đường và lượng nhiên liệu không được suy đoán. Tình huống
  mưa là điều người dùng báo, không phải dự báo mới từ trợ lý.
- Nội dung hội thoại là ảnh chụp đánh giá tại thời điểm trả lời và chỉ giữ trong
  phiên màn hình. Đổi kế hoạch tách ngữ cảnh. Kiểm tra lại để dùng dữ liệu mới.

## Backend production và OpenAI

Backend Node phục vụ cả giao diện đã build và API cùng nguồn. Dùng `npm start`
trên Render Web Service. Xem đầy đủ bước cấu hình, biến môi trường, migration
hạn mức, cách kiểm tra và xử lý lỗi tại [RENDER_DEPLOY.md](RENDER_DEPLOY.md).

OpenAI chỉ chuyển ngôn ngữ thành ý định, ngày được chỉ định và câu trả lời cho
thông tin còn thiếu. Đầu vào được lọc và đầu ra được kiểm tra; RideMate tự tính
thời gian, tạo ghim từ nguồn bản đồ và chỉ sửa lịch khi người dùng bấm áp dụng.
Không có khóa hoặc API lỗi: đánh giá cơ bản vẫn hoạt động, có thông báo rõ.

Cả Vite dev và backend production đều yêu cầu đăng nhập Supabase cho API AI.
Hạn mức bền vững trong Supabase: 10 lần/phút và 50 lần/ngày/tài khoản,
500 lần/ngày/toàn ứng dụng. Lỗi xác thực/hạn mức không được gọi OpenAI.
Không cần service_role key. OPENAI_API_KEY chỉ ở server, không dùng tiền tố VITE_.

Chưa gọi API bằng khóa thật trong phiên viết code. Kiểm thử dùng phản hồi giả lập.
Tham chiếu: https://developers.openai.com/api/docs/guides/structured-outputs
# Luồng tạo bản nháp trước kế hoạch

AI Assistant mở một khung chat duy nhất, dùng được khi chưa chọn kế hoạch.
`POST /api/assistant/draft` dùng chung kiểm tra đăng nhập, origin, kích thước và hạn mức
với endpoint cũ. Responses Structured Outputs tạo bản nháp 1–7 ngày; gửi bản nháp
hiện tại khi chỉnh qua hội thoại. Không tự lưu hay đặt dịch vụ. Luồng kiểm tra kế hoạch
cũ trả lời ngay trong cùng khung chat. Không có tab hay màn hình lên lịch riêng.

Mẫu HN–CB 3N2Đ hoạt động khi chưa đăng nhập hoặc AI không sẵn sàng; được ghi rõ là
gợi ý cơ bản. Những yêu cầu khác và chỉnh tự do bằng hội thoại cần AI hoạt động.
Người dùng vẫn sửa trực tiếp nội dung ngày và danh sách điểm trước khi xác nhận.

Giá vé, phòng, nhiên liệu và thời gian tuyến chưa có nguồn cập nhật được hiển thị
chưa xác minh, không coi là miễn phí và không cộng tổng giả. Nguồn Vietnam Tourism
chỉ hỗ trợ tên điểm đến, không phải bảng giá. Điểm trên bản đồ là tìm kiếm theo tên.

Xác nhận ngày, giờ, điểm xuất phát và số người/xe tạo kế hoạch mới với đúng các ngày,
ghi chú và checklist đã duyệt. Hồ sơ xe tùy chọn. Lưu trình duyệt thất bại giữ bản nháp;
lưu thành công vẫn ở trong chat, có nút Mở kế hoạch khi người dùng muốn chuyển sang xem. Chưa đặt phòng, mua vé hoặc xác minh
sức chạy. Bản nháp chưa lưu chỉ tồn tại trong phiên màn hình, không tự đồng bộ.

Đã kiểm tra bằng trình duyệt luồng khách không có kế hoạch → bản nháp → xác nhận →
kế hoạch. API được kiểm thử với provider giả lập; chưa xác minh bằng khóa thật.
