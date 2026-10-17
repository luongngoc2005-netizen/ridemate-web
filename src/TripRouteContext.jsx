import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { loadTripRoute, loadRoutePlaces } from './route-data.js';
import { supportTypes } from './places-data.js';
import { canLoadTripMap } from './trip-map-state.js';
import { createRoutePlaceRequests, requestedPlaceTypes } from './route-place-requests.js';

const TripRouteContext = createContext(null);
const initial = { loading: true, route: null, places: [], placesByType: {}, error: '', routeProgress: '' };
export function TripRouteProvider({ trip, children }) {
  const [enabled, setEnabled] = useState(false), [attempt, setAttempt] = useState(0), [placesAttempt, setPlacesAttempt] = useState(0);
  const [state, setState] = useState(initial), [consumers, setConsumers] = useState({});
  const nextConsumer = useRef(0), requests = useRef(null);
  if (!requests.current) requests.current = createRoutePlaceRequests(loadRoutePlaces, (route, type, status) => {
    setState(current => {
      if (current.route !== route) return current;
      const placesByType = { ...current.placesByType, [type]: status };
      return { ...current, placesByType, places: Object.values(placesByType).flatMap(value => value.items) };
    });
  });
  const enable = useCallback(types => {
    setEnabled(true);
    if (!types.length) return;
    const id = ++nextConsumer.current;
    setConsumers(current => ({ ...current, [id]: types }));
    return () => setConsumers(current => { const next = { ...current }; delete next[id]; return next; });
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
  const wanted = requestedPlaceTypes(Object.values(consumers).flat()).join('|');
  useEffect(() => { requests.current.sync(route, wanted.split('|'), placesAttempt); }, [route, wanted, placesAttempt]);
  useEffect(() => () => requests.current.dispose(), []);
  const retry = () => route ? setPlacesAttempt(n => n + 1) : setAttempt(n => n + 1);
  return <TripRouteContext.Provider value={{ ...(mapAllowed ? (state.key === key ? state : initial) : { ...initial, loading: false }), mapAllowed, enable, retry }}>{children}</TripRouteContext.Provider>;
}

export function useTripRoute({ places = false } = {}) {
  const value = useContext(TripRouteContext), enable = value?.enable;
  const types = requestedPlaceTypes(places), typesKey = types.join('|');
  useEffect(() => enable?.(typesKey ? typesKey.split('|') : []), [enable, typesKey]);
  if (!value) return value;
  const states = types.map(type => value.placesByType[type]);
  return { ...value,
    placesLoading: !!value.route && states.some(state => state?.loading || (!state?.ready && !state?.error)),
    placesError: types.map((type, index) => states[index]?.error ? `${supportTypes[type].label}: ${states[index].error}` : '').filter(Boolean).join(' '),
    progress: states.map(state => state?.progress).filter(Boolean).join(' · '),
  };
}
