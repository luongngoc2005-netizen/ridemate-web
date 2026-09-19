import React from 'react';

const paths = {
  checklist: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M8 10l1 1 2-2m2 1h3M8 16l1 1 2-2m2 1h3" /></>,
  fuel: <><path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M2 21h14M14 10h2a2 2 0 0 1 2 2v5a2 2 0 0 0 4 0V8l-4-4M19 5v4h3" /><path d="M7 6h4v5H7z" /></>,
  repair: <path d="M14 3a6 6 0 0 0-7 8L3 15a3 3 0 0 0 4 4l4-4a6 6 0 0 0 8-7l-4 4-3-3 4-4Z" />,
  food: <><path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18M17 21V3c-3 3-4 7-3 10h3" /></>,
  bed: <><path d="M3 18v3m18-3v3M3 10V4m0 10h18v4H3zM7 14V8h10a4 4 0 0 1 4 4v2" /><circle cx="5" cy="11" r="2" /></>,
  medical: <><rect x="3" y="6" width="18" height="15" rx="2" /><path d="M8 6V3h8v3m-4 4v7m-3.5-3.5h7" /></>,
  pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  assistant: <><path d="M21 11a8 8 0 0 1-8 8H8l-5 3v-7a8 8 0 0 1 5-13h5a8 8 0 0 1 8 9Z" /><path d="M7 9h10M7 13h7" /></>,
};

export default function ToolIcon({ name }) {
  return <svg className="tool-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
