import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {quoteStay,availableRooms,confirmDemoBooking,bookingMismatch,tripWithStays,normalizeRequest} from '../src/stays/booking-data.js';
import {createLocalBookings} from '../src/stays/booking-store.js';
import {hotels} from '../src/stays/catalog.js';
const input={roomId:'hg-hill-double',checkIn:'2099-01-10',checkOut:'2099-01-12',rooms:2,guests:4,contact:{name:'Demo Guest',email:'demo@example.com',phone:'0900000000'}};
test('quotes validate dates, capacity and recalculate totals',()=>{
  assert.deepEqual(quoteStay(input.roomId,input.checkIn,input.checkOut,2,4),{nights:2,nightRate:320000,total:1280000});
  for(const dates of [['2099-02-30','2099-03-02'],['2099-01-12','2099-01-10'],['2099-01-10','2099-01-10'],['2099-01-10','2099-03-10']])assert.throws(()=>quoteStay(input.roomId,...dates,1,2));
  assert.throws(()=>quoteStay(input.roomId,input.checkIn,input.checkOut,1,3));
  const b=confirmDemoBooking([],randomUUID(),{...input,total:1});assert.equal(b.total,1280000);
  assert.equal(availableRooms(input.roomId,'2099-01-12','2099-01-13',[b]),3);
  assert.equal(availableRooms(input.roomId,'2099-01-11','2099-01-13',[b]),1);
  assert.throws(()=>confirmDemoBooking([],randomUUID(),{...input,roomId:'dv-cloud-double'}));
});
test('local transactions prevent overselling and duplicate confirmation, cancellation releases rooms',async()=>{
  const factory=new IDBFactory(),a=createLocalBookings(factory),b=createLocalBookings(factory),id=randomUUID();
  const repeated=await Promise.all([a.book(id,input),b.book(id,input)]);assert.equal(repeated[0].id,repeated[1].id);
  assert.equal((await a.list()).length,1);
  await assert.rejects(a.book(id,{...input,guests:3}));
  await a.cancel(id);
  const results=await Promise.allSettled([a.book(randomUUID(),input),b.book(randomUUID(),input)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await a.list()).filter(b=>b.status==='confirmed').length,1);
  assert.equal((await a.book(id,input)).status,'cancelled');
});
test('linked stays are derived pins, disappear on cancellation and warn on changed trip dates',()=>{
  const trip={id:'trip1',date:input.checkIn,days:3,itinerary:[{id:'d1',places:[]},{id:'d2',places:[]},{id:'d3',places:[]}]};
  const b=confirmDemoBooking([],randomUUID(),{...input,tripId:trip.id,tripDate:trip.date,tripDayId:'d1'});
  assert.equal(bookingMismatch(b,trip),false);
  assert.deepEqual(tripWithStays(trip,[b]).itinerary.map(d=>d.places.length),[1,1,0]);
  assert.equal(trip.itinerary[0].places.length,0);
  assert.equal(tripWithStays(trip,[{...b,status:'cancelled'}]).itinerary[0].places.length,0);
  assert.equal(bookingMismatch(b,{...trip,date:'2099-01-11'}),true);
  assert.equal(tripWithStays({...trip,date:'2099-01-11'},[b]).itinerary[0].places.length,0);
});
test('booking SQL enforces ownership, canonical prices, stock, retries and cancellation',async()=>{
  const db=new PGlite(),alice=randomUUID(),bob=randomUUID(),id=randomUUID(),request=normalizeRequest(input);
  try {
    await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;insert into auth.users values('${alice}'),('${bob}');`);
    await db.exec(await readFile(new URL('../supabase/migrations/202609270001_demo_bookings.sql',import.meta.url),'utf8'));
    const login=async user=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec(`set role ${user?'authenticated':'anon'}`)};
    const book=async(user,rid,req=request)=>(await db.query('select public.book_demo_stay($1::uuid,$2::uuid,$3::jsonb) as b',[user,rid,JSON.stringify(req)])).rows[0].b;
    const cancel=async(user,rid)=>(await db.query('select public.cancel_demo_stay($1::uuid,$2::uuid) as b',[user,rid])).rows[0].b;
    await login(null);await assert.rejects(book(alice,id),/permission denied/);
    await login(alice);
    const catalog=(await db.query('select * from public.demo_room_catalog')).rows;
    for(const h of hotels)for(const r of h.rooms){const actual=catalog.find(x=>x.id===r.id);assert.equal(actual.night_rate,r.price);assert.equal(actual.stock,r.stock);assert.equal(actual.capacity,r.capacity)}
    await assert.rejects(book(bob,id),/Account changed/);
    const booking=await book(alice,id,{...request,total:1});assert.equal(booking.total,1280000);
    assert.equal((await book(alice,id,{...request,total:1})).id,id);
    await assert.rejects(book(alice,id,{...request,guests:3}));
    await assert.rejects(book(alice,randomUUID()));
    await assert.rejects(db.exec('delete from public.demo_bookings'),/permission denied/);
    await login(bob);assert.equal((await db.query('select * from public.demo_bookings')).rows.length,0);
    await assert.rejects(cancel(bob,id));
    await book(bob,randomUUID());
    await login(alice);assert.equal((await cancel(alice,id)).status,'cancelled');
    // Setup can be safely retried without losing existing reservations.
    await db.exec('reset role');
    await db.exec(await readFile(new URL('../supabase/migrations/202609270001_demo_bookings.sql',import.meta.url),'utf8'));
    await login(alice);
    assert.equal((await db.query('select payload from public.demo_bookings where id=$1',[id])).rows[0].payload.status,'cancelled');
    await book(alice,randomUUID());
    await book(alice,randomUUID(),{...request,checkIn:'2099-01-12',checkOut:'2099-01-13'});
    await assert.rejects(book(alice,randomUUID(),{...request,guests:10}));
    await assert.rejects(book(alice,randomUUID(),{...request,checkOut:request.checkIn}));
  }finally{await db.close()}
});
