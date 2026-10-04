# Cấu hình Supabase cho RideMate

Supabase cung cấp Auth, workspace kế hoạch/nhật ký, ảnh private, hạn mức AI và đơn chỗ nghỉ demo. API model AI vẫn cần backend Node của RideMate; Supabase không thay thế backend này.

## Project và migration

Tạo project, lấy Project URL và publishable key (hoặc anon key). Ứng dụng không cần mật khẩu database, secret key hoặc service-role key ở frontend.

Chạy các file trong SQL Editor theo thứ tự, chỉ chạy phần chưa được áp dụng:

| Migration | Chức năng |
|---|---|
| [202609190001_cloud_workspace.sql](./supabase/migrations/202609190001_cloud_workspace.sql) | Workspace, RPC có revision, RLS và bucket private `journal-photos` |
| [202609270001_demo_bookings.sql](./supabase/migrations/202609270001_demo_bookings.sql) | Catalog/đơn chỗ nghỉ demo và RPC đặt/hủy |
| [202609300001_ai_quota.sql](./supabase/migrations/202609300001_ai_quota.sql) | Hạn mức API AI theo tài khoản/toàn ứng dụng |

Tự đồng bộ nhiều kế hoạch dùng bảng và RPC workspace hiện có, không cần migration mới. Không chạy lại migration workspace chỉ để bật tính năng đồng bộ. Kiểm tra lỗi SQL và bảng/hàm/bucket sau mỗi bước.

## Biến môi trường

Cần Node.js 22+. Nếu chưa có `.env.local`, tạo từ `.env.example`, rồi điền:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Vite đọc `.env.local`; khởi động lại sau khi đổi cấu hình. Frontend dùng key public; Auth/RLS bảo vệ quyền dữ liệu. Không đặt khóa AI trong biến `VITE_*`.

Backend dùng lại hai biến trên. Nếu cấu hình `SUPABASE_URL` và `SUPABASE_PUBLISHABLE_KEY` riêng, chúng phải cùng project với frontend. Production cần đúng origin; xem [RENDER_DEPLOY](./RENDER_DEPLOY.md).

## Auth email/mật khẩu

Trong Authentication → URL Configuration, đặt Site URL và Redirect URLs theo địa chỉ thực tế, gồm localhost với đúng port nếu dùng dev. Bật email/password và xác nhận email; cấu hình SMTP trước khi phục vụ người dùng thật.

Kiểm tra đăng ký → email xác nhận → đăng nhập → quên mật khẩu → email khôi phục → đặt mật khẩu mới. App có tên hiển thị trong metadata `full_name`, cho phép đổi trong Tài khoản. Không có nút đăng nhập Google.

## Kế hoạch và checklist

Đăng nhập tự mở dữ liệu kế hoạch của tài khoản, không tự chọn kế hoạch đang xem. Tạo/sửa lịch trình, tọa độ, checklist và ghi chú ghi cache riêng trước rồi gửi cloud. App đọc thay đổi khi tab hiện mỗi 15 giây và khi quay lại tab/cửa sổ hoặc mạng phục hồi.

Mất mạng giữ bản sửa đã ghi cache; chỉ trạng thái đã đồng bộ mới xác nhận cloud đã lưu. Sửa các mục khác nhau được hợp nhất; nội dung trùng nhau yêu cầu chọn bản giữ lại. Cache tách theo user ID; đăng xuất quay về kế hoạch khách.

Dữ liệu khách không tự nhập. Trên máy chứa kế hoạch cũ: **Tài khoản → Nhập kế hoạch khách từ trình duyệt**. ID đã có trong tài khoản không bị nhập đè. Luồng hiện tại không còn dùng nút lưu/tải toàn snapshot để chuyển kế hoạch giữa thiết bị.

Chi tiết và ca nghiệm thu: [PLANNING_SYNC](./PLANNING_SYNC.md).

## Nhật ký và ảnh

- Đăng nhập: Nhật ký tự đọc tài khoản; tạo/sửa/xóa lưu trực tiếp cloud. Chỉ báo lưu thành công sau khi commit.
- Kiểm tra bản mới mỗi 30 giây khi đang xem và khi quay lại tab/kết nối mạng; không cập nhật đè form đang sửa.
- Khách: nhật ký/ảnh lưu IndexedDB. Bấm **Nhập nhật ký cũ từ trình duyệt** để nhập có xác nhận; không tự nhập khi đăng nhập.
- Hai bài khác nhau được hợp nhất. Hai thiết bị sửa cùng bài báo xung đột và giữ form; sao chép nội dung cần giữ trước khi tải lại.
- Bucket ảnh private; ảnh không đổi được tái dùng trong phiên. Metadata workspace tối đa 5 MB, tối đa 8 ảnh mỗi bài và 10 MB/ảnh đầu vào.

Nhật ký chưa có hàng đợi offline hoặc tự lưu bản nháp khi đóng trang. Chưa dọn ảnh không còn tham chiếu hoặc upload dang dở. Đây là giới hạn riêng của nhật ký, khác cache bản sửa kế hoạch.

## Chỗ nghỉ demo

Migration demo bookings tạo catalog chỉ đọc, bảng đơn có RLS và RPC đặt/hủy. RPC tính lại giá, ngày, sức chứa, số phòng mẫu và chống tạo trùng yêu cầu. Nếu thiếu migration, đơn tài khoản báo lỗi, không tự chuyển sang lưu local.

Kiểm tra đặt/hủy, số phòng mẫu, đơn trên hai thiết bị và tách biệt hai tài khoản. Đơn có liên kết hành trình chỉ hiện ghim khi khớp; đổi ngày hoặc hủy đơn phải cập nhật trạng thái ghim. Tên, giá, vị trí và phòng trống đều là dữ liệu minh họa; không có thanh toán hoặc phòng thật.

## Nghiệm thu và deploy

Chạy `npm test` và `npm run build`. Kiểm thử SQL dùng PostgreSQL nhúng PGlite với Auth/Storage giả lập; chưa thay thế kiểm tra trên project thật.

Trên hai tài khoản và hai thiết bị, kiểm tra: Auth/email, RLS, ảnh private, đồng bộ checklist, xung đột ghi chú, mất mạng/reload, nhập dữ liệu khách, nhật ký và đơn demo. Cập nhật mọi thiết bị sang bản app mới để tránh thao tác snapshot từ bản cũ.

Deploy bằng Render Web Service, gồm frontend `dist` và backend Node. Đổi biến `VITE_*` cần rebuild. Xem [RENDER_DEPLOY](./RENDER_DEPLOY.md).
