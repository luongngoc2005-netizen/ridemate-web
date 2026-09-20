# RideMate — bàn giao code và việc còn thiếu

## 20/09/2026 — Điểm đầu/cuối và ghim hỗ trợ trên Tổng quan

- Google Maps nhận tọa độ điểm đầu/cuối đã dùng để vẽ bản đồ, không tự tìm lại theo tên. Geocoder ưu tiên đúng đơn vị hành chính và bỏ kết quả cửa hàng/đường trùng tên; đổi phiên bản cache để tránh dùng lại tọa độ sai.
- Chọn tỉnh/thành vẫn là điểm đại diện, không phải địa chỉ cụ thể hay GPS của người dùng. Google Maps có thể chọn đường khác; chưa đồng bộ hình dạng tuyến hoặc điểm dừng lịch trình.
- Tìm điểm hỗ trợ theo hành lang liên tục dọc tuyến, chia đoạn giới hạn kích thước, tối đa hai truy vấn đồng thời; lọc trong khoảng 1,5 km theo đường thẳng. Chọn tối đa 30 ghim mỗi loại phân bố dọc tuyến. Các nút cây xăng/quán ăn/điểm nghỉ bật tắt ghim, tự thu bản đồ về toàn tuyến.
- Bấm ghim xem tên, địa chỉ nếu có và “Chỉ đường đến đây”. Liên kết dùng tọa độ ghim, để Google Maps chọn vị trí xuất phát. Bấm dòng danh sách vẫn mở ghim tương ứng.
- Kiểm thử 35/35 đạt, production build thành công. Kiểm tra dịch vụ thật xác nhận geocode Hà Nội–Hải Phòng và tuyến 119,828 km. Overpass trả 406 với User-Agent mặc định của Node; khi dùng User-Agent ứng dụng trả 504 quá tải. Chưa xác minh tải ghim thật hoặc tương tác trình duyệt; UI cho phép thử lại khi dịch vụ lỗi. Không thay nhà cung cấp hoặc thêm Google API trả phí.

## 20/09/2026 — Nhật ký theo tài khoản và chọn tỉnh/thành

- Đăng nhập: Nhật ký đọc trực tiếp workspace Supabase, tạo/sửa/xóa tự ghi cloud khi lưu. Mở lại trang, quay lại tab hoặc mỗi 30 giây khi đang xem sẽ cập nhật; tạm dừng polling khi chỉnh form để giữ bản nháp. Đổi tài khoản remount danh sách, không lấy IndexedDB làm fallback khi cloud lỗi.
- Khách chưa đăng nhập vẫn dùng IndexedDB. Nút “Nhập nhật ký cũ từ trình duyệt” nhập có xác nhận, bỏ qua ID đã tồn tại và không xóa local. Không tự nhập dữ liệu của máy dùng chung.
- `journal-sync.js` merge một bài vào workspace mới nhất, retry tối đa 3 lần khi revision đụng nhau; cùng bài bị sửa/xóa thì báo lỗi giữ nội dung form. `cloud-journal.js` chỉ upload ảnh mới/thay đổi, tái dùng đường dẫn ảnh trong phiên.
- Trang Tài khoản: lưu chuyến đang lập giữ nguyên nhật ký cloud. Chuyến đang lập vẫn chuyển thiết bị thủ công; chưa tự đồng bộ lịch trình/checklist. Bản app cũ có thể còn ghi toàn snapshot, nên cập nhật/reload tất cả thiết bị trước khi dùng luồng mới.
- `ProvinceSelect.jsx`, `provinces.js`: 34 tỉnh/thành hiện hành + nhóm riêng Hà Giang/Mộc Châu/Cát Bà. Áp dụng điểm đi/đến trên Home, TripForm và nhật ký. Giữ nguyên địa điểm cũ ngoài danh sách bằng option riêng; địa điểm tham quan chi tiết vẫn nhập tự do.
- Không cần migration mới; dùng RPC và bucket hiện có. Chưa có hàng đợi offline hay dọn ảnh mồ côi. Mất mạng khi lưu báo lỗi và giữ form.
- Kiểm thử 31/31 đạt, build thành công; có test hai thiết bị, xung đột cùng bài, xóa, retry an toàn, upload lỗi và danh sách tỉnh. Chưa kiểm tra hai tài khoản/thiết bị trên Supabase thật hoặc UI trình duyệt.
- Các phần bên dưới ghi lại các giai đoạn cũ; mô tả nhật ký lưu cloud thủ công không còn áp dụng cho người đã đăng nhập.

