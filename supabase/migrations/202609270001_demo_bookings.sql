-- Demo only: no payments, supplier integration or real reservations.
-- Inventory is isolated per account so different demo users cannot block one another.
begin;
create table if not exists public.demo_room_catalog (
  id text primary key, hotel_id text not null, hotel_name text not null,
  room_name text not null, night_rate integer not null check(night_rate>0),
  capacity integer not null check(capacity>0), stock integer not null check(stock>=0)
);
alter table public.demo_room_catalog enable row level security;
revoke all on public.demo_room_catalog from anon, authenticated;
grant select on public.demo_room_catalog to authenticated;
drop policy if exists "Read demo rooms" on public.demo_room_catalog;
create policy "Read demo rooms" on public.demo_room_catalog for select to authenticated using(true);
insert into public.demo_room_catalog values
('hn-garden-double','hn-garden','Nhà Vườn Phố','Phòng đôi',420000,2,3),
('hn-garden-family','hn-garden','Nhà Vườn Phố','Phòng gia đình',660000,4,2),
('hn-river-double','hn-river','Bến Sông Stay','Phòng đôi',350000,2,3),
('hn-river-family','hn-river','Bến Sông Stay','Phòng gia đình',590000,4,2),
('hg-hill-double','hg-hill','Hiên Đồi Stay','Phòng đôi',320000,2,3),
('hg-hill-family','hg-hill','Hiên Đồi Stay','Phòng gia đình',560000,4,2),
('hg-green-double','hg-green','Nhà Xanh Hà Giang','Phòng đôi',460000,2,3),
('hg-green-family','hg-green','Nhà Xanh Hà Giang','Phòng gia đình',700000,4,2),
('dv-stone-double','dv-stone','Nhà Đá Đồng Văn','Phòng đôi',380000,2,3),
('dv-stone-family','dv-stone','Nhà Đá Đồng Văn','Phòng gia đình',620000,4,2),
('dv-cloud-double','dv-cloud','Hiên Mây Lodge','Phòng đôi',540000,2,0),
('dv-cloud-family','dv-cloud','Hiên Mây Lodge','Phòng gia đình',780000,4,2),
('mv-valley-double','mv-valley','Thung Lũng Stay','Phòng đôi',340000,2,3),
('mv-valley-family','mv-valley','Thung Lũng Stay','Phòng gia đình',580000,4,2),
('mv-mountain-double','mv-mountain','Nhà Bên Núi','Phòng đôi',490000,2,3),
('mv-mountain-family','mv-mountain','Nhà Bên Núi','Phòng gia đình',730000,4,2)
on conflict(id) do update set hotel_id=excluded.hotel_id,hotel_name=excluded.hotel_name,room_name=excluded.room_name,night_rate=excluded.night_rate,capacity=excluded.capacity,stock=excluded.stock;

create table if not exists public.demo_bookings (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null, payload jsonb not null,
  primary key(user_id,id),
  constraint demo_booking_shape check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=12000)
);
alter table public.demo_bookings enable row level security;
revoke all on public.demo_bookings from anon, authenticated;
grant select on public.demo_bookings to authenticated;
drop policy if exists "Read own demo bookings" on public.demo_bookings;
create policy "Read own demo bookings" on public.demo_bookings for select to authenticated using((select auth.uid())=user_id);

