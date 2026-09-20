# Cấu hình backend RideMate

## 1. Tạo project

1. Tạo project trong Supabase Dashboard bằng tài khoản của bạn. Lưu mật khẩu database ở nơi riêng; ứng dụng không cần mật khẩu này.
2. Trong SQL Editor, chạy toàn bộ file [migration](./supabase/migrations/202609190001_cloud_workspace.sql) **một lần** trên project mới. Script chạy trong transaction; nếu lỗi thì kiểm tra thông báo trước khi chạy lại.
3. Kiểm tra có bảng `public.user_workspaces` và bucket **private** `journal-photos`.
4. Trong phần Connect/API của project, lấy Project URL và **publishable key** (hoặc anon key cũ). Không dùng secret key hay service_role key.

## 2. Chạy local

Cần Node.js **22+**. Tại thư mục repo:

```powershell
Copy-Item .env.example .env.local
npm ci
```

Điền hai giá trị của project trong `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

`.env.local` đã bị gitignore. Hai giá trị này là cấu hình public của frontend, quyền dữ liệu được bảo vệ bằng Auth/RLS. Không đặt khóa server bí mật trong bất kỳ biến `VITE_*` nào.

```powershell
npm test
npm run build
npm run dev
```

Khởi động lại Vite sau khi sửa biến môi trường. Mở **Tài khoản** ở thanh trên cùng. Chưa có biến môi trường thì app hiển thị trạng thái chưa cấu hình và vẫn dùng local được.

## 3. Email và mật khẩu

Trong Authentication → URL Configuration:

- Đặt Site URL là URL ứng dụng thực tế.
- Thêm redirect URL đúng origin/port sử dụng, ví dụ `http://localhost:5173/` và `https://ridemate-pka.onrender.com/`. Nếu Vite đổi port, thêm URL tương ứng.
- Bật email/password, bật xác nhận email, đặt độ dài mật khẩu tối thiểu ít nhất 8 ký tự. Cấu hình SMTP trước khi phục vụ người dùng thật; kiểm tra giới hạn gửi email trong project.
- Kiểm tra đăng ký → xác nhận email → đăng nhập → quên mật khẩu → mở email → đặt mật khẩu mới.

Ứng dụng chỉ cung cấp đăng nhập/đăng ký bằng email và mật khẩu, không có nút Google. Khi đăng ký, người dùng nhập tên hiển thị; tên lưu trong Auth user metadata (`full_name`). Tài khoản cũ có thể cập nhật tên trong trang Tài khoản; khi chưa có tên, giao diện dùng phần email trước dấu @. Không cần migration SQL mới cho thay đổi tên.