## Đồng bộ icon toàn giao diện

- Thay emoji và ký hiệu trang trí bằng SVG nét: logo, liên kết/nút điều hướng, lịch trình, nhật ký/thành tựu, thời tiết, điểm hỗ trợ và ghim bản đồ, nút gửi AI. Giữ nhãn chữ và chức năng AI Assistant theo xác nhận của người dùng.
- Dùng chung `ToolIcon.jsx`; Leaflet tạo SVG DOM từ cùng bộ hình. Tên chuyến và các chuỗi dữ liệu người dùng được giữ nguyên.
- Kiểm tra: bộ 23 test hiện có đạt và production build thành công. Chưa kiểm tra giao diện trực tiếp trên trình duyệt.

## Điều chỉnh tài khoản và icon

- Chỉ cung cấp đăng nhập/đăng ký email + mật khẩu; đã bỏ nút Google. Giữ quên mật khẩu và các chức năng dữ liệu.
- Đăng ký có tên hiển thị, lưu trong Auth metadata `full_name`. Thanh trên cùng và trang Tài khoản hiển thị tên; tài khoản cũ có thể sửa tên. Khi thiếu tên, dùng phần email trước @. Không cần migration SQL mới.
- Công cụ nhanh và trang Công cụ dùng SVG nét đơn giản thay emoji, giữ AI Assistant theo xác nhận của người dùng.
- Kiểm tra sau thay đổi: 23/23 test hiện có đạt, production build thành công, `git diff --check` đạt. Chưa kiểm tra đăng ký/cập nhật tên trên Supabase thật hoặc giao diện trên trình duyệt.
- Các ghi chú Google bên dưới là lịch sử triển khai trước thay đổi này.

## Cập nhật backend ngày 19/09/2026

Bản tích hợp backend dựa trên commit `5a1f85d`; trạng thái deploy Render cần kiểm tra riêng. Người dùng đã chọn **Supabase**; kết nối project thật chưa được xác minh. Hướng dẫn hiện hành: [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).

- Thêm Supabase SDK; Node yêu cầu **22+**; dùng npm và đã tạo `package-lock.json`, có thể dùng `npm ci`.
- Thêm trang Tài khoản: email/password, đăng ký, Google OAuth, quên/đổi mật khẩu, đăng xuất. Chưa cấu hình project thì local demo vẫn chạy.
- Thêm migration SQL cho `user_workspaces` (snapshot JSONB, RLS), RPC save có revision chống ghi đè và bucket ảnh private. Đây là backend snapshot đầu tiên, chưa có các bảng trips/days/places riêng.
- Lưu/tải thủ công toàn bộ một chuyến đang lập + nhật ký/ảnh. Không tự chuyển dữ liệu khi đăng nhập, không tự gộp. Upload không xóa local. Tải về có xác nhận và một bản backup khôi phục.
- IndexedDB `ridemate-journal` lên version **2**, giữ `entries`, thêm store `backups` khóa `before-cloud-load`. Upgrade giữ nguyên bài cũ.
- File mới chính: `src/Account.jsx`, `src/supabase.js`, `src/cloud-data.js`, `src/workspace-data.js`, `src/account.css`, `.env.example`, `supabase/migrations/202609190001_cloud_workspace.sql` và 3 file test backend/cloud/workspace.
- Kiểm thử **23/23 đạt**, production build thành công trên máy này. SQL được kiểm tra qua PGlite với schema Supabase giả lập. Không có browser khả dụng để kiểm tra UI trong phiên. Chưa thử Supabase thật, email/OAuth thật hoặc Render.
- Giới hạn: upload lại ảnh mỗi lần lưu, chưa dọn ảnh mồ côi; chưa autosync, nhiều chuyến đang lập, tách local theo tài khoản, xử lý local nhiều tab. Đăng xuất giữ local. localStorage và IndexedDB không có transaction chung khi crash.
- Việc tiếp theo: người dùng tạo project và cấu hình theo hướng dẫn; chạy migration; điền `.env.local`; nghiệm thu tích hợp hai tài khoản/hai thiết bị. AI thật và thuê xe vẫn hoãn.

## Bản bàn giao frontend trước khi thêm backend

