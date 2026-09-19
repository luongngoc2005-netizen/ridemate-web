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

## 3. Email và Google

Trong Authentication → URL Configuration:

- Đặt Site URL là URL ứng dụng thực tế.
- Thêm redirect URL đúng origin/port sử dụng, ví dụ `http://localhost:5173/` và `https://ridemate-pka.onrender.com/`. Nếu Vite đổi port, thêm URL tương ứng.
- Bật email/password, bật xác nhận email, đặt độ dài mật khẩu tối thiểu ít nhất 8 ký tự. Cấu hình SMTP trước khi phục vụ người dùng thật; kiểm tra giới hạn gửi email trong project.
- Kiểm tra đăng ký → xác nhận email → đăng nhập → quên mật khẩu → mở email → đặt mật khẩu mới.

Google cần cấu hình thêm bên ngoài code:

1. Tạo OAuth client loại Web application trong Google Cloud và cấu hình consent screen.
2. Dùng callback URL do trang Google provider của Supabase hiển thị làm Authorized redirect URI trong Google Cloud.
3. Điền Google Client ID/Secret trong Supabase Authentication → Providers → Google và bật provider. Không đặt Google Client Secret trong frontend.
4. Khi Google app còn ở chế độ thử nghiệm, thêm tài khoản thử vào danh sách test users nếu cấu hình consent yêu cầu.

Tham khảo tài liệu chính thức: [Google login](https://supabase.com/docs/guides/auth/social-login/auth-google), [email signup](https://supabase.com/docs/reference/javascript/auth-signup), [password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

## 4. Cách lưu và chuyển thiết bị

1. Tạo chuyến/nhật ký như trước. Dữ liệu vẫn được lưu trong trình duyệt.
2. Đăng nhập, mở **Tài khoản → Kiểm tra bản trên tài khoản**.
3. Chọn **Lưu lên tài khoản** và kiểm tra email/số bài trong xác nhận. Lần đầu là chuyển dữ liệu local lên server. Những lần sau thay thế toàn bộ bản cloud bằng bản của trình duyệt hiện tại.
4. Trên thiết bị khác, đăng nhập cùng tài khoản, kiểm tra bản cloud, chọn **Tải về trình duyệt**.
5. Ứng dụng tải đủ ảnh trước khi thay dữ liệu local. Bản local trước đó được giữ trong IndexedDB để dùng nút **Khôi phục bản trước khi tải**. Chỉ giữ một bản dự phòng; mỗi lần tải/khôi phục đổi bản dự phòng.
6. Sau mỗi đợt chỉnh sửa, chủ động lưu lên tài khoản. Xóa nhật ký local rồi lưu sẽ loại bài khỏi bản cloud tiếp theo.

Không tự tải/gửi dữ liệu khi đăng nhập hay đổi tài khoản. Đăng xuất giữ nguyên dữ liệu trình duyệt, vì vậy đây chưa phải chế độ dành cho máy dùng chung. Đóng các tab RideMate khác khi tải/khôi phục dữ liệu.

## 5. Thiết kế và giới hạn

- Bản backend đầu dùng một **workspace snapshot JSONB**/người dùng: `{version: 1, trip, entries}`. Giữ tương thích một chuyến đang lập và nhiều nhật ký hiện tại; chưa phải schema quan hệ trips/days/places riêng biệt và chưa thêm giao diện quản lý nhiều chuyến đang lập.
- Metadata nằm trong `public.user_workspaces`, có `revision` và `updated_at`. Người dùng chỉ có quyền SELECT hàng của mình qua RLS. Chỉ RPC `save_workspace` được ghi; RPC tự lấy `auth.uid()`, đối chiếu tài khoản và revision, rồi commit metadata trong một transaction.
- Nếu thiết bị khác đã lưu kể từ lần kiểm tra, RPC trả lỗi xung đột. Không có tự động retry ghi đè hoặc tự gộp. Kiểm tra/tải bản mới trước, hoặc chủ động xác nhận lưu thay thế.
- Ảnh được tải vào bucket private theo đường dẫn `<user-id>/<uuid>.<ext>`, giới hạn 10 MB/ảnh. Upload không ghi đè; chỉ cho phép SELECT/INSERT trong thư mục của chính người dùng. Khi tải lại, dùng SDK download có xác thực rồi chuyển về data URL cho giao diện cũ.
- Mỗi lần lưu hiện upload lại ảnh. Ảnh của bản cũ hoặc lượt lưu lỗi được giữ lại để tránh xóa ảnh của bản đã commit khi phản hồi mạng bị mất. **Chưa có tác vụ dọn ảnh mồ côi/deduplicate**; dung lượng tăng theo số lần lưu. Chưa phù hợp đồng bộ thường xuyên dữ liệu lớn.
- Metadata tối đa 5 MB/bản. Lưu ảnh và metadata không có transaction chung: metadata chỉ commit sau khi tất cả upload thành công. Lỗi giữa chừng giữ nguyên bản metadata cũ.
- Tải local dùng transaction IndexedDB cho nhật ký + backup, rollback localStorage nếu transaction lỗi. Hai kho không có transaction chung khi trình duyệt crash/đóng đột ngột; chưa hỗ trợ chỉnh local đồng thời nhiều tab.
- Chưa tự đồng bộ, giải quyết xung đột từng trường, offline queue, xóa tài khoản hay di chuyển dữ liệu giữa các tài khoản. AI và thuê xe vẫn hoãn.

Tham khảo: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## 6. Render

Giữ service hiện tại; chưa thay đổi deploy trong lượt triển khai này. Thêm hai biến `VITE_SUPABASE_*` vào môi trường build và dùng Node 22+. Frontend vẫn xuất thư mục `dist`, không cần chạy server Node riêng vì backend do Supabase cung cấp. Build bằng `npm ci && npm run build`. Sau khi đổi biến, cần build/deploy lại.

## 7. Kiểm tra đã chạy và còn cần chạy

Ngày 19/09/2026:

- `npm test`: **23/23 đạt**. Có kiểm thử migration thực trên PostgreSQL nhúng PGlite với các schema Auth/Storage giả lập: anonymous bị từ chối, hai user tách biệt, direct mutation bị chặn, revision conflict, đường dẫn ảnh đúng owner. Đây chưa phải chạy trên dịch vụ Supabase thật.
- Kiểm thử client: upload lỗi không commit metadata, đổi tài khoản hủy thao tác, bản local không bị sửa khi upload, thiếu ảnh chặn tải, backup/restore IndexedDB và lỗi localStorage.
- `npm run build`: thành công.
- Chưa kiểm tra UI tương tác: công cụ trình duyệt trong phiên không có browser khả dụng.
- Chưa tạo project, chạy migration trên Supabase thật, gửi email, thử OAuth, kiểm tra upload/download thật hoặc deploy Render.

Sau khi cấu hình project, kiểm tra với **hai tài khoản riêng** và hai trình duyệt: email/Google/recovery; tải ảnh và nhật ký; không thấy dữ liệu của user khác; xung đột hai thiết bị; mất mạng lúc upload; dữ liệu local còn nguyên nếu thất bại; tải về rồi khôi phục backup; mobile 320/390 px. Không coi unit test là thay thế kiểm tra tích hợp này.
