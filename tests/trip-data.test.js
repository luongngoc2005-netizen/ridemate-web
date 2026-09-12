import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrip, editTripDetails, initialDetails, suggestionsFor, dateRange, readTrip, saveTrip, STORAGE_KEY } from '../src/trip-data.js';

test('Schedules follow day count, destination and unique IDs', () => {
  for (const days of [1, 2, 4, 30]) {
    const trip = createTrip({ ...initialDetails, days });
    assert.equal(trip.itinerary.length, days);
    assert.equal(new Set(trip.itinerary.map(day => day.id)).size, days);
    assert.ok(trip.itinerary.some(day => day.places.length));
  }
  assert.ok(suggestionsFor('ha giang').places.includes('Cột cờ Lũng Cú'));
  const unknown = createTrip({ ...initialDetails, destination: 'Đà Lạt' });
  assert.ok(unknown.itinerary.every(day => !day.places.length && !day.title.includes('Đồng Văn')));
  for (const days of [0, -1, 31, 1.5, '', 'abc']) assert.throws(() => createTrip({ ...initialDetails, days }));
});
test('Editing dates and extending days preserves custom plan, notes and checklist', () => {
  const trip = createTrip(initialDetails);
  trip.itinerary[0].title = 'Chặng riêng của tôi';
  trip.itinerary[0].note = 'Nhận phòng sau 14h';
  trip.notes = 'Ngân sách riêng';
  trip.checklist[0].done = true;
  const edited = editTripDetails(trip, { ...trip, days: 6, date: '2026-12-30' });
  assert.deepEqual(edited.itinerary.slice(0, 4), trip.itinerary);
  assert.equal(edited.itinerary.length, 6);
  assert.equal(edited.notes, trip.notes);
  assert.equal(edited.checklist[0].done, true);
  assert.match(dateRange(edited), /2027/);
  const shorter = editTripDetails(edited, { ...edited, days: 2 });
  assert.deepEqual(shorter.itinerary, trip.itinerary.slice(0, 2));
});
test('Storage round-trip, corrupt data and denied storage', () => {
  const items = new Map();
  const storage = { getItem: key => items.get(key) || null, setItem: (key, value) => items.set(key, value) };
  assert.equal(readTrip(storage).trip, null);
  const trip = createTrip(initialDetails);
  trip.notes = 'Ghi chú nhiều dòng\nKhông bị mất khi tải lại';
  assert.equal(saveTrip(storage, trip), '');
  assert.deepEqual(readTrip(storage).trip, trip);
  items.set(STORAGE_KEY, '{bad json');
  assert.ok(readTrip(storage).error);
  assert.equal(items.get(STORAGE_KEY), '{bad json');
  items.set(STORAGE_KEY, JSON.stringify({ ...trip, itinerary: null }));
  assert.ok(readTrip(storage).error);
  assert.ok(saveTrip({ setItem() { throw new Error('quota'); } }, trip));
});
