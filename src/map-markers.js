import { validPoint } from './places-data.js';

// Keep existing marker/popup instances across progressive place updates.
export function reconcilePlaceMarkers(records, places, visible, create, update) {
  const wanted = new Set();
  for (const place of places) {
    if (!visible[place.type] || !validPoint(place.coordinates)) continue;
    wanted.add(place.id);
    let record = records.get(place.id);
    if (!record) { record = create(place); records.set(place.id, record); }
    record.retained = false;
    update(record, place);
  }
  for (const [id, record] of records) {
    if (wanted.has(id)) continue;
    // Distribution may displace a pin at the 30/type cap. Keep an open popup
    // until it closes, but always honor an explicit category hide.
    if (visible[record.place.type] && record.marker.getPopup().isOpen()) { record.retained = true; continue; }
    record.marker.remove(); records.delete(id);
  }
}

export function clearPlaceMarkers(records) {
  const previous = [...records.values()];
  records.clear();
  for (const { marker } of previous) marker.remove();
}
