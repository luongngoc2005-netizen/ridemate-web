# Điểm xăng / nghỉ / sửa xe từ OSM trong Supabase

Render tiếp tục phục vụ web và API AI. Supabase lưu bản trích POI Việt Nam;
trình duyệt gọi RPC `route_pois` trực tiếp để tìm loại được chọn dọc tuyến đi–đến,
không cần đi qua backend Render hay lấy GPS. RPC chỉ đọc, không lưu tuyến tìm kiếm.
`nearby_pois` vẫn có sẵn cho các công cụ tìm quanh một tọa độ riêng.

## 1. Chuẩn bị dữ liệu trên máy quản trị

Tại thư mục repo, dùng Python 3.11+ và Node 22+:

```powershell
python -m pip install --target .poi-tools -r scripts/requirements-poi.txt
python scripts/extract-poi.py
npm run prepare:poi
```

Lần đầu tải file PBF Việt Nam khoảng 315 MB từ Geofabrik; file này **không** được
đưa vào bundle web hoặc Supabase. MD5 được đối chiếu trước khi xử lý. Bộ lọc chỉ
giữ fuel, hotel/guest_house/motel, rest_area/services, motorcycle_repair,
car_repair, tyres và motorcycle có `service:motorcycle:repair=yes`. Cửa hàng bán
xe đơn thuần không được xem là sửa xe. Chưa có đảm bảo một điểm sửa ô tô có phục
vụ xe máy; người đi vẫn cần xác nhận dịch vụ.

Trích cả node, way và multipolygon relation có tọa độ hợp lệ; way/relation dùng
tâm bounding box, giống cách hiển thị `center` của Overpass. Relation dạng khác
không được xử lý. Sau đó lọc theo ranh giới Việt Nam hiện có của RideMate.

Các file được tạo trong `output/poi/` (đã được gitignore):

| File | Mục đích |
|---|---|
| `report.json` | Nguồn, checksum, số điểm mỗi loại, điểm loại bỏ và dung lượng file |
| `01-setup.sql` | SQL nhỏ: tạo bảng/RPC và đăng ký bản dữ liệu chưa kích hoạt |
| `pois.csv` | Nhập dữ liệu bằng Table Editor → Insert → Import data from CSV |
| `03-activate.sql` | SQL nhỏ: kiểm tra đủ số dòng rồi kích hoạt bản dữ liệu |
| `04-route-search.sql` | Chỉ thêm RPC tìm dọc tuyến cho project đã nhập dữ liệu trước đây |
| `sql-editor/<datasetId>/02-data-*.sql` | Phương án phục hồi: các phần SQL tối đa 64.000 byte, chạy lại không trùng dòng |
| `setup-and-import.sql` / `import.sql` | Chỉ dùng với kết nối database trực tiếp; quá lớn cho SQL Editor |
| `source.json` / `poi-elements.jsonl` | Metadata nguồn và bản trích nhỏ để tái tạo SQL |

Tên và địa chỉ giữ nguyên Unicode; chuỗi SQL được escape. Dung lượng CSV/SQL
không phải dung lượng database. Báo cáo không suy đoán số MB của bảng và chỉ mục.

## 2. Chạy trong Supabase SQL Editor

Mở **đúng project RideMate**, thực hiện ba bước:

Nếu đã hoàn tất nhập và kích hoạt dữ liệu trước đây, chỉ chạy
`output/poi/04-route-search.sql` trong SQL Editor. Không cần nhập lại CSV.
Nếu chưa nhập dữ liệu, dùng ba bước dưới đây; `01-setup.sql` đã gồm RPC dọc tuyến.

1. SQL Editor → New query: dán toàn bộ `output/poi/01-setup.sql` rồi Run với vai trò `postgres`.
2. Table Editor → schema `public` → bảng `osm_pois` → Insert → Import data from CSV.
   Chọn `output/poi/pois.csv`, kiểm tra tên cột khớp và chờ import hoàn tất.
3. SQL Editor → New query: chạy toàn bộ `output/poi/03-activate.sql`.
   Kết quả cần `ready = true` và `imported_count = 16049` với bản dữ liệu hiện tại.

