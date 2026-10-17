import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createNavigationStore } from './navigation-store.js';

const navigation = createNavigationStore(window);
export function useNavigationState(key, initial) {
  const fallback = useMemo(() => typeof initial === 'function' ? initial() : initial, [key]);
  navigation.register(key, fallback);
  const value = useSyncExternalStore(navigation.subscribe, () => navigation.get(key));
  const set = useMemo(() => (next, options) => navigation.set(key, next, options), [key]);
  return [value, set];
}
export function useNavigationBlock(blocked) {
  useEffect(() => blocked ? navigation.block() : undefined, [blocked]);
}