create or replace function public.book_demo_stay(expected_user_id uuid, request_id uuid, new_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid := auth.uid(); prior jsonb; result jsonb;
  room public.demo_room_catalog%rowtype;
  check_in date; check_out date; room_count integer; guest_count integer; used integer; night date;
begin
  if owner_id is null or owner_id is distinct from expected_user_id then raise exception 'Account changed' using errcode='28000'; end if;
  if request_id is null or new_request is null or jsonb_typeof(new_request)<>'object' or octet_length(new_request::text)>8000 then raise exception 'Thông tin đặt phòng không hợp lệ.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  select payload into prior from public.demo_bookings where user_id=owner_id and id=request_id;
  if prior is not null then
    if prior->'request' is distinct from new_request then raise exception 'Yêu cầu này đã được xử lý với thông tin khác.'; end if;
    return prior;
  end if;
  select * into room from public.demo_room_catalog where id=new_request->>'roomId';
  if not found then raise exception 'Loại phòng không tồn tại.'; end if;
  check_in := (new_request->>'checkIn')::date; check_out := (new_request->>'checkOut')::date;
  room_count := (new_request->>'rooms')::integer; guest_count := (new_request->>'guests')::integer;
  if check_in is null or check_out is null or check_in<(now() at time zone 'Asia/Ho_Chi_Minh')::date or check_out-check_in not between 1 and 30 then raise exception 'Chọn ngày nhận phòng từ hôm nay và lưu trú từ 1 đến 30 đêm.'; end if;
  if room_count is null or guest_count is null or room_count not between 1 and 5 or guest_count not between 1 and 20 or guest_count>room_count*room.capacity then raise exception 'Số phòng hoặc số khách không phù hợp.'; end if;
  if coalesce(length(trim(new_request#>>'{contact,name}')),0) not between 2 and 100
    or coalesce(length(new_request#>>'{contact,email}'),0) not between 3 and 150
    or coalesce(new_request#>>'{contact,email}','') !~ '^\S+@\S+\.\S+$'
    or coalesce(new_request#>>'{contact,phone}','') !~ '^\+?[0-9 ()-]{8,20}$' then raise exception 'Kiểm tra thông tin liên hệ.'; end if;
  if new_request->>'tripId' is not null and (coalesce(length(new_request->>'tripId'),0) not between 1 and 200 or coalesce(length(new_request->>'tripDayId'),0) not between 1 and 200 or new_request->>'tripDate' is null) then raise exception 'Liên kết hành trình không hợp lệ.'; end if;
  for night in select d::date from generate_series(check_in::timestamp,(check_out-1)::timestamp,interval '1 day') d loop
    select coalesce(sum((payload->>'rooms')::integer),0) into used from public.demo_bookings
      where user_id=owner_id and payload->>'status'='confirmed' and payload->>'roomId'=room.id
      and (payload->>'checkIn')::date<=night and (payload->>'checkOut')::date>night;
    if used+room_count>room.stock then raise exception 'Phòng mẫu đã hết cho ngày này. Hãy chọn loại phòng hoặc ngày khác.'; end if;
  end loop;
  result := jsonb_build_object('id',request_id,'code','DEMO-'||upper(left(request_id::text,8)),
    'status','confirmed','demo',true,'roomId',room.id,'hotelId',room.hotel_id,'hotelName',room.hotel_name,'roomName',room.room_name,
    'checkIn',check_in::text,'checkOut',check_out::text,'rooms',room_count,'guests',guest_count,
    'nights',check_out-check_in,'nightRate',room.night_rate,'total',room.night_rate*(check_out-check_in)*room_count,
    'contact',new_request->'contact','tripId',new_request->'tripId','tripDayId',new_request->'tripDayId',
    'tripDate',new_request->'tripDate','tripLabel',new_request->'tripLabel','createdAt',now(),'request',new_request);
  insert into public.demo_bookings(user_id,id,payload) values(owner_id,request_id,result);
  return result;
end $$;
revoke all on function public.book_demo_stay(uuid,uuid,jsonb) from public, anon;
grant execute on function public.book_demo_stay(uuid,uuid,jsonb) to authenticated;

create or replace function public.cancel_demo_stay(expected_user_id uuid, booking_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); result jsonb;
begin
  if owner_id is null or owner_id is distinct from expected_user_id then raise exception 'Account changed' using errcode='28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  update public.demo_bookings set payload=payload||'{"status":"cancelled"}'::jsonb
    where user_id=owner_id and id=booking_id returning payload into result;
  if result is null then raise exception 'Không tìm thấy đơn.'; end if;
  return result;
end $$;
revoke all on function public.cancel_demo_stay(uuid,uuid) from public, anon;
grant execute on function public.cancel_demo_stay(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