SQL Editor từ chối file gộp gần 2 MB. Hai file SQL nhỏ chỉ khoảng 9 KB và
0,9 KB; phần dữ liệu được tải lên dưới dạng CSV khoảng 2 MB. Supabase hỗ trợ
[CSV qua Table Editor](https://supabase.com/docs/guides/database/import-data),
với giới hạn được tài liệu công bố là 100 MB.

Nếu đã nhập CSV một phần và gặp trùng khóa, giữ nguyên dữ liệu và dùng các file
`02-data-*.sql` trong thư mục đúng `datasetId`, chạy lần lượt rồi chạy lại
`03-activate.sql`. Mỗi phần SQL tự commit và có thể chạy lại không tạo dòng trùng.
Kích hoạt sẽ từ chối nếu thiếu dòng và giữ nguyên nguồn đang hoạt động.

Gói này chỉ tạo/cập nhật bảng POI riêng; không sửa kế hoạch, tài khoản, nhật ký,
quota AI hoặc đơn đặt phòng. Không cần gửi mật khẩu hoặc service-role key qua chat.

PostGIS phải nằm trong schema `extensions`. Nếu project đã có PostGIS trong một
schema khác, migration dừng với thông báo; xem schema đó trước khi xử lý, không
drop extension đang được dữ liệu khác sử dụng.

Import giữ bản cũ hoạt động cho tới khi toàn bộ bản mới được ghi và kiểm tra đủ
số dòng. Việc kích hoạt diễn ra trong một transaction riêng ở bước cuối. Chạy
lại các phần SQL không nhân đôi dòng. Nếu import lỗi, active dataset cũ vẫn được giữ.
Các snapshot cũ được giữ để có thể quay lại; cần theo dõi dung lượng khi cập nhật.

Sau khi Run thành công, kiểm tra kết quả cuối file:

```sql
select public.nearby_pois(106.2587824, 22.665781, 1500);
select pg_size_pretty(pg_total_relation_size('public.osm_pois')) as poi_with_indexes;
select pg_size_pretty(pg_database_size(current_database())) as total_database;
```

RPC phải trả `ready: true`. `places: []` với `ready: true` là một tìm kiếm hợp lệ
không có điểm ở bán kính đó, không phải lỗi import. Supabase Free có giới hạn
dung lượng dùng chung; kiểm tra cả bảng/chỉ mục và database, không chỉ file CSV.

Người dùng khách/đăng nhập chỉ có quyền gọi RPC tìm kiếm công khai. Các bảng
import/cấu hình không cấp quyền đọc hoặc ghi trực tiếp cho họ; RPC không ghi GPS.
RPC dọc tuyến giới hạn khoảng cách hai bên đường 2 km, tối đa 5.000 đỉnh mỗi
request. Chỉ mục không gian tìm theo các đoạn nhỏ; kết quả lấy tối đa 180 ứng viên
chia đều theo 30 khoảng dọc tuyến. Web kiểm tra lại theo tuyến gốc trong 1,5 km,
chọn tối đa 30 ghim mỗi loại trải từ đầu đến cuối tuyến theo dữ liệu có sẵn.

## 3. Đưa web mới lên Render

Giữ nguyên `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY` của project.
`VITE_NEARBY_PROVIDER=auto` là mặc định, không cần thêm khóa trả phí:

- `auto`: dùng Supabase khi RPC/bản dữ liệu sẵn sàng; nếu chưa có migration hoặc
  chưa công bố dữ liệu, dùng Overpass. Kiểm tra lại nguồn sau tối đa 5 phút.
- `supabase`: yêu cầu bản dữ liệu mới; báo lỗi rõ nếu chưa sẵn sàng.
- `overpass`: quay về nguồn công cộng.

Với dữ liệu Supabase đã công bố, lỗi kết nối không tự nối tiếp một lượt chờ
Overpass khác. Request dọc tuyến Supabase giới hạn chờ 8 giây. Chưa chọn loại thì
không tải POI; chọn loại nào chỉ tải loại đó. Có thể bật nhiều loại cùng lúc.
Tắt loại đang chờ sẽ hủy request nếu không còn màn hình nào cần. Kết quả thành công
được giữ khi bật/tắt trong cùng hành trình; bộ nạp có cache RAM 5 phút theo tuyến/loại.
Thử lại chỉ tải các loại/đoạn bị lỗi. Quán ăn/đồ uống vẫn dùng Overpass khi được chọn.
Biến `VITE_*` được đọc lúc build, nên đổi chế độ cần build/deploy.

## 4. Đo thật và cập nhật

Để đo endpoint Supabase thật, điền **hai biến public hiện có** vào `.env.local`
trên máy quản trị (không commit file), rồi chạy:

```powershell
npm run check:poi
npm run check:poi -- 105.804817 21.028511
node scripts/check-poi.js --site https://ridemate-pka.onrender.com/
```

Lệnh đo ba lần RPC, không dùng cache RAM của UI; không in key.
Tùy chọn `--site` chỉ đọc hai thông tin public đã có trong bundle web online,
không lấy thông tin quản trị hoặc truy vấn dữ liệu tài khoản.
`check:poi` kiểm tra RPC quanh điểm và việc kích hoạt dữ liệu. Đối chiếu Network
trong Hành trình/Đang đi: chọn Xăng/Nghỉ/Sửa xe phải gọi `/rest/v1/rpc/route_pois`
với `route_geojson` và `category_name`. Trước khi chọn không gọi tìm POI; bật lại
loại đã tải thành công trên cùng tuyến không tạo thêm request.

```powershell
npm run benchmark:poi
node scripts/benchmark-poi.js --csv
node scripts/benchmark-poi.js --csv --route=output/poi/route.json
```

Lệnh trên nhập dữ liệu vào PostgreSQL/PostGIS WASM local, xuất `benchmark.json`
và `query-plan.json`; tùy chọn `--csv` kiểm tra đúng luồng setup/CSV/kích hoạt và
xuất `benchmark-csv.json`, `query-plan-csv.json`. Tùy chọn `--route` nhận JSON tuyến
có `coordinates` để chạy cả bộ nạp dọc tuyến trên dữ liệu thật và đo cache.
Số đo này chỉ kiểm chứng local, không phải thời gian tải
Supabase, Render, GPS hoặc trình duyệt thật.

Kiểm tra dọc tuyến ngày 17/10/2026 trên cùng bộ 16.049 POI: dùng tuyến Valhalla
Cao Bằng–An Giang dài 2.426 km, 41.038 đỉnh. Mỗi loại chỉ cần một RPC local;
truy vấn mất 87–218 ms, cả lọc/phân bố ghim mất 621–864 ms; cả ba loại đều có
30 ghim trải dọc tuyến ở những nơi có dữ liệu. Bật lại cùng loại dùng cache mất
khoảng 1 ms. Báo cáo nằm ở `output/poi/benchmark-csv.json`, hình học kiểm tra ở
`output/poi/route.json`. Đây là PostGIS local qua WASM và bộ nạp Node, không phải
thời gian mạng Supabase hoặc thao tác trên web online.

Lần kiểm tra ngày 17/10/2026 dùng bản OSM đến `2026-10-16T20:21:21Z`, MD5 PBF
`6d8abd6bf5c5e3e85549bfeb0d903f4a`: 16.049 điểm (5.020 fuel, 9.469 rest,
1.560 repair), loại 82 điểm không hợp lệ/ngoài ranh giới Việt Nam. Bảng POI cùng
chỉ mục chiếm 4.947.968 byte trong PostGIS local. RPC bán kính 2 km tại Cao Bằng,
Hà Nội, TP.HCM, Đà Lạt mất khoảng 5–22 ms ở các lượt lặp; lượt đầu của cả phiên
ở Cao Bằng mất 259 ms. Đây không phải số đo trên Supabase online. Vùng TP.HCM
thực tế chạm giới hạn 300 điểm nghỉ nên `complete: false`; cache xử lý trường
hợp này bằng cách yêu cầu truy vấn mới khi GPS di chuyển.

Cập nhật khi cần bằng cách chạy lại bước trích/lọc và ba bước nhập mới. Bản cũ
không bị xóa tự động; lên lịch cập nhật riêng sau khi đo dung lượng và tải thực tế.
Dữ liệu giữ nguồn © OpenStreetMap contributors, theo ODbL; tính năng nhập không
làm dữ liệu OSM đầy đủ hơn hoặc xác minh được giờ mở cửa/dịch vụ thực tế.

Tài liệu: [Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis),
[Geofabrik Việt Nam](https://download.geofabrik.de/asia/vietnam.html),
[OSM license](https://www.openstreetmap.org/copyright).
