# RideMate — bàn giao code và việc còn thiếu

## 27/09/2026 — MapLibre GL JS + OpenFreeMap + OSRM

- Thay Leaflet bằng MapLibre GL JS 6.11.2, nền vector OpenFreeMap Liberty. Marker/popup DOM an toàn, `flyTo`, zoom/rotate/fullscreen, vòng sai số GPS và bám vị trí. Vite đóng gói riêng worker MapLibre qua `?worker&url`; không dùng đường dẫn worker tương đối bị mất sau build. Cần WebGL; có thông báo khi nền/khởi tạo lỗi và tải lại style.
- `osrm-data.js` xử lý URL/response OSRM, đổi mét sang km, GeoJSON LineString theo từng chặng. Thứ tự: xuất phát → các điểm có tọa độ trong lịch trình theo ngày/thứ tự → điểm đến. Mỗi request tối đa 25 điểm, giữ điểm chung giữa các request; không tự tối ưu đảo thứ tự. Chặng có màu theo ngày, bấm danh sách chặng highlight và fitBounds. Điểm chỉ có tên được liệt kê là chưa định vị; chọn vị trí ở bảng Hành trình để đưa vào tuyến. Không gán nhầm POI dựa trên tên gần giống.
- OSRM public profile `driving` là ô tô, có thể đi cao tốc. Đã đổi nhãn trên Tổng quan, bảng nổi và Nhật ký; không còn tuyên bố tuyến xe máy tránh cao tốc. Nhật ký vẫn dựng tuyến hai đầu, không phải đường GPS. Google Maps link vẫn chỉ hai đầu; link từng ghim giữ đúng tọa độ.
- Tổng quan/bảng nổi dùng chung context; thay điểm hoặc thứ tự lịch trình cập nhật tuyến, ghi chú/checklist/GPS không gọi lại tuyến. Điểm hỗ trợ vẫn từ Overpass: tải tuần tự từng đoạn, hiện kết quả ngay, báo tiến độ và số đoạn lỗi; giữ đoạn thành công trong cache RAM 6 giờ, tối đa 150 đoạn, retry chỉ tải đoạn thiếu. Có cache trước thì hiển thị ngay cả khi retry thất bại. Bản đồ nền không tự cung cấp dữ liệu cửa hàng.
- `.env.example`: `VITE_MAP_STYLE_URL`, `VITE_OSRM_URL` thay `VITE_TILE_URL`, `VITE_ROUTER_URL` cũ; Photon và Overpass giữ nguyên. Không yêu cầu API key/billing cho mặc định demo; endpoint công cộng không có bảo đảm sẵn sàng. Không cần migration SQL.
- Xác minh: 47/47 tests đạt; production build đạt, có worker asset. OpenFreeMap style HTTP 200 (111 layers). OSRM Hà Nội–Hải Phòng: 108,801 km; Hà Nội–Hải Dương–Hải Phòng: 2 chặng, 108,3001 km. Chưa kiểm tra UI/WebGL/mobile/GPS hoặc Render vì không có browser kết nối. Bundle MapLibre lớn (main ~1,3 MB trước gzip, worker ~510 KB), build có cảnh báo chunk >500 KB.
- Nghiệm thu localhost: Ctrl+F5, mở Tổng quan, bật từng nhóm ghim; Hành trình → Lịch trình → chọn vị trí điểm cũ/thêm ghim vào ngày; xác nhận tuyến và số chặng đổi; bấm chặng để highlight, thử toàn tuyến/rotate/fullscreen/GPS. Tài liệu cũ bên dưới mô tả Leaflet/Valhalla là lịch sử.
- Nguồn kỹ thuật: https://openfreemap.org/quick_start/ ; https://project-osrm.org/docs/v5.22.0/api/ ; https://maplibre.org/maplibre-gl-js/docs/ .

## 20/09/2026 — Sửa không định vị được Hà Nội trên trình duyệt tiếng Anh