Các mục bên dưới mô tả trạng thái **17/09/2026**. Các thông tin về backend, phiên bản IndexedDB, lockfile, Node và kiểm thử đã được cập nhật ở mục trên.

Cập nhật: **17/09/2026**. Trạng thái chức năng được đối chiếu tại commit `59bb1e0` trên nhánh `main`; commit chứa tài liệu này chỉ bổ sung tài liệu.

- Repo: https://github.com/luongngoc2005-netizen/ridemate-web
- Địa chỉ web đã sử dụng: https://ridemate-pka.onrender.com/
- Thư mục máy cũ: `E:\web demo\RideMate_Web_Demo\ridemate-web`. Máy mới có thể clone vào bất kỳ thư mục nào.
- **Đây là frontend demo React/Vite. Chưa có backend ứng dụng, database trên server, đăng nhập hay đồng bộ thiết bị.** IndexedDB/localStorage chỉ lưu trong trình duyệt.
- Tài liệu này không xác nhận phiên bản đang chạy trên Render trùng với GitHub; cần kiểm tra deploy riêng.

## 1. Chạy trên máy mới

Cài Git và Node.js có npm (README hiện yêu cầu Node 20+), rồi chạy:

```bash
git clone https://github.com/luongngoc2005-netizen/ridemate-web.git
cd ridemate-web
npm install
npm test
npm run build
npm run dev
```

Mở URL Vite in ra. Xem bản build bằng `npm run preview`. Cổng `5175` ở máy cũ chỉ là cổng preview đã chọn, không phải cấu hình bắt buộc.

- Hiện không cần `.env` hoặc API key để chạy demo. Các dữ liệu bản đồ/thời tiết vẫn cần mạng.
- `package.json`: React 18, Vite 5, Leaflet 1.9.4; scripts `dev`, `build`, `preview`, `test`. **Không có script `start`.**
- Repo chưa có lockfile được commit. Hai file `pnpm-lock.yaml`, `pnpm-workspace.yaml` trên máy cũ là file untracked, không thuộc bản bàn giao. Chưa dùng `npm ci` được trên fresh clone; nên thống nhất package manager và commit lockfile sau khi kiểm tra bản cài sạch.
- Không chuyển `node_modules` hoặc `dist` từ máy cũ; cài và build lại.
- Quyền push trên máy mới cần đăng nhập GitHub riêng. Không đưa token hoặc thông tin đăng nhập vào repo.

## 2. Quyết định sản phẩm đã thống nhất

- Người dùng là người du lịch đường dài bằng xe máy tự túc; hành trình cá nhân, không có nhóm/cộng tác nhóm.
- Giữ ngoại hình và màu xanh/cam hiện tại, ưu tiên thao tác mobile.
- Định hướng: dùng thử trước; đăng nhập khi lưu/đồng bộ, hỗ trợ Google và email/mật khẩu. **Chưa triển khai.**
- Xem tuyến xe máy và điểm hỗ trợ trong app; mở Google Maps để dẫn đường.
- Vị trí hiện tại để tìm điểm hỗ trợ là yêu cầu còn thiếu.
- Bản đầu tiên chỉ cần dùng khi có mạng. Offline và chỉnh sửa rồi đồng bộ là hướng sau, không phải tính năng đã có.
- Mục tiêu hiện tại là demo chạy được. Theo thông tin người dùng cung cấp trước đây, chưa tạo project Supabase/tài khoản bản đồ trả phí; cần xác nhận lại trước khi tích hợp.
- **AI thật tạm hoãn. Chức năng tìm địa điểm thuê xe máy cũng được người dùng yêu cầu để sau.** Không tự coi hai phần này là ưu tiên tiếp theo.

## 3. Những phần đã làm

