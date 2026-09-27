import { createPlaceAccumulator } from './places-data.js';

let accumulator;
self.onmessage = ({ data }) => {
  try {
    if (data.coordinates) accumulator = createPlaceAccumulator(data.coordinates);
    accumulator.add(data.elements);
    self.postMessage({ id: data.id, places: accumulator.snapshot() });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
