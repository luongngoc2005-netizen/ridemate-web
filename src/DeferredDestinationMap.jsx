import React, {useEffect, useRef, useState} from 'react';
import DestinationMap from './DestinationMap.jsx';

// The home preview can be well below the fold on phones. Keep its placeholder
// until it approaches the viewport, then mount it once (also starts geocoding).
export default function DeferredDestinationMap({name}) {
  const container = useRef(null);
  const [ready, setReady] = useState(() => typeof IntersectionObserver !== 'function');
  useEffect(() => {
    if (ready) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); setReady(true); }
    }, {rootMargin:'160px 0px'});
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [ready]);
  return <div ref={container} className="deferred-destination-map">{ready ? <DestinationMap name={name}/> : <div className="route-placeholder"><button type="button" className="soft" onClick={() => setReady(true)}>Mở bản đồ</button></div>}</div>;
}
