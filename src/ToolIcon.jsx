import React from 'react';

const paths = {
  mountain: <><path d="m2 20 7-14 4 8 3-5 6 11H2Z" /><path d="m6 12 3 2 2-2" /></>,
  arrowRight: <path d="M4 12h16m-6-6 6 6-6 6" />,
  arrowLeft: <path d="M20 12H4m6-6-6 6 6 6" />,
  arrowUp: <path d="M12 20V4m-6 6 6-6 6 6" />,
  arrowDown: <path d="M12 4v16m-6-6 6 6 6-6" />,
  external: <><path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m4 12 5 5L20 6" />,
  route: <><circle cx="5" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 6-5 4 3 4-6 4 8" /></>,
  flag: <path d="M5 22V3c5-4 9 4 15 0v10c-6 4-10-4-15 0" />,
  send: <path d="m3 3 18 9-18 9 3-9-3-9Zm3 9h15" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  cloud: <path d="M6 19a5 5 0 1 1 0-10 7 7 0 0 1 13-2 6 6 0 0 1-1 12H6Z" />,
  rain: <><path d="M5 15a4 4 0 0 1-1-8 6 6 0 0 1 12-1 5 5 0 0 1 3 9M8 17l-1 4m6-4-1 4m6-4-1 4" /></>,
  fog: <><path d="M5 12a4 4 0 0 1-1-8 6 6 0 0 1 11 0 4 4 0 0 1 4 8M3 16h18M5 20h14" /></>,
  snow: <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M3 10l4-1-1-4m15 9-4 1 1 4M3 14l4 1-1 4m15-9-4-1 1-4" />,
  storm: <><path d="M5 14a4 4 0 0 1-1-8 6 6 0 0 1 12-1 5 5 0 0 1 3 9" /><path d="m12 12-3 6h4l-2 5 6-8h-5" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5m0 3h.01" /></>,
  checklist: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M8 10l1 1 2-2m2 1h3M8 16l1 1 2-2m2 1h3" /></>,
  fuel: <><path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M2 21h14M14 10h2a2 2 0 0 1 2 2v5a2 2 0 0 0 4 0V8l-4-4M19 5v4h3" /><path d="M7 6h4v5H7z" /></>,
  repair: <path d="M14 3a6 6 0 0 0-7 8L3 15a3 3 0 0 0 4 4l4-4a6 6 0 0 0 8-7l-4 4-3-3 4-4Z" />,
  food: <><path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18M17 21V3c-3 3-4 7-3 10h3" /></>,
  bed: <><path d="M3 18v3m18-3v3M3 10V4m0 10h18v4H3zM7 14V8h10a4 4 0 0 1 4 4v2" /><circle cx="5" cy="11" r="2" /></>,
  medical: <><rect x="3" y="6" width="18" height="15" rx="2" /><path d="M8 6V3h8v3m-4 4v7m-3.5-3.5h7" /></>,
  pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  assistant: <><path d="M21 11a8 8 0 0 1-8 8H8l-5 3v-7a8 8 0 0 1 5-13h5a8 8 0 0 1 8 9Z" /><path d="M7 9h10M7 13h7" /></>,
};

export default function ToolIcon({ name, className = '' }) {
  return <svg className={`tool-icon ${className}`} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] || paths.help}</svg>;
}

// Leaflet consumes DOM nodes; reuse the same SVG shapes without a second icon set.
export function createToolIconElement(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ class: 'tool-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
  const append = (parent, children) => React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) { append(parent, child.props.children); return; }
    const node = document.createElementNS('http://www.w3.org/2000/svg', child.type);
    for (const [key, value] of Object.entries(child.props)) if (key !== 'children') node.setAttribute(key, String(value));
    append(node, child.props.children);
    parent.append(node);
  });
  append(svg, paths[name] || paths.help);
  return svg;
}