- Tái hiện với API thật: không truyền `lang`, header `Accept-Language: en-US` trả `Hanoi`, bộ so khớp tên `Hà Nội` loại kết quả nên không dựng tuyến. Dùng `lang=default` cho cả geocode hai đầu và tìm vị trí điểm lịch trình để lấy tên địa phương; không dùng `lang=vi` vì demo Photon hiện trả HTTP 400 cho giá trị đó. Cache geocode/tuyến lên v3, giữ kiểm tra đúng tên/đơn vị hành chính.
- Xác minh API thật với header tiếng Anh và tiếng Việt đều nhận Hà Nội; tuyến Hà Nội–Hà Giang tải được 13.249 tọa độ, 382,702 km. Thêm kiểm thử hồi quy ngôn ngữ trình duyệt và tránh chọn ga cùng tên. Bộ 45 kiểm thử/build đạt. Chưa xác minh UI bằng trình duyệt kết nối; người dùng tải lại localhost để nghiệm thu.

## 20/09/2026 — Định vị và bảng hành trình nổi

- `Location.jsx`/`geolocation.js`: một `watchPosition` chung cho toàn ứng dụng, chỉ bắt đầu khi bấm Bật định vị. Có nút tắt toàn cục, hiển thị thời gian/sai số, đánh dấu dữ liệu quá 30 giây là vị trí lần cuối. Dọn watch khi tắt/unmount; bỏ callback muộn; xử lý HTTPS, thiếu hỗ trợ, từ chối quyền và timeout. Vị trí chỉ giữ trong RAM, không ghi lịch sử GPS vào localStorage/Supabase.
- `RouteMap.jsx`: dùng chung cho Tổng quan, Nhật ký, bản đồ trang chủ và bảng nổi. Chấm vị trí/vòng sai số, Về vị trí tôi, Bám theo tôi; kéo bản đồ hoặc chọn ghim dừng bám. Trình duyệt quyết định tần suất GPS; không cam kết mỗi vài giây hoặc chạy khi tắt màn hình/ẩn tab. Tham chiếu: https://www.w3.org/TR/geolocation/.
- `TripCompanion.jsx`: nút nổi sau khi có chuyến, giữ được khi chuyển màn hình. Bảng gồm danh mục phía trên, bản đồ phía dưới và danh sách. Nhóm Lịch trình chính là điểm đã thêm theo xác nhận người dùng; các nhóm tìm kiếm gồm Quán ăn, Đồ uống, Cây xăng, Sửa xe, Điểm nghỉ. Có thu gọn/Escape, tránh thanh điều hướng dưới trên mobile.
- Ghim tìm kiếm mở tên/chỉ đường/thêm vào ngày. Điểm mới lưu tọa độ, địa chỉ, loại và ID nguồn. Điểm cũ chỉ có tên yêu cầu người dùng tìm và chọn đúng kết quả Photon; không tự gán tọa độ đoán. Đổi tên điểm xóa tọa độ cũ. Lưu ngày đang chỉnh giữ các điểm/vị trí vừa thêm từ bảng nổi. Lịch trình vẫn lưu local và chuyển cloud thủ công qua Tài khoản như trước; không cần migration.
- `TripRouteContext.jsx`: Tổng quan và bảng nổi dùng chung dữ liệu/request tuyến và điểm hỗ trợ, không gọi lại theo mỗi lần GPS cập nhật. Truy vấn Overpass tách đồ uống khỏi đồ ăn, thêm sửa xe; dùng `out body center` để có tọa độ node và tâm way/relation (sửa lỗi thiếu tọa độ của `out tags center` trước đây). Cache địa điểm tăng lên v3.
- Kiểm thử 44/44 đạt và production build thành công. Thử một hành lang ngắn tại Hà Nội qua Overpass thật: HTTP 200, 1.422 đối tượng, xác nhận node có tọa độ, lọc được 111 điểm thuộc các nhóm (tối đa 30 mỗi nhóm). Không đại diện cho toàn tuyến hoặc độ đầy đủ dữ liệu. Không có trình duyệt kết nối trong phiên nên chưa kiểm tra UI mobile, GPS thiết bị hoặc Render thật.
- Nghiệm thu: tạo chuyến → mở nút Hành trình → bật/tắt định vị → thử từ chối quyền → chọn từng nhóm/ghim → thêm ghim vào ngày → tải lại trang và kiểm tra tọa độ → chọn vị trí cho điểm cũ → chuyển màn hình khi đang định vị. Tuyến vẫn nối hai đầu, chưa tự định tuyến qua mọi điểm lịch trình hoặc dẫn đường từng ngã rẽ.

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