| Phần | Trạng thái hiện tại |
| --- | --- |
| Lập chuyến đi | Tạo/sửa thông tin, số ngày, sở thích, ghi chú; lưu một chuyến đang quản lý trong trình duyệt. Tạo mới có xác nhận thay thế chuyến cũ. |
| Điều hướng | Có nút quay lại Tổng quan hành trình; giao diện mobile với thanh điều hướng dưới. |
| Lịch trình | Gợi ý cố định cho Hà Giang, Cao Bằng, Mộc Châu, Cát Bà; sửa ngày, thêm/xóa/đổi thứ tự điểm; ghi chú ngày. |
| Checklist | Đánh dấu, thêm mục, lưu trạng thái. |
| Tổng quan | Bản đồ tuyến hai đầu, thống kê tuyến; nhóm cây xăng/quán ăn/điểm nghỉ đóng khung màu, địa điểm hiển thị một dòng; bấm tên xem ghim, mũi tên mở Maps. |
| Thời tiết | Theo điểm đến và ngày chuyến đi: nhiệt độ thấp/cao, xác suất mưa, gió tối đa; cửa sổ 16 ngày, ngày quá xa/đã qua ghi rõ. Có tải lại và trạng thái lỗi. |
| Nhật ký | Hai nút tạo/thêm bài hoạt động; chi tiết có ảnh, kỷ niệm, điểm đã đến, km và nội dung tự viết; sửa/xóa bài. |
| Ảnh | Tối đa 8 ảnh/bài, JPG/PNG/WebP, mỗi ảnh đầu vào tối đa 10 MB; thu nhỏ cạnh dài tối đa 1600 px, lưu JPEG; đổi ảnh bìa, bỏ ảnh, mở ảnh lớn. |
| Thành tựu năm | Tổng km tự nhập, số bài/chuyến hoàn thành, số điểm không trùng tên trong năm; tính theo năm kết thúc. |
| Bản đồ nhật ký | Nhập điểm đi/kết thúc để dựng tuyến tham khảo; bài cũ có nút Thêm cung đường. |
| Hoàn thành chuyến | Nút **ở cuối Tổng quan, sau lịch trình gợi ý**. Mở biểu mẫu nhật ký; chỉ hoàn thành sau khi lưu thành công; mở lại bài liên kết thay vì tạo trùng. |

## 4. Dữ liệu và dịch vụ đang dùng

### Dữ liệu cá nhân

| Nơi lưu | Nội dung |
| --- | --- |
| localStorage `ridemate.trip.v1` | Một chuyến, lịch trình, checklist, ghi chú, `completedAt`, `journalId`. |
| IndexedDB `ridemate-journal`, version 1, store `entries` | Các bài nhật ký và ảnh dạng data URL. Bài từ hoàn thành chuyến có `sourceTripId`, ID `completed-<trip.id>`. |
| localStorage `ridemate.map-cache.v1` | Tối đa 8 mục cache: tọa độ 7 ngày, tuyến 24 giờ, điểm hỗ trợ 6 giờ. |
| Bộ nhớ runtime | Cache thời tiết 30 phút; mất khi tải lại trang. |

**Clone code không mang theo chuyến đi, nhật ký hoặc ảnh của người dùng.** Dữ liệu thuộc origin và hồ sơ trình duyệt: localhost khác Render, đổi cổng localhost cũng khác dữ liệu. Chưa có chức năng xuất/nhập dữ liệu. Nếu cần mang nhật ký sang máy mới, phải xây công cụ export/import hoặc đồng bộ trước; giữ nguyên dữ liệu trình duyệt máy cũ cho tới khi kiểm tra chuyển thành công.

### Nguồn bên ngoài

- Leaflet + OpenStreetMap tiles: nền bản đồ, attribution có trong giao diện.
- Photon: tìm tọa độ tại Việt Nam.
- Valhalla: tuyến xe máy với yêu cầu tránh cao tốc.
- Overpass: tìm điểm hỗ trợ trong 5 vùng nhỏ dọc tuyến, lọc khoảng cách thẳng tới tuyến ≤1,5 km, chọn tối đa 3 điểm mỗi nhóm.
- Open-Meteo: dự báo theo múi giờ Việt Nam, gọi trực tiếp từ trình duyệt.
- Google Maps: liên kết mở tìm kiếm/dẫn đường; trang chủ còn có iframe bản đồ.
- Một số ảnh trang chủ lấy từ Unsplash; chưa phải ảnh của người dùng. Tên “Ngọc”, biểu tượng thông báo và tài khoản trên thanh trên cùng là giao diện mẫu.

Biến build tùy chọn hiện hỗ trợ: `VITE_GEOCODER_URL`, `VITE_ROUTER_URL`, `VITE_PLACES_URL`, `VITE_TILE_URL`. URL thời tiết hiện đặt trực tiếp trong `weather-data.js`. Không đặt khóa bí mật vào biến `VITE_*` vì giá trị sẽ nằm trong frontend.

## 5. Còn thiếu và giới hạn cần biết

