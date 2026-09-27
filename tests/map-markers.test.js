import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePlaceMarkers, clearPlaceMarkers } from '../src/map-markers.js';

test('Progressive updates keep the same open marker; hiding a category removes it', () => {
  const records = new Map(); let created = 0;
  const create = place => {
    created++;
    const popup = { open: false, isOpen() { return this.open; } };
    return { place, marker: { removed: false, getPopup: () => popup, remove() { this.removed = true; popup.open = false; } } };
  };
  const update = (record, place) => { record.place = place; };
  const a = { id: 'a', type: 'food', coordinates: [105, 21] }, b = { ...a, id: 'b' };
  const sync = (places, visible = { food: true }) => reconcilePlaceMarkers(records, places, visible, create, update);
  sync([a]); const original = records.get('a'); original.marker.getPopup().open = true;
  sync([{ ...a }, b]);
  assert.equal(records.get('a'), original); assert.equal(created, 2); assert.equal(original.marker.getPopup().isOpen(), true);
  // A new distribution may omit the selected pin; its popup must survive.
  sync([b]); assert.equal(records.get('a'), original); assert.equal(original.retained, true);
  sync([a, b], {}); assert.equal(records.size, 0); assert.equal(original.marker.removed, true);
  sync([a, b]); clearPlaceMarkers(records); assert.equal(records.size, 0);
});