## 9. Sửa lỗi bản đồ sau rà soát — 27/09/2026

Thay đổi local trên nền commit `289193f`; chưa commit/push/deploy trong lượt sửa này.

- Hành trình → Lịch trình có **Đổi vị trí / Xóa vị trí**. Tìm địa điểm hoạt động cả khi OSRM lỗi; khi chưa có tuyến, không hiển thị khoảng cách giả. Xóa tọa độ giữ nguyên điểm và nội dung lịch trình.
- Các đợt tải địa điểm cập nhật marker theo ID, giữ popup đang mở. Nếu ghim bị loại khỏi danh sách phân bố tối đa 30 điểm/loại, ghim đang mở được giữ tạm đến khi đóng popup hoặc ẩn nhóm. Camera chỉ chuyển tới điểm khi người dùng chọn, không chạy lại theo mỗi đợt tải.
- Lọc địa điểm trong `places.worker.js`, tính khoảng cách mỗi tọa độ một lần trên từng tuyến. Worker bị hủy khi đổi tuyến; nếu worker không hoạt động, xử lý theo từng lượt ngắn và giữ dữ liệu đã tải. `places-data.js` chứa các hàm tính toán dùng chung; `route-data.js` tiếp tục xuất các API cũ.
- Tỉnh/thành và các điểm đến có sẵn chỉ nhận kết quả địa lý phù hợp (`place` hoặc ranh giới hành chính), không nhận ga/tòa nhà/cửa hàng trùng tên. Cache geocode `v4` và OSRM `v2` bỏ qua kết quả cũ có thể định vị sai.

Đã kiểm tra: **57/57 test đạt**, production build thành công, `git diff --check` đạt. Test mới bao gồm thay/xóa tọa độ, tìm khi mất tuyến, marker giữ popup, worker thực qua Node worker_threads, worker lỗi/hủy và cache cũ. Benchmark giả lập 15.000 điểm tuyến + 2.000 địa điểm: lượt đầu trong worker ~1.190 ms, timer luồng chính vẫn chạy 76 lần; xử lý lại cùng dữ liệu ~15 ms. Đây là phép đo Node trên máy phát triển, không phải số đo trình duyệt/điện thoại.

Chưa kiểm thử trực tiếp WebGL/GPS trên trình duyệt hoặc bản Render trong lượt này. Build vẫn cảnh báo bundle chính lớn (~1,30 MB trước gzip); chưa tách tải lười các màn hình. Kiểm tra thủ công tiếp: chọn sai điểm rồi đổi/xóa khi tuyến lỗi, mở popup trong lúc Overpass còn tải, kéo bản đồ sau khi chọn ghim, ẩn/hiện nhóm và đổi tuyến khi worker đang chạy.

## 10. Giới hạn tuyến trong Việt Nam — 27/09/2026

Thay đổi local trên nền `8a3235a`, chưa push/deploy trong lượt này.