### Ưu tiên đề xuất cho lần triển khai backend

1. **Tài khoản và dữ liệu server:** tạo Supabase hoặc chọn kiến trúc backend; schema trips/days/places/checklist/journals/photos, đăng nhập Google + email/mật khẩu, phân quyền từng người dùng và chính sách Storage. Đây là đề xuất, chưa có migration/schema đã triển khai.
2. **Đồng bộ và chuyển dữ liệu:** nhập dữ liệu localStorage/IndexedDB khi đăng nhập, tránh tạo trùng theo ID, xử lý lỗi upload ảnh, sao lưu/export/import. Không xóa dữ liệu local trước khi xác nhận server đã nhận đủ.
3. **Nhiều chuyến đi:** hiện chỉ một chuyến có thể được lập/sửa qua luồng chính; nhật ký lưu được nhiều chuyến đã hoàn thành. Cần danh sách quản lý nhiều chuyến độc lập.
4. **Tìm gần vị trí hiện tại:** chưa có luồng xin quyền GPS, từ chối quyền, định vị lỗi và tìm quanh người dùng.
5. **Ổn định dịch vụ:** cấu hình provider phù hợp, theo dõi lỗi/giới hạn gọi, kiểm tra chính sách trước khi dùng thương mại; API công cộng demo không đảm bảo sẵn sàng.

### Giới hạn chức năng hiện hữu

- Bản đồ chỉ tính giữa hai đầu tuyến, chưa nối qua điểm tham quan từng ngày. Bản đồ nhật ký **không phải GPS đường thực tế đã đi**, có thể thay đổi khi nguồn tính tuyến cập nhật. Km thành tựu vẫn là số người dùng nhập.
- Điểm hỗ trợ chưa đầy đủ, có thể chưa có tên/địa chỉ; khoảng cách hiển thị là đường thẳng tới tuyến, không phải quãng đường rẽ vào. Chưa kiểm chứng tình trạng hoạt động/giờ mở cửa.
- Trước đây từng gặp ảnh nền OSM không tải được ở môi trường kiểm tra và Overpass phản hồi chậm. Có trạng thái lỗi/fallback, nhưng cần kiểm tra lại trên mạng và thiết bị người dùng; không coi mọi lỗi mạng là lỗi code.
- Thời tiết là dự báo tại điểm đến, chưa theo từng vị trí trên tuyến. Không hiển thị dữ liệu lịch sử cho ngày đã qua.
- Lịch trình gợi ý là dữ liệu cố định, chưa tối ưu theo thời gian chạy xe, giờ mở cửa hoặc ngân sách. Ngày mặc định trong `initialDetails` còn cố định `2026-09-15`, nên sửa sang ngày động khi làm tiếp.
- Chưa có autosave bản nháp form nhật ký; chuyển màn hình/tải lại trước khi lưu có thể mất bản nháp. Thống kê địa điểm chỉ gộp theo tên đã chuẩn hóa hoa/thường, chưa dùng ID địa điểm chuẩn.
- Trạng thái hoàn thành nằm ở localStorage, bài nhật ký ở IndexedDB: chưa có transaction chung giữa hai nơi. Luồng hiện đồng bộ khi lưu/xóa/mở bài liên kết, nhưng cần kiểm thử sâu khi một kho lưu bị lỗi hoặc nhiều tab cùng sửa.
- AI Assistant chỉ trả lời mẫu theo từ khóa; chưa có API AI. Công cụ thuê xe chưa triển khai và đang hoãn.
- Chưa có PWA/service worker, GPS tracking, offline đầy đủ, đồng bộ xung đột hoặc hướng dẫn rẽ từng bước trong app.

## 6. Các file cần đọc khi tiếp quản

| File | Vai trò |
| --- | --- |
| `src/main.jsx` | App, điều hướng bằng state, trang chủ/công cụ/AI mẫu, lưu chuyến và liên kết hoàn thành. |
| `src/Journey.jsx`, `src/trip-data.js` | Form chuyến, lịch trình/checklist/ghi chú, nút hoàn thành; dữ liệu và lưu trữ chuyến. |
| `src/RouteOverview.jsx`, `src/route-data.js` | Leaflet, trạng thái tuyến/địa điểm, provider/cache, lọc điểm gần tuyến. |
| `src/Journal.jsx`, `src/journal-data.js` | CRUD nhật ký, upload ảnh cục bộ, IndexedDB, thống kê năm, bản nháp hoàn thành. |
| `src/JournalRoute.jsx` | Bản đồ hai đầu trong chi tiết nhật ký. |
| `src/TripWeather.jsx`, `src/weather-data.js` | Dự báo, phân loại ngày, cache và mã thời tiết WMO. |
| `src/*.css` | Màu/giao diện mobile; chú ý style global và các override ở cuối file. |
| `tests/*.test.js` | Unit test dùng Node test runner, không cần framework test riêng. |

