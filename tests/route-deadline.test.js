import test from 'node:test';
import assert from 'node:assert/strict';
import { withRouteDeadline } from '../src/route-deadline.js';

test('A stalled routing operation ends with an actionable error and aborts its requests', async () => {
  let requestSignal;
  await assert.rejects(withRouteDeadline(signal => {
    requestSignal = signal;
    return new Promise(() => {});
  }, undefined, 10), /Dịch vụ định vị hoặc tính tuyến đang chậm/);
  assert.equal(requestSignal.aborted, true);
});

test('Leaving a trip cancels routing without showing a timeout error', async () => {
  const parent = new AbortController();
  const result = withRouteDeadline(signal => {
    parent.abort();
    assert.equal(signal.aborted, true);
    return new Promise(() => {});
  }, parent.signal);
  await assert.rejects(result, { name: 'AbortError' });
});

test('Successful routing clears the deadline without later aborting', async () => {
  let requestSignal;
  assert.equal(await withRouteDeadline(signal => {
    requestSignal = signal;
    return 'route';
  }, undefined, 10), 'route');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(requestSignal.aborted, false);
});
