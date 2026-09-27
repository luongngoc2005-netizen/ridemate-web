import React, { useEffect, useState } from 'react';
import RouteMap from './RouteMap.jsx';
import { geocode } from './route-data.js';

export default function DestinationMap({ name }) {
  const [state, setState] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    setState({ name });
    geocode(name, controller.signal).then(center => { if (!controller.signal.aborted) setState({ name, center }); })
      .catch(() => { if (!controller.signal.aborted) setState({ name, error: true }); });
    return () => controller.abort();
  }, [name]);
  const current = state.name === name ? state : {};
  return <div className="destination-map">{current.error && <p className="route-caption">Chưa xác định được điểm đến. Bạn vẫn có thể bật định vị.</p>}<RouteMap center={current.center}/></div>;
}
