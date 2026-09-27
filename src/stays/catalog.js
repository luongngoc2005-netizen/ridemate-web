const photos = [
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1000&q=80',
  'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1000&q=80',
  'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1000&q=80',
];
export const stayAreas = ['Hà Nội', 'Hà Giang', 'Đồng Văn', 'Mèo Vạc'];
const seeds = [
  ['hn-garden','Nhà Vườn Phố','Hà Nội',[105.848,21.032],420000,'Khách sạn','Một khoảng nghỉ yên tĩnh trước khi bắt đầu cung đường.'],
  ['hn-river','Bến Sông Stay','Hà Nội',[105.855,21.044],350000,'Homestay','Không gian ấm cúng dành cho nhóm bạn lên đường sớm.'],
  ['hg-hill','Hiên Đồi Stay','Hà Giang',[104.983,22.823],320000,'Homestay','Dừng chân ở thành phố, chuẩn bị cho hành trình cao nguyên đá.'],
  ['hg-green','Nhà Xanh Hà Giang','Hà Giang',[104.976,22.829],460000,'Khách sạn','Phòng riêng thoải mái, thuận tiện cho một đêm nghỉ giữa chuyến.'],
  ['dv-stone','Nhà Đá Đồng Văn','Đồng Văn',[105.361,23.279],380000,'Homestay','Một đêm chậm rãi giữa khung cảnh núi đá và phố nhỏ.'],
  ['dv-cloud','Hiên Mây Lodge','Đồng Văn',[105.358,23.275],540000,'Lodge','Chỗ nghỉ dành cho những buổi sáng thong thả trên cao nguyên.'],
  ['mv-valley','Thung Lũng Stay','Mèo Vạc',[105.407,23.165],340000,'Homestay','Không gian giản dị để nghỉ ngơi sau một ngày qua đèo.'],
  ['mv-mountain','Nhà Bên Núi','Mèo Vạc',[105.41,23.161],490000,'Lodge','Phòng cho nhóm nhỏ, cùng lên kế hoạch cho chặng tiếp theo.'],
];
export const hotels = seeds.map(([id,name,area,coordinates,price,kind,description],i)=>({
  id,name,area,coordinates,kind,description,photos,image:photos[i%photos.length],
  address:`Vị trí minh họa tại ${area}, Việt Nam`,
  amenities:['Wi-Fi','Chỗ gửi xe máy',...(i%2===0?['Nhận phòng muộn']:['Bữa sáng']),...(i%3===0?['Phòng nhóm']:[])],
  checkInTime:'14:00',checkOutTime:'12:00',
  rooms:[
    {id:`${id}-double`,name:'Phòng đôi',capacity:2,price,stock:i===5?0:3,bed:'1 giường đôi'},
    {id:`${id}-family`,name:'Phòng gia đình',capacity:4,price:price+240000,stock:2,bed:'2 giường đôi'},
  ],
}));
export const hotelById = id => hotels.find(hotel=>hotel.id===id);
export const roomById = id => hotels.flatMap(hotel=>hotel.rooms.map(room=>({...room,hotel}))).find(room=>room.id===id);
export const money = value => `${Number(value).toLocaleString('vi-VN')} ₫`;
