# Dữ liệu địa danh dùng cho RideMate AI

Catalog: [src/destination-catalog.json](./src/destination-catalog.json). Resolver: [src/destination-data.js](./src/destination-data.js).

## Phạm vi

- 63 khu vực tỉnh/thành theo tên trước sắp xếp năm 2025 (Huế nhận cả tên Thừa Thiên Huế).
- 3 danh sách riêng cho Đà Lạt, Mộc Châu, Cát Bà: tổng cộng 66 khu vực, 177 tên điểm tham quan khác nhau.
- Mỗi khu vực có ít nhất 2 điểm, nguồn tham khảo và ngày đối chiếu 18/10/2026. Đây là danh sách ban đầu, chưa bao phủ mọi điểm du lịch.
- `currentProvince` ánh xạ đủ 34 tên hiện hành theo [thông tin Chính phủ](https://xaydungchinhsach.chinhphu.vn/chi-tiet-34-don-vi-hanh-chinh-cap-tinh-tu-12-6-2025-119250612141845533.htm). Đây là thông tin hành chính, không thay ghim xuất phát/điểm đến hay mở rộng lịch sang mọi khu vực sau sáp nhập.

## Cách sử dụng

Khi không chỉ định điểm tham quan, backend lấy danh sách có nguồn của B và chỉ gửi danh sách đó cho model. Không cần Overpass để chọn điểm mặc định. Khi B là tên cũ, giữ phạm vi cũ: Hà Giang không bị đổi thành trung tâm Tuyên Quang; Hải Dương không tự lấy các điểm nội đô Hải Phòng. Với tên hiện hành trùng tên cũ, danh sách ban đầu ưu tiên cụm du lịch mang tên đó. Không tự ghép hết điểm trên toàn tỉnh mở rộng.

Tên không dấu, tiền tố tỉnh/thành phố và các bí danh phổ biến được nhận diện. Địa chỉ có cả tên cũ và tên tỉnh mới ưu tiên khu vực cũ cụ thể hơn; hai khu vực không liên quan không tự chọn theo thứ tự dữ liệu. Đà Lạt/Mộc Châu/Cát Bà có danh sách riêng khi được chọn trực tiếp.

Yêu cầu điểm cụ thể hoặc bỏ điểm vẫn được giữ. Điểm ngoài catalog cần tra cứu bản đồ trong ranh giới phù hợp; không đủ dữ liệu thì báo lỗi thay vì đổi sang điểm khác. Catalog không loại bỏ các giới hạn của dịch vụ geocoding/Overpass public.

Địa chỉ bản đồ ghi tỉnh mới chỉ được chấp nhận cho khu vực cũ khi tên điểm trùng chính xác một điểm trong catalog và loại POI phù hợp. Bộ lọc lãnh thổ Việt Nam và bước đối chiếu ghim vẫn áp dụng. Nguồn dưới đây chứng minh tên/khu vực, không chứng minh tọa độ, giờ mở cửa, giá vé, đường xe máy hoặc khả năng ghép tất cả điểm vào một ngày. Không nhập giá cũ từ bài viết vào dự toán.

Không cần migration hay import vào Supabase cho catalog này. Dữ liệu được đóng gói cùng mã frontend/backend; bản đang chạy chỉ nhận thay đổi sau khi deploy.

## Nguồn theo khu vực

Các trang của Cục Du lịch Quốc gia Việt Nam/Vietnam Tourism và cổng thông tin địa phương được dùng để đối chiếu tên. Một số bài viết dùng địa giới cũ; đối chiếu địa giới hiện hành qua nguồn Chính phủ phía trên. Ngày đối chiếu không phải ngày xác nhận cơ sở đang mở cửa.

| Khu vực du lịch | Tỉnh/thành hiện hành | Điểm trong danh sách | Nguồn |
| --- | --- | --- | --- |
| An Giang | An Giang | Miếu Bà Chúa Xứ núi Sam; Rừng tràm Trà Sư; Núi Cấm | [Tham khảo](https://vietnamtourism.vn/index.php/news/items/28534) |
| Bà Rịa - Vũng Tàu | Hồ Chí Minh | Bãi Sau Vũng Tàu; Bạch Dinh; Tượng Chúa Kitô Vua | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2119/4) |
| Bạc Liêu | Cà Mau | Nhà công tử Bạc Liêu; Vườn chim Bạc Liêu; Chùa Xiêm Cán | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/1187) |
| Bắc Giang | Bắc Ninh | Chùa Vĩnh Nghiêm; Chùa Thượng Tây Yên Tử | [Tham khảo](https://vietnamtourism.gov.vn/post/28210) |
| Bắc Kạn | Thái Nguyên | Hồ Ba Bể; Động Puông; Thác Đầu Đẳng | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/1285/) |
| Bắc Ninh | Bắc Ninh | Chùa Dâu; Đền Đô; Chùa Bút Tháp | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/1432/3) |
| Bến Tre | Vĩnh Long | Cồn Phụng; Khu lăng mộ Nguyễn Đình Chiểu | [Tham khảo](https://vietnamtourism.vn/index.php/news/items/9867) |
| Bình Dương | Hồ Chí Minh | Chùa Hội Khánh; Chùa Bà Thiên Hậu Bình Dương; Núi Châu Thới | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2881) |
| Bình Định | Gia Lai | Tháp Đôi Quy Nhơn; Ghềnh Ráng Tiên Sa; Tháp Bánh Ít | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2063) |
| Bình Phước | Đồng Nai | Vườn quốc gia Bù Gia Mập; Trảng cỏ Bàu Lạch; Hồ Suối Lam | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2706) |
| Bình Thuận | Lâm Đồng | Đồi cát Mũi Né; Tháp Pô Sah Inư; Trường Dục Thanh | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2703) |
| Cà Mau | Cà Mau | Vườn quốc gia U Minh Hạ; Vườn quốc gia Mũi Cà Mau | [Tham khảo](https://vietnamtourism.vn/index.php/news/items/25579) |
| Cao Bằng | Cao Bằng | Thác Bản Giốc; Động Ngườm Ngao; Khu di tích Pác Bó | [Tham khảo](https://vietnam.travel/node/606) |
| Cát Bà | Hải Phòng | Vườn quốc gia Cát Bà; Động Trung Trang; Bãi biển Cát Cò | [Tham khảo](https://www.vietnam.travel/things-to-do/things-do-north-vietnam) |
| Cần Thơ | Cần Thơ | Chợ nổi Cái Răng; Nhà cổ Bình Thủy; Bến Ninh Kiều | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/1288) |
| Đà Lạt | Lâm Đồng | Hồ Xuân Hương; Chùa Linh Phước; Hồ Tuyền Lâm | [Tham khảo](https://vietnam.travel/index.php/vi/places-to-go/central-vietnam/dalat) |
| Đà Nẵng | Đà Nẵng | Ngũ Hành Sơn; Bãi biển Mỹ Khê; Bán đảo Sơn Trà | [Tham khảo](https://vietnam.travel/places-to-go/south-central-coast-central-highlands/da-nang) |
| Đắk Lắk | Đắk Lắk | Hồ Lắk; Chùa Khải Đoan | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2182/3) |
| Đắk Nông | Lâm Đồng | Hồ Tà Đùng; Thác Liêng Nung; Chùa Pháp Hoa Gia Nghĩa | [Tham khảo](https://vietnamtourism.vn/index.php/news/items/21815) |
| Điện Biên | Điện Biên | Đồi A1; Hầm chỉ huy tướng Đờ Cát; Tượng đài chiến thắng Điện Biên Phủ | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2068) |
| Đồng Nai | Đồng Nai | Vườn quốc gia Cát Tiên; Bàu Sấu | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2881) |
| Đồng Tháp | Đồng Tháp | Vườn quốc gia Tràm Chim; Làng hoa Sa Đéc; Khu di tích Gò Tháp | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/815/) |
| Gia Lai | Gia Lai | Biển Hồ Pleiku; Núi lửa Chư Đăng Ya | [Tham khảo](https://dantoc.vietnamtourism.gov.vn/bien-ho-chu-dang-ya-vien-ngoc-xanh-giua-dai-ngan-tay-nguyen/) |
| Hà Giang | Tuyên Quang | Cổng trời Quản Bạ; Phố cổ Đồng Văn; Cột cờ Lũng Cú; Đèo Mã Pí Lèng | [Tham khảo](https://www.vietnam.travel/vi/node/1641) |
| Hà Nam | Ninh Bình | Khu du lịch Tam Chúc; Chùa Bà Đanh | [Tham khảo](https://nongthon.vietnamtourism.gov.vn/ung-von-cho-da-khu-du-lich-tam-chuc-ha-nam/) |
| Hà Nội | Hà Nội | Hồ Hoàn Kiếm; Phố cổ Hà Nội; Bảo tàng Mỹ thuật Việt Nam | [Tham khảo](https://vietnam.travel/places-to-go/northern-vietnam/ha-noi) |
| Hà Tĩnh | Hà Tĩnh | Ngã ba Đồng Lộc; Bãi biển Thiên Cầm | [Tham khảo](https://vietnamtourism.vn/index.php/news/items/9656) |
| Hải Dương | Hải Phòng | Khu di tích Côn Sơn; Đền Kiếp Bạc; Văn miếu Mao Điền | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/1208/3) |
| Hải Phòng | Hải Phòng | Nhà hát lớn Hải Phòng; Hồ Tam Bạc; Bảo tàng Hải Phòng; Bãi biển Đồ Sơn; Tháp Tường Long; Vườn quốc gia Cát Bà; Động Trung Trang; Bãi biển Cát Cò | [Tham khảo](https://hatay.haiphong.gov.vn/di-san-van-hoa-78115/kham-pha-canh-dep-hai-phong-nam-2026-964803) |
| Hậu Giang | Cần Thơ | Khu bảo tồn thiên nhiên Lung Ngọc Hoàng; Kênh Xà No | [Tham khảo](https://vietnamtourism.gov.vn/post/40583) |
| Hòa Bình | Phú Thọ | Nhà máy thủy điện Hòa Bình; Bản Lác; Thung Nai | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2223) |
| Hồ Chí Minh | Hồ Chí Minh | Dinh Độc Lập; Bảo tàng Chứng tích Chiến tranh; Địa đạo Củ Chi | [Tham khảo](https://vietnam.travel/node/137) |
| Huế | Huế | Đại Nội Huế; Chùa Thiên Mụ; Chùa Từ Hiếu | [Tham khảo](https://vietnam.travel/places-to-go/north-central-coast/hue) |
| Hưng Yên | Hưng Yên | Chùa Chuông; Văn miếu Xích Đằng; Đền Mẫu Phố Hiến | [Tham khảo](https://vietnamtourism.vn/index.php/news/items/15256) |
| Khánh Hòa | Khánh Hòa | Tháp Bà Ponagar; Chùa Long Sơn | [Tham khảo](https://vietnam.travel/node/220) |
| Kiên Giang | An Giang | Thạch Động Hà Tiên; Bãi biển Mũi Nai; Lăng Mạc Cửu | [Tham khảo](https://dulich.angiang.gov.vn/page/gioi-thieu-khai-quat-ve-tinh-kien-giang) |
| Kon Tum | Quảng Ngãi | Nhà thờ gỗ Kon Tum; Khu du lịch Măng Đen | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2834) |
| Lai Châu | Lai Châu | Động Pu Sam Cáp; Cao nguyên Sìn Hồ | [Tham khảo](https://nongthon.vietnamtourism.gov.vn/den-voi-mien-dat-huyen-bi-lai-chau/) |
| Lạng Sơn | Lạng Sơn | Động Tam Thanh; Động Nhị Thanh; Núi Tô Thị; Thành nhà Mạc | [Tham khảo](https://tamthanh.langson.gov.vn/gioi-thieu/di-tich-danh-thang) |
| Lào Cai | Lào Cai | Núi Fansipan; Bản Cát Cát; Thác Tình Yêu | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/533/5) |
| Lâm Đồng | Lâm Đồng | Hồ Xuân Hương; Chùa Linh Phước; Hồ Tuyền Lâm | [Tham khảo](https://vietnam.travel/index.php/vi/places-to-go/central-vietnam/dalat) |
| Long An | Tây Ninh | Làng nổi Tân Lập; Nhà cổ Trăm Cột | [Tham khảo](https://dulich.longan.gov.vn/tin-tuc/ket-noi-tour-diem-khoi-day-tiem-nang-du-lich-long-an-193) |
| Mộc Châu | Sơn La | Thác Dải Yếm; Đồi chè Mộc Châu | [Tham khảo](https://www.vietnam.travel/things-to-do/moc-chau-your-one-stop-nature-escape) |
| Nam Định | Ninh Bình | Đền Trần Nam Định; Phủ Dầy; Chùa Cổ Lễ | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2837/1) |
| Nghệ An | Nghệ An | Khu di tích Kim Liên; Bãi biển Cửa Lò | [Tham khảo](https://vietnamtourism.gov.vn/en/post/13787) |
| Ninh Bình | Ninh Bình | Tràng An; Tam Cốc; Hang Múa; Chùa Bái Đính; Chùa Bích Động; Vườn quốc gia Cúc Phương | [Tham khảo](https://vietnam.travel/things-to-do/10-must-do-activities-ninh-binh) |
| Ninh Thuận | Khánh Hòa | Tháp Po Klong Garai; Vịnh Vĩnh Hy; Vườn quốc gia Núi Chúa | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/1295) |
| Phú Thọ | Phú Thọ | Khu di tích Đền Hùng; Vườn quốc gia Xuân Sơn | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/1367/2) |
| Phú Yên | Đắk Lắk | Gành Đá Đĩa; Tháp Nhạn; Bãi Môn - Mũi Điện | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2930) |
| Quảng Bình | Quảng Trị | Động Thiên Đường; Vườn quốc gia Phong Nha - Kẻ Bàng | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2917/2) |
| Quảng Nam | Đà Nẵng | Phố cổ Hội An; Thánh địa Mỹ Sơn | [Tham khảo](https://2025.vietnam.travel/en/quang-nam-launches-hoi-an-my-son-dong-giang-heaven-gate-tourism-route/) |
| Quảng Ngãi | Quảng Ngãi | Đảo Lý Sơn; Khu chứng tích Sơn Mỹ; Chùa Thiên Ấn | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/1275) |
| Quảng Ninh | Quảng Ninh | Vịnh Hạ Long; Hang Sửng Sốt; Động Mê Cung | [Tham khảo](https://vietnam.travel/node/1368) |
| Quảng Trị | Quảng Trị | Thành cổ Quảng Trị; Địa đạo Vịnh Mốc; Cầu Hiền Lương | [Tham khảo](https://vietnamtourism.gov.vn/post/45986) |
| Sóc Trăng | Cần Thơ | Chùa Dơi; Chùa Đất Sét; Chùa Chén Kiểu | [Tham khảo](https://vietnamtourism.vn/index.php/about/provinces/8479) |
| Sơn La | Sơn La | Nhà tù Sơn La; Thác Dải Yếm; Đồi chè Mộc Châu | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2229) |
| Tây Ninh | Tây Ninh | Tòa thánh Cao Đài Tây Ninh; Núi Bà Đen | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/1341) |
| Thái Bình | Hưng Yên | Chùa Keo Thái Bình; Khu di tích các vua Trần Thái Bình; Đền Đồng Bằng | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/1353/2) |
| Thái Nguyên | Thái Nguyên | Hồ Núi Cốc; ATK Định Hóa | [Tham khảo](https://vietnamtourism.gov.vn/post/67687) |
| Thanh Hóa | Thanh Hóa | Thành nhà Hồ; Khu di tích Lam Kinh | [Tham khảo](https://vietnamtourism.vn/index.php/about/provinces/8437) |
| Tiền Giang | Đồng Tháp | Chùa Vĩnh Tràng; Cù lao Thới Sơn; Chợ nổi Cái Bè | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2737) |
| Trà Vinh | Vĩnh Long | Ao Bà Om; Chùa Âng; Bãi biển Ba Động | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/1395) |
| Tuyên Quang | Tuyên Quang | Khu di tích Tân Trào; Khu du lịch sinh thái Na Hang; Thác Mơ Na Hang | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2605) |
| Vĩnh Long | Vĩnh Long | Văn Thánh Miếu Vĩnh Long; Làng gạch Mang Thít | [Tham khảo](https://nongthon.vietnamtourism.gov.vn/mot-so-diem-du-lich-hap-dan-tai-vinh-long/) |
| Vĩnh Phúc | Phú Thọ | Khu danh thắng Tây Thiên; Tháp Bình Sơn; Hồ Đại Lải | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/2747) |
| Yên Bái | Lào Cai | Ruộng bậc thang Mù Cang Chải; Hồ Thác Bà | [Tham khảo](https://vietnamtourism.vn/index.php/tourism/items/1293) |