- `loadRoute` kiểm tra điểm đi, điểm đến, điểm dừng, tọa độ đã snap, toàn bộ geometry và từng leg. Kiểm tra cả đoạn nối giữa hai tọa độ để phát hiện đoạn cắt qua biên giới dù hai đầu nằm trong nước. Không vẽ/cắt bỏ riêng phần ở nước ngoài rồi giả thành tuyến liền mạch.
- Ranh giới OSM relation 49915 được đóng gói và tải lười; nguồn, giấy phép ODbL và checksum ở `src/data/README.md`. Đây là dữ liệu bản đồ cộng đồng để lọc tuyến, không phải xác nhận pháp lý ranh giới. Kiểm tra chi tiết bằng chỉ mục vĩ độ, không dùng bounding box làm ranh giới.
- Chọn phương án OSRM trong nước nếu có. Tuyến nhiều điểm bị từ chối được thử lại từng chặng. Chặng dài Bắc–Nam không có phương án phù hợp được thử lại một lần qua các điểm dẫn tuyến trong nước (Vinh, Đồng Hới, Đà Nẵng, Nha Trang, Phan Thiết tùy khoảng vĩ độ). Mọi phương án tìm lại đều phải qua cùng kiểm tra; nếu không đạt thì báo lỗi, không hiển thị đường vượt biên. Điểm dẫn tuyến tự động được ghi rõ trên bản đồ, không sửa lịch trình đã lưu; không khẳng định đây là tuyến trong nước ngắn nhất.
- Cache OSRM `vn-v1` và geocode `v5`; kiểm tra lại geometry ngay cả khi đọc cache mới. Lọc điểm tìm kiếm và ghim Overpass theo cùng ranh giới.
- Google Maps URLs không có tùy chọn giới hạn quốc gia (https://developers.google.com/maps/documentation/urls/get-started). Bộ lọc chỉ bảo đảm tuyến hiển thị trong web theo dữ liệu OSM; các liên kết ngoài vẫn do Google tự tính. Đã bỏ `dir_action=navigate` và ghi rõ cần kiểm tra biên giới khi mở Google Maps.

Kiểm chứng: **67/67 test đạt**, build thành công. Gọi OSRM thật với hai đầu Hà Nội `[105.854,21.028]` → TP.HCM `[106.7,10.77]`: phương án mặc định ~1.496 km bị chặn, có điểm ngoài ranh giới `[105.159383,18.386529]`; phương án qua Vinh → Đồng Hới → Đà Nẵng → Nha Trang ~1.678 km đạt kiểm tra (~101 ms trên máy phát triển). Hà Nội → Hải Phòng trả hai phương án ~110/106 km đều đạt. Chưa kiểm tra trực tiếp UI/GPS/Render. Chunk ranh giới tải lười ~1,91 MB, gzip ~602 KB; các dịch vụ công cộng vẫn có thể lỗi hoặc không tìm ra tuyến phù hợp.
# Bổ sung 27/09/2026 — Đặt phòng demo

- Mục Chỗ nghỉ từ thanh điều hướng/Công cụ hỗ trợ nhanh, 8 chỗ nghỉ mẫu, 16 loại phòng,
  lọc khu vực/ngày/khách/phòng/giá, xem bản đồ/ảnh/tiện ích, báo giá và xác nhận demo.
- Đơn của tôi: xem/hủy trong giao diện; không thu tiền hoặc đặt khách sạn thật.
- `src/stays/`: catalog, logic giá/tồn kho, IndexedDB khách, Supabase tài khoản,
  context tự tải lại 15 giây và giao diện. Không tự nhập đơn khách vào tài khoản.
- `supabase/migrations/202609270001_demo_bookings.sql`: cần chạy thủ công trên project.
  RLS theo chủ sở hữu, RPC giá chuẩn, khóa giao dịch, idempotency. Tồn kho riêng từng tài khoản demo.
- Ghim chỗ nghỉ là dữ liệu dẫn xuất, không ghi đè lịch trình. Hủy gỡ ghim; thay đổi
  ngày chuyến đi cảnh báo và bỏ ghim lệch ngày, không tự đổi đơn. TripRouteProvider nhận
  trip đã bổ sung ghim, trình chỉnh lịch trình vẫn nhận trip gốc.
- Tests bổ sung: giá/ngày/sức chứa, đặt đồng thời/trùng yêu cầu, hủy trả phòng,
  ghim theo ngày, migration thực trên PGlite và cô lập tài khoản.
- Chưa push/deploy/chạy migration trên Supabase. Phiên này không có browser CUA
  khả dụng nên chưa xác minh tương tác và ảnh/bản đồ trên trình duyệt thật.
# Bổ sung — Điểm xuất phát GPS/ghim và chi tiết đơn

- `OriginSelect.jsx`: chọn tỉnh/thành, GPS một lần có sai số, tìm địa chỉ hoặc bấm
  ghim trong dialog. Chỉ lưu sau xác nhận; kiểm tra ranh giới Việt Nam. Hủy dialog
  bỏ qua kết quả GPS/tìm kiếm đến muộn. Lưu tọa độ cùng hành trình, không bám GPS
  để liên tục thay đổi điểm xuất phát.
- `originPoint` giữ tọa độ, nhãn, nguồn và sai số. `tripOrigin` chỉ dùng điểm khi
  nhãn còn khớp tên origin; đổi sang tỉnh/thành bỏ tọa độ cũ. loadTripRoute và cache
  context dùng tọa độ mới; link Google Maps và nhật ký hoàn thành cũng giữ tọa độ.
- Chỗ nghỉ có nút Xem đơn thường trực, thẻ giá/phòng/đêm, tổng giá và check-in/out
  có ngày/giờ. Cả xác nhận và danh sách đơn dùng BookingSummary.
- Migration đặt phòng có thể chạy lại, giữ đơn; thông báo reload schema cho
  PostgREST. Cần chủ project chạy trên Supabase để sửa lỗi bảng/hàm chưa có.
- Xác minh: 74/74 unit/integration tests đạt, gồm GPS không geocode lại nhãn,
  từ chối tọa độ nước ngoài và chạy lại SQL giữ đơn. Chưa xác minh Supabase thật/GPS thiết bị.


## Cập nhật ngày 27/09/2026 về thời gian xe máy
- Thay router ô tô OSRM bằng Valhalla motorcycle, giữ định dạng phản hồi OSRM để dùng lại parser và geometry theo chặng. VITE_MOTORCYCLE_ROUTER_URL thay VITE_OSRM_URL; biến cũ không còn dùng.
- Server demo có thể bỏ qua hard exclusion (warning 208). Vì vậy còn kiểm tra tên cao tốc, mã CT và classes motorway; thử loại vị trí trên đoạn bị phát hiện tối đa 3 lần, không fallback tuyến ô tô. Kiểm tra này phụ thuộc metadata OSM, không bảo đảm phát hiện đường cấm bị gắn nhãn thiếu/sai.
- Giữ kiểm tra tuyến trong Việt Nam, thứ tự waypoint và cảnh báo các điểm chưa có tọa độ. Cache mới motorcycle:vn-v2 không dùng tuyến OSRM cũ.
- Thời gian là giả định lập kế hoạch: max(thời gian dịch vụ, km/40) theo chặng. Cộng nghỉ ngắn 15 phút mỗi 2 giờ chạy; khoảng trên cộng 25% dự phòng chạy xe. Không coi là ETA giao thông thực tế, chưa gồm ăn/tham quan/ngủ.
- Kiểm tra trực tiếp hai điểm đại diện Hà Nội–Cao Bằng: tuyến thay thế khoảng 346,4 km, 11 giờ 45 phút chạy xe (làm tròn 5 phút), gồm nghỉ khoảng 13 giờ–15 giờ 55 phút. Đây là kết quả provider tại lúc kiểm tra, không phải thời gian thực địa đã đo; điểm xuất phát/đến cụ thể và điểm dừng có thể làm thay đổi kết quả.
