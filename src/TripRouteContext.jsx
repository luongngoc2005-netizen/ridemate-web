import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { loadTripRoute, loadPlaces } from './route-data.js';
import { canLoadTripMap } from './trip-map-state.js';

const TripRouteContext = createContext(null);
const initial = { loading: true, route: null, places: [], placesLoading: false, error: '', placesError: '', progress: '', routeProgress: '' };
export function TripRouteProvider({ trip, children }) {
  const [enabled, setEnabled] = useState(false), [attempt, setAttempt] = useState(0), [placesAttempt, setPlacesAttempt] = useState(0);
  const [state, setState] = useState(initial);
  const [placesUsers, setPlacesUsers] = useState(0);
  const enable = useCallback(places => {
    setEnabled(true);
    if (!places) return;
    setPlacesUsers(count => count + 1);
    return () => setPlacesUsers(count => count - 1);
  }, []);
  const mapAllowed = canLoadTripMap(trip);
  const key = JSON.stringify([trip?.origin, trip?.originPoint, trip?.destination, trip?.completedAt, trip?.itinerary?.map(day => [day.id, day.places.map(p => [p.id, p.name, p.coordinates])])]);
  const tripRef = useRef(trip); tripRef.current = trip;
  useEffect(() => {
    if (!enabled || !mapAllowed) { setState({ ...initial, key, loading: false }); return; }
    const controller = new AbortController(); setState({ ...initial, key });
    loadTripRoute(tripRef.current, controller.signal, routeProgress => {
      if (!controller.signal.aborted) setState(current => ({ ...current, routeProgress }));
    }).then(route => {
      if (!controller.signal.aborted) setState({ ...initial, key, route, loading: false });
    }).catch(error => { if (!controller.signal.aborted) setState({ ...initial, key, loading: false, error: error.message }); });
    return () => controller.abort();
  }, [enabled, key, attempt, mapAllowed]);
  const route = mapAllowed && state.key === key ? state.route : null;
  const needsPlaces = placesUsers > 0;
  useEffect(() => {
    if (!route || !needsPlaces) {
      setState(current => current.placesLoading ? { ...current, placesLoading: false } : current);
      return;
    }
    const controller = new AbortController();
    setState(current => ({ ...current, placesLoading: true, placesError: '' }));
    const update = (result, done = false) => {
      if (controller.signal.aborted) return;
      setState(current => ({ ...current, places: result.places, placesLoading: !done, progress: `${result.completed}/${result.total} đoạn đã tải`, placesError: result.failed ? `${result.failed}/${result.total} đoạn chưa tải được. Các ghim đã tải vẫn được giữ; bấm thử lại để tải phần còn thiếu.` : '' }));
    };
    loadPlaces(route, controller.signal, result => update(result)).then(result => update(result, true)).catch(error => {
      if (!controller.signal.aborted) setState(current => ({ ...current, placesLoading: false, placesError: error.message }));
    });
    return () => controller.abort();
  }, [route, placesAttempt, needsPlaces]);
  const retry = () => route ? setPlacesAttempt(n => n + 1) : setAttempt(n => n + 1);
  return <TripRouteContext.Provider value={{ ...(mapAllowed ? (state.key === key ? state : initial) : { ...initial, loading: false }), mapAllowed, enable, retry }}>{children}</TripRouteContext.Provider>;
}
export function useTripRoute({ places = true } = {}) {
  const value = useContext(TripRouteContext), enable = value?.enable;
  useEffect(() => enable?.(places), [enable, places]);
  return value;
}
