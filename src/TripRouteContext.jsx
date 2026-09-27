import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { loadTripRoute, loadPlaces } from './route-data.js';

const TripRouteContext = createContext(null);
const initial = { loading: true, route: null, places: [], placesLoading: false, error: '', placesError: '', progress: '' };
export function TripRouteProvider({ trip, children }) {
  const [enabled, setEnabled] = useState(false), [attempt, setAttempt] = useState(0), [placesAttempt, setPlacesAttempt] = useState(0);
  const [state, setState] = useState(initial);
  const enable = useCallback(() => setEnabled(true), []);
  const key = JSON.stringify([trip?.origin, trip?.originPoint, trip?.destination, trip?.itinerary?.map(day => [day.id, day.places.map(p => [p.id, p.name, p.coordinates])])]);
  const tripRef = useRef(trip); tripRef.current = trip;
  useEffect(() => {
    if (!enabled || !tripRef.current) return;
    const controller = new AbortController(); setState({ ...initial, key });
    loadTripRoute(tripRef.current, controller.signal).then(route => {
      if (!controller.signal.aborted) setState({ ...initial, key, route, loading: false, placesLoading: true });
    }).catch(error => { if (!controller.signal.aborted) setState({ ...initial, key, loading: false, error: error.message }); });
    return () => controller.abort();
  }, [enabled, key, attempt]);
  const route = state.key === key ? state.route : null;
  useEffect(() => {
    if (!route) return;
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
  }, [route, placesAttempt]);
  const retry = () => route ? setPlacesAttempt(n => n + 1) : setAttempt(n => n + 1);
  return <TripRouteContext.Provider value={{ ...(state.key === key ? state : initial), enable, retry }}>{children}</TripRouteContext.Provider>;
}
export function useTripRoute() {
  const value = useContext(TripRouteContext), enable = value?.enable;
  useEffect(() => { enable?.(); }, [enable]);
  return value;
}
