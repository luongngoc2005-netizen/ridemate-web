import { createPlaceAccumulator } from './places-data.js';

const abortError = () => new DOMException('Aborted', 'AbortError');
const defaultWorker = () => typeof Worker === 'undefined' ? null : new Worker(new URL('./places.worker.js', import.meta.url), { type: 'module' });

// One processor per route: geometry is cloned once, subsequent messages contain
// only new segments. If workers are unavailable, yield between small batches.
export function createPlaceProcessor(coordinates, signal, workerFactory = defaultWorker) {
  let worker, pending, sequence = 0, disposed = false, fallback, history = [];
  try { worker = workerFactory(); } catch { /* CSP/unsupported workers use fallback. */ }
  const stopWorker = error => {
    worker?.terminate(); worker = null;
    if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = null; }
  };
  if (worker) {
    worker.onmessage = ({ data }) => {
      if (!pending || data.id !== pending.id) return;
      const request = pending; pending = null; clearTimeout(request.timer);
      if (data.error) request.reject(new Error(data.error)); else request.resolve(data.places);
    };
    worker.onerror = event => { event.preventDefault?.(); stopWorker(new Error('Place worker failed')); };
    worker.onmessageerror = () => stopWorker(new Error('Invalid place worker message'));
  }
  const dispose = () => {
    disposed = true; stopWorker(abortError()); history = [];
    signal?.removeEventListener('abort', dispose);
  };
  signal?.addEventListener('abort', dispose, { once: true });
  if (signal?.aborted) dispose();
  const check = () => { if (disposed || signal?.aborted) throw abortError(); };
  const addFallback = async elements => {
    let started = performance.now();
    for (const element of elements) {
      check(); fallback.add([element]);
      if (performance.now() - started >= 8) {
        await new Promise(resolve => setTimeout(resolve, 0));
        check(); started = performance.now();
      }
    }
  };
  return {
    async add(elements) {
      check();
      if (worker) {
        history.push(elements);
        try {
          return await new Promise((resolve, reject) => {
            const id = ++sequence;
            pending = { id, resolve, reject, timer: setTimeout(() => stopWorker(new Error('Place worker timed out')), 30000) };
            worker.postMessage({ id, elements, ...(id === 1 ? { coordinates } : {}) });
          });
        } catch (error) {
          check(); stopWorker(error);
          // Replay successful segments too, so a worker failure cannot lose pins.
          fallback = createPlaceAccumulator(coordinates);
          for (const batch of history) await addFallback(batch);
          history = [];
          return fallback.snapshot();
        }
      }
      if (!fallback) {
        fallback = createPlaceAccumulator(coordinates);
        for (const batch of history) await addFallback(batch);
        history = [];
      }
      await addFallback(elements); check();
      return fallback.snapshot();
    },
    dispose,
  };
}
