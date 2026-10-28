import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { createTrip, initialDetails } from '../src/trip-data.js';
import { savePlans } from '../src/plans-data.js';

// Exercise the real App, navigation store, Journey and AI review in a DOM.
// Authentication and map canvases are isolated: this test never contacts a
// live account, model, GPS service or tile provider.
const bundle = await build({
  entryPoints: ['src/main.jsx'], bundle: true, write: false, format: 'iife',
  jsx: 'automatic',
  loader: { '.css': 'empty', '.png': 'dataurl', '.webp': 'dataurl' }, define: { 'import.meta.env': '{}', 'import.meta.url': '"https://navigation.test/assets/app.js"', 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'offline-navigation-test', setup(builder) {
    builder.onLoad({ filter: /[\\/]src[\\/]supabase\.js$/ }, () => ({ contents: 'export const supabase=null; export const authRedirect=()=>"";', loader: 'js' }));
    builder.onLoad({ filter: /[\\/]src[\\/](RouteMap|DestinationMap)\.jsx$/ }, () => ({
      contents: 'import React from "react"; export default function TestMap(){return React.createElement("div",{"data-testid":"map"});}', loader: 'js',
    }));
  } }],
});
const source = bundle.outputFiles[0].text;

test('Plans → Journey → AI review → Plans never leaves duplicate screens or traps navigation', async t => {
  const errors = [], console = new VirtualConsole();
  console.on('error', (...args) => errors.push(args.join(' ')));
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'https://navigation.test/?page=plans', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console,
  });
  t.after(() => dom.window.close());
  const { window } = dom, { document } = window;
  window.TextEncoder=TextEncoder;
  window.indexedDB = new IDBFactory();
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.fetch = async () => ({ ok: true, json: async () => ({ ready: false, features: [] }) });
  const first = createTrip({ ...initialDetails, origin: 'Hà Nội', destination: 'Lạng Sơn', date: '2026-10-24', days: 3 });
  const second = createTrip({ ...initialDetails, origin: 'Lạng Sơn', destination: 'Cao Bằng', date: '2026-10-24', days: 3 });
  savePlans(window.localStorage, [first, second]);
  window.eval(source);
  const settle = () => new Promise(resolve => setTimeout(resolve, 50));
  const button = label => {
    const found = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label);
    assert.ok(found, `Missing button: ${label}`); return found;
  };
  const oneScreen = () => assert.equal(document.querySelectorAll('main').length, 1, 'The previous page must be unmounted');
  for (let attempt = 0; attempt < 100 && !document.querySelector('.plans-grid'); attempt++) await settle();
  assert.deepEqual(errors, [], 'App startup must not raise browser errors');
  oneScreen();
  for (const plan of [first, second, first]) {
    const cards = [...document.querySelectorAll('.plans-grid article')];
    const card = cards.find(node => node.textContent.includes(`${plan.origin} → ${plan.destination}`));
    assert.ok(card); card.querySelector('button').click(); await settle();
    assert.equal(new URL(window.location.href).searchParams.get('trip'), plan.id);
    oneScreen(); assert.equal(document.querySelectorAll('.journey-phases').length, 1);
    button('2. Đang đi').click(); await settle();
    assert.ok(document.querySelector('.riding-view')); oneScreen();
    button('1. Chuẩn bị').click(); await settle();
    assert.ok(document.querySelector('.preparation-card')); oneScreen();
    for (const label of ['Checklist', 'Mở checklist']) {
      button(label).click(); await settle();
      oneScreen();
      assert.equal(new URL(window.location.href).searchParams.get('page'), 'trip');
      assert.equal(new URL(window.location.href).searchParams.get('trip'), plan.id);
      assert.ok(document.querySelector('.trip-checklist'));
      assert.equal(document.querySelector('.subnav [aria-current="page"]').textContent, 'Checklist');
      const check = document.querySelector('.trip-checklist input[type="checkbox"]');
      const previous = check.checked;
      check.click(); await settle();
      button('Tổng quan').click(); await settle();
      button('Checklist').click(); await settle();
      assert.equal(document.querySelector('.trip-checklist input[type="checkbox"]').checked, !previous);
      button('Lịch trình').click(); await settle();
      assert.ok(document.querySelector('.itinerary')); oneScreen();
      button('Tổng quan').click(); await settle();
    }
    button('3. Nhật ký').click(); await settle();
    assert.equal(new URL(window.location.href).searchParams.get('page'), 'trip');
    assert.equal(new URL(window.location.href).searchParams.get('trip'), plan.id);
    assert.ok(document.querySelector('.journey-page .journal-page')); oneScreen();
    assert.equal(document.querySelector('.journey-phases [aria-current="page"]').textContent, '3. Nhật ký');
    assert.equal(document.querySelector('.trip-completion'), null);
    button('2. Đang đi').click(); await settle();
    assert.ok(document.querySelector('.riding-view')); oneScreen();
    button('3. Nhật ký').click(); await settle();
    window.history.back(); await settle();
    assert.ok(document.querySelector('.riding-view')); oneScreen();
    button('1. Chuẩn bị').click(); await settle();
    assert.ok(document.querySelector('.preparation-card'));
    button('Nhật ký').click(); await settle();
    assert.equal(document.querySelector('.journey-phases'), null);
    button('Quay lại chuyến đi của bạn').click(); await settle();
    assert.ok(document.querySelector('.preparation-card')); oneScreen();
    assert.equal(new URL(window.location.href).searchParams.get('trip'), plan.id);
    button('Kiểm tra chuyến đi của tôi').click(); await settle();
    // React effects may arrive after the first frame under parallel browser/SQL tests.
    for(let attempt=0;attempt<100&&!document.querySelector('.ai-messages')?.textContent.includes('Kiểm tra chuyến đi của tôi');attempt++)await settle();
    assert.equal(new URL(window.location.href).searchParams.get('page'), 'ai');
    oneScreen();
    assert.equal(document.querySelectorAll('.journey-phases').length, 0);
    assert.ok(document.querySelector('.ai-assistant'));
    assert.ok(document.querySelector('.ai-messages').textContent.includes('Kiểm tra chuyến đi của tôi'));
    window.history.back(); await settle();
    oneScreen(); assert.equal(document.querySelectorAll('.journey-phases').length, 1);
    assert.equal(new URL(window.location.href).searchParams.get('trip'), plan.id);
    window.history.forward(); await settle();
    oneScreen(); assert.equal(document.querySelectorAll('.journey-phases').length, 0);
    assert.ok(document.querySelector('.ai-assistant'));
    button('Kế hoạch').click(); await settle();
    oneScreen(); assert.equal(new URL(window.location.href).searchParams.get('page'), 'plans');
    assert.equal(document.querySelectorAll('.plans-grid article').length, 2);
    assert.equal(document.querySelectorAll('.journey-phases').length, 0);
  }
  assert.deepEqual(errors, [], 'Navigation must not raise React key/reconciliation errors');
});
