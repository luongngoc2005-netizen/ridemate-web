const pages = new Set(['home', 'plans', 'create', 'edit', 'trip', 'checklist', 'stays', 'tools', 'ai', 'account', 'journal']);
export function createNavigationStore(browser) {
  const defaults = new Map(), listeners = new Set(), frames = new Map();
  let state = {}, index = browser.history.state?.rideMateNavigation?.index || 0, pending = null, queued = false, blocked = 0;
  const params = new URLSearchParams(browser.location.search);
  if (pages.has(params.get('page'))) {
    state = { page: params.get('page'), activeId: params.get('trip') || null, view: ['overview', 'itinerary', 'notes'].includes(params.get('view')) ? params.get('view') : 'overview' };
  }
  if (state.activeId && params.has('phase')) state[`riding.${state.activeId}`] = params.get('phase') === 'ride';
  const url = value => {
    const target = new URL(browser.location.href);
    target.searchParams.set('page', value.page || 'home');
    for (const [param, key] of [['trip', 'activeId'], ['view', 'view']]) {
      if (value[key]) target.searchParams.set(param, value[key]); else target.searchParams.delete(param);
    }
    if (value.activeId && value.page === 'trip') target.searchParams.set('phase', value[`riding.${value.activeId}`] ? 'ride' : 'prepare');
    else target.searchParams.delete('phase');
    return target.href;
  };
  // Keep drafts/photos in memory, not in URLs or the browser's history payload.
  const payload = () => ({ ...browser.history.state, rideMateNavigation: { index } });
  frames.set(index, state);
  browser.history.replaceState(payload(), '', url(state));
  const notify = () => listeners.forEach(fn => fn());
  const flush = () => {
    queued = false;
    if (!pending) return;
    const next = pending; pending = null;
    if (Object.keys(next.state).every(key => Object.is(next.state[key], state[key]))) return;
    state = next.state;
    if (!next.replace) { for (const key of frames.keys()) if (key > index) frames.delete(key); index++; }
    frames.set(index, state);
    browser.history[next.replace ? 'replaceState' : 'pushState'](payload(), '', url(state));
    notify();
  };
  browser.addEventListener('popstate', event => {
    const target = event.state?.rideMateNavigation?.index;
    if (!Number.isInteger(target)) return;
    if (blocked && target !== index) { browser.history.go(index - target); return; }
    pending = null; index = target;
    const query = new URLSearchParams(browser.location.search);
    state = frames.get(target) || { page: pages.has(query.get('page')) ? query.get('page') : 'home', activeId: query.get('trip') || null, view: ['overview', 'itinerary', 'notes'].includes(query.get('view')) ? query.get('view') : 'overview' };
    if (!frames.has(target) && state.activeId && query.has('phase')) state[`riding.${state.activeId}`] = query.get('phase') === 'ride';
    frames.set(target, state); notify();
    browser.scrollTo({ top: 0, behavior: 'instant' });
  });
  return {
    register(key, value) { if (!defaults.has(key)) defaults.set(key, value); },
    get(key) { return Object.hasOwn(state, key) ? state[key] : defaults.get(key); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    block() { blocked++; return () => { blocked--; }; },
    set(key, value, { replace = false } = {}) {
      if (blocked && !replace) return;
      const base = pending?.state || { ...Object.fromEntries(defaults), ...state };
      const resolved = typeof value === 'function' ? value(base[key]) : value;
      if (Object.is(base[key], resolved)) return;
      pending = { state: { ...base, [key]: resolved }, replace: pending ? pending.replace && replace : replace };
      if (!queued) { queued = true; queueMicrotask(flush); }
    },
  };
}
