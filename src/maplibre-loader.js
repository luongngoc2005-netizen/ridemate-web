// Vite's dynamic worker URL import is a module with a default string export.
// Bundle the worker from the installed MapLibre version instead of a separate CDN.
export function createMapLibraryLoader({library, worker, stylesheet}) {
  let pending;
  return () => {
    if (!pending) {
      pending = Promise.all([library(), worker(), stylesheet()]).then(([module, workerModule]) => {
        const maplibre = module.default ?? module;
        if (typeof workerModule.default !== 'string' || !workerModule.default) throw new Error('Map worker URL is missing');
        maplibre.setWorkerUrl(workerModule.default);
        return maplibre;
      }).catch(error => { pending = null; throw error; });
    }
    return pending;
  };
}

export const loadMapLibrary = createMapLibraryLoader({
  library: () => import('maplibre-gl'),
  worker: () => import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
  stylesheet: () => import('maplibre-gl/dist/maplibre-gl.css'),
});