Code hiện có nhiều JSX/CSS viết gọn trên một dòng. Có thể format/refactor từng phần, nhưng cần giữ hành vi và giao diện đã thống nhất.

## 7. Triển khai Render và GitHub

Với code frontend hiện tại, cấu hình **Static Site** có thể dùng:

| Mục | Giá trị |
| --- | --- |
| Repository/branch | Repo ở đầu tài liệu, `main` |
| Root Directory | Để trống khi clone repo này, `package.json` nằm ở gốc |
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |

Tham khảo [Render Static Sites](https://render.com/docs/static-sites) và [Vite static deploy](https://vite.dev/guide/static-deploy). Người dùng trước đây đã chọn Web Service; cấu hình dashboard hiện tại không được lưu trong repo và chưa được kiểm tra lại trong lần bàn giao này. **Không tự xóa/chuyển service đang chạy.** Đối chiếu Build/Start Command trong dashboard; `yarn start` sẽ lỗi vì không có script `start`. Không coi Web Service là bằng chứng đã có backend.

Repo chưa có `render.yaml`, CI workflow hoặc kiểm tra deploy tự động. Push thành công chỉ xác nhận GitHub nhận code; cần xem commit deploy và build log trên Render. Nếu auto-deploy chưa bật, có thể dùng Manual Deploy → Deploy latest commit.

Máy cũ từng có tiến trình `git-remote-https.exe` crash ở lượt push treo. Các lượt push sau thành công với `git -c http.sslBackend=openssl -c credential.interactive=false push origin main`. Đây là cách đã dùng trên máy cũ, không bắt buộc trên máy mới và không vô hiệu hóa kiểm tra SSL.

## 8. Kiểm thử khi nhận bàn giao

Ngày 17/09/2026: chạy lại bộ unit test hiện có **12/12 đạt**, build production thành công trên môi trường máy cũ. Chưa kiểm tra fresh clone/cài dependency mới trong lần ghi tài liệu này.

Các lượt phát triển trước đã kiểm tra trình duyệt cho nhật ký, hoàn thành, bản đồ và thời tiết bằng script tạm ở thư mục `work` ngoài repo. **Các script đó không có trong GitHub**, chưa có bộ E2E có thể chạy ngay trên máy mới. Unit test không thay thế kiểm tra UI hoặc dịch vụ mạng thật.

Checklist nghiệm thu đề xuất:

- [ ] Fresh clone, cài dependency, `npm test`, `npm run build` thành công.
- [ ] Mobile 320/390 px và desktop: không tràn ngang; giữ màu xanh/cam và thanh điều hướng.
- [ ] Tạo/sửa chuyến, đổi số ngày không mất dữ liệu ngày giữ lại; notes/checklist tồn tại sau reload.
- [ ] Tổng quan tải tuyến/địa điểm, bấm dòng mở ghim; khi provider lỗi vẫn thao tác được các phần khác.
- [ ] Thời tiết lọc đúng ngày chuyến đi; ngày xa/đã qua, mưa 0%, dữ liệu thiếu, mất mạng hiển thị đúng.
- [ ] Nút hoàn thành ở cuối Tổng quan; hủy không hoàn thành; lưu tạo đúng một bài; mở lại không nhân đôi.
- [ ] Nhật ký thêm/sửa/xóa, ảnh sau reload, chọn ảnh bìa, thành tựu theo năm, giới hạn ảnh và lỗi lưu.
- [ ] Bài nhật ký cũ không có hai đầu tuyến vẫn mở/sửa được; bản đồ không bị mô tả là GPS thực tế.
- [ ] Kiểm tra Render đã deploy đúng commit và dữ liệu người dùng không bị xóa khi cập nhật.

Sau mỗi đợt sửa, cập nhật tài liệu này với commit đối chiếu, chức năng mới, giới hạn còn tồn tại và các kiểm tra thực sự đã chạy.