Tham khảo tài liệu chính thức: [email signup](https://supabase.com/docs/reference/javascript/auth-signup), [password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

## 4. Nhật ký đồng bộ giữa các thiết bị

1. Đăng nhập rồi mở **Nhật ký hành trình**. Trang tự tải nhật ký và ảnh thuộc tài khoản, không cần bấm tải thủ công.
2. Tạo/sửa bài và bấm **Lưu nhật ký**: chỉ báo thành công sau khi đã lưu cloud. Xóa bài cũng áp dụng cho tài khoản trên mọi thiết bị.
3. Trên thiết bị khác, đăng nhập cùng tài khoản rồi mở nhật ký. Khi đang xem, trang kiểm tra bản mới mỗi 30 giây và khi quay lại tab/kết nối mạng. Không cập nhật đè form đang sửa.
4. Nhật ký tạo từ bản app cũ chỉ lưu local: bấm **Nhập nhật ký cũ từ trình duyệt** trên máy có dữ liệu. Nhập có xác nhận, bỏ qua ID đã có trên tài khoản, giữ nguyên local. Thử lại an toàn nếu mất mạng giữa chừng.
5. Nếu hai thiết bị sửa cùng bài, lần lưu sau báo xung đột và giữ form. Sao chép nội dung cần giữ rồi hủy form/tải lại trước khi sửa tiếp. Hai bài khác nhau được gộp vào workspace mới nhất.

Chưa đăng nhập vẫn lưu nhật ký local. Đăng nhập không tự nhập dữ liệu local vào tài khoản. Đăng xuất quay về nhật ký local; bản cloud không được tự sao chép vào IndexedDB.

## 5. Chuyến đi, sao lưu và giới hạn

- Chuyến đang lập, lịch trình/checklist vẫn lưu local. Trong **Tài khoản**, kiểm tra bản cloud rồi **Lưu chuyến đang lập**. Thao tác giữ nguyên nhật ký trên cloud và từ chối nếu revision đã đổi.
- **Tải về trình duyệt** tải snapshot đã kiểm tra và ghi local có xác nhận, giữ một bản dự phòng. **Khôi phục bản trước khi tải** chỉ tác động local. Khi đăng nhập, trang Nhật ký tiếp tục đọc cloud, không đọc bản local vừa khôi phục.
- Dùng bảng workspace JSONB/RPC/bucket private cũ. **Không cần chạy lại migration** nếu đã chạy thành công. Mỗi lần sửa journal chỉ thay bài liên quan, giữ các bài khác và chuyến đã lưu; revision bảo vệ transaction metadata.
- Ảnh đã tải trong phiên được tái dùng theo path khi không đổi; chỉ upload ảnh mới/thay đổi. Chưa dọn ảnh mồ côi khi xóa/sửa hoặc upload thất bại. Metadata tối đa 5 MB, ảnh tối đa 10 MB/ảnh.
- Không có hàng đợi lưu offline: lỗi mạng giữ form để thử lại, không thông báo lưu thành công giả. Bản nháp chưa tự lưu khi đóng trang. Chưa quản lý nhiều chuyến đang lập.
- Nên reload/cập nhật mọi thiết bị sau deploy: bản app cũ vẫn có thao tác ghi đè toàn snapshot. Revision bảo vệ các request cạnh tranh nhưng không thể ngăn người dùng chủ động ghi một snapshot cũ từ phiên bản app cũ.
- localStorage và IndexedDB không có transaction chung khi crash; tránh tải/khôi phục local trong nhiều tab đồng thời.
- Form điểm đi/đến dùng select với 34 tỉnh/thành hiện hành; Hà Giang/Mộc Châu/Cát Bà là nhóm điểm du lịch riêng. Các địa điểm cũ được giữ nguyên trong option riêng.

Nguồn danh sách: [34 đơn vị hành chính cấp tỉnh](https://xaydungchinhsach.chinhphu.vn/chi-tiet-34-don-vi-hanh-chinh-cap-tinh-tu-12-6-2025-119250612141845533.htm).

## 6. Render

Giữ service hiện tại; chưa thay đổi deploy trong lượt triển khai này. Thêm hai biến `VITE_SUPABASE_*` vào môi trường build và dùng Node 22+. Frontend vẫn xuất thư mục `dist`, không cần chạy server Node riêng vì backend do Supabase cung cấp. Build bằng `npm ci && npm run build`. Sau khi đổi biến, cần build/deploy lại.

## 7. Kiểm tra đã chạy và còn cần chạy

Cập nhật kiểm tra ngày 20/09/2026:

- `npm test`: **31/31 đạt**. Có kiểm thử migration thực trên PostgreSQL nhúng PGlite với các schema Auth/Storage giả lập: anonymous bị từ chối, hai user tách biệt, direct mutation bị chặn, revision conflict, đường dẫn ảnh đúng owner. Đây chưa phải chạy trên dịch vụ Supabase thật.
- Kiểm thử client: upload lỗi không commit metadata, đổi tài khoản hủy thao tác, bản local không bị sửa khi upload, thiếu ảnh chặn tải, backup/restore IndexedDB và lỗi localStorage.
- `npm run build`: thành công.
- Chưa kiểm tra UI tương tác: công cụ trình duyệt trong phiên không có browser khả dụng.
- Chưa tạo project, chạy migration trên Supabase thật, gửi email, thử OAuth, kiểm tra upload/download thật hoặc deploy Render.

Sau khi cấu hình project, kiểm tra với **hai tài khoản riêng** và hai trình duyệt: email/recovery và đồng bộ nhật ký; tải ảnh và nhật ký; không thấy dữ liệu của user khác; xung đột hai thiết bị; mất mạng lúc upload; dữ liệu local còn nguyên nếu thất bại; tải về rồi khôi phục backup; mobile 320/390 px. Không coi unit test là thay thế kiểm tra tích hợp này.
