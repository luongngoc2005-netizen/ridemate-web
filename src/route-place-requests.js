import { supportTypes } from './places-data.js';

export function requestedPlaceTypes(value) {
  const types = value === true ? Object.keys(supportTypes) : Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return [...new Set(types.filter(type => Object.hasOwn(supportTypes, type)))].sort();
}

// Independent jobs keep a newly selected category from cancelling another.
export function createRoutePlaceRequests(load, onUpdate) {
  const jobs = new Map(); let currentRoute = null;
  const dispose = () => { for (const job of jobs.values()) job.controller.abort(); jobs.clear(); currentRoute = null; };
  const emit = (type, job, status) => {
    if (job.controller.signal.aborted || jobs.get(type) !== job) return;
    job.status = status; onUpdate(job.route, type, status);
  };
  return {
    dispose,
    sync(route, categories, attempt = 0) {
      if (route !== currentRoute) { dispose(); currentRoute = route; }
      const wanted = requestedPlaceTypes(categories);
      for (const [type, job] of jobs) if (!wanted.includes(type) && (!job.status.ready || job.status.error)) {
        job.controller.abort(); jobs.delete(type);
        onUpdate(job.route, type, { ...job.status, loading: false, error: '', ready: false });
      }
      if (!route) return;
      for (const type of wanted) {
        const prior = jobs.get(type);
        if (prior && (prior.status.loading || (prior.status.ready && !prior.status.error) || prior.attempt === attempt)) continue;
        const job = { route, attempt, controller: new AbortController() };
        jobs.set(type, job);
        emit(type, job, { items: prior?.status.items || [], loading: true, ready: false, error: '', progress: '' });
        Promise.resolve().then(() => {
          job.controller.signal.throwIfAborted();
          return load(route, type, job.controller.signal, result => emit(type, job, {
            items: result.places, loading: true, ready: false, error: '', progress: `${result.completed}/${result.total} đoạn đã tải`,
          }));
        }).then(result => emit(type, job, {
          items: result.places, loading: false, ready: true, progress: '',
          error: result.failed ? `${result.failed}/${result.total} đoạn chưa tải được. Bấm thử lại để tải phần còn thiếu.` : '',
        })).catch(error => emit(type, job, { ...job.status, loading: false, ready: false, error: error.message }));
      }
    },
  };
}
